import { test, expect } from '@playwright/test';
import { GOOGLE_SESSION_COOKIE } from '../../lib/google-auth.ts';

// C5 HTTP contracts. Handlers receive injected fake services so each check isolates the route's own job:
// Cookie only from the request, same-origin writes, private no-store answers, and a failed delete never reads as success.
const origin = 'http://localhost:3000', now = Date.UTC(2026, 9, 17, 9);
const request = (path, method = 'GET', { body, headers = {}, cookie = 'synthetic-opaque-cookie', sameOrigin = method !== 'GET' } = {}) => new Request(origin + path, {
  method, headers: { ...(cookie ? { cookie: `${GOOGLE_SESSION_COOKIE}=${cookie}` } : {}), ...(sameOrigin ? { origin } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
  ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
});
function isPrivate(response) { expect(response.headers.get('cache-control')).toContain('private'); expect(response.headers.get('cache-control')).toContain('no-store'); }
function fakeData(failure) {
  const calls = [];
  const run = name => async input => { calls.push([name, input]); if (failure) throw failure; return name === 'records' ? { tasks: [], deletions: [] } : { deleted: true }; };
  return { calls, data: { deleteScene: run('deleteScene'), deleteAll: run('deleteAll'), records: run('records') } };
}

// ---- T24A: DELETE one scene ----

test('T24A HTTP: DELETE /api/learning-library deletes one exact course for the cookie owner', async () => {
  const { handleSceneDelete } = await import('../../app/api/learning-library/route.ts');
  const f = fakeData(), response = await handleSceneDelete(request('/api/learning-library?id=c5-course&revision=2', 'DELETE'), { data: f.data, now });
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ deleted: true }); isPrivate(response);
  expect(f.calls).toEqual([['deleteScene', { cookie: 'synthetic-opaque-cookie', now, id: 'c5-course', revision: 2 }]]);
});

test('T24A HTTP: scene deletion refuses missing or foreign Origin and bad selectors before touching storage', async () => {
  const { handleSceneDelete } = await import('../../app/api/learning-library/route.ts');
  const f = fakeData();
  for (const headers of [{}, { origin: 'https://foreign.invalid' }, { origin: '' }]) {
    const req = request('/api/learning-library?id=c5-course&revision=2', 'DELETE', { sameOrigin: false, headers });
    const response = await handleSceneDelete(req, { data: f.data, now }); expect(response.status).toBe(403); isPrivate(response);
  }
  for (const query of ['', '?id=c5-course', '?id=c5-course&revision=0', '?id=../x&revision=1', '?id=c5-course&revision=2&owner=usr_other', '?id=a&id=b&revision=1']) {
    const response = await handleSceneDelete(request('/api/learning-library' + query, 'DELETE'), { data: f.data, now }); expect(response.status).toBe(400); isPrivate(response);
  }
  expect(f.calls).toEqual([]);
});

test('T24A HTTP: scene deletion maps anonymous, missing and failed deletes honestly', async () => {
  const { handleSceneDelete } = await import('../../app/api/learning-library/route.ts');
  const cases = [['Authenticated session required', 401, 'unauthenticated'], ['Course unavailable', 404, 'not_found'], ['disk I/O error', 503, 'delete_failed']];
  for (const [message, status, error] of cases) {
    const f = fakeData(new Error(message)), response = await handleSceneDelete(request('/api/learning-library?id=c5-course&revision=2', 'DELETE'), { data: f.data, now });
    expect(response.status).toBe(status); const body = await response.json(); expect(body).toEqual({ error }); expect(body).not.toHaveProperty('deleted'); isPrivate(response);
  }
});

// ---- T24A: DELETE all of my learning data ----

test('T24A HTTP: DELETE /api/my-data needs the explicit confirmation body, same origin and the cookie owner', async () => {
  const { handleMyData } = await import('../../app/api/my-data/route.ts');
  const f = fakeData();
  const ok = await handleMyData(request('/api/my-data', 'DELETE', { body: { confirm: 'delete-all-my-data' } }), { data: f.data, now });
  expect(ok.status).toBe(200); expect(await ok.json()).toEqual({ deleted: true }); isPrivate(ok);
  expect(f.calls).toEqual([['deleteAll', { cookie: 'synthetic-opaque-cookie', now }]]);
  for (const body of [undefined, {}, { confirm: 'yes' }, { confirm: 'delete-all-my-data', owner: 'usr_other' }, 'not json']) {
    const response = await handleMyData(request('/api/my-data', 'DELETE', { body }), { data: f.data, now }); expect(response.status).toBe(400);
  }
  const foreign = await handleMyData(request('/api/my-data', 'DELETE', { body: { confirm: 'delete-all-my-data' }, sameOrigin: false, headers: { origin: 'https://foreign.invalid' } }), { data: f.data, now });
  expect(foreign.status).toBe(403);
  expect((await handleMyData(request('/api/my-data', 'GET'), { data: f.data, now })).status).toBe(405);
  expect(f.calls).toHaveLength(1);
});

test('T24A HTTP: a failed delete-all says so instead of reporting success', async () => {
  const { handleMyData } = await import('../../app/api/my-data/route.ts');
  for (const [message, status, error] of [['Authenticated session required', 401, 'unauthenticated'], ['database is locked', 503, 'delete_failed']]) {
    const f = fakeData(new Error(message));
    const response = await handleMyData(request('/api/my-data', 'DELETE', { body: { confirm: 'delete-all-my-data' } }), { data: f.data, now });
    expect(response.status).toBe(status); expect(await response.json()).toEqual({ error }); isPrivate(response);
  }
});

// ---- T13A: sign out ----

test('T13A HTTP: POST /api/auth/signout clears the session cookie server-side and deletes nothing', async () => {
  const { handleSignOut } = await import('../../app/api/auth/signout/route.ts');
  const f = fakeData();
  const response = await handleSignOut(request('/api/auth/signout', 'POST'));
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ authenticated: false }); isPrivate(response);
  const cookie = response.headers.get('set-cookie');
  expect(cookie).toMatch(new RegExp(`^${GOOGLE_SESSION_COOKIE}=;`));
  expect(cookie).toContain('Max-Age=0'); expect(cookie).toContain('Path=/'); expect(cookie).toContain('HttpOnly');
  expect(f.calls).toEqual([]);
});

test('T13A HTTP: sign-out only accepts a same-origin POST', async () => {
  const { handleSignOut } = await import('../../app/api/auth/signout/route.ts');
  const foreign = await handleSignOut(request('/api/auth/signout', 'POST', { sameOrigin: false, headers: { origin: 'https://foreign.invalid' } }));
  expect(foreign.status).toBe(403); expect(foreign.headers.get('set-cookie')).toBeNull();
  const missing = await handleSignOut(request('/api/auth/signout', 'POST', { sameOrigin: false }));
  expect(missing.status).toBe(403); expect(missing.headers.get('set-cookie')).toBeNull();
  const get = await handleSignOut(request('/api/auth/signout', 'GET'));
  expect(get.status).toBe(405); expect(get.headers.get('set-cookie')).toBeNull();
});

// ---- T34A: generation records ----

test('T34A HTTP: GET /api/generation-records is read-only, private and owner-scoped', async () => {
  const { handleGenerationRecords } = await import('../../app/api/generation-records/route.ts');
  const f = fakeData();
  const response = await handleGenerationRecords(request('/api/generation-records'), { data: f.data, now });
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ tasks: [], deletions: [] }); isPrivate(response);
  expect(f.calls).toEqual([['records', { cookie: 'synthetic-opaque-cookie', now }]]);
  for (const method of ['POST', 'DELETE', 'PUT']) expect((await handleGenerationRecords(request('/api/generation-records', method), { data: f.data, now })).status).toBe(405);
  expect((await handleGenerationRecords(request('/api/generation-records?owner=usr_other'), { data: f.data, now })).status).toBe(400);
  const anonymous = fakeData(new Error('Authenticated session required'));
  expect((await handleGenerationRecords(request('/api/generation-records', 'GET', { cookie: null }), { data: anonymous.data, now })).status).toBe(401);
  expect(f.calls).toHaveLength(1);
});

// ---- T25A: sentence reports ----

function fakeReports(failure) {
  const calls = [], saved = { lineId: 'line-1', reason: 'unclear', note: '', status: 'received', at: now };
  return { calls, saved, reports: {
    async list(input) { calls.push(['list', input]); if (failure) throw failure; return [saved]; },
    async report(input) { calls.push(['report', input]); if (failure) throw failure; return saved; },
  } };
}
const reportBody = { course: { id: 'c5-course', revision: 2, materialsRevision: 3 }, lineId: 'line-1', reason: 'unclear', note: '听不清' };

test('T25A HTTP: sentence reports GET and POST pass exact course selectors and the cookie owner', async () => {
  const { handleSentenceReports } = await import('../../app/api/sentence-reports/route.ts');
  const f = fakeReports();
  const listed = await handleSentenceReports(request('/api/sentence-reports?id=c5-course&revision=2&materialsRevision=3'), { reports: f.reports, now });
  expect(listed.status).toBe(200); expect(await listed.json()).toEqual({ reports: [f.saved] }); isPrivate(listed);
  const posted = await handleSentenceReports(request('/api/sentence-reports', 'POST', { body: reportBody }), { reports: f.reports, now });
  expect(posted.status).toBe(201); expect(await posted.json()).toEqual({ report: f.saved }); isPrivate(posted);
  expect(f.calls).toEqual([
    ['list', { cookie: 'synthetic-opaque-cookie', now, id: 'c5-course', revision: 2, materialsRevision: 3 }],
    ['report', { cookie: 'synthetic-opaque-cookie', now, course: { id: 'c5-course', revision: 2, materialsRevision: 3 }, lineId: 'line-1', reason: 'unclear', note: '听不清' }],
  ]);
});

test('T25A HTTP: sentence reports reject foreign origins, extra fields and oversized bodies before storage', async () => {
  const { handleSentenceReports } = await import('../../app/api/sentence-reports/route.ts');
  const f = fakeReports();
  const foreign = await handleSentenceReports(request('/api/sentence-reports', 'POST', { body: reportBody, sameOrigin: false, headers: { origin: 'https://foreign.invalid' } }), { reports: f.reports, now });
  expect(foreign.status).toBe(403);
  for (const body of [{ ...reportBody, regenerate: true }, { ...reportBody, owner: 'usr_other' }, 'nope']) {
    expect((await handleSentenceReports(request('/api/sentence-reports', 'POST', { body }), { reports: f.reports, now })).status).toBe(400);
  }
  const huge = await handleSentenceReports(request('/api/sentence-reports', 'POST', { body: { ...reportBody, note: 'x'.repeat(5000) } }), { reports: f.reports, now });
  expect(huge.status).toBe(413);
  expect(f.calls).toEqual([]);
  for (const method of ['DELETE', 'PUT']) expect((await handleSentenceReports(request('/api/sentence-reports', method, { body: reportBody }), { reports: f.reports, now })).status).toBe(405);
});

test('T25A HTTP: sentence report failures are mapped without pretending the report was received', async () => {
  const { handleSentenceReports } = await import('../../app/api/sentence-reports/route.ts');
  for (const [message, status] of [['Authenticated session required', 401], ['Course unavailable', 404], ['Invalid sentence', 400], ['disk full', 503]]) {
    const f = fakeReports(new Error(message));
    const response = await handleSentenceReports(request('/api/sentence-reports', 'POST', { body: reportBody }), { reports: f.reports, now });
    expect(response.status).toBe(status); expect(await response.json()).not.toHaveProperty('report'); isPrivate(response);
  }
});

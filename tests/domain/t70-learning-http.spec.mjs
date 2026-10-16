import { test, expect } from '@playwright/test';
import { GOOGLE_SESSION_COOKIE, sealGoogleSession } from '../../lib/google-auth.ts';
import { ownerIdFromSessionCookie } from '../../lib/private-owner.ts';
import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generatedCourse } from '../fixtures/t68-generation-browser.mjs';
import { identity, now, secret, position, pointer } from '../fixtures/t70-learning-library.mjs';

const origin = 'http://localhost:3000', selector = '?id=t70-http-course&revision=2&materialsRevision=3';
const selected = { id: 't70-http-course', revision: 2, materialsRevision: 3 };
const record = { course: { ...selected, mediaSha256: 'a'.repeat(64) }, version: 1, position, updatedAt: now };
async function fixture() {
  const { handleLearningLibrary } = await import('../../app/api/learning-library/route.ts');
  const { handleSceneProgress } = await import('../../app/api/scene-progress/route.ts');
  const calls = [], result = { scenes: [], unavailable: 0 };
  const library = {
    async list(input) { calls.push(['list', input]); return result; },
    async getProgress(input) { calls.push(['get', input]); return record; },
    async saveProgress(input) { calls.push(['save', input]); return record; },
  };
  const request = (path, method = 'GET', body, headers = {}) => new Request(origin + path, {
    method, headers: { cookie: `${GOOGLE_SESSION_COOKIE}=synthetic-opaque-cookie`, ...(method === 'PUT' ? { origin, 'content-type': 'application/json' } : {}), ...headers },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
  const input = { course: selected, expectedVersion: 0, position };
  return { calls, result, library, request, input,
    catalogue: req => handleLearningLibrary(req, { library, now }), progress: req => handleSceneProgress(req, { library, now }) };
}
function privateResponse(response) { expect(response.headers.get('cache-control')).toContain('private'); expect(response.headers.get('cache-control')).toContain('no-store'); }

test('T70 HTTP: library GET passes only the signed-session cookie and returns a private catalogue', async () => {
  const f = await fixture(), response = await f.catalogue(f.request('/api/learning-library'));
  expect(response.status).toBe(200); expect(await response.json()).toEqual(f.result); privateResponse(response);
  expect(f.calls).toEqual([['list', { cookie: 'synthetic-opaque-cookie', now }]]);
});

test('T70 HTTP: progress GET preserves the exact course and material selectors', async () => {
  const f = await fixture(), response = await f.progress(f.request('/api/scene-progress' + selector));
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ progress: record }); privateResponse(response);
  expect(f.calls).toEqual([['get', { cookie: 'synthetic-opaque-cookie', now, ...selected }]]);
});

test('T70 HTTP: an original material selector remains absent instead of becoming zero', async () => {
  const f = await fixture(), response = await f.progress(f.request('/api/scene-progress?id=t70-http-course&revision=2'));
  expect(response.status).toBe(200); expect(f.calls[0][1]).not.toHaveProperty('materialsRevision');
});

test('T70 HTTP: same-origin PUT saves only course selectors position and expected record version', async () => {
  const f = await fixture(), response = await f.progress(f.request('/api/scene-progress', 'PUT', f.input));
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ progress: record }); privateResponse(response);
  expect(f.calls).toEqual([['save', { cookie: 'synthetic-opaque-cookie', now, ...selected, expectedVersion: 0, position }]]);
});

test('T70 HTTP: missing or foreign origins reject writes before invoking storage', async () => {
  const f = await fixture();
  for (const value of [null, '', 'https://foreign.invalid']) {
    const request = f.request('/api/scene-progress', 'PUT', f.input, { origin: value ?? '' }); if (value === null) request.headers.delete('origin');
    const response = await f.progress(request); expect(response.status).toBe(403); privateResponse(response);
  }
  expect(f.calls).toEqual([]);
});

test('T70 HTTP: normalized NextURL still accepts the actual loopback Host origin without changing selectors', async () => {
  const f = await fixture(), response = await f.progress(f.request('/api/scene-progress', 'PUT', f.input, { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' }));
  expect(response.status).toBe(200); expect(f.calls[0][1]).toEqual({ cookie: 'synthetic-opaque-cookie', now, ...selected, expectedVersion: 0, position });
});

test('T70 HTTP: unsupported methods and catalogue query parameters never invoke a writer', async () => {
  const f = await fixture();
  expect((await f.catalogue(f.request('/api/learning-library', 'POST', '{}'))).status).toBe(405);
  expect((await f.progress(f.request('/api/scene-progress', 'DELETE'))).status).toBe(405);
  expect((await f.catalogue(f.request('/api/learning-library?owner=another'))).status).toBe(400);
  expect(f.calls).toEqual([]);
});

test('T70 HTTP: missing duplicate unknown or malformed progress selectors reject before any private read', async () => {
  const f = await fixture();
  for (const query of ['', '?id=x', '?id=x&revision=0', '?id=x&revision=1.0', '?id=x&revision=9007199254740992', '?id=x&revision=2&revision=3', '?id=x&id=y&revision=2', '?id=..%2Fsecret&revision=2', '?id=x&revision=2&materialsRevision=0', '?id=x&revision=2&materialsRevision=3&materialsRevision=4', '?id=x&revision=2&owner=another']) {
    const response = await f.progress(f.request('/api/scene-progress' + query)); expect(response.status, query).toBe(400); privateResponse(response);
  }
  expect(f.calls).toEqual([]);
});

test('T70 HTTP: malformed JSON and unexpected body fields cannot select owner media or playback intent', async () => {
  const f = await fixture();
  const invalid = ['{bad', 'null', '[]', { ...f.input, owner: 'another' }, { ...f.input, course: { ...selected, mediaSha256: 'b'.repeat(64) } },
    { ...f.input, position: { ...position, playing: true } }, { ...f.input, expectedVersion: -1 }, { ...f.input, expectedVersion: '0' },
    { ...f.input, course: { ...selected, materialsRevision: 0 } }, { ...f.input, position: { ...position, page: 'exam' } },
    { ...f.input, position: { ...position, time: -1 } }, { ...f.input, position: { ...position, turnIndex: 0.5 } }, { course: selected, expectedVersion: 0 }];
  for (const body of invalid) expect((await f.progress(f.request('/api/scene-progress', 'PUT', body))).status).toBe(400);
  expect((await f.progress(f.request('/api/scene-progress?id=other', 'PUT', f.input))).status).toBe(400);
  expect(f.calls).toEqual([]);
});

test('T70 HTTP: streaming body size counts UTF-8 bytes rather than trusting Content-Length or character count', async () => {
  const f = await fixture(), response = await f.progress(f.request('/api/scene-progress', 'PUT', JSON.stringify({ padding: '好'.repeat(1000) }), { 'content-length': '1' }));
  expect(response.status).toBe(413); expect(f.calls).toEqual([]); privateResponse(response);
});

for (const [message, status, code] of [['Authenticated session required', 401, 'unauthenticated'], ['Course unavailable', 404, 'not_found'], ['Course media unavailable', 404, 'not_found'], ['Progress conflict', 409, 'conflict'], ['Invalid progress position', 400, 'invalid'], ['Stored progress unavailable', 503, 'temporarily_unavailable']]) test(`T70 HTTP: ${message} maps to a private ${status} without accepting the write`, async () => {
  const f = await fixture(); f.library.saveProgress = async () => { throw Error(message); };
  const response = await f.progress(f.request('/api/scene-progress', 'PUT', f.input));
  expect(response.status).toBe(status); expect(await response.json()).toEqual({ error: code }); privateResponse(response);
});

test('T70 HTTP: unexpected errors do not leak cookies paths or private course contents', async () => {
  const f = await fixture(), privateMessage = 'synthetic-opaque-cookie /private/internal.sqlite private-content';
  f.library.list = f.library.getProgress = async () => { throw Error(privateMessage); };
  for (const response of [await f.catalogue(f.request('/api/learning-library')), await f.progress(f.request('/api/scene-progress' + selector))]) {
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: 'temporarily_unavailable' }); privateResponse(response);
  }
});

test('T70 configured HTTP: missing local setup and serverless storage cannot claim a persistent library', async () => {
  const catalogue = await import('../../app/api/learning-library/route.ts'), progress = await import('../../app/api/scene-progress/route.ts');
  const previous = process.env.AUTH_SESSION_SECRET, vercel = process.env.VERCEL;
  try {
    for (const mode of ['missing-secret', 'serverless']) {
      if (mode === 'missing-secret') { delete process.env.AUTH_SESSION_SECRET; delete process.env.VERCEL; }
      else { process.env.AUTH_SESSION_SECRET = secret; process.env.VERCEL = '1'; }
      for (const [reader, path] of [[catalogue.GET, '/api/learning-library'], [progress.GET, '/api/scene-progress' + selector]]) {
        const response = await reader(new Request(origin + path)); expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: 'local_setup_required' }); privateResponse(response);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.AUTH_SESSION_SECRET; else process.env.AUTH_SESSION_SECRET = previous;
    if (vercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = vercel;
  }
});

test('T70 configured HTTP: default private copied-course library and persistent progress survive new route calls and deny another account', async () => {
  const catalogue = await import('../../app/api/learning-library/route.ts'), progress = await import('../../app/api/scene-progress/route.ts');
  const { createLocalCourseLibrary } = await import('../../lib/local-course-library.ts');
  const { createPrivateMediaStore } = await import('../../lib/private-media-store.ts');
  const { readApprovedCourseCopy } = await import('../../lib/local-course-copy.ts');
  const at = Date.now(), sourceSecret = 't70-configured-source-secret-at-least-32';
  const sourceCookie = await sealGoogleSession(identity('source-copy'), sourceSecret, at), cookie = await sealGoogleSession(identity('target-copy'), secret, at), other = await sealGoogleSession(identity('other-copy'), secret, at);
  const bytes = Buffer.from('synthetic media for HTTP ownership contract only'), sha256 = createHash('sha256').update(bytes).digest('hex');
  const course = generatedCourse(selected); course.media.sha256 = sha256;
  const source = { getCourse: async () => course, getCourseMedia: async () => ({ ...course.media, size: bytes.length, bytes }) };
  const bundle = await readApprovedCourseCopy({ source: { cookie: sourceCookie, secret: sourceSecret }, target: { cookie, secret }, now: at, approval: {
    sourceOwner: await ownerIdFromSessionCookie(sourceCookie, sourceSecret, at), targetOwner: await ownerIdFromSessionCookie(cookie, secret, at), courseId: course.id, revision: 2, mediaSha256: sha256, materialsRevision: 3,
  } }, source);
  const root = await mkdtemp(join(tmpdir(), 'les-t70-default-')), directory = join(root, 'tmp', 'generation-tasks');
  const copies = createLocalCourseLibrary({ directory, sessionSecret: secret, mediaStore: createPrivateMediaStore({ directory: join(directory, 'media'), sessionSecret: secret }) });
  const copied = await copies.importCopy({ cookie, now: at, bundle }), key = pointer(copied);
  const cwd = process.cwd(), previous = process.env.AUTH_SESSION_SECRET, vercel = process.env.VERCEL;
  const request = (path, value = cookie, method = 'GET', body) => new Request(origin + path, { method, headers: { ...(value ? { cookie: `${GOOGLE_SESSION_COOKIE}=${value}` } : {}), ...(method === 'PUT' ? { origin, 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const path = '/api/scene-progress?' + new URLSearchParams(Object.entries(key).map(([k, v]) => [k, String(v)]));
  try {
    process.chdir(root); process.env.AUTH_SESSION_SECRET = secret; delete process.env.VERCEL;
    const listing = await catalogue.GET(request('/api/learning-library')); expect(listing.status).toBe(200);
    const scenes = (await listing.json()).scenes; expect(scenes).toHaveLength(1); expect(scenes[0].course).toEqual(key); expect(scenes[0].contextSource).toBe('legacy-neutral');
    expect(await (await progress.GET(request(path))).json()).toEqual({ progress: null });
    const saved = await progress.PUT(request('/api/scene-progress', cookie, 'PUT', { course: key, expectedVersion: 0, position })); expect(saved.status).toBe(200);
    const value = (await saved.json()).progress; expect(value.course.mediaSha256).toBe(sha256); expect(value.position).toEqual(position);
    const restored = await progress.GET(request(path)); expect(restored.status).toBe(200); expect((await restored.json()).progress).toEqual(value);
    const otherList = await catalogue.GET(request('/api/learning-library', other)); expect((await otherList.json()).scenes).toEqual([]);
    expect((await progress.GET(request(path, other))).status).toBe(404);
    expect((await progress.PUT(request('/api/scene-progress', other, 'PUT', { course: key, expectedVersion: 0, position }))).status).toBe(404);
    expect((await progress.GET(request(path, null))).status).toBe(401);
    expect((await progress.PUT(request('/api/scene-progress', null, 'PUT', { course: key, expectedVersion: 0, position }))).status).toBe(401);
    expect((await catalogue.GET(request('/api/learning-library', null))).status).toBe(401);
  } finally {
    process.chdir(cwd);
    if (previous === undefined) delete process.env.AUTH_SESSION_SECRET; else process.env.AUTH_SESSION_SECRET = previous;
    if (vercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = vercel;
  }
});

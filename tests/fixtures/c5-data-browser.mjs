import { expect } from '@playwright/test';
import { setupLearning, openLibrary, ownerA, ownerB, coursePointer } from './t70-learning-browser.mjs';

// C5 browser protocol fixtures on top of the T70 library page: deletion, sign-out, sentence reports and
// generation records are answered from in-memory state. This proves what the page sends and how it reacts;
// the stores and HTTP handlers themselves are covered by tests/domain/c5-*.spec.mjs.
export { ownerA, ownerB, coursePointer, openLibrary };
export const deletedAt = Date.UTC(2026, 9, 17, 9);
export const sampleRecords = () => ({
  tasks: [
    { id: 'c5-ready', revision: 2, description: '我想在酒店办理入住，确认预订。', status: 'ready', reservedMicros: 480_000, providerCalls: 3 },
    { id: 'c5-failed', revision: 3, description: '我想在诊所改约时间。', status: 'failed', reservedMicros: 250_000, providerCalls: 2 },
    { id: 'c5-unknown', revision: 4, description: '我想在邻居家查看漏水。', status: 'unknown', reservedMicros: 90_000, providerCalls: 1 },
    { id: 'c5-deleted', revision: 1, description: null, status: 'deleted', reservedMicros: 60_000, providerCalls: 3, deletedAt },
  ],
  deletions: [{ kind: 'all', at: deletedAt }],
});

export async function routeData(page, baseURL, state) {
  const origin = new URL(baseURL).origin;
  Object.assign(state, { deletes: [], dataDeletes: [], signOuts: [], reportPosts: [], reportReads: [], recordReads: [], foreignWrites: [],
    deleteStatus: 200, dataDeleteStatus: 200, signOutStatus: 200, reportStatus: 200, recordStatus: 200, reports: {}, generationRecords: { [ownerA]: sampleRecords(), [ownerB]: { tasks: [], deletions: [] } } });
  const sameOrigin = request => { if (request.headers()['origin'] !== origin) state.foreignWrites.push(request.url()); };
  await page.route('**/api/learning-library*', route => {
    const request = route.request();
    if (request.method() !== 'DELETE') return route.fallback();
    sameOrigin(request); const params = new URL(request.url()).searchParams, owner = state.owner;
    state.deletes.push({ owner, id: params.get('id'), revision: params.get('revision') });
    if (state.deleteStatus !== 200) return route.fulfill({ status: state.deleteStatus, json: { error: 'delete_failed' } });
    state.scenes[owner] = (state.scenes[owner] ?? []).filter(scene => scene.course.id !== params.get('id'));
    return route.fulfill({ json: { deleted: true } });
  });
  await page.route('**/api/my-data', route => {
    const request = route.request(); expect(request.method()).toBe('DELETE'); sameOrigin(request);
    const owner = state.owner; state.dataDeletes.push({ owner, body: request.postDataJSON() });
    if (state.dataDeleteStatus !== 200) return route.fulfill({ status: state.dataDeleteStatus, json: { error: 'delete_failed' } });
    state.scenes[owner] = [];
    return route.fulfill({ json: { deleted: true } });
  });
  await page.route('**/api/auth/signout', route => {
    const request = route.request(); expect(request.method()).toBe('POST'); sameOrigin(request);
    state.signOuts.push(state.owner);
    if (state.signOutStatus !== 200) return route.fulfill({ status: state.signOutStatus, json: { error: 'temporarily_unavailable' } });
    state.authenticated = false;
    return route.fulfill({ json: { authenticated: false } });
  });
  await routeReports(page, baseURL, state);
  await page.route('**/api/generation-records*', route => {
    const request = route.request(); expect(request.method()).toBe('GET'); state.recordReads.push(state.owner);
    if (state.recordStatus !== 200) return route.fulfill({ status: state.recordStatus, json: { error: 'temporarily_unavailable' } });
    return route.fulfill({ json: state.generationRecords[state.owner] });
  });
  return state;
}

const reportKey = (owner, course) => JSON.stringify([owner, course.id, Number(course.revision), Number(course.materialsRevision ?? 0)]);
export async function routeReports(page, baseURL, state) {
  const origin = new URL(baseURL).origin;
  state.reports ??= {}; state.reportPosts ??= []; state.reportReads ??= []; state.reportStatus ??= 200; state.foreignWrites ??= [];
  await page.route('**/api/sentence-reports*', route => {
    const request = route.request(), owner = state.owner ?? ownerA;
    if (request.method() === 'GET') {
      const params = new URL(request.url()).searchParams, course = { id: params.get('id'), revision: params.get('revision'), materialsRevision: params.get('materialsRevision') };
      state.reportReads.push({ owner, course });
      return route.fulfill({ json: { reports: state.reports[reportKey(owner, course)] ?? [] } });
    }
    expect(request.method()).toBe('POST');
    if (request.headers()['origin'] !== origin) state.foreignWrites.push(request.url());
    const body = request.postDataJSON(); state.reportPosts.push({ owner, body });
    if (state.reportStatus !== 200) return route.fulfill({ status: state.reportStatus, json: { error: 'temporarily_unavailable' } });
    const report = { lineId: body.lineId, reason: body.reason, note: (body.note ?? '').trim(), status: 'received', at: deletedAt };
    const list = state.reports[reportKey(owner, body.course)] ??= [];
    list.splice(0, list.length, ...list.filter(item => item.lineId !== body.lineId), report);
    return route.fulfill({ status: 201, json: { report } });
  });
}

export async function setupData(page, context, baseURL, options) {
  const learning = await setupLearning(page, context, baseURL, options);
  await routeData(page, baseURL, learning.state);
  return learning;
}

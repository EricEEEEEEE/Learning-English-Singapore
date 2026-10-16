import { expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { courseFixture } from './t60-course.mjs';

export const ownerA = 't68-browser-owner-a', ownerB = 't68-browser-owner-b';
export const scenario = '我想在孩子的家长会上，和老师聊聊孩子如何适应新学校。';
export const sceneTitle = '你想在哪个场景下学习英语？';
export const progressTitle = '正在准备你的场景';
export const keywordKeys = ['location', 'learnerRole', 'partnerRole', 'topic', 'goal', 'special'];
export const keywordLabels = ['在哪里？', '你在场景里是谁？', '你要和谁说话？', '主要想聊什么？', '希望达到什么结果？', '有什么特别情况？'];
export const keywordValues = ['学校教室', '学生家长', '班主任', '适应学校', '听懂建议并确认下一步', '一对一，希望慢一点'];
export function requirement(revision = 1, description = scenario) {
  return { revision, content: { description, language: 'zh-Hans', keywords: Object.fromEntries(keywordKeys.map((key, index) => [key, keywordValues[index]])) } };
}
export function generationView(record, id = 't68-task-a', phase = 'awaiting_budget', materialsRevision) {
  const status = phase === 'ready' || phase === 'media_unavailable' ? 'video_assembled' : phase === 'failed' ? 'video_pending' : phase;
  return { requirement: structuredClone(record), task: { id, revision: record.revision, requirementRevision: record.revision, status, simulation: false, providerCalls: phase === 'awaiting_budget' ? 0 : 1 }, phase,
    course: phase === 'ready' ? { id, revision: record.revision, ...(materialsRevision !== undefined ? { materialsRevision } : {}) } : null };
}
export function generatedCourse(pointer) {
  const fixture = courseFixture();
  return { ...fixture, id: pointer.id, revision: pointer.revision, source: 'ai-generated', ...(pointer.materialsRevision !== undefined ? { materialsRevision: pointer.materialsRevision } : {}),
    media: { courseId: pointer.id, revision: pointer.revision, assetId: 'synthetic-final', sha256: 'a'.repeat(64), duration: 12.042 },
    lines: fixture.lines.map(({ version, ...line }) => ({ ...line, revision: pointer.revision })),
  };
}

export async function setupBrowser(page, context, baseURL, initial = null) {
  const state = { owner: ownerA, authenticated: true, records: initial ? { [ownerA]: structuredClone(initial) } : {}, histories: {}, views: {},
    writes: [], posts: [], gets: [], courseReads: [], mediaReads: [], external: [],
    writeStatus: 200, generationReadStatus: 200, postMode: 'normal', postGate: null, pending: null, readGates: {},
  };
  if (initial) state.histories[`${ownerA}:${initial.revision}`] = structuredClone(initial);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL).origin) { state.external.push(url.origin); throw new Error('T68 browser evidence must stay local.'); }
    if (url.pathname.startsWith('/api/generation') && route.request().method() !== 'GET') throw new Error('T68 uses its requirement-bound API, never a raw/provider task endpoint.');
    return route.continue();
  });
  await page.route('**/api/auth/session', route => route.fulfill({ json: { authenticated: state.authenticated, accountKey: state.authenticated ? state.owner : null } }));
  await context.route('**/api/scene-requirements*', route => {
    if (!state.authenticated) return route.fulfill({ status: 401, json: { error: 'unauthenticated' } });
    const owner = state.owner;
    if (route.request().method() === 'GET') return route.fulfill({ json: { requirement: state.records[owner] ?? null } });
    expect(route.request().method()).toBe('PUT');
    const body = route.request().postDataJSON(); state.writes.push({ owner, body });
    if (state.writeStatus !== 200) return route.fulfill({ status: state.writeStatus, json: { error: state.writeStatus === 409 ? 'conflict' : 'temporarily_unavailable' } });
    const current = state.records[owner];
    if (current && JSON.stringify(current.content) === JSON.stringify(body.content)) return route.fulfill({ json: { requirement: current } });
    if (body.expectedRevision !== (current?.revision ?? 0)) return route.fulfill({ status: 409, json: { error: 'conflict' } });
    const saved = { revision: (current?.revision ?? 0) + 1, content: body.content };
    state.records[owner] = saved; state.histories[`${owner}:${saved.revision}`] = structuredClone(saved);
    return route.fulfill({ json: { requirement: saved } });
  });
  await context.route('**/api/scene-generation*', async route => {
    const request = route.request(), owner = state.owner;
    if (!state.authenticated) return route.fulfill({ status: 401, json: { error: 'unauthenticated' } });
    if (request.method() === 'GET') {
      const revision = Number(new URL(request.url()).searchParams.get('revision'));
      state.gets.push({ owner, revision });
      const record = state.histories[`${owner}:${revision}`];
      const view = structuredClone(state.views[`${owner}:${revision}`] ?? (record ? { requirement: record, task: null, phase: 'not_submitted', course: null } : null));
      if (state.readGates[owner]) await state.readGates[owner];
      if (state.generationReadStatus !== 200) return route.fulfill({ status: state.generationReadStatus, json: { error: 'temporarily_unavailable' } });
      return view ? route.fulfill({ json: view }) : route.fulfill({ status: 404, json: { error: 'not_found' } });
    }
    expect(request.method()).toBe('POST');
    const body = request.postDataJSON(); state.posts.push({ owner, body });
    const key = `${owner}:${body.requirementRevision}`, record = state.histories[key];
    if (!record) return route.fulfill({ status: 404, json: { error: 'not_found' } });
    const view = state.views[key] ?? generationView(record, owner === ownerA ? `t68-task-a-${record.revision}` : `t68-task-b-${record.revision}`);
    if (state.postMode === 'lost-later') { state.pending = { key, view }; return route.abort('failed'); }
    state.views[key] = view;
    if (state.postMode === 'lost') return route.abort('failed');
    if (state.postGate) await state.postGate;
    return route.fulfill({ status: 201, json: view });
  });
  // Explicit UI protocol fixtures; real private media integrity is a separate server check.
  await context.route('**/api/generated-courses*', route => {
    const params = new URL(route.request().url()).searchParams;
    const pointer = { id: params.get('id'), revision: Number(params.get('revision')), ...(params.has('materialsRevision') ? { materialsRevision: Number(params.get('materialsRevision')) } : {}) };
    state.courseReads.push(pointer);
    return route.fulfill({ json: generatedCourse(pointer) });
  });
  await context.route('**/api/generated-course-media*', route => {
    state.mediaReads.push(new URL(route.request().url()).search);
    return route.fulfill({ path: fileURLToPath(new URL('../../public/media/hotel-pov-12s.mp4', import.meta.url)), contentType: 'video/mp4' });
  });
  return state;
}

export async function openBackground(page, text = scenario) {
  await page.goto('/');
  const main = page.getByRole('main');
  await main.getByRole('textbox', { name: sceneTitle, exact: true }).fill(text);
  await main.getByRole('button', { name: '下一步', exact: true }).click();
  for (let index = 0; index < keywordKeys.length; index++) await main.getByRole('textbox', { name: keywordLabels[index], exact: true }).fill(keywordValues[index]);
  return main;
}

export function observeGenerationRequest(page, method = 'GET') {
  let target, finish;
  const settled = new Promise(resolve => { finish = resolve; });
  const started = request => { if (!target && request.method() === method && new URL(request.url()).pathname === '/api/scene-generation') target = request; };
  const ended = request => { if (request === target) finish(); };
  page.on('request', started); page.on('requestfinished', ended); page.on('requestfailed', ended);
  return { async done() { await settled; await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); },
    dispose() { page.off('request', started); page.off('requestfinished', ended); page.off('requestfailed', ended); } };
}

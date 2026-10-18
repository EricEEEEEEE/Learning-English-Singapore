import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { isDeepStrictEqual } from 'node:util';
import { setupBrowser, generationView, ownerA, ownerB, sceneTitle } from './t68-generation-browser.mjs';
import { hotelRequirement, hotelSample } from './t69-guided-browser.mjs';
import { handleGeneratedMedia } from '../../app/api/generated-course-media/route.ts';
import { openMore } from './c10-shell.mjs';

export { ownerA, ownerB, sceneTitle };
export const coursePointer = { id: 't70-synthetic-hotel', revision: 2, materialsRevision: 3 };
export const mediaSha = 'a'.repeat(64);
const hotelBytes = await readFile(new URL('../../public/media/hotel-pov-12s.mp4', import.meta.url));
export const key = (owner, pointer = coursePointer) => JSON.stringify([owner, pointer.id, pointer.revision, pointer.materialsRevision ?? 0]);
export function progressRecord(position = { page: 'watch', time: 1.25, turnIndex: 0 }, version = 4) {
  return { course: { ...coursePointer, mediaSha256: mediaSha }, version, position: structuredClone(position), updatedAt: 1000 };
}
export async function setupLearning(page, context, baseURL, { progress = null, extraTurn = false, legacy = false } = {}) {
  const record = hotelRequirement(), latest = hotelRequirement(); latest.revision = 9;
  latest.content.description = '正在编辑的新场景草稿'; latest.content.keywords.learnerRole = '新草稿中的导游';
  const state = await setupBrowser(page, context, baseURL, latest);
  Object.assign(state, { catalogueReads: [], catalogueGates: {}, catalogueStatus: 200, unavailable: 0, progressReads: [], progressWrites: [], progressReadGates: {}, progressReadStatus: 200, progressWriteStatus: 200, progressAckGates: {}, progress: {}, activeWrites: 0, maxActiveWrites: 0, lostAckOnce: false, publicReads: [], mediaStatus: 200, courseStatus: 200 });
  await page.addInitScript(() => {
    window.t70MicCalls = 0; window.t70PlayCalls = 0;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { window.t70PlayCalls++; return play.call(this); };
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => { window.t70MicCalls++; return Promise.reject(new DOMException('Synthetic microphone denied', 'NotAllowedError')); };
  });
  const course = { ...coursePointer, source: 'ai-generated', media: { courseId: coursePointer.id, revision: 2, assetId: 'synthetic-existing-hotel', sha256: mediaSha, duration: hotelSample.media.duration },
    lines: hotelSample.lines.map(({ version, ...line }) => ({ ...structuredClone(line), revision: 2 })), phrases: structuredClone(hotelSample.phrases), turns: structuredClone(hotelSample.turns) };
  if (extraTurn) {
    // Metadata only: existing hotel bytes do not contain this additional dialogue.
    const translations = text => Object.fromEntries(['zh-Hans', 'id', 'ja', 'ko', 'hi'].map(code => [code, text]));
    course.lines.push({ id: 'synthetic-question-2', role: 'partner', text: 'May I see your ID?', start: 8, end: 8.8, revision: 2, translations: translations('合成第二回合问题') },
      { id: 'synthetic-answer-2', role: 'learner', text: 'Here it is.', start: 10, end: 11, revision: 2, translations: translations('合成第二回合答案') });
    course.turns.push({ partnerLineId: 'synthetic-question-2', learnerLineId: 'synthetic-answer-2' });
  }
  const contextRecord = structuredClone(record);
  if (legacy) for (const name of Object.keys(contextRecord.content.keywords)) contextRecord.content.keywords[name] = '';
  state.scenes = { [ownerA]: [{ course: { ...coursePointer }, description: record.content.description, duration: course.media.duration, requirement: contextRecord, contextSource: legacy ? 'legacy-neutral' : 'requirement' }], [ownerB]: [] };
  state.course = course; state.progress[key(ownerA)] = structuredClone(progress);
  state.histories[`${ownerA}:2`] = record; state.views[`${ownerA}:2`] = generationView(record, coursePointer.id, 'ready', 3);
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/media/')) state.publicReads.push(request.url()); });
  await page.route('**/api/learning-library*', async route => {
    expect(route.request().method()).toBe('GET'); const owner = state.owner;
    state.catalogueReads.push(owner);
    const body = structuredClone({ scenes: state.scenes[owner] ?? [], unavailable: state.unavailable });
    if (state.catalogueGates[owner]) await state.catalogueGates[owner];
    if (!state.authenticated) return route.fulfill({ status: 401, json: { error: 'unauthenticated' } });
    return route.fulfill({ status: state.catalogueStatus, json: state.catalogueStatus === 200 ? body : { error: 'temporarily_unavailable' } });
  });
  await page.route('**/api/generated-courses*', route => {
    const params = new URL(route.request().url()).searchParams;
    const pointer = { id: params.get('id'), revision: Number(params.get('revision')), ...(params.has('materialsRevision') ? { materialsRevision: Number(params.get('materialsRevision')) } : {}) };
    state.courseReads.push({ ...pointer });
    const allowed = state.owner === ownerA && JSON.stringify(pointer) === JSON.stringify(coursePointer);
    return route.fulfill({ status: allowed ? state.courseStatus : 404, json: allowed && state.courseStatus === 200 ? state.course : { error: 'not_found' } });
  });
  await page.route('**/api/generated-course-media*', async route => {
    const request = route.request(), url = new URL(request.url()); state.mediaReads.push(url.search);
    if (state.owner !== ownerA || state.mediaStatus !== 200) return route.fulfill({ status: state.owner !== ownerA ? 404 : state.mediaStatus, body: '' });
    expect(url.searchParams.get('id')).toBe(coursePointer.id); expect(url.searchParams.get('revision')).toBe('2');
    const response = await handleGeneratedMedia(new Request(request.url(), { method: request.method(), headers: request.headers() }), {
      now: 0, store: { async getCourseMedia() { return { bytes: hotelBytes, size: hotelBytes.byteLength }; } },
    });
    return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  await page.route('**/api/scene-progress*', async route => {
    const request = route.request(), owner = state.owner;
    if (request.method() === 'GET') {
      const params = new URL(request.url()).searchParams;
      const pointer = { id: params.get('id'), revision: Number(params.get('revision')), ...(params.has('materialsRevision') ? { materialsRevision: Number(params.get('materialsRevision')) } : {}) };
      state.progressReads.push({ owner, course: pointer }); const saved = structuredClone(state.progress[key(owner, pointer)] ?? null);
      if (state.progressReadGates[owner]) await state.progressReadGates[owner];
      return route.fulfill({ status: state.progressReadStatus, json: state.progressReadStatus === 200 ? { progress: saved } : { error: state.progressReadStatus === 401 ? 'unauthenticated' : 'temporarily_unavailable' } });
    }
    expect(request.method()).toBe('PUT'); const body = request.postDataJSON(); state.progressWrites.push({ owner, body: structuredClone(body) });
    state.activeWrites++; state.maxActiveWrites = Math.max(state.maxActiveWrites, state.activeWrites);
    try {
      if (state.progressWriteStatus !== 200) return route.fulfill({ status: state.progressWriteStatus, json: { error: state.progressWriteStatus === 401 ? 'unauthenticated' : 'temporarily_unavailable' } });
      const entryKey = key(owner, body.course), previous = state.progress[entryKey] ?? null, version = previous?.version ?? 0;
      if (body.expectedVersion !== version && !(previous && body.expectedVersion < version && isDeepStrictEqual(body.position, previous.position))) return route.fulfill({ status: 409, json: { error: 'conflict' } });
      const saved = body.expectedVersion < version ? previous : { course: { ...body.course, mediaSha256: mediaSha }, version: version + 1, position: structuredClone(body.position), updatedAt: 1000 + version + 1 };
      state.progress[entryKey] = saved;
      if (state.progressAckGates[owner]) await state.progressAckGates[owner];
      if (state.lostAckOnce) { state.lostAckOnce = false; return route.abort('failed'); }
      return route.fulfill({ json: { progress: saved } });
    } finally { state.activeWrites--; }
  });
  return { state, course, record, main: page.getByRole('main') };
}
export async function openLibrary(page, main = page.getByRole('main')) {
  // C11-3: "my scenes" lives in the scene input page's "more" sheet.
  await page.goto('/'); await openMore(page); await main.getByRole('button', { name: '我的场景', exact: true }).click();
  await expect(main.getByRole('heading', { name: '我的场景', exact: true })).toBeVisible();
}
export async function openCourse(main) {
  await main.getByRole('button', { name: '继续学习', exact: true }).click();
  await expect(main.getByTestId('real-scene-course')).toBeVisible();
}
export const savedStatus = main => main.getByTestId('scene-progress-status');
export async function noPreviousProgress(main) { await expect(savedStatus(main)).toContainText('还没有保存学习位置'); }
export async function waitVideo(main) { const video = main.locator('video'); await expect.poll(() => video.evaluate(v => v.readyState)).toBeGreaterThanOrEqual(2); return video; }
export async function seek(video, time) { await video.evaluate((v, value) => { v.currentTime = value; v.dispatchEvent(new Event('timeupdate')); v.dispatchEvent(new Event('pause')); }, time); }
export function noGeneration(state) { expect(state.posts).toEqual([]); expect(state.writes).toEqual([]); expect(state.external).toEqual([]); expect(state.publicReads).toEqual([]); }
export function observeApi(page, pathname, method = 'GET') {
  let target, finish; const settled = new Promise(resolve => { finish = resolve; });
  const started = request => { if (!target && request.method() === method && new URL(request.url()).pathname === pathname) target = request; };
  const ended = request => { if (request === target) finish(); };
  page.on('request', started); page.on('requestfinished', ended); page.on('requestfailed', ended);
  return { async done() { await settled; await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); },
    dispose() { page.off('request', started); page.off('requestfinished', ended); page.off('requestfailed', ended); } };
}

// Deliberately stalls JSON body consumption after real fixture headers arrive.
// Virtual browser time proves a client deadline; it is not a real network outage.
export async function stallBody(page, pathname, method = 'GET') {
  await page.addInitScript(({ pathname, method }) => {
    window.t70BodyTarget = { pathname, method };
    if (window.t70BodyWrapperInstalled) return;
    window.t70BodyWrapperInstalled = true;
    const native = window.fetch.bind(window); window.t70BodyAborts = 0; window.t70BodyStalls = 0;
    window.fetch = async (input, init) => {
      const request = new Request(input, init), response = await native(request);
      if (!window.t70BodyRecovered && new URL(request.url).pathname === window.t70BodyTarget.pathname && request.method === window.t70BodyTarget.method && response.ok) {
        window.t70BodyStalls++;
        return new Response(new ReadableStream({ start(controller) {
          controller.enqueue(new TextEncoder().encode('{"pending":'));
          request.signal.addEventListener('abort', () => { window.t70BodyAborts++; controller.error(new DOMException('Synthetic stalled JSON body aborted', 'AbortError')); }, { once: true });
        } }), { status: response.status, headers: response.headers });
      }
      return response;
    };
  }, { pathname, method });
}

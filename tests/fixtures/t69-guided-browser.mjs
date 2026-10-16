import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { setupBrowser, requirement, generationView, ownerA } from './t68-generation-browser.mjs';

export const hotelSample = JSON.parse(await readFile(new URL('../../public/media/hotel-course.json', import.meta.url), 'utf8'));
export const guidedId = 't69-synthetic-hotel', guidedRevision = 2, guidedMaterials = 3;
export function hotelRequirement(language = 'zh-Hans') {
  const record = requirement(guidedRevision, '我想在酒店办理入住，确认预订。');
  record.content.language = language;
  record.content.keywords = { location: '酒店前台', learnerRole: '住客', partnerRole: '酒店前台', topic: '入住', goal: '确认预订', special: '希望慢一点' };
  return record;
}
const watchNames = { 'zh-Hans': '观看场景', id: 'Tonton situasi', ja: '場面を見る', ko: '상황 보기', hi: 'दृश्य देखें' };
export async function setupGuided(page, context, baseURL, { record = hotelRequirement(), latest = record, changeCourse } = {}) {
  await page.addInitScript(() => {
    window.t69MicCalls = 0;
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => {
      window.t69MicCalls++;
      return Promise.reject(new DOMException('No microphone in guided self-practice', 'NotAllowedError'));
    };
  });
  const state = await setupBrowser(page, context, baseURL, latest);
  state.histories[`${ownerA}:${record.revision}`] = record;
  state.views[`${ownerA}:${record.revision}`] = generationView(record, guidedId, 'ready', guidedMaterials);
  const course = { id: guidedId, revision: record.revision, materialsRevision: guidedMaterials, source: 'ai-generated',
    media: { courseId: guidedId, revision: record.revision, assetId: 'synthetic-existing-hotel', sha256: 'a'.repeat(64), duration: hotelSample.media.duration },
    lines: hotelSample.lines.map(({ version, ...line }) => ({ ...line, revision: record.revision })), phrases: structuredClone(hotelSample.phrases), turns: structuredClone(hotelSample.turns),
  };
  if (changeCourse) changeCourse(course);
  state.course = course; state.publicCourseReads = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/media/hotel-course.json') state.publicCourseReads++; });
  await page.route('**/api/generated-courses*', route => {
    const params = new URL(route.request().url()).searchParams;
    state.courseReads.push({ id: params.get('id'), revision: Number(params.get('revision')), materialsRevision: Number(params.get('materialsRevision')) });
    return route.fulfill({ json: state.course });
  });
  await page.goto(`/?generation=${record.revision}`);
  await expect(page.getByRole('combobox')).toHaveValue(latest.content.language);
  await page.getByRole('main').getByRole('button', { name: watchNames[latest.content.language], exact: true }).click();
  return { state, course, main: page.getByRole('main'), record };
}
export async function enterRole(main) {
  const enter = main.getByRole('button', { name: '进入角色学习', exact: true });
  await expect(enter).toBeVisible(); await enter.click();
}
export async function enterTerms(main) { await enterRole(main); await main.getByRole('button', { name: '开始学词组', exact: true }).click(); }
export function assertSameMedia(state) {
  expect(state.courseReads).not.toHaveLength(0);
  for (const pointer of state.courseReads) expect(pointer).toEqual({ id: guidedId, revision: guidedRevision, materialsRevision: guidedMaterials });
  expect(state.posts).toEqual([]); expect(state.writes).toEqual([]); expect(state.external).toEqual([]); expect(state.publicCourseReads).toBe(0);
}

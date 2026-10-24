import { test, expect } from '@playwright/test';
import { setupData, openLibrary, ownerA } from '../fixtures/c5-data-browser.mjs';
import { hotelRequirement, setupGuided, assertSameMedia } from '../fixtures/t69-guided-browser.mjs';
import { openPractice, panel } from '../fixtures/c4-practice-browser.mjs';
import { mediaReady } from '../fixtures/c4-practice-browser.mjs';
import { openMore, closeMore } from '../fixtures/c10-shell.mjs';
import { openRowMenu, rowSheet } from '../fixtures/c11-shell.mjs';
import { setupBrowser, openBackground, sceneTitle } from '../fixtures/t68-generation-browser.mjs';

// C16 (2026-10-24, zero cost): "make another version of this lesson" from my scenes, with versions numbered in the list
// (F11.4); the review set beside the last review of another scene (F10.4); "a bit faster 1.25×" on the watch page and
// "starting at entry level" on the confirm card (F4.3, F2.3). All routes are answered in memory: nothing is generated,
// nothing is sent to a model, and control names and test ids stay as they were.
test.use({ locale: 'zh-CN' });
const hotel = hotelRequirement();
const description = hotel.content.description;
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

// ---- C16-5: make another version of a lesson ----

test('C16-5 / F11.4: "照这课再做一版" fills the scene input and keywords from that lesson; saving writes a new version and generates nothing', async ({ page, context, baseURL }) => {
  const { state, main } = await setupData(page, context, baseURL);
  await openLibrary(page, main);
  const sheet = await openRowMenu(main, description);
  // The delete control keeps its name next to the new one.
  await expect(sheet.getByRole('button', { name: `删除这个场景：${description}`, exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: '照这课再做一版', exact: true }).click();
  await expect(rowSheet(page)).toHaveCount(0);
  const input = main.getByRole('textbox', { name: sceneTitle, exact: true });
  await expect(input).toBeVisible();
  // The draft that was being edited ("正在编辑的新场景草稿") is replaced by that lesson's description.
  await expect(input).toHaveValue(description);
  await main.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(main.getByRole('textbox', { name: '你在场景里是谁？', exact: true })).toHaveValue('住客');
  await expect(main.getByRole('textbox', { name: '在哪里？', exact: true })).toHaveValue('酒店前台');
  await main.getByRole('button', { name: '保存需求', exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0].body.expectedRevision).toBe(9);
  expect(state.writes[0].body.content).toEqual({ description, language: 'zh-Hans', keywords: hotel.content.keywords });
  expect(state.posts).toEqual([]);
  // The original lesson is still there, unchanged.
  await openLibrary(page, main);
  await expect(main.locator('.scene-card').filter({ hasText: description })).toHaveCount(1);
  expect(state.deletes).toEqual([]);
  expect(await noOverflow(page)).toBe(true);
});

test('C16-5 / F11.4: two lessons with the same description are numbered by version in my scenes; a single lesson has no number', async ({ page, context, baseURL }) => {
  const { state, main } = await setupData(page, context, baseURL);
  await openLibrary(page, main);
  await expect(main.getByTestId('scene-row-meta').first()).not.toContainText('版');
  const original = state.scenes[ownerA][0];
  const later = structuredClone(original);
  later.course = { id: 't70-synthetic-hotel-v2', revision: 5, materialsRevision: 1 };
  later.requirement.revision = 5;
  state.scenes[ownerA] = [later, original];
  await page.reload();
  await openLibrary(page, main);
  const metas = main.getByTestId('scene-row-meta');
  await expect(metas).toHaveCount(2);
  await expect(metas.nth(0)).toContainText('第 2 版');
  await expect(metas.nth(1)).toContainText('第 1 版');
  for (const word of ['分', '%', '连续']) await expect(main.locator('.learning-scenes')).not.toContainText(word);
  expect(await noOverflow(page)).toBe(true);
});

// ---- C16-6: the review beside another scene ----

const otherScene = { session: 'other-scene-session-1', turns: [{ turnIndex: 0, outcome: 'independent' }, { turnIndex: 1, outcome: 'after_hint' }, { turnIndex: 2, outcome: 'after_hint' }], help: { hints: 2, autoHelp: 0, translations: 0, native: 0 }, at: 1 };
async function routeOtherScene(page, other) {
  const posts = [];
  await page.route('**/api/practice-reviews*', route => {
    const body = route.request().postDataJSON(); posts.push(body);
    return route.fulfill({ status: 201, json: { review: { session: body.session, turns: body.turns, help: body.help, at: 2 }, previous: null, ...(other ? { otherScene: other } : {}) } });
  });
  return posts;
}

test('C16-6 / F10.4: ending practice lists the last review of another scene next to this one, without a score or a ranking', async ({ page, context, baseURL }) => {
  const posts = await routeOtherScene(page, otherScene);
  const { main } = await openPractice(page, context, baseURL);
  await openMore(main);
  await panel(main).getByRole('button', { name: '结束练习', exact: true }).click();
  const review = panel(main).getByTestId('practice-review');
  const other = review.getByTestId('practice-compare-other');
  await expect(other).toBeVisible();
  await expect(other).toContainText('另一个场景');
  await expect(other).toContainText('独立完成 1');
  await expect(other).toContainText('提示后完成 2');
  await expect(review).toContainText('只是列出来，不比较高低');
  // Still the first review of this scene: the C9-6 line stays.
  await expect(review.getByTestId('practice-compare-first')).toBeVisible();
  for (const word of ['分数', '%', '掌握', '更好', '更差', '进步了', '退步']) await expect(review).not.toContainText(word);
  expect(posts).toHaveLength(1);
  expect(await noOverflow(page)).toBe(true);
});

test('C16-6: without a review of another scene nothing extra is shown', async ({ page, context, baseURL }) => {
  await routeOtherScene(page, null);
  const { main } = await openPractice(page, context, baseURL);
  await openMore(main);
  await panel(main).getByRole('button', { name: '结束练习', exact: true }).click();
  const review = panel(main).getByTestId('practice-review');
  await expect(review.getByTestId('practice-compare-first')).toBeVisible();
  await expect(review.getByTestId('practice-compare-other')).toHaveCount(0);
});

// ---- C16-7: a bit faster, and "starting at entry level" ----

test('C16-7 / F4.3: "快一点 1.25×" in the watch page\'s more sheet plays faster at the same pitch and switches off slow, and slow switches it off', async ({ page, context, baseURL }) => {
  const { main, state } = await setupGuided(page, context, baseURL);
  const video = main.locator('video'); await mediaReady(video);
  let sheet = await openMore(page);
  const fast = sheet.getByRole('button', { name: '快一点', exact: true });
  await expect(fast).toHaveAttribute('aria-pressed', 'false');
  await expect(fast).toContainText('1.25×');
  await fast.click();
  await expect(fast).toHaveAttribute('aria-pressed', 'true');
  await closeMore(page);
  await main.getByTestId('scene-play').click();
  await expect.poll(() => video.evaluate(v => !v.paused)).toBe(true);
  expect(await video.evaluate(v => [v.playbackRate, v.preservesPitch])).toEqual([1.25, true]);
  // The first viewing still shows English captions only.
  await expect(main.getByTestId('scene-caption')).toHaveAttribute('lang', 'en');
  const slow = main.getByTestId('watch-tools').getByRole('button', { name: '慢速', exact: true });
  await slow.click();
  await expect(slow).toHaveAttribute('aria-pressed', 'true');
  expect(await video.evaluate(v => [v.playbackRate, v.preservesPitch])).toEqual([0.75, true]);
  sheet = await openMore(page);
  await expect(sheet.getByRole('button', { name: '快一点', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await sheet.getByRole('button', { name: '快一点', exact: true }).click();
  await closeMore(page);
  await expect(slow).toHaveAttribute('aria-pressed', 'false');
  expect(await video.evaluate(v => v.playbackRate)).toBe(1.25);
  sheet = await openMore(page);
  await sheet.getByRole('button', { name: '快一点', exact: true }).click();
  await closeMore(page);
  expect(await video.evaluate(v => v.playbackRate)).toBe(1);
  assertSameMedia(state);
});

test('C16-7 / F2.3: the confirm card says the lesson starts at entry level next to its length, with no level name or score', async ({ page, context, baseURL }) => {
  const state = await setupBrowser(page, context, baseURL);
  const main = await openBackground(page);
  await main.getByRole('button', { name: '生成场景', exact: true }).click();
  const card = main.getByRole('region', { name: '确认要生成的场景', exact: true });
  await expect(card).toBeVisible();
  const level = page.getByTestId('confirm-level');
  await expect(level).toHaveText('暂按入门程度：短句，可以放慢。');
  await expect(level).toBeInViewport();
  for (const word of ['分数', '等级', 'CEFR', '%']) await expect(page.getByTestId('action-bar').filter({ visible: true })).not.toContainText(word);
  expect(state.posts).toEqual([]);
  expect(await noOverflow(page)).toBe(true);
});

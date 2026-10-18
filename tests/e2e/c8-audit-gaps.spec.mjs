import { test, expect } from '@playwright/test';
import { openMore, closeMore, openHelp, startPracticeSetup } from '../fixtures/c10-shell.mjs';
import { setupBrowser, openBackground, requirement, generationView, ownerA, sceneTitle, progressTitle } from '../fixtures/t68-generation-browser.mjs';
import { setupGuided, hotelRequirement, hotelSample } from '../fixtures/t69-guided-browser.mjs';
import { setupLearning, openLibrary, openCourse, waitVideo, seek, progressRecord, key, savedStatus, noPreviousProgress, noGeneration } from '../fixtures/t70-learning-browser.mjs';
import { installMic, routePractice, openPractice, panel, twoTurns, reply } from '../fixtures/c4-practice-browser.mjs';

// C8 (user 2026-10-17: finish the product before real video; self-audit gaps 1, 2, 3, 4, 7 and 8).
// Offline and reconnect, display switches on the main path, practice resume, cancelling a generation,
// three small practice controls and two safety notes. All routes are answered in memory; nothing here calls
// a model or a video provider, and the microphone is a synthetic stub or refused.
test.use({ locale: 'zh-CN' });
const [first, second] = hotelSample.lines;
const offlineBanner = main => main.getByTestId('offline-banner');
// Count every API request the page makes from now on, to prove a step sends nothing.
function countApi(page) {
  const seen = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) seen.push(`${request.method()} ${new URL(request.url()).pathname}`); });
  return seen;
}
async function goOffline(page, context) {
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
}
async function goOnline(page, context) {
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
}

// ---- C8-1: offline and reconnect (F11.3) ----

test('C8-1 / F11.3: on the scene input page going offline is shown and saving sends nothing until the network is back', async ({ page, context, baseURL }) => {
  const state = await setupBrowser(page, context, baseURL);
  const main = await openBackground(page);
  await expect(offlineBanner(main)).toHaveCount(0);
  const seen = countApi(page);
  await goOffline(page, context);
  await expect(offlineBanner(main)).toContainText('网络断开');
  await main.getByRole('button', { name: '保存需求', exact: true }).click();
  await expect(main.getByText('未保存，连上网后再试。', { exact: true })).toBeVisible();
  await main.getByRole('button', { name: '生成场景', exact: true }).click();
  await main.getByRole('button', { name: '确认生成', exact: true }).click();
  await expect(main.getByText('未保存，连上网后再试。', { exact: true })).toBeVisible();
  await expect(main.getByRole('textbox', { name: '在哪里？', exact: true })).toHaveValue('学校教室');
  await page.waitForTimeout(300);
  expect(seen).toEqual([]); expect(state.writes).toEqual([]); expect(state.posts).toEqual([]);
  await goOnline(page, context);
  await expect(offlineBanner(main)).toHaveCount(0);
  await expect(main.getByText('未保存，连上网后再试。', { exact: true })).toHaveCount(0);
  await main.getByRole('button', { name: '保存需求', exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.posts).toEqual([]);
});

test('C8-1 / F11.3: the generation status page stops checking while offline and reads (never submits) once back', async ({ page, context, baseURL }) => {
  test.setTimeout(40_000);
  const record = requirement();
  const state = await setupBrowser(page, context, baseURL, record);
  state.views[`${ownerA}:1`] = generationView(record, 't68-task-a', 'script_ready');
  await page.goto('/?generation=1');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: progressTitle, exact: true })).toBeVisible();
  await expect(main.getByText('场景内容已准备，等待声音。', { exact: true })).toBeVisible();
  await goOffline(page, context);
  const before = state.gets.length;
  await expect(offlineBanner(main)).toContainText('网络断开');
  await main.getByRole('button', { name: '重新检查', exact: true }).click();
  await page.waitForTimeout(6500);
  expect(state.gets.length).toBe(before);
  await goOnline(page, context);
  await expect.poll(() => state.gets.length, { timeout: 3000 }).toBeGreaterThan(before);
  await expect(offlineBanner(main)).toHaveCount(0);
  await expect(main.getByText('场景内容已准备，等待声音。', { exact: true })).toBeVisible();
  expect(state.posts).toEqual([]); expect(state.writes).toEqual([]);
});

test('C8-1 / F11.3: practice cannot start while offline, says why, opens no microphone and recovers when back online', async ({ page, context, baseURL }) => {
  const bodies = await routePractice(page, [{ json: reply() }]);
  const { main } = await openPractice(page, context, baseURL);
  await installMic(page);
  await goOffline(page, context);
  const start = panel(main).getByRole('button', { name: '开始说', exact: true });
  await expect(start).toBeDisabled();
  await expect(panel(main).getByTestId('practice-offline')).toContainText('网络断开');
  await expect(offlineBanner(main)).toContainText('网络断开');
  expect(await page.evaluate(() => window.t69MicCalls)).toBe(0);
  await goOnline(page, context);
  await expect(start).toBeEnabled();
  await expect(panel(main).getByTestId('practice-offline')).toHaveCount(0);
  await start.click();
  await panel(main).getByRole('button', { name: '说完了', exact: true }).click();
  await expect(panel(main).getByTestId('practice-reply')).toHaveText('Great. May I see your passport?');
  expect(bodies).toHaveLength(1);
});

test('C8-1 / F11.3: a learning position reached offline waits, then is saved exactly once after reconnecting', async ({ page, context, baseURL }) => {
  const { state, main } = await setupLearning(page, context, baseURL);
  await openLibrary(page); await openCourse(main); const video = await waitVideo(main); await noPreviousProgress(main);
  await goOffline(page, context);
  await expect(offlineBanner(main)).toContainText('网络断开');
  await seek(video, 3.3);
  await expect(savedStatus(main)).toContainText('连上网后');
  await page.waitForTimeout(1500);
  expect(state.progressWrites).toEqual([]);
  await goOnline(page, context);
  await expect.poll(() => state.progressWrites.length).toBe(1);
  expect(state.progressWrites[0].body.position.time).toBeCloseTo(3.3, 1);
  await expect(savedStatus(main)).toContainText('已保存在本机');
  await page.waitForTimeout(1000);
  expect(state.progressWrites).toHaveLength(1);
  noGeneration(state);
});

// ---- C8-2: display switches on the main path (F13.2) ----

test('C8-2 / F13.2: "large text" and "reduce motion" are on the signed-in scene page, apply at once and persist', async ({ page, context, baseURL }) => {
  await setupBrowser(page, context, baseURL);
  await page.goto('/');
  const main = page.getByRole('main');
  await expect(main.getByRole('textbox', { name: sceneTitle, exact: true })).toBeVisible();
  const shell = page.locator('.app-shell');
  const large = page.getByRole('checkbox', { name: '大字号', exact: true });
  const motion = page.getByRole('checkbox', { name: '减少动画', exact: true });
  await openMore(page);
  await expect(large).not.toBeChecked(); await expect(motion).not.toBeChecked();
  const size = () => main.getByRole('heading', { name: sceneTitle, exact: true }).evaluate(h => parseFloat(getComputedStyle(h).fontSize));
  const before = await size();
  await large.check();
  await expect(shell).toHaveAttribute('data-large-text', 'true');
  expect(await size()).toBeGreaterThan(before);
  await motion.check();
  await expect(shell).toHaveAttribute('data-reduced-motion', 'true');
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('le-sg-entry-preferences-v1')))).toMatchObject({ largeText: true, reducedMotion: true, language: 'zh-Hans' });
  await page.reload();
  await expect(main.getByRole('textbox', { name: sceneTitle, exact: true })).toBeVisible();
  await openMore(page);
  await expect(large).toBeChecked(); await expect(motion).toBeChecked();
  await expect(shell).toHaveAttribute('data-large-text', 'true'); await expect(shell).toHaveAttribute('data-reduced-motion', 'true');
  await large.uncheck();
  await expect(shell).toHaveAttribute('data-large-text', 'false');
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('le-sg-entry-preferences-v1')))).toMatchObject({ largeText: false, reducedMotion: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
});

test('C8-2 / F13.2: the same switches stay reachable while watching and learning a scene', async ({ page, context, baseURL }) => {
  const { main } = await setupGuided(page, context, baseURL);
  await expect(main.getByTestId('scene-play')).toBeVisible();
  const large = page.getByRole('checkbox', { name: '大字号', exact: true });
  await openMore(page);
  await large.check();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-large-text', 'true');
  await expect(main.getByTestId('scene-play')).toBeVisible();
});

// ---- C8-3: practice resumes at the same turn after a reload (F11.1, F11.5) ----

test('C8-3 / F11.1: entering practice and moving to the next turn are saved as the practice page and turn', async ({ page, context, baseURL }) => {
  const { state, main } = await setupLearning(page, context, baseURL, { extraTurn: true });
  await routePractice(page, [{ json: reply() }]);
  await openLibrary(page); await openCourse(main); await waitVideo(main);
  for (const button of ['进入角色学习', '开始学词组', '下一步：句子', '下一步：提示接话', '下一步：开口对练']) await main.getByRole('button', { name: button, exact: true }).click();
  await expect(panel(main)).toBeVisible();
  await startPracticeSetup(main);
  await expect.poll(() => state.progress[key(ownerA)]?.position).toMatchObject({ page: 'practice', turnIndex: 0 });
  await installMic(page);
  await panel(main).getByRole('button', { name: '开始说', exact: true }).click();
  await panel(main).getByRole('button', { name: '说完了', exact: true }).click();
  await panel(main).getByRole('button', { name: '下一回合', exact: true }).click();
  await expect(panel(main).getByTestId('practice-partner')).toHaveText('May I see your ID?');
  await expect.poll(() => state.progress[key(ownerA)]?.position).toMatchObject({ page: 'practice', turnIndex: 1 });
  noGeneration(state);
});

test('C8-3 / F11.5: after a reload practice reopens at the same turn and offers "listen first" without opening the microphone', async ({ page, context, baseURL }) => {
  const { state, main } = await setupLearning(page, context, baseURL, { extraTurn: true, progress: progressRecord({ page: 'practice', time: 8.2, turnIndex: 1 }) });
  await openLibrary(page); await openCourse(main);
  await expect(panel(main)).toBeVisible();
  await expect(panel(main).getByTestId('practice-partner')).toHaveText('May I see your ID?');
  const video = await waitVideo(main); await expect(video).toHaveJSProperty('paused', true);
  const listen = panel(main).getByRole('button', { name: '先听对方这句', exact: true });
  const go = panel(main).getByRole('button', { name: '直接继续', exact: true });
  await expect(listen).toBeVisible(); await expect(go).toBeVisible();
  expect(await page.evaluate(() => window.t70PlayCalls)).toBe(0); expect(await page.evaluate(() => window.t70MicCalls)).toBe(0);
  expect(state.progressWrites).toEqual([]);
  await listen.click();
  await expect.poll(() => page.evaluate(() => window.t70PlayCalls)).toBe(1);
  await expect(listen).toHaveCount(0); await expect(go).toHaveCount(0);
  expect(await page.evaluate(() => window.t70MicCalls)).toBe(0);
  noGeneration(state);
});

test('C8-3 / F11.5: "continue" just closes the choice: no playback, no microphone, the same turn stays', async ({ page, context, baseURL }) => {
  const { state, main } = await setupLearning(page, context, baseURL, { extraTurn: true, progress: progressRecord({ page: 'practice', time: 8.2, turnIndex: 1 }) });
  await openLibrary(page); await openCourse(main);
  await panel(main).getByRole('button', { name: '直接继续', exact: true }).click();
  await expect(panel(main).getByRole('button', { name: '先听对方这句', exact: true })).toHaveCount(0);
  await expect(panel(main).getByTestId('practice-partner')).toHaveText('May I see your ID?');
  await expect(panel(main).getByRole('button', { name: '开始说', exact: true })).toBeEnabled();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.t70PlayCalls)).toBe(0); expect(await page.evaluate(() => window.t70MicCalls)).toBe(0);
  noGeneration(state);
});

// ---- C8-4: cancel a generation (F14.1) ----

async function routeCancel(page, state, next) {
  const cancels = [];
  await page.route('**/api/scene-generation/cancel', route => {
    const request = route.request();
    cancels.push({ method: request.method(), body: request.postDataJSON(), origin: request.headers()['origin'] });
    const key = `${ownerA}:${request.postDataJSON().requirementRevision}`;
    state.views[key] = next(state.views[key]);
    return route.fulfill({ json: state.views[key] });
  });
  return cancels;
}

test('C8-4 / F14.1: a task not yet started is cancelled with one request and shows "cancelled" after a reload too', async ({ page, context, baseURL }) => {
  const record = requirement();
  const state = await setupBrowser(page, context, baseURL, record);
  state.views[`${ownerA}:1`] = generationView(record, 't68-task-a', 'awaiting_budget');
  const cancels = await routeCancel(page, state, view => ({ ...view, phase: 'cancelled' }));
  await page.goto('/?generation=1');
  const main = page.getByRole('main');
  await expect(main.getByText('场景需求已保存，尚未开始生成。', { exact: true })).toBeVisible();
  await main.getByRole('button', { name: '取消生成', exact: true }).click();
  await expect(main.getByTestId('generation-cancelled')).toContainText('已取消');
  expect(cancels).toEqual([{ method: 'POST', body: { requirementRevision: 1 }, origin: new URL(baseURL).origin }]);
  await expect(main.getByRole('button', { name: '取消生成', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(main.getByTestId('generation-cancelled')).toContainText('已取消');
  expect(cancels).toHaveLength(1); expect(state.posts).toEqual([]);
});

test('C8-4 / F14.1: after a provider call, cancel first explains it cannot be withdrawn, then stops after the current step', async ({ page, context, baseURL }) => {
  const record = requirement();
  const state = await setupBrowser(page, context, baseURL, record);
  state.views[`${ownerA}:1`] = generationView(record, 't68-task-a', 'script_ready');
  const cancels = await routeCancel(page, state, view => ({ ...view, phase: 'stopped' }));
  await page.goto('/?generation=1');
  const main = page.getByRole('main');
  await expect(main.getByText('场景内容已准备，等待声音。', { exact: true })).toBeVisible();
  await main.getByRole('button', { name: '取消生成', exact: true }).click();
  const explain = main.getByTestId('generation-stop-explain');
  await expect(explain).toContainText('无法撤回');
  await expect(explain).toContainText('费用照记');
  expect(cancels).toEqual([]);
  await main.getByRole('button', { name: '继续生成', exact: true }).click();
  await expect(explain).toHaveCount(0);
  expect(cancels).toEqual([]);
  await main.getByRole('button', { name: '取消生成', exact: true }).click();
  await main.getByRole('button', { name: '当前步骤后停止', exact: true }).click();
  await expect(main.getByTestId('generation-stopped')).toContainText('已停止');
  await expect(main.getByTestId('generation-stopped')).toContainText('无法撤回');
  expect(cancels).toHaveLength(1);
  await expect(main.getByRole('button', { name: '取消生成', exact: true })).toHaveCount(0);
  expect(state.posts).toEqual([]);
});

test('C8-4 / F14.1: a ready scene has no cancel button', async ({ page, context, baseURL }) => {
  const { main } = await setupGuided(page, context, baseURL);
  await main.getByTestId('scene-back').click();
  await expect(main.getByRole('button', { name: '观看场景', exact: true })).toBeVisible();
  await expect(main.getByRole('button', { name: '取消生成', exact: true })).toHaveCount(0);
});

// ---- C8-5: think, pause, and pick a meaning (F7.5, F8.1, F8.2, F9.4) ----

test('C8-5 / F8.1: "let me think" holds automatic help for this turn', async ({ page, context, baseURL }) => {
  test.setTimeout(40_000);
  const bodies = await routePractice(page, [{ json: reply() }]);
  const { main } = await openPractice(page, context, baseURL);
  await openHelp(main);
  await panel(main).getByRole('button', { name: '我想一想', exact: true }).click();
  await expect(panel(main).getByTestId('practice-thinking')).toBeVisible();
  await page.waitForTimeout(9000);
  await expect(panel(main).getByTestId('practice-auto-help')).toHaveCount(0);
  await expect(panel(main).getByRole('button', { name: '开始说', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.t69MicCalls)).toBe(0);
  expect(bodies).toHaveLength(0);
});

test('C8-5 / F8.2: "pause" stops the partner while speaking and nothing resumes on its own', async ({ page, context, baseURL }) => {
  const { main } = await openPractice(page, context, baseURL);
  const video = main.locator('video');
  await expect.poll(() => video.evaluate(v => v.paused), { timeout: 5000 }).toBe(true);
  await panel(main).getByRole('button', { name: '慢一点再听', exact: true }).click();
  await expect.poll(() => video.evaluate(v => !v.paused)).toBe(true);
  await panel(main).getByRole('button', { name: '停一下', exact: true }).click();
  await expect.poll(() => video.evaluate(v => v.paused)).toBe(true);
  const stoppedAt = await video.evaluate(v => v.currentTime);
  expect(stoppedAt).toBeLessThan(first.end);
  await page.waitForTimeout(600);
  expect(await video.evaluate(v => v.paused)).toBe(true);
  expect(await video.evaluate(v => v.currentTime)).toBeCloseTo(stoppedAt, 1);
});

const distinctTwoTurns = course => {
  twoTurns(course);
  course.lines.find(line => line.id === 'line-3').translations = Object.fromEntries(Object.keys(second.translations).map(k => [k, k === 'zh-Hans' ? '给你。' : `synthetic ${k}`]));
};

test('C8-5 / F7.5: without speaking, the learner picks a meaning, sees and hears the English line, and the review says so', async ({ page, context, baseURL }) => {
  const bodies = await routePractice(page, [{ json: reply() }]);
  const { main } = await openPractice(page, context, baseURL, { changeCourse: distinctTwoTurns });
  const video = main.locator('video');
  await openHelp(main);
  await panel(main).getByRole('button', { name: '选意思', exact: true }).click();
  const meanings = panel(main).getByRole('group', { name: '你想说的是哪个意思？', exact: true });
  await expect(meanings.getByRole('button')).toHaveCount(2);
  await expect(meanings.getByRole('button', { name: second.translations['zh-Hans'], exact: true })).toBeVisible();
  await expect(meanings.getByRole('button', { name: '给你。', exact: true })).toBeVisible();
  await meanings.getByRole('button', { name: second.translations['zh-Hans'], exact: true }).click();
  const chosen = panel(main).getByTestId('practice-chosen');
  await expect(chosen).toContainText(second.text);
  await expect(chosen.locator('[lang="en"]')).toHaveText(second.text);
  await expect.poll(() => video.evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(second.start - 0.05);
  await panel(main).getByRole('button', { name: '下一回合', exact: true }).click();
  await expect(panel(main).getByTestId('practice-partner')).toHaveText('May I see your passport?');
  await openMore(main);
  await panel(main).getByRole('button', { name: '结束练习', exact: true }).click();
  const review = panel(main).getByTestId('practice-review');
  await expect(review).toContainText('第 1 回合：选了意思，未开口');
  await expect(review).toContainText('第 2 回合：没有开口，尚不能判断');
  await expect(review).not.toContainText('开口说了');
  expect(await page.evaluate(() => window.t69MicCalls)).toBe(0);
  expect(bodies).toHaveLength(0);
});

test('C8-5 / F7.5: picking another meaning shows its English and what this turn\'s answer in the scene was', async ({ page, context, baseURL }) => {
  const { main } = await openPractice(page, context, baseURL, { changeCourse: distinctTwoTurns });
  await openHelp(main);
  await panel(main).getByRole('button', { name: '选意思', exact: true }).click();
  await panel(main).getByRole('group', { name: '你想说的是哪个意思？', exact: true }).getByRole('button', { name: '给你。', exact: true }).click();
  const chosen = panel(main).getByTestId('practice-chosen');
  await expect(chosen).toContainText('Here you are.');
  await expect(chosen).toContainText(`这一回合场景里的回答是：${second.text}`);
});

// ---- C8-6: safety notes (F12.4, F3.5) ----

function clinicRequirement() {
  const record = hotelRequirement();
  record.content.description = '我想打电话给诊所，问能不能预约看医生。';
  record.content.keywords = { location: '诊所（电话）', learnerRole: '病人', partnerRole: '诊所接待员', topic: '预约看诊', goal: '约到合适的时间', special: '电话里看不到对方' };
  return record;
}

test('C8-6 / F12.4: a clinic scene says it is communication practice, not a medical conclusion; a hotel scene does not', async ({ page, context, baseURL }) => {
  const record = clinicRequirement();
  const { main } = await setupGuided(page, context, baseURL, { record, latest: record });
  await expect(main.getByTestId('scene-safety')).toHaveText('这是沟通练习，不是医疗或办事的真实结论。');
  await main.getByRole('button', { name: '进入角色学习', exact: true }).click();
  await expect(main.getByTestId('scene-safety')).toBeVisible();
});

test('C8-6 / F12.4: an ordinary hotel scene shows no medical or procedure note', async ({ page, context, baseURL }) => {
  const { main } = await setupGuided(page, context, baseURL);
  await expect(main.getByTestId('scene-play')).toBeVisible();
  await expect(main.getByTestId('scene-safety')).toHaveCount(0);
});

test('C8-6 / F3.5: the scene input page says real names, schools and ID numbers are not needed', async ({ page, context, baseURL }) => {
  await setupBrowser(page, context, baseURL);
  await page.goto('/');
  const main = page.getByRole('main');
  await expect(main.getByRole('textbox', { name: sceneTitle, exact: true })).toBeVisible();
  await expect(main.getByText('不必写真实姓名、学校或证件号。', { exact: true })).toBeVisible();
  await openMore(page); await page.getByRole('combobox').selectOption('id'); await closeMore(page);
  await expect(main.getByTestId('scene-privacy')).not.toHaveText('不必写真实姓名、学校或证件号。');
  await expect(main.getByTestId('scene-privacy')).not.toBeEmpty();
});

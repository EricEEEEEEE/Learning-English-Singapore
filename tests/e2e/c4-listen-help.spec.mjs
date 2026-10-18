import { test, expect } from '@playwright/test';
import { setupGuided, hotelSample, assertSameMedia } from '../fixtures/t69-guided-browser.mjs';
import { installMic, routePractice, openSentences, openPrompt, openPractice, panel, twoTurns, reply, mediaReady, trackTimes } from '../fixtures/c4-practice-browser.mjs';
import { openHelp, closeHelp, openMore } from '../fixtures/c10-shell.mjs';

// C4 (user 2026-10-17: finish the product before real video): listening controls, native-language help,
// proactive help after silence, and practice that survives a detour. Everything replays the same saved media;
// no generation, no model call, and the microphone is never opened on its own.
test.use({ locale: 'zh-CN' });
const [first, second] = hotelSample.lines;
const wraps = () => window.c4Times.reduce((n, t, i, all) => n + (i > 0 && all[i - 1] - t > 0.5 ? 1 : 0), 0);

// ---- T16A: slower playback, previous line, single-line loop, A-B loop ----

test('T16A / F6.5: slow playback keeps the pitch and can be switched back to normal speed', async ({ page, context, baseURL }) => {
  const { main, state } = await setupGuided(page, context, baseURL);
  const video = main.locator('video'); await mediaReady(video);
  const slow = main.getByRole('button', { name: '慢速', exact: true });
  await expect(slow).toHaveAttribute('aria-pressed', 'false');
  await slow.click();
  await expect(slow).toHaveAttribute('aria-pressed', 'true');
  await main.getByTestId('scene-play').click();
  await expect.poll(() => video.evaluate(v => !v.paused)).toBe(true);
  expect(await video.evaluate(v => [v.playbackRate, v.preservesPitch])).toEqual([0.75, true]);
  await slow.click();
  await expect(slow).toHaveAttribute('aria-pressed', 'false');
  expect(await video.evaluate(v => v.playbackRate)).toBe(1);
  assertSameMedia(state);
});

test('T16A / F6.2: "previous line" replays the line before the current one and stops at its end', async ({ page, context, baseURL }) => {
  const { main, state } = await setupGuided(page, context, baseURL);
  const video = main.locator('video'); await mediaReady(video);
  await main.getByTestId('scene-play').click();
  await expect.poll(() => video.evaluate(v => v.currentTime), { timeout: 10_000 }).toBeGreaterThan(second.start + 0.2);
  await main.getByRole('button', { name: '上一句', exact: true }).click();
  await expect(main.getByTestId('scene-caption')).toHaveText(first.text);
  await expect.poll(() => video.evaluate(v => v.paused), { timeout: 5000 }).toBe(true);
  const time = await video.evaluate(v => v.currentTime);
  expect(time).toBeGreaterThanOrEqual(first.end - 0.1);
  expect(time).toBeLessThanOrEqual(first.end + 0.1);
  assertSameMedia(state);
});

test('T16A / F6.5: one sentence loops until the learner stops it', async ({ page, context, baseURL }) => {
  test.setTimeout(40_000);
  const { main, state } = await openSentences(page, context, baseURL);
  const video = main.locator('video'); await mediaReady(video); await trackTimes(video);
  // The loop control sits beside, not inside, each sentence card: older pages press the card's only button.
  const loop = main.getByRole('button', { name: `循环这句：${first.text}`, exact: true });
  await expect(loop).toHaveAttribute('aria-pressed', 'false');
  await loop.click();
  await expect(loop).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(wraps), { timeout: 12_000 }).toBeGreaterThanOrEqual(2);
  expect(await video.evaluate(v => v.paused)).toBe(false);
  const times = await page.evaluate(() => window.c4Times);
  expect(Math.max(...times)).toBeLessThanOrEqual(first.end + 0.15);
  expect(Math.min(...times.slice(1))).toBeGreaterThanOrEqual(first.start - 0.05);
  await loop.click();
  await expect(loop).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => video.evaluate(v => v.paused)).toBe(true);
  assertSameMedia(state);
});

test('T16A / F6.5: an A-B loop plays from the start of sentence A to the end of sentence B and starts again', async ({ page, context, baseURL }) => {
  test.setTimeout(40_000);
  const { main, state } = await openSentences(page, context, baseURL);
  const video = main.locator('video'); await mediaReady(video); await trackTimes(video);
  // C11-1: the A-B loop lives in "more → practice tools" on the sentences page.
  await openMore(main);
  const a = main.getByLabel('A：从这句开始', { exact: true }), b = main.getByLabel('B：到这句结束', { exact: true });
  const ab = main.getByRole('button', { name: 'A-B 循环', exact: true });
  await a.selectOption({ label: second.text }); await b.selectOption({ label: first.text });
  await expect(ab).toBeDisabled();
  await a.selectOption({ label: first.text }); await b.selectOption({ label: second.text });
  await expect(ab).toBeEnabled();
  await ab.click();
  await expect(ab).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(wraps), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  const times = await page.evaluate(() => window.c4Times);
  expect(Math.max(...times)).toBeGreaterThanOrEqual(second.end - 0.3);
  expect(Math.max(...times)).toBeLessThanOrEqual(second.end + 0.15);
  expect(Math.min(...times.slice(1))).toBeGreaterThanOrEqual(first.start - 0.05);
  await ab.click();
  await expect.poll(() => video.evaluate(v => v.paused)).toBe(true);
  assertSameMedia(state);
});

// ---- T20A: hideable subtitles and native-language help ----

test('T20A / F5.5: subtitles can be hidden and shown again without stopping the scene', async ({ page, context, baseURL }) => {
  const { main } = await setupGuided(page, context, baseURL);
  await expect(main.getByTestId('scene-caption')).toBeVisible();
  await main.getByRole('button', { name: '收起字幕', exact: true }).click();
  await expect(main.getByTestId('scene-caption')).toBeHidden();
  await main.getByRole('button', { name: '显示字幕', exact: true }).click();
  await expect(main.getByTestId('scene-caption')).toBeVisible();
});

test('T20A / F5.1: "help me understand" shows what the partner said in the learner language, then folds away', async ({ page, context, baseURL }) => {
  const { main, state } = await openPrompt(page, context, baseURL);
  const area = main.getByTestId('scene-panel-4');
  await expect(area).not.toContainText(first.translations['zh-Hans']);
  await area.getByRole('button', { name: '帮我理解', exact: true }).click();
  await expect(area.getByTestId('partner-help')).toHaveText(first.translations['zh-Hans']);
  await expect(area.getByTestId('partner-help')).toHaveAttribute('lang', 'zh-Hans');
  await area.getByRole('button', { name: '收起解释', exact: true }).click();
  await expect(area.getByTestId('partner-help')).toHaveCount(0);
  assertSameMedia(state);
});

test('T20A / F5.2: the practice page offers the same native-language help without opening the microphone', async ({ page, context, baseURL }) => {
  const bodies = await routePractice(page, [{ json: reply() }]);
  const { main } = await openPractice(page, context, baseURL);
  await panel(main).getByRole('button', { name: '帮我理解', exact: true }).click();
  await expect(panel(main).getByTestId('partner-help')).toHaveText(first.translations['zh-Hans']);
  expect(await page.evaluate(() => window.t69MicCalls)).toBe(0);
  expect(bodies).toHaveLength(0);
});

// ---- T18A: proactive help after silence ----

test('T18A / F7.3: after the partner finishes and the learner stays quiet, help comes in two steps', async ({ page, context, baseURL }) => {
  test.setTimeout(45_000);
  const bodies = await routePractice(page, [{ json: reply() }]);
  const { main } = await openPractice(page, context, baseURL);
  const help = panel(main).getByTestId('practice-auto-help');
  await page.waitForTimeout(4000);
  await expect(help).toHaveCount(0);
  await expect(help).toContainText('需要帮忙吗？可以这样开头：', { timeout: 10_000 });
  await expect(help).toContainText('Yes. I booked…');
  await expect(help).not.toContainText(second.text);
  await expect(help).toContainText(`可以这样说：${second.text}`, { timeout: 10_000 });
  await help.getByRole('button', { name: '听示范', exact: true }).click();
  const video = main.locator('video');
  await expect.poll(() => video.evaluate(v => !v.paused)).toBe(true);
  expect(await video.evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(second.start);
  expect(await page.evaluate(() => window.t69MicCalls)).toBe(0);
  expect(bodies).toHaveLength(0);
});

test('T18A / F8.4: proactive help can be switched off, stays off, and manual hints still work', async ({ page, context, baseURL }) => {
  test.setTimeout(45_000);
  const { main } = await openPractice(page, context, baseURL);
  const toggle = panel(main).getByRole('checkbox', { name: '我没开口时主动给提示', exact: true });
  await openHelp(main);
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await closeHelp(main);
  await page.waitForTimeout(9000);
  await expect(panel(main).getByTestId('practice-auto-help')).toHaveCount(0);
  await panel(main).getByRole('button', { name: '需要提示', exact: true }).click();
  await expect(main.getByTestId('scene-answer')).toHaveText(second.text);
  await main.getByRole('button', { name: '下一步：开口对练', exact: true }).click();
  await openHelp(main);
  await expect(panel(main).getByRole('checkbox', { name: '我没开口时主动给提示', exact: true })).not.toBeChecked();
});

test('T18A / F8.1: once the learner starts speaking no help interrupts them', async ({ page, context, baseURL }) => {
  test.setTimeout(45_000);
  await routePractice(page, [{ json: reply() }]);
  const { main } = await openPractice(page, context, baseURL);
  await installMic(page);
  await panel(main).getByRole('button', { name: '开始说', exact: true }).click();
  await expect(panel(main).getByText('正在听你说…', { exact: true })).toBeVisible();
  await page.waitForTimeout(9000);
  await expect(panel(main).getByTestId('practice-auto-help')).toHaveCount(0);
});

test('T18A / F7.3: "slower, please" replays the partner line at a slower speed', async ({ page, context, baseURL }) => {
  const { main } = await openPractice(page, context, baseURL);
  const video = main.locator('video');
  await expect.poll(() => video.evaluate(v => v.paused), { timeout: 5000 }).toBe(true);
  await panel(main).getByRole('button', { name: '慢一点再听', exact: true }).click();
  await expect.poll(() => video.evaluate(v => !v.paused)).toBe(true);
  expect(await video.evaluate(v => [v.playbackRate, v.preservesPitch])).toEqual([0.75, true]);
  expect(await video.evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(first.start);
  expect(await video.evaluate(v => v.currentTime)).toBeLessThan(first.end + 0.1);
});

// ---- T22A: practice survives a detour; going to the background ends the recording ----

test('T22A / F11.2: checking the hint and coming back keeps the earlier exchange and its history', async ({ page, context, baseURL }) => {
  const bodies = await routePractice(page, [{ json: reply() }, { json: reply({ transcript: 'Here you are.', reply: { text: 'Thank you.', audioBase64: reply().reply.audioBase64, mimeType: 'audio/wav' } }) }]);
  const { main } = await openPractice(page, context, baseURL, { changeCourse: twoTurns });
  await installMic(page);
  await panel(main).getByRole('button', { name: '开始说', exact: true }).click();
  await panel(main).getByRole('button', { name: '说完了', exact: true }).click();
  await expect(panel(main).getByTestId('practice-reply')).toHaveText('Great. May I see your passport?');
  await panel(main).getByRole('button', { name: '需要提示', exact: true }).click();
  await main.getByRole('button', { name: '下一步：开口对练', exact: true }).click();
  await expect(panel(main).getByTestId('practice-reply')).toHaveText('Great. May I see your passport?');
  await panel(main).getByRole('button', { name: '下一回合', exact: true }).click();
  await panel(main).getByRole('button', { name: '开始说', exact: true }).click();
  await panel(main).getByRole('button', { name: '说完了', exact: true }).click();
  await expect(panel(main).getByTestId('practice-reply')).toHaveText('Thank you.');
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toMatchObject({ turnIndex: 1, history: [{ learner: 'Yes, I booked a room.', partner: 'Great. May I see your passport?' }] });
});

test('T22A / F14.2: leaving the page while recording stops the microphone and sends nothing', async ({ page, context, baseURL }) => {
  const bodies = await routePractice(page, [{ json: reply() }]);
  const { main } = await openPractice(page, context, baseURL);
  await installMic(page);
  await panel(main).getByRole('button', { name: '开始说', exact: true }).click();
  await expect(panel(main).getByText('正在听你说…', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(panel(main).getByText('录音已停止，没有发送。准备好可以再说一次。', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.t63Stopped)).toBe(1);
  await page.waitForTimeout(300);
  expect(bodies).toHaveLength(0);
  await expect(panel(main).getByRole('button', { name: '开始说', exact: true })).toBeEnabled();
});

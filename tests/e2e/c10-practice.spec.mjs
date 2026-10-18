import { test, expect } from '@playwright/test';
import { installMic, routePractice, openPractice, panel, twoTurns, reply, replyWav } from '../fixtures/c4-practice-browser.mjs';
import { setupGuided, hotelRequirement, hotelSample } from '../fixtures/t69-guided-browser.mjs';
import { routeReviews, speak } from '../fixtures/c9-practice-browser.mjs';
import { setupLearning, openLibrary, openCourse, progressRecord } from '../fixtures/t70-learning-browser.mjs';
import { openMore, closeMore, openHelp, closeHelp, moreButton, helpButton, helpSheet, moreSheet, setupSheet, startPracticeSetup } from '../fixtures/c10-shell.mjs';

// C10-3 / C10-4 (user 2026-10-18: "still not simple enough"): the practice page shows one microphone and keeps
// help one tap away. The first-turn settings, ending and leaving move into sheets; resuming asks in a sheet.
// Replies come from an in-memory route and the microphone is a synthetic stub: nothing here calls a model.
test.use({ locale: 'zh-CN' });
const [first] = hotelSample.lines;
const preferences = 'le-sg-entry-preferences-v1';
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const primary = page => page.locator('.btn-primary:visible, .mic-btn:visible');
// Every control a learner can see at once on the practice page (closed sheets are not visible).
const visibleControls = page => page.locator('button:visible, input:visible, select:visible, textarea:visible, a[href]:visible, summary:visible');

test('C10-3 / F13.1: the practice page shows one big microphone, at most eight controls and help one tap away', async ({ page, context, baseURL }) => {
  const { main } = await openPractice(page, context, baseURL);
  await expect(panel(main).getByTestId('practice-partner')).toHaveText(first.text);
  expect(await visibleControls(page).count()).toBeLessThanOrEqual(8);
  await expect(primary(page)).toHaveCount(1);
  const mic = panel(main).getByRole('button', { name: '开始说', exact: true });
  await expect(mic).toHaveClass(/mic-btn/);
  const box = await mic.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(72 - 0.5); expect(box.height).toBeGreaterThanOrEqual(72 - 0.5);
  const bar = panel(main).getByTestId('action-bar');
  await expect(bar.getByRole('button', { name: '需要提示', exact: true })).toBeVisible();
  await expect(bar.getByRole('button', { name: '开始说', exact: true })).toBeVisible();
  await expect(bar.getByRole('button', { name: '更多帮助', exact: true })).toBeVisible();
  await expect(panel(main).getByTestId('practice-tip')).toHaveText('不会说？点“需要提示”。');
  // Partner tools sit right under the partner's bubble, with names.
  for (const name of ['重听对方', '慢一点再听', '帮我理解']) await expect(panel(main).getByRole('button', { name, exact: true })).toBeVisible();
  // The video takes at most 40% of the screen height.
  const video = await main.locator('video').boundingBox();
  expect(video.height).toBeLessThanOrEqual(page.viewportSize().height * 0.4 + 1);
  // Help, settings, ending and leaving are not on the page until asked for.
  for (const name of ['用母语说', '选意思', '我想一想', '结束练习', '重看场景']) await expect(main.getByRole('button', { name, exact: true })).toHaveCount(0);
  await expect(main.getByTestId('scene-back')).toBeHidden();
  await expect(main.getByRole('group', { name: '这次想多练什么', exact: true })).toHaveCount(0);
  expect(await noOverflow(page)).toBe(true);
  // The reply audio is never a native control strip.
  await expect(main.locator('audio[controls]')).toHaveCount(0);
});

test('C10-3 / F7.5, F8.1, F8.2: "say it in my language", "pick a meaning" and "let me think" are one tap inside "more help"', async ({ page, context, baseURL }) => {
  const { main } = await openPractice(page, context, baseURL);
  const button = helpButton(page);
  await expect(button).toHaveAttribute('aria-haspopup', 'dialog');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  const sheet = await openHelp(main);
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  expect(await sheet.evaluate(d => d.tagName === 'DIALOG' && d.matches(':modal'))).toBe(true);
  for (const name of ['用母语说', '选意思', '我想一想']) await expect(sheet.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(sheet.getByRole('checkbox', { name: '我没开口时主动给提示', exact: true })).toBeChecked();
  await expect(page.locator('dialog [role="status"], dialog [role="alert"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(helpSheet(page)).toHaveCount(0);
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await openHelp(main);
  await page.mouse.click(4, 4);
  await expect(helpSheet(page)).toHaveCount(0);
  await expect(button).toBeFocused();
  // One tap after opening: the action happens and the sheet gets out of the way.
  await (await openHelp(main)).getByRole('button', { name: '我想一想', exact: true }).click();
  await expect(helpSheet(page)).toHaveCount(0);
  await expect(panel(main).getByTestId('practice-thinking')).toBeVisible();
  await (await openHelp(main)).getByRole('button', { name: '选意思', exact: true }).click();
  await expect(helpSheet(page)).toHaveCount(0);
  await expect(panel(main).getByRole('group', { name: '你想说的是哪个意思？', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.t69MicCalls)).toBe(0);
});

test('C10-4 / F8.5, F9.4: "more" on the practice page holds the settings, ending, watching again and leaving', async ({ page, context, baseURL }) => {
  const { main } = await openPractice(page, context, baseURL);
  const button = moreButton(page);
  await expect(button).toHaveAttribute('aria-haspopup', 'dialog');
  const sheet = await openMore(main);
  const focus = sheet.getByRole('group', { name: '这次想多练什么', exact: true });
  await expect(focus.getByRole('radio')).toHaveCount(4);
  await expect(focus).toHaveClass(/segmented/);
  await expect(sheet.getByRole('group', { name: '纠正多少', exact: true }).getByRole('radio', { name: '正常', exact: true })).toBeChecked();
  for (const name of ['结束练习', '重看场景']) await expect(sheet.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(sheet.getByTestId('scene-back')).toBeVisible();
  await expect(sheet.getByRole('checkbox', { name: '大字号', exact: true })).toBeVisible();
  await expect(page.locator('dialog [role="status"], dialog [role="alert"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(moreSheet(page)).toHaveCount(0);
  await expect(button).toBeFocused();
  const again = await openMore(main);
  await again.getByRole('button', { name: '重看场景', exact: true }).click();
  await expect(main.getByRole('heading', { name: '看一遍这个场景', exact: true })).toBeVisible();
});

test('C10-3 / F8.3: after a reply the one primary becomes "next turn"; the reply plays from a small ▶ button', async ({ page, context, baseURL }) => {
  await routePractice(page, [{ json: reply() }]);
  const { main } = await openPractice(page, context, baseURL, { changeCourse: twoTurns });
  await installMic(page);
  await panel(main).getByRole('button', { name: '开始说', exact: true }).click();
  const done = panel(main).getByRole('button', { name: '说完了', exact: true });
  await expect(done).toHaveClass(/mic-btn/);
  await expect(primary(page)).toHaveCount(1);
  await done.click();
  await expect(panel(main).getByTestId('practice-reply')).toHaveText('Great. May I see your passport?');
  const next = panel(main).getByRole('button', { name: '下一回合', exact: true });
  await expect(next).toHaveClass(/btn-primary/);
  await expect(primary(page)).toHaveCount(1);
  await expect(panel(main).getByRole('button', { name: '开始说', exact: true })).toBeEnabled();
  const audio = panel(main).getByTestId('practice-reply-audio');
  await expect(audio).toHaveAttribute('src', `data:audio/wav;base64,${replyWav}`);
  expect(await audio.evaluate(a => a.controls)).toBe(false);
  await expect(audio).toBeHidden();
  await page.evaluate(() => { window.c10Plays = 0; HTMLAudioElement.prototype.play = function () { window.c10Plays++; return Promise.resolve(); }; });
  await panel(main).getByRole('button', { name: '再听回应', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.c10Plays)).toBe(1);
  await expect(panel(main).getByTestId('practice-tip')).toHaveCount(0);
  expect(await noOverflow(page)).toBe(true);
  // Bubbles are not cards inside cards and carry no shadow.
  expect(await page.evaluate(() => [...document.querySelectorAll('[data-testid="scene-panel-5"] *')].filter(el => getComputedStyle(el).boxShadow !== 'none' && !el.closest('dialog, [data-testid="action-bar"]')).length)).toBe(0);
  await next.click();
  await expect(panel(main).getByTestId('practice-partner')).toHaveText('May I see your passport?');
  await expect(primary(page)).toHaveCount(1);
  await expect(primary(page)).toHaveAccessibleName('开始说');
});

test('C10-3 / F13.2: with reduced motion the recording ring does not move', async ({ page, context, baseURL }) => {
  await context.addInitScript(key => localStorage.setItem(key, JSON.stringify({ language: 'zh-Hans', largeText: false, reducedMotion: true })), preferences);
  const { main } = await openPractice(page, context, baseURL);
  await installMic(page);
  await panel(main).getByRole('button', { name: '开始说', exact: true }).click();
  const ring = panel(main).locator('.mic-ring');
  await expect(ring).toHaveCount(1);
  expect(await ring.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  const done = panel(main).getByRole('button', { name: '说完了', exact: true });
  await done.hover(); await page.mouse.down();
  expect(await done.evaluate(b => getComputedStyle(b).transform)).toBe('none');
  await page.mouse.up();
});

test('C10-3: without reduced motion the recording ring is animated', async ({ page, context, baseURL }) => {
  const { main } = await openPractice(page, context, baseURL);
  await installMic(page);
  await panel(main).getByRole('button', { name: '开始说', exact: true }).click();
  await expect(panel(main).getByRole('button', { name: '说完了', exact: true })).toBeVisible();
  expect(await panel(main).locator('.mic-ring').evaluate(el => getComputedStyle(el).animationName)).not.toBe('none');
});

test('C10-4 / F9.4: before the first turn the settings are asked once in a sheet; defaults send nothing extra', async ({ page, context, baseURL }) => {
  const bodies = await routePractice(page, [{ json: reply() }]);
  const { main } = await openPractice(page, context, baseURL, { keepSetup: true });
  const sheet = setupSheet(page);
  await expect(sheet).toBeVisible();
  expect(await sheet.evaluate(d => d.matches(':modal'))).toBe(true);
  await expect(sheet.getByRole('group', { name: '这次想多练什么', exact: true }).getByRole('radio', { name: '正常练', exact: true })).toBeChecked();
  await expect(sheet.getByRole('group', { name: '纠正多少', exact: true }).getByRole('radio', { name: '正常', exact: true })).toBeChecked();
  await expect(sheet.getByTestId('practice-setup-start')).toHaveAccessibleName('开始对练');
  await expect(page.locator('dialog [role="status"], dialog [role="alert"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.t69MicCalls)).toBe(0);
  await startPracticeSetup(main);
  await expect(panel(main).getByRole('button', { name: '开始说', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.t69MicCalls)).toBe(0);
  await installMic(page);
  await speak(panel(main));
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0]).not.toHaveProperty('focus');
  expect(bodies[0]).not.toHaveProperty('correction');
  // Asked only once: a detour to the hint page and back does not ask again; the settings are now in "more".
  await panel(main).getByRole('button', { name: '需要提示', exact: true }).click();
  await main.getByRole('button', { name: '下一步：开口对练', exact: true }).click();
  await expect(panel(main)).toBeVisible();
  await page.waitForTimeout(300);
  await expect(setupSheet(page)).toHaveCount(0);
  const more = await openMore(main);
  await expect(more.getByRole('group', { name: '纠正多少', exact: true })).toBeVisible();
});

test('C10-4 / F8.5: choices made in the first-turn sheet are sent and "less correction" is kept under its old key', async ({ page, context, baseURL }) => {
  const bodies = await routePractice(page, [{ json: reply() }]);
  const { main } = await openPractice(page, context, baseURL, { keepSetup: true });
  const sheet = setupSheet(page);
  await sheet.getByRole('radio', { name: '多练拒绝和改主意', exact: true }).check();
  await sheet.getByRole('radio', { name: '少纠正', exact: true }).check();
  await startPracticeSetup(main);
  expect(await page.evaluate(() => localStorage.getItem('les.practice.correction'))).toBe('less');
  await installMic(page);
  await speak(panel(main));
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0]).toMatchObject({ focus: 'refusal', correction: 'less' });
  const more = await openMore(main);
  await expect(more.getByRole('radio', { name: '多练拒绝和改主意', exact: true })).toBeChecked();
  await expect(more.getByRole('radio', { name: '少纠正', exact: true })).toBeChecked();
});

test('C10-4 / F11.5: after a reload "listen first / continue" comes as a sheet and the microphone stays closed', async ({ page, context, baseURL }) => {
  const { main } = await setupLearning(page, context, baseURL, { extraTurn: true, progress: progressRecord({ page: 'practice', time: 8.2, turnIndex: 1 }) });
  await openLibrary(page); await openCourse(main);
  const resume = page.locator('dialog[open] [data-testid="practice-resume"]');
  await expect(resume).toBeVisible();
  expect(await resume.evaluate(el => el.closest('dialog').matches(':modal'))).toBe(true);
  await expect(resume.getByRole('button', { name: '先听对方这句', exact: true })).toBeVisible();
  await expect(resume.getByRole('button', { name: '直接继续', exact: true })).toBeVisible();
  await expect(setupSheet(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.t70MicCalls)).toBe(0);
  await resume.getByRole('button', { name: '直接继续', exact: true }).click();
  await expect(page.locator('dialog[open] [data-testid="practice-resume"]')).toHaveCount(0);
  await expect(panel(main).getByTestId('practice-partner')).toHaveText('May I see your ID?');
  await expect(panel(main).getByRole('button', { name: '开始说', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.t70MicCalls)).toBe(0);
});

test('C10-4 / F10.1: ending from "more" saves the review exactly once and closes the sheet', async ({ page, context, baseURL }) => {
  const reviews = await routeReviews(page, baseURL);
  const { main } = await openPractice(page, context, baseURL);
  const sheet = await openMore(main);
  await sheet.getByRole('button', { name: '结束练习', exact: true }).click();
  await expect(moreSheet(page)).toHaveCount(0);
  await expect(panel(main).getByTestId('practice-ending')).toBeVisible();
  await expect.poll(() => reviews.posts.length).toBe(1);
  await page.waitForTimeout(800);
  expect(reviews.posts).toHaveLength(1);
  await expect(primary(page)).toHaveCount(1);
  await expect(primary(page)).toHaveAccessibleName('再练一次');
});

test('C10-3 / F13.2: large text on a small phone keeps the practice page and its sheets inside the screen', async ({ page, context, baseURL }) => {
  await context.addInitScript(key => localStorage.setItem(key, JSON.stringify({ language: 'zh-Hans', largeText: true, reducedMotion: false })), preferences);
  const { main } = await openPractice(page, context, baseURL, { keepSetup: true });
  const check = async () => {
    expect(await noOverflow(page)).toBe(true);
    const width = page.viewportSize().width;
    for (const control of await visibleControls(page).all()) {
      const box = await control.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(-0.5);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
    }
  };
  await check();
  await startPracticeSetup(main);
  await check();
  const bar = await panel(main).getByTestId('action-bar').boundingBox();
  expect(bar.y + bar.height).toBeLessThanOrEqual(page.viewportSize().height + 0.5);
  await openHelp(main); await check(); await closeHelp(main);
  await openMore(main); await check(); await closeMore(main);
});

const practiceNames = { id: { enter: 'Berikutnya: latihan bicara', start: 'Mulai bicara' }, hi: { enter: 'आगे: बोलकर अभ्यास', start: 'बोलना शुरू करें' } };
for (const language of ['id', 'hi']) test(`C10-3 / F13.2: ${language} practice page labels are in that language and fit at large text`, async ({ page, context, baseURL }) => {
  const { shellCopy } = await import('../../app/shell-copy.ts');
  const { guidedSceneCopy } = await import('../../app/guided-scene-copy.ts');
  await context.addInitScript(key => localStorage.setItem(key, JSON.stringify({ language: 'zh-Hans', largeText: true, reducedMotion: false })), preferences);
  const { main } = await setupGuided(page, context, baseURL, { record: hotelRequirement(language) });
  const guide = guidedSceneCopy[language];
  for (const name of [guide.enter, guide.start, guide.nextSentence, guide.nextPrompt, practiceNames[language].enter]) await main.getByRole('button', { name, exact: true }).click();
  await startPracticeSetup(main);
  const bar = panel(main).getByTestId('action-bar');
  await expect(bar.getByRole('button', { name: shellCopy[language].moreHelp, exact: true })).toBeVisible();
  await expect(bar.getByRole('button', { name: practiceNames[language].start, exact: true })).toBeVisible();
  await expect(moreButton(page)).toHaveAccessibleName(shellCopy[language].more);
  expect(shellCopy[language].moreHelp).not.toBe(shellCopy['zh-Hans'].moreHelp);
  expect(await noOverflow(page)).toBe(true);
  for (const control of await visibleControls(page).all()) {
    const box = await control.boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width + 0.5);
  }
});

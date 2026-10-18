import { test, expect } from '@playwright/test';
import { setupGuided, enterRole, enterTerms, hotelSample, assertSameMedia } from '../fixtures/t69-guided-browser.mjs';
import { openSentences, openPrompt, openPractice, panel, twoTurns, mediaReady } from '../fixtures/c4-practice-browser.mjs';
import { openMore, closeMore } from '../fixtures/c10-shell.mjs';
import { revealAnswer, actionButtons, finishWatching } from '../fixtures/c11-shell.mjs';

// C11-1 / C11-2 (user 2026-10-18: "the whole front end is not good-looking and still not simple enough"):
// watching gets one row of icon tools under the video, the role page two cards and one button, and the three
// learning pages a step bar, one "next" each, sentence cards with icon tools and a chat-style prompt page.
// Every route is answered in memory; nothing here generates a scene or calls a model.
test.use({ locale: 'zh-CN' });
const [first, second] = hotelSample.lines;
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const primaries = page => page.locator('.btn-primary:visible');
const centerY = box => box.y + box.height / 2;

// ---- C11-1: watching ----

test('C11-1 / K4.3: the video sits on top, the English caption under it, then one row of icon tools seen without scrolling', async ({ page, context, baseURL }) => {
  const { main, state } = await setupGuided(page, context, baseURL);
  await expect(main.getByRole('heading', { name: '看一遍这个场景', exact: true })).toBeVisible();
  const video = main.locator('video'); await mediaReady(video);
  const tools = main.getByTestId('watch-tools');
  await expect(tools).toBeVisible();
  const videoBox = await video.boundingBox(), captionBox = await main.getByTestId('scene-caption').boundingBox(), toolsBox = await tools.boundingBox();
  expect(videoBox.y + videoBox.height).toBeLessThanOrEqual(captionBox.y + 1);
  expect(captionBox.y + captionBox.height).toBeLessThanOrEqual(toolsBox.y + 1);
  expect(await video.evaluate(v => getComputedStyle(v).borderTopLeftRadius)).toBe('12px');
  // The whole row is above the bottom bar on first view: nothing to scroll for.
  const bar = await page.getByTestId('action-bar').boundingBox();
  expect(toolsBox.y + toolsBox.height).toBeLessThanOrEqual(bar.y + 1);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  // Previous, replay, play, next, captions and 0.75×: names unchanged, each with a short visible label.
  for (const name of ['上一句', '从头重听', '播放', '下一句', '收起字幕', '慢速']) await expect(tools.getByRole('button', { name, exact: true })).toBeVisible();
  const play = tools.getByTestId('scene-play');
  const playBox = await play.boundingBox();
  expect(playBox.width).toBeCloseTo(56, 0); expect(playBox.height).toBeCloseTo(56, 0);
  expect(await play.evaluate(b => getComputedStyle(b).borderTopLeftRadius)).toBe('50%');
  for (const button of await tools.getByRole('button').all()) {
    const box = await button.boundingBox();
    expect(Math.abs(centerY(box) - centerY(playBox))).toBeLessThanOrEqual(12);
    expect((await button.innerText()).trim().length).toBeGreaterThan(0);
  }
  await expect(tools.getByRole('button', { name: '慢速', exact: true })).toContainText('0.75×');
  expect(await noOverflow(page)).toBe(true);
  assertSameMedia(state);
});

test('C11-1 / K4.3: the first viewing shows English only; no line or phrase translation is anywhere on the page', async ({ page, context, baseURL }) => {
  const { main } = await setupGuided(page, context, baseURL);
  const video = main.locator('video'); await mediaReady(video);
  await main.getByTestId('scene-play').click();
  await video.evaluate(v => { v.currentTime = 1.2; v.dispatchEvent(new Event('timeupdate')); });
  await expect(main.getByTestId('scene-caption')).toHaveText(first.text);
  for (const item of [...hotelSample.lines, ...hotelSample.phrases]) await expect(page.locator('body')).not.toContainText(item.translations['zh-Hans']);
});

test('C11-1 / K4.3, K5.1: before the end the play circle is the one primary; at the end "进入角色学习" becomes it, and early continue still works', async ({ page, context, baseURL }) => {
  const { main } = await setupGuided(page, context, baseURL);
  const enter = page.getByTestId('action-bar').getByRole('button', { name: '进入角色学习', exact: true });
  await expect(enter).toBeVisible(); await expect(enter).toBeEnabled();
  await expect(enter).not.toHaveClass(/btn-primary/);
  await expect(primaries(page)).toHaveCount(1);
  await expect(primaries(page)).toHaveAttribute('data-testid', 'scene-play');
  await finishWatching(main);
  await expect(main.getByText('场景看完了。可以重播，或进入角色学习。', { exact: true })).toBeVisible();
  await expect(enter).toHaveClass(/btn-primary/);
  await expect(primaries(page)).toHaveCount(1);
  await expect(main.getByTestId('scene-play')).not.toHaveClass(/btn-primary/);
  await enterRole(main);
  await expect(main.getByRole('heading', { name: '现在轮到你', exact: true })).toBeVisible();
});

test('C11-1 / F6.2: "next line" plays the following line and stops at its end', async ({ page, context, baseURL }) => {
  const { main, state } = await setupGuided(page, context, baseURL);
  const video = main.locator('video'); await mediaReady(video);
  await video.evaluate((v, time) => { v.currentTime = time; v.dispatchEvent(new Event('timeupdate')); }, first.start + 0.2);
  await main.getByRole('button', { name: '下一句', exact: true }).click();
  await expect(main.getByTestId('scene-caption')).toHaveText(second.text);
  await expect.poll(() => video.evaluate(v => v.paused), { timeout: 6000 }).toBe(true);
  const time = await video.evaluate(v => v.currentTime);
  expect(time).toBeGreaterThanOrEqual(second.end - 0.1);
  expect(time).toBeLessThanOrEqual(second.end + 0.1);
  assertSameMedia(state);
});

test('C11-1 / F6.5: the A-B loop moves into "more → practice tools" on the sentences page and is not on the page itself', async ({ page, context, baseURL }) => {
  const { main } = await openSentences(page, context, baseURL);
  await expect(main.getByTestId('scene-sentence').first()).toBeVisible();
  await expect(main.getByLabel('A：从这句开始', { exact: true })).toBeHidden();
  await expect(main.getByRole('button', { name: 'A-B 循环', exact: true })).toHaveCount(0);
  const sheet = await openMore(main);
  await expect(sheet.getByRole('heading', { name: '练习工具', exact: true })).toBeVisible();
  await expect(sheet.getByLabel('A：从这句开始', { exact: true })).toBeVisible();
  await expect(sheet.getByLabel('B：到这句结束', { exact: true })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'A-B 循环', exact: true })).toBeVisible();
  await expect(sheet.getByRole('button', { name: '慢速', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await closeMore(main);
});

test('C11-1 / K5.1: the role page shows two role cards and only "开始学词组" in the bottom bar; going back is the ‹ in the top bar', async ({ page, context, baseURL }) => {
  const { main } = await setupGuided(page, context, baseURL);
  await enterRole(main);
  for (const id of ['scene-learner-role', 'scene-partner-role']) {
    const card = main.getByTestId(id);
    await expect(card).toBeVisible();
    await expect(card.locator('.role-avatar')).toBeVisible();
  }
  await expect(actionButtons(page)).toHaveCount(1);
  await expect(actionButtons(page)).toHaveText('开始学词组');
  await expect(actionButtons(page)).toHaveClass(/btn-primary/);
  await page.getByTestId('app-bar').getByRole('button', { name: '重看场景', exact: true }).click();
  await expect(main.getByRole('heading', { name: '看一遍这个场景', exact: true })).toBeVisible();
});

// ---- C11-2: step bar, terms, sentences, prompt ----

test('C11-2 / K5.2: a four-part step bar replaces the step buttons and marks the current step with aria-current', async ({ page, context, baseURL }) => {
  const { main } = await setupGuided(page, context, baseURL);
  await enterTerms(main);
  const bar = main.getByTestId('step-bar');
  await expect(bar).toBeVisible();
  await expect(bar.getByRole('listitem')).toHaveText(['词组', '句子', '接话', '对练']);
  const current = bar.locator('[aria-current="step"]');
  await expect(current).toHaveCount(1); await expect(current).toHaveText('词组');
  await expect(main.locator('[data-testid^="scene-step-"]')).toHaveCount(0);
  await main.getByRole('button', { name: '下一步：句子', exact: true }).click();
  await expect(current).toHaveText('句子');
  await main.getByRole('button', { name: '下一步：提示接话', exact: true }).click();
  await expect(current).toHaveText('接话');
  await main.getByRole('button', { name: '下一步：开口对练', exact: true }).click();
  await expect(current).toHaveText('对练');
  await expect(bar.locator('[aria-current]')).toHaveCount(1);
  expect(await noOverflow(page)).toBe(true);
});

test('C11-2 / K5.2: every learning page has one "next" in the bottom bar; "previous" is the ‹ in the top bar', async ({ page, context, baseURL }) => {
  const { main } = await setupGuided(page, context, baseURL);
  await enterTerms(main);
  const appBar = page.getByTestId('app-bar');
  for (const [next, back, heading] of [['下一步：句子', '返回角色说明', '词组'], ['下一步：提示接话', '上一步：词组', '句子'], ['下一步：开口对练', '上一步：句子', '提示接话']]) {
    await expect(main.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(actionButtons(page)).toHaveCount(1);
    await expect(actionButtons(page)).toHaveText(next);
    await expect(actionButtons(page)).toHaveClass(/btn-primary/);
    await expect(appBar.getByRole('button', { name: back, exact: true })).toBeVisible();
    await expect(primaries(page)).toHaveCount(1);
    if (next !== '下一步：开口对练') await actionButtons(page).click();
  }
  await appBar.getByRole('button', { name: '上一步：句子', exact: true }).click();
  await expect(main.getByRole('heading', { name: '句子', exact: true })).toBeVisible();
  // Leaving the course moves into "more" on the learning pages.
  const sheet = await openMore(main);
  await expect(sheet.getByTestId('scene-back')).toBeVisible();
  await expect(sheet.getByRole('button', { name: '重看场景', exact: true })).toBeVisible();
});

test('C11-2 / K5.2: each phrase is one row with English, its meaning and one speaker icon button', async ({ page, context, baseURL }) => {
  const { main } = await setupGuided(page, context, baseURL);
  await enterTerms(main);
  const rows = main.getByTestId('scene-term');
  await expect(rows).toHaveCount(hotelSample.phrases.length);
  for (const [index, row] of (await rows.all()).entries()) {
    await expect(row.locator('[lang="en"]')).toHaveText(hotelSample.phrases[index].text);
    await expect(row.locator('[lang="zh-Hans"]')).toHaveText(hotelSample.phrases[index].translations['zh-Hans']);
    const button = row.getByRole('button');
    await expect(button).toHaveCount(1);
    await expect(button).toHaveClass(/icon-btn/);
    await expect(button).toHaveAccessibleName('听原片中的这句');
    const rowBox = await row.boundingBox(), buttonBox = await button.boundingBox();
    // The speaker sits at the end of the row, beside the text rather than under it.
    expect(buttonBox.x + buttonBox.width).toBeGreaterThan(rowBox.x + rowBox.width * 0.75);
    expect(buttonBox.y).toBeLessThan(rowBox.y + rowBox.height / 2);
  }
});

test('C11-2 / K5.2, F12.3: each sentence is a card with play and loop icons at its top right; reporting stays and loop keeps aria-pressed', async ({ page, context, baseURL }) => {
  const { main } = await openSentences(page, context, baseURL);
  const rows = main.locator('.sentence-row');
  await expect(rows).toHaveCount(hotelSample.lines.length);
  for (const [index, row] of (await rows.all()).entries()) {
    const line = hotelSample.lines[index];
    const play = row.getByTestId('scene-sentence').getByRole('button');
    const loop = row.getByRole('button', { name: `循环这句：${line.text}`, exact: true });
    await expect(play).toHaveCount(1); await expect(play).toHaveClass(/icon-btn/);
    await expect(loop).toHaveClass(/icon-btn/);
    await expect(loop).toHaveAttribute('aria-pressed', 'false');
    const rowBox = await row.boundingBox(), playBox = await play.boundingBox(), loopBox = await loop.boundingBox();
    expect(Math.abs(playBox.y - loopBox.y)).toBeLessThanOrEqual(4);
    for (const box of [playBox, loopBox]) {
      expect(box.x).toBeGreaterThan(rowBox.x + rowBox.width / 2);
      expect(box.y).toBeLessThan(rowBox.y + 40);
    }
    await expect(row.getByRole('button', { name: `报告这句：${line.text}`, exact: true })).toBeVisible();
  }
});

test('C11-2 / K5.2: the prompt page is a chat: partner left, "you could say" right after one tap, help as a chip, and a "1/2 ‹ ›" pager', async ({ page, context, baseURL }) => {
  const { main } = await openPrompt(page, context, baseURL, { changeCourse: twoTurns });
  const partner = main.locator('.bubble--partner').filter({ has: page.getByTestId('scene-partner') });
  await expect(partner).toBeVisible();
  await expect(partner.getByRole('button', { name: '帮我理解', exact: true })).toHaveClass(/chip-btn/);
  await expect(main.getByTestId('scene-answer')).toBeHidden();
  await expect(main.getByTestId('answer-reveal')).toBeVisible();
  await revealAnswer(main);
  const answer = main.locator('.bubble--me').filter({ has: page.getByTestId('scene-answer') });
  await expect(answer).toBeVisible();
  const partnerBox = await partner.boundingBox(), answerBox = await answer.boundingBox();
  expect(answerBox.x + answerBox.width).toBeGreaterThan(partnerBox.x + partnerBox.width);
  expect(partnerBox.x).toBeLessThan(answerBox.x);
  await expect(main.getByTestId('scene-answer-play')).toBeVisible();
  const pager = main.getByTestId('turn-pager');
  await expect(pager).toContainText('1/2');
  await expect(pager.getByRole('button', { name: '上一回合', exact: true })).toBeDisabled();
  await pager.getByTestId('scene-next-turn').click();
  await expect(pager).toContainText('2/2');
  await expect(main.getByTestId('scene-partner')).toHaveText('May I see your passport?');
  // A new turn folds the answer again.
  await expect(main.getByTestId('scene-answer')).toBeHidden();
  await expect(actionButtons(page)).toHaveCount(1);
  expect(await noOverflow(page)).toBe(true);
});

test('C11-2 / F7.2: "need a hint" from practice opens the prompt page with the answer already shown', async ({ page, context, baseURL }) => {
  const { main } = await openPractice(page, context, baseURL);
  await panel(main).getByRole('button', { name: '需要提示', exact: true }).click();
  await expect(main.getByTestId('scene-panel-4')).toBeVisible();
  await expect(main.getByTestId('scene-answer')).toBeVisible();
  await expect(main.getByTestId('scene-answer')).toHaveText(second.text);
});

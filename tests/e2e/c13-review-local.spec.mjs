import { test, expect } from '@playwright/test';
import { setupData, openLibrary, coursePointer } from '../fixtures/c5-data-browser.mjs';
import { noGeneration, progressRecord } from '../fixtures/t70-learning-browser.mjs';
import { setupGuided, enterTerms, hotelSample } from '../fixtures/t69-guided-browser.mjs';
import { openPrompt, openPractice, panel, routePractice } from '../fixtures/c4-practice-browser.mjs';
import { openMore, closeMore } from '../fixtures/c10-shell.mjs';
import { finishWatching } from '../fixtures/c11-shell.mjs';
import { routeQueue, sampleQueue, rates, listens, reviewEntry } from '../fixtures/c13-review-browser.mjs';

// C13 (2026-10-18, research reports 1 and 5): "listen to these again today" across courses, "continue where you
// stopped" and "heard N sentences", local register labels and "you could also say", and a guess before watching.
// Every route is answered in memory (the review queue by tests/fixtures/c13-review-browser.mjs); nothing is
// generated and no model is called.
test.use({ locale: 'zh-CN' });
const description = '我想在酒店办理入住，确认预订。';
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const primaries = page => page.locator('.btn-primary:visible');
const [first, second] = hotelSample.lines;

async function openQueue(page, context, baseURL, queue, options) {
  const learning = await setupData(page, context, baseURL, options);
  await routeQueue(page, baseURL, learning.state, queue);
  await openLibrary(page, learning.main);
  return learning;
}

// ---- C13-2: continue where you stopped, heard N sentences ----

test('C13-2 / F15.1: my scenes show "continue" at the saved place and an only-growing "heard N sentences", never a streak', async ({ page, context, baseURL }) => {
  const { main, state } = await openQueue(page, context, baseURL);
  const resume = main.getByTestId('continue-last');
  await expect(resume).toBeVisible();
  await expect(resume).toContainText('继续上次');
  await expect(resume).toContainText(description);
  await expect(resume).toContainText('句子第 3 句');
  await expect(main.getByTestId('heard-count')).toHaveText('已听过 128 句');
  const text = await main.innerText();
  expect(text).not.toMatch(/连续\s*\d*\s*天|streak|打卡|断签|天数/i);
  await expect(primaries(page)).toHaveCount(1);
  expect(await noOverflow(page)).toBe(true);
  // "Continue" opens the very course; its saved position is restored by the course page as before.
  await resume.click();
  await expect(main.getByTestId('real-scene-course')).toBeVisible();
  expect(state.courseReads.at(-1)).toEqual(coursePointer);
  noGeneration(state);
});

test('C13-2 / F14.5: after "delete all", heard starts again at 0 and the page says why', async ({ page, context, baseURL }) => {
  const { main, state } = await openQueue(page, context, baseURL);
  await expect(main.getByTestId('heard-count')).toHaveText('已听过 128 句');
  const sheet = await openMore(page);
  state.queue = { items: [], limit: 5, heard: 0, resetAt: Date.UTC(2026, 9, 18, 9), last: null };
  await sheet.getByRole('button', { name: '删除我的全部学习数据', exact: true }).click();
  await sheet.getByRole('button', { name: '确认全部删除', exact: true }).click();
  await expect(main.getByTestId('heard-count')).toHaveText('已听过 0 句');
  await expect(main.getByText('删除全部数据时，已听过的句数也一起清空了，所以从 0 开始。', { exact: true })).toBeVisible();
  await expect(main.getByTestId('continue-last')).toHaveCount(0);
  await expect(reviewEntry(main, 0)).toHaveCount(0);
  expect(state.dataDeletes).toHaveLength(1);
});

// ---- C13-1: listen to these again today ----

test('C13-1 / F15.1: the review entry is one quiet row with today\'s count; with nothing due there is no entry at all', async ({ page, context, baseURL }) => {
  const { main } = await openQueue(page, context, baseURL);
  const entry = reviewEntry(main, 2);
  await expect(entry).toBeVisible();
  await expect(entry).not.toHaveClass(/btn-primary|btn-tonal/);
  const text = await main.innerText();
  expect(text).not.toMatch(/逾期|%|\d+\s*分/);
});

test('C13-1: with nothing due and no saved place there is no review entry and no "continue"', async ({ page, context, baseURL }) => {
  const { main } = await openQueue(page, context, baseURL, { items: [], limit: 5, heard: 3, resetAt: null, last: null });
  await expect(main.getByTestId('heard-count')).toHaveText('已听过 3 句');
  await expect(main.getByRole('button', { name: /今天可以再听这几句/ })).toHaveCount(0);
  await expect(main.getByTestId('continue-last')).toHaveCount(0);
});

test('C13-1 / K6.2, F10.5: each sentence plays its own slice of the course video first, then three self-ratings and "help me understand"; no score, no percent, no generation', async ({ page, context, baseURL }) => {
  const { main, state } = await openQueue(page, context, baseURL);
  await reviewEntry(main, 2).click();
  await expect(main.getByRole('heading', { name: '再听这几句', exact: true })).toBeVisible();
  const video = main.getByTestId('review-video');
  await expect.poll(() => video.evaluate(v => v.readyState)).toBeGreaterThanOrEqual(1);
  // The original sound: the private course media, from the line's own start.
  expect(await video.evaluate(v => v.currentSrc)).toContain(`/api/generated-course-media?id=${coursePointer.id}&revision=2`);
  await expect.poll(() => page.evaluate(() => window.t70PlayCalls)).toBeGreaterThanOrEqual(1);
  await expect.poll(() => video.evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(first.start - 0.05);
  expect(await video.evaluate(v => v.currentTime)).toBeLessThanOrEqual(first.end + 0.3);
  await expect(main.getByTestId('review-count')).toHaveText('1/2');
  const ratings = main.getByTestId('review-ratings');
  for (const name of ['没听懂', '提示后懂', '听懂了']) await expect(ratings.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(page.locator('.btn-primary:visible')).toHaveCount(0);
  // "Help me understand" shows the meaning and the plainer way to say it.
  await main.getByRole('button', { name: '帮我理解', exact: true }).click();
  await expect(main.getByTestId('review-help')).toContainText(first.translations['zh-Hans']);
  await expect(main.getByTestId('review-help')).toContainText('说得清楚一点：Are you checking in now?');
  await expect(main.getByTestId('review-text')).toHaveText(first.text);
  await ratings.getByRole('button', { name: '提示后懂', exact: true }).click();
  await expect(main.getByTestId('review-count')).toHaveText('2/2');
  await expect.poll(() => video.evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(second.start - 0.05);
  await expect(main.getByTestId('review-help')).toHaveCount(0);
  await ratings.getByRole('button', { name: '听懂了', exact: true }).click();
  await expect(main.getByRole('heading', { name: '今天的几句听完了', exact: true })).toBeVisible();
  expect(rates(state)).toEqual([
    { action: 'rate', course: coursePointer, lineId: first.id, rating: 'hint' },
    { action: 'rate', course: coursePointer, lineId: second.id, rating: 'clear' },
  ]);
  expect(state.queueForeign).toEqual([]);
  const text = await main.innerText();
  expect(text).not.toMatch(/逾期|分|%|掌握|连续|score/);
  await expect(primaries(page)).toHaveCount(1);
  await primaries(page).click();
  await expect(main.getByRole('heading', { name: '我的场景', exact: true })).toBeVisible();
  noGeneration(state);
  expect(await noOverflow(page)).toBe(true);
});

test('C13-1: a rating that is not saved says so and lets the learner choose again; nothing moves on', async ({ page, context, baseURL }) => {
  const { main, state } = await openQueue(page, context, baseURL);
  await reviewEntry(main, 2).click();
  state.queueStatus = 503;
  await main.getByTestId('review-ratings').getByRole('button', { name: '没听懂', exact: true }).click();
  await expect(main.getByRole('alert')).toHaveText('没有记下这次选择，请再选一次。');
  await expect(main.getByTestId('review-count')).toHaveText('1/2');
  state.queueStatus = 200;
  await main.getByTestId('review-ratings').getByRole('button', { name: '没听懂', exact: true }).click();
  await expect(main.getByTestId('review-count')).toHaveText('2/2');
  expect(rates(state).map(body => body.rating)).toEqual(['missed', 'missed']);
});

test('C13-1 / F15.1: the daily number can be changed in "more"', async ({ page, context, baseURL }) => {
  const { main, state } = await openQueue(page, context, baseURL);
  const sheet = await openMore(page);
  const limit = sheet.getByRole('combobox', { name: '每天最多再听几句', exact: true });
  await expect(limit).toHaveValue('5');
  await limit.selectOption('3');
  await expect.poll(() => state.queuePosts.filter(body => body.action === 'limit')).toEqual([{ action: 'limit', limit: 3 }]);
  await closeMore(page);
  await expect(main.getByTestId('heard-count')).toBeVisible();
});

test('C13-1 / F11.3: the Hindi review page uses Hindi labels and fits a narrow phone', async ({ page, context, baseURL }) => {
  const { main } = await openQueue(page, context, baseURL);
  const sheet = await openMore(page);
  await sheet.getByRole('combobox').first().selectOption('hi');
  await closeMore(page);
  const { c13Copy } = await import('../../app/c13-copy.ts');
  const hi = c13Copy.hi;
  await main.getByRole('button', { name: hi.reviewEntry(2), exact: true }).click();
  await expect(main.getByRole('heading', { name: hi.reviewTitle, exact: true })).toBeVisible();
  for (const name of [hi.missed, hi.hint, hi.clear]) await expect(main.getByTestId('review-ratings').getByRole('button', { name, exact: true })).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
});

test('C13-1, C13-2: hearing sentences in a course is reported once each; sentences played on the phrase and sentence pages are marked learned', async ({ page, context, baseURL }) => {
  const { main, state } = await openQueue(page, context, baseURL, undefined, { progress: progressRecord({ page: 'sentences', time: 1.25, turnIndex: 0 }) });
  await main.getByTestId('continue-last').click();
  await expect(main.getByTestId('real-scene-course')).toBeVisible();
  const video = main.locator('video');
  await expect.poll(() => video.evaluate(v => v.readyState)).toBeGreaterThanOrEqual(2);
  // The saved place was the sentences page; play the first sentence to its end twice.
  for (let i = 0; i < 2; i++) {
    await main.getByTestId('scene-sentence').first().getByRole('button', { name: '听原片中的这句', exact: true }).click();
    await video.evaluate((v, end) => { v.currentTime = end; v.dispatchEvent(new Event('timeupdate')); }, first.end);
  }
  await expect.poll(() => listens(state).flatMap(body => body.heard), { timeout: 8000 }).toEqual([first.id]);
  expect(listens(state).flatMap(body => body.learned)).toEqual([first.id]);
  for (const body of listens(state)) expect(body.course).toEqual(coursePointer);
  expect(state.queueForeign).toEqual([]);
  noGeneration(state);
});

// ---- C13-3: local labels, plainer alternatives and "you could also say" ----

const localCourse = course => {
  Object.assign(course.phrases[0], { register: 'sg-colloquial', useAdvice: 'hear-only', plainAlternative: 'Are you checking in now?' });
  Object.assign(course.phrases[1], { register: 'sg-standard', useAdvice: 'say' });
  Object.assign(course.lines[0], { register: 'sg-colloquial', useAdvice: 'hear-only', plainAlternative: 'Hello. Are you checking in now?' });
  course.turns[0].alternatives = [
    { text: 'Yes, I have a booking.', translations: { 'zh-Hans': '是的，我有预订。', id: 'Ya, saya sudah pesan.', ja: 'はい、予約があります。', ko: '네, 예약했어요.', hi: 'जी हाँ, मेरी बुकिंग है।' } },
    { text: 'Yes, checking in, please.', translations: { 'zh-Hans': '是的，我要办理入住。', id: 'Ya, saya mau check-in.', ja: 'はい、チェックインをお願いします。', ko: '네, 체크인할게요.', hi: 'जी हाँ, चेक-इन करना है।' } },
  ];
};

test('C13-3 / F4.2: the phrase page labels local words without judging them, keeps the plainer way in "help me understand" and says it is not yet locally reviewed', async ({ page, context, baseURL }) => {
  const { main } = await setupGuided(page, context, baseURL, { changeCourse: localCourse });
  await enterTerms(main);
  const terms = main.getByTestId('scene-term');
  await expect(terms.nth(0).getByTestId('local-tag')).toHaveText('本地口语 · 听懂就好');
  await expect(terms.nth(1).getByTestId('local-tag')).toHaveText('新加坡常用词');
  await expect(main.getByText('本地用法标注由 AI 写成，尚未经本地审核。', { exact: true })).toBeVisible();
  await expect(main.getByText('Are you checking in now?', { exact: false })).toHaveCount(0);
  await terms.nth(0).getByRole('button', { name: '帮我理解', exact: true }).click();
  await expect(terms.nth(0).getByTestId('term-plain')).toHaveText('说得清楚一点：Are you checking in now?');
  const text = await main.innerText();
  expect(text).not.toMatch(/错误|不标准|不正确|本地审查过/);
  await expect(primaries(page)).toHaveCount(1);
  expect(await noOverflow(page)).toBe(true);
});

test('C13-3: a course without the new fields shows no labels and no note, exactly as before', async ({ page, context, baseURL }) => {
  const { main } = await setupGuided(page, context, baseURL);
  await enterTerms(main);
  await expect(main.getByTestId('scene-term')).toHaveCount(2);
  await expect(main.getByTestId('local-tag')).toHaveCount(0);
  await expect(main.getByText('本地用法标注由 AI 写成，尚未经本地审核。', { exact: true })).toHaveCount(0);
  await expect(main.getByTestId('scene-term').first().getByRole('button', { name: '帮我理解', exact: true })).toHaveCount(0);
});

test('C13-3 / F5.3: on the prompt page "help me understand" for a local line also gives the plainer way to say it', async ({ page, context, baseURL }) => {
  const { main } = await openPrompt(page, context, baseURL, { changeCourse: localCourse });
  await main.getByRole('button', { name: '帮我理解', exact: true }).click();
  await expect(main.getByTestId('partner-help')).toContainText(first.translations['zh-Hans']);
  await expect(main.getByTestId('partner-plain')).toHaveText('说得清楚一点：Hello. Are you checking in now?');
});

test('C13-3 / F9.1: in practice, "need a hint" first offers the course\'s own "you could also say" answers with meanings, without any model call', async ({ page, context, baseURL }) => {
  const bodies = await routePractice(page, []);
  const { main } = await openPractice(page, context, baseURL, { changeCourse: localCourse });
  await panel(main).getByRole('button', { name: '需要提示', exact: true }).click();
  const options = panel(main).getByTestId('practice-alternatives');
  await expect(options).toBeVisible();
  await expect(options).toContainText('也可以这样说');
  for (const text of [second.text, 'Yes, I have a booking.', 'Yes, checking in, please.']) await expect(options).toContainText(text);
  await expect(options).toContainText('是的，我有预订。');
  await expect(main.getByRole('heading', { name: '开口对练', exact: true })).toBeVisible();
  expect(bodies).toEqual([]);
  // The full model answer is still one tap away, on the prompt page as before.
  await options.getByRole('button', { name: '看示范答案', exact: true }).click();
  await expect(main.getByTestId('scene-answer')).toHaveText(second.text);
});

test('C13-3: a course without "you could also say" keeps the old hint: straight to the prompt page with the answer', async ({ page, context, baseURL }) => {
  const { main } = await openPractice(page, context, baseURL);
  await panel(main).getByRole('button', { name: '需要提示', exact: true }).click();
  await expect(main.getByTestId('scene-answer')).toHaveText(second.text);
  await expect(main.getByTestId('practice-alternatives')).toHaveCount(0);
});

// ---- C13-5: guess before watching ----

test('C13-5 / F2.1, K4.3: before the first play the page asks in the help language what the other person will ask first; choosing plays, captions stay English, and the check after watching has no right or wrong', async ({ page, context, baseURL }) => {
  const { main, state } = await setupGuided(page, context, baseURL);
  const guess = main.getByTestId('watch-guess');
  await expect(guess).toBeVisible();
  await expect(guess).toContainText('你猜对方会先问什么？');
  const options = guess.getByRole('button').filter({ hasNotText: '跳过，直接看' });
  await expect(options).toHaveCount(3);
  for (const option of await options.all()) await expect(option.locator('svg')).toHaveCount(1);
  await expect(primaries(page)).toHaveCount(1);
  await expect(primaries(page)).toHaveAttribute('data-testid', 'scene-play');
  // The tools row is still on the first screen.
  const bar = await page.getByTestId('action-bar').boundingBox(), tools = await main.getByTestId('watch-tools').boundingBox();
  expect(tools.y + tools.height).toBeLessThanOrEqual(bar.y + 1);
  await guess.getByRole('button', { name: '问你的名字或预约', exact: true }).click();
  await expect(guess).toHaveCount(0);
  const video = main.locator('video');
  await expect.poll(() => video.evaluate(v => !v.paused)).toBe(true);
  await video.evaluate(v => { v.currentTime = 1.2; v.dispatchEvent(new Event('timeupdate')); });
  await expect(main.getByTestId('scene-caption')).toHaveText(first.text);
  for (const item of [...hotelSample.lines, ...hotelSample.phrases]) await expect(page.locator('body')).not.toContainText(item.translations['zh-Hans']);
  await video.evaluate(v => { v.currentTime = v.duration; v.dispatchEvent(new Event('ended')); });
  const check = main.getByTestId('guess-check');
  await expect(check).toContainText('你猜的是：问你的名字或预约');
  await expect(check).toContainText(first.text);
  expect(await check.innerText()).not.toMatch(/对了|错了|答对|答错|正确|错误|✓|✗|✔|✘/);
  // Nothing about the guess is sent or saved.
  expect(state.posts).toEqual([]); expect(state.writes).toEqual([]);
});

test('C13-5: the guess can be skipped and the scene plays straight away', async ({ page, context, baseURL }) => {
  const { main } = await setupGuided(page, context, baseURL);
  await main.getByTestId('watch-guess').getByRole('button', { name: '跳过，直接看', exact: true }).click();
  await expect(main.getByTestId('watch-guess')).toHaveCount(0);
  const video = main.locator('video');
  await expect.poll(() => video.evaluate(v => !v.paused)).toBe(true);
  await video.evaluate(v => { v.currentTime = v.duration; v.dispatchEvent(new Event('ended')); });
  await expect(main.getByTestId('guess-check')).toHaveCount(0);
  await expect(main.getByText('场景看完了。可以重播，或进入角色学习。', { exact: true })).toBeVisible();
});

test('C13-5: pressing play without choosing also skips the guess; entering the role works as before', async ({ page, context, baseURL }) => {
  const { main } = await setupGuided(page, context, baseURL);
  await finishWatching(main);
  await expect(main.getByTestId('watch-guess')).toHaveCount(0);
  await expect(main.getByTestId('guess-check')).toHaveCount(0);
  await main.getByRole('button', { name: '进入角色学习', exact: true }).click();
  await expect(main.getByRole('button', { name: '开始学词组', exact: true })).toBeVisible();
});

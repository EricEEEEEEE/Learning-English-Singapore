import { test, expect } from '@playwright/test';
import { installMic, routePractice, routeHeldPractice, routeReviews, routeReportStatuses, openPractice, openPrompt, openSentences, panel, twoTurns, reply, replyWav, speak, guidedId, guidedRevision, guidedMaterials, hotelSample } from '../fixtures/c9-practice-browser.mjs';
import { setupData, openLibrary, ownerA } from '../fixtures/c5-data-browser.mjs';
import { openMore, closeMore, openHelp, closeHelp } from '../fixtures/c10-shell.mjs';

// C9 (user 2026-10-17: finish the product before real video; self-audit gaps 5, 6, 9, 10 and the rest of 7 and 8).
// A confirmed goal change, "say it in my language", the "hard to hear" focus, sentence report statuses and the
// saved practice review with a comparison. Every route is answered in memory; nothing here calls a model, and the
// microphone is a synthetic stub.
test.use({ locale: 'zh-CN' });
const [first, second] = hotelSample.lines;
const goalChange = { summary: '把入住改到明天', confirm: 'So you want to check in tomorrow instead, right?' };
const confirmReply = () => reply({ transcript: 'Can I check in tomorrow instead?', reply: { text: goalChange.confirm, audioBase64: replyWav, mimeType: 'audio/wav' }, goalChange, goalRevision: 0 });
const nativeAnswer = (over = {}) => ({ kind: 'native', transcript: '我想明天再入住', understood: true, suggestion: { text: 'Could I check in tomorrow instead?', audioBase64: replyWav, mimeType: 'audio/wav' }, goalRevision: 0, ...over });

// ---- C9-1: goal change confirmed once, then carried as a revision (F9.1, F9.3) ----

test('C9-1 / F9.3: the partner confirms a new goal once; "switch" shows the new goal and later turns carry it', async ({ page, context, baseURL }) => {
  const bodies = await routePractice(page, [{ json: confirmReply() }, { json: reply({ goalRevision: 1 }) }]);
  const { main } = await openPractice(page, context, baseURL);
  await installMic(page);
  await speak(panel(main));
  await expect(panel(main).getByTestId('practice-reply')).toHaveText(goalChange.confirm);
  const card = panel(main).getByTestId('practice-goal-confirm');
  await expect(card).toContainText(goalChange.summary);
  await expect(panel(main).getByTestId('practice-goal')).toHaveCount(0);
  await card.getByRole('button', { name: '换成新目标', exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect(panel(main).getByTestId('practice-goal')).toContainText(goalChange.summary);
  await expect(panel(main).getByTestId('practice-goal')).toContainText('第 1 次');
  await speak(panel(main));
  await expect(panel(main).getByTestId('practice-reply')).toHaveText('Great. May I see your passport?');
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).not.toHaveProperty('goal');
  expect(bodies[1].goal).toEqual({ revision: 1, summary: goalChange.summary });
});

test('C9-1 / F9.3: "keep the old goal" closes the question and the next turn carries no new goal', async ({ page, context, baseURL }) => {
  const bodies = await routePractice(page, [{ json: confirmReply() }, { json: reply() }]);
  const { main } = await openPractice(page, context, baseURL);
  await installMic(page);
  await speak(panel(main));
  await panel(main).getByTestId('practice-goal-confirm').getByRole('button', { name: '保持原来', exact: true }).click();
  await expect(panel(main).getByTestId('practice-goal-confirm')).toHaveCount(0);
  await expect(panel(main).getByTestId('practice-goal')).toHaveCount(0);
  await speak(panel(main));
  await expect(panel(main).getByTestId('practice-reply')).toHaveText('Great. May I see your passport?');
  expect(bodies[1]).not.toHaveProperty('goal');
});

test('C9-1 / F9.1: a reply sent before the goal changed and arriving after it is ignored and does not overwrite the new goal', async ({ page, context, baseURL }) => {
  const held = await routeHeldPractice(page, [{ json: confirmReply() }, { json: reply({ reply: { text: 'Old reply for the old goal.', audioBase64: replyWav, mimeType: 'audio/wav' }, goalChange: { summary: '旧目标的改动', confirm: 'Old?' }, goalRevision: 0 }) }, { json: reply({ goalRevision: 1 }) }]);
  const { main } = await openPractice(page, context, baseURL);
  await installMic(page);
  await speak(panel(main));
  await expect(panel(main).getByTestId('practice-goal-confirm')).toBeVisible();
  const release = held.hold(1);
  await speak(panel(main));
  await expect(panel(main).getByText('正在发送…', { exact: true })).toBeVisible();
  await panel(main).getByTestId('practice-goal-confirm').getByRole('button', { name: '换成新目标', exact: true }).click();
  await expect(panel(main).getByTestId('practice-goal')).toContainText(goalChange.summary);
  release();
  await expect(panel(main).getByRole('status').filter({ hasText: '目标已经改了' })).toBeVisible();
  await expect(panel(main).getByText('Old reply for the old goal.')).toHaveCount(0);
  await expect(panel(main).getByTestId('practice-goal-confirm')).toHaveCount(0);
  await expect(panel(main).getByTestId('practice-goal')).toContainText(goalChange.summary);
  await speak(panel(main));
  await expect(panel(main).getByTestId('practice-reply')).toHaveText('Great. May I see your passport?');
  expect(held.bodies).toHaveLength(3);
  expect(held.bodies[1]).not.toHaveProperty('goal');
  expect(held.bodies[2].goal).toEqual({ revision: 1, summary: goalChange.summary });
});

// ---- C9-2: say it in my language (F5.3) ----

test('C9-2 / F5.3: "say it in my language" sends native mode, shows a short English line to say and play, and the partner waits', async ({ page, context, baseURL }) => {
  const bodies = await routePractice(page, [{ json: nativeAnswer() }, { json: reply() }]);
  const { main } = await openPractice(page, context, baseURL, { changeCourse: twoTurns });
  await installMic(page);
  await openHelp(main);
  await panel(main).getByRole('button', { name: '用母语说', exact: true }).click();
  await panel(main).getByRole('button', { name: '说完了', exact: true }).click();
  const card = panel(main).getByTestId('practice-native');
  await expect(card).toContainText('可以这样说：Could I check in tomorrow instead?');
  await expect(card.locator('[lang="en"]')).toHaveText('Could I check in tomorrow instead?');
  await expect(card.getByRole('button', { name: '听这句', exact: true })).toBeVisible();
  await expect(card.getByTestId('practice-native-audio')).toHaveAttribute('src', /^data:audio\/wav;base64,/);
  expect(bodies[0]).toMatchObject({ mode: 'native', turnIndex: 0 });
  // The partner waits: same line, no partner reply and no way on to the next turn yet.
  await expect(panel(main).getByTestId('practice-partner')).toHaveText(first.text);
  await expect(panel(main).getByTestId('practice-reply')).toHaveCount(0);
  await expect(panel(main).getByRole('button', { name: '下一回合', exact: true })).toHaveCount(0);
  const micBefore = await page.evaluate(() => window.t69MicCalls);
  await card.getByRole('button', { name: '再用英语试一次', exact: true }).click();
  await expect(panel(main).getByRole('button', { name: '说完了', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.t69MicCalls)).toBe(micBefore + 1);
  await panel(main).getByRole('button', { name: '说完了', exact: true }).click();
  await expect(panel(main).getByTestId('practice-reply')).toHaveText('Great. May I see your passport?');
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).not.toHaveProperty('mode');
  expect(bodies[1].turnIndex).toBe(0);
});

test('C9-2 / F5.3: when the meaning was not clear, the page says so and offers no English line', async ({ page, context, baseURL }) => {
  await routePractice(page, [{ json: nativeAnswer({ understood: false, suggestion: null }) }]);
  const { main } = await openPractice(page, context, baseURL);
  await installMic(page);
  await openHelp(main);
  await panel(main).getByRole('button', { name: '用母语说', exact: true }).click();
  await panel(main).getByRole('button', { name: '说完了', exact: true }).click();
  const card = panel(main).getByTestId('practice-native');
  await expect(card).toContainText('没听清你想说的意思');
  await expect(card).not.toContainText('可以这样说');
  await expect(card.getByTestId('practice-native-audio')).toHaveCount(0);
});

// ---- C9-3: "hard to hear" focus (F9.4) ----

test('C9-3 / F9.4: "hard to hear" is a practice focus and is sent with the turn', async ({ page, context, baseURL }) => {
  const bodies = await routePractice(page, [{ json: reply() }]);
  const { main } = await openPractice(page, context, baseURL);
  const focus = panel(main).getByRole('group', { name: '这次想多练什么', exact: true });
  await openMore(main);
  await expect(focus.getByRole('radio')).toHaveCount(4);
  await focus.getByRole('radio', { name: '多练听不清', exact: true }).check();
  await closeMore(main);
  await installMic(page);
  await speak(panel(main));
  await expect(panel(main).getByTestId('practice-reply')).toBeVisible();
  expect(bodies[0].focus).toBe('unclear');
});

// ---- C9-5: report statuses, disabled lines and the same sentence elsewhere (F12.3, F12.5) ----

const statuses = () => [
  { lineId: first.id, reason: 'not_local', note: '', status: 'processing', at: 1 },
  { lineId: second.id, reason: 'wrong_meaning', note: '', status: 'disabled', at: 1 },
  { lineId: 'line-2', reason: 'unclear', note: '', status: 'corrected', at: 1 },
];

test('C9-5 / F12.3: the sentences page shows each report status, greys out a disabled line and lists the same line elsewhere', async ({ page, context, baseURL }) => {
  await routeReportStatuses(page, statuses(), { [second.id]: [{ id: 'other-course', revision: 1, description: '我想在酒店改订房间。' }] });
  const { main } = await openSentences(page, context, baseURL, { changeCourse: twoTurns });
  const rows = main.locator('.sentence-row');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0).getByTestId('sentence-report-status')).toHaveText('处理中');
  await expect(rows.nth(1).getByTestId('sentence-report-status')).toHaveText('已停用这句');
  await expect(rows.nth(2).getByTestId('sentence-report-status')).toHaveText('已有修正版');
  await expect(rows.nth(3).getByTestId('sentence-report-status')).toHaveCount(0);
  await expect(rows.nth(1)).toHaveAttribute('data-status', 'disabled');
  await expect(rows.nth(1).getByTestId('sentence-disabled-note')).toContainText('这句暂时停用');
  expect(await rows.nth(1).getByTestId('scene-sentence').evaluate(card => Number(getComputedStyle(card).opacity))).toBeLessThan(1);
  await expect(rows.nth(0)).not.toHaveAttribute('data-status', 'disabled');
  await expect(rows.nth(1).getByTestId('sentence-elsewhere')).toHaveText('同样的表达也出现在：我想在酒店改订房间。');
  await expect(main.getByTestId('sentence-elsewhere')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
});

test('C9-5 / F12.3: on the prompt page a disabled answer line is not shown as the model answer', async ({ page, context, baseURL }) => {
  await routeReportStatuses(page, statuses());
  const { main } = await openPrompt(page, context, baseURL);
  await expect(main.getByTestId('scene-partner')).toHaveText(first.text);
  await expect(main.getByTestId('scene-answer-disabled')).toContainText('这句暂时停用');
  await expect(main.getByTestId('scene-answer')).toHaveCount(0);
  await expect(main.getByRole('button', { name: '听回答示范', exact: true })).toHaveCount(0);
});

test('C9-5 / F12.3: without a disabled report the prompt page shows the model answer as before', async ({ page, context, baseURL }) => {
  await routeReportStatuses(page, [{ lineId: second.id, reason: 'unclear', note: '', status: 'processing', at: 1 }]);
  const { main } = await openPrompt(page, context, baseURL);
  await expect(main.getByTestId('scene-answer')).toHaveText(second.text);
  await expect(main.getByTestId('scene-answer-disabled')).toHaveCount(0);
});

// ---- C9-6: the review is saved per owner and course, classified and compared (F10.1, F10.4) ----

test('C9-6 / F10.1, F10.4: ending practice saves one review with each turn classified and compares it with the last one', async ({ page, context, baseURL }) => {
  test.setTimeout(40_000);
  await routePractice(page, [{ json: reply() }]);
  const reviews = await routeReviews(page, baseURL, { previous: { session: 'older-session-1', turns: [{ turnIndex: 0, outcome: 'after_hint' }, { turnIndex: 1, outcome: 'unobserved' }], help: { hints: 1, autoHelp: 0, translations: 0, native: 0 }, at: 1 } });
  const { main } = await openPractice(page, context, baseURL, { changeCourse: twoTurns });
  await openHelp(main);
  await panel(main).getByRole('checkbox', { name: '我没开口时主动给提示', exact: true }).uncheck();
  await closeHelp(main);
  await installMic(page);
  await speak(panel(main));
  await expect(panel(main).getByTestId('practice-reply')).toHaveText('Great. May I see your passport?');
  await panel(main).getByRole('button', { name: '下一回合', exact: true }).click();
  await panel(main).getByRole('button', { name: '帮我理解', exact: true }).click();
  await speak(panel(main));
  await expect(panel(main).getByTestId('practice-reply')).toBeVisible();
  await openMore(main);
  await panel(main).getByRole('button', { name: '结束练习', exact: true }).click();
  const review = panel(main).getByTestId('practice-review');
  await expect(review).toContainText('第 1 回合：你开口说了“Yes, I booked a room.” · 独立完成');
  await expect(review).toContainText('第 2 回合：你开口说了“Yes, I booked a room.” · 提示后完成');
  await expect.poll(() => reviews.posts.length).toBe(1);
  const body = reviews.posts[0];
  expect(body.course).toEqual({ id: guidedId, revision: guidedRevision, materialsRevision: guidedMaterials });
  expect(body.session).toMatch(/^[a-zA-Z0-9_-]{8,64}$/);
  expect(body.turns).toEqual([{ turnIndex: 0, outcome: 'independent' }, { turnIndex: 1, outcome: 'after_hint' }]);
  expect(body.help).toEqual({ hints: 0, autoHelp: 0, translations: 1, native: 0 });
  expect(reviews.foreign).toBe(0);
  await expect(review.getByTestId('practice-compare-previous')).toContainText('上次');
  await expect(review.getByTestId('practice-compare-previous')).toContainText('提示后完成 1');
  await expect(review.getByTestId('practice-compare-current')).toContainText('这次');
  await expect(review.getByTestId('practice-compare-current')).toContainText('独立完成 1');
  await expect(review.getByTestId('practice-compare-current')).toContainText('提示后完成 1');
  for (const word of ['分数', '%', '掌握', '发音']) await expect(review).not.toContainText(word);
});

test('C9-6: a first review has nothing to compare with, and a failed save says the review was not kept', async ({ page, context, baseURL }) => {
  const reviews = await routeReviews(page, baseURL, { status: 503 });
  const { main } = await openPractice(page, context, baseURL);
  await openMore(main);
  await panel(main).getByRole('button', { name: '结束练习', exact: true }).click();
  const review = panel(main).getByTestId('practice-review');
  await expect(review).toContainText('第 1 回合：没有开口，尚不能判断');
  await expect(review.getByTestId('practice-review-unsaved')).toBeVisible();
  await expect(review.getByTestId('practice-compare-previous')).toHaveCount(0);
  expect(reviews.posts).toHaveLength(1);
  expect(reviews.posts[0].turns).toEqual([{ turnIndex: 0, outcome: 'unobserved' }]);
});

test('C9-6: with no earlier review the page says this is the first saved review', async ({ page, context, baseURL }) => {
  await routeReviews(page, baseURL);
  const { main } = await openPractice(page, context, baseURL);
  await openMore(main);
  await panel(main).getByRole('button', { name: '结束练习', exact: true }).click();
  const review = panel(main).getByTestId('practice-review');
  await expect(review.getByTestId('practice-compare-first')).toBeVisible();
  await expect(review.getByTestId('practice-compare-previous')).toHaveCount(0);
  await expect(review.getByTestId('practice-review-unsaved')).toHaveCount(0);
});

test('C9-6 / F14.4: "what we store" lists the saved practice reviews', async ({ page, context, baseURL }) => {
  const { main } = await setupData(page, context, baseURL);
  await openLibrary(page, main);
  const details = main.locator('details').filter({ hasText: '我们保存了什么' });
  await details.getByText('我们保存了什么', { exact: true }).click();
  await expect(details).toContainText('练习回顾');
});

// ---- C8 leftover: cancelled and stopped tasks in the generation records (F14.1) ----

test('C9 (C8 leftover) / F14.1: generation records show a cancelled task and a stopped task', async ({ page, context, baseURL }) => {
  const { state, main } = await setupData(page, context, baseURL);
  state.generationRecords[ownerA].tasks.push(
    { id: 'c9-cancelled', revision: 5, description: '我想在学校问校车时间。', status: 'cancelled', reservedMicros: 0, providerCalls: 0 },
    { id: 'c9-stopped', revision: 6, description: '我想在诊所改约时间。', status: 'stopped', reservedMicros: 90_000, providerCalls: 1 });
  await openLibrary(page, main);
  await main.getByRole('button', { name: '生成记录', exact: true }).click();
  const rows = main.getByTestId('generation-record');
  await expect(rows).toHaveCount(6);
  await expect(rows.nth(4)).toContainText('已取消');
  await expect(rows.nth(4)).toContainText('预留费用上限 US$0.00');
  await expect(rows.nth(5)).toContainText('已停止');
  await expect(rows.nth(5)).toContainText('预留费用上限 US$0.09');
});

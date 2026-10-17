import { test, expect } from '@playwright/test';
import { installMic, routePractice, openPractice, panel, twoTurns, reply, replyWav, routeFeedback, countApi, speak, guidedId, guidedRevision, guidedMaterials, hotelSample } from '../fixtures/c6-practice-browser.mjs';

// C6 (user 2026-10-17: finish the product before real video): practice quality on the fifth page.
// T19A a focus chosen before starting, clarifying replies, and a calm ending when the scene is done;
// T21A one coach note at most, "less correction", and "this feedback is wrong"; T23A a short review computed
// from this visit's own events. Replies come from an in-memory route: nothing here calls a model.
test.use({ locale: 'zh-CN' });
const [first, second] = hotelSample.lines;
const pointer = { id: guidedId, revision: guidedRevision, materialsRevision: guidedMaterials };
const coach = '“booked a room” 很清楚。也可以说 “I have a booking.”';
const closing = reply({ transcript: 'Yes, under Tan.', done: true, coachNote: null, reply: { text: 'All set. Enjoy your stay!', audioBase64: replyWav, mimeType: 'audio/wav' } });

// ---- T19A: focus, clarifying, ending ----

test('T19A / F9.4: the learner picks a focus before starting; it is sent with the turn and opens no microphone', async ({ page, context, baseURL }) => {
  const bodies = await routePractice(page, [{ json: reply() }]);
  const { main } = await openPractice(page, context, baseURL);
  const focus = panel(main).getByRole('group', { name: '这次想多练什么', exact: true });
  await expect(focus.getByRole('radio', { name: '正常练', exact: true })).toBeChecked();
  await expect(focus.getByRole('radio', { name: '多练拒绝和改主意', exact: true })).not.toBeChecked();
  await expect(focus.getByRole('radio', { name: '对方换个问法', exact: true })).not.toBeChecked();
  await focus.getByRole('radio', { name: '多练拒绝和改主意', exact: true }).check();
  expect(await page.evaluate(() => window.t69MicCalls)).toBe(0);
  expect(bodies).toHaveLength(0);
  await installMic(page);
  await speak(panel(main));
  await expect(panel(main).getByTestId('practice-reply')).toHaveText('Great. May I see your passport?');
  await focus.getByRole('radio', { name: '对方换个问法', exact: true }).check();
  await speak(panel(main));
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies.map(b => b.focus)).toEqual(['refusal', 'rephrase']);
});

test('T19A / F8.3: when the partner is not sure what was meant, the learner answers the same turn again with the history', async ({ page, context, baseURL }) => {
  const bodies = await routePractice(page, [
    { json: reply({ transcript: 'Room… yes… the Tan.', understood: false, reply: { text: 'Sorry, is the booking under the name Tan?', audioBase64: replyWav, mimeType: 'audio/wav' } }) },
    { json: reply({ transcript: 'Yes, under Tan.' }) },
  ]);
  const { main } = await openPractice(page, context, baseURL);
  await installMic(page);
  await speak(panel(main));
  await expect(panel(main).getByTestId('practice-reply')).toHaveText('Sorry, is the booking under the name Tan?');
  await expect(panel(main).getByTestId('practice-clarify')).toHaveText('对方想确认你的意思，可以再说一次。');
  await expect(panel(main).getByTestId('practice-ending')).toHaveCount(0);
  await speak(panel(main));
  await expect(panel(main).getByTestId('practice-reply')).toHaveText('Great. May I see your passport?');
  await expect(panel(main).getByTestId('practice-clarify')).toHaveCount(0);
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toMatchObject({ turnIndex: 0, history: [{ learner: 'Room… yes… the Tan.', partner: 'Sorry, is the booking under the name Tan?' }] });
});

test('T19A / F9.5: a finished scene ends calmly with a review, and "practise again" starts over from the first turn', async ({ page, context, baseURL }) => {
  const bodies = await routePractice(page, [{ json: closing }, { json: reply() }]);
  const { main } = await openPractice(page, context, baseURL, { changeCourse: twoTurns });
  await installMic(page);
  await speak(panel(main));
  const ending = panel(main).getByTestId('practice-ending');
  await expect(ending.getByRole('heading', { name: '这个场景练完了', exact: true })).toBeVisible();
  await expect(panel(main).getByTestId('practice-reply')).toHaveText('All set. Enjoy your stay!');
  // The scene goal is done: no further turn is pushed on the learner.
  await expect(panel(main).getByRole('button', { name: '下一回合', exact: true })).toHaveCount(0);
  await expect(panel(main).getByRole('button', { name: '开始说', exact: true })).toHaveCount(0);
  await expect(ending.getByTestId('practice-review')).toBeVisible();
  await ending.getByRole('button', { name: '再练一次', exact: true }).click();
  await expect(panel(main).getByTestId('practice-ending')).toHaveCount(0);
  await expect(panel(main).getByTestId('practice-partner')).toHaveText(first.text);
  await expect(panel(main).getByTestId('practice-reply')).toHaveCount(0);
  await speak(panel(main));
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).toMatchObject({ turnIndex: 0, history: [] });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
});

test('T19A / F9.5: from the ending the learner can go back to watch the scene', async ({ page, context, baseURL }) => {
  await routePractice(page, [{ json: closing }]);
  const { main } = await openPractice(page, context, baseURL);
  await installMic(page);
  await speak(panel(main));
  await panel(main).getByTestId('practice-ending').getByRole('button', { name: '回去看场景', exact: true }).click();
  await expect(main.getByRole('heading', { name: '看一遍这个场景', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.t63Stopped)).toBe(1);
});

// ---- T21A: coach note, less correction, "this feedback is wrong" ----

test('T21A / F8.3: the partner answers first and one coach note follows, which can be marked as wrong', async ({ page, context, baseURL }) => {
  await routePractice(page, [{ json: reply({ coachNote: coach }) }]);
  const feedback = await routeFeedback(page, baseURL);
  const { main } = await openPractice(page, context, baseURL);
  await installMic(page);
  await speak(panel(main));
  const note = panel(main).getByTestId('practice-coach');
  await expect(note).toContainText('小提示：');
  await expect(note).toContainText(coach);
  await expect(note).toHaveAttribute('lang', 'zh-Hans');
  // In-role reply first, coach note after it.
  const order = await panel(main).evaluate(root => {
    const replyNode = root.querySelector('[data-testid="practice-reply"]'), coachNode = root.querySelector('[data-testid="practice-coach"]');
    return !!(replyNode.compareDocumentPosition(coachNode) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(order).toBe(true);
  await note.getByRole('button', { name: '这条反馈不对', exact: true }).click();
  await expect(note.getByRole('status')).toHaveText('已记下，谢谢。我们会查看这条反馈，不会改动课程。');
  await expect(note.getByRole('button', { name: '这条反馈不对', exact: true })).toHaveCount(0);
  expect(feedback.posts).toEqual([{ course: pointer, turnIndex: 0, note: coach }]);
  expect(feedback.foreign).toBe(0);
});

test('T21A: when the feedback mark cannot be saved the page says so and the learner can try again', async ({ page, context, baseURL }) => {
  await routePractice(page, [{ json: reply({ coachNote: coach }) }]);
  const feedback = await routeFeedback(page, baseURL, { status: 503 });
  const { main } = await openPractice(page, context, baseURL);
  await installMic(page);
  await speak(panel(main));
  const note = panel(main).getByTestId('practice-coach');
  await note.getByRole('button', { name: '这条反馈不对', exact: true }).click();
  await expect(note.getByRole('alert')).toHaveText('没有记下，请再试一次。');
  expect(feedback.posts).toHaveLength(1);
  await page.waitForTimeout(500);
  expect(feedback.posts).toHaveLength(1);
  feedback.status = 201;
  await note.getByRole('button', { name: '这条反馈不对', exact: true }).click();
  await expect(note.getByRole('status')).toHaveText('已记下，谢谢。我们会查看这条反馈，不会改动课程。');
  expect(feedback.posts).toHaveLength(2);
});

test('T21A / F8.5: "less correction" is sent with the turn, hides coach notes when the meaning was clear, and is remembered', async ({ page, context, baseURL }) => {
  const bodies = await routePractice(page, [{ json: reply({ coachNote: coach }) }, { json: reply({ understood: false, coachNote: '想说预订的话，可以说 “I have a booking.”', reply: { text: 'Sorry, do you have a booking?', audioBase64: replyWav, mimeType: 'audio/wav' } }) }]);
  const { main } = await openPractice(page, context, baseURL);
  const amount = panel(main).getByRole('group', { name: '纠正多少', exact: true });
  await expect(amount.getByRole('radio', { name: '正常', exact: true })).toBeChecked();
  await amount.getByRole('radio', { name: '少纠正', exact: true }).check();
  await installMic(page);
  await speak(panel(main));
  await expect(panel(main).getByTestId('practice-reply')).toHaveText('Great. May I see your passport?');
  await expect(panel(main).getByTestId('practice-coach')).toHaveCount(0);
  // Meaning unclear: the necessary clarification still comes through.
  await speak(panel(main));
  await expect(panel(main).getByTestId('practice-coach')).toContainText('I have a booking.');
  expect(bodies.map(b => b.correction)).toEqual(['less', 'less']);
  await panel(main).getByRole('button', { name: '需要提示', exact: true }).click();
  await main.getByRole('button', { name: '下一步：开口对练', exact: true }).click();
  await expect(panel(main).getByRole('group', { name: '纠正多少', exact: true }).getByRole('radio', { name: '少纠正', exact: true })).toBeChecked();
});

test('T21A: if this browser cannot store the correction setting, practice still works with the setting for this visit', async ({ page, context, baseURL }) => {
  await context.addInitScript(() => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) { if (String(key).startsWith('les.practice.correction')) throw new DOMException('blocked', 'SecurityError'); return get.call(this, key); };
    Storage.prototype.setItem = function (key, value) { if (String(key).startsWith('les.practice.correction')) throw new DOMException('blocked', 'SecurityError'); return set.call(this, key, value); };
  });
  const bodies = await routePractice(page, [{ json: reply() }]);
  const { main } = await openPractice(page, context, baseURL);
  const amount = panel(main).getByRole('group', { name: '纠正多少', exact: true });
  await expect(amount.getByRole('radio', { name: '正常', exact: true })).toBeChecked();
  await amount.getByRole('radio', { name: '少纠正', exact: true }).check();
  await expect(amount.getByRole('radio', { name: '少纠正', exact: true })).toBeChecked();
  await installMic(page);
  await speak(panel(main));
  await expect(panel(main).getByTestId('practice-reply')).toHaveText('Great. May I see your passport?');
  expect(bodies[0].correction).toBe('less');
});

// ---- T23A: review after practice ----

test('T23A / F10.1: "end practice" shows what was answered and how much help was used, from this visit only', async ({ page, context, baseURL }) => {
  test.setTimeout(45_000);
  const bodies = await routePractice(page, [{ json: reply() }]);
  const { main } = await openPractice(page, context, baseURL, { changeCourse: twoTurns });
  await panel(main).getByRole('button', { name: '帮我理解', exact: true }).click();
  await panel(main).getByRole('button', { name: '需要提示', exact: true }).click();
  await main.getByRole('button', { name: '下一步：开口对练', exact: true }).click();
  await installMic(page);
  await speak(panel(main));
  await expect(panel(main).getByTestId('practice-reply')).toHaveText('Great. May I see your passport?');
  await panel(main).getByRole('button', { name: '下一回合', exact: true }).click();
  // Stay quiet on the second turn until proactive help appears once.
  await expect(panel(main).getByTestId('practice-auto-help')).toBeVisible({ timeout: 12_000 });
  const api = countApi(page);
  await panel(main).getByRole('button', { name: '结束练习', exact: true }).click();
  const ending = panel(main).getByTestId('practice-ending');
  await expect(ending.getByRole('heading', { name: '练习结束了', exact: true })).toBeVisible();
  const review = ending.getByTestId('practice-review');
  await expect(review.getByRole('heading', { name: '这次练习回顾', exact: true })).toBeVisible();
  await expect(review).toContainText('第 1 回合：你开口说了“Yes, I booked a room.”');
  await expect(review).toContainText('第 2 回合：没有开口，尚不能判断');
  await expect(review).toContainText('看提示：1 次');
  await expect(review).toContainText('主动帮助：1 次');
  await expect(review).toContainText('母语解释：1 次');
  await expect(review).toContainText('能不能应对没练过的问法：尚不能判断');
  for (const word of ['掌握', '发音', '分数', '%', '口音', '学会']) await expect(review).not.toContainText(word);
  await page.waitForTimeout(300);
  expect(api).toEqual([]);
  expect(bodies).toHaveLength(1);
});

test('T23A / F10.5: a review with nothing said shows every turn as not yet observed, and the learner can keep practising', async ({ page, context, baseURL }) => {
  const { main } = await openPractice(page, context, baseURL, { changeCourse: twoTurns });
  await panel(main).getByRole('checkbox', { name: '我没开口时主动给提示', exact: true }).uncheck();
  await panel(main).getByRole('button', { name: '结束练习', exact: true }).click();
  const review = panel(main).getByTestId('practice-review');
  await expect(review).toContainText('第 1 回合：没有开口，尚不能判断');
  await expect(review).toContainText('第 2 回合：没有开口，尚不能判断');
  await expect(review).toContainText('看提示：0 次');
  await expect(review).not.toContainText('你开口说了');
  await panel(main).getByTestId('practice-ending').getByRole('button', { name: '继续练', exact: true }).click();
  await expect(panel(main).getByTestId('practice-ending')).toHaveCount(0);
  await expect(panel(main).getByRole('button', { name: '开始说', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.t69MicCalls)).toBe(0);
});

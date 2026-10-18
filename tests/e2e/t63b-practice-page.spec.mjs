import { test, expect } from '@playwright/test';
import { setupGuided, enterTerms, assertSameMedia, hotelSample, guidedId, guidedRevision, guidedMaterials } from '../fixtures/t69-guided-browser.mjs';
import { startPracticeSetup } from '../fixtures/c10-shell.mjs';

// T63B / K5.3, J5: the fifth page lets the learner answer the partner out loud. The microphone is only requested
// after an explicit start, the turn is sent once after the learner says they are done, silence never advances,
// failures are never retried automatically, and nothing claims to judge pronunciation.
test.use({ locale: 'zh-CN' });

const voice = 'synthetic learner voice';
const replyWav = Buffer.from('RIFF$\u0000\u0000\u0000WAVEfmt ').toString('base64');
const reply = (over = {}) => ({ kind: 'reply', transcript: 'Yes, I booked a room.', understood: true, reply: { text: 'Great. May I see your passport?', audioBase64: replyWav, mimeType: 'audio/wav' }, ...over });

// Replace the guided fixture's always-denying microphone with a synthetic recorder after the page has loaded.
async function installMic(page, { deny = false } = {}) {
  await page.evaluate(({ deny, voice }) => {
    window.t63Stopped = 0;
    navigator.mediaDevices.getUserMedia = async constraints => {
      window.t69MicCalls++; window.t63Constraints = constraints;
      if (deny) throw new DOMException('Denied by synthetic test', 'NotAllowedError');
      return { getTracks: () => [{ stop: () => { window.t63Stopped++; } }] };
    };
    class SyntheticRecorder extends EventTarget {
      static isTypeSupported(type) { return type.startsWith('audio/webm'); }
      constructor(stream, options) { super(); this.stream = stream; this.mimeType = 'audio/webm'; this.state = 'inactive'; window.t63RecorderOptions = options; }
      start() { this.state = 'recording'; this.fire('start'); }
      stop() {
        if (this.state !== 'recording') return;
        this.state = 'inactive';
        this.fire('dataavailable', { data: new Blob([voice], { type: 'audio/webm' }) });
        this.fire('stop');
      }
      fire(type, extra = {}) { const event = Object.assign(new Event(type), extra); this.dispatchEvent(event); this[`on${type}`]?.(event); }
    }
    window.MediaRecorder = SyntheticRecorder;
  }, { deny, voice });
}

async function routePractice(page, responses) {
  const bodies = [];
  await page.route('**/api/practice-turn', async route => {
    expect(route.request().method()).toBe('POST');
    bodies.push(route.request().postDataJSON());
    const next = responses[Math.min(bodies.length - 1, responses.length - 1)];
    return route.fulfill({ status: next.status ?? 200, json: next.json });
  });
  return bodies;
}

async function openPractice(page, context, baseURL, options) {
  const guided = await setupGuided(page, context, baseURL, options);
  await enterTerms(guided.main);
  await guided.main.getByRole('button', { name: '下一步：句子', exact: true }).click();
  await guided.main.getByRole('button', { name: '下一步：提示接话', exact: true }).click();
  await guided.main.getByRole('button', { name: '下一步：开口对练', exact: true }).click();
  await expect(guided.main.getByRole('heading', { name: '开口对练', exact: true })).toBeVisible();
  await startPracticeSetup(guided.main);
  return guided;
}
const panel = main => main.getByTestId('scene-panel-5');
const twoTurns = course => {
  const [partner, learner] = course.lines;
  // Later, non-overlapping segments of the same existing media so the course still passes material validation.
  course.lines.push({ ...structuredClone(partner), id: 'line-2', text: 'May I see your passport?', start: 8, end: 9.5 }, { ...structuredClone(learner), id: 'line-3', text: 'Here you are.', start: 10, end: 11.5 });
  course.turns.push({ partnerLineId: 'line-2', learnerLineId: 'line-3' });
};

test('T63B / K5.3: the practice page shows only the partner line and never asks for the microphone on its own', async ({ page, context, baseURL }) => {
  const bodies = await routePractice(page, [{ json: reply() }]);
  const { main, state } = await openPractice(page, context, baseURL);
  await expect(panel(main).getByTestId('practice-partner')).toHaveText(hotelSample.lines[0].text);
  await expect(panel(main).getByTestId('practice-partner')).toHaveAttribute('lang', 'en');
  await expect(panel(main)).not.toContainText(hotelSample.lines[1].text);
  await expect(panel(main).getByRole('button', { name: '开始说', exact: true })).toBeEnabled();
  await expect(panel(main).getByRole('button', { name: '说完了', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.t69MicCalls)).toBe(0);
  expect(bodies).toHaveLength(0);
  await panel(main).getByRole('button', { name: '需要提示', exact: true }).click();
  await expect(main.getByTestId('scene-answer')).toHaveText(hotelSample.lines[1].text);
  assertSameMedia(state);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
});

test('T63B / K5.3: one spoken turn is sent once after the learner finishes and the partner answers in text and voice', async ({ page, context, baseURL }) => {
  const bodies = await routePractice(page, [{ json: reply() }]);
  const { main, state } = await openPractice(page, context, baseURL);
  await installMic(page);
  await panel(main).getByRole('button', { name: '开始说', exact: true }).click();
  await expect(panel(main).getByText('正在听你说…', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.t69MicCalls)).toBe(1);
  expect(await page.evaluate(() => window.t63Constraints)).toEqual({ audio: true });
  expect(bodies).toHaveLength(0);
  await panel(main).getByRole('button', { name: '说完了', exact: true }).click();
  await expect(panel(main).getByTestId('practice-reply')).toHaveText('Great. May I see your passport?');
  await expect(panel(main).getByTestId('practice-reply')).toHaveAttribute('lang', 'en');
  await expect(panel(main).getByTestId('practice-heard')).toContainText('Yes, I booked a room.');
  await expect(panel(main).getByTestId('practice-reply-audio')).toHaveAttribute('src', `data:audio/wav;base64,${replyWav}`);
  expect(bodies).toEqual([{ courseId: guidedId, revision: guidedRevision, materialsRevision: guidedMaterials, turnIndex: 0, language: 'zh-Hans', history: [], mimeType: 'audio/webm', audioBase64: Buffer.from(voice).toString('base64') }]);
  expect(await page.evaluate(() => window.t63Stopped)).toBe(1);
  await expect(main).not.toContainText('发音正确'); await expect(main).not.toContainText('评分：'); await expect(main).not.toContainText('分数');
  assertSameMedia(state);
});

test('T63B / K5.3: the next turn carries the earlier exchange as history and plays the next partner line', async ({ page, context, baseURL }) => {
  const bodies = await routePractice(page, [{ json: reply() }, { json: reply({ transcript: 'Here you are.', reply: { text: 'Thank you. Enjoy your stay.', audioBase64: replyWav, mimeType: 'audio/wav' } }) }]);
  const { main } = await openPractice(page, context, baseURL, { changeCourse: twoTurns });
  await installMic(page);
  await panel(main).getByRole('button', { name: '开始说', exact: true }).click();
  await panel(main).getByRole('button', { name: '说完了', exact: true }).click();
  await expect(panel(main).getByTestId('practice-reply')).toHaveText('Great. May I see your passport?');
  await panel(main).getByRole('button', { name: '下一回合', exact: true }).click();
  await expect(panel(main).getByTestId('practice-partner')).toHaveText('May I see your passport?');
  await expect(panel(main).getByTestId('practice-reply')).toHaveCount(0);
  await panel(main).getByRole('button', { name: '开始说', exact: true }).click();
  await panel(main).getByRole('button', { name: '说完了', exact: true }).click();
  await expect(panel(main).getByTestId('practice-reply')).toHaveText('Thank you. Enjoy your stay.');
  expect(bodies[1]).toMatchObject({ turnIndex: 1, history: [{ learner: 'Yes, I booked a room.', partner: 'Great. May I see your passport?' }] });
  await expect(panel(main).getByRole('button', { name: '下一回合', exact: true })).toHaveCount(0);
});

test('T63B / K5.3: silence is reported honestly and does not advance or invent a reply', async ({ page, context, baseURL }) => {
  const bodies = await routePractice(page, [{ json: { kind: 'silence' } }]);
  const { main } = await openPractice(page, context, baseURL);
  await installMic(page);
  await panel(main).getByRole('button', { name: '开始说', exact: true }).click();
  await panel(main).getByRole('button', { name: '说完了', exact: true }).click();
  await expect(panel(main).getByText('没听到声音，可以再说一次或看提示。', { exact: true })).toBeVisible();
  await expect(panel(main).getByTestId('practice-reply')).toHaveCount(0);
  await expect(panel(main).getByTestId('practice-partner')).toHaveText(hotelSample.lines[0].text);
  await expect(panel(main).getByRole('button', { name: '开始说', exact: true })).toBeEnabled();
  expect(bodies).toHaveLength(1);
});

for (const [name, status, error, message] of [
  ['an unavailable service', 503, 'practice_unavailable', '语音对练尚未开通，可以先看提示跟读。'],
  ['an exhausted budget', 429, 'budget', '本批语音对练额度已用完。'],
  ['a failed turn', 502, 'failed', '这一轮没有完成，可以再试一次。'],
  ['an expired session', 401, 'unauthenticated', '请重新登录后再对练。'],
]) test(`T63B / K5.3: ${name} shows an honest message and is never retried automatically`, async ({ page, context, baseURL }) => {
  const bodies = await routePractice(page, [{ status, json: { error } }]);
  const { main } = await openPractice(page, context, baseURL);
  await installMic(page);
  await panel(main).getByRole('button', { name: '开始说', exact: true }).click();
  await panel(main).getByRole('button', { name: '说完了', exact: true }).click();
  await expect(panel(main).getByRole('alert')).toHaveText(message);
  await page.waitForTimeout(300);
  expect(bodies).toHaveLength(1);
  await expect(panel(main).getByTestId('practice-reply')).toHaveCount(0);
  expect(await page.evaluate(() => window.t63Stopped)).toBe(1);
});

test('T63B / K5.3: a refused microphone leaves the hint path open and sends nothing', async ({ page, context, baseURL }) => {
  const bodies = await routePractice(page, [{ json: reply() }]);
  const { main } = await openPractice(page, context, baseURL);
  await installMic(page, { deny: true });
  await panel(main).getByRole('button', { name: '开始说', exact: true }).click();
  await expect(panel(main).getByRole('alert')).toHaveText('无法使用麦克风，可以先看提示跟读。');
  await expect(panel(main).getByRole('button', { name: '需要提示', exact: true })).toBeVisible();
  expect(bodies).toHaveLength(0);
});

test('T63B / K5.3: the prompt page no longer claims free conversation is missing but stays honest that it does not record', async ({ page, context, baseURL }) => {
  const { main } = await setupGuided(page, context, baseURL);
  await enterTerms(main);
  await main.getByRole('button', { name: '下一步：句子', exact: true }).click();
  await main.getByRole('button', { name: '下一步：提示接话', exact: true }).click();
  await expect(main.getByTestId('scene-panel-4')).toContainText('这一步不录音、不评分');
  await expect(main.getByTestId('scene-panel-4')).not.toContainText('自由对话');
});

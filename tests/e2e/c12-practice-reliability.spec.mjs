import { test, expect } from '@playwright/test';
import { installMic, routePractice, openPractice, panel, twoTurns, reply, voice, installLevel, setLevel, recordPlays, plays, recordObjectUrls, speakFor } from '../fixtures/c12-practice-browser.mjs';
import { hotelSample } from '../fixtures/t69-guided-browser.mjs';
import { routeReviews } from '../fixtures/c9-practice-browser.mjs';
import { openMore, openHelp, closeHelp } from '../fixtures/c10-shell.mjs';

// C12 (2026-10-18, research reports 1 and 2): practice that is more reliable, at zero cost. C12-1 a recording with
// no real sound is not sent; C12-3 the page says how many turns are left today and what happens past the limit;
// C12-4 a refused autoplay becomes a button, "start" unlocks the reply audio, a hanging microphone request is
// explained, the microphone asks for echo cancellation; C12-5 "hear myself / hear the model" and a side-by-side view.
// The microphone, the sound level and every reply are synthetic: nothing here calls a model.
test.use({ locale: 'zh-CN' });
const [, model] = hotelSample.lines;
const mp3Reply = (over = {}) => reply({ reply: { text: 'Great. May I see your passport?', audioBase64: Buffer.from('ID3 synthetic mp3').toString('base64'), mimeType: 'audio/mpeg' }, ...over });
const QUIET = '没听到声音，可以再说一次，或者点“需要提示”。';
const noScores = async scope => { const text = await scope.innerText(); expect(text).not.toMatch(/%|\d+\s*分|评分|得分|掌握|score/i); };

// ---- C12-1: silence is not sent ----

for (const [name, level] of [['silence', 0], ['near silence', 0.005]]) test(`C12-1 / F8.4: a recording of ${name} is not sent and the page says it heard nothing`, async ({ page, context, baseURL }) => {
  const bodies = await routePractice(page, [{ json: reply() }]);
  const { main } = await openPractice(page, context, baseURL);
  await installMic(page); await installLevel(page, level);
  await speakFor(panel(main), page);
  await expect(panel(main).getByText(QUIET, { exact: true })).toBeVisible();
  await page.waitForTimeout(300);
  expect(bodies).toHaveLength(0);
  await expect(panel(main).getByTestId('practice-reply')).toHaveCount(0);
  await expect(panel(main).getByRole('button', { name: '开始说', exact: true })).toBeEnabled();
  await expect(panel(main).getByRole('button', { name: '需要提示', exact: true })).toBeEnabled();
  // The microphone was given back.
  expect(await page.evaluate(() => window.t63Stopped)).toBeGreaterThanOrEqual(1);
});

test('C12-1 / F8.4: a recording with a voice is sent exactly once', async ({ page, context, baseURL }) => {
  const bodies = await routePractice(page, [{ json: reply() }]);
  const { main } = await openPractice(page, context, baseURL);
  await installMic(page); await installLevel(page, 0.2);
  await speakFor(panel(main), page);
  await expect(panel(main).getByTestId('practice-reply')).toHaveText('Great. May I see your passport?');
  expect(bodies).toHaveLength(1);
  expect(bodies[0].audioBase64).toBe(Buffer.from(voice).toString('base64'));
  await expect(panel(main).getByText(QUIET, { exact: true })).toHaveCount(0);
});

test('C12-1: after a quiet try, speaking up on the next try is sent', async ({ page, context, baseURL }) => {
  const bodies = await routePractice(page, [{ json: reply() }]);
  const { main } = await openPractice(page, context, baseURL);
  await installMic(page); await installLevel(page, 0);
  await speakFor(panel(main), page);
  await expect(panel(main).getByText(QUIET, { exact: true })).toBeVisible();
  await setLevel(page, 0.2);
  await speakFor(panel(main), page);
  await expect(panel(main).getByTestId('practice-reply')).toBeVisible();
  expect(bodies).toHaveLength(1);
});

// ---- C12-3: turns left today, and the daily limit ----

test('C12-3 / F14.1: after a turn "more help" says how many turns are left today, with no money shown', async ({ page, context, baseURL }) => {
  await routePractice(page, [{ json: { ...reply(), remainingToday: 12 } }]);
  const { main } = await openPractice(page, context, baseURL);
  await installMic(page); await installLevel(page, 0.2);
  await speakFor(panel(main), page);
  await expect(panel(main).getByTestId('practice-reply')).toBeVisible();
  const sheet = await openHelp(main);
  await expect(sheet.getByTestId('practice-quota')).toHaveText('今天还能对练 12 轮');
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/USD|\$|美元/);
  await closeHelp(main);
});

test('C12-3 / F14.1: past the daily limit the page says so; listening, replay and hints still work', async ({ page, context, baseURL }) => {
  const bodies = await routePractice(page, [{ status: 429, json: { error: 'daily_limit' } }]);
  const { main } = await openPractice(page, context, baseURL);
  await installMic(page); await installLevel(page, 0.2);
  await speakFor(panel(main), page);
  await expect(panel(main).getByText('今天的对练次数用完了，可以继续听和看', { exact: true })).toBeVisible();
  expect(bodies).toHaveLength(1);
  await expect(panel(main).getByRole('button', { name: '开始说', exact: true })).toBeDisabled();
  await recordPlays(page);
  await panel(main).getByRole('button', { name: '重听对方', exact: true }).click();
  await expect.poll(async () => (await plays(page)).length).toBeGreaterThanOrEqual(1);
  await panel(main).getByRole('button', { name: '帮我理解', exact: true }).click();
  await expect(panel(main).getByTestId('partner-help')).toBeVisible();
  await expect(panel(main).getByRole('button', { name: '需要提示', exact: true })).toBeEnabled();
  const sheet = await openHelp(main);
  await expect(sheet.getByTestId('practice-quota')).toHaveText('今天还能对练 0 轮');
  expect(await page.locator('body').innerText()).not.toMatch(/USD|\$|美元/);
});

test('C12-3: too many turns in one minute asks to wait a moment, without blocking the microphone for the day', async ({ page, context, baseURL }) => {
  await routePractice(page, [{ status: 429, json: { error: 'rate_limit' } }]);
  const { main } = await openPractice(page, context, baseURL);
  await installMic(page); await installLevel(page, 0.2);
  await speakFor(panel(main), page);
  await expect(panel(main).getByText('说得有点快，请等一分钟再试。', { exact: true })).toBeVisible();
  await expect(panel(main).getByRole('button', { name: '开始说', exact: true })).toBeEnabled();
});

// ---- C12-4: playback on phones and a hanging microphone request ----

test('C12-4 / F13.4: when the phone refuses to autoplay the reply, one tap in the bubble plays it', async ({ page, context, baseURL }) => {
  await routePractice(page, [{ json: mp3Reply() }]);
  const { main } = await openPractice(page, context, baseURL);
  await installMic(page); await installLevel(page, 0.2);
  await recordPlays(page, { reject: true });
  await speakFor(panel(main), page);
  await expect(panel(main).getByTestId('practice-reply')).toBeVisible();
  await expect(panel(main).getByTestId('practice-reply-audio')).toHaveAttribute('src', /^data:audio\/mpeg;base64,/);
  const tap = panel(main).getByRole('button', { name: '点这里听对方的回答', exact: true });
  await expect(tap).toBeVisible();
  // The button sits in the partner's reply bubble.
  expect(await tap.evaluate(el => !!el.closest('.bubble--partner'))).toBe(true);
  await page.evaluate(() => { window.c12Reject = false; window.c12Plays = []; });
  await tap.click();
  await expect.poll(async () => (await plays(page)).filter(p => p.testid === 'practice-reply-audio').length).toBe(1);
  await expect(tap).toHaveCount(0);
});

test('C12-4 / F13.4: when autoplay works no extra button appears', async ({ page, context, baseURL }) => {
  await routePractice(page, [{ json: mp3Reply() }]);
  const { main } = await openPractice(page, context, baseURL);
  await installMic(page); await installLevel(page, 0.2);
  await recordPlays(page);
  await speakFor(panel(main), page);
  await expect(panel(main).getByTestId('practice-reply')).toBeVisible();
  await expect.poll(async () => (await plays(page)).filter(p => p.testid === 'practice-reply-audio' && !p.muted).length).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(300);
  await expect(panel(main).getByRole('button', { name: '点这里听对方的回答', exact: true })).toHaveCount(0);
});

test('C12-4 / F13.4: pressing "start" first unlocks the reused reply audio element, muted', async ({ page, context, baseURL }) => {
  await routePractice(page, [{ json: mp3Reply() }]);
  const { main } = await openPractice(page, context, baseURL);
  await installMic(page); await installLevel(page, 0.2);
  await recordPlays(page);
  await expect(panel(main).getByTestId('practice-reply-audio')).toHaveCount(1);
  await panel(main).getByRole('button', { name: '开始说', exact: true }).click();
  await expect(panel(main).getByRole('button', { name: '说完了', exact: true })).toBeVisible();
  const unlocks = (await plays(page)).filter(p => p.testid === 'practice-reply-audio');
  expect(unlocks.length).toBe(1);
  expect(unlocks[0].muted).toBe(true);
  // The microphone asks for echo cancellation, noise suppression and automatic gain.
  expect(await page.evaluate(() => window.t63Constraints)).toEqual({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
});

test('C12-4 / F1.3: a microphone request that never answers is explained after 8 seconds', async ({ page, context, baseURL }) => {
  test.setTimeout(40_000);
  const bodies = await routePractice(page, [{ json: reply() }]);
  const { main } = await openPractice(page, context, baseURL);
  await installMic(page);
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => new Promise(() => {}); });
  await panel(main).getByRole('button', { name: '开始说', exact: true }).click();
  const stuck = panel(main).getByText('麦克风没有反应。如果在微信或其他应用里，请在系统浏览器打开再试。', { exact: true });
  await page.waitForTimeout(5000);
  await expect(stuck).toHaveCount(0);
  await expect(stuck).toBeVisible({ timeout: 6000 });
  await expect(panel(main).getByRole('button', { name: '开始说', exact: true })).toBeEnabled();
  expect(bodies).toHaveLength(0);
});

// ---- C12-5: hear myself and the model; side by side ----

test('C12-5 / F4.5: after a reply the learner can hear their own recording and the model, and the recording stays in the page', async ({ page, context, baseURL }) => {
  const api = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) api.push({ path: new URL(request.url()).pathname, body: request.postData() ?? '' }); });
  await routePractice(page, [{ json: reply() }, { json: reply({ transcript: 'Here you are.', reply: { text: 'Thank you.', audioBase64: reply().reply.audioBase64, mimeType: 'audio/wav' } }) }]);
  const { main } = await openPractice(page, context, baseURL, { changeCourse: twoTurns });
  await installMic(page); await installLevel(page, 0.2); await recordObjectUrls(page);
  await speakFor(panel(main), page);
  await expect(panel(main).getByTestId('practice-reply')).toBeVisible();
  const mine = panel(main).getByTestId('practice-self');
  await recordPlays(page);
  await mine.getByRole('button', { name: '听我刚才说的', exact: true }).click();
  await expect.poll(async () => (await plays(page)).filter(p => p.blob).length).toBe(1);
  await mine.getByRole('button', { name: '听示范', exact: true }).click();
  await expect.poll(async () => (await plays(page)).filter(p => p.tag === 'video').length).toBeGreaterThanOrEqual(1);
  await expect(panel(main).getByTestId('practice-model-line')).toContainText(model.text);
  const created = await page.evaluate(() => window.c12Created);
  expect(created.length).toBe(1);
  expect(created[0]).toMatch(/^blob:/);
  await noScores(panel(main));
  // Changing the turn lets the recording go.
  await panel(main).getByRole('button', { name: '下一回合', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.c12Revoked)).toContain(created[0]);
  await expect(panel(main).getByRole('button', { name: '听我刚才说的', exact: true })).toHaveCount(0);
  // The recording went out once, to be transcribed, and nowhere else.
  const withVoice = api.filter(item => item.body.includes(Buffer.from(voice).toString('base64')));
  expect(withVoice.map(item => item.path)).toEqual(['/api/practice-turn']);
});

test('C12-5: a second try on the same turn releases the first recording', async ({ page, context, baseURL }) => {
  await routePractice(page, [{ json: reply() }]);
  const { main } = await openPractice(page, context, baseURL);
  await installMic(page); await installLevel(page, 0.2); await recordObjectUrls(page);
  await speakFor(panel(main), page);
  await expect(panel(main).getByTestId('practice-self')).toBeVisible();
  await speakFor(panel(main), page);
  await expect.poll(() => page.evaluate(() => window.c12Created.length)).toBe(2);
  const created = await page.evaluate(() => window.c12Created);
  await expect.poll(() => page.evaluate(() => window.c12Revoked)).toContain(created[0]);
  expect(await page.evaluate(() => window.c12Revoked)).not.toContain(created[1]);
});

test('C12-5 / F10.1: the review shows "you said / model" side by side per turn, plays the model, and saves no transcript', async ({ page, context, baseURL }) => {
  await routePractice(page, [{ json: reply() }]);
  const reviews = await routeReviews(page, baseURL);
  const { main } = await openPractice(page, context, baseURL, { changeCourse: twoTurns });
  await installMic(page); await installLevel(page, 0.2);
  await speakFor(panel(main), page);
  await expect(panel(main).getByTestId('practice-reply')).toBeVisible();
  await openMore(main);
  await panel(main).getByRole('button', { name: '结束练习', exact: true }).click();
  const ending = panel(main).getByTestId('practice-ending');
  await ending.locator('details[data-testid="review-turns"] summary').click();
  const compare = ending.getByTestId('review-compare');
  await expect(compare).toHaveCount(1);
  await expect(compare.getByTestId('review-compare-said')).toContainText('Yes, I booked a room.');
  await expect(compare.getByTestId('review-compare-model')).toContainText(model.text);
  await expect(compare.getByText('你说的', { exact: true })).toBeVisible();
  await expect(compare.getByText('示范句', { exact: true })).toBeVisible();
  await recordPlays(page);
  await compare.getByRole('button', { name: '听示范', exact: true }).click();
  await expect.poll(async () => (await plays(page)).filter(p => p.tag === 'video').length).toBeGreaterThanOrEqual(1);
  await expect.poll(() => reviews.posts.length).toBe(1);
  expect(JSON.stringify(reviews.posts[0])).not.toContain('Yes, I booked a room.');
  expect(JSON.stringify(reviews.posts[0])).not.toContain(model.text);
  await noScores(ending);
});

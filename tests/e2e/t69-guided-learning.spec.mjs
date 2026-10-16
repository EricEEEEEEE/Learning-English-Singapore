import { test, expect } from '@playwright/test';
import { setupGuided, enterRole, enterTerms, assertSameMedia, hotelRequirement, hotelSample } from '../fixtures/t69-guided-browser.mjs';

test.use({ locale: 'zh-CN' });

test('T69 / K4.2: the main course opens as a single watching page with its actual short duration and English subtitles', async ({ page, context, baseURL }) => {
  const { main, state } = await setupGuided(page, context, baseURL);
  await expect(main.getByRole('heading', { name: '看一遍这个场景', exact: true })).toBeVisible();
  await expect(main).toContainText('约12秒'); await expect(main).toContainText('非5–8分钟完整课程');
  await expect(main.getByTestId('scene-step-2')).toHaveCount(0); await expect(main.getByTestId('scene-panel-2')).toHaveCount(0);
  await expect(main.getByTestId('scene-learner-role')).toHaveCount(0);
  const video = main.locator('video'); await expect.poll(() => video.evaluate(v => v.readyState)).toBeGreaterThanOrEqual(2);
  await main.getByTestId('scene-play').click();
  await video.evaluate(v => { v.currentTime = 1.2; v.dispatchEvent(new Event('timeupdate')); });
  await expect(main.getByTestId('scene-caption')).toHaveText(hotelSample.lines[0].text);
  await expect(main.getByTestId('scene-caption')).toHaveAttribute('lang', 'en');
  await expect(main.getByTestId('scene-panel-1')).not.toContainText(hotelSample.lines[0].translations['zh-Hans']);
  await expect(main.getByTestId('scene-translation')).toHaveCount(0);
  expect(await page.evaluate(() => window.t69MicCalls)).toBe(0);
  assertSameMedia(state);
});

test('T69 / K4.3: full watching end offers replay or continuing without automatically leaving or forcing completion', async ({ page, context, baseURL }) => {
  const { main } = await setupGuided(page, context, baseURL);
  await expect(main.getByRole('heading', { name: '看一遍这个场景', exact: true })).toBeVisible();
  const video = main.locator('video'); await expect.poll(() => video.evaluate(v => v.readyState)).toBeGreaterThanOrEqual(2);
  await main.getByTestId('scene-play').click();
  // Synthetic end event checks the transition only; it is not evidence of watching 12 seconds.
  await video.evaluate(v => { v.currentTime = v.duration; v.dispatchEvent(new Event('ended')); });
  await expect(main.getByText('场景看完了。可以重播，或进入角色学习。', { exact: true })).toBeVisible();
  await expect(main.getByRole('heading', { name: '看一遍这个场景', exact: true })).toBeVisible();
  await main.getByTestId('scene-replay').click();
  await expect.poll(() => video.evaluate(v => v.currentTime)).toBeLessThan(1);
  await expect(main.getByText('场景看完了。可以重播，或进入角色学习。', { exact: true })).toHaveCount(0);
  await enterRole(main); await expect(main.getByRole('heading', { name: '现在轮到你', exact: true })).toBeVisible();
});

test('T69 / K4.2: the displayed duration comes from the selected course rather than a hard-coded hotel length', async ({ page, context, baseURL }) => {
  // Synthetic metadata checks the renderer only; the 12-second bytes are not claimed to be 21 seconds long.
  await page.addInitScript(() => Object.defineProperty(HTMLMediaElement.prototype, 'duration', { configurable: true, get: () => 21.25 }));
  const { main } = await setupGuided(page, context, baseURL, { changeCourse(course) { course.media.duration = 21.25; } });
  await expect(main.getByRole('heading', { name: '看一遍这个场景', exact: true })).toBeVisible();
  await expect(main).toContainText('约21秒'); await expect(main).not.toContainText('约12秒');
});

test('T69 / K5.1: manual early continue pauses the video and uses the watched historical role rather than a newer draft', async ({ page, context, baseURL }) => {
  const record = hotelRequirement(), latest = hotelRequirement(); latest.revision = 3;
  latest.content.keywords.learnerRole = '未来版本的导游'; latest.content.keywords.partnerRole = '未来版本的游客';
  const { main, state } = await setupGuided(page, context, baseURL, { record, latest });
  const video = main.locator('video'); await main.getByTestId('scene-play').click();
  await enterRole(main);
  await expect(main.getByRole('heading', { name: '现在轮到你', exact: true })).toBeVisible();
  await expect(main.getByTestId('scene-learner-role')).toContainText('住客'); await expect(main.getByTestId('scene-partner-role')).toContainText('酒店前台');
  await expect(main).toContainText('本次需求中的身份'); await expect(main).not.toContainText('未来版本');
  await expect(video).toHaveJSProperty('paused', true);
  await main.getByRole('button', { name: '重看场景', exact: true }).click();
  await expect(main.getByRole('heading', { name: '看一遍这个场景', exact: true })).toBeVisible();
  assertSameMedia(state);
});

test('T69 / K5.1: blank role keywords use a neutral responder label without inventing an occupation', async ({ page, context, baseURL }) => {
  const record = hotelRequirement(); record.content.keywords.learnerRole = ' '; record.content.keywords.partnerRole = '';
  const { main } = await setupGuided(page, context, baseURL, { record }); await enterRole(main);
  await expect(main.getByTestId('scene-learner-role')).toContainText('场景中回答的一方');
  await expect(main.getByTestId('scene-partner-role')).toContainText('对方');
  await expect(main.getByTestId('scene-learner-role')).not.toContainText('住客'); await expect(main.getByTestId('scene-partner-role')).not.toContainText('酒店前台');
});

test('T69 / K5.2: terms sentences and prompted answers form one-step navigation and all return to the same media', async ({ page, context, baseURL }) => {
  const { main, state } = await setupGuided(page, context, baseURL); await enterTerms(main);
  await expect(main.getByTestId('scene-panel-2')).toBeVisible(); await expect(main.getByTestId('scene-panel-3')).toHaveCount(0); await expect(main.getByTestId('scene-panel-4')).toHaveCount(0);
  await expect(main.getByTestId('scene-term').first()).toContainText(hotelSample.phrases[0].translations['zh-Hans']);
  await main.getByRole('button', { name: '下一步：句子', exact: true }).click();
  await expect(main.getByTestId('scene-panel-2')).toHaveCount(0); await expect(main.getByTestId('scene-sentence').first()).toContainText(hotelSample.lines[0].translations['zh-Hans']);
  await main.getByRole('button', { name: '下一步：提示接话', exact: true }).click();
  await expect(main.getByTestId('scene-partner')).toHaveText(hotelSample.lines[0].text); await expect(main.getByTestId('scene-answer')).toHaveText(hotelSample.lines[1].text);
  await expect(main).toContainText('尚无录音、识别、评分或自由对话');
  await main.getByRole('button', { name: '上一步：句子', exact: true }).click();
  await main.getByRole('button', { name: '上一步：词组', exact: true }).click();
  await main.getByRole('button', { name: '返回角色说明', exact: true }).click();
  await expect(main.getByTestId('scene-learner-role')).toContainText('住客');
  await main.getByRole('button', { name: '重看场景', exact: true }).click(); await main.getByTestId('scene-replay').click();
  expect(state.courseReads).toHaveLength(1); assertSameMedia(state);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
});

test('T69 / K5.2: actual prompted playback starts the partner first and stops before the existing learner voice', async ({ page, context, baseURL }) => {
  const { main, state } = await setupGuided(page, context, baseURL); await enterTerms(main);
  const video = main.locator('video'); await expect.poll(() => video.evaluate(v => v.readyState)).toBeGreaterThanOrEqual(2);
  await main.getByTestId('scene-term').first().getByRole('button').click();
  await expect.poll(() => video.evaluate(v => !v.paused)).toBe(true);
  expect(await video.evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(hotelSample.lines[0].start);
  await expect.poll(() => video.evaluate(v => v.paused), { timeout: 5000 }).toBe(true);
  expect(await video.evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(hotelSample.lines[0].end - 0.1);
  expect(await video.evaluate(v => v.currentTime)).toBeLessThanOrEqual(hotelSample.lines[0].end + 0.1);
  await main.getByRole('button', { name: '下一步：句子', exact: true }).click();
  await main.getByTestId('scene-sentence').last().getByRole('button').click();
  await expect.poll(() => video.evaluate(v => !v.paused)).toBe(true);
  expect(await video.evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(hotelSample.lines[1].start);
  await expect.poll(() => video.evaluate(v => v.paused), { timeout: 5000 }).toBe(true);
  expect(await video.evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(hotelSample.lines[1].end - 0.1);
  expect(await video.evaluate(v => v.currentTime)).toBeLessThanOrEqual(hotelSample.lines[1].end + 0.1);
  await main.getByRole('button', { name: '下一步：提示接话', exact: true }).click();
  await expect.poll(() => video.evaluate(v => !v.paused)).toBe(true);
  expect(await video.evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(hotelSample.lines[0].start);
  await expect.poll(() => video.evaluate(v => v.paused), { timeout: 5000 }).toBe(true);
  expect(await video.evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(hotelSample.lines[0].end - 0.1);
  expect(await video.evaluate(v => v.currentTime)).toBeLessThanOrEqual(hotelSample.lines[0].end + 0.1);
  expect(await video.evaluate(v => v.currentTime)).toBeLessThan(hotelSample.lines[1].start);
  await expect(main.getByTestId('scene-answer')).toHaveText(hotelSample.lines[1].text);
  await expect(main.getByText('场景看完了。可以重播，或进入角色学习。', { exact: true })).toHaveCount(0);
  await main.getByTestId('scene-answer-play').click(); await expect.poll(() => video.evaluate(v => !v.paused)).toBe(true);
  expect(await video.evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(hotelSample.lines[1].start);
  await main.getByRole('button', { name: '重看场景', exact: true }).click(); await expect(video).toHaveJSProperty('paused', true);
  expect(await page.evaluate(() => window.t69MicCalls)).toBe(0);
  assertSameMedia(state);
});

test('T69 / K5.2: synthetic segment-end events never advance a prompted turn without the explicit next action', async ({ page, context, baseURL }) => {
  const { main, state } = await setupGuided(page, context, baseURL, { changeCourse(course) {
    const translated = text => Object.fromEntries(['zh-Hans', 'id', 'ja', 'ko', 'hi'].map(code => [code, text]));
    course.lines.push({ id: 'synthetic-a2', role: 'partner', text: 'Do you have an ID?', start: 8, end: 8.7, revision: 2, translations: translated('合成第二回合问题') },
      { id: 'synthetic-b2', role: 'learner', text: 'Yes. Here it is.', start: 10, end: 11, revision: 2, translations: translated('合成第二回合答案') });
    course.turns.push({ partnerLineId: 'synthetic-a2', learnerLineId: 'synthetic-b2' });
  } });
  // This extra turn is a protocol fixture, not a claim about speech in the hotel bytes.
  await page.evaluate(() => { HTMLMediaElement.prototype.play = function () { return Promise.resolve(); }; });
  await enterTerms(main); await main.getByRole('button', { name: '下一步：句子', exact: true }).click(); await main.getByRole('button', { name: '下一步：提示接话', exact: true }).click();
  await main.locator('video').evaluate(v => { v.currentTime = 2.5; v.dispatchEvent(new Event('timeupdate')); v.dispatchEvent(new Event('ended')); });
  await expect(main.getByTestId('scene-partner')).toHaveText(hotelSample.lines[0].text);
  await expect(main.getByTestId('scene-answer')).toHaveText(hotelSample.lines[1].text);
  await main.getByTestId('scene-next-turn').click(); await expect(main.getByTestId('scene-partner')).toHaveText('Do you have an ID?');
  await expect(main.getByTestId('scene-answer')).toHaveText('Yes. Here it is.'); assertSameMedia(state);
});

test('T69 / K7: invalid private materials fail without a role page or sample fallback', async ({ page, context, baseURL }) => {
  const { main, state } = await setupGuided(page, context, baseURL, { changeCourse(course) { course.materialsRevision = 99; } });
  await expect(main.getByRole('alert')).toBeVisible(); await expect(main.locator('video')).toHaveCount(0);
  await expect(main.getByRole('button', { name: '进入角色学习', exact: true })).toHaveCount(0); assertSameMedia(state);
});

test('T69 / K7: a test-fixture course cannot replace the generated source advertised by the guided entry', async ({ page, context, baseURL }) => {
  const { main, state } = await setupGuided(page, context, baseURL, { changeCourse(course) { course.source = 'test-fixture'; } });
  await expect(main.getByRole('alert')).toBeVisible(); await expect(main.locator('video')).toHaveCount(0); assertSameMedia(state);
});

test('T69 / K4.3: play rejection remains a watching error and cannot pretend the scene was completed', async ({ page, context, baseURL }) => {
  const { main } = await setupGuided(page, context, baseURL);
  await page.evaluate(() => { HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Synthetic rejection', 'NotAllowedError')); });
  await main.getByTestId('scene-play').click(); await expect(main.getByRole('alert')).toBeVisible();
  await expect(main.getByRole('heading', { name: '看一遍这个场景', exact: true })).toBeVisible();
  await expect(main.getByText('场景看完了。可以重播，或进入角色学习。', { exact: true })).toHaveCount(0);
  await expect(main.getByTestId('scene-learner-role')).toHaveCount(0);
});

test('T69 / K5.2: changing helper language keeps the current learning step and exact course material revision', async ({ page, context, baseURL }) => {
  const { main, state } = await setupGuided(page, context, baseURL); await enterTerms(main);
  await page.getByRole('combobox').selectOption('ko');
  await expect(main.getByTestId('scene-panel-2')).toBeVisible();
  await expect(main.getByTestId('scene-term').first()).toContainText(hotelSample.phrases[0].translations.ko);
  expect(state.courseReads).toHaveLength(1); assertSameMedia(state);
});

const languages = [
  ['zh-Hans', '看一遍这个场景', '进入角色学习', '现在轮到你', '开始学词组'],
  ['id', 'Tonton situasi ini', 'Masuk ke peran Anda', 'Sekarang giliran Anda', 'Mulai frasa'],
  ['ja', 'この場面を見ましょう', '役になって練習', '今度はあなたの番です', 'フレーズから始める'],
  ['ko', '이 상황을 먼저 보세요', '역할 연습으로', '이제 당신 차례예요', '표현부터 시작'],
  ['hi', 'पहले यह दृश्य देखें', 'अपनी भूमिका में जाएँ', 'अब आपकी बारी है', 'वाक्यांशों से शुरू करें'],
];
for (const [language, watch, enter, role, start] of languages) test(`T69 / K5.1: ${language} follows watching role and one learning step without new generation`, async ({ page, context, baseURL }) => {
  const { main, state } = await setupGuided(page, context, baseURL, { record: hotelRequirement(language) });
  await expect(main.getByRole('heading', { name: watch, exact: true })).toBeVisible();
  await main.getByRole('button', { name: enter, exact: true }).click();
  await expect(main.getByRole('heading', { name: role, exact: true })).toBeVisible(); await expect(main.getByTestId('scene-learner-role')).toContainText('住客');
  await main.getByRole('button', { name: start, exact: true }).click(); await expect(main.getByTestId('scene-panel-2')).toBeVisible();
  await expect(main.getByTestId('scene-term').first()).toContainText(hotelSample.phrases[0].translations[language]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width); assertSameMedia(state);
});

import { test, expect } from '@playwright/test';

const languages = [
  ['zh-Hans', '简体中文'], ['id', 'Bahasa Indonesia'],
  ['ja', '日本語'], ['ko', '한국어'], ['hi', 'हिन्दी'],
];
const lines = ['Hello. Checking in?', 'Yes. I booked a room.'];

async function openSample(page, choice = '简体中文') {
  await page.route('**/api/auth/session', route => route.fulfill({ json: { authenticated: false, accountKey: null } }));
  await page.goto('/demo');
  await page.getByRole('button', { name: new RegExp(`^${choice}`) }).click();
  // A learner can discover the real sample from the existing entry screen.
  await page.getByTestId('real-scene-entry').click();
  return page.getByTestId('real-scene-course');
}

test('T59: original video decodes, plays and replays with English-only subtitles', async ({ page }) => {
  const course = await openSample(page);
  await expect(course).toContainText('12秒');
  const video = course.locator('video');
  await expect(video).toHaveCount(1);
  await expect.poll(() => video.evaluate(v => v.readyState)).toBeGreaterThanOrEqual(2);
  const metadata = await video.evaluate(v => ({ duration: v.duration, width: v.videoWidth, height: v.videoHeight }));
  expect(metadata.duration).toBeGreaterThan(12);
  expect(metadata.duration).toBeLessThan(13);
  expect(metadata.width).toBe(720);
  expect(metadata.height).toBe(1280);
  await course.getByTestId('scene-play').click();
  await expect.poll(() => video.evaluate(v => v.currentTime)).toBeGreaterThan(1);
  await expect(video).toHaveJSProperty('muted', false);
  await expect(course.getByTestId('scene-caption')).toHaveText(lines[0]);
  await expect(course.getByTestId('scene-caption')).toHaveAttribute('lang', 'en');
  await expect(course.getByTestId('scene-translation')).toHaveCount(0);
  await video.evaluate(v => { v.currentTime = 6.1; });
  await expect(course.getByTestId('scene-caption')).toHaveText(lines[1]);
  await course.getByTestId('scene-replay').click();
  await expect.poll(() => video.evaluate(v => v.currentTime)).toBeLessThan(1);
});

for (const [code, choice] of languages) test(`T59: ${code} four pages share actual dialogue and can be revisited`, async ({ page }) => {
  const course = await openSample(page, choice);
  await course.getByTestId('scene-step-2').click();
  const terms = course.getByTestId('scene-term');
  expect(await terms.count()).toBeGreaterThanOrEqual(2);
  for (const term of await terms.all()) {
    const english = (await term.locator('[lang="en"]').innerText()).trim().toLowerCase();
    expect(lines.join(' ').toLowerCase()).toContain(english);
    expect((await term.locator(`[lang="${code}"]`).innerText()).trim().length).toBeGreaterThan(0);
    await expect(term.getByRole('button')).toBeEnabled();
  }
  await expect(course).not.toContainText('restaurant');
  await course.getByTestId('scene-step-3').click();
  const sentences = course.getByTestId('scene-sentence');
  await expect(sentences).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    await expect(sentences.nth(i).locator('[lang="en"]')).toHaveText(lines[i]);
    expect((await sentences.nth(i).locator(`[lang="${code}"]`).innerText()).trim().length).toBeGreaterThan(0);
  }
  await course.getByTestId('scene-step-4').click();
  await expect(course.getByTestId('scene-answer')).toHaveText(lines[1]);
  await expect(course.getByTestId('scene-partner')).toHaveText(lines[0]);
  await expect(course.getByTestId('scene-turn-play')).toBeEnabled();
  await expect(course.getByTestId('scene-answer-play')).toBeEnabled();
  for (const step of [1, 3, 2, 4, 1]) {
    await course.getByTestId(`scene-step-${step}`).click();
    await expect(course.getByTestId(`scene-panel-${step}`)).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
  await course.getByTestId('scene-back').click();
  await expect(page.getByTestId('real-scene-entry')).toBeVisible();
});

test('T59: phrase, sentence and prompted turns play bounded media without generation requests', async ({ page }) => {
  test.setTimeout(45000);
  const forbidden = [];
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== 'http://127.0.0.1:3210' || !['GET', 'HEAD'].includes(request.method())) {
      forbidden.push(`${request.method()} ${url.origin}${url.pathname}`);
      return route.abort();
    }
    return route.continue();
  });
  const course = await openSample(page);
  const playing = () => page.evaluate(() => [...document.querySelectorAll('video,audio')].filter(v => !v.paused).map(v => ({ time: v.currentTime, muted: v.muted, volume: v.volume })));
  for (const step of [2, 3]) {
    await course.getByTestId(`scene-step-${step}`).click();
    const item = course.getByTestId(step === 2 ? 'scene-term' : 'scene-sentence').first();
    await item.getByRole('button').click();
    await expect.poll(async () => (await playing()).length).toBe(1);
    expect((await playing())[0]).toMatchObject({ muted: false });
    expect((await playing())[0].volume).toBeGreaterThan(0);
    // First item uses the first source utterance, not the guest's answer.
    expect((await playing())[0].time).toBeGreaterThanOrEqual(0.8);
    expect((await playing())[0].time).toBeLessThan(3);
    await expect.poll(async () => (await playing()).length, { timeout: 5500 }).toBe(0);
    expect(await page.evaluate(() => Math.max(...[...document.querySelectorAll('video,audio')].map(v => v.currentTime)))).toBeLessThan(3.5);
  }
  await course.getByTestId('scene-step-4').click();
  await course.getByTestId('scene-turn-play').click();
  await expect.poll(async () => (await playing()).length).toBe(1);
  await expect.poll(async () => (await playing()).length, { timeout: 5500 }).toBe(0);
  // Paused partner turn must not silently run into the guest voice at second 6.
  expect(await page.evaluate(() => [...document.querySelectorAll('video,audio')].every(v => v.currentTime < 6))).toBe(true);
  await course.getByTestId('scene-answer-play').click();
  await expect.poll(async () => (await playing()).length).toBe(1);
  expect((await playing())[0].time).toBeGreaterThanOrEqual(5.8);
  expect((await playing())[0].time).toBeLessThan(8);
  await expect.poll(async () => (await playing()).length, { timeout: 5500 }).toBe(0);
  expect(await page.evaluate(() => Math.max(...[...document.querySelectorAll('video,audio')].map(v => v.currentTime)))).toBeLessThan(8.5);
  await course.getByTestId('scene-turn-play').click();
  await expect.poll(async () => (await playing()).length).toBe(1);
  await course.getByTestId('scene-step-1').click();
  await expect.poll(async () => (await playing()).length).toBe(0);
  await course.getByTestId('scene-play').click();
  await expect.poll(async () => (await playing()).length).toBe(1);
  await course.getByTestId('scene-back').click();
  await expect.poll(async () => (await playing()).length).toBe(0);
  expect(forbidden).toEqual([]);
});

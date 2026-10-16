import { test, expect } from '@playwright/test';
import { courseFixture } from '../fixtures/t60-course.mjs';
async function enter(page, data) {
  await page.route('**/api/auth/session', route => route.fulfill({ json: { authenticated: false, accountKey: null } }));
  await page.route('**/media/hotel-course.json', route => route.fulfill({ json: data }));
  await page.goto('/demo');
  await page.getByRole('button', { name: /^简体中文/ }).click();
  await page.getByTestId('real-scene-entry').click();
  return page.getByTestId('real-scene-course');
}
test('T60: injected test data drives all four pages instead of hard-coded hotel words', async ({ page }) => {
  const fixture = courseFixture(); const course = await enter(page, fixture);
  await expect(course).toContainText('测试');
  await course.getByTestId('scene-play').click();
  await expect(course.getByTestId('scene-caption')).toHaveText(fixture.lines[0].text);
  await course.getByTestId('scene-step-2').click();
  await expect(course.getByTestId('scene-term')).toHaveCount(1);
  await expect(course.getByTestId('scene-term')).toContainText('ready');
  await expect(course.getByTestId('scene-term')).toContainText('zh-Hans: ready');
  await course.getByTestId('scene-step-3').click();
  await expect(course.getByTestId('scene-sentence').nth(1)).toContainText(fixture.lines[1].text);
  await course.getByTestId('scene-step-4').click();
  await expect(course.getByTestId('scene-partner')).toHaveText(fixture.lines[0].text);
  await expect(course.getByTestId('scene-answer')).toHaveText(fixture.lines[1].text);
  await expect(course).not.toContainText('I booked a room');
});
for (const kind of ['translation', 'version', 'time']) test(`T60: invalid ${kind} stops learning and offers return`, async ({ page }) => {
  const fixture = courseFixture();
  if (kind === 'translation') delete fixture.lines[0].translations.ja;
  if (kind === 'version') fixture.media.version = 'old';
  if (kind === 'time') fixture.lines[0].end = 20;
  const course = await enter(page, fixture);
  await expect(course.getByRole('alert')).toBeVisible();
  await expect(course.locator('video')).toHaveCount(0);
  await course.getByTestId('scene-back').click();
  await expect(page.getByTestId('real-scene-entry')).toBeVisible();
});

// Deliberately synthetic timing: proves renderer wiring, not audio/text fidelity.
test('T60: media windows and second turn follow course data', async ({ page }) => {
  const fixture = courseFixture();
  fixture.lines.push({ ...structuredClone(fixture.lines[0]), id: 'c', text: 'Thank you.', start: 9.4, end: 10.2 });
  fixture.lines.push({ ...structuredClone(fixture.lines[1]), id: 'd', text: 'See you.', start: 10.5, end: 11.4 });
  fixture.turns.push({ partnerLineId: 'c', learnerLineId: 'd' });
  const course = await enter(page, fixture);
  const video = course.locator('video');
  await course.getByTestId('scene-play').click();
  await video.evaluate(v => { v.currentTime = 3.3; });
  await expect(course.getByTestId('scene-caption')).toHaveText(fixture.lines[0].text);
  await course.getByTestId('scene-step-4').click();
  for (const [control, start, end] of [['scene-turn-play', 3, 4.2], ['scene-answer-play', 8, 9.2]]) {
    await course.getByTestId(control).click();
    await expect(video).toHaveJSProperty('paused', false);
    const position = await video.evaluate(v => v.currentTime);
    expect(position).toBeGreaterThanOrEqual(start);
    expect(position).toBeLessThan(start + 0.8);
    await expect.poll(() => video.evaluate(v => v.paused)).toBe(true);
    expect(await video.evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(end);
    expect(await video.evaluate(v => v.currentTime)).toBeLessThan(end + 0.5);
  }
  await course.getByTestId('scene-next-turn').click();
  await expect(course.getByTestId('scene-partner')).toHaveText('Thank you.');
  await expect(course.getByTestId('scene-answer')).toHaveText('See you.');
  await course.getByTestId('scene-answer-play').click();
  expect(await video.evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(10.5);
});

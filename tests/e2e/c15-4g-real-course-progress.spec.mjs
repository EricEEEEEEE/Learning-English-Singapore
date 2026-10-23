import { test, expect } from '@playwright/test';
import { setupLearning, openLibrary, openCourse, waitVideo, seek, key, ownerA, savedStatus, noGeneration } from '../fixtures/t70-learning-browser.mjs';
import { hotelSample } from '../fixtures/t69-guided-browser.mjs';

test.use({ locale: 'zh-CN' });

// C15-4g: the attempt 7 learning-page screenshot showed "学习位置暂未保存" only because the test double saved progress
// with a fixed synthetic media hash ('a' x 64) while the page played a real course with its own hash. The double now
// returns the hash of the course it serves, as the server does; a real course's position is saved normally.
const realHash = 'c15'.padEnd(64, '4');
const realCourse = { media: { assetId: 'final-c15-4g-real', sha256: realHash, duration: hotelSample.media.duration },
  lines: hotelSample.lines.map(({ version, ...line }) => line), phrases: hotelSample.phrases, turns: hotelSample.turns };

test('C15-4g: a course with its own media hash saves the learning position (no "暂未保存")', async ({ page, context, baseURL }) => {
  const { state, main } = await setupLearning(page, context, baseURL, { course: realCourse });
  expect(state.course.media.sha256).toBe(realHash);
  await openLibrary(page); await openCourse(main);
  const video = await waitVideo(main);
  await seek(video, 6.4);
  await expect.poll(() => state.progress[key(ownerA)]?.position.time).toBeCloseTo(6.4, 1);
  expect(state.progress[key(ownerA)].course.mediaSha256).toBe(realHash);
  await expect(savedStatus(main)).toContainText('已保存在本机');
  await expect(main).not.toContainText('学习位置暂未保存');
  noGeneration(state);
});

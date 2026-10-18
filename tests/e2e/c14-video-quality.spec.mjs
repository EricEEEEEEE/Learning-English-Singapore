import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupBrowser, requirement, generationView, ownerA, progressTitle } from '../fixtures/t68-generation-browser.mjs';
import { setupLearning, openLibrary } from '../fixtures/t70-learning-browser.mjs';

// C14 (2026-10-18): the generation page tells the truth about the picture check. A quality_failed course is
// never offered to the learner, a needs_review course says nobody has checked faces yet (no face library is
// approved), and the partner keyframe can be shown as "this is who you will talk to". All routes are answered in
// memory; nothing here calls a model, an image model or the video provider.
test.use({ locale: 'zh-CN' });
const keyframePng = (() => {
  const dir = mkdtempSync(join(tmpdir(), 'les-c14-e2e-')), file = join(dir, 'keyframe.png');
  execFileSync('/usr/bin/ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x5a7d9a:s=720x1280', '-frames:v', '1', file]);
  return readFileSync(file);
})();

async function openGeneration(page, context, baseURL, view) {
  const record = requirement();
  const state = await setupBrowser(page, context, baseURL, record);
  state.views[`${ownerA}:1`] = view(record);
  state.keyframeReads = [];
  await page.route('**/api/scene-generation/keyframe*', route => {
    state.keyframeReads.push(new URL(route.request().url()).search);
    return route.fulfill({ status: 200, contentType: 'image/png', body: keyframePng });
  });
  await page.goto('/?generation=1');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: progressTitle, exact: true })).toBeVisible();
  return { state, main };
}

test('C14-1: a quality_failed course says the picture did not pass and offers no way to watch it', async ({ page, context, baseURL }) => {
  const { state, main } = await openGeneration(page, context, baseURL, record => ({ ...generationView(record, 't14-task', 'video_pending'), phase: 'quality_failed' }));
  const status = main.getByTestId('generation-quality-failed');
  await expect(status).toContainText('画面没过检查');
  await expect(status).toContainText('不会放进');
  await expect(main.getByRole('button', { name: '观看场景', exact: true })).toHaveCount(0);
  await expect(main.getByRole('button', { name: '取消生成', exact: true })).toHaveCount(0);
  await expect(main.getByRole('button', { name: '返回修改', exact: true })).toBeVisible();
  await expect(main.getByTestId('generation-needs-review')).toHaveCount(0);
  expect(state.posts).toEqual([]); expect(state.courseReads).toEqual([]); expect(state.mediaReads).toEqual([]);
});

test('C14-1: a needs_review course says faces have not been checked and needs a person to look, never that it passed', async ({ page, context, baseURL }) => {
  const { state, main } = await openGeneration(page, context, baseURL, record => ({ ...generationView(record, 't14-task', 'ready'), quality: 'needs_review' }));
  const note = main.getByTestId('generation-needs-review');
  await expect(note).toHaveText('画面还没经过人脸检查，需要人工看一遍。');
  await expect(main.getByRole('button', { name: '观看场景', exact: true })).toBeVisible();
  await expect(main).not.toContainText('已通过检查');
  await expect(main).not.toContainText('检查通过');
  expect(state.posts).toEqual([]);
});

test('C14-1: a ready course without a quality record shows no quality note (unchanged)', async ({ page, context, baseURL }) => {
  const { main } = await openGeneration(page, context, baseURL, record => generationView(record, 't14-task', 'ready'));
  await expect(main.getByText('场景已准备好，可以观看。', { exact: true })).toBeVisible();
  await expect(main.getByTestId('generation-needs-review')).toHaveCount(0);
  await expect(main.getByTestId('generation-quality-failed')).toHaveCount(0);
});

test('C14-2: the generation page shows the partner keyframe as "this is who you will talk to"', async ({ page, context, baseURL }) => {
  const { state, main } = await openGeneration(page, context, baseURL, record => ({ ...generationView(record, 't14-task', 'video_pending'), keyframe: true }));
  const figure = main.getByTestId('partner-look');
  await expect(figure).toContainText('对方长这样');
  const image = figure.locator('img');
  await expect(image).toHaveAttribute('alt', '对方长这样');
  await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth)).toBe(720);
  expect(state.keyframeReads).toEqual(['?revision=1']);
  const box = await image.boundingBox();
  expect(box.width).toBeLessThanOrEqual(page.viewportSize().width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('C14-2: without a keyframe there is no partner picture', async ({ page, context, baseURL }) => {
  const { state, main } = await openGeneration(page, context, baseURL, record => generationView(record, 't14-task', 'video_pending'));
  await expect(main.getByText('正在准备场景画面。', { exact: true })).toBeVisible();
  await expect(main.getByTestId('partner-look')).toHaveCount(0);
  expect(state.keyframeReads).toEqual([]);
});

test('C14-1: a scene marked quality_failed is never listed on the learning page', async ({ page, context, baseURL }) => {
  const { state, record, main } = await setupLearning(page, context, baseURL);
  const failed = structuredClone(state.scenes[ownerA][0]);
  failed.course = { id: 't14-failed-course', revision: 1 };
  failed.description = '画面没过检查的场景';
  failed.requirement = { ...structuredClone(record), revision: 1, content: { ...structuredClone(record.content), description: '画面没过检查的场景' } };
  failed.quality = 'quality_failed';
  state.scenes[ownerA].push(failed);
  await openLibrary(page);
  await expect(main.getByText(record.content.description, { exact: true })).toBeVisible();
  await expect(main.getByText('画面没过检查的场景')).toHaveCount(0);
  await expect(main.getByRole('button', { name: '继续学习', exact: true })).toHaveCount(1);
});

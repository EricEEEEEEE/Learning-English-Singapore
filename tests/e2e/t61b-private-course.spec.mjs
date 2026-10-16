import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function setup(page, denied = false) {
  const sample = JSON.parse(await readFile(new URL('../../public/media/hotel-course.json', import.meta.url), 'utf8'));
  const course = {
    id: 'synthetic-course', revision: 1, source: 'test-fixture',
    media: { courseId: 'synthetic-course', revision: 1, assetId: 'final-synthetic', sha256: 'a'.repeat(64), duration: sample.media.duration },
    lines: sample.lines.map(({ version, ...line }) => ({ ...line, revision: 1 })), phrases: sample.phrases, turns: sample.turns,
  };
  let creates = 0, reads = 0;
  await page.route('**/api/auth/session', route => route.fulfill({ json: { authenticated: true, accountKey: 'synthetic-account' } }));
  await page.route('**/api/generation-tasks', route => {
    if (route.request().method() === 'POST') creates++;
    return route.fulfill({ json: { tasks: [{ id: course.id, revision: 1, goal: '合成酒店学习材料', status: 'video_assembled', simulation: true }] } });
  });
  await page.route('**/api/generated-courses?**', route => {
    reads++;
    const url = new URL(route.request().url());
    expect(url.searchParams.get('id')).toBe(course.id); expect(url.searchParams.get('revision')).toBe('1');
    return route.fulfill(denied ? { status: 401, json: { error: 'unauthenticated' } } : { json: course });
  });
  await page.route('**/api/generated-course-media?**', async route => route.fulfill({ contentType: 'video/mp4', body: await readFile(new URL('../../public/media/hotel-pov-12s.mp4', import.meta.url)) }));
  await page.goto('/demo'); await page.getByRole('button', { name: /^简体中文/ }).click();
  await page.getByTestId('generation-entry').click();
  return { course, counts: () => ({ creates, reads }) };
}

test('T61B private course UI: opens saved course, plays and repeats four learning pages without generation', async ({ page }) => {
  const context = await setup(page);
  await page.getByTestId('generated-course-open').click();
  await expect(page.locator('video')).toHaveAttribute('src', /\/api\/generated-course-media\?.*revision=1/);
  await page.getByTestId('scene-play').click();
  await expect.poll(() => page.locator('video').evaluate(v => v.currentTime)).toBeGreaterThan(0.1);
  await expect(page.getByTestId('scene-panel-1')).not.toContainText(context.course.lines[0].translations['zh-Hans']);
  await page.getByTestId('scene-step-2').click();
  await expect(page.getByTestId('scene-term').first()).toContainText(context.course.phrases[0].text);
  await page.getByTestId('scene-step-3').click();
  await expect(page.getByTestId('scene-sentence').first()).toContainText(context.course.lines[0].translations['zh-Hans']);
  await page.getByTestId('scene-step-4').click(); await expect(page.getByTestId('scene-answer')).toBeVisible();
  await page.getByTestId('scene-step-1').click(); await page.getByTestId('scene-replay').click();
  await page.getByTestId('scene-back').click(); await page.getByTestId('generated-course-open').click();
  await expect(page.getByTestId('scene-step-1')).toBeVisible();
  expect(context.counts()).toEqual({ creates: 0, reads: 2 });
});

test('T61B private course UI: expired access shows failure without fallback to public sample', async ({ page }) => {
  const context = await setup(page, true);
  await page.getByTestId('generated-course-open').click();
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
  expect(context.counts()).toEqual({ creates: 0, reads: 1 });
});

async function revisedSetup(page, returnedVersion = 2) {
  const context = await setup(page);
  const course = structuredClone(context.course);
  course.materialsRevision = returnedVersion;
  course.lines[0].translations['zh-Hans'] = '合成修订句子';
  course.phrases[0].translations['zh-Hans'] = '合成修订词组';
  const versions = [];
  await page.route('**/api/generation-tasks', route => route.fulfill({ json: { tasks: [{ id: course.id, revision: 1, materialsRevision: 2, goal: '合成修订材料', status: 'video_assembled', simulation: true }] } }));
  await page.route('**/api/generated-courses?**', route => {
    versions.push(new URL(route.request().url()).searchParams.get('materialsRevision'));
    return route.fulfill({ json: course });
  });
  // Re-enter to fetch the advertised material revision through the actual task list.
  await page.reload();
  await page.getByTestId('generation-entry').click();
  return { versions };
}

test('T61B material UI: carries advertised revision through four pages and reopening without changing media version', async ({ page }) => {
  const c = await revisedSetup(page);
  await page.getByTestId('generated-course-open').click();
  await expect(page.getByTestId('scene-step-1')).toBeVisible();
  expect(c.versions).toEqual(['2']);
  await expect(page.locator('video')).toHaveAttribute('src', /revision=1/);
  await expect(page.getByTestId('scene-panel-1')).not.toContainText('合成修订句子');
  await page.getByTestId('scene-step-2').click();
  await expect(page.getByTestId('scene-term').first()).toContainText('合成修订词组');
  await page.getByTestId('scene-step-3').click();
  await expect(page.getByTestId('scene-sentence').first()).toContainText('合成修订句子');
  await page.getByTestId('scene-step-4').click();
  await expect(page.getByTestId('scene-answer')).toBeVisible();
  await page.getByTestId('scene-back').click();
  await page.getByTestId('generated-course-open').click();
  await expect(page.getByTestId('scene-step-1')).toBeVisible();
  expect(c.versions).toEqual(['2', '2']);
});

test('T61B material UI: mismatched material response rejects without playing an older course', async ({ page }) => {
  const c = await revisedSetup(page, 1);
  await page.getByTestId('generated-course-open').click();
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
  expect(c.versions).toEqual(['2']);
});

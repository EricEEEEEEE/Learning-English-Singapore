import { test, expect } from '@playwright/test';
import { setupBrowser, requirement, generationView, ownerA } from '../fixtures/t68-generation-browser.mjs';

// C15-4h: the generation page says plainly when the script was refused and is being rewritten once, and when the
// second script was refused too; neither is shown as "result not confirmed" and neither submits anything.
test.use({ locale: 'zh-CN' });

test('C15-4h / K4: a refused script shows "rewriting" and keeps polling with GET only', async ({ page, context, baseURL }) => {
  const record = requirement(), state = await setupBrowser(page, context, baseURL, record);
  state.views[`${ownerA}:1`] = { ...generationView(record, 'c15-4h-rewrite', 'script_rejected'), phase: 'script_rewriting' };
  await page.goto('/?generation=1'); const main = page.getByRole('main');
  await expect(main.getByRole('status')).toContainText('剧本没写好，正在重写');
  await expect(main.getByText('提交结果尚未确认，不会自动重新提交。', { exact: true })).toHaveCount(0);
  const reads = state.gets.length;
  state.views[`${ownerA}:1`] = generationView(record, 'c15-4h-rewrite', 'script_ready');
  await expect(main.getByText('场景内容已准备，等待声音。', { exact: true })).toBeVisible({ timeout: 8000 });
  expect(state.gets.length).toBeGreaterThan(reads);
  expect(state.posts).toEqual([]); await expect(main.locator('video')).toHaveCount(0);
});

test('C15-4h / K4: a script refused twice ends with an explanation and a way back, without resubmitting', async ({ page, context, baseURL }) => {
  const record = requirement(), state = await setupBrowser(page, context, baseURL, record);
  const view = generationView(record, 'c15-4h-failed', 'script_rejected');
  state.views[`${ownerA}:1`] = { ...view, task: { ...view.task, providerCalls: 2 } };
  await page.goto('/?generation=1'); const main = page.getByRole('main');
  const status = main.getByRole('status');
  await expect(status).toContainText('剧本');
  await expect(status).not.toContainText('正在重写');
  await expect(main.getByText('提交结果尚未确认，不会自动重新提交。', { exact: true })).toHaveCount(0);
  await expect(main.getByRole('button', { name: '返回修改', exact: true })).toBeVisible();
  await expect(main.getByRole('button', { name: '观看场景', exact: true })).toHaveCount(0);
  expect(state.posts).toEqual([]); await expect(main.locator('video')).toHaveCount(0);
});

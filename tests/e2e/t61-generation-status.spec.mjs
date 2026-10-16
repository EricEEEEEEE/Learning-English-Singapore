import { test, expect } from '@playwright/test';

test('T61A: learner describes a scene and sees budget-waiting status, not a fabricated course', async ({ page }) => {
  await page.route('**/api/auth/session', route => route.fulfill({ json: { authenticated: true, accountKey: 'synthetic-account' } }));
  let submits = 0;
  await page.route('**/api/generation-tasks', async route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: { tasks: [] } });
    submits++;
    const body = route.request().postDataJSON();
    expect(body.goal).toBe('我要和孩子生日聚会上的其他家长交流');
    await route.fulfill({ json: { id: 'test-task', status: 'awaiting_budget', goal: body.goal, revision: 1, providerCalls: 0 } });
  });
  await page.goto('/demo'); await page.getByRole('button', { name: /^简体中文/ }).click();
  await page.getByTestId('generation-entry').click();
  await page.getByLabel('生成场景需求').fill('我要和孩子生日聚会上的其他家长交流');
  await page.getByRole('button', { name: '创建生成任务', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('等待费用放行');
  await expect(page.getByRole('status')).toContainText('尚未生成');
  await expect(page.locator('video')).toHaveCount(0);
  expect(submits).toBe(1);
});

import { test, expect } from '@playwright/test';

const sceneTitle = '你想在哪个场景下学习英语？';
const loginTitle = '选择登录方式';
const legacyControls = /预览逐题引导|场景生成任务|酒店真实场景样片|合成课程演示/;
const signedOut = { authenticated: false, accountKey: null };
const signedIn = { authenticated: true, accountKey: 't65-synthetic-owner' };

test.use({ locale: 'zh-CN' });
test.beforeEach(async ({ context, baseURL }) => {
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) return route.continue();
    throw new Error('T65 must not contact a real identity provider or model.');
  });
});

async function session(page, body = signedOut) {
  await page.route('**/api/auth/session', route => route.fulfill({ json: body }));
}

async function expectScene(page) {
  await expect(page.getByRole('heading', { name: sceneTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: sceneTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: loginTitle, exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Google/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /微信|WeChat|Google/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: legacyControls })).toHaveCount(0);
  await expect(page.getByRole('link', { name: legacyControls })).toHaveCount(0);
}

test('T65 / K1.1: first visit has the two login choices without a mandatory language screen or demo menu', async ({ page }) => {
  await session(page);
  await page.goto('/');
  const group = page.getByRole('group', { name: loginTitle, exact: true });
  await expect(group).toBeVisible();
  await expect(group.locator('button, a')).toHaveCount(2);
  const google = group.getByRole('link', { name: /Google/ });
  const wechat = group.getByRole('button', { name: /微信|WeChat/ });
  await expect(google).toBeVisible();
  await expect(wechat).toBeVisible();
  await expect(wechat).toContainText(/尚未接入|暂不可用/);
  const target = new URL(await google.getAttribute('href'), page.url());
  expect(target.pathname).toBe('/api/auth/google/start');
  expect(target.searchParams.get('language')).toBe('zh-Hans');
  expect(target.searchParams.get('returnTo')).toBe('/');
  await expect(page.getByRole('button', { name: legacyControls })).toHaveCount(0);
  await expect(page.getByRole('link', { name: legacyControls })).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.locator('input[type="email"], input[type="tel"], input[type="password"]')).toHaveCount(0);
});

test('T65 / K1.2: an existing verified session opens the scene input immediately and remains there after refresh', async ({ page }) => {
  await session(page, signedIn);
  await page.goto('/');
  await expectScene(page);
  await page.reload();
  await expectScene(page);
});

test('T65 / K1.2: a successful callback with a verified session opens the scene page rather than the old questionnaire', async ({ page }) => {
  await session(page, signedIn);
  await page.goto('/?auth=success&language=zh-Hans');
  await expectScene(page);
  await expect(page.getByRole('button', { name: /跳过这题|开始认识自己|预览逐题引导/ })).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
});

test('T65 / K1.2: a success URL and forged local account marker cannot substitute for a verified session', async ({ page, context }) => {
  await context.addInitScript(() => {
    localStorage.setItem('le-sg-account-mode-v1', 't65-forged-owner');
    localStorage.setItem('le-sg-entry-preferences-v1', JSON.stringify({ language: 'zh-Hans', largeText: false, reducedMotion: false }));
  });
  await session(page);
  await page.goto('/?auth=success&language=zh-Hans');
  await expect(page.getByRole('group', { name: loginTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: sceneTitle, exact: true })).toHaveCount(0);
  await expect(page.getByText(/你已登录|登录成功/, { exact: true })).toHaveCount(0);
});

test('T65 / K1.2: unknown session keeps both private input and fresh login actions hidden until the response is known', async ({ page }) => {
  let request;
  await page.route('**/api/auth/session', route => { request = route; });
  await page.goto('/');
  await expect.poll(() => !!request).toBe(true);
  await expect(page.getByRole('status')).toContainText(/确认.*登录|检查.*登录/);
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Google/ })).toHaveCount(0);
  await request.fulfill({ json: signedIn });
  await expectScene(page);
});

for (const status of [401, 503]) {
  test(`T65 / K1.2: session HTTP ${status} offers retry and cannot expose a private scene`, async ({ page }) => {
    let recovered = false;
    await page.route('**/api/auth/session', route => recovered
      ? route.fulfill({ json: signedIn })
      : route.fulfill({ status, json: { error: 't65-synthetic-failure' } }));
    await page.goto('/');
    const retry = page.getByRole('button', { name: /重试|重新检查/ });
    await expect(retry).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);
    recovered = true;
    await retry.click();
    await expectScene(page);
  });
}

test('T65 / K1.2: an indefinitely pending session times out to an actionable retry instead of an endless loading page', async ({ page }) => {
  await page.route('**/api/auth/session', () => {});
  await page.goto('/');
  await expect(page.getByRole('button', { name: /重试|重新检查/ })).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('status')).not.toContainText(/正在确认登录|正在检查登录/);
});

test('T65 / K1.2: authenticated true without a valid account key never enters the private scene page', async ({ page }) => {
  await session(page, { authenticated: true, accountKey: '../t65-invalid-owner' });
  await page.goto('/');
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /重试|重新检查/ })).toBeVisible();
});

test('T65 / K1.2: losing the verified session removes the previous account input on the next boundary check', async ({ page }) => {
  let authenticated = true;
  await page.route('**/api/auth/session', route => route.fulfill({ json: authenticated ? signedIn : signedOut }));
  await page.goto('/');
  await expectScene(page);
  await page.getByRole('textbox', { name: sceneTitle, exact: true }).fill('T65 synthetic private scene');
  authenticated = false;
  await page.evaluate(() => window.dispatchEvent(new Event('le-sg-auth-invalid')));
  await expect(page.getByRole('group', { name: loginTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByText('T65 synthetic private scene', { exact: true })).toHaveCount(0);
});

test('T65 / K1.1: cancelled Google auth remains on simple login and can start a fresh attempt', async ({ page }) => {
  await session(page);
  await page.goto('/?auth=cancelled&language=zh-Hans');
  await expect(page.getByRole('group', { name: loginTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText(/取消|未完成/);
  await expect(page.getByRole('link', { name: /Google/ })).toBeVisible();
  await expect(page.getByRole('button', { name: legacyControls })).toHaveCount(0);
});

test('T65 / K1.1: WeChat stays visibly unavailable and cannot create a fake account', async ({ page }) => {
  await session(page);
  await page.goto('/');
  const wechat = page.getByRole('button', { name: /微信|WeChat/ });
  await expect(wechat).toBeVisible();
  await wechat.click();
  await expect(page.getByRole('status')).toContainText(/尚未接入|暂不可用/);
  await expect(page.getByRole('textbox')).toHaveCount(0);
});

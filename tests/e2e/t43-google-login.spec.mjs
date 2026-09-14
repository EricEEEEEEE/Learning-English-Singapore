import { test, expect } from '@playwright/test';

const languages = [
  ['zh-Hans', '简体中文', '选择登录方式', /取消|未完成/],
  ['id', 'Bahasa Indonesia', 'Pilih cara masuk', /dibatalkan|belum selesai/i],
  ['ja', '日本語', 'ログイン方法を選ぶ', /キャンセル|完了しませんでした/],
  ['ko', '한국어', '로그인 방법 선택', /취소|완료되지 않았/],
  ['hi', 'हिन्दी', 'साइन इन करने का तरीका चुनें', /रद्द|पूरा नहीं हुआ/],
];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

for (const [code, choice, heading, cancelled] of languages) {
  test(`T43 / F1.1,F13.1,F13.3: ${code} offers Google-first without changing the WeChat placeholder`, async ({ page }) => {
    await page.getByRole('button', { name: new RegExp(`^${choice}`) }).click();
    const group = page.getByRole('group', { name: heading, exact: true });
    const google = group.getByRole('link', { name: /Google/ });
    const wechat = group.getByRole('button', { name: /微信|WeChat/ });
    await expect(google).toBeVisible();
    await expect(wechat).toBeVisible();
    const href = new URL(await google.getAttribute('href'), 'http://local.test');
    expect(href.pathname).toBe('/api/auth/google/start');
    expect(href.searchParams.get('language')).toBe(code);
    expect(href.searchParams.get('returnTo')).toBe('/');
    await expect(wechat).toContainText(/尚未接入|Belum terhubung|未接続|아직 연결되지 않음|अभी कनेक्ट नहीं है/i);
    await expect(page.locator('input[type="password"], input[type="email"], input[type="tel"]')).toHaveCount(0);
    expect(await page.locator('body').innerText()).not.toMatch(/微信登录成功|WeChat sign-in succeeded|G1.{0,8}(通过|passed)/i);
  });

  test(`T43 / F1.3,F13.3: ${code} cancelled callback restores language and stays signed out`, async ({ page }) => {
    await page.goto(`/?auth=cancelled&language=${code}`);
    await expect(page.locator('html')).toHaveAttribute('lang', code);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.getByRole('status')).toContainText(cancelled);
    await expect(page.getByText(/登录成功|signed in|ログイン済み|로그인됨|साइन इन हो गया/i)).toHaveCount(0);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', code);
  });
}

test('T43 / F1.4,F13.4: malformed callback language and external return target cannot steer the entry page', async ({ page }) => {
  await page.goto('/?auth=failed&language=en&returnTo=https%3A%2F%2Fattacker.example');
  await expect(page.getByRole('button', { name: /^简体中文/ })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans');
  expect(page.url()).not.toContain('attacker.example');
});

test('T43 / F1.4,F13.4: WeChat WebView explains system-browser continuation and does not start embedded Google auth', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Mobile MicroMessenger/8.0.50',
  });
  const page = await context.newPage();
  await page.goto(baseURL);
  await page.getByRole('button', { name: /^简体中文/ }).click();
  const group = page.getByRole('group', { name: '选择登录方式', exact: true });
  await expect(group.getByRole('link', { name: /Google/ })).toHaveCount(0);
  await group.getByRole('button', { name: /Google/ }).click();
  await expect(page.getByRole('status')).toContainText(/系统浏览器|Safari|Chrome/);
  expect(page.url()).toBe(`${baseURL}/`);
  await context.close();
});

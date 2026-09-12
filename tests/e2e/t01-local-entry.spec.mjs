import { test as base, expect } from '@playwright/test';

// The initial prototype must run with only its local server reachable.
// Block attempted external requests and fail, rather than supplying fake success.
const test = base.extend({
  page: async ({ page, context, baseURL }, use) => {
    const externalRequests = [];
    const errors = [];
    const origin = new URL(baseURL).origin;
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) {
        await route.continue();
      } else {
        externalRequests.push(url.origin);
        await route.abort('blockedbyclient');
      }
    });
    await context.routeWebSocket('**/*', route => {
      externalRequests.push(new URL(route.url()).origin);
      route.close();
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await context.addInitScript(() => {
      window.__mediaRequests = 0;
      if (navigator.mediaDevices) {
        navigator.mediaDevices.getUserMedia = async () => {
          window.__mediaRequests += 1;
          throw new Error('The entry prototype must not request microphone or camera access.');
        };
      }
    });
    await use(page);
    expect(externalRequests, 'Entry must not contact OAuth, model, analytics, font or media services').toEqual([]);
    expect(errors, 'Entry must render without browser or framework errors').toEqual([]);
    expect(await page.evaluate(() => window.__mediaRequests), 'No unsolicited microphone/camera request').toBe(0);
  },
});

test.beforeEach(async ({ page }) => {
  const response = await page.goto('/');
  expect(response.status()).toBe(200);
});

test('T01: a meaningful local entry identifies the product and discloses the demo', async ({ page }, testInfo) => {
  await expect(page).toHaveTitle(/Learning English.*Singapore/i);
  await expect(page.getByRole('main')).toBeVisible();
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toHaveCount(1);
  await expect(heading).toContainText(/[\u3400-\u9fff]/);
  await expect(page.getByText('流程演示', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/Application error|Internal Server Error|Hydration failed/);
  await page.screenshot({ path: testInfo.outputPath('entry.png'), fullPage: true });
});

test('T01 / F13.1: content fits the viewport and controls have usable touch targets', async ({ page }) => {
  const viewport = page.viewportSize();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  const controls = page.locator('button:visible, a:visible, summary:visible');
  expect(await controls.count()).toBeGreaterThan(0);
  for (const control of await controls.all()) {
    const box = await control.boundingBox();
    expect(box.width, 'Touch target width').toBeGreaterThanOrEqual(44);
    expect(box.height, 'Touch target height').toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    await expect(control).toHaveAccessibleName(/\S/);
  }
  const info = page.getByRole('button', { name: /演示说明/ });
  await expect(info).toBeInViewport();
  await expect(info).toContainText(/[\u3400-\u9fff]/);
  expect(await info.locator('svg, img, [role="img"]').count(), 'Text is accompanied by a recognizable icon').toBeGreaterThan(0);
});

test('T01: demo explanation responds to keyboard and touch without claiming real capabilities', async ({ page }) => {
  const toggle = page.getByRole('button', { name: /演示说明/ });
  const explanation = page.getByRole('region', { name: '演示说明', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(explanation).toBeHidden();
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(explanation).toBeVisible();
  await expect(explanation).toContainText(/登录/);
  await expect(explanation).toContainText(/语音|声音/);
  await expect(explanation).toContainText(/视频/);
  await expect(explanation).toContainText(/尚未接入|待接入|未接入/);
  await expect(page.getByText(/^(登录成功|生成成功|已掌握)$/)).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(explanation).toBeHidden();
});

test('T01 / F15.1: opening the prototype requires no reward, social or account gate', async ({ page }) => {
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('button', { name: /积分|排行榜|连续打卡|邀请好友|匹配真人/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /积分|排行榜|连续打卡|邀请好友|匹配真人/ })).toHaveCount(0);
  await expect(page.locator('input[type="password"], input[type="tel"]')).toHaveCount(0);
  const response = await page.reload();
  expect(response.status()).toBe(200);
  await expect(page.getByText('流程演示', { exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
});

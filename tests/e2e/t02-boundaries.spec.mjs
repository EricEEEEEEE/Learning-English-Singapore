import { test, expect } from '@playwright/test';

// Promote T02's exploratory checks during T03 test-writing; original T02 tests stay frozen.
const languages = [
  ['zh-Hans', '简体中文', '显示设置', '大字', '减少动画', '权限说明', '更换语言', '查看演示说明', /在新加坡/],
  ['id', 'Bahasa Indonesia', 'Pengaturan tampilan', 'Teks besar', 'Kurangi animasi', 'Izin dan privasi', 'Ganti bahasa', 'Lihat penjelasan demo', /Di Singapura/],
  ['ja', '日本語', '表示設定', '大きな文字', '動きを減らす', '権限とプライバシー', '言語を変更', 'デモの説明を見る', /シンガポール/],
];
test.use({ hasTouch: true });
test.beforeEach(async ({ page, context, baseURL }) => {
  await context.route('**/*', async route => {
    expect(new URL(route.request().url()).origin).toBe(new URL(baseURL).origin);
    await route.continue();
  });
  await page.goto('/');
});

for (const [code, name, settings, large, reduced, permissions, change, explanation, title] of languages) {
  test(`T02 boundary: ${code} expanded large text fits and survives a language change`, async ({ page }) => {
    await page.getByRole('button', { name: new RegExp(`^${name}`) }).tap();
    await expect(page).toHaveTitle(title);
    await page.getByRole('button', { name: settings, exact: true }).tap();
    await page.getByRole('checkbox', { name: large, exact: true }).check();
    await page.getByRole('checkbox', { name: reduced, exact: true }).check();
    await page.getByRole('button', { name: permissions, exact: true }).tap();
    await page.getByRole('button', { name: explanation, exact: true }).tap();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
    for (const control of await page.locator('button:visible').all()) {
      const box = await control.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole('button', { name: change, exact: true }).tap();
    await page.getByRole('button', { name: /^Bahasa Indonesia/ }).tap();
    await page.reload();
    await expect(page).toHaveTitle(/mulai dengan mendengar/i);
    await page.getByRole('button', { name: 'Pengaturan tampilan', exact: true }).tap();
    await expect(page.getByRole('checkbox', { name: 'Teks besar', exact: true })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Kurangi animasi', exact: true })).toBeChecked();
  });
}

test('T02 boundary: a temporary write failure clears after a later save succeeds', async ({ page }) => {
  await page.evaluate(() => {
    const save = Storage.prototype.setItem;
    let calls = 0;
    Storage.prototype.setItem = function (...args) {
      calls += 1;
      if (calls === 1) throw new DOMException('Temporary test failure', 'SecurityError');
      return save.apply(this, args);
    };
  });
  await page.getByRole('button', { name: /^简体中文/ }).tap();
  await expect(page.getByRole('status')).toContainText('无法保存');
  await page.getByRole('button', { name: '显示设置', exact: true }).tap();
  await page.getByRole('checkbox', { name: '大字', exact: true }).check();
  await expect(page.locator('[role="status"]')).toHaveText('');
  await page.reload();
  await expect(page.getByRole('heading', { name: '选择登录方式', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '显示设置', exact: true }).tap();
  await expect(page.getByRole('checkbox', { name: '大字', exact: true })).toBeChecked();
});

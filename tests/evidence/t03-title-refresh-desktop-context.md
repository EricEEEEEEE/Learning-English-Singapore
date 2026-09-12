# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/t02-boundaries.spec.mjs >> T02 boundary: zh-Hans expanded large text fits and survives a language change
- Location: e2e/t02-boundaries.spec.mjs:20:3

# Error details

```
Error: expect(page).toHaveTitle(expected) failed

Expected pattern: /start by listening/
Received string:  "Learning English in Singapore · 从听懂开始"
Timeout: 5000ms

Call log:
  - Expect "toHaveTitle" with timeout 5000ms
    14 × locator resolved to <html lang="en">…</html>
       - unexpected value "Learning English in Singapore · 从听懂开始"

```

```yaml
- banner:
  - paragraph: Learning English in Singapore
  - text: Flow demo
- main:
  - heading "In Singapore, start by listening." [level=1]
  - paragraph: From ordering a coffee to talking with your child’s teacher. Bring English into everyday life, a little at a time.
  - button "View demo explanation"
  - paragraph: Listen first. Your pace.
  - group "Choose how to sign in":
    - heading "Choose how to sign in" [level=2]
    - paragraph: Both options are available to everyone. Account connections are not connected yet.
    - button "WeChat Not connected yet"
    - button "Google Not connected yet"
  - button "Change language"
  - paragraph: Experimental language version · text and audio not yet reviewed by native speakers
  - button "Listen to instructions Not connected yet" [disabled]
  - button "Permissions and privacy"
  - button "Display settings"
- contentinfo:
  - heading "Every accent deserves respect" [level=2]
  - paragraph: English has many accents and dialects, and all deserve respect. This space helps you become familiar with Singapore English and local expressions; you can keep your own accent. If something is unclear, you can slow down, listen again, or ask the other person to say it in a different way.
  - paragraph: Listen first. Your pace.
- alert
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | // Promote T02's exploratory checks during T03 test-writing; original T02 tests stay frozen.
  4  | const languages = [
  5  |   ['zh-Hans', '简体中文', '显示设置', '大字', '减少动画', '权限说明', '更换语言', '查看演示说明', /在新加坡/],
  6  |   ['id', 'Bahasa Indonesia', 'Pengaturan tampilan', 'Teks besar', 'Kurangi animasi', 'Izin dan privasi', 'Ganti bahasa', 'Lihat penjelasan demo', /Di Singapura/],
  7  |   ['ja', '日本語', '表示設定', '大きな文字', '動きを減らす', '権限とプライバシー', '言語を変更', 'デモの説明を見る', /シンガポール/],
  8  |   ['en', 'English', 'Display settings', 'Larger text', 'Reduce motion', 'Permissions and privacy', 'Change language', 'View demo explanation', /start by listening/],
  9  | ];
  10 | test.use({ hasTouch: true });
  11 | test.beforeEach(async ({ page, context, baseURL }) => {
  12 |   await context.route('**/*', async route => {
  13 |     expect(new URL(route.request().url()).origin).toBe(new URL(baseURL).origin);
  14 |     await route.continue();
  15 |   });
  16 |   await page.goto('/');
  17 | });
  18 | 
  19 | for (const [code, name, settings, large, reduced, permissions, change, explanation, title] of languages) {
  20 |   test(`T02 boundary: ${code} expanded large text fits and survives a language change`, async ({ page }) => {
  21 |     await page.getByRole('button', { name: new RegExp(`^${name}`) }).tap();
  22 |     await expect(page).toHaveTitle(title);
  23 |     await page.getByRole('button', { name: settings, exact: true }).tap();
  24 |     await page.getByRole('checkbox', { name: large, exact: true }).check();
  25 |     await page.getByRole('checkbox', { name: reduced, exact: true }).check();
  26 |     await page.getByRole('button', { name: permissions, exact: true }).tap();
  27 |     await page.getByRole('button', { name: explanation, exact: true }).tap();
  28 |     expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
  29 |     for (const control of await page.locator('button:visible').all()) {
  30 |       const box = await control.boundingBox();
  31 |       expect(box.x).toBeGreaterThanOrEqual(0);
  32 |       expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
  33 |       expect(box.width).toBeGreaterThanOrEqual(44);
  34 |       expect(box.height).toBeGreaterThanOrEqual(44);
  35 |     }
  36 |     await page.getByRole('button', { name: change, exact: true }).tap();
  37 |     await page.getByRole('button', { name: /^English/ }).tap();
  38 |     await page.reload();
> 39 |     await expect(page).toHaveTitle(/start by listening/);
     |                        ^ Error: expect(page).toHaveTitle(expected) failed
  40 |     await page.getByRole('button', { name: 'Display settings', exact: true }).tap();
  41 |     await expect(page.getByRole('checkbox', { name: 'Larger text', exact: true })).toBeChecked();
  42 |     await expect(page.getByRole('checkbox', { name: 'Reduce motion', exact: true })).toBeChecked();
  43 |   });
  44 | }
  45 | 
  46 | test('T02 boundary: a temporary write failure clears after a later save succeeds', async ({ page }) => {
  47 |   await page.evaluate(() => {
  48 |     const save = Storage.prototype.setItem;
  49 |     let calls = 0;
  50 |     Storage.prototype.setItem = function (...args) {
  51 |       calls += 1;
  52 |       if (calls === 1) throw new DOMException('Temporary test failure', 'SecurityError');
  53 |       return save.apply(this, args);
  54 |     };
  55 |   });
  56 |   await page.getByRole('button', { name: /^简体中文/ }).tap();
  57 |   await expect(page.getByRole('status')).toContainText('无法保存');
  58 |   await page.getByRole('button', { name: '显示设置', exact: true }).tap();
  59 |   await page.getByRole('checkbox', { name: '大字', exact: true }).check();
  60 |   await expect(page.locator('[role="status"]')).toHaveText('');
  61 |   await page.reload();
  62 |   await expect(page.getByRole('heading', { name: '选择登录方式', exact: true })).toBeVisible();
  63 |   await page.getByRole('button', { name: '显示设置', exact: true }).tap();
  64 |   await expect(page.getByRole('checkbox', { name: '大字', exact: true })).toBeChecked();
  65 | });
  66 | 
```
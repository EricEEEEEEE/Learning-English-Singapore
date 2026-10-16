import { test, expect } from '@playwright/test';
import { emptyRequirements } from '../fixtures/empty-requirements.mjs';

const sceneTitle = '你想在哪个场景下学习英语？';
const ownerA = { authenticated: true, accountKey: 't66-regression-owner-a' };
const ownerB = { authenticated: true, accountKey: 't66-regression-owner-b' };

test.use({ locale: 'zh-CN' });
test.beforeEach(async ({ context, baseURL }) => {
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== new URL(baseURL).origin) throw new Error('T66 regressions must stay offline.');
    return route.continue();
  });
  await emptyRequirements(context);
});

test('T66 / T65 regression: unknown auth notification names do not crash the simple login page', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/auth/session', route => route.fulfill({ json: { authenticated: false, accountKey: null } }));
  for (const name of ['__proto__', 'constructor', 'toString']) {
    await page.goto(`/?auth=${encodeURIComponent(name)}&language=zh-Hans`);
    await expect(page.getByRole('heading', { name: '选择登录方式', exact: true })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('登录未完成，请重新尝试。');
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
  }
  expect(errors).toEqual([]);
});

test('T66 / K2 continuous input: same-account session recheck preserves focus and the text selection', async ({ page }) => {
  let held;
  let hold = false;
  await page.route('**/api/auth/session', route => hold ? (held = route) : route.fulfill({ json: ownerA }));
  await page.goto('/');
  const input = page.getByRole('textbox', { name: sceneTitle, exact: true });
  const text = '我想问清社区活动的时间。';
  await input.fill(text);
  await input.evaluate(element => { element.focus(); element.setSelectionRange(2, 5); });
  hold = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => !!held).toBe(true);
  await held.fulfill({ json: ownerA });
  await expect(input).toHaveValue(text);
  await expect(input).toBeFocused();
  await expect.poll(() => input.evaluate(element => [element.selectionStart, element.selectionEnd])).toEqual([2, 5]);
  await input.press('x');
  await expect(input).toHaveValue(`${text.slice(0, 2)}x${text.slice(5)}`);
});

test('T66 / K1.2: a delayed old account response cannot overwrite a newer verified account and its draft', async ({ page }) => {
  await page.addInitScript(initial => {
    const originalFetch = window.fetch.bind(window);
    const transport = { hold: false, pending: [] };
    window.t66SessionTransport = transport;
    window.fetch = (input, options) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (url.pathname !== '/api/auth/session') return originalFetch(input, options);
      if (!transport.hold) return Promise.resolve(new Response(JSON.stringify(initial), { headers: { 'Content-Type': 'application/json' } }));
      // Deliberately ignore AbortSignal: the UI must also reject a late result by request order.
      return new Promise(resolve => transport.pending.push(body => resolve(new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }))));
    };
  }, ownerA);
  await page.goto('/');
  const input = page.getByRole('textbox', { name: sceneTitle, exact: true });
  await input.fill('账号A的场景');
  await page.evaluate(() => { window.t66SessionTransport.hold = true; window.dispatchEvent(new Event('focus')); });
  await expect.poll(() => page.evaluate(() => window.t66SessionTransport.pending.length)).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('le-sg-auth-invalid')));
  await expect.poll(() => page.evaluate(() => window.t66SessionTransport.pending.length)).toBe(2);
  await page.evaluate(body => window.t66SessionTransport.pending[1](body), ownerB);
  await expect(input).toHaveValue('');
  await input.fill('账号B的场景');
  await page.evaluate(async body => {
    window.t66SessionTransport.pending[0](body);
    await new Promise(resolve => setTimeout(resolve, 0));
  }, ownerA);
  await expect(input).toHaveValue('账号B的场景');
  await expect(page.getByText('账号A的场景', { exact: true })).toHaveCount(0);
});

test('T66 / T65 regression: a response whose headers arrive but JSON body hangs still times out to retry', async ({ page }) => {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, options) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (url.pathname !== '/api/auth/session') return originalFetch(input, options);
      // The headers phase has resolved; body reading remains pending until the request is aborted.
      return Promise.resolve({ ok: true, json: () => new Promise((_resolve, reject) => {
        window.t66BodyReadStarted = true;
        const abort = () => reject(new DOMException('Synthetic stalled body', 'AbortError'));
        if (options?.signal?.aborted) abort();
        else options?.signal?.addEventListener('abort', abort, { once: true });
      }) });
    };
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.t66BodyReadStarted)).toBe(true);
  await expect(page.getByRole('button', { name: '重新检查登录', exact: true })).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('status')).not.toContainText('正在确认登录');
});

test('T66 / K1.3,K2: unavailable browser storage cannot block a verified user from entering a scene or changing language', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Synthetic storage denied', 'SecurityError'); } });
  });
  await page.route('**/api/auth/session', route => route.fulfill({ json: ownerA }));
  await page.goto('/');
  await page.getByRole('textbox', { name: sceneTitle, exact: true }).fill('我想和邻居聊一聊。');
  await page.getByRole('combobox').selectOption('ko');
  await expect(page.getByRole('textbox', { name: '어떤 상황에서 영어를 배우고 싶으세요?', exact: true })).toHaveValue('我想和邻居聊一聊。');
  await expect(page.getByRole('status')).not.toBeEmpty();
  await expect(page.getByRole('link', { name: /Google/ })).toHaveCount(0);
});

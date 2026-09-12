import { test as base, expect } from '@playwright/test';

const languages = [
  { code: 'zh-Hans', choice: '简体中文', heading: '选择登录方式', wechat: '微信',
    permissions: '权限说明', audio: '听说明', change: '更换语言',
    trial: /试验|未审核/, unavailable: /尚未接入|待接入/, microphone: /麦克风|录音/,
    accent: /保留自己的口音/, repair: /放慢.*再听一次.*换个说法/,
    success: /登录成功|您已登录|你已登录|账号已创建|我的学习记录/ },
  { code: 'id', choice: 'Bahasa Indonesia', heading: 'Pilih cara masuk', wechat: 'WeChat',
    permissions: 'Izin dan privasi', audio: 'Dengarkan petunjuk', change: 'Ganti bahasa',
    trial: /uji coba|belum ditinjau/i, unavailable: /belum terhubung/i, microphone: /mikrofon|merekam/i,
    accent: /aksen Anda sendiri/, repair: /memperlambat.*mendengarkan lagi.*cara lain/,
    success: /berhasil masuk|sudah masuk|akun (telah )?dibuat|riwayat belajar/i },
  { code: 'ja', choice: '日本語', heading: 'ログイン方法を選ぶ', wechat: 'WeChat',
    permissions: '権限とプライバシー', audio: '説明を聞く', change: '言語を変更',
    trial: /試験版|未審査/, unavailable: /未接続|準備中/, microphone: /マイク|録音/,
    accent: /自分のアクセント/, repair: /速度を落と.*もう一度.*別の言い方/,
    success: /ログイン成功|ログイン済み|アカウントを作成しました|学習履歴/ },
  { code: 'en', choice: 'English', heading: 'Choose how to sign in', wechat: 'WeChat',
    permissions: 'Permissions and privacy', audio: 'Listen to instructions', change: 'Change language',
    trial: /experimental|not yet reviewed/i, unavailable: /not connected yet/i, microphone: /microphone|record/i,
    accent: /your own accent/, repair: /slow down.*listen again.*different way/,
    success: /sign-in successful|successfully signed in|you are signed in|account created|my learning history/i },
];

const respectStatement = '英语有多种口音和方言，都值得尊重。这里帮助你熟悉新加坡英语及本地表达；你可以保留自己的口音。听不懂时，可以放慢、再听一次，也可以请对方换个说法。';
const excludedCourses = /阅读(?:课程|训练)|拼写(?:课程|训练)|写作(?:课程|训练|考试)|英语考试|reading (?:course|practice)|writing (?:course|practice|test)|spelling (?:course|practice|test)|kursus membaca|latihan membaca|kursus menulis|latihan menulis|latihan mengeja|ujian (?:bahasa Inggris|menulis)|読解(?:コース|練習)|読み書き(?:コース|練習)|作文(?:コース|練習)|スペリング(?:コース|練習)|リーディング|ライティング|英語試験/i;

const test = base.extend({
  page: async ({ page, context, baseURL }, use) => {
    const external = [];
    const errors = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === new URL(baseURL).origin) return route.continue();
      external.push(url.origin);
      await route.abort('blockedbyclient');
    });
    await context.routeWebSocket('**/*', route => {
      external.push(new URL(route.url()).origin);
      route.close();
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await context.addInitScript(() => {
      window.__entryCapabilityCalls = [];
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => {
        window.__entryCapabilityCalls.push('microphone');
        throw new Error('T02 must not request microphone or camera access.');
      };
      if (window.speechSynthesis) window.speechSynthesis.speak = () => {
        window.__entryCapabilityCalls.push('browser-tts');
        throw new Error('Browser TTS must not substitute for the unconnected speech service.');
      };
    });
    await use(page);
    expect(external, 'Only the local application may be contacted').toEqual([]);
    expect(errors, 'Language selection and explanations must remain usable').toEqual([]);
    expect(await page.evaluate(() => window.__entryCapabilityCalls)).toEqual([]);
  },
});

// Touch emulation at all three widths is deliberate; this is not a real-device claim.
test.use({ hasTouch: true, locale: 'en-US' });
test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('T02 / F1.1: language choice comes before either login option', async ({ page }) => {
  for (const language of languages) {
    await expect(page.getByRole('button', { name: new RegExp(`^${language.choice}`) })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: /微信|WeChat|Google/ })).toHaveCount(0);
  await expect(page.getByText(respectStatement, { exact: true })).toBeVisible();
});

for (const language of languages) {
  test(`T02 / F1.1,F4.5,F13.3: ${language.code} persists through both unconnected login attempts and help`, async ({ page }, testInfo) => {
    await page.getByRole('button', { name: new RegExp(`^${language.choice}`) }).tap();
    await expect(page.locator('html')).toHaveAttribute('lang', language.code);
    await expect(page.getByRole('heading', { name: language.heading, exact: true })).toBeVisible();
    await expect(page.getByRole('main')).toContainText(language.trial);
    const accounts = page.getByRole('group', { name: language.heading, exact: true });
    await expect(accounts.locator('button, a')).toHaveCount(2);
    const wechat = accounts.getByRole('button', { name: new RegExp(language.wechat) });
    const google = accounts.getByRole('button', { name: /Google/ });
    await expect(wechat).toBeVisible();
    await expect(google).toBeVisible();
    for (const provider of [wechat, google]) {
      await provider.tap();
      await expect(page.getByRole('status')).toContainText(language.unavailable);
      await expect(page.getByRole('heading', { name: language.heading, exact: true })).toBeVisible();
      expect(await page.locator('body').innerText()).not.toMatch(language.success);
    }
    await page.getByRole('button', { name: language.permissions, exact: true }).tap();
    const permissions = page.getByRole('region', { name: language.permissions, exact: true });
    await expect(permissions).toBeVisible();
    await expect(permissions).toContainText(language.microphone);
    const voice = page.getByRole('button', { name: new RegExp(language.audio) });
    await expect(voice).toBeDisabled();
    await expect(voice).toHaveAccessibleName(language.unavailable);
    await expect(page.locator('body')).toContainText(language.accent);
    await expect(page.locator('body')).toContainText(language.repair);
    await expect(page.locator('input[type="password"], input[type="email"], input[type="tel"], audio[src], video[src]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: excludedCourses })).toHaveCount(0);
    await expect(page.getByRole('link', { name: excludedCourses })).toHaveCount(0);
    if (language.code !== 'zh-Hans') {
      expect(await page.locator('body').innerText()).not.toMatch(/演示说明|尊重每一种口音|尚未接入|先听懂/);
    }
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', language.code);
    await expect(page.getByRole('heading', { name: language.heading, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: language.change, exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${language.code}-login.png`), fullPage: true });
  });
}

test('T02 / F13.3: changing the selected language replaces and persists the preference', async ({ page }) => {
  await page.getByRole('button', { name: /^日本語/ }).tap();
  await page.getByRole('button', { name: '言語を変更', exact: true }).tap();
  await page.getByRole('button', { name: /^Bahasa Indonesia/ }).tap();
  await expect(page.getByRole('heading', { name: 'Pilih cara masuk', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'id');
  await expect(page.getByRole('button', { name: 'Ganti bahasa', exact: true })).toBeVisible();
  expect(await page.locator('body').innerText()).not.toContain('ログイン方法を選ぶ');
});

test('T02 / F13.1,F13.2: larger text and reduced motion persist without clipping mobile controls', async ({ page }) => {
  await page.getByRole('button', { name: /^简体中文/ }).tap();
  const heading = page.getByRole('heading', { name: '选择登录方式', exact: true });
  const initialSize = await heading.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  const bodyCopy = page.getByRole('main').locator('p:visible').first();
  const provider = page.getByRole('button', { name: /Google/ });
  const initialBodySize = await bodyCopy.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  const initialButtonSize = await provider.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  await page.getByRole('button', { name: '显示设置', exact: true }).tap();
  await page.getByRole('checkbox', { name: '大字', exact: true }).check();
  expect(await heading.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(initialSize * 1.15);
  expect(await bodyCopy.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(initialBodySize * 1.15);
  expect(await provider.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(initialButtonSize * 1.15);
  await page.getByRole('checkbox', { name: '减少动画', exact: true }).check();
  const notice = page.getByRole('button', { name: /演示说明/ });
  expect(await notice.evaluate(element => parseFloat(getComputedStyle(element).transitionDuration))).toBeLessThanOrEqual(0.01);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
  for (const control of await page.locator('button:visible').all()) {
    const box = await control.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
    await expect(control).toHaveAccessibleName(/\S/);
  }
  await page.reload();
  expect(await heading.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(initialSize * 1.15);
  await page.getByRole('button', { name: '显示设置', exact: true }).tap();
  await expect(page.getByRole('checkbox', { name: '大字', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '减少动画', exact: true })).toBeChecked();
});

for (const method of ['getItem', 'setItem']) {
  test(`T02: blocked storage ${method} keeps selection usable and explains the limitation`, async ({ page, context }) => {
    await context.addInitScript(method => {
      Storage.prototype[method] = () => { throw new DOMException('Test: storage is unavailable', 'SecurityError'); };
    }, method);
    await page.reload();
    await page.getByRole('button', { name: /^简体中文/ }).tap();
    await expect(page.getByRole('heading', { name: '选择登录方式', exact: true })).toBeVisible();
    await expect(page.getByRole('status')).toContainText(/无法(保存|读取).*本次/);
    await expect(page.getByRole('button', { name: /微信/ })).toBeEnabled();
    await expect(page.getByRole('button', { name: /Google/ })).toBeEnabled();
  });
}

test('T01 regression: actual Tab, Space, Enter and tap operate the demo explanation', async ({ page }) => {
  const toggle = page.getByRole('button', { name: /演示说明/ });
  for (let step = 0; step < 24; step += 1) {
    await page.keyboard.press('Tab');
    if (await toggle.evaluate(element => element === document.activeElement)) break;
  }
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.tap();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.tap();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

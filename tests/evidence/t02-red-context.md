# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: t02-language-login.spec.mjs >> T02 / F1.1: language choice comes before either login option
- Location: e2e/t02-language-login.spec.mjs:67:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /^简体中文/ })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('button', { name: /^简体中文/ }) with timeout 5000ms
  - waiting for getByRole('button', { name: /^简体中文/ })

```

```yaml
- banner:
  - paragraph: Learning English in Singapore
  - text: 流程演示
- main:
  - heading "在新加坡， 从听懂开始。" [level=1]
  - paragraph: 从买一杯咖啡，到和老师聊聊孩子。 让英语，一点点走进你的生活。
  - button "查看演示说明"
  - region "未来，你可以这样练习":
    - heading "未来，你可以这样练习" [level=2]
    - paragraph: 听优先 · 按自己的节奏
    - list:
      - listitem:
        - heading "先听懂" [level=3]
        - paragraph: 从生活里的一段对话开始。
      - listitem:
        - heading "再听一遍" [level=3]
        - paragraph: 同一段内容，按你的节奏反复听。
      - listitem:
        - heading "想说，再试着说" [level=3]
        - paragraph: 准备好了，再和 AI 角色练习。
    - paragraph: 练习功能正在准备中。
- contentinfo:
  - paragraph: 尊重每一种口音。 不必说得完美，也可以慢慢开始。
  - paragraph: Listen first. Your pace.
- alert
```

# Test source

```ts
  1   | import { test as base, expect } from '@playwright/test';
  2   | 
  3   | const languages = [
  4   |   { code: 'zh-Hans', choice: '简体中文', heading: '选择登录方式', wechat: '微信',
  5   |     permissions: '权限说明', audio: '听说明', change: '更换语言',
  6   |     trial: /试验|未审核/, unavailable: /尚未接入|待接入/, microphone: /麦克风|录音/,
  7   |     accent: /保留自己的口音/, repair: /放慢.*再听一次.*换个说法/,
  8   |     success: /登录成功|您已登录|你已登录|账号已创建|我的学习记录/ },
  9   |   { code: 'id', choice: 'Bahasa Indonesia', heading: 'Pilih cara masuk', wechat: 'WeChat',
  10  |     permissions: 'Izin dan privasi', audio: 'Dengarkan petunjuk', change: 'Ganti bahasa',
  11  |     trial: /uji coba|belum ditinjau/i, unavailable: /belum terhubung/i, microphone: /mikrofon|merekam/i,
  12  |     accent: /aksen Anda sendiri/, repair: /memperlambat.*mendengarkan lagi.*cara lain/,
  13  |     success: /berhasil masuk|sudah masuk|akun (telah )?dibuat|riwayat belajar/i },
  14  |   { code: 'ja', choice: '日本語', heading: 'ログイン方法を選ぶ', wechat: 'WeChat',
  15  |     permissions: '権限とプライバシー', audio: '説明を聞く', change: '言語を変更',
  16  |     trial: /試験版|未審査/, unavailable: /未接続|準備中/, microphone: /マイク|録音/,
  17  |     accent: /自分のアクセント/, repair: /速度を落と.*もう一度.*別の言い方/,
  18  |     success: /ログイン成功|ログイン済み|アカウントを作成しました|学習履歴/ },
  19  |   { code: 'en', choice: 'English', heading: 'Choose how to sign in', wechat: 'WeChat',
  20  |     permissions: 'Permissions and privacy', audio: 'Listen to instructions', change: 'Change language',
  21  |     trial: /experimental|not yet reviewed/i, unavailable: /not connected yet/i, microphone: /microphone|record/i,
  22  |     accent: /your own accent/, repair: /slow down.*listen again.*different way/,
  23  |     success: /sign-in successful|successfully signed in|you are signed in|account created|my learning history/i },
  24  | ];
  25  | 
  26  | const respectStatement = '英语有多种口音和方言，都值得尊重。这里帮助你熟悉新加坡英语及本地表达；你可以保留自己的口音。听不懂时，可以放慢、再听一次，也可以请对方换个说法。';
  27  | const excludedCourses = /阅读(?:课程|训练)|拼写(?:课程|训练)|写作(?:课程|训练|考试)|英语考试|reading (?:course|practice)|writing (?:course|practice|test)|spelling (?:course|practice|test)|kursus membaca|latihan membaca|kursus menulis|latihan menulis|latihan mengeja|ujian (?:bahasa Inggris|menulis)|読解(?:コース|練習)|読み書き(?:コース|練習)|作文(?:コース|練習)|スペリング(?:コース|練習)|リーディング|ライティング|英語試験/i;
  28  | 
  29  | const test = base.extend({
  30  |   page: async ({ page, context, baseURL }, use) => {
  31  |     const external = [];
  32  |     const errors = [];
  33  |     await context.route('**/*', async route => {
  34  |       const url = new URL(route.request().url());
  35  |       if (url.origin === new URL(baseURL).origin) return route.continue();
  36  |       external.push(url.origin);
  37  |       await route.abort('blockedbyclient');
  38  |     });
  39  |     await context.routeWebSocket('**/*', route => {
  40  |       external.push(new URL(route.url()).origin);
  41  |       route.close();
  42  |     });
  43  |     page.on('pageerror', error => errors.push(error.message));
  44  |     page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  45  |     await context.addInitScript(() => {
  46  |       window.__entryCapabilityCalls = [];
  47  |       if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => {
  48  |         window.__entryCapabilityCalls.push('microphone');
  49  |         throw new Error('T02 must not request microphone or camera access.');
  50  |       };
  51  |       if (window.speechSynthesis) window.speechSynthesis.speak = () => {
  52  |         window.__entryCapabilityCalls.push('browser-tts');
  53  |         throw new Error('Browser TTS must not substitute for the unconnected speech service.');
  54  |       };
  55  |     });
  56  |     await use(page);
  57  |     expect(external, 'Only the local application may be contacted').toEqual([]);
  58  |     expect(errors, 'Language selection and explanations must remain usable').toEqual([]);
  59  |     expect(await page.evaluate(() => window.__entryCapabilityCalls)).toEqual([]);
  60  |   },
  61  | });
  62  | 
  63  | // Touch emulation at all three widths is deliberate; this is not a real-device claim.
  64  | test.use({ hasTouch: true, locale: 'en-US' });
  65  | test.beforeEach(async ({ page }) => { await page.goto('/'); });
  66  | 
  67  | test('T02 / F1.1: language choice comes before either login option', async ({ page }) => {
  68  |   for (const language of languages) {
> 69  |     await expect(page.getByRole('button', { name: new RegExp(`^${language.choice}`) })).toBeVisible();
      |                                                                                         ^ Error: expect(locator).toBeVisible() failed
  70  |   }
  71  |   await expect(page.getByRole('button', { name: /微信|WeChat|Google/ })).toHaveCount(0);
  72  |   await expect(page.getByText(respectStatement, { exact: true })).toBeVisible();
  73  | });
  74  | 
  75  | for (const language of languages) {
  76  |   test(`T02 / F1.1,F4.5,F13.3: ${language.code} persists through both unconnected login attempts and help`, async ({ page }, testInfo) => {
  77  |     await page.getByRole('button', { name: new RegExp(`^${language.choice}`) }).tap();
  78  |     await expect(page.locator('html')).toHaveAttribute('lang', language.code);
  79  |     await expect(page.getByRole('heading', { name: language.heading, exact: true })).toBeVisible();
  80  |     await expect(page.getByRole('main')).toContainText(language.trial);
  81  |     const accounts = page.getByRole('group', { name: language.heading, exact: true });
  82  |     await expect(accounts.locator('button, a')).toHaveCount(2);
  83  |     const wechat = accounts.getByRole('button', { name: new RegExp(language.wechat) });
  84  |     const google = accounts.getByRole('button', { name: /Google/ });
  85  |     await expect(wechat).toBeVisible();
  86  |     await expect(google).toBeVisible();
  87  |     for (const provider of [wechat, google]) {
  88  |       await provider.tap();
  89  |       await expect(page.getByRole('status')).toContainText(language.unavailable);
  90  |       await expect(page.getByRole('heading', { name: language.heading, exact: true })).toBeVisible();
  91  |       expect(await page.locator('body').innerText()).not.toMatch(language.success);
  92  |     }
  93  |     await page.getByRole('button', { name: language.permissions, exact: true }).tap();
  94  |     const permissions = page.getByRole('region', { name: language.permissions, exact: true });
  95  |     await expect(permissions).toBeVisible();
  96  |     await expect(permissions).toContainText(language.microphone);
  97  |     const voice = page.getByRole('button', { name: new RegExp(language.audio) });
  98  |     await expect(voice).toBeDisabled();
  99  |     await expect(voice).toHaveAccessibleName(language.unavailable);
  100 |     await expect(page.locator('body')).toContainText(language.accent);
  101 |     await expect(page.locator('body')).toContainText(language.repair);
  102 |     await expect(page.locator('input[type="password"], input[type="email"], input[type="tel"], audio[src], video[src]')).toHaveCount(0);
  103 |     await expect(page.getByRole('button', { name: excludedCourses })).toHaveCount(0);
  104 |     await expect(page.getByRole('link', { name: excludedCourses })).toHaveCount(0);
  105 |     if (language.code !== 'zh-Hans') {
  106 |       expect(await page.locator('body').innerText()).not.toMatch(/演示说明|尊重每一种口音|尚未接入|先听懂/);
  107 |     }
  108 |     await page.reload();
  109 |     await expect(page.locator('html')).toHaveAttribute('lang', language.code);
  110 |     await expect(page.getByRole('heading', { name: language.heading, exact: true })).toBeVisible();
  111 |     await expect(page.getByRole('button', { name: language.change, exact: true })).toBeVisible();
  112 |     await page.screenshot({ path: testInfo.outputPath(`${language.code}-login.png`), fullPage: true });
  113 |   });
  114 | }
  115 | 
  116 | test('T02 / F13.3: changing the selected language replaces and persists the preference', async ({ page }) => {
  117 |   await page.getByRole('button', { name: /^日本語/ }).tap();
  118 |   await page.getByRole('button', { name: '言語を変更', exact: true }).tap();
  119 |   await page.getByRole('button', { name: /^Bahasa Indonesia/ }).tap();
  120 |   await expect(page.getByRole('heading', { name: 'Pilih cara masuk', exact: true })).toBeVisible();
  121 |   await page.reload();
  122 |   await expect(page.locator('html')).toHaveAttribute('lang', 'id');
  123 |   await expect(page.getByRole('button', { name: 'Ganti bahasa', exact: true })).toBeVisible();
  124 |   expect(await page.locator('body').innerText()).not.toContain('ログイン方法を選ぶ');
  125 | });
  126 | 
  127 | test('T02 / F13.1,F13.2: larger text and reduced motion persist without clipping mobile controls', async ({ page }) => {
  128 |   await page.getByRole('button', { name: /^简体中文/ }).tap();
  129 |   const heading = page.getByRole('heading', { name: '选择登录方式', exact: true });
  130 |   const initialSize = await heading.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  131 |   const bodyCopy = page.getByRole('main').locator('p:visible').first();
  132 |   const provider = page.getByRole('button', { name: /Google/ });
  133 |   const initialBodySize = await bodyCopy.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  134 |   const initialButtonSize = await provider.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  135 |   await page.getByRole('button', { name: '显示设置', exact: true }).tap();
  136 |   await page.getByRole('checkbox', { name: '大字', exact: true }).check();
  137 |   expect(await heading.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(initialSize * 1.15);
  138 |   expect(await bodyCopy.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(initialBodySize * 1.15);
  139 |   expect(await provider.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(initialButtonSize * 1.15);
  140 |   await page.getByRole('checkbox', { name: '减少动画', exact: true }).check();
  141 |   const notice = page.getByRole('button', { name: /演示说明/ });
  142 |   expect(await notice.evaluate(element => parseFloat(getComputedStyle(element).transitionDuration))).toBeLessThanOrEqual(0.01);
  143 |   expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
  144 |   for (const control of await page.locator('button:visible').all()) {
  145 |     const box = await control.boundingBox();
  146 |     expect(box.width).toBeGreaterThanOrEqual(44);
  147 |     expect(box.height).toBeGreaterThanOrEqual(44);
  148 |     expect(box.x).toBeGreaterThanOrEqual(0);
  149 |     expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
  150 |     await expect(control).toHaveAccessibleName(/\S/);
  151 |   }
  152 |   await page.reload();
  153 |   expect(await heading.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(initialSize * 1.15);
  154 |   await page.getByRole('button', { name: '显示设置', exact: true }).tap();
  155 |   await expect(page.getByRole('checkbox', { name: '大字', exact: true })).toBeChecked();
  156 |   await expect(page.getByRole('checkbox', { name: '减少动画', exact: true })).toBeChecked();
  157 | });
  158 | 
  159 | for (const method of ['getItem', 'setItem']) {
  160 |   test(`T02: blocked storage ${method} keeps selection usable and explains the limitation`, async ({ page, context }) => {
  161 |     await context.addInitScript(method => {
  162 |       Storage.prototype[method] = () => { throw new DOMException('Test: storage is unavailable', 'SecurityError'); };
  163 |     }, method);
  164 |     await page.reload();
  165 |     await page.getByRole('button', { name: /^简体中文/ }).tap();
  166 |     await expect(page.getByRole('heading', { name: '选择登录方式', exact: true })).toBeVisible();
  167 |     await expect(page.getByRole('status')).toContainText(/无法(保存|读取).*本次/);
  168 |     await expect(page.getByRole('button', { name: /微信/ })).toBeEnabled();
  169 |     await expect(page.getByRole('button', { name: /Google/ })).toBeEnabled();
```
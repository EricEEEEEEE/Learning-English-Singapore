# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/t03-onboarding.spec.mjs >> T03 / F2.1,F13.1: separate demo entry starts one accessible question without login or microphone
- Location: e2e/t03-onboarding.spec.mjs:61:1

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: locator.tap: Test timeout of 20000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: '预览逐题引导', exact: true })

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]:
      - paragraph [ref=e4]:
        - text: Learning English
        - generic [ref=e5]: in Singapore
      - generic [ref=e6]: 流程演示
    - main [ref=e7]:
      - generic [ref=e8]:
        - heading "在新加坡， 从听懂开始。" [level=1] [ref=e9]:
          - text: 在新加坡，
          - generic [ref=e10]: 从听懂开始。
        - paragraph [ref=e11]: 从买一杯咖啡，到和老师聊聊孩子。让英语，一点点走进你的生活。
        - button "查看演示说明" [ref=e13] [cursor=pointer]:
          - text: 查看演示说明
          - generic [aria-hidden] [ref=e16]: +
        - paragraph [ref=e17]: 听优先，按自己的节奏。
      - generic [ref=e18]:
        - group [ref=e19]:
          - heading "选择登录方式" [active] [level=2] [ref=e22]
          - paragraph [ref=e23]: 两个入口都可选。真实账号连接尚未接入。
          - generic [ref=e24]:
            - button "微信 尚未接入" [ref=e25] [cursor=pointer]:
              - text: 微信
              - generic [ref=e29]: 尚未接入
            - button "Google 尚未接入" [ref=e30] [cursor=pointer]:
              - generic [aria-hidden] [ref=e31]: G
              - text: Google
              - generic [ref=e32]: 尚未接入
        - button "更换语言" [ref=e33] [cursor=pointer]
        - paragraph [ref=e36]: 语言试验版 · 文字与语音尚未经过母语审查
        - button "听说明 尚未接入" [disabled] [ref=e37]:
          - generic [ref=e40]:
            - text: 听说明
            - generic [ref=e41]: 尚未接入
        - generic [ref=e42]:
          - button "权限说明" [ref=e43] [cursor=pointer]
          - button "显示设置" [ref=e46] [cursor=pointer]
    - contentinfo [ref=e49]:
      - generic [ref=e50]:
        - heading "尊重每一种口音" [level=2] [ref=e51]
        - paragraph [ref=e52]: 英语有多种口音和方言，都值得尊重。这里帮助你熟悉新加坡英语及本地表达；你可以保留自己的口音。听不懂时，可以放慢、再听一次，也可以请对方换个说法。
      - paragraph [ref=e53]: 听优先，按自己的节奏。
  - alert [ref=e54]
```

# Test source

```ts
  1   | import { test as base, expect } from '@playwright/test';
  2   | 
  3   | const test = base.extend({
  4   |   page: async ({ page, context, baseURL }, use) => {
  5   |     const errors = [];
  6   |     const external = [];
  7   |     await context.route('**/*', async route => {
  8   |       if (new URL(route.request().url()).origin === new URL(baseURL).origin) return route.continue();
  9   |       external.push(route.request().url());
  10  |       await route.abort('blockedbyclient');
  11  |     });
  12  |     await context.routeWebSocket('**/*', route => { external.push(route.url()); route.close(); });
  13  |     page.on('pageerror', error => errors.push(error.message));
  14  |     page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  15  |     await context.addInitScript(() => {
  16  |       window.__onboardingMediaCalls = [];
  17  |       if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => {
  18  |         window.__onboardingMediaCalls.push('microphone');
  19  |         throw new Error('T03 must not request microphone or camera access');
  20  |       };
  21  |       if (window.speechSynthesis) window.speechSynthesis.speak = () => { window.__onboardingMediaCalls.push('tts'); };
  22  |       HTMLMediaElement.prototype.play = () => { window.__onboardingMediaCalls.push('media'); return Promise.resolve(); };
  23  |     });
  24  |     await use(page);
  25  |     expect(external, 'Only local prototype resources may be requested').toEqual([]);
  26  |     expect(errors, 'Onboarding must not fail in the browser').toEqual([]);
  27  |     expect(await page.evaluate(() => window.__onboardingMediaCalls), 'Simulated playback events never play substitute audio').toEqual([]);
  28  |   },
  29  | });
  30  | test.use({ hasTouch: true });
  31  | test.beforeEach(async ({ page }) => { await page.goto('/'); });
  32  | 
  33  | const current = page => page.getByRole('article', { name: '当前问题', exact: true });
  34  | const choices = page => current(page).getByRole('group', { name: '回答选项', exact: true }).getByRole('button');
  35  | async function enter(page) {
  36  |   await page.getByRole('button', { name: /^简体中文/ }).tap();
> 37  |   await page.getByRole('button', { name: '预览逐题引导', exact: true }).tap();
      |                                                                   ^ Error: locator.tap: Test timeout of 20000ms exceeded.
  38  |   await expect(current(page)).toBeVisible();
  39  | }
  40  | async function goToListening(page) {
  41  |   for (let step = 0; step < 6; step += 1) {
  42  |     if (await current(page).getByText('听音配图', { exact: true }).isVisible()) return;
  43  |     await page.getByRole('button', { name: '不知道', exact: true }).tap();
  44  |   }
  45  |   throw new Error('No listening/image item appeared within six preference questions');
  46  | }
  47  | async function finishCore(page) {
  48  |   let count = 0;
  49  |   while (await current(page).isVisible() && count < 15) {
  50  |     await page.getByRole('button', { name: '不知道', exact: true }).tap();
  51  |     count += 1;
  52  |   }
  53  |   expect(count).toBe(12);
  54  |   await expect(page.getByRole('heading', { name: '先从短句、慢一点开始', exact: true })).toBeVisible();
  55  | }
  56  | async function assertNoAssessmentClaims(page) {
  57  |   await expect(page.locator('body')).not.toContainText(/口语零分|英语零分|已掌握|考试通过|倒计时|排行榜|正确率|CEFR/);
  58  |   await expect(page.locator('input[type="text"], input[type="email"], input[type="tel"], input[type="password"], textarea')).toHaveCount(0);
  59  | }
  60  | 
  61  | test('T03 / F2.1,F13.1: separate demo entry starts one accessible question without login or microphone', async ({ page }, testInfo) => {
  62  |   await expect(page.getByRole('button', { name: '预览逐题引导', exact: true })).toHaveCount(0);
  63  |   await enter(page);
  64  |   await expect(page.getByText('流程演示', { exact: true })).toBeVisible();
  65  |   await expect(page.getByRole('article')).toHaveCount(1);
  66  |   await expect(current(page).getByRole('heading', { level: 2 })).toBeVisible();
  67  |   await expect(page.getByRole('button', { name: /听操作说明/ })).toBeDisabled();
  68  |   await expect(page.getByRole('button', { name: /听操作说明/ })).toHaveAccessibleName(/尚未接入/);
  69  |   const options = choices(page);
  70  |   expect(await options.count()).toBeGreaterThanOrEqual(2);
  71  |   expect(await options.count()).toBeLessThanOrEqual(4);
  72  |   for (const option of await options.all()) {
  73  |     expect(await option.locator('svg, img').count()).toBeGreaterThan(0);
  74  |     await expect(option).toHaveAccessibleName(/[\u3400-\u9fff]/);
  75  |   }
  76  |   const previousPrompt = await current(page).getByRole('heading', { level: 2 }).innerText();
  77  |   await page.getByRole('button', { name: '几乎不会英语', exact: true }).tap();
  78  |   await expect(current(page).getByRole('heading', { level: 2 })).not.toHaveText(previousPrompt);
  79  |   await expect(page.getByRole('button', { name: '回到上一题', exact: true })).toBeEnabled();
  80  |   expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
  81  |   for (const control of await page.locator('button:visible').all()) {
  82  |     const box = await control.boundingBox();
  83  |     expect(box.height).toBeGreaterThanOrEqual(44);
  84  |     expect(box.width).toBeGreaterThanOrEqual(44);
  85  |     expect(box.x).toBeGreaterThanOrEqual(0);
  86  |     expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
  87  |   }
  88  |   await assertNoAssessmentClaims(page);
  89  |   await page.screenshot({ path: testInfo.outputPath('question-flow.png'), fullPage: true });
  90  | });
  91  | 
  92  | test('T03 / F2.2,F2.3: twelve core items stay one-at-a-time and all unknown remains unknown', async ({ page }) => {
  93  |   await enter(page);
  94  |   let preferences = 0;
  95  |   let listening = 0;
  96  |   const prompts = [];
  97  |   for (let index = 0; index < 12; index += 1) {
  98  |     const question = current(page);
  99  |     await expect(question).toBeVisible();
  100 |     await expect(question.getByText(`第 ${index + 1} / 12 题`, { exact: true })).toBeVisible();
  101 |     prompts.push(await question.getByRole('heading', { level: 2 }).innerText());
  102 |     expect(await choices(page).count()).toBeGreaterThanOrEqual(2);
  103 |     expect(await choices(page).count()).toBeLessThanOrEqual(4);
  104 |     if (await question.getByText('听音配图', { exact: true }).isVisible()) {
  105 |       listening += 1;
  106 |       await expect(question.getByRole('button', { name: /听题目/ })).toBeDisabled();
  107 |       await expect(question).toContainText(/音频.*尚未接入/);
  108 |       for (const option of await choices(page).all()) expect(await option.locator('svg, img').count()).toBeGreaterThan(0);
  109 |     } else {
  110 |       preferences += 1;
  111 |       await expect(question.getByText('了解你的偏好', { exact: true })).toBeVisible();
  112 |     }
  113 |     await page.getByRole('button', { name: '不知道', exact: true }).tap();
  114 |   }
  115 |   expect(preferences).toBe(5);
  116 |   expect(listening).toBe(7);
  117 |   expect(new Set(prompts).size).toBe(12);
  118 |   await expect(current(page)).toHaveCount(0);
  119 |   await expect(page.getByRole('main')).toContainText('暂按入门程度开始，可随时调整');
  120 |   await expect(page.getByRole('main')).toContainText(/说英语尚未了解|口语尚未了解/);
  121 |   await expect(page.getByRole('main')).toContainText(/尚不能判断|尚未测量/);
  122 |   await assertNoAssessmentClaims(page);
  123 | });
  124 | 
  125 | test('T03: optional refinement is separate, stops at four, and cannot be restarted to exceed its cap', async ({ page }) => {
  126 |   await enter(page);
  127 |   await finishCore(page);
  128 |   await page.getByRole('button', { name: '继续了解（可选）', exact: true }).tap();
  129 |   for (let index = 0; index < 4; index += 1) {
  130 |     await expect(current(page).getByText(`可选问题 ${index + 1} / 4`, { exact: true })).toBeVisible();
  131 |     await page.getByRole('button', { name: '跳过这题', exact: true }).tap();
  132 |   }
  133 |   await expect(current(page)).toHaveCount(0);
  134 |   await expect(page.getByRole('button', { name: '继续了解（可选）', exact: true })).toHaveCount(0);
  135 |   await page.reload();
  136 |   await expect(page.getByRole('button', { name: '继续了解（可选）', exact: true })).toHaveCount(0);
  137 |   await expect(page.getByRole('main')).toContainText('暂按入门程度开始，可随时调整');
```
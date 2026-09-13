# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/t06-preview.spec.mjs >> T06 / F6.1,F7.1: full scene path shows two adult demo roles and the same partner opens when practice is chosen early
- Location: e2e/t06-preview.spec.mjs:51:1

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: locator.tap: Test timeout of 20000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: '预览听与练', exact: true })

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
        - generic [ref=e9]:
          - heading "场景草稿已备好（演示）" [active] [level=1] [ref=e10]
          - paragraph [ref=e11]: 离线整理演示，不是实际生成
          - paragraph [ref=e12]: 这里用通用沟通模板演示步骤，不表示已理解任意需求。辅助语言文案尚未经母语审查。
        - generic [ref=e13]:
          - paragraph [ref=e14]: 版本 1
          - paragraph [ref=e15]: 向老师了解一项课堂近况并确认下一步
          - paragraph [ref=e16]: 真实语音和视频尚未接入
        - region "本次练习偏好" [ref=e17]:
          - heading "本次练习偏好" [level=2] [ref=e18]
          - paragraph [ref=e19]: 短句入门 · 慢一点 · 充分帮助
          - paragraph [ref=e20]: 这些是练习偏好，听力尚不能判断，口语尚未观察。
        - list "正在准备（流程演示）" [ref=e21]:
          - listitem [ref=e22]:
            - generic [aria-hidden] [ref=e23]: "1"
            - generic [ref=e24]:
              - text: 准备对话
              - generic [ref=e25]: 模拟就绪
          - listitem [ref=e26]:
            - generic [aria-hidden] [ref=e27]: "2"
            - generic [ref=e28]:
              - text: 准备声音和画面
              - generic [ref=e29]: 模拟就绪
          - listitem [ref=e30]:
            - generic [aria-hidden] [ref=e31]: "3"
            - generic [ref=e32]:
              - text: 检查草稿
              - generic [ref=e33]: 模拟就绪
        - generic [ref=e34]:
          - region "示例步骤" [ref=e35]:
            - heading "示例步骤" [level=2] [ref=e36]
            - list [ref=e37]:
              - listitem [ref=e38]: 围绕「向老师了解一项课堂近况并确认下一步」，先说明自己想办的事。
              - listitem [ref=e39]: 先说明来意：围绕「向老师了解一项课堂近况并确认下一步」提出一个请求，听对方回应后确认下一步。
          - region "练习提示" [ref=e40]:
            - heading "练习提示" [level=2] [ref=e41]
            - list [ref=e42]:
              - listitem [ref=e43]: 先说明来意：想一想「向老师了解一项课堂近况并确认下一步」中最想请对方帮忙的一件事。
              - listitem [ref=e44]: 不清楚的内容可保留未知；可以请求帮助或换一个目的。
        - button "修改目的" [ref=e45] [cursor=pointer]
        - paragraph [ref=e46]: 已确认的旧版本仍保留。修改目的后请再次确认。
        - navigation "已确认的版本" [ref=e47]:
          - heading "已确认的版本" [level=2] [ref=e48]
          - button "查看版本 1" [ref=e49] [cursor=pointer]
        - navigation [ref=e50]:
          - button "选择另一件事" [ref=e51] [cursor=pointer]
          - button "返回学习起点" [ref=e52] [cursor=pointer]
          - button "更换语言" [ref=e55] [cursor=pointer]
      - complementary "显示设置" [ref=e56]:
        - paragraph [ref=e57]: 语言试验版 · 文字与语音尚未经过母语审查
        - button "听说明 尚未接入" [disabled] [ref=e58]:
          - generic [ref=e61]:
            - text: 听说明
            - generic [ref=e62]: 尚未接入
        - generic [ref=e63]:
          - button "权限说明" [ref=e64] [cursor=pointer]
          - button "显示设置" [ref=e67] [cursor=pointer]
    - contentinfo [ref=e70]:
      - generic [ref=e71]:
        - heading "尊重每一种口音" [level=2] [ref=e72]
        - paragraph [ref=e73]: 英语有多种口音和方言，都值得尊重。这里帮助你熟悉新加坡英语及本地表达；你可以保留自己的口音。听不懂时，可以放慢、再听一次，也可以请对方换个说法。
      - paragraph [ref=e74]: 听优先，按自己的节奏。
  - alert [ref=e75]
```

# Test source

```ts
  1   | import { test as base, expect } from '@playwright/test';
  2   | const test = base.extend({
  3   |   page: async ({ page, context, baseURL }, use) => {
  4   |     const failures = [];
  5   |     await context.route('**/*', async route => {
  6   |       if (new URL(route.request().url()).origin === new URL(baseURL).origin) return route.continue();
  7   |       failures.push('external request'); await route.abort();
  8   |     });
  9   |     await context.routeWebSocket('**/*', route => { failures.push('WebSocket'); route.close(); });
  10  |     page.on('pageerror', error => failures.push(error.message));
  11  |     page.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
  12  |     await context.addInitScript(() => {
  13  |       window.__practiceMedia = [];
  14  |       HTMLMediaElement.prototype.play = () => { window.__practiceMedia.push('play'); return Promise.resolve(); };
  15  |       if (window.speechSynthesis) window.speechSynthesis.speak = () => window.__practiceMedia.push('tts');
  16  |       if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { window.__practiceMedia.push('microphone'); throw new Error('B1 is offline'); };
  17  |     });
  18  |     await use(page);
  19  |     expect(failures).toEqual([]);
  20  |     expect(await page.evaluate(() => window.__practiceMedia)).toEqual([]);
  21  |   },
  22  | });
  23  | test.use({ hasTouch: true });
  24  | test.beforeEach(async ({ page }) => { await page.goto('/'); });
> 25  | async function tap(page, name) { await page.getByRole('button', { name, exact: true }).tap(); }
      |                                                                                        ^ Error: locator.tap: Test timeout of 20000ms exceeded.
  26  | async function detail(page, label) {
  27  |   const summary = page.getByText(label, { exact: true });
  28  |   const parent = page.locator('details').filter({ has: summary });
  29  |   if (!(await parent.evaluate(element => element.open))) await summary.tap();
  30  | }
  31  | async function scene(page) {
  32  |   await page.getByRole('button', { name: /^简体中文/ }).tap();
  33  |   await tap(page,'预览逐题引导'); await tap(page,'结束引导'); await tap(page,'选择要练的事');
  34  |   await tap(page,'家校沟通'); await tap(page,'确认并预览准备');
  35  |   await detail(page,'演示准备控制');
  36  |   for (const name of ['模拟对话就绪','模拟声音和画面就绪','模拟检查通过']) await tap(page,name);
  37  | }
  38  | async function preview(page) { await scene(page); await tap(page,'预览听与练'); }
  39  | async function control(page,name) { await detail(page,'演示轮次控制'); await tap(page,name); }
  40  | const state = page => page.getByRole('status', { name: '练习状态', exact: true });
  41  | async function fits(page) {
  42  |   expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
  43  |   for (const button of await page.getByRole('main').getByRole('button').all()) {
  44  |     if (!(await button.isVisible())) continue;
  45  |     const box = await button.boundingBox();
  46  |     expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
  47  |     expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
  48  |   }
  49  | }
  50  | 
  51  | test('T06 / F6.1,F7.1: full scene path shows two adult demo roles and the same partner opens when practice is chosen early', async ({ page },testInfo) => {
  52  |   await preview(page);
  53  |   await expect(page.getByRole('heading', { name: '先听懂，再试着说', exact: true })).toBeVisible();
  54  |   const roles = page.getByRole('group', { name: '两位演示角色', exact: true });
  55  |   await expect(roles.getByRole('img')).toHaveCount(2);
  56  |   const names = await roles.getByRole('img').evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')));
  57  |   expect(new Set(names).size).toBe(2);
  58  |   await expect(page.getByRole('main')).toContainText('没有真实声音或视频');
  59  |   await expect(page.getByRole('main')).toContainText('尚未经本地与教学审查');
  60  |   await expect(page.getByRole('button', { name: '我来练', exact: true })).toBeEnabled();
  61  |   await tap(page,'我来练');
  62  |   await expect(state(page)).toContainText('点一下，让对方先开始');
  63  |   await tap(page,'开始听（演示）');
  64  |   await expect(state(page)).toContainText('对方先开场');
  65  |   await expect(page.getByRole('region', { name: '当前一句', exact: true })).toContainText('Hello.');
  66  |   expect((await roles.getByRole('img').first().getAttribute('aria-label'))).toBe(names[0]);
  67  |   await expect(page.getByRole('main')).toContainText('你的位置');
  68  |   await expect(page.getByRole('main')).toContainText('口语尚未观察');
  69  |   await fits(page);
  70  |   await page.screenshot({ path: testInfo.outputPath('two-role-practice.png'), fullPage: true });
  71  | });
  72  | 
  73  | test('T06 / F6.3: loop controls, previous sentence and slow setting keep a stable lesson; pause does not imply real playback', async ({ page }) => {
  74  |   await preview(page);
  75  |   const sentence = page.getByRole('region', { name: '当前一句', exact: true });
  76  |   await tap(page,'开始听（演示）');
  77  |   const first = await sentence.innerText();
  78  |   await control(page,'模拟本句播放结束');
  79  |   expect(await sentence.innerText()).not.toBe(first);
  80  |   await tap(page,'前一句');
  81  |   expect(await sentence.innerText()).toBe(first);
  82  |   await tap(page,'单句循环');
  83  |   await control(page,'模拟本句播放结束');
  84  |   expect(await sentence.innerText()).toBe(first);
  85  |   await tap(page,'章节循环'); await tap(page,'整段循环');
  86  |   await page.getByRole('combobox', { name: '片段起点', exact: true }).selectOption('0');
  87  |   await page.getByRole('combobox', { name: '片段终点', exact: true }).selectOption('1');
  88  |   await tap(page,'A-B 片段循环');
  89  |   await control(page,'模拟本句播放结束');
  90  |   await control(page,'模拟本句播放结束');
  91  |   expect(await sentence.innerText()).toBe(first);
  92  |   await tap(page,'慢一点');
  93  |   await expect(page.getByRole('status', { name: '播放设置', exact: true })).toContainText('慢一点');
  94  |   await tap(page,'停一下');
  95  |   await expect(state(page)).toContainText('已暂停');
  96  |   await expect(page.getByRole('main')).toContainText('没有真实声音或视频');
  97  | });
  98  | 
  99  | test('T06 / F8.1: only ended playback starts the simulated wait and two help levels return gently to listening', async ({ page }) => {
  100 |   await preview(page); await tap(page,'我来练'); await tap(page,'开始听（演示）');
  101 |   await control(page,'模拟经过 6 秒');
  102 |   await expect(state(page)).toContainText('对方先开场');
  103 |   await expect(page.getByRole('main')).not.toContainText(/倒计时|剩余秒数|P95.*通过/);
  104 |   await control(page,'模拟本句播放结束');
  105 |   await expect(state(page)).toContainText('轮到你，按自己的节奏');
  106 |   await control(page,'模拟经过 6 秒');
  107 |   await expect(state(page)).toContainText('先听一个提示');
  108 |   await control(page,'模拟经过 6 秒');
  109 |   await expect(state(page)).toContainText('先听一个提示');
  110 |   await control(page,'模拟本句播放结束'); await control(page,'模拟经过 6 秒');
  111 |   await expect(state(page)).toContainText('可以选择你的意思');
  112 |   const choices = page.getByRole('group', { name: '意思选择', exact: true });
  113 |   await expect(choices.getByRole('button')).toHaveCount(2);
  114 |   await expect(page.getByRole('button', { name: '需要其他帮助', exact: true })).toBeVisible();
  115 |   await control(page,'模拟本句播放结束'); await control(page,'模拟经过 6 秒');
  116 |   await expect(state(page)).toContainText('先听示范就好');
  117 |   await expect(page.getByRole('main')).toContainText('口语尚未观察');
  118 | });
  119 | 
  120 | test('T06: thinking, manual speech and no microphone never start unwanted help or claim an assessment', async ({ page }) => {
  121 |   await preview(page); await tap(page,'我来练'); await tap(page,'开始听（演示）');
  122 |   await control(page,'模拟本句播放结束');
  123 |   await tap(page,'我想一想'); await control(page,'模拟经过 6 秒');
  124 |   await expect(state(page)).toContainText('慢慢想，不会催你');
  125 |   await tap(page,'继续'); await control(page,'模拟本句播放结束');
```
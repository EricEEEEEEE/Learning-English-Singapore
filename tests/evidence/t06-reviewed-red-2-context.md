# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/t06-preview.spec.mjs >> T06: actual version 1 to 2 and back restores each goal, fixed lesson, listening position and preferences after reload
- Location: e2e/t06-preview.spec.mjs:253:1

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
  5   |     const mediaCalls = [];
  6   |     await context.exposeBinding('__recordPracticeMedia', (_, kind) => { mediaCalls.push(kind); });
  7   |     await context.route('**/*', async route => {
  8   |       if (new URL(route.request().url()).origin === new URL(baseURL).origin) return route.continue();
  9   |       failures.push('external request'); await route.abort();
  10  |     });
  11  |     await context.routeWebSocket('**/*', route => { failures.push('WebSocket'); route.close(); });
  12  |     page.on('pageerror', error => failures.push(error.message));
  13  |     page.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
  14  |     await context.addInitScript(() => {
  15  |       HTMLMediaElement.prototype.play = () => window.__recordPracticeMedia('play');
  16  |       if (window.speechSynthesis) window.speechSynthesis.speak = () => { void window.__recordPracticeMedia('tts'); };
  17  |       if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { await window.__recordPracticeMedia('microphone'); throw new Error('B1 is offline'); };
  18  |     });
  19  |     await use(page);
  20  |     expect(failures).toEqual([]);
  21  |     expect(mediaCalls).toEqual([]);
  22  |   },
  23  | });
  24  | test.use({ hasTouch: true });
  25  | test.beforeEach(async ({ page }) => { await page.goto('/'); });
> 26  | async function tap(page, name) { await page.getByRole('button', { name, exact: true }).tap(); }
      |                                                                                        ^ Error: locator.tap: Test timeout of 20000ms exceeded.
  27  | async function detail(page, label) {
  28  |   const summary = page.getByText(label, { exact: true });
  29  |   const parent = page.locator('details').filter({ has: summary });
  30  |   if (!(await parent.evaluate(element => element.open))) await summary.tap();
  31  | }
  32  | async function scene(page) {
  33  |   await page.getByRole('button', { name: /^简体中文/ }).tap();
  34  |   await tap(page,'预览逐题引导'); await tap(page,'结束引导'); await tap(page,'选择要练的事');
  35  |   await tap(page,'家校沟通'); await tap(page,'确认并预览准备');
  36  |   await detail(page,'演示准备控制');
  37  |   for (const name of ['模拟对话就绪','模拟声音和画面就绪','模拟检查通过']) await tap(page,name);
  38  | }
  39  | async function preview(page) { await scene(page); await tap(page,'预览听与练'); }
  40  | async function control(page,name) { await detail(page,'演示轮次控制'); await tap(page,name); }
  41  | const state = page => page.getByRole('status', { name: '练习状态', exact: true });
  42  | async function fits(page) {
  43  |   expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
  44  |   for (const button of await page.getByRole('main').getByRole('button').all()) {
  45  |     if (!(await button.isVisible())) continue;
  46  |     const box = await button.boundingBox();
  47  |     expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
  48  |     expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
  49  |   }
  50  | }
  51  | 
  52  | test('T06 / F6.1,F7.1: full scene path shows two adult demo roles and the same partner opens when practice is chosen early', async ({ page },testInfo) => {
  53  |   await preview(page);
  54  |   await expect(page.getByRole('heading', { name: '先听懂，再试着说', exact: true })).toBeVisible();
  55  |   const roles = page.getByRole('group', { name: '两位演示角色', exact: true });
  56  |   await expect(roles.getByRole('img')).toHaveCount(2);
  57  |   const names = await roles.getByRole('img').evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')));
  58  |   expect(new Set(names).size).toBe(2);
  59  |   await expect(page.getByRole('main')).toContainText('没有真实声音或视频');
  60  |   await expect(page.getByRole('main')).toContainText('尚未经本地与教学审查');
  61  |   await expect(page.getByRole('button', { name: '我来练', exact: true })).toBeEnabled();
  62  |   await tap(page,'我来练');
  63  |   await expect(state(page)).toContainText('点一下，让对方先开始');
  64  |   await tap(page,'开始听（演示）');
  65  |   await expect(state(page)).toContainText('对方先开场');
  66  |   await expect(page.getByRole('region', { name: '当前一句', exact: true })).toContainText('Hello.');
  67  |   expect((await roles.getByRole('img').first().getAttribute('aria-label'))).toBe(names[0]);
  68  |   await expect(page.getByRole('main')).toContainText('你的位置');
  69  |   await expect(page.getByRole('main')).toContainText('口语尚未观察');
  70  |   await fits(page);
  71  |   await page.screenshot({ path: testInfo.outputPath('two-role-practice.png'), fullPage: true });
  72  | });
  73  | 
  74  | test('T06 / F6.3: loop controls, previous sentence and slow setting keep a stable lesson; pause does not imply real playback', async ({ page }) => {
  75  |   await preview(page);
  76  |   const sentence = page.getByRole('region', { name: '当前一句', exact: true });
  77  |   await tap(page,'开始听（演示）');
  78  |   const first = await sentence.innerText();
  79  |   await control(page,'模拟本句播放结束');
  80  |   expect(await sentence.innerText()).not.toBe(first);
  81  |   await tap(page,'前一句');
  82  |   expect(await sentence.innerText()).toBe(first);
  83  |   await tap(page,'单句循环');
  84  |   await control(page,'模拟本句播放结束');
  85  |   expect(await sentence.innerText()).toBe(first);
  86  |   const material = await page.evaluate(() => JSON.parse(localStorage.getItem('le-sg-practice-v1')).material);
  87  |   const chapter = material.sentences.filter(row => row.chapter===material.sentences[0].chapter);
  88  |   expect(chapter.length).toBeGreaterThanOrEqual(2);
  89  |   expect(chapter.length).toBeLessThan(material.sentences.length);
  90  |   await tap(page,'章节循环');
  91  |   for (let i=0;i<=chapter.length;i+=1) { await expect(sentence).toContainText(chapter[i%chapter.length].text); await control(page,'模拟本句播放结束'); }
  92  |   await tap(page,'整段循环');
  93  |   for (let i=0;i<=material.sentences.length;i+=1) { await expect(sentence).toContainText(material.sentences[i%material.sentences.length].text); await control(page,'模拟本句播放结束'); }
  94  |   await page.getByRole('combobox', { name: '片段起点', exact: true }).selectOption('2');
  95  |   await page.getByRole('combobox', { name: '片段终点', exact: true }).selectOption('1');
  96  |   await expect(page.getByRole('button', { name:'A-B 片段循环',exact:true })).toBeDisabled();
  97  |   await page.getByRole('combobox', { name: '片段起点', exact: true }).selectOption('0');
  98  |   await page.getByRole('combobox', { name: '片段终点', exact: true }).selectOption('1');
  99  |   await tap(page,'A-B 片段循环');
  100 |   await control(page,'模拟本句播放结束');
  101 |   await control(page,'模拟本句播放结束');
  102 |   expect(await sentence.innerText()).toBe(first);
  103 |   await tap(page,'慢一点');
  104 |   await expect(page.getByRole('status', { name: '播放设置', exact: true })).toContainText('慢一点');
  105 |   await tap(page,'停一下');
  106 |   await expect(state(page)).toContainText('已暂停');
  107 |   await expect(page.getByRole('main')).toContainText('没有真实声音或视频');
  108 | });
  109 | 
  110 | test('T06 / F8.1: only ended playback starts the simulated wait and two help levels return gently to listening', async ({ page }) => {
  111 |   await preview(page); await tap(page,'我来练'); await tap(page,'开始听（演示）');
  112 |   await control(page,'模拟经过 6 秒');
  113 |   await expect(state(page)).toContainText('对方先开场');
  114 |   await expect(page.getByRole('main')).not.toContainText(/倒计时|剩余秒数|P95.*通过/);
  115 |   await control(page,'模拟本句播放结束');
  116 |   await expect(state(page)).toContainText('轮到你，按自己的节奏');
  117 |   await control(page,'模拟经过 6 秒');
  118 |   await expect(state(page)).toContainText('先听一个提示');
  119 |   await control(page,'模拟经过 6 秒');
  120 |   await expect(state(page)).toContainText('先听一个提示');
  121 |   await control(page,'模拟本句播放结束'); await control(page,'模拟经过 6 秒');
  122 |   await expect(state(page)).toContainText('可以选择你的意思');
  123 |   const choices = page.getByRole('group', { name: '意思选择', exact: true });
  124 |   await expect(choices.getByRole('button')).toHaveCount(2);
  125 |   await expect(page.getByRole('button', { name: '需要其他帮助', exact: true })).toBeVisible();
  126 |   await control(page,'模拟本句播放结束'); await control(page,'模拟经过 6 秒');
```
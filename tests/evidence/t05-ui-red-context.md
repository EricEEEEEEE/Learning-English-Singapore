# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/t05-scenario.spec.mjs >> T05 / F3.1: 家校沟通 is one of three starts, with a separate unlisted-goal path
- Location: e2e/t05-scenario.spec.mjs:80:3

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: locator.tap: Test timeout of 20000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: '选择要练的事', exact: true })

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
      - region [ref=e8]:
        - generic [ref=e9]:
          - heading "一步一步，认识你的起点" [level=1] [ref=e10]
          - paragraph [ref=e11]: 可以不知道，也可以随时停下。当前只预览选择流程；音频尚未接入，选择不代表真实听力表现。
          - button "更换语言" [ref=e12] [cursor=pointer]
        - button "听操作说明 尚未接入" [disabled] [ref=e15]:
          - generic [ref=e18]:
            - text: 听操作说明
            - generic [ref=e19]: 尚未接入
        - generic [ref=e20]:
          - heading "先从短句、慢一点开始" [active] [level=2] [ref=e21]
          - paragraph [ref=e22]: 暂按入门程度开始，可随时调整
          - paragraph [ref=e23]: 听力尚不能判断：当前音频尚未接入，演示选择不会被当作真实理解证据。
          - region [ref=e24]:
            - heading "学习起点与帮助" [level=2] [ref=e25]
            - generic [ref=e26]:
              - heading "目前能听懂的内容" [level=3] [ref=e27]
              - paragraph [ref=e28]: 尚不能判断
              - paragraph [ref=e29]: 独立听力证据：0
              - paragraph [ref=e30]: 演示回答不作为能力证据
            - paragraph [ref=e31]: 说英语尚未了解
            - generic [ref=e32]:
              - heading "建议从这里开始" [level=3] [ref=e33]
              - paragraph [ref=e34]: 短句入门
            - status "当前练习设置" [ref=e35]:
              - heading "当前练习设置" [level=3] [ref=e36]
              - generic [ref=e37]:
                - generic [ref=e38]:
                  - term [ref=e39]: 内容
                  - definition [ref=e40]: 短句入门
                - generic [ref=e41]:
                  - term [ref=e42]: 速度
                  - definition [ref=e43]: 慢一点
                - generic [ref=e44]:
                  - term [ref=e45]: 帮助
                  - definition [ref=e46]: 充分帮助
            - paragraph [ref=e47]: 这是你选择的练习方式，不会改变能力记录。音频尚未接入，当前仅保存偏好。
            - generic [ref=e48]:
              - group "选择内容起点" [ref=e49]:
                - button "更简单" [ref=e50] [cursor=pointer]
                - button "更自然" [ref=e53] [cursor=pointer]
              - group "选择速度" [ref=e56]:
                - button "更慢" [pressed] [ref=e57] [cursor=pointer]
                - button "自然速度" [ref=e58] [cursor=pointer]
              - group "调整提示" [ref=e59]:
                - button "减少提示" [ref=e60] [cursor=pointer]
                - button "恢复建议" [ref=e63] [cursor=pointer]
            - button "反馈有误" [ref=e65] [cursor=pointer]
          - button "返回登录入口" [ref=e66] [cursor=pointer]
        - paragraph [ref=e69]: 保留自己的口音，按自己的节奏。
      - complementary "显示设置" [ref=e70]:
        - paragraph [ref=e71]: 语言试验版 · 文字与语音尚未经过母语审查
        - button "听说明 尚未接入" [disabled] [ref=e72]:
          - generic [ref=e75]:
            - text: 听说明
            - generic [ref=e76]: 尚未接入
        - generic [ref=e77]:
          - button "权限说明" [ref=e78] [cursor=pointer]
          - button "显示设置" [ref=e81] [cursor=pointer]
    - contentinfo [ref=e84]:
      - generic [ref=e85]:
        - heading "尊重每一种口音" [level=2] [ref=e86]
        - paragraph [ref=e87]: 英语有多种口音和方言，都值得尊重。这里帮助你熟悉新加坡英语及本地表达；你可以保留自己的口音。听不懂时，可以放慢、再听一次，也可以请对方换个说法。
      - paragraph [ref=e88]: 听优先，按自己的节奏。
  - alert [ref=e89]
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
  13  |       window.__sceneMedia = [];
  14  |       HTMLMediaElement.prototype.play = () => { window.__sceneMedia.push('media'); return Promise.resolve(); };
  15  |       if (window.speechSynthesis) window.speechSynthesis.speak = () => window.__sceneMedia.push('tts');
  16  |       if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { window.__sceneMedia.push('microphone'); throw new Error('No microphone in B1'); };
  17  |     });
  18  |     await use(page);
  19  |     expect(failures).toEqual([]);
  20  |     expect(await page.evaluate(() => window.__sceneMedia)).toEqual([]);
  21  |   },
  22  | });
  23  | test.use({ hasTouch: true });
  24  | test.beforeEach(async ({ page }) => { await page.goto('/'); });
  25  | const goalA = '陪邻居和物业确认电梯检修时间';
  26  | const goalB = '和物业确认楼梯照明损坏如何报修';
  27  | const card = page => page.getByRole('region', { name: '确认场景', exact: true });
  28  | const planned = page => page.getByRole('region', { name: '示例步骤', exact: true });
  29  | async function fits(page) {
  30  |   const width = page.viewportSize().width;
  31  |   expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  32  |   for (const button of await page.getByRole('main').getByRole('button').all()) {
  33  |     if (!(await button.isVisible())) continue;
  34  |     const box = await button.boundingBox();
  35  |     expect(box.width).toBeGreaterThanOrEqual(44);
  36  |     expect(box.height).toBeGreaterThanOrEqual(44);
  37  |     expect(box.x).toBeGreaterThanOrEqual(0);
  38  |     expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  39  |   }
  40  | }
  41  | async function profile(page) {
  42  |   await page.getByRole('button', { name: /^简体中文/ }).tap();
  43  |   await page.getByRole('button', { name: '预览逐题引导', exact: true }).tap();
  44  |   await page.getByRole('button', { name: '结束引导', exact: true }).tap();
  45  | }
  46  | async function enter(page) {
  47  |   await profile(page);
> 48  |   await page.getByRole('button', { name: '选择要练的事', exact: true }).tap();
      |                                                                   ^ Error: locator.tap: Test timeout of 20000ms exceeded.
  49  |   await expect(page.getByRole('heading', { name: '你想练什么事？', exact: true })).toBeVisible();
  50  | }
  51  | async function custom(page, text = goalA) {
  52  |   await enter(page);
  53  |   await page.getByRole('button', { name: '都不是，我想练……', exact: true }).tap();
  54  |   await page.getByRole('textbox', { name: '想练的事', exact: true }).fill(text);
  55  |   await page.getByRole('button', { name: '整理成确认卡', exact: true }).tap();
  56  |   await expect(card(page)).toBeVisible();
  57  | }
  58  | async function controls(page) {
  59  |   const summary = page.getByText('演示准备控制', { exact: true });
  60  |   if (await summary.isVisible()) {
  61  |     const details = page.locator('details').filter({ has: summary });
  62  |     if (!(await details.getAttribute('open'))) {
  63  |       // A boolean open attribute can be the empty string; use the DOM property.
  64  |       if (!(await details.evaluate(element => element.open))) await summary.tap();
  65  |     }
  66  |   }
  67  | }
  68  | async function simulate(page, label) {
  69  |   await controls(page);
  70  |   await page.getByRole('button', { name: label, exact: true }).tap();
  71  | }
  72  | async function ready(page) {
  73  |   await simulate(page, '模拟对话就绪');
  74  |   await simulate(page, '模拟声音和画面就绪');
  75  |   await simulate(page, '模拟检查通过');
  76  |   await expect(page.getByRole('heading', { name: '场景草稿已备好（演示）', exact: true })).toBeVisible();
  77  | }
  78  | 
  79  | for (const category of ['家校沟通', '工作沟通', '生活服务']) {
  80  |   test(`T05 / F3.1: ${category} is one of three starts, with a separate unlisted-goal path`, async ({ page }) => {
  81  |     await enter(page);
  82  |     const starts = page.getByRole('group', { name: '场景起点', exact: true });
  83  |     await expect(starts.getByRole('button')).toHaveCount(3);
  84  |     await expect(page.getByRole('button', { name: '都不是，我想练……', exact: true })).toBeVisible();
  85  |     await starts.getByRole('button', { name: category, exact: true }).tap();
  86  |     await expect(card(page)).toBeVisible();
  87  |     for (const field of ['和谁', '在哪里', '希望办成什么', '最担心哪一步']) await expect(card(page).getByText(field, { exact: true })).toBeVisible();
  88  |     await expect(page.getByRole('group', { name: '可选的练习方向', exact: true }).getByRole('button')).toHaveCount(3);
  89  |     await expect(page.getByRole('button', { name: '确认并预览准备', exact: true })).toBeVisible();
  90  |     await expect(page.getByRole('heading', { name: '正在准备（流程演示）', exact: true })).toHaveCount(0);
  91  |     await fits(page);
  92  |   });
  93  | }
  94  | 
  95  | test('T05 / F3.2,F3.4,F3.5: an unlisted goal stays verbatim, unknown facts stay unknown and only one missing detail is asked', async ({ page }) => {
  96  |   await enter(page);
  97  |   await page.getByRole('button', { name: '都不是，我想练……', exact: true }).tap();
  98  |   await expect(page.getByRole('button', { name: /用语音描述/ })).toBeDisabled();
  99  |   await expect(page.getByRole('main')).toContainText('无需真实姓名、学校、雇主或病历');
  100 |   await page.getByRole('button', { name: '整理成确认卡', exact: true }).tap();
  101 |   await expect(page.getByRole('heading', { name: '你希望办成什么？', exact: true })).toBeVisible();
  102 |   await expect(page.getByRole('textbox')).toHaveCount(1);
  103 |   await page.getByRole('textbox', { name: '希望办成什么', exact: true }).fill(goalA);
  104 |   await page.getByRole('button', { name: '继续确认', exact: true }).tap();
  105 |   await expect(card(page)).toContainText(goalA);
  106 |   await expect(card(page)).toContainText('用户提供');
  107 |   await expect(card(page)).toContainText('待确认');
  108 |   await expect(card(page)).toContainText('具体安排尚未核实');
  109 |   await expect(page.getByRole('main')).toContainText('离线整理演示，不是实际生成');
  110 |   await expect(page.locator('input[type="email"], input[type="tel"], input[type="password"]')).toHaveCount(0);
  111 | });
  112 | 
  113 | test('T05: confirmation can edit each fact without starting preparation or inventing missing details', async ({ page }) => {
  114 |   await custom(page);
  115 |   for (const [button, label, value] of [['修改谁','和谁','物业接待员'],['修改地点','在哪里','楼下服务处'],['修改担心','最担心哪一步','怕听不清时间']]) {
  116 |     await card(page).getByRole('button', { name: button, exact: true }).tap();
  117 |     await page.getByRole('textbox', { name: label, exact: true }).fill(value);
  118 |     await page.getByRole('button', { name: '保存修改', exact: true }).tap();
  119 |     await expect(card(page)).toContainText(value);
  120 |   }
  121 |   await expect(card(page)).toContainText(goalA);
  122 |   await expect(card(page)).toContainText('具体安排尚未核实');
  123 |   await expect(page.getByRole('heading', { name: '正在准备（流程演示）', exact: true })).toHaveCount(0);
  124 | });
  125 | 
  126 | test('T05 / F14.1,F14.2: preparation refreshes in place and a media retry keeps the same completed dialogue', async ({ page }, testInfo) => {
  127 |   await custom(page);
  128 |   await page.getByRole('button', { name: '确认并预览准备', exact: true }).tap();
  129 |   await expect(page.getByRole('heading', { name: '正在准备（流程演示）', exact: true })).toBeVisible();
  130 |   await expect(page.getByRole('main')).toContainText('版本 1');
  131 |   await expect(page.getByRole('main')).not.toContainText(/倒计时|预计剩余|生成成功|秒后完成/);
  132 |   await simulate(page, '模拟对话就绪');
  133 |   const before = await planned(page).innerText();
  134 |   await simulate(page, '模拟声音和画面失败');
  135 |   await expect(page.getByRole('main')).toContainText('声音和画面未就绪（模拟）');
  136 |   await page.reload();
  137 |   await expect(page.getByRole('main')).toContainText(goalA);
  138 |   await expect(page.getByRole('main')).toContainText('版本 1');
  139 |   expect(await planned(page).innerText()).toBe(before);
  140 |   await page.getByRole('button', { name: '只重试失败部分', exact: true }).tap();
  141 |   expect(await planned(page).innerText()).toBe(before);
  142 |   await simulate(page, '模拟声音和画面就绪');
  143 |   await simulate(page, '模拟检查通过');
  144 |   await expect(page.getByRole('heading', { name: '场景草稿已备好（演示）', exact: true })).toBeVisible();
  145 |   expect(await planned(page).innerText()).toBe(before);
  146 |   await expect(page.getByRole('main')).toContainText('真实语音和视频尚未接入');
  147 |   await page.screenshot({ path: testInfo.outputPath('scene-partial-recovery.png'), fullPage: true });
  148 | });
```
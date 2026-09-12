# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/t04-profile.spec.mjs >> T04 / F2.3,F2.4: zh-Hans separates unknown listening, unobserved speaking and adjustable support
- Location: e2e/t04-profile.spec.mjs:74:3

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: getByRole('region', { name: '学习起点与帮助', exact: true }).getByRole('status', { name: '当前练习设置', exact: true })
Timeout: 5000ms
- Expected  - 7
+ Received  + 1

- 当前练习设置
- 内容
- 短句入门
- 速度
- 慢一点
- 帮助
- 充分帮助
+ 当前练习设置内容短句入门速度慢一点帮助充分帮助

Call log:
  - Expect "toHaveText" getByRole('region', { name: '学习起点与帮助', exact: true }).getByRole('status', { name: '当前练习设置', exact: true }) with timeout 5000ms
  - waiting for getByRole('region', { name: '学习起点与帮助', exact: true }).getByRole('status', { name: '当前练习设置', exact: true })
    14 × locator resolved to <div role="status" aria-live="polite" aria-label="当前练习设置" class="profile-settings">…</div>
       - unexpected value "当前练习设置内容短句入门速度慢一点帮助充分帮助"

```

```yaml
- status "当前练习设置":
  - heading "当前练习设置" [level=3]
  - term: 内容
  - definition: 短句入门
  - term: 速度
  - definition: 慢一点
  - term: 帮助
  - definition: 充分帮助
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
  9   |       external.push('external HTTP'); await route.abort();
  10  |     });
  11  |     await context.routeWebSocket('**/*', route => { external.push('WebSocket'); route.close(); });
  12  |     page.on('pageerror', error => errors.push(error.message));
  13  |     page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  14  |     await context.addInitScript(() => {
  15  |       window.__profileMediaCalls = [];
  16  |       HTMLMediaElement.prototype.play = () => { window.__profileMediaCalls.push('media'); return Promise.resolve(); };
  17  |       if (window.speechSynthesis) window.speechSynthesis.speak = () => window.__profileMediaCalls.push('tts');
  18  |       if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => {
  19  |         window.__profileMediaCalls.push('microphone'); throw new Error('No microphone in B1');
  20  |       };
  21  |     });
  22  |     await use(page);
  23  |     expect(errors).toEqual([]);
  24  |     expect(external).toEqual([]);
  25  |     expect(await page.evaluate(() => window.__profileMediaCalls)).toEqual([]);
  26  |   },
  27  | });
  28  | test.use({ hasTouch: true });
  29  | test.beforeEach(async ({ page }) => { await page.goto('/'); });
  30  | 
  31  | const languages = [
  32  |   { code: 'zh-Hans', language: '简体中文', entry: '预览逐题引导', finish: '结束引导', change: '更换语言',
  33  |     region: '学习起点与帮助', listening: '目前能听懂的内容', unknown: '尚不能判断', speaking: '说英语尚未了解',
  34  |     settings: '当前练习设置', simpler: '更简单', natural: '更自然', slower: '更慢', speed: '自然速度', fewer: '减少提示', restore: '恢复建议',
  35  |     feedback: '反馈有误', flagged: '反馈已标记', short: '短句入门', next: '一句话一件事', slow: '慢一点', minimal: '较少提示' },
  36  |   { code: 'id', language: 'Bahasa Indonesia', entry: 'Pratinjau panduan bertahap', finish: 'Akhiri panduan', change: 'Ganti bahasa',
  37  |     region: 'Titik awal dan bantuan', listening: 'Yang sudah dipahami saat mendengar', unknown: 'Belum dapat dinilai', speaking: 'Kemampuan berbicara belum diketahui',
  38  |     settings: 'Pengaturan latihan saat ini', simpler: 'Lebih sederhana', natural: 'Lebih alami', slower: 'Lebih lambat', speed: 'Kecepatan alami', fewer: 'Kurangi petunjuk', restore: 'Pulihkan saran',
  39  |     feedback: 'Tandai masukan keliru', flagged: 'Masukan telah ditandai', short: 'Mulai dengan frasa pendek', next: 'Satu maksud per kalimat', slow: 'Pelan-pelan', minimal: 'Lebih sedikit petunjuk' },
  40  |   { code: 'ja', language: '日本語', entry: '質問の流れをプレビュー', finish: '質問を終える', change: '言語を変更',
  41  |     region: '学習の出発点とサポート', listening: '今聞いてわかる内容', unknown: 'まだ判断できません', speaking: '話す力はまだわかりません',
  42  |     settings: '現在の練習設定', simpler: 'もっとやさしく', natural: 'もっと自然に', slower: 'もっとゆっくり', speed: '自然な速さ', fewer: 'ヒントを減らす', restore: 'おすすめに戻す',
  43  |     feedback: '評価の誤りを知らせる', flagged: '誤りを記録しました', short: '短い表現から始める', next: '一文で一つのこと', slow: 'ゆっくり', minimal: '少なめのヒント' },
  44  |   { code: 'en', language: 'English', entry: 'Preview the step-by-step guide', finish: 'Finish the guide', change: 'Change language',
  45  |     region: 'Starting point and support', listening: 'What you understand when listening', unknown: 'Not enough evidence yet', speaking: 'Speaking has not been observed',
  46  |     settings: 'Current practice settings', simpler: 'Simpler', natural: 'More natural', slower: 'Slower', speed: 'Natural speed', fewer: 'Fewer hints', restore: 'Restore recommendation',
  47  |     feedback: 'Flag incorrect feedback', flagged: 'Feedback flagged', short: 'Start with short phrases', next: 'One idea per sentence', slow: 'Slow', minimal: 'Fewer hints' },
  48  | ];
  49  | const cn = languages[0];
  50  | const panel = (page, language = cn) => page.getByRole('region', { name: language.region, exact: true });
  51  | const settings = (page, language = cn) => panel(page, language).getByRole('status', { name: language.settings, exact: true });
  52  | async function enter(page, language = cn) {
  53  |   await page.getByRole('button', { name: new RegExp(`^${language.language}`) }).tap();
  54  |   await page.getByRole('button', { name: language.entry, exact: true }).tap();
  55  | }
  56  | async function finish(page, language = cn) {
  57  |   await enter(page, language);
  58  |   await page.getByRole('button', { name: language.finish, exact: true }).tap();
  59  |   await expect(panel(page, language)).toBeVisible();
  60  | }
  61  | async function fit(page) {
  62  |   const width = page.viewportSize().width;
  63  |   expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  64  |   for (const button of await panel(page).getByRole('button').all()) {
  65  |     const box = await button.boundingBox();
  66  |     expect(box.width).toBeGreaterThanOrEqual(44);
  67  |     expect(box.height).toBeGreaterThanOrEqual(44);
  68  |     expect(box.x).toBeGreaterThanOrEqual(0);
  69  |     expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  70  |   }
  71  | }
  72  | 
  73  | for (const language of languages) {
  74  |   test(`T04 / F2.3,F2.4: ${language.code} separates unknown listening, unobserved speaking and adjustable support`, async ({ page }, testInfo) => {
  75  |     await finish(page, language);
  76  |     const result = panel(page, language);
  77  |     await expect(result.getByRole('heading', { name: language.listening, exact: true })).toBeVisible();
  78  |     await expect(result).toContainText(language.unknown);
  79  |     await expect(result).toContainText(language.speaking);
  80  |     await expect(settings(page, language)).toContainText(language.short);
  81  |     const initial = await settings(page, language).innerText();
  82  |     await result.getByRole('button', { name: language.natural, exact: true }).tap();
  83  |     await expect(settings(page, language)).toContainText(language.next);
  84  |     await result.getByRole('button', { name: language.simpler, exact: true }).tap();
  85  |     await expect(settings(page, language)).toContainText(language.short);
  86  |     await result.getByRole('button', { name: language.natural, exact: true }).tap();
  87  |     await expect(settings(page, language)).toContainText(language.next);
  88  |     await result.getByRole('button', { name: language.speed, exact: true }).tap();
  89  |     await expect(settings(page, language)).toContainText(language.speed);
  90  |     await result.getByRole('button', { name: language.slower, exact: true }).tap();
  91  |     await expect(settings(page, language)).toContainText(language.slow);
  92  |     await result.getByRole('button', { name: language.fewer, exact: true }).tap();
  93  |     await expect(settings(page, language)).toContainText(language.minimal);
  94  |     await page.reload();
  95  |     await expect(settings(page, language)).toContainText(language.next);
  96  |     await expect(settings(page, language)).toContainText(language.minimal);
  97  |     await result.getByRole('button', { name: language.feedback, exact: true }).tap();
  98  |     await expect(result).toContainText(language.flagged);
  99  |     await expect(settings(page, language)).toContainText(language.next);
  100 |     await result.getByRole('button', { name: language.restore, exact: true }).tap();
> 101 |     await expect(settings(page, language)).toHaveText(initial);
      |                                            ^ Error: expect(locator).toHaveText(expected) failed
  102 |     await page.reload();
  103 |     await expect(result).toContainText(language.flagged);
  104 |     await expect(result).toContainText(language.unknown);
  105 |     await expect(result).toContainText(language.speaking);
  106 |     await expect(result).not.toContainText(/CEFR|口语零分|考试通过|已掌握|%/);
  107 |     if (language.code !== 'zh-Hans') await expect(result).not.toContainText(/尚不能判断|更简单|更慢|当前练习设置/);
  108 |     await page.screenshot({ path: testInfo.outputPath(`profile-${language.code}.png`), fullPage: true });
  109 |   });
  110 | }
  111 | 
  112 | test('T04: all simulated listening choices stay unknown and disclose zero independent observations', async ({ page }) => {
  113 |   await enter(page);
  114 |   for (let index = 0; index < 12; index += 1) {
  115 |     const question = page.getByRole('article', { name: '当前问题', exact: true });
  116 |     const simulated = question.getByText('演示播放控制', { exact: true });
  117 |     if (await simulated.isVisible()) {
  118 |       await simulated.tap();
  119 |       await question.getByRole('button', { name: '模拟题目播放结束', exact: true }).tap();
  120 |     }
  121 |     await question.getByRole('group', { name: '回答选项', exact: true }).getByRole('button').first().tap();
  122 |   }
  123 |   await expect(panel(page)).toContainText('尚不能判断');
  124 |   await expect(panel(page)).toContainText('独立听力证据：0');
  125 |   await expect(panel(page)).toContainText('演示回答不作为能力证据');
  126 |   await expect(panel(page)).toContainText('说英语尚未了解');
  127 |   await page.reload();
  128 |   await expect(panel(page)).toContainText('独立听力证据：0');
  129 | });
  130 | 
  131 | test('T04 / F2.5,F10.5: choice overrides survive language changes, reload and optional answers; restore is explicit', async ({ page }) => {
  132 |   await enter(page);
  133 |   for (let index = 0; index < 12; index += 1) await page.getByRole('button', { name: '不知道', exact: true }).tap();
  134 |   await panel(page).getByRole('button', { name: cn.natural, exact: true }).tap();
  135 |   await panel(page).getByRole('button', { name: cn.fewer, exact: true }).tap();
  136 |   await page.getByRole('button', { name: '继续了解（可选）', exact: true }).tap();
  137 |   for (let index = 0; index < 4; index += 1) await page.getByRole('button', { name: '不知道', exact: true }).tap();
  138 |   await expect(settings(page)).toContainText(cn.next);
  139 |   await expect(settings(page)).toContainText(cn.minimal);
  140 |   await page.getByRole('button', { name: cn.change, exact: true }).tap();
  141 |   const en = languages[3];
  142 |   await page.getByRole('button', { name: /^English/ }).tap();
  143 |   await expect(settings(page, en)).toContainText(en.next);
  144 |   await expect(settings(page, en)).toContainText(en.minimal);
  145 |   await page.reload();
  146 |   await expect(settings(page, en)).toContainText(en.next);
  147 |   await panel(page, en).getByRole('button', { name: en.restore, exact: true }).tap();
  148 |   await expect(settings(page, en)).toContainText(en.short);
  149 |   await expect(panel(page, en)).toContainText(en.unknown);
  150 | });
  151 | 
  152 | test('T04: large-text controls fit and keyboard actions change settings while ability stays unknown', async ({ page }, testInfo) => {
  153 |   await finish(page);
  154 |   await page.getByRole('button', { name: '显示设置', exact: true }).tap();
  155 |   await page.getByRole('checkbox', { name: '大字', exact: true }).check();
  156 |   await fit(page);
  157 |   const more = panel(page).getByRole('button', { name: cn.natural, exact: true });
  158 |   await more.focus();
  159 |   await page.keyboard.press('Space');
  160 |   await expect(settings(page)).toContainText(cn.next);
  161 |   const restore = panel(page).getByRole('button', { name: cn.restore, exact: true });
  162 |   await restore.focus();
  163 |   await page.keyboard.press('Enter');
  164 |   await expect(settings(page)).toContainText(cn.short);
  165 |   await expect(panel(page)).toContainText(cn.unknown);
  166 |   await page.screenshot({ path: testInfo.outputPath('profile-large-keyboard.png'), fullPage: true });
  167 | });
  168 | 
  169 | test('T04: failed preference saves are visible, recover without reload and keep current choices usable', async ({ page }) => {
  170 |   await finish(page);
  171 |   await page.evaluate(() => {
  172 |     window.__savedStudySetItem = Storage.prototype.setItem;
  173 |     Storage.prototype.setItem = function (key, value) {
  174 |       if (key === 'le-sg-study-preferences-v1') throw new DOMException('Unavailable', 'SecurityError');
  175 |       return window.__savedStudySetItem.call(this, key, value);
  176 |     };
  177 |   });
  178 |   await panel(page).getByRole('button', { name: cn.natural, exact: true }).tap();
  179 |   await expect(settings(page)).toContainText(cn.next);
  180 |   await expect(panel(page)).toContainText('无法保存练习设置，本次仍可继续');
  181 |   await page.evaluate(() => { Storage.prototype.setItem = window.__savedStudySetItem; });
  182 |   await panel(page).getByRole('button', { name: cn.fewer, exact: true }).tap();
  183 |   await expect(panel(page)).not.toContainText('无法保存练习设置，本次仍可继续');
  184 |   await page.reload();
  185 |   await expect(settings(page)).toContainText(cn.next);
  186 |   await expect(settings(page)).toContainText(cn.minimal);
  187 | });
  188 | 
  189 | for (const variant of ['invalid-json', 'null', 'unsupported-record']) {
  190 |   test(`T04 regression: damaged onboarding ${variant} survives a temporary preview without overwritten bytes`, async ({ page }) => {
  191 |     await enter(page);
  192 |     await page.getByRole('button', { name: '几乎不会英语', exact: true }).tap();
  193 |     const raw = await page.evaluate(variant => {
  194 |       const key = 'le-sg-onboarding-v1';
  195 |       const saved = JSON.parse(localStorage.getItem(key));
  196 |       let bad;
  197 |       if (variant === 'invalid-json') bad = '{broken';
  198 |       else if (variant === 'null') bad = 'null';
  199 |       else { saved.records['unsupported-question'] = { response: 'choice' }; bad = JSON.stringify(saved); }
  200 |       localStorage.setItem(key, bad);
  201 |       return bad;
```
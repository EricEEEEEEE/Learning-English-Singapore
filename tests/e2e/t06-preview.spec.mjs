import { test as base, expect } from '@playwright/test';
const test = base.extend({
  page: async ({ page, context, baseURL }, use) => {
    const failures = [];
    const mediaCalls = [];
    await context.exposeBinding('__recordPracticeMedia', (_, kind) => { mediaCalls.push(kind); });
    await context.route('**/*', async route => {
      if (new URL(route.request().url()).origin === new URL(baseURL).origin) return route.continue();
      failures.push('external request'); await route.abort();
    });
    await context.routeWebSocket('**/*', route => { failures.push('WebSocket'); route.close(); });
    page.on('pageerror', error => failures.push(error.message));
    page.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
    await context.addInitScript(() => {
      HTMLMediaElement.prototype.play = () => window.__recordPracticeMedia('play');
      if (window.speechSynthesis) window.speechSynthesis.speak = () => { void window.__recordPracticeMedia('tts'); };
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { await window.__recordPracticeMedia('microphone'); throw new Error('B1 is offline'); };
    });
    await use(page);
    expect(failures).toEqual([]);
    expect(mediaCalls).toEqual([]);
  },
});
test.use({ hasTouch: true });
test.beforeEach(async ({ page }) => { await page.goto('/'); });
async function tap(page, name) { await page.getByRole('button', { name, exact: true }).tap(); }
async function detail(page, label) {
  const summary = page.getByText(label, { exact: true });
  const parent = page.locator('details').filter({ has: summary });
  if (!(await parent.evaluate(element => element.open))) await summary.tap();
}
async function scene(page) {
  await page.getByRole('button', { name: /^简体中文/ }).tap();
  await tap(page,'预览逐题引导'); await tap(page,'结束引导'); await tap(page,'选择要练的事');
  await tap(page,'家校沟通'); await tap(page,'确认并预览准备');
  await detail(page,'演示准备控制');
  for (const name of ['模拟对话就绪','模拟声音和画面就绪','模拟检查通过']) await tap(page,name);
}
async function preview(page) { await scene(page); await tap(page,'预览听与练'); }
async function control(page,name) { await detail(page,'演示轮次控制'); await tap(page,name); }
const state = page => page.getByRole('status', { name: '练习状态', exact: true });
async function fits(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
  for (const button of await page.getByRole('main').getByRole('button').all()) {
    if (!(await button.isVisible())) continue;
    const box = await button.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
  }
}

test('T06 / F6.1,F7.1: full scene path shows two adult demo roles and the same partner opens when practice is chosen early', async ({ page },testInfo) => {
  await preview(page);
  await expect(page.getByRole('heading', { name: '先听懂，再试着说', exact: true })).toBeVisible();
  const roles = page.getByRole('group', { name: '两位演示角色', exact: true });
  await expect(roles.getByRole('img')).toHaveCount(2);
  const names = await roles.getByRole('img').evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')));
  expect(new Set(names).size).toBe(2);
  await expect(page.getByRole('main')).toContainText('没有真实声音或视频');
  await expect(page.getByRole('main')).toContainText('尚未经本地与教学审查');
  await expect(page.getByRole('button', { name: '我来练', exact: true })).toBeEnabled();
  await tap(page,'我来练');
  await expect(state(page)).toContainText('点一下，让对方先开始');
  await tap(page,'开始听（演示）');
  await expect(state(page)).toContainText('对方先开场');
  await expect(page.getByRole('region', { name: '当前一句', exact: true })).toContainText('Hello.');
  expect((await roles.getByRole('img').first().getAttribute('aria-label'))).toBe(names[0]);
  await expect(page.getByRole('main')).toContainText('你的位置');
  await expect(page.getByRole('main')).toContainText('口语尚未观察');
  await fits(page);
  await page.screenshot({ path: testInfo.outputPath('two-role-practice.png'), fullPage: true });
});

test('T06 / F6.3: loop controls, previous sentence and slow setting keep a stable lesson; pause does not imply real playback', async ({ page }) => {
  await preview(page);
  const sentence = page.getByRole('region', { name: '当前一句', exact: true });
  await tap(page,'开始听（演示）');
  const first = await sentence.innerText();
  await control(page,'模拟本句播放结束');
  expect(await sentence.innerText()).not.toBe(first);
  await tap(page,'前一句');
  expect(await sentence.innerText()).toBe(first);
  await tap(page,'单句循环');
  await control(page,'模拟本句播放结束');
  expect(await sentence.innerText()).toBe(first);
  const material = await page.evaluate(() => JSON.parse(localStorage.getItem('le-sg-practice-v1')).material);
  const chapter = material.sentences.filter(row => row.chapter===material.sentences[0].chapter);
  expect(chapter.length).toBeGreaterThanOrEqual(2);
  expect(chapter.length).toBeLessThan(material.sentences.length);
  await tap(page,'章节循环');
  for (let i=0;i<=chapter.length;i+=1) { await expect(sentence).toContainText(chapter[i%chapter.length].text); await control(page,'模拟本句播放结束'); }
  await tap(page,'整段循环');
  for (let i=0;i<=material.sentences.length;i+=1) { await expect(sentence).toContainText(material.sentences[i%material.sentences.length].text); await control(page,'模拟本句播放结束'); }
  await page.getByRole('combobox', { name: '片段起点', exact: true }).selectOption('2');
  await page.getByRole('combobox', { name: '片段终点', exact: true }).selectOption('1');
  await expect(page.getByRole('button', { name:'A-B 片段循环',exact:true })).toBeDisabled();
  await page.getByRole('combobox', { name: '片段起点', exact: true }).selectOption('0');
  await page.getByRole('combobox', { name: '片段终点', exact: true }).selectOption('1');
  await tap(page,'A-B 片段循环');
  await control(page,'模拟本句播放结束');
  await control(page,'模拟本句播放结束');
  expect(await sentence.innerText()).toBe(first);
  await tap(page,'慢一点');
  await expect(page.getByRole('status', { name: '播放设置', exact: true })).toContainText('慢一点');
  await tap(page,'停一下');
  await expect(state(page)).toContainText('已暂停');
  await expect(page.getByRole('main')).toContainText('没有真实声音或视频');
});

test('T06 / F8.1: only ended playback starts the simulated wait and two help levels return gently to listening', async ({ page }) => {
  await preview(page); await tap(page,'我来练'); await tap(page,'开始听（演示）');
  await control(page,'模拟经过 6 秒');
  await expect(state(page)).toContainText('对方先开场');
  await expect(page.getByRole('main')).not.toContainText(/倒计时|剩余秒数|P95.*通过/);
  await control(page,'模拟本句播放结束');
  await expect(state(page)).toContainText('轮到你，按自己的节奏');
  await control(page,'模拟经过 6 秒');
  await expect(state(page)).toContainText('先听一个提示');
  await control(page,'模拟经过 6 秒');
  await expect(state(page)).toContainText('先听一个提示');
  await control(page,'模拟本句播放结束'); await control(page,'模拟经过 6 秒');
  await expect(state(page)).toContainText('可以选择你的意思');
  const choices = page.getByRole('group', { name: '意思选择', exact: true });
  await expect(choices.getByRole('button')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '需要其他帮助', exact: true })).toBeVisible();
  await control(page,'模拟本句播放结束'); await control(page,'模拟经过 6 秒');
  await expect(state(page)).toContainText('先听示范就好');
  await expect(page.getByRole('main')).toContainText('口语尚未观察');
});

test('T06: thinking, manual speech and no microphone never start unwanted help or claim an assessment', async ({ page }) => {
  await preview(page); await tap(page,'我来练'); await tap(page,'开始听（演示）');
  await control(page,'模拟本句播放结束');
  await tap(page,'我想一想'); await control(page,'模拟经过 6 秒');
  await expect(state(page)).toContainText('慢慢想，不会催你');
  await tap(page,'继续'); await control(page,'模拟本句播放结束');
  await expect(page.getByRole('button', { name: '手动说话（尚未接入）', exact: true })).toBeDisabled();
  await control(page,'模拟开始说话'); await control(page,'模拟经过 6 秒');
  await expect(state(page)).toContainText('正在说话（模拟）');
  await tap(page,'我说完了');
  await expect(state(page)).toContainText('对方准备回应（模拟）');
  await control(page,'模拟麦克风不可用');
  await expect(state(page)).toContainText('麦克风不可用');
  await tap(page,'只听示范');
  await expect(page.getByRole('main')).toContainText('口语尚未观察');
  await expect(page.getByRole('main')).not.toContainText(/口语失败|发音错误|得分/);
});

test('T06: patience and proactive-help preferences survive reload while the old waiting clock does not', async ({ page }) => {
  await preview(page);
  await page.getByRole('combobox', { name: '多等一会', exact: true }).selectOption('15000');
  await page.getByRole('checkbox', { name: '主动提示', exact: true }).uncheck();
  await tap(page,'我来练'); await tap(page,'开始听（演示）'); await control(page,'模拟本句播放结束');
  await page.reload();
  await expect(state(page)).toContainText('已暂停');
  await expect(page.getByRole('combobox', { name: '多等一会', exact: true })).toHaveValue('15000');
  await expect(page.getByRole('checkbox', { name: '主动提示', exact: true })).not.toBeChecked();
  await tap(page,'继续'); await control(page,'模拟本句播放结束');
  for (let i = 0; i < 4; i += 1) await control(page,'模拟经过 6 秒');
  await expect(state(page)).toContainText('轮到你，按自己的节奏');
  await tap(page,'给个提示');
  await expect(state(page)).toContainText('先听一个提示');
});

test('T06: disconnect, retry and exit keep the same scenario and never leave a fabricated playing state', async ({ page }) => {
  await preview(page); await tap(page,'我来练'); await tap(page,'开始听（演示）');
  await control(page,'模拟断开连接');
  await expect(state(page)).toContainText('连接已暂停（模拟）');
  await control(page,'模拟经过 6 秒');
  await expect(state(page)).toContainText('连接已暂停（模拟）');
  await tap(page,'重试连接（演示）');
  await expect(state(page)).toContainText('对方带你接着练');
  await tap(page,'结束本次预览');
  await expect(page.getByRole('heading', { name: '场景草稿已备好（演示）', exact: true })).toBeVisible();
  await tap(page,'预览听与练');
  await expect(page.getByRole('main')).toContainText('版本 1');
  await expect(page.getByRole('main')).toContainText('没有真实声音或视频');
});

const locales = [
  { code:'id', entry:'Pratinjau mendengar dan berlatih', title:'Pahami dahulu, lalu coba berbicara', practice:'Saya mau berlatih', start:'Mulai mendengar (demo)', pause:'Berhenti sebentar', paused:'Dijeda' },
  { code:'ja', entry:'聞く・話す流れをプレビュー', title:'まず聞いてから、話してみる', practice:'自分で練習する', start:'聞き始める（デモ）', pause:'いったん止める', paused:'一時停止中' },
  { code:'en', entry:'Preview listening and practice', title:'Listen first, then try speaking', practice:'Let me practise', start:'Start listening (demo)', pause:'Pause for a moment', paused:'Paused' },
];
for (const locale of locales) test(`T06: ${locale.code} keeps roles, purpose and localized help through practice and reload`, async ({ page }) => {
  await scene(page);
  await tap(page,'更换语言');
  await page.getByRole('button', { name: new RegExp(`^${locale.code==='id'?'Bahasa Indonesia':locale.code==='ja'?'日本語':'English'}`) }).tap();
  await tap(page,locale.entry);
  await expect(page.getByRole('heading', { name: locale.title, exact:true })).toBeVisible();
  await tap(page,locale.practice); await tap(page,locale.start); await tap(page,locale.pause);
  await page.reload();
  await expect(page.getByRole('main')).toContainText(locale.paused);
  await expect(page.locator('html')).toHaveAttribute('lang',locale.code);
  await expect(page.getByRole('main')).not.toContainText(/正在说话|模拟经过|口语尚未观察|多等一会/);
  await fits(page);
});

test('T06: failed practice saves and corrupted snapshots are visible without overwriting original records', async ({ page }) => {
  await preview(page);
  await page.evaluate(() => {
    window.__oldPracticeSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key,value) { if(key==='le-sg-practice-v1') throw new DOMException('Unavailable','SecurityError'); return window.__oldPracticeSet.call(this,key,value); };
  });
  await tap(page,'我来练');
  await expect(page.getByRole('main')).toContainText('练习预览暂时无法保存，本次仍可继续');
  await page.evaluate(() => { Storage.prototype.setItem=window.__oldPracticeSet; localStorage.setItem('le-sg-practice-v1','{broken-practice'); });
  await page.reload();
  await tap(page,'预览听与练');
  await expect(page.getByRole('main')).toContainText('旧练习记录保持不变');
  await tap(page,'我来练'); await tap(page,'开始听（演示）');
  expect(await page.evaluate(() => localStorage.getItem('le-sg-practice-v1'))).toBe('{broken-practice');
});

async function customDraft(page) {
  await page.getByRole('button', { name: /^简体中文/ }).tap();
  await tap(page,'预览逐题引导'); await tap(page,'结束引导'); await tap(page,'选择要练的事');
  await tap(page,'都不是，我想练……');
}
test('T06 regression: unsubmitted description survives language switch and reload without confirming', async ({ page }) => {
  await customDraft(page);
  await page.getByRole('textbox', { name:'想练的事',exact:true }).fill('希望确认邻居的维修时间');
  await tap(page,'更换语言'); await page.getByRole('button', { name:/^English/ }).tap();
  await expect(page.getByRole('textbox', { name:'What you want to practise',exact:true })).toHaveValue('希望确认邻居的维修时间');
  await page.reload();
  await expect(page.getByRole('textbox')).toHaveValue('希望确认邻居的维修时间');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('le-sg-scenario-v1')).versions.length)).toBe(0);
});
test('T06 regression: unfinished goal edit survives language switch and reload while the confirmed version stays intact', async ({ page }) => {
  await scene(page);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('le-sg-scenario-v1')).versions);
  await tap(page,'修改目的');
  await page.getByRole('textbox', { name:'希望办成什么',exact:true }).fill('改为询问新的检查时间');
  await tap(page,'更换语言'); await page.getByRole('button', { name:/^English/ }).tap();
  await expect(page.getByRole('textbox', { name:'What you want to accomplish',exact:true })).toHaveValue('改为询问新的检查时间');
  await page.reload();
  await expect(page.getByRole('textbox')).toHaveValue('改为询问新的检查时间');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('le-sg-scenario-v1')).versions)).toEqual(before);
});
test('T06 regression: translated instructions preserve the custom goal and every stored version', async ({ page }) => {
  await customDraft(page);
  await page.getByRole('textbox').fill('确认维修地点'); await tap(page,'整理成确认卡'); await tap(page,'确认并预览准备');
  await detail(page,'演示准备控制');
  for (const name of ['模拟对话就绪','模拟声音和画面就绪','模拟检查通过']) await tap(page,name);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('le-sg-scenario-v1')).versions);
  await tap(page,'更换语言'); await page.getByRole('button', { name:/^English/ }).tap();
  const steps = page.getByRole('region', { name:'Example steps',exact:true });
  await expect(steps).toContainText('start by explaining');
  await expect(steps).toContainText('确认维修地点');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('le-sg-scenario-v1')).versions)).toEqual(before);
});

test('T06: actual version 1 to 2 and back restores each goal, fixed lesson, listening position and preferences after reload', async ({ page }) => {
  await preview(page);
  await page.getByRole('combobox', { name:'多等一会',exact:true }).selectOption('15000');
  await page.getByRole('checkbox', { name:'主动提示',exact:true }).uncheck();
  await tap(page,'开始听（演示）'); await control(page,'模拟本句播放结束');
  await tap(page,'停一下');
  const sentence = () => page.getByRole('region', { name:'当前一句',exact:true });
  const firstSentence = await sentence().innerText();
  const first = await page.evaluate(() => JSON.parse(localStorage.getItem('le-sg-practice-v1')));
  await tap(page,'结束本次预览'); await tap(page,'修改目的');
  const nextGoal = '询问老师下一次可以联系的时间';
  await page.getByRole('textbox', { name:'希望办成什么',exact:true }).fill(nextGoal);
  await tap(page,'保存修改'); await tap(page,'确认并预览准备');
  await detail(page,'演示准备控制');
  for(const name of ['模拟对话就绪','模拟声音和画面就绪','模拟检查通过']) await tap(page,name);
  await tap(page,'预览听与练');
  const second = await page.evaluate(() => JSON.parse(localStorage.getItem('le-sg-practice-v1')));
  expect(second.goal_revision).toBe(2);
  expect(second.material.id).not.toBe(first.material.id);
  expect(second.material.sentences).not.toEqual(first.material.sentences);
  expect(second.material.sentences.some(row => row.text.includes(nextGoal))).toBe(true);
  await expect(page.getByRole('main')).toContainText(nextGoal);
  await tap(page,'结束本次预览'); await tap(page,'查看版本 1'); await tap(page,'预览听与练');
  await page.reload();
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('le-sg-practice-v1')));
  expect(restored.material).toEqual(first.material);
  expect(restored.roles).toEqual(first.roles);
  expect(restored.position).toBe(first.position);
  expect(restored.user_goal).toBe(first.user_goal);
  await expect(sentence()).toHaveText(firstSentence);
  await expect(page.getByRole('combobox', { name:'多等一会',exact:true })).toHaveValue('15000');
  await expect(page.getByRole('checkbox', { name:'主动提示',exact:true })).not.toBeChecked();
});

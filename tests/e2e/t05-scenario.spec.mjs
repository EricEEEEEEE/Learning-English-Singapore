import { test as base, expect } from '@playwright/test';
const test = base.extend({
  page: async ({ page, context, baseURL }, use) => {
    const failures = [];
    await context.route('**/*', async route => {
      if (new URL(route.request().url()).origin === new URL(baseURL).origin) return route.continue();
      failures.push('external request'); await route.abort();
    });
    await context.routeWebSocket('**/*', route => { failures.push('WebSocket'); route.close(); });
    page.on('pageerror', error => failures.push(error.message));
    page.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
    await context.addInitScript(() => {
      window.__sceneMedia = [];
      HTMLMediaElement.prototype.play = () => { window.__sceneMedia.push('media'); return Promise.resolve(); };
      if (window.speechSynthesis) window.speechSynthesis.speak = () => window.__sceneMedia.push('tts');
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { window.__sceneMedia.push('microphone'); throw new Error('No microphone in B1'); };
    });
    await use(page);
    expect(failures).toEqual([]);
    expect(await page.evaluate(() => window.__sceneMedia)).toEqual([]);
  },
});
test.use({ hasTouch: true });
test.beforeEach(async ({ page }) => { await page.goto('/'); });
const goalA = '陪邻居和物业确认电梯检修时间';
const goalB = '和物业确认楼梯照明损坏如何报修';
const card = page => page.getByRole('region', { name: '确认场景', exact: true });
const planned = page => page.getByRole('region', { name: '示例步骤', exact: true });
async function fits(page) {
  const width = page.viewportSize().width;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  for (const button of await page.getByRole('main').getByRole('button').all()) {
    if (!(await button.isVisible())) continue;
    const box = await button.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  }
}
async function profile(page) {
  await page.getByRole('button', { name: /^简体中文/ }).tap();
  await page.getByRole('button', { name: '预览逐题引导', exact: true }).tap();
  await page.getByRole('button', { name: '结束引导', exact: true }).tap();
}
async function enter(page) {
  await profile(page);
  await page.getByRole('button', { name: '选择要练的事', exact: true }).tap();
  await expect(page.getByRole('heading', { name: '你想练什么事？', exact: true })).toBeVisible();
}
async function custom(page, text = goalA) {
  await enter(page);
  await page.getByRole('button', { name: '都不是，我想练……', exact: true }).tap();
  await page.getByRole('textbox', { name: '想练的事', exact: true }).fill(text);
  await page.getByRole('button', { name: '整理成确认卡', exact: true }).tap();
  await expect(card(page)).toBeVisible();
}
async function controls(page) {
  const summary = page.getByText('演示准备控制', { exact: true });
  if (await summary.isVisible()) {
    const details = page.locator('details').filter({ has: summary });
    if (!(await details.getAttribute('open'))) {
      // A boolean open attribute can be the empty string; use the DOM property.
      if (!(await details.evaluate(element => element.open))) await summary.tap();
    }
  }
}
async function simulate(page, label) {
  await controls(page);
  await page.getByRole('button', { name: label, exact: true }).tap();
}
async function ready(page) {
  await simulate(page, '模拟对话就绪');
  await simulate(page, '模拟声音和画面就绪');
  await simulate(page, '模拟检查通过');
  await expect(page.getByRole('heading', { name: '场景草稿已备好（演示）', exact: true })).toBeVisible();
}

for (const category of ['家校沟通', '工作沟通', '生活服务']) {
  test(`T05 / F3.1: ${category} is one of three starts, with a separate unlisted-goal path`, async ({ page }) => {
    await enter(page);
    const starts = page.getByRole('group', { name: '场景起点', exact: true });
    await expect(starts.getByRole('button')).toHaveCount(3);
    await expect(page.getByRole('button', { name: '都不是，我想练……', exact: true })).toBeVisible();
    await starts.getByRole('button', { name: category, exact: true }).tap();
    await expect(card(page)).toBeVisible();
    for (const field of ['和谁', '在哪里', '希望办成什么', '最担心哪一步']) await expect(card(page).getByText(field, { exact: true })).toBeVisible();
    await expect(page.getByRole('group', { name: '可选的练习方向', exact: true }).getByRole('button')).toHaveCount(3);
    await expect(page.getByRole('button', { name: '确认并预览准备', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '正在准备（流程演示）', exact: true })).toHaveCount(0);
    await fits(page);
  });
}

test('T05 / F3.2,F3.4,F3.5: an unlisted goal stays verbatim, unknown facts stay unknown and only one missing detail is asked', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: '都不是，我想练……', exact: true }).tap();
  await expect(page.getByRole('button', { name: /用语音描述/ })).toBeDisabled();
  await expect(page.getByRole('main')).toContainText('无需真实姓名、学校、雇主或病历');
  await page.getByRole('button', { name: '整理成确认卡', exact: true }).tap();
  await expect(page.getByRole('heading', { name: '你希望办成什么？', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(1);
  await page.getByRole('textbox', { name: '希望办成什么', exact: true }).fill(goalA);
  await page.getByRole('button', { name: '继续确认', exact: true }).tap();
  await expect(card(page)).toContainText(goalA);
  await expect(card(page)).toContainText('用户提供');
  await expect(card(page)).toContainText('待确认');
  await expect(card(page)).toContainText('具体安排尚未核实');
  await expect(page.getByRole('main')).toContainText('离线整理演示，不是实际生成');
  await expect(page.locator('input[type="email"], input[type="tel"], input[type="password"]')).toHaveCount(0);
});

test('T05: confirmation can edit each fact without starting preparation or inventing missing details', async ({ page }) => {
  await custom(page);
  for (const [button, label, value] of [['修改谁','和谁','物业接待员'],['修改地点','在哪里','楼下服务处'],['修改担心','最担心哪一步','怕听不清时间']]) {
    await card(page).getByRole('button', { name: button, exact: true }).tap();
    await page.getByRole('textbox', { name: label, exact: true }).fill(value);
    await page.getByRole('button', { name: '保存修改', exact: true }).tap();
    await expect(card(page)).toContainText(value);
  }
  await expect(card(page)).toContainText(goalA);
  await expect(card(page)).toContainText('具体安排尚未核实');
  await expect(page.getByRole('heading', { name: '正在准备（流程演示）', exact: true })).toHaveCount(0);
});

test('T05 / F14.1,F14.2: preparation refreshes in place and a media retry keeps the same completed dialogue', async ({ page }, testInfo) => {
  await custom(page);
  await page.getByRole('button', { name: '确认并预览准备', exact: true }).tap();
  await expect(page.getByRole('heading', { name: '正在准备（流程演示）', exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('版本 1');
  await expect(page.getByRole('main')).not.toContainText(/倒计时|预计剩余|生成成功|秒后完成/);
  await simulate(page, '模拟对话就绪');
  const before = await planned(page).innerText();
  await simulate(page, '模拟声音和画面失败');
  await expect(page.getByRole('main')).toContainText('声音和画面未就绪（模拟）');
  await page.reload();
  await expect(page.getByRole('main')).toContainText(goalA);
  await expect(page.getByRole('main')).toContainText('版本 1');
  expect(await planned(page).innerText()).toBe(before);
  await page.getByRole('button', { name: '只重试失败部分', exact: true }).tap();
  expect(await planned(page).innerText()).toBe(before);
  await simulate(page, '模拟声音和画面就绪');
  await simulate(page, '模拟检查通过');
  await expect(page.getByRole('heading', { name: '场景草稿已备好（演示）', exact: true })).toBeVisible();
  expect(await planned(page).innerText()).toBe(before);
  await expect(page.getByRole('main')).toContainText('真实语音和视频尚未接入');
  await page.screenshot({ path: testInfo.outputPath('scene-partial-recovery.png'), fullPage: true });
});

test('T05: cancel and reload keep a cancelled task; another goal can then start a new revision', async ({ page }) => {
  await custom(page);
  await page.getByRole('button', { name: '确认并预览准备', exact: true }).tap();
  await simulate(page, '模拟对话就绪');
  await page.getByRole('button', { name: '取消准备', exact: true }).tap();
  await expect(page.getByRole('heading', { name: '已取消准备', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '已取消准备', exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toContainText(goalA);
  await page.getByRole('button', { name: '修改目的', exact: true }).tap();
  await page.getByRole('textbox', { name: '希望办成什么', exact: true }).fill(goalB);
  await page.getByRole('button', { name: '保存修改', exact: true }).tap();
  await page.getByRole('button', { name: '确认并预览准备', exact: true }).tap();
  await expect(page.getByRole('main')).toContainText('版本 2');
  await expect(page.getByRole('heading', { name: '正在准备（流程演示）', exact: true })).toBeVisible();
});

test('T05 / F3.3,F9.1: a new goal changes both planned steps and practice prompts, while the old version stays selectable', async ({ page }, testInfo) => {
  await custom(page);
  await page.getByRole('button', { name: '确认并预览准备', exact: true }).tap();
  await ready(page);
  const firstSteps = await planned(page).innerText();
  const prompts = () => page.getByRole('region', { name: '练习提示', exact: true });
  const firstPrompts = await prompts().innerText();
  await page.getByRole('button', { name: '修改目的', exact: true }).tap();
  await page.getByRole('textbox', { name: '希望办成什么', exact: true }).fill(goalB);
  await page.getByRole('button', { name: '保存修改', exact: true }).tap();
  await expect(card(page)).toContainText(goalB);
  await page.getByRole('button', { name: '确认并预览准备', exact: true }).tap();
  await ready(page);
  await expect(planned(page)).toContainText(goalB);
  await expect(planned(page)).not.toContainText(goalA);
  expect(await planned(page).innerText()).not.toBe(firstSteps);
  await expect(prompts()).toContainText(goalB);
  expect(await prompts().innerText()).not.toBe(firstPrompts);
  await page.getByRole('button', { name: '查看版本 1', exact: true }).tap();
  expect(await planned(page).innerText()).toBe(firstSteps);
  expect(await prompts().innerText()).toBe(firstPrompts);
  await page.reload();
  expect(await planned(page).innerText()).toBe(firstSteps);
  await fits(page);
  await page.screenshot({ path: testInfo.outputPath('scene-preserved-version.png'), fullPage: true });
});

test('T05: chosen support is carried into the scene and raw HTML-like descriptions stay inert text', async ({ page }) => {
  await profile(page);
  const settings = page.getByRole('region', { name: '学习起点与帮助', exact: true });
  await settings.getByRole('button', { name: '更自然', exact: true }).tap();
  await settings.getByRole('button', { name: '减少提示', exact: true }).tap();
  await page.getByRole('button', { name: '选择要练的事', exact: true }).tap();
  await page.getByRole('button', { name: '都不是，我想练……', exact: true }).tap();
  const raw = '<img src=x onerror="window.__injected=1"> 我想确认活动地点';
  await page.getByRole('textbox', { name: '想练的事', exact: true }).fill(raw);
  await page.getByRole('button', { name: '整理成确认卡', exact: true }).tap();
  await expect(card(page)).toContainText(raw);
  await page.getByRole('button', { name: '确认并预览准备', exact: true }).tap();
  const support = page.getByRole('region', { name: '本次练习偏好', exact: true });
  await expect(support).toContainText('一句话一件事');
  await expect(support).toContainText('较少提示');
  await expect(support).toContainText('慢一点');
  expect(await page.evaluate(() => window.__injected)).toBeUndefined();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
});

const languages = [
  { code: 'id', language: 'Bahasa Indonesia', guide: 'Pratinjau panduan bertahap', finish: 'Akhiri panduan', entry: 'Pilih hal yang ingin dilatih', own: 'Bukan ini, saya ingin berlatih…', description: 'Hal yang ingin dilatih', submit: 'Susun kartu konfirmasi', card: 'Konfirmasi situasi', confirm: 'Konfirmasi dan pratinjau persiapan', preparing: 'Sedang menyiapkan (demo alur)', cancel: 'Batalkan persiapan', cancelled: 'Persiapan dibatalkan', text: 'Saya ingin bertanya tentang waktu perbaikan lift' },
  { code: 'ja', language: '日本語', guide: '質問の流れをプレビュー', finish: '質問を終える', entry: '練習したいことを選ぶ', own: 'どれでもない、練習したいことは…', description: '練習したいこと', submit: '確認カードにまとめる', card: '場面を確認', confirm: '確認して準備をプレビュー', preparing: '準備中（流れのデモ）', cancel: '準備をキャンセル', cancelled: '準備をキャンセルしました', text: '管理窓口でエレベーター修理の時間を確認したい' },
];
for (const language of languages) {
  test(`T05: ${language.code} describes, confirms, reloads and cancels in the selected language`, async ({ page }) => {
    await page.getByRole('button', { name: new RegExp(`^${language.language}`) }).tap();
    await page.getByRole('button', { name: language.guide, exact: true }).tap();
    await page.getByRole('button', { name: language.finish, exact: true }).tap();
    await page.getByRole('button', { name: language.entry, exact: true }).tap();
    await page.getByRole('button', { name: language.own, exact: true }).tap();
    await page.getByRole('textbox', { name: language.description, exact: true }).fill(language.text);
    await page.getByRole('button', { name: language.submit, exact: true }).tap();
    await expect(page.getByRole('region', { name: language.card, exact: true })).toContainText(language.text);
    await page.getByRole('button', { name: language.confirm, exact: true }).tap();
    await expect(page.getByRole('heading', { name: language.preparing, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: language.preparing, exact: true })).toBeVisible();
    await expect(page.getByRole('main')).toContainText(language.text);
    await expect(page.locator('html')).toHaveAttribute('lang', language.code);
    await page.getByRole('button', { name: language.cancel, exact: true }).tap();
    await expect(page.getByRole('heading', { name: language.cancelled, exact: true })).toBeVisible();
    await fits(page);
    await expect(page.getByRole('main')).not.toContainText(/确认场景|准备对话|取消准备|待确认/);
  });
}

test('T05: switching auxiliary language during preparation keeps the original goal and version', async ({ page }) => {
  await custom(page);
  await page.getByRole('button', { name: '确认并预览准备', exact: true }).tap();
  await simulate(page, '模拟对话就绪');
  await page.getByRole('button', { name: '更换语言', exact: true }).tap();
  await page.getByRole('button', { name: /^Bahasa Indonesia/ }).tap();
  await expect(page.getByRole('heading', { name: 'Sedang menyiapkan (demo alur)', exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toContainText(goalA);
  await expect(page.getByRole('main')).toContainText('Versi 1');
  await page.reload();
  await expect(page.getByRole('main')).toContainText(goalA);
  await expect(page.getByRole('main')).toContainText('Versi 1');
});

test('T05: failed saves disclose temporary operation and corrupted records are not overwritten by a new draft', async ({ page }) => {
  await enter(page);
  await page.evaluate(() => {
    window.__sceneSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'le-sg-scenario-v1') throw new DOMException('Unavailable', 'SecurityError');
      return window.__sceneSetItem.call(this,key,value);
    };
  });
  await page.getByRole('button', { name: '都不是，我想练……', exact: true }).tap();
  await page.getByRole('textbox', { name: '想练的事', exact: true }).fill(goalA);
  await page.getByRole('button', { name: '整理成确认卡', exact: true }).tap();
  await expect(card(page)).toContainText(goalA);
  await expect(page.getByRole('main')).toContainText('场景暂时无法保存，本次仍可继续');
  await page.evaluate(() => { Storage.prototype.setItem = window.__sceneSetItem; localStorage.setItem('le-sg-scenario-v1', '{corrupt-scenario'); });
  await page.reload();
  await page.getByRole('button', { name: '选择要练的事', exact: true }).tap();
  await expect(page.getByRole('main')).toContainText('旧场景记录保持不变');
  await page.getByRole('group', { name: '场景起点', exact: true }).getByRole('button', { name: '生活服务', exact: true }).tap();
  await page.getByRole('button', { name: '确认并预览准备', exact: true }).tap();
  expect(await page.evaluate(() => localStorage.getItem('le-sg-scenario-v1'))).toBe('{corrupt-scenario');
});

test('T05 regression: actual Tab traversal reaches profile controls before Enter and Space actions', async ({ page }) => {
  await profile(page);
  const region = page.getByRole('region', { name: '学习起点与帮助', exact: true });
  const status = region.getByRole('status', { name: '当前练习设置', exact: true });
  async function tabTo(button) {
    for (let count = 0; count < 80; count += 1) {
      if (await button.evaluate(element => element === document.activeElement)) return;
      await page.keyboard.press('Tab');
    }
    throw new Error('Tab could not reach the profile control');
  }
  await tabTo(region.getByRole('button', { name: '更自然', exact: true }));
  await page.keyboard.press('Enter');
  await expect(status).toContainText('一句话一件事');
  await tabTo(region.getByRole('button', { name: '恢复建议', exact: true }));
  await page.keyboard.press('Space');
  await expect(status).toContainText('短句入门');
  await expect(region).toContainText('尚不能判断');
});

test('T05: selecting a non-default candidate changes the rendered steps and practice prompts while retaining the user goal', async ({ page }) => {
  await custom(page);
  await page.getByRole('button', { name: '确认并预览准备', exact: true }).tap();
  await ready(page);
  const stepItems = () => planned(page).getByRole('listitem');
  const promptItems = () => page.getByRole('region', { name: '练习提示', exact: true }).getByRole('listitem');
  expect(await stepItems().count()).toBeGreaterThanOrEqual(2);
  expect(await promptItems().count()).toBeGreaterThanOrEqual(2);
  const firstSteps = await stepItems().allTextContents();
  const firstPrompts = await promptItems().allTextContents();
  await page.getByRole('button', { name: '修改目的', exact: true }).tap();
  await page.getByRole('textbox', { name: '希望办成什么', exact: true }).fill(goalA);
  await page.getByRole('button', { name: '保存修改', exact: true }).tap();
  await page.getByRole('group', { name: '可选的练习方向', exact: true }).getByRole('button', { name: '多问一个细节', exact: true }).tap();
  await expect(card(page)).toContainText(goalA);
  await page.getByRole('button', { name: '确认并预览准备', exact: true }).tap();
  await ready(page);
  const nextSteps = await stepItems().allTextContents();
  const nextPrompts = await promptItems().allTextContents();
  expect(nextSteps).not.toEqual(firstSteps);
  expect(nextPrompts).not.toEqual(firstPrompts);
  expect(nextSteps.join(' ')).toContain('多问一个细节');
  expect(nextPrompts.join(' ')).toContain('多问一个细节');
  await expect(planned(page)).toContainText(goalA);
});

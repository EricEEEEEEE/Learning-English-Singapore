import { test as base, expect } from '@playwright/test';

const test = base.extend({
  page: async ({ page, context, baseURL }, use) => {
    const errors = [];
    const external = [];
    await context.route('**/*', async route => {
      if (new URL(route.request().url()).origin === new URL(baseURL).origin) return route.continue();
      external.push('external HTTP'); await route.abort();
    });
    await context.routeWebSocket('**/*', route => { external.push('WebSocket'); route.close(); });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await context.addInitScript(() => {
      window.__profileMediaCalls = [];
      HTMLMediaElement.prototype.play = () => { window.__profileMediaCalls.push('media'); return Promise.resolve(); };
      if (window.speechSynthesis) window.speechSynthesis.speak = () => window.__profileMediaCalls.push('tts');
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => {
        window.__profileMediaCalls.push('microphone'); throw new Error('No microphone in B1');
      };
    });
    await use(page);
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
    expect(await page.evaluate(() => window.__profileMediaCalls)).toEqual([]);
  },
});
test.use({ hasTouch: true });
test.beforeEach(async ({ page }) => { await page.goto('/'); });

const languages = [
  { code: 'zh-Hans', language: '简体中文', entry: '预览逐题引导', finish: '结束引导', change: '更换语言',
    region: '学习起点与帮助', listening: '目前能听懂的内容', unknown: '尚不能判断', speaking: '说英语尚未了解',
    settings: '当前练习设置', simpler: '更简单', natural: '更自然', slower: '更慢', speed: '自然速度', fewer: '减少提示', restore: '恢复建议',
    feedback: '反馈有误', flagged: '反馈已标记', short: '短句入门', next: '一句话一件事', slow: '慢一点', minimal: '较少提示' },
  { code: 'id', language: 'Bahasa Indonesia', entry: 'Pratinjau panduan bertahap', finish: 'Akhiri panduan', change: 'Ganti bahasa',
    region: 'Titik awal dan bantuan', listening: 'Yang sudah dipahami saat mendengar', unknown: 'Belum dapat dinilai', speaking: 'Kemampuan berbicara belum diketahui',
    settings: 'Pengaturan latihan saat ini', simpler: 'Lebih sederhana', natural: 'Lebih alami', slower: 'Lebih lambat', speed: 'Kecepatan alami', fewer: 'Kurangi petunjuk', restore: 'Pulihkan saran',
    feedback: 'Tandai masukan keliru', flagged: 'Masukan telah ditandai', short: 'Mulai dengan frasa pendek', next: 'Satu maksud per kalimat', slow: 'Pelan-pelan', minimal: 'Lebih sedikit petunjuk' },
  { code: 'ja', language: '日本語', entry: '質問の流れをプレビュー', finish: '質問を終える', change: '言語を変更',
    region: '学習の出発点とサポート', listening: '今聞いてわかる内容', unknown: 'まだ判断できません', speaking: '話す力はまだわかりません',
    settings: '現在の練習設定', simpler: 'もっとやさしく', natural: 'もっと自然に', slower: 'もっとゆっくり', speed: '自然な速さ', fewer: 'ヒントを減らす', restore: 'おすすめに戻す',
    feedback: '評価の誤りを知らせる', flagged: '誤りを記録しました', short: '短い表現から始める', next: '一文で一つのこと', slow: 'ゆっくり', minimal: '少なめのヒント' },
  { code: 'en', language: 'English', entry: 'Preview the step-by-step guide', finish: 'Finish the guide', change: 'Change language',
    region: 'Starting point and support', listening: 'What you understand when listening', unknown: 'Not enough evidence yet', speaking: 'Speaking has not been observed',
    settings: 'Current practice settings', simpler: 'Simpler', natural: 'More natural', slower: 'Slower', speed: 'Natural speed', fewer: 'Fewer hints', restore: 'Restore recommendation',
    feedback: 'Flag incorrect feedback', flagged: 'Feedback flagged', short: 'Start with short phrases', next: 'One idea per sentence', slow: 'Slow', minimal: 'Fewer hints' },
];
const cn = languages[0];
const panel = (page, language = cn) => page.getByRole('region', { name: language.region, exact: true });
const settings = (page, language = cn) => panel(page, language).getByRole('status', { name: language.settings, exact: true });
async function enter(page, language = cn) {
  await page.getByRole('button', { name: new RegExp(`^${language.language}`) }).tap();
  await page.getByRole('button', { name: language.entry, exact: true }).tap();
}
async function finish(page, language = cn) {
  await enter(page, language);
  await page.getByRole('button', { name: language.finish, exact: true }).tap();
  await expect(panel(page, language)).toBeVisible();
}
async function fit(page) {
  const width = page.viewportSize().width;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  for (const button of await panel(page).getByRole('button').all()) {
    const box = await button.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  }
}

for (const language of languages) {
  test(`T04 / F2.3,F2.4: ${language.code} separates unknown listening, unobserved speaking and adjustable support`, async ({ page }, testInfo) => {
    await finish(page, language);
    const result = panel(page, language);
    await expect(result.getByRole('heading', { name: language.listening, exact: true })).toBeVisible();
    await expect(result).toContainText(language.unknown);
    await expect(result).toContainText(language.speaking);
    await expect(settings(page, language)).toContainText(language.short);
    const initial = await settings(page, language).innerText();
    await result.getByRole('button', { name: language.natural, exact: true }).tap();
    await expect(settings(page, language)).toContainText(language.next);
    await result.getByRole('button', { name: language.simpler, exact: true }).tap();
    await expect(settings(page, language)).toContainText(language.short);
    await result.getByRole('button', { name: language.natural, exact: true }).tap();
    await expect(settings(page, language)).toContainText(language.next);
    await result.getByRole('button', { name: language.speed, exact: true }).tap();
    await expect(settings(page, language)).toContainText(language.speed);
    await result.getByRole('button', { name: language.slower, exact: true }).tap();
    await expect(settings(page, language)).toContainText(language.slow);
    await result.getByRole('button', { name: language.fewer, exact: true }).tap();
    await expect(settings(page, language)).toContainText(language.minimal);
    await page.reload();
    await expect(settings(page, language)).toContainText(language.next);
    await expect(settings(page, language)).toContainText(language.minimal);
    await result.getByRole('button', { name: language.feedback, exact: true }).tap();
    await expect(result).toContainText(language.flagged);
    await expect(settings(page, language)).toContainText(language.next);
    await result.getByRole('button', { name: language.restore, exact: true }).tap();
    await expect(settings(page, language)).toHaveText(initial);
    await page.reload();
    await expect(result).toContainText(language.flagged);
    await expect(result).toContainText(language.unknown);
    await expect(result).toContainText(language.speaking);
    await expect(result).not.toContainText(/CEFR|口语零分|考试通过|已掌握|%/);
    if (language.code !== 'zh-Hans') await expect(result).not.toContainText(/尚不能判断|更简单|更慢|当前练习设置/);
    await page.screenshot({ path: testInfo.outputPath(`profile-${language.code}.png`), fullPage: true });
  });
}

test('T04: all simulated listening choices stay unknown and disclose zero independent observations', async ({ page }) => {
  await enter(page);
  for (let index = 0; index < 12; index += 1) {
    const question = page.getByRole('article', { name: '当前问题', exact: true });
    const simulated = question.getByText('演示播放控制', { exact: true });
    if (await simulated.isVisible()) {
      await simulated.tap();
      await question.getByRole('button', { name: '模拟题目播放结束', exact: true }).tap();
    }
    await question.getByRole('group', { name: '回答选项', exact: true }).getByRole('button').first().tap();
  }
  await expect(panel(page)).toContainText('尚不能判断');
  await expect(panel(page)).toContainText('独立听力证据：0');
  await expect(panel(page)).toContainText('演示回答不作为能力证据');
  await expect(panel(page)).toContainText('说英语尚未了解');
  await page.reload();
  await expect(panel(page)).toContainText('独立听力证据：0');
});

test('T04 / F2.5,F10.5: choice overrides survive language changes, reload and optional answers; restore is explicit', async ({ page }) => {
  await enter(page);
  for (let index = 0; index < 12; index += 1) await page.getByRole('button', { name: '不知道', exact: true }).tap();
  await panel(page).getByRole('button', { name: cn.natural, exact: true }).tap();
  await panel(page).getByRole('button', { name: cn.fewer, exact: true }).tap();
  await page.getByRole('button', { name: '继续了解（可选）', exact: true }).tap();
  for (let index = 0; index < 4; index += 1) await page.getByRole('button', { name: '不知道', exact: true }).tap();
  await expect(settings(page)).toContainText(cn.next);
  await expect(settings(page)).toContainText(cn.minimal);
  await page.getByRole('button', { name: cn.change, exact: true }).tap();
  const en = languages[3];
  await page.getByRole('button', { name: /^English/ }).tap();
  await expect(settings(page, en)).toContainText(en.next);
  await expect(settings(page, en)).toContainText(en.minimal);
  await page.reload();
  await expect(settings(page, en)).toContainText(en.next);
  await panel(page, en).getByRole('button', { name: en.restore, exact: true }).tap();
  await expect(settings(page, en)).toContainText(en.short);
  await expect(panel(page, en)).toContainText(en.unknown);
});

test('T04: large-text controls fit and keyboard actions change settings while ability stays unknown', async ({ page }, testInfo) => {
  await finish(page);
  await page.getByRole('button', { name: '显示设置', exact: true }).tap();
  await page.getByRole('checkbox', { name: '大字', exact: true }).check();
  await fit(page);
  const more = panel(page).getByRole('button', { name: cn.natural, exact: true });
  await more.focus();
  await page.keyboard.press('Space');
  await expect(settings(page)).toContainText(cn.next);
  const restore = panel(page).getByRole('button', { name: cn.restore, exact: true });
  await restore.focus();
  await page.keyboard.press('Enter');
  await expect(settings(page)).toContainText(cn.short);
  await expect(panel(page)).toContainText(cn.unknown);
  await page.screenshot({ path: testInfo.outputPath('profile-large-keyboard.png'), fullPage: true });
});

test('T04: failed preference saves are visible, recover without reload and keep current choices usable', async ({ page }) => {
  await finish(page);
  await page.evaluate(() => {
    window.__savedStudySetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'le-sg-study-preferences-v1') throw new DOMException('Unavailable', 'SecurityError');
      return window.__savedStudySetItem.call(this, key, value);
    };
  });
  await panel(page).getByRole('button', { name: cn.natural, exact: true }).tap();
  await expect(settings(page)).toContainText(cn.next);
  await expect(panel(page)).toContainText('无法保存练习设置，本次仍可继续');
  await page.evaluate(() => { Storage.prototype.setItem = window.__savedStudySetItem; });
  await panel(page).getByRole('button', { name: cn.fewer, exact: true }).tap();
  await expect(panel(page)).not.toContainText('无法保存练习设置，本次仍可继续');
  await page.reload();
  await expect(settings(page)).toContainText(cn.next);
  await expect(settings(page)).toContainText(cn.minimal);
});

for (const variant of ['invalid-json', 'null', 'unsupported-record']) {
  test(`T04 regression: damaged onboarding ${variant} survives a temporary preview without overwritten bytes`, async ({ page }) => {
    await enter(page);
    await page.getByRole('button', { name: '几乎不会英语', exact: true }).tap();
    const raw = await page.evaluate(variant => {
      const key = 'le-sg-onboarding-v1';
      const saved = JSON.parse(localStorage.getItem(key));
      let bad;
      if (variant === 'invalid-json') bad = '{broken';
      else if (variant === 'null') bad = 'null';
      else { saved.records['unsupported-question'] = { response: 'choice' }; bad = JSON.stringify(saved); }
      localStorage.setItem(key, bad);
      return bad;
    }, variant);
    await page.reload();
    await expect(page.getByRole('main')).toContainText('旧记录保持不变');
    await page.getByRole('button', { name: '预览逐题引导', exact: true }).tap();
    await page.getByRole('button', { name: '几乎不会英语', exact: true }).tap();
    await page.getByRole('button', { name: '稍后继续', exact: true }).tap();
    await page.getByRole('button', { name: '继续逐题引导', exact: true }).tap();
    await expect(page.getByRole('article', { name: '当前问题', exact: true })).toContainText('第 2 / 12 题');
    expect(await page.evaluate(() => localStorage.getItem('le-sg-onboarding-v1'))).toBe(raw);
    await page.reload();
    await expect(page.getByRole('main')).toContainText('旧记录保持不变');
    expect(await page.evaluate(() => localStorage.getItem('le-sg-onboarding-v1'))).toBe(raw);
  });
}

test('T04: malformed saved study settings remain untouched while temporary adjustments work', async ({ page }) => {
  await finish(page);
  const raw = '{unreadable-study-settings';
  await page.evaluate(raw => localStorage.setItem('le-sg-study-preferences-v1', raw), raw);
  await page.reload();
  await expect(panel(page)).toContainText('练习设置读取失败，本次调整暂不保存，旧记录保持不变');
  await panel(page).getByRole('button', { name: cn.natural, exact: true }).tap();
  await expect(settings(page)).toContainText(cn.next);
  expect(await page.evaluate(() => localStorage.getItem('le-sg-study-preferences-v1'))).toBe(raw);
  await expect(panel(page)).toContainText(cn.unknown);
});

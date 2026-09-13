import { test as base, expect } from '@playwright/test';

const test = base.extend({
  page: async ({ page, context, baseURL }, use) => {
    const errors = [];
    const external = [];
    await context.route('**/*', async route => {
      if (new URL(route.request().url()).origin === new URL(baseURL).origin) return route.continue();
      external.push(route.request().url());
      await route.abort('blockedbyclient');
    });
    await context.routeWebSocket('**/*', route => { external.push(route.url()); route.close(); });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await context.addInitScript(() => {
      window.__onboardingMediaCalls = [];
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => {
        window.__onboardingMediaCalls.push('microphone');
        throw new Error('T03 must not request microphone or camera access');
      };
      if (window.speechSynthesis) window.speechSynthesis.speak = () => { window.__onboardingMediaCalls.push('tts'); };
      HTMLMediaElement.prototype.play = () => { window.__onboardingMediaCalls.push('media'); return Promise.resolve(); };
    });
    await use(page);
    expect(external, 'Only local prototype resources may be requested').toEqual([]);
    expect(errors, 'Onboarding must not fail in the browser').toEqual([]);
    expect(await page.evaluate(() => window.__onboardingMediaCalls), 'Simulated playback events never play substitute audio').toEqual([]);
  },
});
test.use({ hasTouch: true });
test.beforeEach(async ({ page }) => { await page.goto('/'); });

const current = page => page.getByRole('article', { name: '当前问题', exact: true });
const choices = page => current(page).getByRole('group', { name: '回答选项', exact: true }).getByRole('button');
async function enter(page) {
  await page.getByRole('button', { name: /^简体中文/ }).tap();
  await page.getByRole('button', { name: '预览逐题引导', exact: true }).tap();
  await expect(current(page)).toBeVisible();
}
async function goToListening(page) {
  for (let step = 0; step < 6; step += 1) {
    if (await current(page).getByText('听音配图', { exact: true }).isVisible()) return;
    await page.getByRole('button', { name: '不知道', exact: true }).tap();
  }
  throw new Error('No listening/image item appeared within six preference questions');
}
async function finishCore(page) {
  let count = 0;
  while (await current(page).isVisible() && count < 15) {
    await page.getByRole('button', { name: '不知道', exact: true }).tap();
    count += 1;
  }
  expect(count).toBe(12);
  await expect(page.getByRole('heading', { name: '先从短句、慢一点开始', exact: true })).toBeVisible();
}
async function assertNoAssessmentClaims(page) {
  await expect(page.locator('body')).not.toContainText(/口语零分|英语零分|已掌握|考试通过|倒计时|排行榜|正确率|CEFR/);
  await expect(page.locator('input[type="text"], input[type="email"], input[type="tel"], input[type="password"], textarea')).toHaveCount(0);
}

test('T03 / F2.1,F13.1: separate demo entry starts one accessible question without login or microphone', async ({ page }, testInfo) => {
  await expect(page.getByRole('button', { name: '预览逐题引导', exact: true })).toHaveCount(0);
  await enter(page);
  await expect(page.getByText('流程演示', { exact: true })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(current(page).getByRole('heading', { level: 2 })).toBeVisible();
  await expect(page.getByRole('button', { name: /听操作说明/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /听操作说明/ })).toHaveAccessibleName(/尚未接入/);
  const options = choices(page);
  expect(await options.count()).toBeGreaterThanOrEqual(2);
  expect(await options.count()).toBeLessThanOrEqual(4);
  for (const option of await options.all()) {
    expect(await option.locator('svg, img').count()).toBeGreaterThan(0);
    await expect(option).toHaveAccessibleName(/[\u3400-\u9fff]/);
  }
  const previousPrompt = await current(page).getByRole('heading', { level: 2 }).innerText();
  await page.getByRole('button', { name: '几乎不会英语', exact: true }).tap();
  await expect(current(page).getByRole('heading', { level: 2 })).not.toHaveText(previousPrompt);
  await expect(page.getByRole('button', { name: '回到上一题', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
  for (const control of await page.locator('button:visible').all()) {
    const box = await control.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
  }
  await assertNoAssessmentClaims(page);
  await page.screenshot({ path: testInfo.outputPath('question-flow.png'), fullPage: true });
});

test('T03 / F2.2,F2.3: twelve core items stay one-at-a-time and all unknown remains unknown', async ({ page }) => {
  await enter(page);
  let preferences = 0;
  let listening = 0;
  const prompts = [];
  for (let index = 0; index < 12; index += 1) {
    const question = current(page);
    await expect(question).toBeVisible();
    await expect(question.getByText(`第 ${index + 1} / 12 题`, { exact: true })).toBeVisible();
    prompts.push(await question.getByRole('heading', { level: 2 }).innerText());
    expect(await choices(page).count()).toBeGreaterThanOrEqual(2);
    expect(await choices(page).count()).toBeLessThanOrEqual(4);
    if (await question.getByText('听音配图', { exact: true }).isVisible()) {
      listening += 1;
      await expect(question.getByRole('button', { name: /听题目/ })).toBeDisabled();
      await expect(question).toContainText(/音频.*尚未接入/);
      for (const option of await choices(page).all()) expect(await option.locator('svg, img').count()).toBeGreaterThan(0);
    } else {
      preferences += 1;
      await expect(question.getByText('了解你的偏好', { exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: '不知道', exact: true }).tap();
  }
  expect(preferences).toBe(5);
  expect(listening).toBe(7);
  expect(new Set(prompts).size).toBe(12);
  await expect(current(page)).toHaveCount(0);
  await expect(page.getByRole('main')).toContainText('暂按入门程度开始，可随时调整');
  await expect(page.getByRole('main')).toContainText(/说英语尚未了解|口语尚未了解/);
  await expect(page.getByRole('main')).toContainText(/尚不能判断|尚未测量/);
  await assertNoAssessmentClaims(page);
});

test('T03: optional refinement is separate, stops at four, and cannot be restarted to exceed its cap', async ({ page }) => {
  await enter(page);
  await finishCore(page);
  await page.getByRole('button', { name: '继续了解（可选）', exact: true }).tap();
  for (let index = 0; index < 4; index += 1) {
    await expect(current(page).getByText(`可选问题 ${index + 1} / 4`, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '跳过这题', exact: true }).tap();
  }
  await expect(current(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '继续了解（可选）', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: '继续了解（可选）', exact: true })).toHaveCount(0);
  await expect(page.getByRole('main')).toContainText('暂按入门程度开始，可随时调整');
});

test('T03: pause and reload resume the exact question and an earlier choice', async ({ page }, testInfo) => {
  await enter(page);
  await page.getByRole('button', { name: '几乎不会英语', exact: true }).tap();
  const question = await current(page).getByRole('heading', { level: 2 }).innerText();
  await page.getByRole('button', { name: '稍后继续', exact: true }).tap();
  await expect(page.getByRole('heading', { name: '已暂停', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '已暂停', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '继续逐题引导', exact: true }).tap();
  await expect(current(page).getByRole('heading', { level: 2 })).toHaveText(question);
  await page.getByRole('button', { name: '回到上一题', exact: true }).tap();
  await expect(page.getByRole('button', { name: '几乎不会英语', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: testInfo.outputPath('resumed-choice.png'), fullPage: true });
});

test('T03 / F5.2: simulated replay and answer support survive back, changed choice and refresh', async ({ page }, testInfo) => {
  await enter(page);
  await goToListening(page);
  const question = await current(page).getByRole('heading', { level: 2 }).innerText();
  await page.getByRole('button', { name: '帮我理解', exact: true }).tap();
  await expect(page.getByRole('region', { name: '理解帮助', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /听释义/ })).toBeDisabled();
  await page.getByText('演示播放控制', { exact: true }).tap();
  await page.getByRole('button', { name: '模拟题目播放结束', exact: true }).tap();
  await page.getByRole('button', { name: '模拟题目播放结束', exact: true }).tap();
  await expect(current(page)).toContainText('已重听 1 次（模拟）');
  const first = await choices(page).nth(0).innerText();
  const second = await choices(page).nth(1).innerText();
  await choices(page).nth(0).tap();
  await page.getByRole('button', { name: '回到上一题', exact: true }).tap();
  await page.getByText('演示播放控制', { exact: true }).tap();
  await page.getByRole('button', { name: '模拟完整答案播放结束', exact: true }).tap();
  await choices(page).nth(1).tap();
  await page.getByRole('button', { name: '回到上一题', exact: true }).tap();
  await expect(current(page)).toContainText('已查看答案提示（模拟）');
  await expect(current(page)).toContainText('已重听 1 次（模拟）');
  expect(first).not.toBe(second);
  await expect(choices(page).nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(current(page).getByRole('heading', { level: 2 })).toHaveText(question);
  await expect(choices(page).nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(current(page)).toContainText('已查看答案提示（模拟）');
  await expect(current(page)).toContainText('已重听 1 次（模拟）');
  await page.screenshot({ path: testInfo.outputPath('preserved-support.png'), fullPage: true });
});

test('T03: skipping and ending immediately never require twelve answers or classify silence as failure', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: '跳过这题', exact: true }).tap();
  await expect(current(page).getByText('第 2 / 12 题', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '结束引导', exact: true }).tap();
  await expect(current(page)).toHaveCount(0);
  await expect(page.getByRole('main')).toContainText('暂按入门程度开始，可随时调整');
  await expect(page.getByRole('main')).toContainText(/尚不能判断|尚未测量/);
  await assertNoAssessmentClaims(page);
});

const languages = [
  { code: 'zh-Hans', choice: '简体中文', entry: '预览逐题引导', article: '当前问题', nearZero: '几乎不会英语', pause: '稍后继续', resume: '继续逐题引导', unknown: '不知道', help: '帮我理解', region: '理解帮助', audio: '听释义', optional: '继续了解（可选）', speaking: '说英语尚未了解' },
  { code: 'id', choice: 'Bahasa Indonesia', entry: 'Pratinjau panduan bertahap', article: 'Pertanyaan saat ini', nearZero: 'Hampir belum bisa bahasa Inggris', pause: 'Lanjutkan nanti', resume: 'Lanjutkan panduan', unknown: 'Belum tahu', help: 'Bantu saya memahami', region: 'Bantuan pemahaman', audio: 'Dengarkan penjelasan', optional: 'Lanjutkan sedikit lagi (opsional)', speaking: 'Kemampuan berbicara belum diketahui' },
  { code: 'ja', choice: '日本語', entry: '質問の流れをプレビュー', article: '今の質問', nearZero: '英語はほとんどわからない', pause: 'あとで続ける', resume: '質問を再開する', unknown: 'わからない', help: '理解を助けて', region: '理解のサポート', audio: '意味を聞く', optional: 'もう少し続ける（任意）', speaking: '話す力はまだわかりません' },
];
for (const language of languages) {
  test(`T03 / F2.1,F13.1: ${language.code} starts, skips, pauses and resumes in the confirmed language`, async ({ page }) => {
    await page.getByRole('button', { name: new RegExp(`^${language.choice}`) }).tap();
    await page.getByRole('button', { name: language.entry, exact: true }).tap();
    const article = page.getByRole('article', { name: language.article, exact: true });
    await expect(article).toBeVisible();
    await page.getByRole('button', { name: language.nearZero, exact: true }).tap();
    await page.getByRole('button', { name: language.unknown, exact: true }).tap();
    const prompt = await article.getByRole('heading', { level: 2 }).innerText();
    await page.getByRole('button', { name: language.pause, exact: true }).tap();
    await page.reload();
    await page.getByRole('button', { name: language.resume, exact: true }).tap();
    await expect(article.getByRole('heading', { level: 2 })).toHaveText(prompt);
    await expect(page.locator('html')).toHaveAttribute('lang', language.code);
    for (let step = 0; step < 3; step += 1) await page.getByRole('button', { name: language.unknown, exact: true }).tap();
    await page.getByRole('button', { name: language.help, exact: true }).tap();
    await expect(page.getByRole('region', { name: language.region, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(language.audio) })).toBeDisabled();
    for (let remaining = 0; remaining < 7; remaining += 1) await page.getByRole('button', { name: language.unknown, exact: true }).tap();
    await expect(page.getByRole('main')).toContainText(language.speaking);
    await page.getByRole('button', { name: language.optional, exact: true }).tap();
    for (let remaining = 0; remaining < 4; remaining += 1) await page.getByRole('button', { name: language.unknown, exact: true }).tap();
    await expect(article).toHaveCount(0);
    await expect(page.getByRole('button', { name: language.optional, exact: true })).toHaveCount(0);
    await expect(page.getByRole('main')).toContainText(language.speaking);
    if (language.code !== 'zh-Hans') expect(await page.locator('body').innerText()).not.toMatch(/不知道|稍后继续|当前问题|结束引导|尚未接入/);
    await assertNoAssessmentClaims(page);
  });
}

test('T03: changing auxiliary language during a question preserves the same place and prior choice', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: '几乎不会英语', exact: true }).tap();
  await page.getByRole('button', { name: '更换语言', exact: true }).tap();
  await page.getByRole('button', { name: /^日本語/ }).tap();
  await expect(page.getByRole('article', { name: '今の質問', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '前の質問に戻る', exact: true }).tap();
  await expect(page.getByRole('button', { name: '英語はほとんどわからない', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.getByRole('button', { name: '英語はほとんどわからない', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('T03: a simulated playback failure remains a device state after skip, back and refresh', async ({ page }) => {
  await enter(page);
  await goToListening(page);
  await page.getByText('演示播放控制', { exact: true }).tap();
  await page.getByRole('button', { name: '模拟播放故障', exact: true }).tap();
  await expect(current(page)).toContainText('播放故障（模拟）');
  await page.getByRole('button', { name: '跳过这题', exact: true }).tap();
  await page.getByRole('button', { name: '回到上一题', exact: true }).tap();
  await page.reload();
  await expect(current(page)).toContainText('播放故障（模拟）');
  await page.getByRole('button', { name: '结束引导', exact: true }).tap();
  await expect(page.getByRole('main')).toContainText(/尚不能判断|尚未测量/);
  await assertNoAssessmentClaims(page);
});

test('T03: failed local progress saves disclose the limitation without blocking the current flow', async ({ page }) => {
  await enter(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Progress storage unavailable', 'SecurityError'); };
  });
  await page.getByRole('button', { name: '几乎不会英语', exact: true }).tap();
  await expect(current(page).getByText('第 2 / 12 题', { exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toContainText(/无法保存.*本次/);
  await page.getByRole('button', { name: '稍后继续', exact: true }).tap();
  await page.getByRole('button', { name: '继续逐题引导', exact: true }).tap();
  await expect(current(page).getByText('第 2 / 12 题', { exact: true })).toBeVisible();
});

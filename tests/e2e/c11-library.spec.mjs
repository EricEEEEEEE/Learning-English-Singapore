import { test, expect } from '@playwright/test';
import { setupData, openLibrary, ownerA } from '../fixtures/c5-data-browser.mjs';
import { hotelRequirement, setupGuided } from '../fixtures/t69-guided-browser.mjs';
import { installMic, routePractice, openPractice, panel, twoTurns, reply } from '../fixtures/c4-practice-browser.mjs';
import { routeReviews, speak } from '../fixtures/c9-practice-browser.mjs';
import { openMore, closeMore, startPracticeSetup } from '../fixtures/c10-shell.mjs';
import { openRowMenu, rowSheet, actionButtons } from '../fixtures/c11-shell.mjs';
import { setupBrowser, openBackground } from '../fixtures/t68-generation-browser.mjs';

// C11-4 (user 2026-10-18: "still not simple enough"): my scenes become one row each with delete inside the row's ⋯;
// data and privacy move into "more"; generation records become a compact list; the review shows plain counts, never
// a ring, a percentage, a score or "mastered"; and long Hindi or Indonesian labels wrap inside the bottom bar.
// All routes are answered in memory; nothing is generated, deleted for real or sent to a model.
test.use({ locale: 'zh-CN' });
const description = hotelRequirement().content.description;
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const color = (page, value) => page.evaluate(v => { const el = document.createElement('div'); el.style.backgroundColor = v; document.body.append(el); const c = getComputedStyle(el).backgroundColor; el.remove(); return c; }, value);
const preferences = 'le-sg-entry-preferences-v1';

// ---- My scenes ----

test('C11-4 / F14.4: my scenes are one row each; the whole row opens the scene and delete waits inside the row ⋯', async ({ page, context, baseURL }) => {
  const { state, main } = await setupData(page, context, baseURL);
  await openLibrary(page, main);
  const row = main.locator('.scene-card').filter({ hasText: description });
  await expect(row).toHaveCount(1);
  await expect(row.locator('.scene-row-icon')).toBeVisible();
  expect(await row.locator('.scene-description').evaluate(p => getComputedStyle(p).webkitLineClamp)).toBe('2');
  await expect(row.getByTestId('scene-row-meta')).toContainText('住客');
  expect((await row.boundingBox()).height).toBeLessThanOrEqual(120);
  await expect(main.getByRole('button', { name: `删除这个场景：${description}`, exact: true })).toHaveCount(0);
  const menu = row.getByRole('button', { name: `更多操作：${description}`, exact: true });
  await expect(menu).toHaveAttribute('aria-haspopup', 'dialog');
  const sheet = await openRowMenu(main, description);
  await sheet.getByRole('button', { name: `删除这个场景：${description}`, exact: true }).click();
  const confirm = sheet.getByRole('button', { name: '确认删除', exact: true });
  await expect(confirm).toHaveClass(/btn-danger/);
  expect(await confirm.evaluate(b => getComputedStyle(b).backgroundColor)).toBe(await color(page, 'var(--danger)'));
  await sheet.getByRole('button', { name: '取消', exact: true }).click();
  await expect(rowSheet(page)).toHaveCount(0);
  expect(state.deletes).toEqual([]);
  // Tapping the row's text opens the scene, not only the small arrow.
  await row.locator('.scene-description').click();
  await expect(main.getByTestId('real-scene-course')).toBeVisible();
});

test('C11-4 / F14.4, F14.5: generation records, "what we store" and "delete all" live in "more → data and privacy"', async ({ page, context, baseURL }) => {
  const { state, main } = await setupData(page, context, baseURL);
  await openLibrary(page, main);
  for (const name of ['生成记录', '删除我的全部学习数据']) await expect(main.getByRole('button', { name, exact: true })).toHaveCount(0);
  await expect(main.locator('details').filter({ hasText: '我们保存了什么' })).toBeHidden();
  const sheet = await openMore(page);
  await expect(sheet.getByRole('heading', { name: '数据与隐私', exact: true })).toBeVisible();
  for (const name of ['生成记录', '删除我的全部学习数据']) await expect(sheet.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(sheet.locator('details summary').filter({ hasText: '我们保存了什么' })).toBeVisible();
  await sheet.getByRole('button', { name: '删除我的全部学习数据', exact: true }).click();
  await expect(sheet.getByRole('button', { name: '确认全部删除', exact: true })).toHaveClass(/btn-danger/);
  await expect(page.locator('dialog [role="status"], dialog [role="alert"]')).toHaveCount(0);
  await closeMore(page);
  expect(state.dataDeletes).toEqual([]);
  // The way to start a new scene is the bottom bar's single primary.
  await expect(page.locator('.btn-primary:visible')).toHaveCount(1);
  await expect(page.locator('.btn-primary:visible')).toHaveText('返回场景输入');
});

test('C11-4 / F14.3: generation records are a compact list: a status badge and a right-aligned amount, about eight on a phone screen', async ({ page, context, baseURL }) => {
  const { state, main } = await setupData(page, context, baseURL);
  const statuses = ['ready', 'failed', 'unknown', 'in_progress', 'simulation', 'cancelled', 'stopped', 'ready', 'failed', 'ready'];
  state.generationRecords[ownerA] = { tasks: statuses.map((status, index) => ({ id: `c11-${index}`, revision: index + 1, description: `第 ${index + 1} 个场景：我想在社区中心报名活动。`, status, reservedMicros: 100_000 * (index + 1), providerCalls: 1 })), deletions: [] };
  await openLibrary(page, main);
  await openMore(page);
  await page.locator('dialog[open]').getByRole('button', { name: '生成记录', exact: true }).click();
  const rows = main.getByTestId('generation-record');
  await expect(rows).toHaveCount(10);
  const note = main.getByText('预留费用是本产品为这次生成预先留出的上限，不是供应商的实际账单。');
  await expect(note).toBeVisible();
  expect((await note.boundingBox()).y).toBeLessThan((await rows.first().boundingBox()).y);
  const height = page.viewportSize().height, barTop = (await page.getByTestId('action-bar').boundingBox())?.y ?? height;
  let inView = 0;
  for (const row of await rows.all()) {
    const box = await row.boundingBox();
    if (box.y + box.height <= Math.min(height, barTop) + 1) inView++;
    const badge = row.getByTestId('record-badge'), amount = row.getByTestId('record-amount');
    await expect(badge).toBeVisible(); await expect(badge).toHaveAttribute('data-tone', /^(green|red|amber|grey)$/);
    const amountBox = await amount.boundingBox();
    expect(amountBox.x + amountBox.width).toBeGreaterThanOrEqual(box.x + box.width - 20);
    expect(await amount.evaluate(el => getComputedStyle(el).fontVariantNumeric)).toContain('tabular-nums');
  }
  if (page.viewportSize().width <= 520) expect(inView).toBeGreaterThanOrEqual(8);
  await expect(rows.nth(0)).toContainText('预留费用上限 US$0.10');
  await expect(rows.nth(0).getByTestId('record-badge')).toHaveAttribute('data-tone', 'green');
  await expect(rows.nth(1).getByTestId('record-badge')).toHaveAttribute('data-tone', 'red');
  expect(await noOverflow(page)).toBe(true);
});

// ---- Review ----

test('C11-4 / F10.1: the review starts with plain counts, "开口 1/2" and three small counts, folds the turns and ends with "再练一次"', async ({ page, context, baseURL }) => {
  await routePractice(page, [{ json: reply() }]);
  await routeReviews(page, baseURL);
  const { main } = await openPractice(page, context, baseURL, { changeCourse: twoTurns });
  await installMic(page);
  await speak(panel(main));
  await expect(panel(main).getByTestId('practice-reply')).toBeVisible();
  await panel(main).getByRole('button', { name: '下一回合', exact: true }).click();
  await panel(main).getByRole('button', { name: '帮我理解', exact: true }).click();
  await openMore(main);
  await panel(main).getByRole('button', { name: '结束练习', exact: true }).click();
  const ending = panel(main).getByTestId('practice-ending');
  const counts = ending.getByTestId('review-counts');
  await expect(counts.getByTestId('review-spoken')).toHaveText('开口 1/2');
  expect(parseFloat(await counts.getByTestId('review-spoken-number').evaluate(el => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(32);
  await expect(counts.getByTestId('review-small')).toHaveText(['提示 0', '帮助 1', '母语 0']);
  await expect(ending.locator('svg circle, [role="progressbar"], [role="meter"], progress, meter')).toHaveCount(0);
  await expect(ending).not.toContainText('%');
  const turns = ending.locator('details[data-testid="review-turns"]');
  await expect(turns).not.toHaveAttribute('open', '');
  await turns.locator('summary').click();
  await expect(turns.getByText('第 1 回合：你开口说了“Yes, I booked a room.” · 独立完成', { exact: false })).toBeVisible();
  const bar = ending.getByTestId('action-bar');
  await expect(bar.getByRole('button', { name: '再练一次', exact: true })).toHaveClass(/btn-primary/);
  await expect(bar.getByRole('button', { name: '回去看场景', exact: true })).toBeVisible();
  await expect(ending.getByRole('button', { name: '继续练', exact: true })).toHaveClass(/text-button/);
  await expect(page.locator('.btn-primary:visible')).toHaveCount(1);
  expect(await noOverflow(page)).toBe(true);
});

const practiceNames = {
  'zh-Hans': { enter: '下一步：开口对练', start: '开始说', done: '说完了' }, id: { enter: 'Berikutnya: latihan bicara', start: 'Mulai bicara', done: 'Selesai' },
  ja: { enter: '次へ：話して練習', start: '話す', done: '話し終えた' }, ko: { enter: '다음: 말하기 연습', start: '말하기', done: '다 말했어요' }, hi: { enter: 'आगे: बोलकर अभ्यास', start: 'बोलना शुरू करें', done: 'बोल लिया' },
};
const forbidden = {
  'zh-Hans': /分|%|掌握/, id: /%|nilai|skor|kuasai/i, ja: /%|点|習得|マスター/, ko: /%|점수|숙달|마스터/, hi: /%|अंक|प्रतिशत|महारत/,
};
async function walkToPractice(page, main, language) {
  const { guidedSceneCopy } = await import('../../app/guided-scene-copy.ts');
  const guide = guidedSceneCopy[language];
  for (const name of [guide.enter, guide.start, guide.nextSentence, guide.nextPrompt, practiceNames[language].enter]) await main.getByRole('button', { name, exact: true }).click();
  await startPracticeSetup(main);
}

for (const language of Object.keys(forbidden)) test(`C11-4 / F10.1: the ${language} review has no score, percentage or "mastered" wording`, async ({ page, context, baseURL }) => {
  await routePractice(page, [{ json: reply() }]);
  await routeReviews(page, baseURL);
  const { practiceQualityCopy } = await import('../../app/practice-quality-copy.ts');
  const { main } = await setupGuided(page, context, baseURL, { record: hotelRequirement(language), changeCourse: twoTurns });
  await walkToPractice(page, main, language);
  await installMic(page);
  const copy = practiceNames[language];
  await panel(main).getByRole('button', { name: copy.start, exact: true }).click();
  await panel(main).getByRole('button', { name: copy.done, exact: true }).click();
  await expect(panel(main).getByTestId('practice-reply')).toBeVisible();
  await openMore(main);
  await panel(main).getByRole('button', { name: practiceQualityCopy[language].end, exact: true }).click();
  const ending = panel(main).getByTestId('practice-ending');
  await expect(ending.getByTestId('review-spoken')).toBeVisible();
  const text = await ending.evaluate(el => el.textContent);
  expect(text).not.toMatch(forbidden[language]);
  expect(await noOverflow(page)).toBe(true);
});

// ---- Long Hindi and Indonesian labels ----

async function barFits(page) {
  const bar = page.getByTestId('action-bar').filter({ visible: true });
  await expect(bar).toBeVisible();
  const report = await bar.evaluate(el => {
    const box = el.getBoundingClientRect(), problems = [];
    for (const button of el.querySelectorAll('button')) {
      const r = button.getBoundingClientRect(), name = button.textContent.trim();
      if (button.scrollWidth > button.clientWidth + 1) problems.push(`clipped: ${name}`);
      if (r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1) problems.push(`outside the bar: ${name}`);
    }
    if (box.bottom > window.innerHeight + 1) problems.push('bar below the screen');
    return problems;
  });
  expect(report).toEqual([]);
  expect(await noOverflow(page)).toBe(true);
}

for (const language of ['hi', 'id']) for (const largeText of [false, true]) test(`C11-4 / F13.1: ${language}${largeText ? ' with large text' : ''} labels wrap inside the bottom bar on every learning page and the review`, async ({ page, context, baseURL }) => {
  await routePractice(page, [{ json: reply() }]);
  await routeReviews(page, baseURL);
  if (largeText) await context.addInitScript(({ key, language }) => localStorage.setItem(key, JSON.stringify({ language, largeText: true, reducedMotion: false })), { key: preferences, language });
  const { guidedSceneCopy } = await import('../../app/guided-scene-copy.ts');
  const { practiceQualityCopy } = await import('../../app/practice-quality-copy.ts');
  const guide = guidedSceneCopy[language];
  const { main } = await setupGuided(page, context, baseURL, { record: hotelRequirement(language) });
  await barFits(page);
  for (const name of [guide.enter, guide.start, guide.nextSentence, guide.nextPrompt]) {
    await main.getByRole('button', { name, exact: true }).click();
    await barFits(page);
  }
  await main.getByRole('button', { name: practiceNames[language].enter, exact: true }).click();
  await startPracticeSetup(main);
  await openMore(main);
  await panel(main).getByRole('button', { name: practiceQualityCopy[language].end, exact: true }).click();
  await expect(panel(main).getByTestId('practice-ending')).toBeVisible();
  await barFits(page);
});

for (const language of ['hi', 'id']) test(`C11-4 / F13.1: ${language} keywords and confirm bottom bars wrap without overflowing`, async ({ page, context, baseURL }) => {
  await setupBrowser(page, context, baseURL);
  const { sceneEntryCopy } = await import('../../app/scene-entry-copy.ts');
  const { sceneGenerationCopy } = await import('../../app/scene-generation-copy.ts');
  await context.addInitScript(({ key, language }) => localStorage.setItem(key, JSON.stringify({ language, largeText: true, reducedMotion: false })), { key: preferences, language });
  await page.goto('/'); const main = page.getByRole('main');
  await main.locator('textarea').fill('Saya ingin bertanya kepada tetangga tentang kebun bersama.');
  await main.getByRole('button', { name: sceneEntryCopy[language].next, exact: true }).click();
  await barFits(page);
  await main.getByRole('button', { name: sceneGenerationCopy[language].generate, exact: true }).click();
  await barFits(page);
});

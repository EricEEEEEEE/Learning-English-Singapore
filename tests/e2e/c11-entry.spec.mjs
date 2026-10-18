import { test, expect } from '@playwright/test';
import { setupBrowser, openBackground, requirement, generationView, ownerA, sceneTitle, keywordLabels } from '../fixtures/t68-generation-browser.mjs';
import { openMore, closeMore, moreSheet } from '../fixtures/c10-shell.mjs';
import { openMoreKeywords, seedSheet, actionButtons } from '../fixtures/c11-shell.mjs';

// C11-3 (user 2026-10-18: "still not simple enough"): the scene input keeps only its title, one line, the input,
// three examples and "browse more"; the seed browser and other links move into sheets; keywords show three first;
// the confirm card is two columns of chips with the cost note right above "确认生成"; the generation page is one
// centred status. Every route is answered in memory: nothing here is generated or sent to a model.
test.use({ locale: 'zh-CN' });
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const primaries = page => page.locator('.btn-primary:visible');
const color = (page, value) => page.evaluate(v => { const el = document.createElement('div'); el.style.backgroundColor = v; document.body.append(el); const c = getComputedStyle(el).backgroundColor; el.remove(); return c; }, value);
const background = locator => locator.evaluate(el => getComputedStyle(el).backgroundColor);
const centerY = box => box.y + box.height / 2;

test('C11-3 / K2.1: the scene input shows only the title, one line, the input, three examples, "browse more" and "next"', async ({ page, context, baseURL }) => {
  await setupBrowser(page, context, baseURL);
  await page.goto('/'); const main = page.getByRole('main');
  await expect(main.getByRole('textbox', { name: sceneTitle, exact: true })).toBeVisible();
  const visible = main.locator('button:visible');
  await expect(visible).toHaveText(['家长会', 'Party', '其他场景', '浏览更多本地场景', '下一步']);
  await expect(main.getByRole('button', { name: '浏览更多本地场景', exact: true })).toHaveClass(/text-button/);
  await expect(primaries(page)).toHaveCount(1);
  // "My scenes" and "sign out" are one tap away in "more".
  for (const name of ['我的场景', '退出登录']) await expect(main.getByRole('button', { name, exact: true })).toHaveCount(0);
  const sheet = await openMore(page);
  for (const name of ['我的场景', '退出登录']) await expect(sheet.getByRole('button', { name, exact: true })).toBeVisible();
  await closeMore(page);
  expect(await noOverflow(page)).toBe(true);
});

test('C11-3 / K2.3: with an empty input the primary button looks disabled and a tap explains in place; typing turns it on', async ({ page, context, baseURL }) => {
  const state = await setupBrowser(page, context, baseURL);
  await page.goto('/'); const main = page.getByRole('main');
  const input = main.getByRole('textbox', { name: sceneTitle, exact: true });
  const next = page.getByTestId('action-bar').getByRole('button', { name: '下一步', exact: true });
  await expect(input).toHaveValue('');
  expect(await background(next)).toBe(await color(page, 'var(--surface-2)'));
  await next.click();
  await expect(main.getByRole('alert')).toHaveText('先简单说说你想准备的场景。');
  await expect(input).toBeFocused();
  await input.fill('我想在超市问东西放在哪里。');
  expect(await background(next)).toBe(await color(page, 'var(--primary)'));
  expect(state.writes).toEqual([]); expect(state.posts).toEqual([]);
});

test('C11-3 / F3.1: "browse more" opens the seed browser as a bottom sheet with one scrolling row of categories; picking closes it', async ({ page, context, baseURL }) => {
  const state = await setupBrowser(page, context, baseURL);
  await page.goto('/'); const main = page.getByRole('main');
  const toggle = main.getByRole('button', { name: '浏览更多本地场景', exact: true });
  await expect(toggle).toHaveAttribute('aria-haspopup', 'dialog');
  await toggle.click();
  const sheet = seedSheet(page);
  await expect(sheet).toBeVisible();
  expect(await sheet.evaluate(d => d.matches(':modal'))).toBe(true);
  const group = sheet.getByRole('group', { name: '场景类别', exact: true });
  const buttons = await group.getByRole('button').all();
  expect(buttons).toHaveLength(6);
  const firstBox = await buttons[0].boundingBox();
  for (const button of buttons) expect(Math.abs(centerY(await button.boundingBox()) - centerY(firstBox))).toBeLessThanOrEqual(2);
  expect(await group.evaluate(g => getComputedStyle(g).overflowX)).toBe('auto');
  await expect(page.locator('dialog [role="status"], dialog [role="alert"]')).toHaveCount(0);
  await sheet.getByRole('list', { name: '示例场景', exact: true }).getByRole('button').first().click();
  await expect(seedSheet(page)).toHaveCount(0);
  await expect(main.getByRole('textbox', { name: sceneTitle, exact: true })).not.toHaveValue('');
  await expect(main.getByRole('status').filter({ hasText: '已填入示例，可以修改后再继续。' })).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
  expect(state.writes).toEqual([]); expect(state.posts).toEqual([]);
});

test('C11-3 / K3: the keywords page shows three fields first and folds the other three into "add a little more (optional)"', async ({ page, context, baseURL }) => {
  await setupBrowser(page, context, baseURL);
  await page.goto('/'); const main = page.getByRole('main');
  await main.getByRole('textbox', { name: sceneTitle, exact: true }).fill('我想和邻居聊社区花园。');
  await main.getByRole('button', { name: '下一步', exact: true }).click();
  for (const label of keywordLabels.slice(0, 3)) {
    const field = main.getByRole('textbox', { name: label, exact: true });
    await expect(field).toBeVisible();
    const labelBox = await main.getByText(label, { exact: true }).boundingBox(), fieldBox = await field.boundingBox();
    expect(labelBox.y + labelBox.height).toBeLessThanOrEqual(fieldBox.y + 1);
  }
  for (const label of keywordLabels.slice(3)) await expect(main.getByRole('textbox', { name: label, exact: true })).toHaveCount(0);
  const more = main.getByTestId('keywords-more');
  await expect(more.locator('summary')).toHaveText('再补充一点（可选）');
  await openMoreKeywords(main);
  for (const label of keywordLabels.slice(3)) await expect(main.getByRole('textbox', { name: label, exact: true })).toBeVisible();
  await expect(primaries(page)).toHaveCount(1);
  await expect(primaries(page)).toHaveText('生成场景');
  expect(await actionButtons(page).count()).toBeLessThanOrEqual(2);
  expect(await noOverflow(page)).toBe(true);
});

test('C11-3 / K3: a saved later keyword opens the optional part by itself so nothing filled is hidden', async ({ page, context, baseURL }) => {
  const saved = requirement(1, '我想在酒店办理入住。');
  saved.content.keywords = { location: '', learnerRole: '', partnerRole: '', topic: '', goal: '', special: '希望慢一点' };
  await setupBrowser(page, context, baseURL, saved);
  await page.goto('/'); const main = page.getByRole('main');
  await main.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(main.getByRole('textbox', { name: keywordLabels[5], exact: true })).toHaveValue('希望慢一点');
  await expect(main.getByRole('textbox', { name: keywordLabels[5], exact: true })).toBeVisible();
});

test('C11-3 / F3.2: the confirm card shows keywords as two columns of chips, "you → partner" on one line, and the cost right above "确认生成"', async ({ page, context, baseURL }) => {
  await setupBrowser(page, context, baseURL);
  const main = await openBackground(page);
  await main.getByRole('button', { name: '生成场景', exact: true }).click();
  const card = main.getByRole('region', { name: '确认要生成的场景', exact: true });
  const chips = card.getByTestId('confirm-chip');
  await expect(chips).toHaveCount(6);
  const [a, b, c] = await Promise.all([0, 1, 2].map(async i => chips.nth(i).boundingBox()));
  expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(1);
  expect(b.x).toBeGreaterThan(a.x + a.width - 1);
  expect(c.y).toBeGreaterThan(a.y + a.height - 1);
  const you = await card.getByText('你：学生家长', { exact: true }).boundingBox(), partner = await card.getByText('对方：班主任', { exact: true }).boundingBox();
  expect(Math.abs(centerY(you) - centerY(partner))).toBeLessThanOrEqual(4);
  const cost = card.getByText('每次生成都会使用项目负责人的费用预算。', { exact: true });
  const length = card.getByText('课程长度：约50秒', { exact: true });
  const confirm = card.getByRole('button', { name: '确认生成', exact: true });
  const costBox = await cost.boundingBox(), lengthBox = await length.boundingBox(), confirmBox = await confirm.boundingBox();
  expect(costBox.y + costBox.height).toBeLessThanOrEqual(confirmBox.y + 1);
  expect(confirmBox.y - (costBox.y + costBox.height)).toBeLessThanOrEqual(24);
  expect(lengthBox.y + lengthBox.height).toBeLessThanOrEqual(costBox.y + 1);
  // On the first screen, never inside a sheet.
  expect(costBox.y + costBox.height).toBeLessThanOrEqual(page.viewportSize().height);
  await expect(page.locator('dialog').filter({ hasText: '每次生成都会使用项目负责人的费用预算。' })).toHaveCount(0);
  await expect(primaries(page)).toHaveCount(1);
  expect(await noOverflow(page)).toBe(true);
});

test('C11-3 / K4.1: while generating the page is one centred status with three stage dots and only "取消生成"', async ({ page, context, baseURL }) => {
  const record = requirement(), state = await setupBrowser(page, context, baseURL, record);
  state.views[`${ownerA}:1`] = generationView(record, 't68-progress', 'audio_ready');
  await page.goto('/?generation=1'); const main = page.getByRole('main');
  const status = main.getByRole('status').filter({ hasText: '声音已准备，等待组合。' });
  await expect(status).toBeVisible();
  const icon = main.getByTestId('generation-icon');
  await expect(icon).toBeVisible();
  const iconBox = await icon.boundingBox(), width = page.viewportSize().width;
  expect(Math.abs(iconBox.x + iconBox.width / 2 - width / 2)).toBeLessThanOrEqual(width > 700 ? 40 : 4);
  expect(iconBox.width).toBeCloseTo(64, 0);
  const stages = main.getByTestId('generation-stages');
  await expect(stages.getByRole('listitem')).toHaveText(['剧本', '配音', '画面']);
  await expect(stages.locator('[aria-current="step"]')).toHaveText('配音');
  await expect(primaries(page)).toHaveCount(0);
  await expect(main.getByRole('button', { name: '取消生成', exact: true })).toHaveClass(/text-button|btn-ghost/);
  expect(await noOverflow(page)).toBe(true);
  expect(state.posts).toEqual([]);
});

test('C11-3 / K4.1: a ready scene has "观看场景" as the primary, a failed read has "重新检查", a failed stage "返回修改"', async ({ page, context, baseURL }) => {
  const record = requirement(), state = await setupBrowser(page, context, baseURL, record);
  state.views[`${ownerA}:1`] = generationView(record, 't68-ready', 'ready', 3);
  await page.goto('/?generation=1'); const main = page.getByRole('main');
  await expect(primaries(page)).toHaveText('观看场景');
  state.views[`${ownerA}:1`] = generationView(record, 't68-failed', 'failed');
  await page.reload();
  await expect(main.getByText('场景准备遇到问题，可以返回修改。', { exact: true })).toBeVisible();
  await expect(primaries(page)).toHaveText('返回修改');
  state.generationReadStatus = 503;
  await page.reload();
  await expect(main.getByRole('alert')).toBeVisible();
  await expect(primaries(page)).toHaveText('重新检查');
  expect(state.posts).toEqual([]);
});

test('C11-3 / F14.1: stopping after a provider call asks in a bottom sheet; Esc keeps generating and returns focus', async ({ page, context, baseURL }) => {
  const record = requirement(), state = await setupBrowser(page, context, baseURL, record);
  state.views[`${ownerA}:1`] = generationView(record, 't68-task-a', 'script_ready');
  const cancels = [];
  await page.route('**/api/scene-generation/cancel*', route => { cancels.push(route.request().url()); return route.fulfill({ json: { ...state.views[`${ownerA}:1`], phase: 'stopped' } }); });
  await page.goto('/?generation=1'); const main = page.getByRole('main');
  const cancel = main.getByRole('button', { name: '取消生成', exact: true });
  await cancel.click();
  const sheet = page.locator('dialog[open][data-testid="stop-sheet"]');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('generation-stop-explain')).toContainText('无法撤回');
  await expect(sheet.getByRole('button', { name: '当前步骤后停止', exact: true })).toBeVisible();
  await expect(page.locator('dialog [role="status"], dialog [role="alert"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(cancel).toBeFocused();
  expect(cancels).toEqual([]); expect(state.posts).toEqual([]);
});

import { test, expect } from '@playwright/test';
import { openMore, closeMore } from '../fixtures/c10-shell.mjs';
import { setupBrowser, openBackground, scenario, sceneTitle, progressTitle, keywordKeys, keywordLabels, keywordValues } from '../fixtures/t68-generation-browser.mjs';

// C7 (user 2026-10-17: finish the product before real video). T30A: browse 36 local example scenes by category;
// picking one only fills the editable description and keywords. T14A: "生成场景" first shows what will be generated
// and nothing is saved or submitted until "确认生成". T31A: the trial-language notice stays on these pages in all five
// help languages. Requirements and generation are answered in memory by the T68 fixture; nothing calls a model.
test.use({ locale: 'zh-CN' });
const languages = ['zh-Hans', 'id', 'ja', 'ko', 'hi'];
const categories = ['家校', '工作', '诊所预约', '交通', '居家邻里', '饮食'];
const seeds = async () => (await import('../../lib/scene-seeds.ts')).sceneSeeds;
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function openSeeds(main, name = '浏览更多本地场景') {
  const toggle = main.getByRole('button', { name, exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

// ---- T30A: more local scenes to start from ----

test('T30A / F3.1: the seed browser is folded away until asked for, then lists six categories', async ({ page, context, baseURL }) => {
  await setupBrowser(page, context, baseURL);
  await page.goto('/'); const main = page.getByRole('main');
  await expect(main.getByRole('textbox', { name: sceneTitle, exact: true })).toBeVisible();
  await expect(main.getByRole('group', { name: '场景类别', exact: true })).toHaveCount(0);
  await openSeeds(main);
  const group = main.getByRole('group', { name: '场景类别', exact: true });
  for (const name of categories) await expect(group.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(group.getByRole('button')).toHaveCount(6);
  await expect(group.getByRole('button', { name: '家校', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(main.getByText('示例场景是合成内容，尚未经本地审核，可以随意修改。', { exact: true })).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
});

test('T30A / F4.1: each category shows its own seeds and only those', async ({ page, context, baseURL }) => {
  await setupBrowser(page, context, baseURL);
  const all = await seeds();
  await page.goto('/'); const main = page.getByRole('main');
  await openSeeds(main);
  const list = main.getByRole('list', { name: '示例场景', exact: true });
  const ids = ['school', 'work', 'clinic', 'transport', 'home', 'food'];
  for (const [index, name] of categories.entries()) {
    await main.getByRole('group', { name: '场景类别', exact: true }).getByRole('button', { name, exact: true }).click();
    await expect(main.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
    const expected = all.filter(seed => seed.category === ids[index]).map(seed => seed.text['zh-Hans'].label);
    await expect(list.getByRole('button')).toHaveText(expected);
  }
});

test('T30A / F4.2: picking a seed fills the editable description and all six keywords, and saves or generates nothing', async ({ page, context, baseURL }) => {
  const state = await setupBrowser(page, context, baseURL);
  const seed = (await seeds()).find(item => item.id === 'S14').text['zh-Hans'];
  await page.goto('/'); const main = page.getByRole('main');
  await openSeeds(main);
  await main.getByRole('group', { name: '场景类别', exact: true }).getByRole('button', { name: '工作', exact: true }).click();
  await main.getByRole('list', { name: '示例场景', exact: true }).getByRole('button', { name: seed.label, exact: true }).click();
  const input = main.getByRole('textbox', { name: sceneTitle, exact: true });
  await expect(input).toHaveValue(seed.description);
  await expect(input).toBeFocused();
  await expect(main.getByRole('status').filter({ hasText: '已填入示例，可以修改后再继续。' })).toBeVisible();
  await main.getByRole('button', { name: '下一步', exact: true }).click();
  for (const [index, key] of keywordKeys.entries()) await expect(main.getByRole('textbox', { name: keywordLabels[index], exact: true })).toHaveValue(seed.keywords[key]);
  expect(state.writes).toEqual([]); expect(state.posts).toEqual([]);
  await expect(page).toHaveURL(baseURL + '/');
  expect(state.external).toEqual([]);
});

test('T30A / F4.3: a picked seed stays editable and goes through the same confirm, save and generate flow', async ({ page, context, baseURL }) => {
  const state = await setupBrowser(page, context, baseURL);
  const seed = (await seeds()).find(item => item.id === 'S33').text['zh-Hans'];
  await page.goto('/'); const main = page.getByRole('main');
  await openSeeds(main);
  await main.getByRole('button', { name: '饮食', exact: true }).click();
  await main.getByRole('button', { name: seed.label, exact: true }).click();
  const input = main.getByRole('textbox', { name: sceneTitle, exact: true });
  const edited = seed.description + '我想点热的。';
  await input.fill(edited);
  await main.getByRole('button', { name: '下一步', exact: true }).click();
  await main.getByRole('textbox', { name: keywordLabels[5], exact: true }).fill('第一次去，希望慢一点');
  await main.getByRole('button', { name: '生成场景', exact: true }).click();
  await expect(main.getByText(edited, { exact: true })).toBeVisible();
  expect(state.writes).toEqual([]); expect(state.posts).toEqual([]);
  await main.getByRole('button', { name: '确认生成', exact: true }).click();
  await expect(main.getByRole('heading', { name: progressTitle, exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].body.content).toEqual({ description: edited, language: 'zh-Hans', keywords: { ...seed.keywords, special: '第一次去，希望慢一点' } });
  expect(state.posts).toEqual([{ owner: 't68-browser-owner-a', body: { requirementRevision: 1 } }]);
});

test('T30A / F12.1: picking another seed replaces the earlier pick; the plain examples still work', async ({ page, context, baseURL }) => {
  const state = await setupBrowser(page, context, baseURL);
  const all = await seeds();
  const first = all.find(item => item.id === 'S25').text['zh-Hans'], second = all.find(item => item.id === 'S30').text['zh-Hans'];
  await page.goto('/'); const main = page.getByRole('main');
  await openSeeds(main);
  await main.getByRole('button', { name: '交通', exact: true }).click();
  await main.getByRole('button', { name: first.label, exact: true }).click();
  // C11-3: picking closes the seed sheet; the second pick opens it again.
  await openSeeds(main);
  await main.getByRole('button', { name: '居家邻里', exact: true }).click();
  await main.getByRole('button', { name: second.label, exact: true }).click();
  await expect(main.getByRole('textbox', { name: sceneTitle, exact: true })).toHaveValue(second.description);
  await main.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(main.getByRole('textbox', { name: keywordLabels[0], exact: true })).toHaveValue(second.keywords.location);
  await main.getByRole('button', { name: '返回', exact: true }).click();
  await main.getByRole('group', { name: '场景示例', exact: true }).getByRole('button', { name: '家长会', exact: true }).click();
  await expect(main.getByRole('textbox', { name: sceneTitle, exact: true })).toHaveValue('我想和老师聊聊孩子最近在学校的情况。');
  expect(state.writes).toEqual([]); expect(state.posts).toEqual([]);
});

for (const language of languages) test(`T30A / T31A: ${language} seed browser shows its own language and keeps the trial-language notice`, async ({ page, context, baseURL }) => {
  const state = await setupBrowser(page, context, baseURL);
  const { sceneSeedCopy } = await import('../../app/scene-seed-copy.ts');
  const { entryCopy } = await import('../../app/entry-copy.ts');
  const copy = sceneSeedCopy[language], seed = (await seeds()).find(item => item.id === 'S21').text[language];
  await page.goto('/'); const main = page.getByRole('main');
  await openMore(page); await page.getByRole('combobox').selectOption(language); await closeMore(page);
  await openSeeds(main, copy.open);
  const group = main.getByRole('group', { name: copy.categoriesLabel, exact: true });
  await expect(group.getByRole('button')).toHaveCount(6);
  await group.getByRole('button', { name: copy.categories.clinic, exact: true }).click();
  await main.getByRole('list', { name: copy.listLabel, exact: true }).getByRole('button', { name: seed.label, exact: true }).click();
  await expect(main.locator('textarea')).toHaveValue(seed.description);
  // C11-3: picking closes the seed sheet; the note is read inside it again.
  await openSeeds(main, copy.open);
  await expect(main.getByText(copy.note, { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('footer').getByText(entryCopy[language].trial, { exact: true })).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
  expect(state.writes).toEqual([]); expect(state.posts).toEqual([]);
});

// ---- T14A: confirm before generating ----

test('T14A / F3.2: "生成场景" shows what will be generated and sends nothing yet', async ({ page, context, baseURL }) => {
  const state = await setupBrowser(page, context, baseURL);
  const main = await openBackground(page);
  await main.getByRole('button', { name: '生成场景', exact: true }).click();
  const card = main.getByRole('region', { name: '确认要生成的场景', exact: true });
  await expect(card.getByRole('heading', { name: '确认要生成的场景', exact: true })).toBeFocused();
  await expect(card.getByText(scenario, { exact: true })).toBeVisible();
  for (const [index, label] of keywordLabels.entries()) {
    await expect(card.getByText(label, { exact: true })).toBeVisible();
    await expect(card.getByText(keywordValues[index], { exact: true }).first()).toBeVisible();
  }
  await expect(card.getByText('你：学生家长', { exact: true })).toBeVisible();
  await expect(card.getByText('对方：班主任', { exact: true })).toBeVisible();
  await expect(card.getByText('课程长度：约50秒', { exact: true })).toBeVisible();
  await expect(card).toContainText('需要一些时间');
  await expect(card).toContainText('项目负责人的费用预算');
  await expect(card.getByRole('button', { name: '确认生成', exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: '再改改', exact: true })).toBeVisible();
  await expect(main.getByRole('textbox', { name: keywordLabels[0], exact: true })).toHaveCount(0);
  expect(state.writes).toEqual([]); expect(state.posts).toEqual([]);
  await expect(page).toHaveURL(baseURL + '/');
  expect(await noOverflow(page)).toBe(true);
});

test('T14A / F3.5: "再改改" returns to the keywords with every input kept and still sends nothing', async ({ page, context, baseURL }) => {
  const state = await setupBrowser(page, context, baseURL);
  const main = await openBackground(page);
  await main.getByRole('button', { name: '生成场景', exact: true }).click();
  await main.getByRole('button', { name: '再改改', exact: true }).click();
  await expect(main.getByRole('heading', { name: '再给几个关键词，让场景更贴近你', exact: true })).toBeFocused();
  for (const [index, label] of keywordLabels.entries()) await expect(main.getByRole('textbox', { name: label, exact: true })).toHaveValue(keywordValues[index]);
  await main.getByRole('textbox', { name: keywordLabels[2], exact: true }).fill('另一位老师');
  await main.getByRole('button', { name: '生成场景', exact: true }).click();
  await expect(main.getByText('对方：另一位老师', { exact: true })).toBeVisible();
  expect(state.writes).toEqual([]); expect(state.posts).toEqual([]);
});

test('T14A / F12.4: "确认生成" saves this exact version once and submits it once', async ({ page, context, baseURL }) => {
  const state = await setupBrowser(page, context, baseURL);
  const main = await openBackground(page);
  await main.getByRole('button', { name: '生成场景', exact: true }).click();
  await main.getByRole('button', { name: '确认生成', exact: true }).evaluate(button => { button.click(); button.click(); });
  await expect(main.getByRole('heading', { name: progressTitle, exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\?generation=1$/);
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].body.content).toEqual({ description: scenario, language: 'zh-Hans', keywords: Object.fromEntries(keywordKeys.map((key, index) => [key, keywordValues[index]])) });
  expect(state.posts).toEqual([{ owner: 't68-browser-owner-a', body: { requirementRevision: 1 } }]);
});

test('T14A / F3.4: with no keywords the card says so and leaves both roles to the scene', async ({ page, context, baseURL }) => {
  const state = await setupBrowser(page, context, baseURL);
  await page.goto('/'); const main = page.getByRole('main');
  await main.getByRole('textbox', { name: sceneTitle, exact: true }).fill(scenario);
  await main.getByRole('button', { name: '下一步', exact: true }).click();
  await main.getByRole('button', { name: '生成场景', exact: true }).click();
  const card = main.getByRole('region', { name: '确认要生成的场景', exact: true });
  await expect(card.getByText('没有填写关键词', { exact: true })).toBeVisible();
  await expect(card.getByText('你：未填写，按场景安排', { exact: true })).toBeVisible();
  await expect(card.getByText('对方：未填写，按场景安排', { exact: true })).toBeVisible();
  for (const label of keywordLabels) await expect(card.getByText(label, { exact: true })).toHaveCount(0);
  expect(state.writes).toEqual([]); expect(state.posts).toEqual([]);
});

test('T14A / F3.2: a failed save after confirming returns to the keywords with the inputs kept and no task', async ({ page, context, baseURL }) => {
  const state = await setupBrowser(page, context, baseURL); state.writeStatus = 503;
  const main = await openBackground(page);
  await main.getByRole('button', { name: '生成场景', exact: true }).click();
  await main.getByRole('button', { name: '确认生成', exact: true }).click();
  await expect(main.getByRole('alert')).toContainText('输入仍在');
  for (const [index, label] of keywordLabels.entries()) await expect(main.getByRole('textbox', { name: label, exact: true })).toHaveValue(keywordValues[index]);
  expect(state.posts).toEqual([]);
});

for (const language of languages) test(`T14A / T31A: ${language} confirmation card is in that language and keeps the trial-language notice`, async ({ page, context, baseURL }) => {
  const state = await setupBrowser(page, context, baseURL);
  const { sceneConfirmCopy } = await import('../../app/scene-confirm-copy.ts');
  const { sceneGenerationCopy } = await import('../../app/scene-generation-copy.ts');
  const { sceneEntryCopy } = await import('../../app/scene-entry-copy.ts');
  const { entryCopy } = await import('../../app/entry-copy.ts');
  const copy = sceneConfirmCopy[language];
  await page.goto('/'); const main = page.getByRole('main');
  await main.getByRole('textbox', { name: sceneTitle, exact: true }).fill(scenario);
  await openMore(page); await page.getByRole('combobox').selectOption(language); await closeMore(page);
  await main.getByRole('button', { name: sceneEntryCopy[language].next, exact: true }).click();
  await main.getByRole('button', { name: sceneGenerationCopy[language].generate, exact: true }).click();
  const card = main.getByRole('region', { name: copy.title, exact: true });
  await expect(card.getByText(copy.length, { exact: true })).toBeVisible();
  await expect(card.getByText(copy.cost, { exact: true })).toBeVisible();
  await expect(page.locator('footer').getByText(entryCopy[language].trial, { exact: true })).toBeVisible();
  expect(state.posts).toEqual([]);
  await card.getByRole('button', { name: copy.confirm, exact: true }).click();
  await expect(main.getByRole('heading', { name: sceneGenerationCopy[language].title, exact: true })).toBeVisible();
  expect(state.posts).toHaveLength(1);
});

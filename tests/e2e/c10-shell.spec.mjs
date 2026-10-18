import { test, expect } from '@playwright/test';
import { setupBrowser, openBackground, requirement, generationView, ownerA, sceneTitle } from '../fixtures/t68-generation-browser.mjs';
import { setupGuided, enterRole, enterTerms } from '../fixtures/t69-guided-browser.mjs';
import { setupLearning, openLibrary, openCourse, savedStatus, waitVideo } from '../fixtures/t70-learning-browser.mjs';
import { openMore, closeMore, moreButton, moreSheet } from '../fixtures/c10-shell.mjs';

// C10-1 / C10-2 (user 2026-10-18: "the whole front end is not good-looking and still not simple enough"):
// one set of colour and type tokens, five button levels with one primary button per view, a thin top bar with a
// "more" sheet (native <dialog>) holding the interface language, display switches and course notes, and a bottom
// action bar. Every route is answered in memory; nothing here calls a model or a video provider.
test.use({ locale: 'zh-CN' });
const slogan = '帮你融入新加坡，相信自己可以做到。';
const preferences = 'le-sg-entry-preferences-v1';
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const primaries = page => page.locator('.btn-primary:visible');
const phone = page => page.viewportSize().width <= 520;
async function goOffline(page, context) {
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
}
async function oneView(page, { exactlyOne = false } = {}) {
  if (exactlyOne) await expect(primaries(page)).toHaveCount(1);
  else expect(await primaries(page).count()).toBeLessThanOrEqual(1);
  expect(await noOverflow(page)).toBe(true);
}
// Every visible control is a usable touch target; buttons of the new system are 48px high, icon buttons are
// 44px with a name, and text fields use at least 16px so a phone does not zoom in.
async function touchTargets(page) {
  const report = await page.evaluate(() => {
    const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden'; };
    const problems = [];
    for (const el of document.querySelectorAll('button, a[href], summary, select')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect(), name = el.getAttribute('aria-label') || el.textContent.trim();
      if (r.height < 44 - 0.5 || r.width < 44 - 0.5) problems.push(`small target: ${name} ${r.width}x${r.height}`);
      if (el.classList.contains('btn') && r.height < 48 - 0.5) problems.push(`button under 48px: ${name} ${r.height}`);
      if (el.classList.contains('icon-btn') && !(el.getAttribute('aria-label') || '').trim()) problems.push('icon button without aria-label');
    }
    for (const el of document.querySelectorAll('input[type="text"], input:not([type]), textarea, select')) {
      if (!visible(el)) continue;
      if (parseFloat(getComputedStyle(el).fontSize) < 16) problems.push(`small text field: ${el.outerHTML.slice(0, 60)}`);
    }
    return problems;
  });
  expect(report).toEqual([]);
}

// ---- C10-1: tokens, type and buttons ----

test('C10-1 / F13.1: colour tokens exist on :root and the old variable names still resolve to the same colours', async ({ page, context, baseURL }) => {
  await setupBrowser(page, context, baseURL);
  await page.goto('/');
  await expect(page.getByRole('main').getByRole('textbox', { name: sceneTitle, exact: true })).toBeVisible();
  const tokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(['--bg', '--surface', '--surface-2', '--ink', '--text', '--muted', '--line', '--line-strong', '--primary', '--primary-hover', '--on-primary',
      '--primary-soft', '--on-primary-soft', '--accent-warm', '--success', '--success-soft', '--warning', '--warning-soft', '--danger', '--danger-soft', '--overlay'].map(name => [name, style.getPropertyValue(name).trim()]));
  });
  for (const [name, value] of Object.entries(tokens)) expect(value, name).not.toBe('');
  const resolved = await page.evaluate(() => {
    const probe = value => { const el = document.createElement('div'); el.style.color = value; document.body.append(el); const color = getComputedStyle(el).color; el.remove(); return color; };
    return { accent: probe('var(--accent)'), primary: probe('var(--primary)'), background: probe('var(--background)'), bg: probe('var(--bg)') };
  });
  expect(resolved.accent).toBe(resolved.primary);
  expect(resolved.background).toBe(resolved.bg);
});

test('C10-1 / F13.1: the scene input page has a 22px title, 16px side margins on a phone, usable targets and one primary button', async ({ page, context, baseURL }) => {
  await setupBrowser(page, context, baseURL);
  await page.goto('/');
  const main = page.getByRole('main');
  const title = main.getByRole('heading', { name: sceneTitle, exact: true });
  await expect(title).toBeVisible();
  expect(await title.evaluate(h => parseFloat(getComputedStyle(h).fontSize))).toBeCloseTo(22, 0);
  if (phone(page)) expect((await title.boundingBox()).x).toBeCloseTo(16, 0);
  await oneView(page, { exactlyOne: true });
  await expect(primaries(page)).toHaveText('下一步');
  await expect(page.getByTestId('action-bar').getByRole('button', { name: '下一步', exact: true })).toBeVisible();
  await touchTargets(page);
  // Cards are separated by colour only: no shadows on content cards and no card inside a card.
  expect(await page.evaluate(() => [...document.querySelectorAll('main .scene-card, main .card')].filter(el => getComputedStyle(el).boxShadow !== 'none').length)).toBe(0);
  expect(await page.locator('main .scene-card .scene-card, main .card .card').count()).toBe(0);
});

test('C10-1: keyboard focus shows a visible ring and reduced motion removes the press scale', async ({ page, context, baseURL }) => {
  await setupBrowser(page, context, baseURL);
  await page.goto('/');
  const main = page.getByRole('main');
  await expect(main.getByRole('textbox', { name: sceneTitle, exact: true })).toBeVisible();
  await page.keyboard.press('Tab');
  const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return { tag: document.activeElement.tagName, style: s.outlineStyle, width: parseFloat(s.outlineWidth) }; });
  expect(ring.tag).not.toBe('BODY');
  expect(ring.style).not.toBe('none');
  expect(ring.width).toBeGreaterThanOrEqual(2);
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ language: 'zh-Hans', largeText: false, reducedMotion: true })), preferences);
  await page.reload();
  const next = main.getByRole('button', { name: '下一步', exact: true });
  await expect(next).toBeVisible();
  await next.hover(); await page.mouse.down();
  expect(await next.evaluate(b => getComputedStyle(b).transform)).toBe('none');
  await page.mouse.up();
});

// ---- C10-2: top bar, more sheet, bottom action bar ----

test('C10-2 / F13.3: the scene input page keeps the brand in a thin top bar; language and display live in "more"', async ({ page, context, baseURL }) => {
  await setupBrowser(page, context, baseURL);
  await page.goto('/');
  await expect(page.getByRole('main').getByRole('textbox', { name: sceneTitle, exact: true })).toBeVisible();
  const bar = page.getByTestId('app-bar');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('Learning English');
  await expect(bar.getByText(slogan, { exact: true })).toBeVisible();
  expect(['sticky', 'fixed']).toContain(await bar.evaluate(el => getComputedStyle(el).position));
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: '大字号', exact: true })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: '减少动画', exact: true })).toHaveCount(0);
  // One small line stays at the foot of the first page; the respect statement moved into "more".
  await expect(page.locator('footer')).toBeVisible();
  await expect(page.locator('footer details')).toHaveCount(0);
  const sheet = await openMore(page);
  await expect(sheet.getByRole('combobox')).toBeVisible();
  await expect(sheet.getByRole('checkbox', { name: '大字号', exact: true })).toBeVisible();
  await expect(sheet.getByRole('checkbox', { name: '减少动画', exact: true })).toBeVisible();
  await expect(sheet).toContainText('尊重');
  await touchTargets(page);
});

test('C10-2: "more" is a modal dialog with the right ARIA, closes on Esc or the backdrop and returns focus to ⋯', async ({ page, context, baseURL }) => {
  await setupBrowser(page, context, baseURL);
  await page.goto('/');
  await expect(page.getByRole('main').getByRole('textbox', { name: sceneTitle, exact: true })).toBeVisible();
  const button = moreButton(page);
  await expect(button).toHaveAccessibleName('更多');
  await expect(button).toHaveAttribute('aria-haspopup', 'dialog');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  const bar = (await page.getByTestId('app-bar').boundingBox());
  expect(bar.height).toBeGreaterThanOrEqual(56 - 0.5); expect(bar.height).toBeLessThanOrEqual(64);
  const sheet = await openMore(page);
  expect(await sheet.evaluate(d => d.tagName === 'DIALOG' && d.matches(':modal'))).toBe(true);
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(moreSheet(page)).toHaveCount(0);
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await openMore(page);
  await page.mouse.click(4, 4);
  await expect(moreSheet(page)).toHaveCount(0);
  await expect(button).toBeFocused();
  // Status and alert messages never live inside a sheet.
  await openMore(page);
  await expect(page.locator('dialog [role="status"], dialog [role="alert"]')).toHaveCount(0);
});

test('C10-2 / F13.2, F13.3: language, large text and reduced motion change at once from "more" and are kept after a reload', async ({ page, context, baseURL }) => {
  await setupBrowser(page, context, baseURL);
  await page.goto('/');
  const main = page.getByRole('main');
  await expect(main.getByRole('textbox', { name: sceneTitle, exact: true })).toBeVisible();
  const shell = page.locator('.app-shell');
  const sheet = await openMore(page);
  await sheet.getByRole('checkbox', { name: '大字号', exact: true }).check();
  await expect(shell).toHaveAttribute('data-large-text', 'true');
  await sheet.getByRole('checkbox', { name: '减少动画', exact: true }).check();
  await expect(shell).toHaveAttribute('data-reduced-motion', 'true');
  await sheet.getByRole('combobox').selectOption('ko');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(main.getByRole('heading', { name: '어떤 상황에서 영어를 배우고 싶으세요?', exact: true })).toBeVisible();
  expect(JSON.parse(await page.evaluate(key => localStorage.getItem(key), preferences))).toEqual({ language: 'ko', largeText: true, reducedMotion: true });
  await closeMore(page);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(shell).toHaveAttribute('data-large-text', 'true');
  await expect(shell).toHaveAttribute('data-reduced-motion', 'true');
  const again = await openMore(page);
  await expect(again.getByRole('combobox')).toHaveValue('ko');
  await expect(again.getByRole('checkbox')).toHaveCount(2);
  for (const box of await again.getByRole('checkbox').all()) await expect(box).toBeChecked();
  expect(await noOverflow(page)).toBe(true);
});

test('C10-2 / F11.3: the offline notice stays on the page, never inside a sheet', async ({ page, context, baseURL }) => {
  await setupBrowser(page, context, baseURL);
  await page.goto('/');
  const main = page.getByRole('main');
  await expect(main.getByRole('textbox', { name: sceneTitle, exact: true })).toBeVisible();
  await goOffline(page, context);
  await expect(main.getByTestId('offline-banner')).toBeVisible();
  await openMore(page);
  await expect(page.locator('dialog [data-testid="offline-banner"]')).toHaveCount(0);
  await expect(main.getByTestId('offline-banner')).toContainText('网络断开');
});

test('C10-2: the keywords page puts one primary in the bottom bar and the bar never hides the last control', async ({ page, context, baseURL }) => {
  await setupBrowser(page, context, baseURL);
  const main = await openBackground(page);
  const bar = page.getByTestId('action-bar');
  await expect(bar.getByRole('button', { name: '生成场景', exact: true })).toBeVisible();
  await expect(bar.getByRole('button', { name: '生成场景', exact: true })).toHaveClass(/btn-primary/);
  await oneView(page, { exactlyOne: true });
  await touchTargets(page);
  expect(await bar.evaluate(el => getComputedStyle(el).position)).toMatch(/fixed|sticky/);
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom))).toBeGreaterThanOrEqual(80);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const back = main.getByRole('button', { name: '返回', exact: true });
  const [backBox, barBox] = [await back.boundingBox(), await bar.boundingBox()];
  expect(backBox.y + backBox.height).toBeLessThanOrEqual(barBox.y + 1);
});

test('C10-2 / F12.4: on the confirmation page the cost note stays visible right above the confirm button', async ({ page, context, baseURL }) => {
  await setupBrowser(page, context, baseURL);
  const main = await openBackground(page);
  await main.getByRole('button', { name: '生成场景', exact: true }).click();
  const card = main.getByRole('region', { name: '确认要生成的场景', exact: true });
  const confirm = card.getByRole('button', { name: '确认生成', exact: true });
  await expect(confirm).toHaveClass(/btn-primary/);
  const cost = card.getByText(/项目负责人的费用预算/);
  await expect(cost).toBeVisible(); await expect(cost).toBeInViewport(); await expect(confirm).toBeInViewport();
  const [costBox, confirmBox] = [await cost.boundingBox(), await confirm.boundingBox()];
  expect(costBox.y + costBox.height).toBeLessThanOrEqual(confirmBox.y + 1);
  expect(confirmBox.y - (costBox.y + costBox.height)).toBeLessThanOrEqual(48);
  await expect(page.locator('dialog').getByText(/项目负责人的费用预算/)).toHaveCount(0);
  await oneView(page, { exactlyOne: true });
});

test('C10-1: login, library and generation pages each show at most one primary button and fit a small phone', async ({ page, context, baseURL }) => {
  const record = requirement();
  const state = await setupBrowser(page, context, baseURL, record);
  state.views[`${ownerA}:1`] = generationView(record, 't68-task-a', 'ready', 1);
  await page.goto('/?generation=1');
  const main = page.getByRole('main');
  await expect(main.getByRole('button', { name: '观看场景', exact: true })).toBeVisible();
  await oneView(page, { exactlyOne: true });
  await touchTargets(page);
  await page.goto('/');
  await main.getByRole('button', { name: '我的场景', exact: true }).click();
  await expect(main.getByRole('heading', { name: '我的场景', exact: true })).toBeVisible();
  await oneView(page);
  state.authenticated = false;
  await page.goto('/');
  await expect(main.getByRole('heading', { name: '选择登录方式', exact: true })).toBeVisible();
  await expect(page.getByTestId('app-bar')).toBeVisible();
  await oneView(page);
  await touchTargets(page);
  // Before signing in the interface language is still one tap away.
  const sheet = await openMore(page);
  await expect(sheet.getByRole('combobox')).toBeVisible();
});

// ---- C10-2 on the course pages: back, short status line, notes in "more" ----

test('C10-2 / F13.3: course pages use the thin bar with back and ⋯, keep the brand off, and put the course notes in "more"', async ({ page, context, baseURL }) => {
  const { main } = await setupGuided(page, context, baseURL);
  await expect(main.getByRole('heading', { name: '看一遍这个场景', exact: true })).toBeVisible();
  const bar = main.getByTestId('app-bar');
  await expect(bar).toBeVisible();
  await expect(bar.getByTestId('scene-back')).toBeVisible();
  await expect(bar.getByTestId('scene-back')).toHaveAccessibleName('返回生成任务');
  await expect(page.getByText(slogan, { exact: true })).toHaveCount(0);
  await expect(main.getByText(/非5–8分钟完整课程/)).toBeHidden();
  const sheet = await openMore(main);
  await expect(sheet.getByText(/非5–8分钟完整课程/)).toBeVisible();
  await expect(sheet.getByRole('combobox')).toBeVisible();
  await closeMore(main);
  expect(await main.getByRole('heading', { name: '看一遍这个场景', exact: true }).evaluate(h => parseFloat(getComputedStyle(h).fontSize))).toBeCloseTo(22, 0);
  await oneView(page, { exactlyOne: true });
  await touchTargets(page);
  await enterRole(main);
  await expect(main.getByRole('heading', { name: '现在轮到你', exact: true })).toBeVisible();
  await expect(page.getByTestId('action-bar').getByRole('button', { name: '开始学词组', exact: true })).toHaveClass(/btn-primary/);
  await oneView(page, { exactlyOne: true });
});

test('C10-2: learning pages keep one primary and one text button in the bottom bar; "watch again" moves into "more"', async ({ page, context, baseURL }) => {
  const { main } = await setupGuided(page, context, baseURL);
  await enterTerms(main);
  const bar = page.getByTestId('action-bar');
  await expect(bar.getByRole('button', { name: '下一步：句子', exact: true })).toHaveClass(/btn-primary/);
  await expect(bar.getByRole('button', { name: '返回角色说明', exact: true })).toBeVisible();
  expect(await bar.getByRole('button').count()).toBeLessThanOrEqual(2);
  await expect(main.getByRole('button', { name: '重看场景', exact: true })).toHaveCount(0);
  await oneView(page, { exactlyOne: true });
  for (const next of ['下一步：句子', '下一步：提示接话']) {
    await main.getByRole('button', { name: next, exact: true }).click();
    await oneView(page, { exactlyOne: true });
    expect(await bar.getByRole('button').count()).toBeLessThanOrEqual(2);
  }
  const sheet = await openMore(main);
  await sheet.getByRole('button', { name: '重看场景', exact: true }).click();
  await expect(main.getByRole('heading', { name: '看一遍这个场景', exact: true })).toBeVisible();
});

test('C10-2 / F11.1: saving shows as a thin line; only a failure shows a one-line banner with "retry"', async ({ page, context, baseURL }) => {
  const { state, main } = await setupLearning(page, context, baseURL);
  await openLibrary(page); await openCourse(main); await waitVideo(main);
  await expect(main.getByTestId('progress-line')).toBeVisible();
  await expect(main.getByTestId('progress-banner')).toHaveCount(0);
  await expect(savedStatus(main)).not.toBeEmpty();
  await expect(main.getByRole('button', { name: '重试读取', exact: true })).toHaveCount(0);
  state.progressReadStatus = 503;
  await main.getByTestId('scene-back').click();
  await openCourse(main);
  const banner = main.getByTestId('progress-banner');
  await expect(banner).toBeVisible();
  await expect(banner.getByRole('button', { name: '重试读取', exact: true })).toBeVisible();
  await expect(banner).toContainText('学习位置暂时无法读取');
  await expect(page.locator('dialog [data-testid="scene-progress-status"]')).toHaveCount(0);
});

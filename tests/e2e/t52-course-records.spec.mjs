import { test, expect } from '@playwright/test';
import { createPrivateSceneStore } from '../../lib/private-scene-store.ts';
import { handlePrivateDemo } from '../../app/api/private-demo/route.ts';
import { sealGoogleSession, GOOGLE_SESSION_COOKIE } from '../../lib/google-auth.ts';

// Real route + real in-memory store, synthetic signed identities, no external service.
async function backend(page) {
  const secret = 't52-synthetic-secret-at-least-thirty-two-characters';
  const epoch = Date.UTC(2030, 0, 1);
  const store = createPrivateSceneStore({ sessionSecret: secret });
  const cookies = {};
  for (const id of ['a', 'b']) cookies[id] = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: `synthetic-${id}`, email: 'synthetic@example.test' }, secret, epoch);
  const state = { account: 'a', status: 0, sent: [], held: null, heldRequest: null, delayGet: false, oversize: false };
  const call = (account, method, body, query = '') => handlePrivateDemo(new Request(`http://localhost/api/private-demo${query}`, {
    method, headers: { 'content-type': 'application/json', ...(account ? { cookie: `${GOOGLE_SESSION_COOKIE}=${cookies[account]}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), { store, now: epoch + 1000 });
  await page.route('**/api/auth/session', route => route.fulfill({ json: { authenticated: !!state.account, accountKey: state.account } }));
  await page.route('**/api/private-demo**', async route => {
    const method = route.request().method();
    const body = method === 'GET' ? undefined : route.request().postDataJSON();
    state.sent.push({ method, body });
    if (state.status) return route.fulfill({ status: state.status, json: { error: 'temporarily_unavailable' } });
    const oversizedBody = state.oversize && method === 'POST' ? { ...body, padding: '合成'.repeat(2200) } : body;
    if (oversizedBody !== body) expect(Buffer.byteLength(JSON.stringify(oversizedBody), 'utf8')).toBeGreaterThan(4096);
    const response = await call(state.account, method, oversizedBody, new URL(route.request().url()).search);
    if (oversizedBody !== body) expect(response.status).toBe(400);
    const payload = { status: response.status, contentType: 'application/json', body: await response.text() };
    if (state.delayGet && method === 'GET') {
      state.delayGet = false;
      state.heldRequest = route.request();
      await new Promise(resolve => { state.held = resolve; });
    }
    await route.fulfill(payload);
  });
  return { state, call };
}

async function open(page, fresh = true) {
  if (fresh) {
    await page.goto('/demo');
    await page.getByRole('button', { name: /^简体中文/ }).click();
  }
  await page.getByRole('button', { name: '合成课程演示', exact: true }).click();
  const panel = page.getByRole('region', { name: '合成课程临时记录', exact: true });
  await expect(panel).toBeVisible();
  return panel;
}
const button = (panel, name) => panel.getByRole('button', { name, exact: true });
async function controls(page) {
  const panel = page.getByRole('region', { name: '听练操作（无真实音视频）', exact: true });
  if (!await panel.count()) await button(page, '打开听练操作').click();
  return panel;
}

test('T52: explicit save restores the same course, sentence and practice mode after refresh', async ({ page }) => {
  const { state, call } = await backend(page);
  let panel = await open(page);
  await page.getByLabel('选择固定样本', { exact: true }).selectOption('food-order');
  const player = await controls(page);
  await button(player, '开始示范（无声音）').click();
  await button(player, '模拟本句结束').click();
  await button(panel, '保存当前课程与位置').click();
  await expect(panel).toContainText('已保存');
  let records = (await (await call('a', 'GET')).json()).records;
  expect(records).toHaveLength(1);
  expect(records[0].lesson.lesson_revision).toBe('food-order/zh-Hans/v1');
  expect(records[0].lessonProgress).toMatchObject({ sentence_id: 'food-order-2', mode: 'listen' });
  expect(JSON.stringify(state.sent)).not.toMatch(/ownerId|providerSubject|accountKey/);
  await page.reload();
  panel = await open(page, false);
  await button(panel, '恢复这条课程').click();
  await expect(page.getByTestId('current-course-sentence')).toHaveText('Could I have this, less spicy?');
  await expect(page.getByLabel('选择固定样本', { exact: true })).toHaveValue('food-order');
  await expect(button(await controls(page), '模拟本句结束')).toBeDisabled();
  await expect(panel).toContainText('服务重启后可能消失');
  await button(await controls(page), '切换对练演示').click();
  await button(panel, '保存当前课程与位置').click();
  await expect.poll(async () => (await (await call('a', 'GET')).json()).records[0].lessonProgress.mode).toBe('practice');
  records = (await (await call('a', 'GET')).json()).records;
  expect(records).toHaveLength(1);
  await page.reload();
  panel = await open(page, false);
  await button(panel, '恢复这条课程').click();
  await expect(button(await controls(page), '只看示范')).toBeVisible();
  await expect(page.getByTestId('current-course-speaker')).toHaveText('Food seller');
});

for (const action of ['删除这条课程', '撤销这条课程']) test(`T52: ${action} removes the record on the server and after reload`, async ({ page }) => {
  const { call } = await backend(page);
  let panel = await open(page);
  await button(panel, '保存当前课程与位置').click();
  await expect(button(panel, '恢复这条课程')).toHaveCount(1);
  await button(panel, action).click();
  await expect(button(panel, '恢复这条课程')).toHaveCount(0);
  expect((await (await call('a', 'GET')).json()).records).toEqual([]);
  await page.reload();
  panel = await open(page, false);
  await expect(button(panel, '恢复这条课程')).toHaveCount(0);
});

test('T52: anonymous learner is told to log in and makes no private request', async ({ page }) => {
  const { state } = await backend(page);
  state.account = null;
  const panel = await open(page);
  await expect(panel).toContainText('登录 Google 后才能保存');
  await expect(button(panel, '保存当前课程与位置')).toHaveCount(0);
  expect(state.sent).toEqual([]);
});

test('T52: failed writes and 4KB rejection never claim saved or lose current lesson', async ({ page }) => {
  const { state, call } = await backend(page);
  const panel = await open(page);
  for (const [status, message] of [[503, '暂时无法保存'], [0, '4KB']]) {
    state.status = status;
    state.oversize = status === 0;
    await button(panel, '保存当前课程与位置').click();
    await expect(panel.getByRole('status')).toContainText(message);
    await expect(panel).not.toContainText('已保存');
    await expect(page.getByTestId('course-line').first()).toContainText('Hello. Is this your first time?');
    expect((await (await call('a', 'GET')).json()).records).toEqual([]);
  }
  state.status = 0;
  state.oversize = false;
  await button(panel, '保存当前课程与位置').click();
  await expect(panel).toContainText('已保存');
});

test('T52: switching accounts rejects a late old-account list and expired writes clear private records', async ({ page }) => {
  const { state, call } = await backend(page);
  let panel = await open(page);
  await button(panel, '保存当前课程与位置').click();
  await expect(button(panel, '恢复这条课程')).toHaveCount(1);
  const oldId = (await (await call('a', 'GET')).json()).records[0].id;
  state.delayGet = true;
  await page.reload();
  panel = await open(page, false);
  await expect.poll(() => !!state.held).toBe(true);
  // Observe the exact old request before triggering the identity change.
  // A correct implementation may either ignore its result or abort it safely.
  const settled = new Promise(resolve => {
    const finish = request => {
      if (request !== state.heldRequest) return;
      page.off('requestfinished', finish);
      page.off('requestfailed', fail);
      resolve({ request, failed: false });
    };
    const fail = request => {
      if (request !== state.heldRequest) return;
      page.off('requestfinished', finish);
      page.off('requestfailed', fail);
      resolve({ request, failed: true });
    };
    page.on('requestfinished', finish);
    page.on('requestfailed', fail);
  });
  state.account = 'b';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => page.evaluate(() => localStorage.getItem('le-sg-account-mode-v1'))).toBe('b');
  state.held();
  const result = await settled;
  if (result.failed) expect(result.request.failure()?.errorText).toBe('net::ERR_ABORTED');
  else expect((await (await result.request.response()).json()).records.some(record => record.id === oldId)).toBe(true);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  // User reopens if the identity boundary closed the synthetic preview.
  if (!await panel.count()) panel = await open(page, false);
  await expect(button(panel, '恢复这条课程')).toHaveCount(0);
  await button(panel, '保存当前课程与位置').click();
  await expect(button(panel, '恢复这条课程')).toHaveCount(1);
  expect((await (await call('a', 'GET')).json()).records).toHaveLength(1);
  expect((await (await call('b', 'GET')).json()).records).toHaveLength(1);
  state.account = null;
  await button(panel, '保存当前课程与位置').click();
  await expect(page.getByRole('main')).toContainText('登录已失效');
  await expect(button(page, '恢复这条课程')).toHaveCount(0);
  await expect(button(page, '保存当前课程与位置')).toHaveCount(0);
});

test('T52: saving a different course creates a separate record and each restores its own material', async ({ page }) => {
  const { call } = await backend(page);
  const panel = await open(page);
  await button(panel, '保存当前课程与位置').click();
  await expect(button(panel, '恢复这条课程')).toHaveCount(1);
  await page.getByLabel('选择固定样本', { exact: true }).selectOption('food-order');
  await button(panel, '保存当前课程与位置').click();
  await expect(button(panel, '恢复这条课程')).toHaveCount(2);
  const records = (await (await call('a', 'GET')).json()).records;
  expect(records.map(record => record.lesson.lesson_revision).sort()).toEqual(['food-order/zh-Hans/v1', 'sideline/zh-Hans/v1']);
  const restored = new Set();
  for (let index = 0; index < 2; index++) {
    await button(panel, '恢复这条课程').nth(index).click();
    restored.add(await page.getByTestId('current-course-sentence').innerText());
  }
  expect([...restored].sort()).toEqual(['Hello. Is this your first time?', 'Hello. What would you like?']);
});

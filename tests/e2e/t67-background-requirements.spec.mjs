import { test, expect } from '@playwright/test';

const title = '你想在哪个场景下学习英语？';
const description = '我想在社区花园和邻居聊种菜，问清周末活动的时间。';
const keys = ['location', 'learnerRole', 'partnerRole', 'topic', 'goal', 'special'];
const labels = ['在哪里？', '你在场景里是谁？', '你要和谁说话？', '主要想聊什么？', '希望达到什么结果？', '有什么特别情况？'];
const values = ['社区花园', '新搬来的邻居', '花园志愿者', '种菜和周末活动', '问清时间并认识对方', '第一次见面，希望慢一点'];
const blankKeywords = () => Object.fromEntries(keys.map(key => [key, '']));
const snapshot = (text = description, revision = 1) => ({ revision, content: { description: text, language: 'zh-Hans', keywords: { ...blankKeywords(), location: '社区花园' } } });

test.use({ locale: 'zh-CN' });
test.beforeEach(async ({ context, baseURL }) => {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL).origin) throw new Error('T67 must not contact external services.');
    if (url.pathname.startsWith('/api/generation') && route.request().method() !== 'GET') throw new Error('Saving T67 requirements must not create a generation task.');
    return route.continue();
  });
});

async function api(page, context, initial = {}) {
  const state = { owner: 't67-browser-owner-a', authenticated: true, records: structuredClone(initial), writes: [], reads: [], readStatus: 200, writeStatus: 200, loseNextWriteResponse: false, readGates: {}, writeGates: {} };
  await page.route('**/api/auth/session', route => route.fulfill({ json: { authenticated: state.authenticated, accountKey: state.authenticated ? state.owner : null } }));
  await context.route('**/api/scene-requirements*', async route => {
    const owner = state.owner;
    if (!state.authenticated) return route.fulfill({ status: 401, json: { error: 'unauthenticated' } });
    if (route.request().method() === 'GET') {
      state.reads.push(owner);
      const record = structuredClone(state.records[owner] ?? null);
      if (state.readGates[owner]) await state.readGates[owner];
      if (state.readStatus !== 200) return route.fulfill({ status: state.readStatus, json: { error: 'temporarily_unavailable' } });
      return route.fulfill({ json: { requirement: record } });
    }
    expect(route.request().method()).toBe('PUT');
    const body = route.request().postDataJSON(); state.writes.push({ owner, body });
    if (state.writeStatus !== 200) return route.fulfill({ status: state.writeStatus, json: { error: state.writeStatus === 409 ? 'conflict' : 'temporarily_unavailable' } });
    const current = state.records[owner];
    if (current && JSON.stringify(current.content) === JSON.stringify(body.content)) return route.fulfill({ json: { requirement: current } });
    if (body.expectedRevision !== (current?.revision ?? 0)) return route.fulfill({ status: 409, json: { error: 'conflict' } });
    const saved = { revision: (current?.revision ?? 0) + 1, content: body.content }; state.records[owner] = saved;
    if (state.writeGates[owner]) await state.writeGates[owner];
    if (state.loseNextWriteResponse) { state.loseNextWriteResponse = false; return route.abort('failed'); }
    return route.fulfill({ json: { requirement: saved } });
  });
  return state;
}

async function background(page, text = description) {
  await page.goto('/');
  const main = page.getByRole('main');
  const input = main.getByRole('textbox', { name: title, exact: true });
  await expect(input).toBeVisible();
  await input.fill(text);
  await main.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(main.getByRole('textbox', { name: labels[0], exact: true })).toBeVisible();
  return main;
}

async function fillAll(main, data = values) {
  for (let index = 0; index < labels.length; index++) await main.getByRole('textbox', { name: labels[index], exact: true }).fill(data[index]);
}

function firstRequestSettlement(page, method) {
  let target, finish;
  const settled = new Promise(resolve => { finish = resolve; });
  const started = request => {
    if (!target && request.method() === method && new URL(request.url()).pathname === '/api/scene-requirements') target = request;
  };
  const ended = request => { if (request === target) finish(); };
  page.on('request', started); page.on('requestfinished', ended); page.on('requestfailed', ended);
  return { settled, dispose() { page.off('request', started); page.off('requestfinished', ended); page.off('requestfailed', ended); } };
}

async function renderAfterNetwork(page, observed) {
  await observed.settled;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

test('T67 / K3.1: six optional keyword inputs have short examples and can all be left blank', async ({ page, context }) => {
  const state = await api(page, context);
  const main = await background(page);
  await expect(main.getByRole('textbox')).toHaveCount(6);
  for (const label of labels) {
    const input = main.getByRole('textbox', { name: label, exact: true });
    await expect(input).toHaveValue('');
    expect((await input.getAttribute('placeholder'))?.trim().length).toBeGreaterThan(0);
  }
  await main.getByRole('button', { name: '保存需求', exact: true }).click();
  await expect(main.getByText('需求已保存。', { exact: true })).toBeVisible();
  expect(state.records[state.owner]).toEqual({ revision: 1, content: { description, language: 'zh-Hans', keywords: blankKeywords() } });
});

test('T67 / K3.2: all six backgrounds and the original description are sent in one versioned snapshot', async ({ page, context }) => {
  const state = await api(page, context);
  const main = await background(page); await fillAll(main);
  await main.getByRole('button', { name: '保存需求', exact: true }).click();
  await expect(main.getByText('需求已保存。', { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].body).toEqual({ expectedRevision: 0, content: { description, language: 'zh-Hans', keywords: Object.fromEntries(keys.map((key, index) => [key, values[index]])) } });
  await main.getByRole('textbox', { name: labels[1], exact: true }).fill('活动志愿者');
  await main.getByRole('button', { name: '保存需求', exact: true }).click();
  await expect.poll(() => state.records[state.owner].revision).toBe(2);
  expect(state.writes[1].body.expectedRevision).toBe(1);
  expect(state.records[state.owner].content.keywords).toEqual({ ...state.writes[0].body.content.keywords, learnerRole: '活动志愿者' });
});

test('T67 / K3.3: returning to edit the description preserves background keywords before save', async ({ page, context }) => {
  const state = await api(page, context);
  const main = await background(page); await fillAll(main);
  await main.getByRole('button', { name: '返回', exact: true }).click();
  const changed = '我要在社区运动会和另一位家长聊天。';
  await main.getByRole('textbox', { name: title, exact: true }).fill(changed);
  await main.getByRole('button', { name: '下一步', exact: true }).click();
  for (let index = 0; index < labels.length; index++) await expect(main.getByRole('textbox', { name: labels[index], exact: true })).toHaveValue(values[index]);
  await main.getByRole('button', { name: '保存需求', exact: true }).click();
  await expect.poll(() => state.records[state.owner]?.content.description).toBe(changed);
});

test('T67 / K3.3: saved requirements persist and restore across a full page reload', async ({ page, context }) => {
  const state = await api(page, context);
  const main = await background(page); await fillAll(main);
  await main.getByRole('button', { name: '保存需求', exact: true }).click();
  await expect(main.getByText('需求已保存。', { exact: true })).toBeVisible();
  await page.reload();
  await expect(main.getByRole('textbox', { name: title, exact: true })).toHaveValue(description);
  await main.getByRole('button', { name: '下一步', exact: true }).click();
  for (let index = 0; index < labels.length; index++) await expect(main.getByRole('textbox', { name: labels[index], exact: true })).toHaveValue(values[index]);
  await main.getByRole('button', { name: '保存需求', exact: true }).click();
  await expect(main.getByText('需求已保存。', { exact: true })).toBeVisible();
  expect(state.records[state.owner].revision).toBe(1);
});

test('T67 / K3.3: local read failure offers retry and cannot overwrite an unread saved requirement with defaults', async ({ page, context }) => {
  const state = await api(page, context, { 't67-browser-owner-a': snapshot() }); state.readStatus = 503;
  await page.goto('/');
  const main = page.getByRole('main');
  await expect(main.getByRole('alert')).toContainText('读取');
  await expect(main.getByRole('button', { name: '重新读取需求', exact: true })).toBeVisible();
  await expect(main.getByRole('textbox')).toHaveCount(0); expect(state.writes).toHaveLength(0);
  state.readStatus = 200;
  await main.getByRole('button', { name: '重新读取需求', exact: true }).click();
  await expect(main.getByRole('textbox', { name: title, exact: true })).toHaveValue(description);
  await main.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(main.getByRole('textbox', { name: labels[0], exact: true })).toHaveValue('社区花园');
});

test('T67 / K3.3: failed save retains every input and can be retried', async ({ page, context }) => {
  const state = await api(page, context); const main = await background(page); await fillAll(main);
  state.writeStatus = 503; await main.getByRole('button', { name: '保存需求', exact: true }).click();
  await expect(main.getByRole('alert')).toContainText('输入仍在');
  for (let index = 0; index < labels.length; index++) await expect(main.getByRole('textbox', { name: labels[index], exact: true })).toHaveValue(values[index]);
  expect(state.records[state.owner]).toBeUndefined();
  state.writeStatus = 200; await main.getByRole('button', { name: '保存需求', exact: true }).click();
  await expect(main.getByText('需求已保存。', { exact: true })).toBeVisible(); expect(state.records[state.owner].revision).toBe(1);
});

test('T67 / K3.3: a lost save response can be retried without creating a duplicate version', async ({ page, context }) => {
  const state = await api(page, context); const main = await background(page); await fillAll(main);
  state.loseNextWriteResponse = true; await main.getByRole('button', { name: '保存需求', exact: true }).click();
  await expect(main.getByRole('alert')).toContainText('输入仍在'); expect(state.records[state.owner].revision).toBe(1);
  await main.getByRole('button', { name: '保存需求', exact: true }).click();
  await expect(main.getByText('需求已保存。', { exact: true })).toBeVisible(); expect(state.records[state.owner].revision).toBe(1);
  expect(state.writes).toHaveLength(2); expect(state.writes[1].body).toEqual(state.writes[0].body);
});

test('T67 / K3.3: conflict preserves unsaved input until the user explicitly loads the saved version', async ({ page, context }) => {
  const state = await api(page, context, { 't67-browser-owner-a': snapshot() });
  const main = await background(page); await main.getByRole('textbox', { name: labels[0], exact: true }).fill('我的未保存地点');
  state.records[state.owner] = snapshot('另一个页面保存的场景', 2); state.records[state.owner].content.keywords.location = '对方保存的地点';
  await main.getByRole('button', { name: '保存需求', exact: true }).click();
  await expect(main.getByRole('alert')).toContainText('其他页面');
  await expect(main.getByRole('textbox', { name: labels[0], exact: true })).toHaveValue('我的未保存地点');
  expect(state.writes).toHaveLength(1); expect(state.records[state.owner].revision).toBe(2);
  await main.getByRole('button', { name: '载入已保存版本', exact: true }).click();
  const next = main.getByRole('button', { name: '下一步', exact: true });
  if (await next.count()) await next.click();
  await expect(main.getByRole('textbox', { name: labels[0], exact: true })).toHaveValue('对方保存的地点');
  expect(state.writes).toHaveLength(1);
});

test('T67 / K3.3: delayed old-owner load cannot replace the new account requirement', async ({ page, context }) => {
  const state = await api(page, context, { 't67-browser-owner-a': snapshot('账号A的需求'), 't67-browser-owner-b': snapshot('账号B的需求') });
  const observed = firstRequestSettlement(page, 'GET');
  let release; state.readGates[state.owner] = new Promise(resolve => { release = resolve; });
  try {
    await page.goto('/'); await expect.poll(() => state.reads.length).toBe(1);
    state.owner = 't67-browser-owner-b';
    await page.evaluate(() => window.dispatchEvent(new Event('le-sg-auth-invalid')));
    const input = page.getByRole('main').getByRole('textbox', { name: title, exact: true });
    await expect(input).toHaveValue('账号B的需求');
    release();
    await renderAfterNetwork(page, observed);
    await expect(input).toHaveValue('账号B的需求');
    await expect(page.getByRole('main').getByText('账号A的需求', { exact: true })).toHaveCount(0);
  } finally { release(); observed.dispose(); }
});

test('T67 / K3.3: a delayed save acknowledgement cannot replace another account requirement', async ({ page, context }) => {
  const state = await api(page, context, { 't67-browser-owner-b': snapshot('账号B的需求') });
  const observed = firstRequestSettlement(page, 'PUT');
  let release; state.writeGates[state.owner] = new Promise(resolve => { release = resolve; });
  try {
    const main = await background(page); await fillAll(main);
    await main.getByRole('button', { name: '保存需求', exact: true }).click();
    await expect.poll(() => state.writes.length).toBe(1);
    state.owner = 't67-browser-owner-b';
    await page.evaluate(() => window.dispatchEvent(new Event('le-sg-auth-invalid')));
    const input = main.getByRole('textbox', { name: title, exact: true });
    await expect(input).toHaveValue('账号B的需求');
    release(); await renderAfterNetwork(page, observed);
    await expect(input).toHaveValue('账号B的需求');
    await expect(main.getByText('需求已保存。', { exact: true })).toHaveCount(0);
    expect(state.records[state.owner].content.description).toBe('账号B的需求');
    expect(state.writes).toHaveLength(1);
  } finally { release(); observed.dispose(); }
});

test('T67 / K3.3: saved confirmation is withdrawn when keywords, language or description change', async ({ page, context }) => {
  await api(page, context); const main = await background(page);
  const save = () => main.getByRole('button', { name: '保存需求', exact: true }).click();
  const saved = main.getByText('需求已保存。', { exact: true });
  await save(); await expect(saved).toBeVisible();
  await main.getByRole('textbox', { name: labels[0], exact: true }).fill('新的地点');
  await expect(saved).toHaveCount(0);
  await save(); await expect(saved).toBeVisible();
  await page.getByRole('combobox').selectOption('id');
  await expect(saved).toHaveCount(0);
  await expect(main.getByText('Kebutuhan tersimpan.', { exact: true })).toHaveCount(0);
  await page.getByRole('combobox').selectOption('zh-Hans');
  await save(); await expect(saved).toBeVisible();
  await main.getByRole('button', { name: '返回', exact: true }).click();
  await main.getByRole('textbox', { name: title, exact: true }).fill('修改后的场景');
  await main.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(saved).toHaveCount(0);
});

test('T67 regression: temporary session failure hides private inputs and restores the same unsaved description and six fields', async ({ page, context }) => {
  const state = await api(page, context);
  const main = await background(page); await fillAll(main);
  const readsBefore = state.reads.length;
  let failing = true;
  await page.route('**/api/auth/session', route => route.fulfill({ status: failing ? 503 : 200, json: failing ? { error: 'synthetic_failure' } : { authenticated: true, accountKey: state.owner } }));
  await page.evaluate(() => window.dispatchEvent(new Event('le-sg-auth-invalid')));
  await expect(main.getByRole('button', { name: '重新检查登录', exact: true })).toBeVisible();
  await expect(main.getByRole('textbox')).toHaveCount(0);
  failing = false;
  await main.getByRole('button', { name: '重新检查登录', exact: true }).click();
  await expect(main.getByText(description, { exact: true })).toBeVisible();
  for (let index = 0; index < labels.length; index++) await expect(main.getByRole('textbox', { name: labels[index], exact: true })).toHaveValue(values[index]);
  expect(state.reads.length).toBe(readsBefore); expect(state.writes).toHaveLength(0);
  await main.getByRole('button', { name: '返回', exact: true }).click();
  await expect(main.getByRole('textbox', { name: title, exact: true })).toHaveValue(description);
});

test('T67 regression: saving acknowledgement cannot replace edits made while the same-account save is in flight', async ({ page, context }) => {
  const state = await api(page, context);
  const observed = firstRequestSettlement(page, 'PUT');
  let release; state.writeGates[state.owner] = new Promise(resolve => { release = resolve; });
  try {
    const main = await background(page); await fillAll(main);
    await main.getByRole('button', { name: '保存需求', exact: true }).click();
    await expect.poll(() => state.writes.length).toBe(1);
    const field = main.getByRole('textbox', { name: labels[5], exact: true });
    await field.fill('保存途中继续编辑的内容');
    release(); await renderAfterNetwork(page, observed);
    await expect(main.getByRole('button', { name: '保存需求', exact: true })).toBeEnabled();
    await expect(field).toHaveValue('保存途中继续编辑的内容');
    await expect(main.getByText('需求已保存。', { exact: true })).toHaveCount(0);
    expect(state.records[state.owner].content.keywords.special).toBe(values[5]);
    await main.getByRole('button', { name: '保存需求', exact: true }).click();
    await expect(main.getByText('需求已保存。', { exact: true })).toBeVisible();
    expect(state.records[state.owner].revision).toBe(2);
    expect(state.records[state.owner].content.keywords.special).toBe('保存途中继续编辑的内容');
  } finally { release(); observed.dispose(); }
});

test('T67 / K3.1: each keyword input enforces the 200-character bound without losing the accepted value', async ({ page, context }) => {
  const state = await api(page, context); const main = await background(page);
  for (const label of labels) {
    const field = main.getByRole('textbox', { name: label, exact: true }); await field.fill('词'.repeat(201)); await expect(field).toHaveValue('词'.repeat(200));
  }
  await main.getByRole('button', { name: '保存需求', exact: true }).click();
  await expect(main.getByText('需求已保存。', { exact: true })).toBeVisible();
  expect(Object.values(state.records[state.owner].content.keywords)).toEqual(keys.map(() => '词'.repeat(200)));
});

test('T67 / K3.3: a stalled requirement read is bounded and offers retry', async ({ page, context }) => {
  await api(page, context);
  await page.route('**/api/scene-requirements*', () => {});
  await page.goto('/');
  await expect(page.getByRole('main').getByRole('button', { name: '重新读取需求', exact: true })).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole('main').getByRole('textbox')).toHaveCount(0);
});

test('T67 / K3.3: a session lost while saving removes private fields and returns to login', async ({ page, context }) => {
  const state = await api(page, context); const main = await background(page); await fillAll(main);
  state.authenticated = false; await main.getByRole('button', { name: '保存需求', exact: true }).click();
  await expect(main.getByRole('group', { name: '选择登录方式', exact: true })).toBeVisible();
  await expect(main.getByRole('textbox')).toHaveCount(0); expect(state.records[state.owner]).toBeUndefined();
});

const languages = [
  { code: 'zh-Hans', next: '下一步', labels, save: '保存需求', saved: '需求已保存。' },
  { code: 'id', next: 'Lanjut', labels: ['Di mana?', 'Peran Anda?', 'Dengan siapa Anda akan berbicara?', 'Apa yang ingin dibicarakan?', 'Apa tujuan Anda?', 'Ada hal khusus?'], save: 'Simpan kebutuhan', saved: 'Kebutuhan tersimpan.' },
  { code: 'ja', next: '次へ', labels: ['どこで？', 'あなたの役割は？', '誰と話しますか？', '何について話したいですか？', 'どんなことができればよいですか？', '特別な事情はありますか？'], save: '内容を保存', saved: '保存しました。' },
  { code: 'ko', next: '다음', labels: ['어디에서?', '어떤 역할인가요?', '누구와 이야기하나요?', '무슨 이야기를 하고 싶나요?', '원하는 결과는 무엇인가요?', '특별한 상황이 있나요?'], save: '내용 저장', saved: '저장했어요.' },
  { code: 'hi', next: 'आगे', labels: ['कहाँ?', 'आपकी भूमिका क्या है?', 'आप किससे बात करेंगे?', 'किस बारे में बात करनी है?', 'आप क्या हासिल करना चाहते हैं?', 'कोई खास बात?'], save: 'ज़रूरत सहेजें', saved: 'ज़रूरत सहेज ली गई है।' },
];

for (const language of languages) test(`T67 / K3: ${language.code} labels and saved helper language restore with the same requirement`, async ({ page, context }) => {
  const state = await api(page, context); await page.goto('/');
  const main = page.getByRole('main');
  await main.getByRole('textbox', { name: title, exact: true }).fill(description);
  await page.getByRole('combobox').selectOption(language.code);
  await main.getByRole('button', { name: language.next, exact: true }).click();
  for (const label of language.labels) await expect(main.getByRole('textbox', { name: label, exact: true })).toBeVisible();
  await main.getByRole('textbox', { name: language.labels[0], exact: true }).fill('Community garden');
  await main.getByRole('button', { name: language.save, exact: true }).click();
  await expect(main.getByText(language.saved, { exact: true })).toBeVisible(); expect(state.records[state.owner].content.language).toBe(language.code);
  await page.reload();
  await expect(page.getByRole('combobox')).toHaveValue(language.code);
  await expect(main.getByRole('textbox')).toHaveValue(description);
  await main.getByRole('button', { name: language.next, exact: true }).click();
  await expect(main.getByRole('textbox', { name: language.labels[0], exact: true })).toHaveValue('Community garden');
});

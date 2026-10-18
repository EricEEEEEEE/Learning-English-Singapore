import { test, expect } from '@playwright/test';
import { openMore, closeMore } from '../fixtures/c10-shell.mjs';
import { setupBrowser, openBackground, requirement, generationView, observeGenerationRequest, ownerA, ownerB, scenario, sceneTitle, progressTitle, keywordKeys, keywordLabels, keywordValues } from '../fixtures/t68-generation-browser.mjs';

test.use({ locale: 'zh-CN' });

test('T68 / K4: generate first saves all fields as one version and shows only its real waiting state', async ({ page, context, baseURL }) => {
  const state = await setupBrowser(page, context, baseURL);
  const main = await openBackground(page);
  const generate = main.getByRole('button', { name: '生成场景', exact: true });
  await expect(generate).toBeVisible(); await generate.click();
  // C7 T14A: generating now asks for confirmation first; nothing is saved or sent before it.
  expect(state.writes).toHaveLength(0); expect(state.posts).toHaveLength(0);
  await main.getByRole('button', { name: '确认生成', exact: true }).click();
  await expect(main.getByRole('heading', { name: progressTitle, exact: true })).toBeVisible();
  await expect(main.getByText('场景需求已保存，尚未开始生成。', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\?generation=1$/);
  expect(state.writes).toHaveLength(1); expect(state.posts).toEqual([{ owner: ownerA, body: { requirementRevision: 1 } }]);
  expect(state.writes[0].body).toEqual({ expectedRevision: 0, content: { description: scenario, language: 'zh-Hans', keywords: Object.fromEntries(keywordKeys.map((key, index) => [key, keywordValues[index]])) } });
  await expect(main.getByRole('button', { name: '观看场景', exact: true })).toHaveCount(0);
  await expect(main.locator('video')).toHaveCount(0); await expect(main.getByRole('progressbar')).toHaveCount(0);
  expect(state.external).toEqual([]);
});

test('T68 / K4: a failed requirement save never creates a task or abandons the inputs', async ({ page, context, baseURL }) => {
  const state = await setupBrowser(page, context, baseURL); const main = await openBackground(page);
  state.writeStatus = 503;
  await main.getByRole('button', { name: '生成场景', exact: true }).click();
  await main.getByRole('button', { name: '确认生成', exact: true }).click();
  await expect(main.getByRole('alert')).toContainText('输入仍在');
  for (let index = 0; index < keywordLabels.length; index++) await expect(main.getByRole('textbox', { name: keywordLabels[index], exact: true })).toHaveValue(keywordValues[index]);
  expect(state.posts).toHaveLength(0); await expect(page).toHaveURL(baseURL + '/');
});

test('T68 / K4: a conflicting save cannot generate from a previous snapshot', async ({ page, context, baseURL }) => {
  const state = await setupBrowser(page, context, baseURL, requirement()); const main = await openBackground(page);
  state.records[ownerA] = requirement(2, '另一页面保存的新需求');
  await main.getByRole('button', { name: '生成场景', exact: true }).click();
  await main.getByRole('button', { name: '确认生成', exact: true }).click();
  await expect(main.getByRole('alert')).toContainText('其他页面');
  await expect(main.getByRole('textbox', { name: keywordLabels[0], exact: true })).toHaveValue(keywordValues[0]);
  expect(state.posts).toEqual([]);
});

test('T68 / K4: rapid repeated generation clicks create one task and refresh only reads it', async ({ page, context, baseURL }) => {
  const state = await setupBrowser(page, context, baseURL);
  let release; state.postGate = new Promise(resolve => { release = resolve; });
  try {
    const main = await openBackground(page);
    await main.getByRole('button', { name: '生成场景', exact: true }).click();
    await main.getByRole('button', { name: '确认生成', exact: true }).evaluate(button => { button.click(); button.click(); });
    await expect.poll(() => state.posts.length).toBe(1);
    release(); await expect(main.getByText('场景需求已保存，尚未开始生成。', { exact: true })).toBeVisible();
    await page.reload();
    await expect(main.getByText('场景需求已保存，尚未开始生成。', { exact: true })).toBeVisible();
    expect(state.posts).toHaveLength(1); expect(state.writes).toHaveLength(1);
    expect(state.gets.some(request => request.revision === 1)).toBe(true);
  } finally { release(); }
});

test('T68 / K4: opening a saved generation link queries without submitting and a missing task is not generated automatically', async ({ page, context, baseURL }) => {
  const state = await setupBrowser(page, context, baseURL, requirement());
  await page.goto('/?generation=1'); const main = page.getByRole('main');
  await expect(main.getByText('暂未查到生成任务，可以重新检查。', { exact: true })).toBeVisible();
  await main.getByRole('button', { name: '重新检查', exact: true }).click();
  await expect.poll(() => state.gets.length).toBeGreaterThan(1);
  expect(state.posts).toEqual([]); expect(state.writes).toEqual([]);
});

test('T68 / K4: a lost creation acknowledgement recovers the existing task by GET without a second POST', async ({ page, context, baseURL }) => {
  const state = await setupBrowser(page, context, baseURL); state.postMode = 'lost';
  const main = await openBackground(page);
  await main.getByRole('button', { name: '生成场景', exact: true }).click();
  await main.getByRole('button', { name: '确认生成', exact: true }).click();
  await expect(main.getByText('场景需求已保存，尚未开始生成。', { exact: true })).toBeVisible();
  expect(state.posts).toHaveLength(1); expect(state.gets.length).toBeGreaterThan(0);
  const readsBeforeReload = state.gets.length;
  await page.reload(); await expect(main.getByText('场景需求已保存，尚未开始生成。', { exact: true })).toBeVisible();
  await expect.poll(() => state.gets.length).toBeGreaterThan(readsBeforeReload);
  expect(state.posts).toHaveLength(1);
});

test('T68 / K4: an unknown submit with no immediately visible task stays query-only until the original task appears', async ({ page, context, baseURL }) => {
  const state = await setupBrowser(page, context, baseURL); state.postMode = 'lost-later';
  const main = await openBackground(page);
  await main.getByRole('button', { name: '生成场景', exact: true }).click();
  await main.getByRole('button', { name: '确认生成', exact: true }).click();
  await expect(main.getByText('暂未查到生成任务，可以重新检查。', { exact: true })).toBeVisible();
  await main.getByRole('button', { name: '重新检查', exact: true }).click();
  await expect.poll(() => state.gets.length).toBeGreaterThan(1);
  expect(state.posts).toHaveLength(1);
  state.views[state.pending.key] = state.pending.view;
  await main.getByRole('button', { name: '重新检查', exact: true }).click();
  await expect(main.getByText('场景需求已保存，尚未开始生成。', { exact: true })).toBeVisible();
  expect(state.posts).toHaveLength(1);
});

test('T68 / K4: an uncertain provider submission is read again without retrying the provider or task creation', async ({ page, context, baseURL }) => {
  const record = requirement(), state = await setupBrowser(page, context, baseURL, record);
  state.views[`${ownerA}:1`] = generationView(record, 't68-unknown', 'submission_unknown');
  await page.goto('/?generation=1'); const main = page.getByRole('main');
  await expect(main.getByText('提交结果尚未确认，不会自动重新提交。', { exact: true })).toBeVisible();
  await main.getByRole('button', { name: '重新检查', exact: true }).click();
  await expect.poll(() => state.gets.length).toBeGreaterThan(1);
  expect(state.posts).toEqual([]); await expect(main.locator('video')).toHaveCount(0);
});

test('T68 / K4: active progress polls only GET and follows the server stage without a percentage animation', async ({ page, context, baseURL }) => {
  const record = requirement(), state = await setupBrowser(page, context, baseURL, record);
  state.views[`${ownerA}:1`] = generationView(record, 't68-progress', 'script_ready');
  await page.goto('/?generation=1'); const main = page.getByRole('main');
  await expect(main.getByText('场景内容已准备，等待声音。', { exact: true })).toBeVisible();
  state.views[`${ownerA}:1`] = generationView(record, 't68-progress', 'audio_ready');
  await expect(main.getByText('声音已准备，等待组合。', { exact: true })).toBeVisible({ timeout: 8000 });
  expect(state.posts).toEqual([]); await expect(main.getByRole('progressbar')).toHaveCount(0);
});

test('T68 / K4: a failed stage offers return and preserves the requirement fields without automatic resubmission', async ({ page, context, baseURL }) => {
  const record = requirement(), state = await setupBrowser(page, context, baseURL, record);
  state.views[`${ownerA}:1`] = generationView(record, 't68-failed', 'failed');
  await page.goto('/?generation=1'); const main = page.getByRole('main');
  await expect(main.getByText('场景准备遇到问题，可以返回修改。', { exact: true })).toBeVisible();
  await main.getByRole('button', { name: '返回修改', exact: true }).click();
  for (let index = 0; index < keywordLabels.length; index++) await expect(main.getByRole('textbox', { name: keywordLabels[index], exact: true })).toHaveValue(keywordValues[index]);
  expect(state.posts).toEqual([]);
});

test('T68 / K4: only a verified ready pointer opens the corresponding saved course and material version', async ({ page, context, baseURL }) => {
  const record = requirement(), state = await setupBrowser(page, context, baseURL, record);
  state.views[`${ownerA}:1`] = generationView(record, 't68-ready', 'ready', 3);
  await page.goto('/?generation=1'); const main = page.getByRole('main');
  await main.getByRole('button', { name: '观看场景', exact: true }).click();
  await expect(main.getByTestId('scene-play')).toBeVisible();
  expect(state.courseReads).toEqual([{ id: 't68-ready', revision: 1, materialsRevision: 3 }]);
  await expect(main.locator('video')).toHaveAttribute('src', /\/api\/generated-course-media\?.*id=t68-ready.*revision=1/);
  expect(state.posts).toEqual([]);
});

test('T68 / K4: assembled task with unavailable private media never opens another sample', async ({ page, context, baseURL }) => {
  const record = requirement(), state = await setupBrowser(page, context, baseURL, record);
  state.views[`${ownerA}:1`] = generationView(record, 't68-no-media', 'media_unavailable');
  await page.goto('/?generation=1'); const main = page.getByRole('main');
  await expect(main.getByText('课程材料暂时无法读取，请重新检查。', { exact: true })).toBeVisible();
  await expect(main.getByRole('button', { name: '观看场景', exact: true })).toHaveCount(0);
  await expect(main.locator('video')).toHaveCount(0); expect(state.courseReads).toEqual([]); expect(state.mediaReads).toEqual([]);
});

test('T68 / K4: mismatched requirement or course versions are rejected rather than linked to the watch page', async ({ page, context, baseURL }) => {
  const record = requirement(), state = await setupBrowser(page, context, baseURL, record);
  for (const wrong of ['requirement', 'task', 'courseId', 'courseRevision']) {
    const view = generationView(record, 't68-ready', 'ready');
    if (wrong === 'requirement') view.requirement.revision = 2;
    if (wrong === 'task') view.task.requirementRevision = 2;
    if (wrong === 'courseId') view.course.id = 'unrelated-old-party';
    if (wrong === 'courseRevision') view.course.revision = 99;
    state.views[`${ownerA}:1`] = view;
    await page.goto('/?generation=1'); const main = page.getByRole('main');
    await expect(main.getByRole('alert')).toContainText('版本');
    await expect(main.getByRole('button', { name: '观看场景', exact: true })).toHaveCount(0);
  }
  expect(state.courseReads).toEqual([]); expect(state.posts).toEqual([]);
});

test('T68 / K4: failed or stalled status reads offer bounded query retry without creating a task', async ({ page, context, baseURL }) => {
  const record = requirement(), state = await setupBrowser(page, context, baseURL, record);
  state.views[`${ownerA}:1`] = generationView(record);
  state.generationReadStatus = 503;
  await page.goto('/?generation=1'); const main = page.getByRole('main');
  await expect(main.getByRole('alert')).toContainText('重新检查');
  state.generationReadStatus = 200;
  await main.getByRole('button', { name: '重新检查', exact: true }).click();
  await expect(main.getByText('场景需求已保存，尚未开始生成。', { exact: true })).toBeVisible();
  await page.route('**/api/scene-generation*', () => {});
  await main.getByRole('button', { name: '重新检查', exact: true }).click();
  await expect(main.getByRole('alert')).toBeVisible({ timeout: 8000 });
  expect(state.posts).toEqual([]);
});

test('T68 / K4: session loss removes private progress and returns to the login choices', async ({ page, context, baseURL }) => {
  const record = requirement(), state = await setupBrowser(page, context, baseURL, record);
  state.views[`${ownerA}:1`] = generationView(record);
  await page.goto('/?generation=1'); const main = page.getByRole('main');
  await expect(main.getByText('场景需求已保存，尚未开始生成。', { exact: true })).toBeVisible();
  state.authenticated = false;
  await main.getByRole('button', { name: '重新检查', exact: true }).click();
  await expect(main.getByRole('group', { name: '选择登录方式', exact: true })).toBeVisible();
  await expect(main.getByRole('heading', { name: progressTitle, exact: true })).toHaveCount(0); await expect(main.locator('video')).toHaveCount(0);
  expect(state.posts).toEqual([]);
});

test('T68 / K4: a delayed old-owner generation read cannot replace the new owner result', async ({ page, context, baseURL }) => {
  const a = requirement(1, '账号A的家长会'), b = requirement(1, '账号B的邻里活动');
  const state = await setupBrowser(page, context, baseURL, a);
  state.records[ownerB] = b; state.histories[`${ownerB}:1`] = b;
  state.views[`${ownerA}:1`] = generationView(a, 't68-task-a'); state.views[`${ownerB}:1`] = generationView(b, 't68-task-b');
  let release; state.readGates[ownerA] = new Promise(resolve => { release = resolve; });
  const observed = observeGenerationRequest(page);
  try {
    await page.goto('/?generation=1'); await expect.poll(() => state.gets.length).toBe(1);
    state.owner = ownerB; await page.evaluate(() => window.dispatchEvent(new Event('le-sg-auth-invalid')));
    const main = page.getByRole('main'); await expect(main.getByText(b.content.description, { exact: true })).toBeVisible();
    release(); await observed.done();
    await expect(main.getByText(b.content.description, { exact: true })).toBeVisible();
    await expect(main.getByText(a.content.description, { exact: true })).toHaveCount(0); expect(state.posts).toEqual([]);
  } finally { release(); observed.dispose(); }
});

test('T68 / K4: a delayed creation acknowledgement cannot replace another owner progress or submit for that owner', async ({ page, context, baseURL }) => {
  const b = requirement(1, '账号B的邻里活动');
  const state = await setupBrowser(page, context, baseURL);
  state.views[`${ownerA}:1`] = generationView(requirement(), 't68-ready-a', 'ready', 3);
  state.records[ownerB] = b; state.histories[`${ownerB}:1`] = b;
  state.views[`${ownerB}:1`] = generationView(b, 't68-task-b');
  let release; state.postGate = new Promise(resolve => { release = resolve; });
  const observed = observeGenerationRequest(page, 'POST');
  try {
    const main = await openBackground(page);
    const generate = main.getByRole('button', { name: '生成场景', exact: true });
    await expect(generate).toBeVisible(); await generate.click();
    await main.getByRole('button', { name: '确认生成', exact: true }).click();
    await expect.poll(() => state.posts.length).toBe(1);
    await expect(page).toHaveURL(/\?generation=1$/);
    state.owner = ownerB; await page.evaluate(() => window.dispatchEvent(new Event('le-sg-auth-invalid')));
    await expect(main.getByText(b.content.description, { exact: true })).toBeVisible();
    release(); await observed.done();
    await expect(main.getByText(b.content.description, { exact: true })).toBeVisible();
    await expect(main.getByText(scenario, { exact: true })).toHaveCount(0);
    await expect(main.getByRole('button', { name: '观看场景', exact: true })).toHaveCount(0);
    expect(state.courseReads).toEqual([]); expect(state.mediaReads).toEqual([]);
    expect(state.posts).toEqual([{ owner: ownerA, body: { requirementRevision: 1 } }]);
  } finally { release(); observed.dispose(); }
});

test('T68 / K4: a status response whose JSON body stalls still reaches bounded query retry', async ({ page, context, baseURL }) => {
  const state = await setupBrowser(page, context, baseURL, requirement());
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, options) => {
      const request = new Request(input, options);
      const url = new URL(request.url);
      if (url.pathname !== '/api/scene-generation' || request.method !== 'GET') return originalFetch(input, options);
      return Promise.resolve({ ok: true, status: 200, json: () => new Promise((_resolve, reject) => {
        window.t68BodyReadStarted = true;
        const abort = () => reject(new DOMException('Synthetic stalled body', 'AbortError'));
        if (request.signal.aborted) abort();
        else request.signal.addEventListener('abort', abort, { once: true });
      }) });
    };
  });
  await page.goto('/?generation=1'); const main = page.getByRole('main');
  await expect.poll(() => page.evaluate(() => window.t68BodyReadStarted === true)).toBe(true);
  await expect(main.getByRole('alert')).toContainText('重新检查', { timeout: 8000 });
  await expect(main.getByRole('button', { name: '重新检查', exact: true })).toBeVisible();
  expect(state.posts).toEqual([]); await expect(main.locator('video')).toHaveCount(0);
});

test('T68 / K4: hidden progress pauses automatic queries and visibility resumes only GET', async ({ page, context, baseURL }) => {
  const record = requirement(), state = await setupBrowser(page, context, baseURL, record);
  state.views[`${ownerA}:1`] = generationView(record, 't68-visibility', 'script_ready');
  await page.clock.install();
  await page.goto('/?generation=1'); const main = page.getByRole('main');
  await expect(main.getByText('场景内容已准备，等待声音。', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const readsWhileHidden = state.gets.length;
  state.views[`${ownerA}:1`] = generationView(record, 't68-visibility', 'audio_ready');
  await page.clock.runFor(9000);
  expect(state.gets).toHaveLength(readsWhileHidden);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(main.getByText('声音已准备，等待组合。', { exact: true })).toBeVisible({ timeout: 8000 });
  expect(state.gets.length).toBeGreaterThan(readsWhileHidden); expect(state.posts).toEqual([]);
});

test('T68 / K4: returning from historical progress preserves a newer working version and later unsaved edits', async ({ page, context, baseURL }) => {
  const old = requirement(1, '旧版本的家长会'), latest = requirement(2, '当前版本的社区活动');
  const state = await setupBrowser(page, context, baseURL, latest);
  state.histories[`${ownerA}:1`] = old; state.views[`${ownerA}:1`] = generationView(old);
  await page.goto('/?generation=1'); const main = page.getByRole('main');
  await main.getByRole('button', { name: '返回修改', exact: true }).click();
  await expect(main.getByText(latest.content.description, { exact: true })).toBeVisible();
  const field = main.getByRole('textbox', { name: keywordLabels[0], exact: true }); await field.fill('尚未保存的新地点');
  await page.goBack(); await expect(main.getByText(old.content.description, { exact: true })).toBeVisible();
  await main.getByRole('button', { name: '返回修改', exact: true }).click();
  await expect(field).toHaveValue('尚未保存的新地点'); await expect(main.getByText(latest.content.description, { exact: true })).toBeVisible();
  expect(state.writes).toEqual([]); expect(state.posts).toEqual([]);
});

test('T68 / K4: invalid or absent requirement links cannot create a task and provide a return action', async ({ page, context, baseURL }) => {
  const state = await setupBrowser(page, context, baseURL);
  for (const query of ['generation=0', 'generation=wrong', 'generation=1&generation=2', 'generation=999']) {
    await page.goto('/?' + query); const main = page.getByRole('main');
    await expect(main.getByRole('alert')).toBeVisible();
    await expect(main.getByRole('button', { name: '返回修改', exact: true })).toBeVisible();
    await expect(main.locator('video')).toHaveCount(0);
  }
  expect(state.posts).toEqual([]); expect(state.writes).toEqual([]);
});

const languages = [
  { code: 'zh-Hans', next: '下一步', generate: '生成场景', confirm: '确认生成', title: progressTitle },
  { code: 'id', next: 'Lanjut', generate: 'Buat situasi', confirm: 'Ya, buat sekarang', title: 'Menyiapkan situasi Anda' },
  { code: 'ja', next: '次へ', generate: '場面を生成', confirm: '生成する', title: '場面を準備しています' },
  { code: 'ko', next: '다음', generate: '상황 만들기', confirm: '네, 만들어 주세요', title: '상황을 준비하고 있어요' },
  { code: 'hi', next: 'आगे', generate: 'दृश्य बनाएँ', confirm: 'हाँ, बनाएँ', title: 'आपका दृश्य तैयार किया जा रहा है' },
];
for (const language of languages) test(`T68 / K4: ${language.code} can submit and refresh the same requirement-bound progress page`, async ({ page, context, baseURL }) => {
  const state = await setupBrowser(page, context, baseURL);
  await page.goto('/'); const main = page.getByRole('main');
  await main.getByRole('textbox', { name: sceneTitle, exact: true }).fill(scenario);
  await openMore(page); await page.getByRole('combobox').selectOption(language.code); await closeMore(page);
  await main.getByRole('button', { name: language.next, exact: true }).click();
  await main.getByRole('button', { name: language.generate, exact: true }).click();
  await main.getByRole('button', { name: language.confirm, exact: true }).click();
  await expect(main.getByRole('heading', { name: language.title, exact: true })).toBeVisible();
  expect(state.records[ownerA].content.language).toBe(language.code);
  const readsBeforeReload = state.gets.length;
  await page.reload(); await expect(main.getByRole('heading', { name: language.title, exact: true })).toBeVisible();
  await expect.poll(() => state.gets.length).toBeGreaterThan(readsBeforeReload);
  expect(state.posts).toHaveLength(1); await expect(main.locator('video')).toHaveCount(0);
});

async function openReadyCourse(page, context, baseURL) {
  const record = requirement(), state = await setupBrowser(page, context, baseURL, record);
  state.views[`${ownerA}:1`] = generationView(record, 't68-ready-recheck', 'ready', 3);
  await page.goto('/?generation=1'); const main = page.getByRole('main');
  await main.getByRole('button', { name: '观看场景', exact: true }).click();
  await expect(main.getByTestId('scene-play')).toBeVisible();
  return { state, main };
}

test('T68 regression: focus rechecking the same owner restores the opened course and exact materials without generation', async ({ page, context, baseURL }) => {
  const { state, main } = await openReadyCourse(page, context, baseURL);
  const checked = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/session');
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await checked;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(main.getByTestId('scene-play')).toBeVisible();
  await expect(main.locator('video')).toHaveAttribute('src', /id=t68-ready-recheck&revision=1/);
  for (const pointer of state.courseReads) expect(pointer).toEqual({ id: 't68-ready-recheck', revision: 1, materialsRevision: 3 });
  expect(state.posts).toEqual([]); expect(state.writes).toEqual([]);
});

test('T68 regression: a temporary session failure hides video then restores the same course and materials after retry', async ({ page, context, baseURL }) => {
  const { state, main } = await openReadyCourse(page, context, baseURL);
  let failNext = true;
  await page.route('**/api/auth/session', route => {
    if (!failNext) return route.fallback();
    failNext = false; return route.fulfill({ status: 503, json: { error: 'synthetic_failure' } });
  });
  await page.evaluate(() => window.dispatchEvent(new Event('le-sg-auth-invalid')));
  await expect(main.getByRole('button', { name: '重新检查登录', exact: true })).toBeVisible(); await expect(main.locator('video')).not.toBeVisible();
  expect(await page.evaluate(() => [...document.querySelectorAll('video,audio')].every(media => media.paused))).toBe(true);
  await main.getByRole('button', { name: '重新检查登录', exact: true }).click(); await expect(main.getByTestId('scene-play')).toBeVisible();
  await expect(main.locator('video')).toHaveAttribute('src', /id=t68-ready-recheck&revision=1/);
  for (const pointer of state.courseReads) expect(pointer).toEqual({ id: 't68-ready-recheck', revision: 1, materialsRevision: 3 });
  expect(state.posts).toEqual([]); expect(state.writes).toEqual([]);
});

test('T68 regression: confirmed owner change or logout removes the opened private course instead of keeping A watching', async ({ page, context, baseURL }) => {
  const { state, main } = await openReadyCourse(page, context, baseURL);
  const b = requirement(1, '账号B的新活动'); state.records[ownerB] = b; state.histories[`${ownerB}:1`] = b;
  state.views[`${ownerB}:1`] = generationView(b, 't68-ready-recheck-b');
  state.owner = ownerB; await page.evaluate(() => window.dispatchEvent(new Event('le-sg-auth-invalid')));
  await expect(main.getByText(b.content.description, { exact: true })).toBeVisible(); await expect(main.locator('video')).toHaveCount(0);
  await expect(main.getByRole('button', { name: '观看场景', exact: true })).toHaveCount(0);
  state.authenticated = false; await page.evaluate(() => window.dispatchEvent(new Event('le-sg-auth-invalid')));
  await expect(main.getByRole('group', { name: '选择登录方式', exact: true })).toBeVisible(); await expect(main.locator('video')).toHaveCount(0);
  expect(state.courseReads).toEqual([{ id: 't68-ready-recheck', revision: 1, materialsRevision: 3 }]); expect(state.posts).toEqual([]);
});

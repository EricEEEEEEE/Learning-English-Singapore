import { test, expect } from '@playwright/test';
import { openMore, closeMore } from '../fixtures/c10-shell.mjs';
import { setupData, openLibrary, routeReports, coursePointer, ownerA } from '../fixtures/c5-data-browser.mjs';
import { noGeneration } from '../fixtures/t70-learning-browser.mjs';
import { hotelRequirement, hotelSample, assertSameMedia } from '../fixtures/t69-guided-browser.mjs';
import { openSentences } from '../fixtures/c4-practice-browser.mjs';
import { openRowMenu } from '../fixtures/c11-shell.mjs';

// C5 (user 2026-10-17: finish the product before real video, zero cost): deleting my data, signing out,
// reporting a sentence and reading my generation records. All answers come from protocol fixtures; nothing
// is generated, no model is called, and the course being studied is never rewritten.
test.use({ locale: 'zh-CN' });
const description = hotelRequirement().content.description;
const [first, second] = hotelSample.lines;
const card = main => main.locator('.scene-card').filter({ hasText: description });
function nothingElse(state) { noGeneration(state); expect(state.foreignWrites).toEqual([]); }

// ---- T24A: delete one scene ----

test('T24A / F14.4: deleting a scene asks first; cancelling sends nothing and keeps the scene', async ({ page, context, baseURL }) => {
  const { state, main } = await setupData(page, context, baseURL);
  await openLibrary(page, main);
  await openRowMenu(main, description);
  await main.getByRole('button', { name: `删除这个场景：${description}`, exact: true }).click();
  await expect(main.getByText('删除后，这个场景的课程、视频、学习位置和句子反馈都会从本机删除，不能恢复。')).toBeVisible();
  await main.getByRole('button', { name: '取消', exact: true }).click();
  await expect(main.getByRole('button', { name: '确认删除', exact: true })).toHaveCount(0);
  await expect(card(main).getByRole('button', { name: '继续学习', exact: true })).toBeVisible();
  expect(state.deletes).toEqual([]); nothingElse(state);
});

test('T24A / F14.4: confirming deletes exactly that course for this account and removes it from my scenes', async ({ page, context, baseURL }) => {
  const { state, main } = await setupData(page, context, baseURL);
  await openLibrary(page, main);
  await openRowMenu(main, description);
  await main.getByRole('button', { name: `删除这个场景：${description}`, exact: true }).click();
  await main.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(main.getByRole('status').filter({ hasText: '已删除这个场景。' })).toBeVisible();
  await expect(card(main)).toHaveCount(0);
  await expect(main.getByText('这里还没有可学习的场景。')).toBeVisible();
  expect(state.deletes).toEqual([{ owner: ownerA, id: coursePointer.id, revision: String(coursePointer.revision) }]);
  expect(state.courseReads).toEqual([]); expect(state.progressWrites).toEqual([]); nothingElse(state);
});

test('T24A / F14.4: a failed delete says so and the scene stays usable', async ({ page, context, baseURL }) => {
  const { state, main } = await setupData(page, context, baseURL);
  state.deleteStatus = 503;
  await openLibrary(page, main);
  await openRowMenu(main, description);
  await main.getByRole('button', { name: `删除这个场景：${description}`, exact: true }).click();
  await main.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(main.getByRole('alert').filter({ hasText: '删除没有完成，场景还在。请重试。' })).toBeVisible();
  await expect(main.getByText('已删除这个场景。')).toHaveCount(0);
  await expect(card(main).getByRole('button', { name: '继续学习', exact: true })).toBeVisible();
  expect(state.deletes).toHaveLength(1); nothingElse(state);
});

// ---- T24A: delete all, and what is stored ----

test('T24A / F14.4: deleting all my learning data needs its own confirmation and tells me the Google account is kept', async ({ page, context, baseURL }) => {
  const { state, main } = await setupData(page, context, baseURL);
  await openLibrary(page, main);
  await openMore(page);
  await main.getByRole('button', { name: '删除我的全部学习数据', exact: true }).click();
  await expect(main.getByText('会删除你在本机保存的全部场景、课程、视频、学习位置和句子反馈，不能恢复。你的 Google 账号不会被删除。')).toBeVisible();
  expect(state.dataDeletes).toEqual([]);
  await main.getByRole('button', { name: '确认全部删除', exact: true }).click();
  await expect(main.getByRole('status').filter({ hasText: '你的学习数据已删除。Google 账号本身没有删除。' })).toBeVisible();
  await expect(card(main)).toHaveCount(0);
  expect(state.dataDeletes).toEqual([{ owner: ownerA, body: { confirm: 'delete-all-my-data' } }]);
  expect(state.deletes).toEqual([]); nothingElse(state);
});

test('T24A / F14.4: a failed delete-all keeps my scenes and asks me to retry', async ({ page, context, baseURL }) => {
  const { state, main } = await setupData(page, context, baseURL);
  state.dataDeleteStatus = 503;
  await openLibrary(page, main);
  await openMore(page);
  await main.getByRole('button', { name: '删除我的全部学习数据', exact: true }).click();
  await main.getByRole('button', { name: '确认全部删除', exact: true }).click();
  await expect(main.getByRole('alert').filter({ hasText: '删除没有完成，数据还在。请重试。' })).toBeVisible();
  await expect(main.getByText('你的学习数据已删除。Google 账号本身没有删除。')).toHaveCount(0);
  await expect(card(main)).toHaveCount(1);
  nothingElse(state);
});

test('T24A / F14.5: "what we store" explains local data, that practice audio is not kept and that deleting does not delete the Google account', async ({ page, context, baseURL }) => {
  const { state, main } = await setupData(page, context, baseURL);
  await openLibrary(page, main);
  await openMore(page);
  const details = main.locator('details').filter({ hasText: '我们保存了什么' });
  await details.getByText('我们保存了什么', { exact: true }).click();
  await expect(details).toContainText('你描述的场景和六项背景');
  await expect(details).toContainText('练习时的录音不保存');
  await expect(details).toContainText('不会删除你的 Google 账号');
  await expect(details).toContainText('费用记录');
  nothingElse(state);
});

// ---- T13A: sign out ----

test('T13A / F1.2: signing out clears the session on the server, returns to the sign-in choice and deletes nothing', async ({ page, context, baseURL }) => {
  const { state, main } = await setupData(page, context, baseURL);
  await page.goto('/');
  await expect(main.getByRole('heading', { name: '你想在哪个场景下学习英语？', exact: true })).toBeVisible();
  await openMore(page);
  await main.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(main.getByRole('group', { name: '选择登录方式', exact: true })).toBeVisible();
  await openMore(page);
  await expect(main.getByRole('button', { name: '退出登录', exact: true })).toHaveCount(0);
  await expect(main.getByRole('button', { name: '我的场景', exact: true })).toHaveCount(0);
  await closeMore(page);
  expect(state.signOuts).toEqual([ownerA]); expect(state.deletes).toEqual([]); expect(state.dataDeletes).toEqual([]);
  // Signing in again finds the same scene: signing out removed no data.
  state.authenticated = true; await page.reload();
  await openLibrary(page, main);
  await expect(card(main)).toHaveCount(1);
  nothingElse(state);
});

test('T13A / F1.2: a failed sign-out is reported and the learner stays signed in', async ({ page, context, baseURL }) => {
  const { state, main } = await setupData(page, context, baseURL);
  state.signOutStatus = 503;
  await page.goto('/');
  await openMore(page);
  await main.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(main.getByRole('alert').filter({ hasText: '退出没有完成，请重试。' })).toBeVisible();
  await openMore(page);
  await expect(main.getByRole('button', { name: '我的场景', exact: true })).toBeVisible();
  expect(state.signOuts).toHaveLength(1); nothingElse(state);
});

test('T13A / C5 copy: sign-out and the data explanation exist in all five help languages', async ({ page, context, baseURL }) => {
  await setupData(page, context, baseURL);
  const labels = {
    'zh-Hans': ['退出登录', '我的场景', '我们保存了什么'], id: ['Keluar', 'Situasi saya', 'Data apa yang kami simpan'], ja: ['ログアウト', '自分の場面', '保存しているデータ'],
    ko: ['로그아웃', '내 상황', '저장하는 데이터'], hi: ['साइन आउट करें', 'मेरे दृश्य', 'हम क्या सहेजते हैं'],
  };
  await page.goto('/');
  const main = page.getByRole('main');
  for (const [language, [signOut, library, stored]] of Object.entries(labels)) {
    await openMore(page); await page.getByRole('combobox').selectOption(language); await closeMore(page);
    await openMore(page);
    await expect(main.getByRole('button', { name: signOut, exact: true })).toBeVisible();
    await main.getByRole('button', { name: library, exact: true }).click();
    await openMore(page);
    await expect(main.locator('details summary').filter({ hasText: stored })).toBeVisible();
    await page.reload();
  }
});

// ---- T25A: report a sentence ----

async function openReporting(page, context, baseURL) {
  const reports = { owner: ownerA };
  await routeReports(page, baseURL, reports);
  return { ...await openSentences(page, context, baseURL), reports };
}

test('T25A / F12.3: a sentence can be reported with a reason and a short note; it then shows as received', async ({ page, context, baseURL }) => {
  const { state, main, reports } = await openReporting(page, context, baseURL);
  await expect(main.getByTestId('scene-sentence').first()).toBeVisible();
  await main.getByRole('button', { name: `报告这句：${first.text}`, exact: true }).click();
  const reasons = main.getByRole('radiogroup', { name: '问题类型', exact: true });
  await expect(reasons.getByRole('radio')).toHaveCount(3);
  for (const name of ['听不懂', '不像本地说法', '意思不对']) await expect(reasons.getByRole('radio', { name, exact: true })).toBeVisible();
  const submit = main.getByRole('button', { name: '提交', exact: true });
  await expect(submit).toBeDisabled();
  await reasons.getByRole('radio', { name: '不像本地说法', exact: true }).check();
  await main.getByRole('textbox', { name: '补充说明（可不填）', exact: true }).fill('本地人一般不这么说');
  await submit.click();
  await expect(main.getByTestId('sentence-report-status')).toHaveText('已收到，等待处理');
  await expect(main.getByRole('button', { name: `报告这句：${first.text}`, exact: true })).toHaveCount(0);
  await expect(main.getByRole('button', { name: `报告这句：${second.text}`, exact: true })).toBeVisible();
  expect(reports.reportPosts).toEqual([{ owner: ownerA, body: { course: { id: 't69-synthetic-hotel', revision: 2, materialsRevision: 3 }, lineId: first.id, reason: 'not_local', note: '本地人一般不这么说' } }]);
  // Reporting never regenerates or rewrites the course being studied.
  assertSameMedia(state); expect(reports.foreignWrites).toEqual([]);
});

test('T25A / F12.3: the report control sits outside each sentence card so the card keeps a single listen button', async ({ page, context, baseURL }) => {
  const { main } = await openReporting(page, context, baseURL);
  const cards = main.getByTestId('scene-sentence');
  await expect(cards.first()).toBeVisible();
  for (const sentence of await cards.all()) await expect(sentence.getByRole('button')).toHaveCount(1);
  await expect(main.getByRole('button', { name: /^报告这句：/ })).toHaveCount(await cards.count());
});

test('T25A / F12.3: a report saved earlier for this course version shows as received when I come back', async ({ page, context, baseURL }) => {
  await page.route('**/api/sentence-reports*', route => route.request().method() === 'GET'
    ? route.fulfill({ json: { reports: [{ lineId: second.id, reason: 'unclear', note: '', status: 'received', at: 1 }] } }) : route.fallback());
  const { state, main } = await openSentences(page, context, baseURL);
  await expect(main.getByTestId('sentence-report-status')).toHaveText('已收到，等待处理');
  await expect(main.getByRole('button', { name: `报告这句：${second.text}`, exact: true })).toHaveCount(0);
  await expect(main.getByRole('button', { name: `报告这句：${first.text}`, exact: true })).toBeVisible();
  assertSameMedia(state);
});

test('T25A / F12.3: a failed report says so and does not claim it was received', async ({ page, context, baseURL }) => {
  const { state, main, reports } = await openReporting(page, context, baseURL);
  reports.reportStatus = 503;
  await main.getByRole('button', { name: `报告这句：${first.text}`, exact: true }).click();
  await main.getByRole('radio', { name: '听不懂', exact: true }).check();
  await main.getByRole('button', { name: '提交', exact: true }).click();
  await expect(main.getByRole('alert').filter({ hasText: '没有提交成功，请重试。' })).toBeVisible();
  await expect(main.getByTestId('sentence-report-status')).toHaveCount(0);
  expect(reports.reportPosts).toHaveLength(1); assertSameMedia(state);
});

// ---- T34A: generation records ----

test('T34A / F14.1, F14.3: generation records show each task status, reserved cost upper bound and deletions, read-only', async ({ page, context, baseURL }) => {
  const { state, main } = await setupData(page, context, baseURL);
  await openLibrary(page, main);
  await openMore(page);
  await main.getByRole('button', { name: '生成记录', exact: true }).click();
  await expect(main.getByRole('heading', { name: '生成记录', exact: true })).toBeVisible();
  const rows = main.getByTestId('generation-record');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText('我想在酒店办理入住，确认预订。'); await expect(rows.nth(0)).toContainText('已完成'); await expect(rows.nth(0)).toContainText('预留费用上限 US$0.48');
  await expect(rows.nth(1)).toContainText('失败'); await expect(rows.nth(1)).toContainText('预留费用上限 US$0.25');
  await expect(rows.nth(2)).toContainText('结果未知，没有自动重发'); await expect(rows.nth(2)).toContainText('预留费用上限 US$0.09');
  await expect(rows.nth(3)).toContainText('（已删除的场景）'); await expect(rows.nth(3)).toContainText('已删除'); await expect(rows.nth(3)).toContainText('预留费用上限 US$0.06'); await expect(rows.nth(3)).toContainText('2026-10-17');
  await expect(main.getByTestId('deletion-event')).toHaveText(['删除了全部学习数据 · 2026-10-17']);
  await expect(main.getByText('预留费用是本产品为这次生成预先留出的上限，不是供应商的实际账单。')).toBeVisible();
  // Read-only: the only control is the way back.
  const section = main.getByTestId('generation-records');
  await expect(section.getByRole('button')).toHaveText(['返回我的场景']);
  await section.getByRole('button', { name: '返回我的场景', exact: true }).click();
  await expect(main.getByRole('heading', { name: '我的场景', exact: true })).toBeVisible();
  expect(state.recordReads).toEqual([ownerA]); nothingElse(state); expect(state.deletes).toEqual([]);
});

test('T34A / F14.1: when records cannot be read the page says so instead of showing an empty history', async ({ page, context, baseURL }) => {
  const { state, main } = await setupData(page, context, baseURL);
  state.recordStatus = 503;
  await openLibrary(page, main);
  await openMore(page);
  await main.getByRole('button', { name: '生成记录', exact: true }).click();
  await expect(main.getByRole('alert').filter({ hasText: '暂时无法读取生成记录，请重试。' })).toBeVisible();
  await expect(main.getByText('还没有生成记录。')).toHaveCount(0);
  state.recordStatus = 200;
  await main.getByRole('button', { name: '重试读取记录', exact: true }).click();
  await expect(main.getByTestId('generation-record')).toHaveCount(4);
});

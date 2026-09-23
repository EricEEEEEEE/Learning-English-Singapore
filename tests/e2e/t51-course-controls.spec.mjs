import { test, expect } from '@playwright/test';

async function open(page) {
  await page.route('**/api/auth/session', route => route.fulfill({ json: { authenticated: false, accountKey: null } }));
  await page.goto('/');
  await page.getByRole('button', { name: /^简体中文/ }).click();
  await page.getByRole('button', { name: '合成课程演示', exact: true }).click();
  await page.getByRole('button', { name: '打开听练操作', exact: true }).click();
  const panel = page.getByRole('region', { name: '听练操作（无真实音视频）', exact: true });
  await expect(panel).toBeVisible();
  return panel;
}

async function current(panel, text) {
  await expect(panel.getByTestId('current-course-sentence')).toHaveText(text);
}

const lines = ['Hello. Is this your first time?', 'Yes. My child is playing today.', 'Would you like to sit here?', 'Thank you. That would be nice.'];

for (const [scope, order] of [
  ['重复整段', [0, 1, 2, 3, 0]],
  ['重复本章', [0, 1, 0, 1, 0]],
  ['重复本句', [0, 0, 0, 0, 0]],
]) test(`T51: ${scope} advances the fixed course and keeps the rendered speaker correct`, async ({ page }) => {
  const panel = await open(page);
  const original = await page.getByTestId('course-line').allTextContents();
  await panel.getByRole('button', { name: scope, exact: true }).click();
  await panel.getByRole('button', { name: '开始示范（无声音）', exact: true }).click();
  for (const index of order) {
    await current(panel, lines[index]);
    await expect(panel.getByTestId('current-course-speaker')).toHaveText(index % 2 === 0 ? 'Another parent' : 'You');
    await panel.getByRole('button', { name: '模拟本句结束', exact: true }).click();
  }
  expect(await page.getByTestId('course-line').allTextContents()).toEqual(original);
  await expect(panel).toContainText('手动模拟');
  await expect(panel).toContainText('不代表实际播放或录音');
});

test('T51: A-B repeats the selected interval and invalid intervals cannot change current playback', async ({ page }) => {
  const panel = await open(page);
  await panel.getByLabel('起始句', { exact: true }).selectOption({ index: 1 });
  await panel.getByLabel('结束句', { exact: true }).selectOption({ index: 2 });
  await panel.getByRole('button', { name: '重复所选区间', exact: true }).click();
  await panel.getByRole('button', { name: '开始示范（无声音）', exact: true }).click();
  for (const index of [1, 2, 1]) {
    await current(panel, lines[index]);
    await panel.getByRole('button', { name: '模拟本句结束', exact: true }).click();
  }
  await current(panel, lines[2]);
  await panel.getByLabel('起始句', { exact: true }).selectOption({ index: 3 });
  await panel.getByLabel('结束句', { exact: true }).selectOption({ index: 0 });
  await expect(panel.getByRole('button', { name: '重复所选区间', exact: true })).toBeDisabled();
  await expect(panel).toContainText('结束句不能早于起始句');
  await current(panel, lines[2]);
});

test('T51: entering practice lets the same partner start, stays silent without input, and returns to demonstration', async ({ page }) => {
  const panel = await open(page);
  await panel.getByRole('button', { name: '开始示范（无声音）', exact: true }).click();
  const first = await panel.getByTestId('current-course-sentence').innerText();
  await panel.getByRole('button', { name: '模拟本句结束', exact: true }).click();
  await current(panel, lines[1]);
  await panel.getByRole('button', { name: '切换对练演示', exact: true }).click();
  await current(panel, first);
  await expect(panel.getByTestId('current-course-speaker')).toHaveText('Another parent');
  await expect(panel).toContainText('对练演示');
  await expect(panel).toContainText('尚未接入自由对话');
  await panel.getByRole('button', { name: '模拟本句结束', exact: true }).click();
  await expect(panel.getByRole('button', { name: '模拟本句结束', exact: true })).toBeDisabled();
  await expect(panel).toContainText('可以先看示范，不需要开口');
  await panel.getByRole('button', { name: '只看示范', exact: true }).click();
  await expect(panel.getByRole('button', { name: '开始示范（无声音）', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: '开始示范（无声音）', exact: true }).click();
  await current(panel, lines[0]);
  await panel.getByRole('button', { name: '模拟本句结束', exact: true }).click();
  await current(panel, lines[1]);
  expect(await page.locator('audio, video').count()).toBe(0);
});

test('T51: switching samples clears active playback and closing controls preserves the selected sample', async ({ page }) => {
  const panel = await open(page);
  await panel.getByLabel('起始句', { exact: true }).selectOption({ index: 0 });
  await panel.getByLabel('结束句', { exact: true }).selectOption({ index: 1 });
  await panel.getByRole('button', { name: '重复所选区间', exact: true }).click();
  await panel.getByRole('button', { name: '开始示范（无声音）', exact: true }).click();
  await panel.getByRole('button', { name: '模拟本句结束', exact: true }).click();
  await page.getByLabel('选择固定样本', { exact: true }).selectOption('food-order');
  await current(panel, 'Hello. What would you like?');
  await expect(panel.getByTestId('current-course-speaker')).toHaveText('Food seller');
  await expect(panel.getByRole('button', { name: '模拟本句结束', exact: true })).toBeDisabled();
  await panel.getByRole('button', { name: '开始示范（无声音）', exact: true }).click();
  await panel.getByRole('button', { name: '模拟本句结束', exact: true }).click();
  await current(panel, 'Could I have this, less spicy?');
  for (const text of ['Let me check for you.', 'Thank you. I can wait.', 'Hello. What would you like?']) {
    await panel.getByRole('button', { name: '模拟本句结束', exact: true }).click();
    await current(panel, text);
  }
  await panel.getByRole('button', { name: '收起听练操作', exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByLabel('选择固定样本', { exact: true })).toHaveValue('food-order');
  await expect(page.getByTestId('course-line').first()).toContainText('Hello. What would you like?');
});

test('T51: repeat sentence and chapter follow the current third sentence rather than always restarting the first chapter', async ({ page }) => {
  const panel = await open(page);
  await panel.getByRole('button', { name: '开始示范（无声音）', exact: true }).click();
  await panel.getByRole('button', { name: '模拟本句结束', exact: true }).click();
  await panel.getByRole('button', { name: '模拟本句结束', exact: true }).click();
  await current(panel, lines[2]);
  await panel.getByRole('button', { name: '重复本句', exact: true }).click();
  await panel.getByRole('button', { name: '开始示范（无声音）', exact: true }).click();
  await panel.getByRole('button', { name: '模拟本句结束', exact: true }).click();
  await current(panel, lines[2]);
  await panel.getByRole('button', { name: '重复本章', exact: true }).click();
  await panel.getByRole('button', { name: '开始示范（无声音）', exact: true }).click();
  for (const index of [2, 3, 2]) {
    await current(panel, lines[index]);
    await panel.getByRole('button', { name: '模拟本句结束', exact: true }).click();
  }
});

for (const locale of [
  { choice: 'Bahasa Indonesia', entry: 'Demo pelajaran sintetis', open: 'Buka kontrol latihan', start: 'Mulai contoh (tanpa suara)', end: 'Simulasikan akhir kalimat', practice: 'Demo percakapan', listen: 'Lihat contoh saja' },
  { choice: '日本語', entry: '合成レッスンのデモ', open: '練習操作を開く', start: '例を開始（音声なし）', end: '文の終了をシミュレート', practice: '会話練習デモに切り替え', listen: '例を見るだけ' },
  { choice: '한국어', entry: '합성 수업 데모', open: '연습 조작 열기', start: '예시 시작 (소리 없음)', end: '문장 종료 시뮬레이션', practice: '대화 연습 데모로 전환', listen: '예시만 보기' },
  { choice: 'हिन्दी', entry: 'सिंथेटिक पाठ का डेमो', open: 'अभ्यास नियंत्रण खोलें', start: 'उदाहरण शुरू करें (बिना आवाज़)', end: 'वाक्य का अंत अनुकरण करें', practice: 'बातचीत अभ्यास का डेमो', listen: 'केवल उदाहरण देखें' },
]) test(`T51: ${locale.choice} can operate a silent example and partner-led practice`, async ({ page }) => {
  await page.route('**/api/auth/session', route => route.fulfill({ json: { authenticated: false } }));
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(`^${locale.choice}`) }).click();
  await page.getByRole('button', { name: locale.entry, exact: true }).click();
  await page.getByRole('button', { name: locale.open, exact: true }).click();
  await page.getByRole('button', { name: locale.start, exact: true }).click();
  await expect(page.getByTestId('current-course-sentence')).toHaveText(lines[0]);
  await page.getByRole('button', { name: locale.end, exact: true }).click();
  await expect(page.getByTestId('current-course-sentence')).toHaveText(lines[1]);
  await page.getByRole('button', { name: locale.practice, exact: true }).click();
  await expect(page.getByTestId('current-course-sentence')).toHaveText(lines[0]);
  await page.getByRole('button', { name: locale.listen, exact: true }).click();
  await expect(page.getByRole('button', { name: locale.start, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
});

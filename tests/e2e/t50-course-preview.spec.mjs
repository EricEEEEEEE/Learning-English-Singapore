import { test, expect } from '@playwright/test';

const locales = [
  { code: 'zh-Hans', choice: '简体中文', entry: '合成课程演示', back: '返回登录选择' },
  { code: 'id', choice: 'Bahasa Indonesia', entry: 'Demo pelajaran sintetis', back: 'Kembali ke pilihan masuk' },
  { code: 'ja', choice: '日本語', entry: '合成レッスンのデモ', back: 'ログイン選択に戻る' },
  { code: 'ko', choice: '한국어', entry: '합성 수업 데모', back: '로그인 선택으로 돌아가기' },
  { code: 'hi', choice: 'हिन्दी', entry: 'सिंथेटिक पाठ का डेमो', back: 'साइन इन विकल्पों पर वापस जाएँ' },
];

const notices = {
  'zh-Hans': ['固定合成样本', '不是 AI 实时生成', '无真实声音和视频', '不用于能力评估', '辅助语言尚未经母语审查'],
  id: ['Sampel sintetis tetap', 'Bukan hasil AI waktu nyata', 'Tanpa audio atau video nyata', 'Bukan untuk penilaian kemampuan', 'Bahasa bantuan belum ditinjau penutur asli'],
  ja: ['固定の合成サンプル', 'AIによるリアルタイム生成ではありません', '実際の音声や動画はありません', '能力評価には使用しません', '補助言語は母語話者による未確認です'],
  ko: ['고정 합성 샘플', '실시간 AI 생성이 아닙니다', '실제 음성과 영상이 없습니다', '능력 평가에 사용하지 않습니다', '보조 언어는 원어민 검토 전입니다'],
  hi: ['तय सिंथेटिक नमूने', 'यह रीयल-टाइम AI निर्माण नहीं है', 'असली आवाज़ या वीडियो नहीं है', 'क्षमता आकलन के लिए नहीं', 'सहायक भाषा की मूल वक्ता से समीक्षा बाकी है'],
};

async function checkRoles(preview) {
  const roles = preview.getByTestId('course-role');
  await expect(roles).toHaveCount(2);
  const labels = new Map();
  for (const role of await roles.all()) {
    await expect(role).toBeVisible();
    const label = (await role.innerText()).trim();
    const id = await role.getAttribute('data-role-id');
    expect(label.length).toBeGreaterThan(0);
    expect(id).toBeTruthy();
    labels.set(id, label);
  }
  expect(labels.size).toBe(2);
  for (const line of await preview.getByTestId('course-line').all()) {
    const id = await line.getAttribute('data-role-id');
    expect(labels.has(id)).toBe(true);
    await expect(line.getByTestId('course-speaker')).toHaveText(labels.get(id));
  }
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/session', route => route.fulfill({ json: { authenticated: false, accountKey: null } }));
  await page.goto('/');
});

for (const locale of locales) test(`T50: ${locale.code} anonymous learner can open two samples and return`, async ({ page }) => {
  await page.getByRole('button', { name: new RegExp(`^${locale.choice}`) }).click();
  await page.getByRole('button', { name: locale.entry, exact: true }).click();
  await expect(page.getByRole('heading', { name: locale.entry, exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', locale.code);
  const preview = page.getByTestId('synthetic-course-preview');
  for (const notice of notices[locale.code]) await expect(preview).toContainText(notice);
  const choices = preview.getByRole('combobox');
  const options = choices.getByRole('option');
  expect(await options.count()).toBeGreaterThanOrEqual(2);
  const goal = preview.getByTestId('course-goal');
  const lines = preview.locator('[data-testid="course-line"] [lang="en"]');
  const firstGoal = await goal.innerText();
  const firstLines = await lines.allTextContents();
  expect(firstGoal.trim().length).toBeGreaterThan(0);
  expect(firstLines.length).toBeGreaterThanOrEqual(2);
  await checkRoles(preview);
  expect(await preview.locator(`[data-testid="course-support"][lang="${locale.code}"]`).count()).toBeGreaterThan(0);
  await choices.selectOption({ index: 1 });
  await expect(goal).not.toHaveText(firstGoal);
  expect(await lines.allTextContents()).not.toEqual(firstLines);
  await checkRoles(preview);
  for (const notice of notices[locale.code]) await expect(preview).toContainText(notice);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
  await page.getByRole('button', { name: locale.back, exact: true }).click();
  await expect(preview).toHaveCount(0);
  await expect(page.getByRole('button', { name: locale.entry, exact: true })).toBeVisible();
});

test('T50: preview declares its actual limits and keyboard-only navigation reaches samples and return', async ({ page }) => {
  await page.getByRole('button', { name: /^简体中文/ }).click();
  const entry = page.getByRole('button', { name: '合成课程演示', exact: true });
  for (let index = 0; index < 40 && !(await entry.evaluate(element => element === document.activeElement)); index++) await page.keyboard.press('Tab');
  await expect(entry).toBeFocused();
  await page.keyboard.press('Enter');
  const preview = page.getByTestId('synthetic-course-preview');
  await expect(preview).toContainText('固定合成样本');
  await expect(preview).toContainText('不是 AI 实时生成');
  await expect(preview).toContainText('无真实声音和视频');
  await expect(preview).toContainText('不用于能力评估');
  await expect(preview).toContainText('辅助语言尚未经母语审查');
  const select = preview.getByRole('combobox');
  for (let index = 0; index < 30 && !(await select.evaluate(element => element === document.activeElement)); index++) await page.keyboard.press('Tab');
  await expect(select).toBeFocused();
  const before = await select.inputValue();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(select).not.toHaveValue(before);
  const back = page.getByRole('button', { name: '返回登录选择', exact: true });
  for (let index = 0; index < 30 && !(await back.evaluate(element => element === document.activeElement)); index++) await page.keyboard.press('Tab');
  await expect(back).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(preview).toHaveCount(0);
});

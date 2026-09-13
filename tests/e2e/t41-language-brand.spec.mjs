import { test, expect } from '@playwright/test';

test.use({ hasTouch: true });
test.beforeEach(async ({ page }) => { await page.goto('/'); });

const choices = ['简体中文', 'Bahasa Indonesia', '日本語', '한국어', 'हिन्दी'];

test('T41 / F4.5,F13.3: only the five approved auxiliary languages are offered', async ({ page }) => {
  for (const choice of choices) {
    await expect(page.getByRole('button', { name: new RegExp(`^${choice}`) })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: /^English(?:\s|$)/ })).toHaveCount(0);
  await expect(page.getByRole('group', { name: /先选你熟悉的语言/ }).getByRole('button')).toHaveCount(5);
});

test('T41 / F13.6: the integration slogan stays beside the brand throughout the flow', async ({ page }) => {
  const header = page.getByRole('banner');
  const slogan = header.getByText('帮你融入新加坡，相信自己可以做到。', { exact: true });
  await expect(slogan).toBeVisible();
  await expect(header).toContainText('Learning Englishin Singapore');
  await page.getByRole('button', { name: /^简体中文/ }).tap();
  await expect(slogan).toBeVisible();
  await page.getByRole('button', { name: '预览逐题引导', exact: true }).tap();
  await expect(slogan).toBeVisible();
});

for (const locale of [
  { code: 'ko', choice: '한국어', login: '로그인 방법 선택', guide: '단계별 안내 미리보기', question: '현재 질문' },
  { code: 'hi', choice: 'हिन्दी', login: 'साइन इन करने का तरीका चुनें', guide: 'चरण-दर-चरण मार्गदर्शिका देखें', question: 'मौजूदा सवाल' },
]) {
  test(`T41 / F13.1,F13.3: ${locale.code} enters, continues and persists in the selected language`, async ({ page }) => {
    await page.getByRole('button', { name: new RegExp(`^${locale.choice}`) }).tap();
    await expect(page.locator('html')).toHaveAttribute('lang', locale.code);
    await expect(page.getByRole('heading', { name: locale.login, exact: true })).toBeVisible();
    await page.getByRole('button', { name: locale.guide, exact: true }).tap();
    await expect(page.getByRole('article', { name: locale.question, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', locale.code);
    await expect(page.getByRole('article', { name: locale.question, exact: true })).toBeVisible();
  });
}

test('T41 / F13.1,F13.3: Korean and Hindi remain usable through profile, scenario and listening/practice preview', async ({ page }) => {
  for (const locale of [
    { choice: '한국어', guide: '단계별 안내 미리보기', finish: '안내 끝내기', profile: '학습 시작점과 도움', scene: '연습할 일 선택', school: '학교와 선생님과의 대화', confirm: '확인하고 준비 미리보기', preparing: '준비 중(흐름 데모)', preview: '듣기와 말하기 미리보기', practice: '직접 연습하기', practiceTitle: '먼저 듣고, 말해 보세요' },
    { choice: 'हिन्दी', guide: 'चरण-दर-चरण मार्गदर्शिका देखें', finish: 'मार्गदर्शिका समाप्त करें', profile: 'सीखने की शुरुआत और मदद', scene: 'अभ्यास के लिए स्थिति चुनें', school: 'स्कूल और शिक्षक से बातचीत', confirm: 'पुष्टि करें और तैयारी देखें', preparing: 'तैयारी हो रही है (फ़्लो डेमो)', preview: 'सुनने और बोलने का पूर्वावलोकन', practice: 'मैं अभ्यास करूँगा/करूँगी', practiceTitle: 'पहले सुनें, फिर बोलने की कोशिश करें' },
  ]) {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('button', { name: new RegExp(`^${locale.choice}`) }).tap();
    await page.getByRole('button', { name: locale.guide, exact: true }).tap();
    await page.getByRole('button', { name: locale.finish, exact: true }).tap();
    await expect(page.getByRole('region', { name: locale.profile, exact: true })).toBeVisible();
    await page.getByRole('button', { name: locale.scene, exact: true }).tap();
    await page.getByRole('button', { name: locale.school, exact: true }).tap();
    await page.getByRole('button', { name: locale.confirm, exact: true }).tap();
    await expect(page.getByRole('heading', { name: locale.preparing, exact: true })).toBeVisible();
    const details = page.getByText(/준비 제어|तैयारी नियंत्रण/, { exact: true });
    await details.click();
    for (let part = 0; part < 3; part += 1) {
      await page.locator('.simulation-controls button:enabled').first().click();
    }
    await page.getByRole('button', { name: locale.preview, exact: true }).tap();
    await page.getByRole('button', { name: locale.practice, exact: true }).tap();
    await expect(page.getByRole('heading', { name: locale.practiceTitle, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: locale.practiceTitle, exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', locale.choice === '한국어' ? 'ko' : 'hi');
  }
});

test('T41 / F13.2: Korean and Hindi controls fit at large text on a small phone', async ({ page }) => {
  for (const locale of [
    { choice: '한국어', settings: '화면 설정', large: '큰 글자' },
    { choice: 'हिन्दी', settings: 'डिस्प्ले सेटिंग', large: 'बड़ा टेक्स्ट' },
  ]) {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('button', { name: new RegExp(`^${locale.choice}`) }).tap();
    await page.getByRole('button', { name: locale.settings, exact: true }).tap();
    await page.getByRole('checkbox', { name: locale.large, exact: true }).check();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
    for (const control of await page.locator('button:visible').all()) {
      const box = await control.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  }
});

test('T41 / F13.3: a stale English preference returns to language choice without losing display settings', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('le-sg-entry-preferences-v1', JSON.stringify({ language: 'en', largeText: true, reducedMotion: true })));
  await page.reload();
  await expect(page.getByRole('button', { name: /^English(?:\s|$)/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^한국어/ })).toBeVisible();
  await page.getByRole('button', { name: /^简体中文/ }).tap();
  await page.getByRole('button', { name: '显示设置', exact: true }).tap();
  await expect(page.getByRole('checkbox', { name: '大字', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '减少动画', exact: true })).toBeChecked();
});

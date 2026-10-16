import { test, expect } from '@playwright/test';

const sceneTitle = '你想在哪个场景下学习英语？';
const backgroundTitle = '再给几个关键词，让场景更贴近你';
const ownerA = { authenticated: true, accountKey: 't66-synthetic-owner-a' };
const ownerB = { authenticated: true, accountKey: 't66-synthetic-owner-b' };
const customScene = '我想在社区修自行车时，问清刹车维修的费用和取车时间。';

test.use({ locale: 'zh-CN' });
test.beforeEach(async ({ context, baseURL }) => {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL).origin) throw new Error('T66 must not contact external services.');
    if (url.pathname.startsWith('/api/generation') && route.request().method() !== 'GET') {
      throw new Error('T66 navigation must not create a generation task.');
    }
    return route.continue();
  });
});

async function openScene(page, owner = ownerA) {
  await page.route('**/api/auth/session', route => route.fulfill({ json: owner }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: sceneTitle, exact: true })).toBeVisible();
  return page.getByRole('textbox', { name: sceneTitle, exact: true });
}

test('T66 / K2.1: scene page has one free input, three examples and one next action', async ({ page }) => {
  await openScene(page);
  await expect(page.getByRole('textbox')).toHaveCount(1);
  await expect(page.getByText('用你熟悉的语言', { exact: false })).toBeVisible();
  for (const name of ['家长会', 'Party', '其他场景']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('group', { name: '场景示例', exact: true }).getByRole('button')).toHaveCount(3);
  await expect(page.getByRole('button', { name: '下一步', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /开始认识自己|预览逐题引导|生成场景/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Google/ })).toHaveCount(0);
});

test('T66 / K2.2,K2.3: an unlisted mother-tongue scene advances unchanged and survives the back action', async ({ page }) => {
  const input = await openScene(page);
  await input.fill(customScene);
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(page.getByRole('heading', { name: backgroundTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: sceneTitle, exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Party', exact: true })).toHaveCount(0);
  await expect(page.getByText(customScene, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(input).toHaveValue(customScene);
});

for (const [name, meaning] of [['家长会', /老师/], ['Party', /聚会/], ['其他场景', /酒店|工作|生活/]]) {
  test(`T66 / K2.2: ${name} fills an editable example without submitting`, async ({ page }) => {
    const input = await openScene(page);
    await page.getByRole('button', { name, exact: true }).click();
    await expect(input).toHaveValue(meaning);
    await expect(input).toBeFocused();
    await expect(page.getByRole('heading', { name: backgroundTitle, exact: true })).toHaveCount(0);
    const edited = `${await input.inputValue()} 我还想聊社区活动。`;
    await input.fill(edited);
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await expect(page.getByText(edited, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await expect(input).toHaveValue(edited);
  });
}

test('T66 / K2.3: empty and whitespace descriptions get an accessible inline error and create no task', async ({ page }) => {
  const input = await openScene(page);
  for (const value of ['', ' \n\t　']) {
    await input.fill(value);
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('先简单说说你想准备的场景');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    const errorId = await page.getByRole('alert').getAttribute('id');
    expect((await input.getAttribute('aria-describedby')).split(/\s+/)).toContain(errorId);
    await expect(input).toBeFocused();
    await expect(page.getByRole('heading', { name: sceneTitle, exact: true })).toBeVisible();
  }
  await input.fill(customScene);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(page.getByRole('heading', { name: backgroundTitle, exact: true })).toBeVisible();
});

test('T66 / K2.3: returning and changing a scene replaces the old description on the next page', async ({ page }) => {
  const input = await openScene(page);
  const second = '我要在图书馆问怎么参加免费的社区活动。';
  await input.fill(customScene);
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await input.fill(second);
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(page.getByText(second, { exact: true })).toBeVisible();
  await expect(page.getByText(customScene, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(input).toHaveValue(second);
});

test('T66 / K2.1: the 2000-character input bound preserves the accepted text across navigation', async ({ page }) => {
  const input = await openScene(page);
  await input.fill('场'.repeat(2001));
  const accepted = await input.inputValue();
  expect(accepted).toBe('场'.repeat(2000));
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(input).toHaveValue(accepted);
});

test('T66 / K1.2,K2.3: an account switch on the next page cannot expose the previous description', async ({ page }) => {
  let owner = ownerA;
  await page.route('**/api/auth/session', route => route.fulfill({ json: owner }));
  await page.goto('/');
  await page.getByRole('textbox', { name: sceneTitle, exact: true }).fill(customScene);
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(page.getByText(customScene, { exact: true })).toBeVisible();
  owner = ownerB;
  await page.evaluate(() => window.dispatchEvent(new Event('le-sg-auth-invalid')));
  await expect(page.getByRole('textbox', { name: sceneTitle, exact: true })).toHaveValue('');
  await expect(page.getByText(customScene, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: backgroundTitle, exact: true })).toHaveCount(0);
});

const languages = [
  { code: 'zh-Hans', title: sceneTitle, examples: ['家长会', 'Party', '其他场景'], next: '下一步', back: '返回', background: backgroundTitle, sample: '我想和邻居聊社区花园。', error: '先简单说说你想准备的场景。' },
  { code: 'id', title: 'Dalam situasi apa Anda ingin belajar bahasa Inggris?', examples: ['Pertemuan orang tua dan guru', 'Pesta', 'Situasi lain'], next: 'Lanjut', back: 'Kembali', background: 'Beri beberapa kata kunci agar situasinya lebih sesuai dengan Anda', sample: 'Saya ingin berbicara dengan tetangga tentang kebun bersama.', error: 'Jelaskan singkat situasi yang ingin Anda siapkan.' },
  { code: 'ja', title: 'どんな場面で英語を学びたいですか？', examples: ['保護者面談', 'パーティー', 'その他の場面'], next: '次へ', back: '戻る', background: 'キーワードで、もっと自分に合った場面に', sample: '近所の人と地域の庭について話したいです。', error: '準備したい場面を少し教えてください。' },
  { code: 'ko', title: '어떤 상황에서 영어를 배우고 싶으세요?', examples: ['학부모 면담', '파티', '다른 상황'], next: '다음', back: '뒤로', background: '키워드로 상황을 더 구체적으로 알려 주세요', sample: '이웃과 공동 정원에 대해 이야기하고 싶어요.', error: '준비하고 싶은 상황을 간단히 알려 주세요.' },
  { code: 'hi', title: 'आप किस परिस्थिति में अंग्रेज़ी सीखना चाहते हैं?', examples: ['अभिभावक-शिक्षक बैठक', 'पार्टी', 'अन्य परिस्थिति'], next: 'आगे', back: 'वापस', background: 'कुछ शब्दों से परिस्थिति को अपने अनुसार बनाएँ', sample: 'मैं पड़ोसी से सामुदायिक बगीचे के बारे में बात करना चाहता हूँ।', error: 'जिस परिस्थिति की तैयारी करनी है, उसे थोड़ा बताएँ।' },
];

for (const language of languages) {
  test(`T66 / K1.3,K2: ${language.code} has localized choices, feedback and reversible free input`, async ({ page }) => {
    await openScene(page);
    await page.getByRole('combobox').selectOption(language.code);
    await expect(page.locator('html')).toHaveAttribute('lang', language.code);
    const input = page.getByRole('textbox', { name: language.title, exact: true });
    for (const name of language.examples) await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    await page.getByRole('button', { name: language.next, exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(language.error);
    await input.fill(language.sample);
    await page.getByRole('button', { name: language.next, exact: true }).click();
    await expect(page.getByRole('heading', { name: language.background, exact: true })).toBeVisible();
    await expect(page.getByText(language.sample, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: language.back, exact: true }).click();
    await expect(input).toHaveValue(language.sample);
    await page.getByRole('combobox').selectOption(language.code === 'zh-Hans' ? 'ko' : 'zh-Hans');
    await expect(page.getByRole('textbox')).toHaveValue(language.sample);
  });
}

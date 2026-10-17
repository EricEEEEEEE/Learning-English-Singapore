import { test, expect } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// C7 (user 2026-10-17: finish the product before real video). T30A: a library of 36 local example scenes,
// grouped like spec 7.2 / samples A-F, each with a short description and the six optional keywords in all five
// help languages. T31A: every help-language copy record and every seed is walked for missing keys, empty strings,
// Chinese text leaking into another language and English fallbacks. Nothing here calls a model.
const languages = ['zh-Hans', 'id', 'ja', 'ko', 'hi'];
const keywordKeys = ['location', 'learnerRole', 'partnerRole', 'topic', 'goal', 'special'];
const appDir = fileURLToPath(new URL('../../app/', import.meta.url));

const han = /\p{Script=Han}/u, kana = /[\p{Script=Hiragana}\p{Script=Katakana}]/u, hangul = /\p{Script=Hangul}/u, devanagari = /\p{Script=Devanagari}/u;
// Characters that exist only in simplified Chinese (Japanese uses other forms), so Japanese text containing one was
// most likely copied from the Chinese copy.
const simplifiedOnly = /[们这说么吗过还让给听场练现课习对话请问为样产选择确认关闭开启录频视东车门时间钟员实际击边帮]/u;
const latinWords = value => (value.match(/[A-Za-z]{2,}/g) ?? []).length;

// What each language may not contain. Mixed help text keeps product names and short English examples, so English
// words are allowed; whole English sentences without any text of the language are reported as fallbacks.
function languageIssues(language, value) {
  const issues = [];
  if (language === 'ja' && simplifiedOnly.test(value)) issues.push('simplified Chinese character in Japanese');
  if ((language === 'id' || language === 'ko' || language === 'hi') && han.test(value)) issues.push('Chinese character');
  if ((language === 'id' || language === 'hi') && (kana.test(value) || hangul.test(value))) issues.push('Japanese or Korean script');
  if (language === 'ko' && kana.test(value)) issues.push('Japanese script');
  if (language === 'id' && devanagari.test(value)) issues.push('Hindi script');
  const own = { 'zh-Hans': han, ja: new RegExp(`${han.source}|${kana.source}`, 'u'), ko: hangul, hi: devanagari }[language];
  if (own && !own.test(value) && latinWords(value) >= 3) issues.push('English fallback');
  return issues;
}

// Explicit exceptions: path -> reason. Keep this list short and specific.
// None are needed today; add one only with a reason.
const allowed = {};

function walk(path, reference, value, language, issues) {
  if (typeof reference === 'function') {
    if (typeof value !== 'function') { issues.push(`${path}: missing function`); return; }
    const sample = value('2', 'Sample');
    if (typeof sample !== 'string' || !sample.trim()) issues.push(`${path}: empty result`);
    else for (const issue of languageIssues(language, sample.replace('Sample', ''))) if (!allowed[path]) issues.push(`${path}: ${issue}`);
    return;
  }
  if (typeof reference === 'string') {
    if (typeof value !== 'string') { issues.push(`${path}: missing`); return; }
    if (!value.trim()) { issues.push(`${path}: empty`); return; }
    for (const issue of languageIssues(language, value)) if (!allowed[path]) issues.push(`${path}: ${issue}`);
    return;
  }
  if (Array.isArray(reference)) {
    if (!Array.isArray(value) || value.length !== reference.length) { issues.push(`${path}: array length differs`); return; }
    reference.forEach((item, index) => walk(`${path}[${index}]`, item, value[index], language, issues));
    return;
  }
  if (reference && typeof reference === 'object') {
    if (!value || typeof value !== 'object') { issues.push(`${path}: missing`); return; }
    for (const key of Object.keys(value)) if (!Object.hasOwn(reference, key)) issues.push(`${path}.${key}: extra key not in Chinese`);
    for (const key of Object.keys(reference)) walk(`${path}.${key}`, reference[key], value[key], language, issues);
  }
}

// A record keyed by the five help languages, walked against its Chinese entry.
function auditRecord(name, record) {
  const issues = [];
  const keys = Object.keys(record).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...languages].sort())) return [`${name}: languages ${keys.join(',')}`];
  for (const language of languages) walk(`${name}.${language}`, record['zh-Hans'], record[language], language, issues);
  return issues;
}
const isLanguageRecord = value => !!value && typeof value === 'object' && !Array.isArray(value) && languages.some(language => Object.hasOwn(value, language));

// Older demo-route copy (T03-T06) is read through a function per language.
const byLanguage = { 'guide-copy.ts': ['guideCopy'], 'practice-copy.ts': ['practiceCopy'], 'profile-copy.ts': ['profileCopy'], 'scenario-copy.ts': ['scenarioCopy'] };
// Exports that are not help-language text, with the reason they are skipped.
const notCopy = {
  'entry-copy.ts': { languageChoices: 'each language is named in its own script on purpose' },
  'data-trust-copy.ts': { usd: 'number formatter', day: 'date formatter' },
  'guide-copy.ts': { questionText: 'key lookup over guideCopy data, covered by T03 tests', optionText: 'key lookup, covered by T03 tests', withNumber: 'number formatter' },
  'profile-copy.ts': { choiceText: 'key lookup, covered by T04/T05 tests', bandText: 'key lookup, covered by T04/T05 tests' },
  'practice-quality-copy.ts': { practiceQualityReviewed: 'review flag' },
  'scene-seed-copy.ts': {}, 'scene-confirm-copy.ts': {},
};

test('C7 T31A: every *-copy.ts export is a five-language record, a per-language function or an explained exception', async () => {
  const files = (await readdir(appDir)).filter(file => file.endsWith('-copy.ts')).sort();
  expect(files).toEqual(expect.arrayContaining(['scene-seed-copy.ts', 'scene-confirm-copy.ts']));
  const unexplained = [];
  for (const file of files) {
    const module = await import(`../../app/${file}`);
    for (const [name, value] of Object.entries(module)) {
      // `__esModule` and `default` are added by the test runner's module interop, not by the copy file.
      if (name === '__esModule' || name === 'default') continue;
      if (isLanguageRecord(value) || byLanguage[file]?.includes(name) || notCopy[file]?.[name] || /Reviewed$/.test(name)) continue;
      unexplained.push(`${file}:${name}`);
    }
  }
  expect(unexplained).toEqual([]);
});

test('C7 T31A: no help language is missing a key, has an empty string, carries Chinese text or falls back to English', async () => {
  const files = (await readdir(appDir)).filter(file => file.endsWith('-copy.ts')).sort();
  const issues = [];
  let walked = 0;
  for (const file of files) {
    const module = await import(`../../app/${file}`);
    for (const [name, value] of Object.entries(module)) {
      if (isLanguageRecord(value)) { walked++; issues.push(...auditRecord(`${file}:${name}`, value)); }
      else if (byLanguage[file]?.includes(name)) {
        walked++;
        issues.push(...auditRecord(`${file}:${name}()`, Object.fromEntries(languages.map(language => [language, value(language)]))));
      }
    }
  }
  // 11 records before C7 + 4 per-language functions = 15, plus the two C7 copy files.
  expect(walked).toBeGreaterThanOrEqual(17);
  expect(issues).toEqual([]);
});

test('C7 T31A: language records written inline in app/*.tsx carry no Chinese text in another language', async () => {
  // Copy that has not moved to a *-copy.ts file yet (for example the journey heading in learning-entry.tsx) is
  // scanned from source: one-line records and records that open with `lang: {` or `lang: [` on their own line.
  const files = (await readdir(appDir)).filter(file => file.endsWith('.tsx'));
  const issues = [];
  let records = 0;
  for (const file of files) {
    const lines = (await readFile(new URL(`../../app/${file}`, import.meta.url), 'utf8')).split('\n');
    let open = null;
    lines.forEach((text, index) => {
      const start = text.match(/^(\s*)'?(zh-Hans|id|ja|ko|hi)'?:\s*(.*)$/);
      if (!open && start) {
        records++;
        if (/^[{[]$/.test(start[3].trim())) { open = { language: start[2], indent: start[1] }; return; }
        for (const literal of start[3].match(/'[^']*'|"[^"]*"|`[^`]*`/g) ?? []) for (const issue of languageIssues(start[2], literal).filter(item => item !== 'English fallback')) issues.push(`${file}:${index + 1} ${start[2]}: ${issue}`);
        return;
      }
      if (open) {
        if (text.startsWith(`${open.indent}}`) || text.startsWith(`${open.indent}]`)) { open = null; return; }
        for (const literal of text.match(/'[^']*'|"[^"]*"|`[^`]*`/g) ?? []) for (const issue of languageIssues(open.language, literal).filter(item => item !== 'English fallback')) issues.push(`${file}:${index + 1} ${open.language}: ${issue}`);
      }
    });
  }
  expect(records).toBeGreaterThan(20);
  expect(issues).toEqual([]);
});

test('C7 T31A: the audit itself catches missing keys, empty text, Chinese in other languages and English fallbacks', async () => {
  const good = { 'zh-Hans': { a: '你好', b: ['一'] }, id: { a: 'Halo', b: ['satu'] }, ja: { a: 'こんにちは', b: ['一つ'] }, ko: { a: '안녕하세요', b: ['하나'] }, hi: { a: 'नमस्ते', b: ['एक'] } };
  expect(auditRecord('good', good)).toEqual([]);
  const bad = structuredClone(good);
  delete bad.id.a; bad.ja.b = []; bad.ko.a = '안녕 你好'; bad.hi.a = ' '; bad.ja.a = '这是说明';
  good.ko.b = ['Please try again later'];
  const found = auditRecord('bad', bad).join('\n');
  for (const expected of ['bad.id.a: missing', 'bad.ja.b: array length differs', 'bad.ko.a: Chinese character', 'bad.hi.a: empty', 'bad.ja.a: simplified Chinese character in Japanese']) expect(found).toContain(expected);
  expect(auditRecord('fallback', good).join('\n')).toContain('fallback.ko.b[0]: English fallback');
});

test('C7 T31A: the trial-language notice is part of the copy and is rendered on the main path and the demo entry', async () => {
  const { entryCopy, languageChoices } = await import('../../app/entry-copy.ts');
  for (const language of languages) {
    expect(entryCopy[language].trial.trim().length, language).toBeGreaterThan(0);
    expect(languageChoices.find(choice => choice.code === language)?.note.trim().length, language).toBeGreaterThan(0);
  }
  const main = await readFile(new URL('../../app/learning-entry.tsx', import.meta.url), 'utf8');
  expect(main).toMatch(/<footer[^>]*>[\s\S]*\{copy\.trial\}[\s\S]*<\/footer>/);
  const demo = await readFile(new URL('../../app/entry.tsx', import.meta.url), 'utf8');
  expect(demo).toContain('{copy.trial}');
});

// ---- T30A: 36 local example scenes ----

const categoryCounts = { school: 12, work: 8, clinic: 4, transport: 4, home: 4, food: 4 };
// Real organisations, products and brands must not appear in synthetic seeds (spec 7.1: seeds are product design).
const brands = /\b(MOE|MOM|HDB|HealthHub|SimplyGo|EZ-?Link|NETS|Grab|Gojek|NTUC|FairPrice|Shopee|Lazada|Starbucks|McDonald|Ya Kun|Toast Box|SMRT|SBS Transit)\b/;
// No nationality, race or job-class labels: anyone can enter from their own purpose (spec 7.2).
const labels = /(中国人|印度人|马来人|菲律宾|印尼人|外劳|女佣|客工|Chinese|Indian|Malay|Filipino|Indonesian|foreign worker|domestic helper|インド人|フィリピン|중국인|인도인|필리핀|भारतीय|फ़िलिपीनी)/i;

test('C7 T30A: 36 seeds, S01-S36, in six categories that match samples A-F, marked as not locally reviewed', async () => {
  const { sceneSeeds, sceneSeedCategories, sceneSeedsReviewed } = await import('../../lib/scene-seeds.ts');
  expect(sceneSeedsReviewed).toBe(false);
  expect(sceneSeeds.map(seed => seed.id)).toEqual(Array.from({ length: 36 }, (_, i) => `S${String(i + 1).padStart(2, '0')}`));
  expect(sceneSeedCategories.map(category => category.id)).toEqual(Object.keys(categoryCounts));
  expect(sceneSeedCategories.map(category => category.sample).sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  for (const [category, count] of Object.entries(categoryCounts)) expect(sceneSeeds.filter(seed => seed.category === category), category).toHaveLength(count);
  const { sceneSeedCopy } = await import('../../app/scene-seed-copy.ts');
  for (const language of languages) for (const category of sceneSeedCategories) expect(sceneSeedCopy[language].categories[category.id]?.trim().length, `${language}.${category.id}`).toBeGreaterThan(0);
});

test('C7 T30A: every seed has a short label, a short description and all six keywords in all five languages, within saved limits', async () => {
  const { sceneSeeds } = await import('../../lib/scene-seeds.ts');
  const { parseSceneRequirement } = await import('../../lib/scene-requirement-content.ts');
  const issues = [];
  for (const seed of sceneSeeds) {
    expect(Object.keys(seed.text).sort(), seed.id).toEqual([...languages].sort());
    for (const language of languages) {
      const text = seed.text[language], at = `${seed.id}.${language}`;
      expect(Object.keys(text).sort(), at).toEqual(['description', 'keywords', 'label']);
      expect(Object.keys(text.keywords).sort(), at).toEqual([...keywordKeys].sort());
      if (!text.label.trim() || text.label.length > 40) issues.push(`${at}.label length ${text.label.length}`);
      if (!text.description.trim() || text.description.length > 200) issues.push(`${at}.description length ${text.description.length}`);
      for (const key of keywordKeys) if (!text.keywords[key].trim() || text.keywords[key].length > 80) issues.push(`${at}.${key} length ${text.keywords[key].length}`);
      if (text.keywords.learnerRole === text.keywords.partnerRole) issues.push(`${at}: learner and partner roles are the same`);
      // The same check the server applies when the learner saves the picked seed.
      try { parseSceneRequirement({ revision: 1, content: { description: text.description, language, keywords: text.keywords } }); }
      catch { issues.push(`${at}: parseSceneRequirement rejected it`); }
      for (const value of [text.label, text.description, ...Object.values(text.keywords)]) {
        for (const issue of languageIssues(language, value)) issues.push(`${at}: ${issue} in "${value}"`);
        if (brands.test(value)) issues.push(`${at}: names a real organisation or brand in "${value}"`);
        if (labels.test(value)) issues.push(`${at}: nationality or job-class label in "${value}"`);
      }
      if (language !== 'zh-Hans' && text.description === seed.text['zh-Hans'].description) issues.push(`${at}: copied from Chinese`);
    }
  }
  expect(issues).toEqual([]);
});

test('C7 T30A: seeds are distinct starting points, not one template repeated', async () => {
  const { sceneSeeds } = await import('../../lib/scene-seeds.ts');
  for (const language of languages) {
    expect(new Set(sceneSeeds.map(seed => seed.text[language].label)).size, language).toBe(36);
    expect(new Set(sceneSeeds.map(seed => seed.text[language].description)).size, language).toBe(36);
  }
});

test('C7 T30A/T14A: the seed browser and confirmation copy exist in all five languages and are not copied from Chinese', async () => {
  const { sceneSeedCopy } = await import('../../app/scene-seed-copy.ts');
  const { sceneConfirmCopy } = await import('../../app/scene-confirm-copy.ts');
  for (const [name, record] of [['sceneSeedCopy', sceneSeedCopy], ['sceneConfirmCopy', sceneConfirmCopy]]) {
    expect(auditRecord(name, record)).toEqual([]);
    for (const language of languages.slice(1)) for (const [key, value] of Object.entries(record[language])) {
      if (typeof value === 'string') expect(value, `${name}.${language}.${key}`).not.toBe(record['zh-Hans'][key]);
    }
  }
  expect(sceneConfirmCopy['zh-Hans']).toMatchObject({ confirm: '确认生成', edit: '再改改' });
  for (const language of languages) expect(sceneConfirmCopy[language].length, language).toMatch(/50/);
});

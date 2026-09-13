import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const root = fileURLToPath(new URL('../..', import.meta.url));
const matrixPath = `${root}/docs/experiments/b1/matrix.csv`;
const recordsPath = `${root}/docs/experiments/b1/records.md`;
const protocolsPath = `${root}/docs/experiments/b1/protocols.md`;

function readRows() {
  const [headerLine, ...lines] = readFileSync(matrixPath, 'utf8').trim().split(/\r?\n/);
  const headers = headerLine.split(',');
  return lines.map(line => Object.fromEntries(headers.map((header, index) => [header, line.split(',')[index] ?? ''])));
}

const languages = ['zh-Hans', 'id', 'ja', 'ko', 'hi'];
const providers = ['WeChat', 'Google'];
const devices = ['iPhone-WeChat', 'iPhone-Safari', 'Android-WeChat', 'Android-Chrome', 'desktop-Chrome'];
const cases = ['same-device', 'cancel-retry', 'duplicate-callback', 'invalid-state', 'network-failure', 'external-browser'];

test('T42 / F13.1,F13.3: X1 covers every provider, device, path and current auxiliary language exactly once', () => {
  const rows = readRows().filter(row => row.experiment === 'X1');
  expect(rows).toHaveLength(devices.length * providers.length * languages.length * cases.length);

  const actual = rows.map(row => [row.device, row.provider, row.language, row.case_id].join('|'));
  const expected = devices.flatMap(device =>
    providers.flatMap(provider =>
      languages.flatMap(language =>
        cases.map(caseId => [device, provider, language, caseId].join('|')),
      ),
    ),
  );
  expect(new Set(actual).size).toBe(actual.length);
  expect(actual.toSorted()).toEqual(expected.toSorted());
  expect(rows.map(row => row.plan_id)).toEqual(
    Array.from({ length: expected.length }, (_, index) => `X1-${String(index + 1).padStart(3, '0')}`),
  );
});

test('T42 / F4.5,F13.1: English is never an auxiliary-language experiment and every X1 row remains unmeasured', () => {
  const rows = readRows().filter(row => row.experiment === 'X1');
  expect(new Set(rows.map(row => row.language))).toEqual(new Set(languages));
  expect(rows.some(row => row.language === 'en')).toBe(false);
  expect(rows.every(row => row.actual === '未测' && row.status === 'planned')).toBe(true);
  for (const row of rows) {
    const expectedText = row.provider === 'WeChat' && row.case_id === 'external-browser'
      ? '不适用（微信入口无Google外部接续）'
      : '同机授权准确接续；失败保持未登录；实录与回调证据';
    expect(row.expected).toBe(expectedText);
  }
});

test('T42 / F13.1: X1 records and protocol state the same five-language, 300-row contract', () => {
  const records = readFileSync(recordsPath, 'utf8');
  const protocols = readFileSync(protocolsPath, 'utf8');
  expect(records).toContain('| X1 | 300 | 5环境×2入口×5语言×6路径；');
  expect(records).toContain('语言依次为zh-Hans、id、ja、ko、hi；');
  expect(protocols).toContain('简体中文、印尼语、日语、韩语和Hindi五种辅助语言逐一检查');
  expect(records).not.toContain('5环境×2入口×4语言×6路径');
  expect(protocols).not.toContain('四种辅助语言逐一检查');
});

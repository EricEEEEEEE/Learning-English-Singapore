#!/usr/bin/env node
// C13-4 review table: the local expression library and the 36 seed scene cards go out as one CSV for a local
// reviewer, and only the review columns (status, reviewer, date, notes) come back in. Nothing here calls a model
// or the network. "local-reviewed" needs a reviewer and a date; any other status is refused.
//
//   node scripts/review-table.mjs export [out.csv]            write the table (stdout when no file)
//   node scripts/review-table.mjs import <table.csv>          take the review columns back into content/*.json
//   node scripts/review-table.mjs reports <reports.json> [out.csv]
//        add C9-5 "not like local English" reports ([{ text, reason }], no account data) as grouped rows
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const REVIEW_COLUMNS = ['kind', 'id', 'english', 'zh-Hans', 'id-ID', 'ja', 'ko', 'hi', 'register', 'useAdvice', 'plainAlternative', 'status', 'reviewer', 'date', 'notes'];
const LANGUAGES = [['zh-Hans', 'zh-Hans'], ['id-ID', 'id'], ['ja', 'ja'], ['ko', 'ko'], ['hi', 'hi']];
const STATUSES = ['unreviewed', 'ai-checked', 'local-reviewed'];

const quote = value => {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function serializeRows(rows) {
  return [REVIEW_COLUMNS.join(','), ...rows.map(row => REVIEW_COLUMNS.map(column => quote(row[column])).join(','))].join('\n') + '\n';
}

export function parseReviewTable(csv) {
  const records = [];
  let record = [], field = '', quoted = false, i = 0;
  const text = String(csv).replace(/^﻿/, '');
  while (i < text.length) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (char === '"') { quoted = false; i++; continue; }
      field += char; i++; continue;
    }
    if (char === '"' && field === '') { quoted = true; i++; continue; }
    if (char === ',') { record.push(field); field = ''; i++; continue; }
    if (char === '\r' && text[i + 1] === '\n') { i++; continue; }
    if (char === '\n') { record.push(field); records.push(record); record = []; field = ''; i++; continue; }
    field += char; i++;
  }
  if (quoted) throw new Error('Review table: unterminated quoted field');
  if (field !== '' || record.length) { record.push(field); records.push(record); }
  const [header, ...body] = records.filter(row => !(row.length === 1 && row[0] === ''));
  if (!header || header.join(',') !== REVIEW_COLUMNS.join(',')) throw new Error('Review table: unexpected header');
  return body.map((row, index) => {
    if (row.length !== REVIEW_COLUMNS.length) throw new Error(`Review table: row ${index + 2} has ${row.length} columns`);
    return Object.fromEntries(REVIEW_COLUMNS.map((column, at) => [column, row[at]]));
  });
}

const reviewColumns = review => ({ status: review.status, reviewer: review.reviewer ?? '', date: review.date ?? '', notes: review.notes ?? '' });

export function exportReviewTable({ expressions, cards, labels = {} }) {
  const rows = [
    ...expressions.map(entry => ({
      kind: 'expression', id: entry.id, english: entry.text,
      ...Object.fromEntries(LANGUAGES.map(([column, key]) => [column, entry.meaning[key] ?? ''])),
      register: entry.register, useAdvice: entry.useAdvice, plainAlternative: entry.plainAlternative ?? '',
      ...reviewColumns(entry.review),
    })),
    ...Object.entries(cards).map(([id, card]) => ({
      kind: 'card', id, english: [...card.flow.map((step, at) => `${at + 1}. ${step}`), `Chunks: ${card.chunks.join(' / ')}`, `Twist: ${card.twist}`].join('\n'),
      ...Object.fromEntries(LANGUAGES.map(([column, key]) => [column, labels[id]?.[key] ?? ''])),
      register: card.register, useAdvice: '', plainAlternative: '',
      ...reviewColumns(card.review),
    })),
  ];
  return serializeRows(rows);
}

function reviewFrom(row) {
  if (!STATUSES.includes(row.status)) throw new Error(`Review table: unknown status "${row.status}" for ${row.id}`);
  const reviewer = row.reviewer.trim() ? row.reviewer : null, date = row.date.trim() ? row.date : null;
  if (row.status === 'local-reviewed' && !reviewer) throw new Error(`Review table: local-reviewed ${row.id} needs a reviewer`);
  if (row.status === 'local-reviewed' && !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) throw new Error(`Review table: local-reviewed ${row.id} needs a date (YYYY-MM-DD)`);
  if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Review table: bad date for ${row.id}`);
  return { status: row.status, reviewer, date, notes: row.notes };
}

// Only the review columns are taken back; the English text and translations stay as they are in the records.
export function applyReviewTable({ expressions, cards }, rows) {
  const next = { expressions: structuredClone(expressions), cards: structuredClone(cards) };
  for (const row of rows) {
    if (row.kind === 'report') continue;
    if (row.kind === 'expression') {
      const entry = next.expressions.find(item => item.id === row.id);
      if (!entry) throw new Error(`Review table: unknown expression ${row.id}`);
      entry.review = reviewFrom(row);
    } else if (row.kind === 'card') {
      if (!Object.hasOwn(next.cards, row.id)) throw new Error(`Review table: unknown card ${row.id}`);
      next.cards[row.id].review = reviewFrom(row);
    } else throw new Error(`Review table: unknown kind "${row.kind}"`);
  }
  return next;
}

// C9-5 "not like local English" reports, grouped by sentence. Account fields are dropped.
export function reportRows(reports) {
  const counts = new Map();
  for (const report of reports) {
    if (report?.reason !== 'not_local' || typeof report.text !== 'string' || !report.text.trim()) continue;
    const text = report.text.trim();
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  return [...counts].map(([english, count], at) => ({
    kind: 'report', id: `report-${at + 1}`, english,
    'zh-Hans': '', 'id-ID': '', ja: '', ko: '', hi: '', register: '', useAdvice: '', plainAlternative: '',
    status: 'unreviewed', reviewer: '', date: '', notes: `${count} learner report(s): does not sound like local English`,
  }));
}

async function main(argv) {
  const root = new URL('../', import.meta.url);
  const expressionsFile = new URL('content/local-expressions.json', root), cardsFile = new URL('content/scene-seed-cards.json', root);
  const library = JSON.parse(await readFile(expressionsFile, 'utf8')), seedCards = JSON.parse(await readFile(cardsFile, 'utf8'));
  const { sceneSeeds } = await import('../lib/scene-seeds.ts');
  const labels = Object.fromEntries(sceneSeeds.map(seed => [seed.id, Object.fromEntries(Object.entries(seed.text).map(([language, text]) => [language, text.label]))]));
  const [command, first, second] = argv;
  const out = async (file, text) => file ? writeFile(file, text) : process.stdout.write(text);
  if (command === 'export') return out(first, exportReviewTable({ expressions: library.expressions, cards: seedCards.cards, labels }));
  if (command === 'import' && first) {
    const back = applyReviewTable({ expressions: library.expressions, cards: seedCards.cards }, parseReviewTable(await readFile(first, 'utf8')));
    await writeFile(expressionsFile, JSON.stringify({ ...library, expressions: back.expressions }, null, 1) + '\n');
    await writeFile(cardsFile, JSON.stringify({ ...seedCards, cards: back.cards }, null, 1) + '\n');
    return process.stdout.write('Review columns imported.\n');
  }
  if (command === 'reports' && first) {
    const table = parseReviewTable(exportReviewTable({ expressions: library.expressions, cards: seedCards.cards, labels }));
    return out(second, serializeRows([...table, ...reportRows(JSON.parse(await readFile(first, 'utf8')))]));
  }
  process.stderr.write('Usage: review-table.mjs export [out.csv] | import <table.csv> | reports <reports.json> [out.csv]\n');
  process.exitCode = 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main(process.argv.slice(2));

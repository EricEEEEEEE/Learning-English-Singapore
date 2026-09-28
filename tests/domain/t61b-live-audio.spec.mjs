import { test, expect } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const now = Date.UTC(2026, 8, 26);
const secret = 'offline-audio-task-session-secret-at-least-32';
const translations = Object.fromEntries(['zh-Hans', 'id', 'ja', 'ko', 'hi'].map(k => [k, 'synthetic']));
const lines = [{ id: 'a', role: 'partner', text: 'Hello', translations }, { id: 'b', role: 'learner', text: 'Hi', translations }];
function wav() {
  const b = Buffer.alloc(16044); b.write('RIFF'); b.writeUInt32LE(16036, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(16000, 40); return b;
}
async function setup(generate, limit = 1400) {
  const { createGenerationTaskStore } = await import('../../lib/generation-tasks.ts');
  const { createPrivateMediaStore } = await import('../../lib/private-media-store.ts');
  const { sealGoogleSession } = await import('../../lib/google-auth.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-audio-task-'));
  const mediaStore = createPrivateMediaStore({ directory: join(directory, 'media'), sessionSecret: secret });
  const options = { directory, sessionSecret: secret, simulation: false, mediaStore, maxReservedMicros: limit, liveBudget: { scope: 'synthetic-live-audio', priorSpentMicros: 900 },
    scriptProvider: { reservedMicros: 100, generate: async () => ({ requestId: 'script', script: { lines, phrases: [{ id: 'p', text: 'Hello', lineId: 'a', translations }], turns: [{ partnerLineId: 'a', learnerLineId: 'b' }] } }) },
    audioProvider: { reservedMicros: 200, generate } };
  const store = createGenerationTaskStore(options);
  const cookie = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'synthetic-a', email: 'a@example.invalid' }, secret, now);
  const other = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'synthetic-b', email: 'b@example.invalid' }, secret, now);
  const task = await store.create({ cookie, now, goal: 'Party greeting', revision: 1, requestKey: 'one' });
  const input = { cookie, now: now + 1, id: task.id };
  await store.runScript(input);
  return { store, input, other, mediaStore, reopen: () => createGenerationTaskStore(options) };
}
const asset = line => { const bytes = wav(); return { lineId: line.id, role: line.role, duration: 1, bytes, sha256: createHash('sha256').update(bytes).digest('hex') }; };

test('T61B live audio: two stored lines resume privately within historical shared budget', async () => {
  const called = [];
  const c = await setup(async line => { called.push(line.id); return asset(line); });
  await c.store.runAudio({ ...c.input, lineId: 'b', text: 'untrusted' });
  expect(called).toEqual(['a']);
  const first = await c.reopen().get(c.input);
  expect(first).toMatchObject({ simulation: false, reservedMicros: 300, providerCalls: 2 });
  const locator = { ...c.input, courseId: c.input.id, revision: 1, assetId: first.audioAssets[0].assetId };
  expect(Buffer.from((await c.mediaStore.get(locator)).bytes)).toEqual(wav());
  expect(await c.mediaStore.get({ ...locator, cookie: c.other })).toBeNull();
  await c.reopen().runAudio(c.input);
  expect(await c.reopen().get(c.input)).toMatchObject({ status: 'audio_ready', reservedMicros: 500, providerCalls: 3 });
  await expect(c.reopen().runAudio(c.input)).rejects.toThrow();
  expect(called).toEqual(['a', 'b']);
});

test('T61B live audio: exhausted budget preserves first line without submitting second', async () => {
  let calls = 0;
  const c = await setup(async line => { calls++; return asset(line); }, 1200);
  await c.store.runAudio(c.input);
  const before = await c.reopen().get(c.input);
  await expect(c.reopen().runAudio(c.input)).rejects.toThrow();
  expect(calls).toBe(1);
  expect(await c.reopen().get(c.input)).toEqual(before);
});

test('T61B live audio: uncertain second call keeps first asset and prevents retry', async () => {
  let calls = 0;
  const c = await setup(async line => { calls++; if (calls === 2) throw new Error('synthetic timeout'); return asset(line); });
  await c.store.runAudio(c.input);
  await c.reopen().runAudio(c.input);
  const saved = await c.reopen().get(c.input);
  expect(saved).toMatchObject({ status: 'submission_unknown', reservedMicros: 500, providerCalls: 3 });
  expect(saved.audioAssets).toHaveLength(1);
  await expect(c.reopen().runAudio(c.input)).rejects.toThrow();
  expect(calls).toBe(2);
});

test('T61B live audio: concurrent or foreign caller cannot duplicate reserved audio request', async () => {
  let release, entered; const wait = new Promise(r => { release = r; }); const started = new Promise(r => { entered = r; }); let calls = 0;
  const c = await setup(async line => { calls++; entered(); await wait; return asset(line); });
  await expect(c.store.runAudio({ ...c.input, cookie: c.other })).rejects.toThrow();
  const running = c.store.runAudio(c.input);
  try {
    await Promise.race([started, running.then(() => { throw new Error('No provider submission'); })]);
    expect(await c.reopen().get(c.input)).toMatchObject({ reservedMicros: 300, providerCalls: 2 });
    await expect(c.reopen().runAudio(c.input)).rejects.toThrow();
    expect(calls).toBe(1);
  } finally { release(); await running; }
});

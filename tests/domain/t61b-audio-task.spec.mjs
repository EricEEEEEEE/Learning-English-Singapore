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
async function setup(generate, simulation = true) {
  const { createGenerationTaskStore } = await import('../../lib/generation-tasks.ts');
  const { createPrivateMediaStore } = await import('../../lib/private-media-store.ts');
  const { sealGoogleSession } = await import('../../lib/google-auth.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-audio-task-'));
  const mediaStore = createPrivateMediaStore({ directory: join(directory, 'media'), sessionSecret: secret });
  const options = { directory, sessionSecret: secret, simulation, mediaStore,
    scriptProvider: { reservedMicros: 100, generate: async () => ({ requestId: 'script', script: { lines, phrases: [{ id: 'p', text: 'Hello', lineId: 'a', translations }], turns: [{ partnerLineId: 'a', learnerLineId: 'b' }] } }) },
    audioProvider: { reservedMicros: 200, generate } };
  const store = createGenerationTaskStore(options);
  const cookie = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'synthetic-a', email: 'a@example.invalid' }, secret, now);
  const other = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'synthetic-b', email: 'b@example.invalid' }, secret, now);
  const task = await store.create({ cookie, now, goal: 'Party greeting', revision: 1, requestKey: 'one' });
  const input = { cookie, now: now + 1, id: task.id };
  if (simulation) await store.runScript(input);
  return { store, input, other, mediaStore, reopen: () => createGenerationTaskStore(options) };
}
const asset = line => { const bytes = wav(); return { lineId: line.id, role: line.role, duration: 1, bytes, sha256: createHash('sha256').update(bytes).digest('hex') }; };

test('T61B audio task: stored lines produce private reusable assets and cumulative reservations', async () => {
  const called = [];
  const { store, input, reopen, mediaStore, other } = await setup(async line => { called.push(line.id); return asset(line); });
  await store.runAudio({ ...input, lineId: 'b', text: 'untrusted' });
  expect(called).toEqual(['a']);
  const first = await reopen().get(input);
  expect(first.audioAssets).toHaveLength(1);
  expect(first).toMatchObject({ reservedMicros: 300, providerCalls: 2 });
  const locator = { ...input, courseId: input.id, revision: 1, assetId: first.audioAssets[0].assetId };
  expect(Buffer.from((await mediaStore.get(locator)).bytes)).toEqual(wav());
  expect(await mediaStore.get({ ...locator, cookie: other })).toBeNull();
  await reopen().runAudio(input);
  expect(await reopen().get(input)).toMatchObject({ status: 'audio_ready', reservedMicros: 500, providerCalls: 3 });
  expect((await reopen().get(input)).audioAssets).toHaveLength(2);
  try { await reopen().runAudio(input); } catch { /* Completed work may reject repeated action. */ }
  expect(called).toEqual(['a', 'b']);
});

test('T61B audio task: concurrent and foreign requests cannot duplicate a submission', async () => {
  let release, entered; const wait = new Promise(r => { release = r; }); const started = new Promise(r => { entered = r; }); let calls = 0;
  const { store, reopen, input, other } = await setup(async line => { calls++; entered(); await wait; return asset(line); });
  await expect(store.runAudio({ ...input, cookie: other })).rejects.toThrow();
  const running = store.runAudio(input);
  try {
    await Promise.race([started, running.then(() => { throw new Error('No provider submission'); })]);
    expect(await reopen().get(input)).toMatchObject({ reservedMicros: 300, providerCalls: 2 });
    await expect(reopen().runAudio(input)).rejects.toThrow();
    expect(calls).toBe(1);
  } finally { release(); await running; }
});

test('T61B audio task: unknown submission retains completed first line and prohibits retry', async () => {
  let calls = 0;
  const { store, reopen, input } = await setup(async line => { calls++; if (calls === 2) throw new Error('synthetic timeout'); return asset(line); });
  await store.runAudio(input);
  try { await store.runAudio(input); } catch { /* Persisted state is authoritative. */ }
  const saved = await reopen().get(input);
  expect(saved).toMatchObject({ status: 'submission_unknown', reservedMicros: 500, providerCalls: 3 });
  expect(saved.audioAssets).toHaveLength(1);
  await expect(reopen().runAudio(input)).rejects.toThrow();
  expect(calls).toBe(2);
});

test('T61B audio task: live mode ignores browser approval and makes zero calls', async () => {
  let calls = 0; const { store, input } = await setup(async line => { calls++; return asset(line); }, false);
  await expect(store.runAudio({ ...input, approved: true })).rejects.toThrow();
  expect(await store.get(input)).toMatchObject({ status: 'awaiting_budget', providerCalls: 0, reservedMicros: 0 });
  expect(calls).toBe(0);
});

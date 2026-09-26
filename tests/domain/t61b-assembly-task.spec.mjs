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


test('T61B assembly task: private assembled media and timing survive reopening without provider replay', async () => {
  let calls = 0;
  const { store, input, reopen, mediaStore, other } = await setup(async line => { calls++; return asset(line); });
  await store.runAudio(input); await store.runAudio(input);
  await store.assembleAudio({ ...input, duration: 999, assetId: 'untrusted' });
  const saved = await reopen().get(input);
  expect(saved).toMatchObject({ status: 'audio_assembled', providerCalls: 3, reservedMicros: 500 });
  expect(saved.audioAssembly.duration).toBe(2);
  expect(saved.audioAssembly.lines.map(x => [x.lineId, x.start, x.end])).toEqual([['a', 0, 1], ['b', 1, 2]]);
  expect(saved.audioAssembly.segments).toHaveLength(1);
  const segment = saved.audioAssembly.segments[0];
  const locator = { ...input, courseId: input.id, revision: 1, assetId: segment.assetId };
  const media = await mediaStore.get(locator);
  expect(media.sha256).toBe(segment.sha256);
  expect(media.bytes.length).toBe(32044);
  expect(Buffer.from(media.bytes).readUInt32LE(40)).toBe(32000);
  expect(await mediaStore.get({ ...locator, cookie: other })).toBeNull();
  try { await reopen().assembleAudio(input); } catch { /* Completed action may reject repeat. */ }
  expect((await reopen().get(input)).audioAssembly).toEqual(saved.audioAssembly);
  expect(calls).toBe(2);
});

test('T61B assembly task: incomplete and foreign tasks cannot be assembled', async () => {
  const { store, input, other } = await setup(async line => asset(line));
  await expect(store.assembleAudio(input)).rejects.toThrow();
  await store.runAudio(input); await store.runAudio(input);
  await expect(store.assembleAudio({ ...input, cookie: other })).rejects.toThrow();
  expect((await store.get(input)).audioAssembly).toBeUndefined();
  expect(await store.get(input)).toMatchObject({ status: 'audio_ready', providerCalls: 3 });
});

test('T61B assembly task: missing source is not published as assembled and makes no provider calls', async () => {
  let calls = 0;
  const { store, input, mediaStore } = await setup(async line => { calls++; return asset(line); });
  await store.runAudio(input); await store.runAudio(input);
  expect(typeof store.assembleAudio).toBe('function');
  mediaStore.get = async () => null;
  try { await store.assembleAudio(input); } catch { /* State must remain non-ready. */ }
  const saved = await store.get(input);
  expect(saved.status).not.toBe('audio_assembled');
  expect(saved.audioAssembly).toBeUndefined();
  expect(saved).toMatchObject({ providerCalls: 3, reservedMicros: 500 });
  expect(calls).toBe(2);
});

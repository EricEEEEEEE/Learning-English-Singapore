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
async function setup(audioEncoder, simulation = true) {
  const { createGenerationTaskStore } = await import('../../lib/generation-tasks.ts');
  const { createPrivateMediaStore } = await import('../../lib/private-media-store.ts');
  const { sealGoogleSession } = await import('../../lib/google-auth.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-audio-task-'));
  const mediaStore = createPrivateMediaStore({ directory: join(directory, 'media'), sessionSecret: secret });
  const options = { directory, sessionSecret: secret, simulation, mediaStore, audioEncoder,
    scriptProvider: { reservedMicros: 100, generate: async () => ({ requestId: 'script', script: { lines, phrases: [{ id: 'p', text: 'Hello', lineId: 'a', translations }], turns: [{ partnerLineId: 'a', learnerLineId: 'b' }] } }) },
    audioProvider: { reservedMicros: 200, generate: async line => asset(line) } };
  const store = createGenerationTaskStore(options);
  const cookie = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'synthetic-a', email: 'a@example.invalid' }, secret, now);
  const other = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'synthetic-b', email: 'b@example.invalid' }, secret, now);
  const task = await store.create({ cookie, now, goal: 'Party greeting', revision: 1, requestKey: 'one' });
  const input = { cookie, now: now + 1, id: task.id };
  if (simulation) await store.runScript(input);
  return { store, input, other, mediaStore, reopen: () => createGenerationTaskStore(options) };
}
const asset = line => { const bytes = wav(); return { lineId: line.id, role: line.role, duration: 1, bytes, sha256: createHash('sha256').update(bytes).digest('hex') }; };

const encodedBytes = Buffer.from('synthetic AAC');
const encodedHash = createHash('sha256').update(encodedBytes).digest('hex');
const encoded = input => ({ bytes: encodedBytes, sha256: encodedHash, sourceSha256: input.sha256, sourceDuration: 2, duration: 2, mimeType: 'audio/mp4', decoded: true });
async function ready(encoder) {
  const c = await setup(encoder);
  await c.store.runAudio(c.input); await c.store.runAudio(c.input); await c.store.assembleAudio(c.input);
  return c;
}

test('T61B encoded task: preserves source binding and private AAC across reopen without encoding twice', async () => {
  let calls = 0;
  const c = await ready(async input => { calls++; expect(createHash('sha256').update(input.bytes).digest('hex')).toBe(input.sha256); return encoded(input); });
  const before = await c.store.get(c.input);
  const saved = await c.store.encodeAudio(c.input);
  expect(saved.encodedAudio).toHaveLength(1);
  const audio = saved.encodedAudio[0];
  expect(audio).toMatchObject({ segmentIndex: 0, sourceSha256: before.audioAssembly.segments[0].sha256, sourceDuration: 2, duration: 2, sha256: encodedHash, mimeType: 'audio/mp4', decoded: true });
  expect(audio).not.toHaveProperty('bytes');
  const media = await c.mediaStore.get({ ...c.input, courseId: c.input.id, revision: 1, assetId: audio.assetId });
  expect(Buffer.from(media.bytes)).toEqual(encodedBytes);
  expect(await c.reopen().get(c.input)).toEqual(saved);
  expect(await c.reopen().encodeAudio(c.input)).toEqual(saved);
  expect(calls).toBe(1); expect(saved.providerCalls).toBe(before.providerCalls); expect(saved.reservedMicros).toBe(before.reservedMicros);
});

for (const fault of ['source-hash', 'output-hash', 'duration', 'decode']) test(`T61B encoded task: ${fault} cannot publish encoded references`, async () => {
  const c = await ready(async input => {
    const value = encoded(input);
    if (fault === 'source-hash') value.sourceSha256 = 'c'.repeat(64);
    if (fault === 'output-hash') value.sha256 = 'c'.repeat(64);
    if (fault === 'duration') value.sourceDuration = 5;
    if (fault === 'decode') value.decoded = false;
    return value;
  });
  await expect(c.store.encodeAudio(c.input)).rejects.toThrow();
  expect((await c.reopen().get(c.input)).encodedAudio).toBeUndefined();
});

test('T61B encoded task: other owner and incomplete audio cannot start encoder', async () => {
  let calls = 0; const c = await setup(async input => { calls++; return encoded(input); });
  await expect(c.store.encodeAudio(c.input)).rejects.toThrow();
  await c.store.runAudio(c.input); await c.store.runAudio(c.input); await c.store.assembleAudio(c.input);
  await expect(c.store.encodeAudio({ ...c.input, cookie: c.other })).rejects.toThrow();
  expect(calls).toBe(0);
});


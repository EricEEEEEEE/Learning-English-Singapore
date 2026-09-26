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
async function setup(videoProvider, videoDownload) {
  const { createGenerationTaskStore } = await import('../../lib/generation-tasks.ts');
  const { createPrivateMediaStore } = await import('../../lib/private-media-store.ts');
  const { sealGoogleSession } = await import('../../lib/google-auth.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-audio-task-'));
  const mediaStore = createPrivateMediaStore({ directory: join(directory, 'media'), sessionSecret: secret });
  const options = { directory, sessionSecret: secret, simulation: true, mediaStore, videoProvider, videoDownload,
    scriptProvider: { reservedMicros: 100, generate: async () => ({ requestId: 'script', script: { lines, phrases: [{ id: 'p', text: 'Hello', lineId: 'a', translations }], turns: [{ partnerLineId: 'a', learnerLineId: 'b' }] } }) },
    audioProvider: { reservedMicros: 200, generate: async line => asset(line) } };
  const store = createGenerationTaskStore(options);
  const cookie = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'synthetic-a', email: 'a@example.invalid' }, secret, now);
  const other = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'synthetic-b', email: 'b@example.invalid' }, secret, now);
  const task = await store.create({ cookie, now, goal: 'Party greeting', revision: 1, requestKey: 'one' });
  const input = { cookie, now: now + 1, id: task.id };
  await store.runScript(input);
  return { store, input, other, mediaStore, reopen: () => createGenerationTaskStore(options) };
}
const asset = line => { const bytes = wav(); return { lineId: line.id, role: line.role, duration: 1, bytes, sha256: createHash('sha256').update(bytes).digest('hex') }; };



async function ready(download) {
  const url = 'https://media.example.invalid/synthetic.mp4?signature=synthetic-private';
  let submits = 0, queries = 0;
  const provider = { reservedMicros: 90000, audioReviewed: true,
    submit: async () => { submits++; return { status: 'pending', jobId: 'synthetic-job' }; },
    query: async id => { queries++; return { jobId: id, status: 'completed', videoUrl: url }; } };
  const context = await setup(provider, download);
  await context.store.runAudio(context.input); await context.store.runAudio(context.input);
  await context.store.assembleAudio(context.input); await context.store.runVideo(context.input);
  return { ...context, url, counts: () => ({ submits, queries }) };
}

test('T61B collection: downloads completed job into private storage without persisting signed URL or marking course ready', async () => {
  const bytes = Buffer.from('synthetic transport bytes, not a validated video');
  const sha256 = createHash('sha256').update(bytes).digest('hex'); let downloads = 0;
  const c = await ready(async url => { downloads++; expect(url).toContain('media.example.invalid'); return { bytes, sha256 }; });
  await expect(c.store.collectVideo({ ...c.input, cookie: c.other })).rejects.toThrow();
  await c.store.collectVideo(c.input);
  const saved = await c.reopen().get(c.input);
  expect(saved.videoAssets).toHaveLength(1);
  expect(saved.videoAssets[0]).toMatchObject({ segmentIndex: 0, sha256, size: bytes.length });
  const locator = { ...c.input, courseId: c.input.id, revision: 1, assetId: saved.videoAssets[0].assetId };
  expect(Buffer.from((await c.mediaStore.get(locator)).bytes)).toEqual(bytes);
  expect(await c.mediaStore.get({ ...locator, cookie: c.other })).toBeNull();
  expect(JSON.stringify(saved)).not.toContain('signature');
  expect(saved.status).not.toBe('ready');
  expect(saved).toMatchObject({ providerCalls: 4, reservedMicros: 90500 });
  try { await c.reopen().collectVideo(c.input); } catch { /* Repeated collection may reject. */ }
  expect(downloads).toBe(1); expect(c.counts().submits).toBe(1);
});

test('T61B collection: failed download can retry retrieval without repeating generation', async () => {
  let downloads = 0; const bytes = Buffer.from('synthetic-media');
  const c = await ready(async () => { downloads++; if (downloads === 1) throw new Error('signed-url-secret'); return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') }; });
  expect(typeof c.store.collectVideo).toBe('function');
  try { await c.store.collectVideo(c.input); } catch (e) { expect(String(e)).not.toContain('signed-url-secret'); }
  expect((await c.reopen().get(c.input)).videoAssets ?? []).toHaveLength(0);
  await c.reopen().collectVideo(c.input);
  expect((await c.reopen().get(c.input)).videoAssets).toHaveLength(1);
  expect(c.counts().submits).toBe(1); expect(downloads).toBe(2);
});

test('T61B collection: wrong digest never publishes asset references', async () => {
  const c = await ready(async () => ({ bytes: Buffer.from('synthetic'), sha256: '0'.repeat(64) }));
  expect(typeof c.store.collectVideo).toBe('function');
  try { await c.store.collectVideo(c.input); } catch { /* Persisted references must remain absent. */ }
  expect((await c.reopen().get(c.input)).videoAssets ?? []).toHaveLength(0);
  expect(c.counts().submits).toBe(1);
});

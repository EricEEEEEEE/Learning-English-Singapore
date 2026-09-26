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
async function setup(videoProvider, videoDownload, videoProbe) {
  const { createGenerationTaskStore } = await import('../../lib/generation-tasks.ts');
  const { createPrivateMediaStore } = await import('../../lib/private-media-store.ts');
  const { sealGoogleSession } = await import('../../lib/google-auth.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-audio-task-'));
  const mediaStore = createPrivateMediaStore({ directory: join(directory, 'media'), sessionSecret: secret });
  const options = { directory, sessionSecret: secret, simulation: true, mediaStore, videoProvider, videoDownload, videoProbe,
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



async function ready(download, probe) {
  const url = 'https://media.example.invalid/synthetic.mp4?signature=synthetic-private';
  let submits = 0, queries = 0;
  const provider = { reservedMicros: 90000, audioReviewed: true,
    submit: async () => { submits++; return { status: 'pending', jobId: 'synthetic-job' }; },
    query: async id => { queries++; return { jobId: id, status: 'completed', videoUrl: url }; } };
  const context = await setup(provider, download, probe);
  await context.store.runAudio(context.input); await context.store.runAudio(context.input);
  await context.store.assembleAudio(context.input); await context.store.runVideo(context.input);
  return { ...context, url, counts: () => ({ submits, queries }) };
}


const video = Buffer.from('synthetic stored bytes, not an actual video');
const hash = createHash('sha256').update(video).digest('hex');
const download = async () => ({ bytes: video, sha256: hash });
const metadata = () => ({ sha256: hash, duration: 2, width: 720, height: 1280, fps: 24, videoCodec: 'h264', audioCodec: 'aac' });

test('T61B probe task: loads private video and binds persisted report to exact segment hash', async () => {
  let probes = 0;
  const c = await ready(download, async input => { probes++; expect(Buffer.from(input.bytes)).toEqual(video); expect(input.sha256).toBe(hash); expect(input.expectedDuration).toBe(2); return metadata(); });
  await c.store.collectVideo(c.input);
  await expect(c.store.probeVideo({ ...c.input, cookie: c.other })).rejects.toThrow();
  await c.store.probeVideo({ ...c.input, sha256: 'untrusted', expectedDuration: 999 });
  const saved = await c.reopen().get(c.input);
  expect(saved.videoChecks).toEqual([{ segmentIndex: 0, ...metadata() }]);
  expect(saved).toMatchObject({ providerCalls: 4, reservedMicros: 90500 });
  expect(saved.status).not.toBe('ready');
  expect(probes).toBe(1); expect(c.counts().submits).toBe(1);
});

for (const failure of ['probe-failure', 'wrong-hash']) test(`T61B probe task: ${failure} does not persist a successful check`, async () => {
  const c = await ready(download, async () => { if (failure === 'probe-failure') throw new Error('synthetic-private-path'); return { ...metadata(), sha256: '0'.repeat(64) }; });
  await c.store.collectVideo(c.input);
  expect(typeof c.store.probeVideo).toBe('function');
  try { await c.store.probeVideo(c.input); } catch (e) { expect(String(e)).not.toContain('synthetic-private-path'); }
  expect((await c.reopen().get(c.input)).videoChecks ?? []).toHaveLength(0);
  expect((await c.reopen().get(c.input)).videoAssets).toHaveLength(1);
  expect(c.counts().submits).toBe(1);
});

test('T61B probe task: missing stored media never invokes probe or publishes check', async () => {
  let calls = 0; const c = await ready(download, async () => { calls++; return metadata(); });
  await c.store.collectVideo(c.input); c.mediaStore.get = async () => null;
  await expect(c.store.probeVideo(c.input)).rejects.toThrow();
  expect(calls).toBe(0);
  expect((await c.reopen().get(c.input)).videoChecks ?? []).toHaveLength(0);
});

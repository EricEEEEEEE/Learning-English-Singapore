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
async function setup(videoProvider, videoDownload, videoRepair) {
  const { createGenerationTaskStore } = await import('../../lib/generation-tasks.ts');
  const { createPrivateMediaStore } = await import('../../lib/private-media-store.ts');
  const { sealGoogleSession } = await import('../../lib/google-auth.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-audio-task-'));
  const mediaStore = createPrivateMediaStore({ directory: join(directory, 'media'), sessionSecret: secret });
  const options = { directory, sessionSecret: secret, simulation: true, mediaStore, videoProvider, videoDownload, videoRepair,
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



async function ready(download, repair) {
  const url = 'https://media.example.invalid/synthetic.mp4?signature=synthetic-private';
  let submits = 0, queries = 0;
  const provider = { reservedMicros: 90000, audioReviewed: true,
    submit: async () => { submits++; return { status: 'pending', jobId: 'synthetic-job' }; },
    query: async id => { queries++; return { jobId: id, status: 'completed', videoUrl: url }; } };
  const context = await setup(provider, download, repair);
  await context.store.runAudio(context.input); await context.store.runAudio(context.input);
  await context.store.assembleAudio(context.input); await context.store.runVideo(context.input);
  return { ...context, url, counts: () => ({ submits, queries }) };
}


const video = Buffer.from('synthetic stored bytes, not an actual video');
const hash = createHash('sha256').update(video).digest('hex');
const download = async () => ({ bytes: video, sha256: hash });
const metadata = () => ({ sha256: hash, duration: 2, width: 720, height: 1280, fps: 24, videoCodec: 'h264', audioCodec: 'aac' });

const fixed = Buffer.from('synthetic repaired media');
const fixedHash = createHash('sha256').update(fixed).digest('hex');
const repaired = input => ({ ...metadata(), bytes: fixed, sha256: fixedHash, sourceVideoSha256: input.video.sha256, sourceAudioSha256: input.audio.sha256, decoded: true });

test('T61B repair task: saves repaired media, keeps provenance and resumes without paid resubmission', async () => {
  let repairs = 0;
  const c = await ready(download, async input => { repairs++; expect(Buffer.from(input.video.bytes)).toEqual(video); return repaired(input); });
  await c.store.collectVideo(c.input);
  const before = await c.store.get(c.input);
  await expect(c.store.repairVideo({ ...c.input, cookie: c.other })).rejects.toThrow();
  expect(repairs).toBe(0);
  await c.store.repairVideo(c.input);
  const saved = await c.reopen().get(c.input);
  expect(saved.videoAssets[0].sha256).toBe(fixedHash);
  expect(saved.videoAssets[0].assetId).not.toBe(before.videoAssets[0].assetId);
  expect(saved.videoRepairs[0]).toMatchObject({ segmentIndex: 0, originalAssetId: before.videoAssets[0].assetId, sourceVideoSha256: hash, sourceAudioSha256: before.audioAssembly.segments[0].sha256, repairedSha256: fixedHash });
  expect(saved.videoChecks[0]).toMatchObject({ segmentIndex: 0, sha256: fixedHash, duration: 2 });
  expect(saved.status).toBe('video_pending');
  expect(saved.reservedMicros).toBe(before.reservedMicros); expect(saved.providerCalls).toBe(before.providerCalls);
  const locator = { cookie: c.input.cookie, now: c.input.now, courseId: saved.id, revision: saved.revision };
  expect(Buffer.from((await c.mediaStore.get({ ...locator, assetId: before.videoAssets[0].assetId })).bytes)).toEqual(video);
  expect(Buffer.from((await c.mediaStore.get({ ...locator, assetId: saved.videoAssets[0].assetId })).bytes)).toEqual(fixed);
  await c.reopen().repairVideo(c.input);
  expect(repairs).toBe(1); expect(c.counts().submits).toBe(1);
});

for (const failure of ['provider-error', 'wrong-source', 'wrong-output-hash', 'not-decoded', 'wrong-duration']) test(`T61B repair task: ${failure} preserves original pending task`, async () => {
  const c = await ready(download, async input => {
    if (failure === 'provider-error') throw new Error('private repair details');
    const value = repaired(input);
    if (failure === 'wrong-source') value.sourceAudioSha256 = '0'.repeat(64);
    if (failure === 'wrong-output-hash') value.sha256 = '0'.repeat(64);
    if (failure === 'not-decoded') value.decoded = false;
    if (failure === 'wrong-duration') value.duration = 10;
    return value;
  });
  await c.store.collectVideo(c.input); const before = await c.store.get(c.input);
  await expect(c.store.repairVideo(c.input)).rejects.toThrow();
  const after = await c.reopen().get(c.input);
  expect(after.videoAssets).toEqual(before.videoAssets);
  expect(after.videoChecks ?? []).toEqual([]); expect(after.videoRepairs ?? []).toEqual([]);
  expect(after.reservedMicros).toBe(before.reservedMicros); expect(c.counts().submits).toBe(1);
});

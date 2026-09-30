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
async function setup(videoProvider, videoDownload, referenceExtractor) {
  const { createGenerationTaskStore } = await import('../../lib/generation-tasks.ts');
  const { createPrivateMediaStore } = await import('../../lib/private-media-store.ts');
  const { sealGoogleSession } = await import('../../lib/google-auth.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-audio-task-'));
  const mediaStore = createPrivateMediaStore({ directory: join(directory, 'media'), sessionSecret: secret });
  const options = { directory, sessionSecret: secret, simulation: true, mediaStore, videoProvider, videoDownload, referenceExtractor,
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

const image = Buffer.from('synthetic extracted PNG bytes');
const imageHash = createHash('sha256').update(image).digest('hex');
const extracted = input => ({ bytes: image, sha256: imageHash, sourceVideoSha256: input.sha256, timeSeconds: input.timeSeconds, mimeType: 'image/png', width: 720, height: 1280, decoded: true });

test('T61B reference task: derives image from owned stored video and persists exact source for another owned task', async () => {
  let extractions = 0;
  const c = await ready(download, async input => { extractions++; expect(Buffer.from(input.bytes)).toEqual(video); expect(input.sha256).toBe(hash); return extracted(input); });
  await c.store.collectVideo(c.input);
  const source = await c.store.get(c.input);
  const target = await c.store.create({ cookie: c.input.cookie, now: c.input.now, goal: 'Longer party conversation', revision: 1, requestKey: 'reference-target' });
  const request = { ...c.input, id: target.id, sourceCourseId: source.id, sourceRevision: source.revision, sourceAssetId: source.videoAssets[0].assetId, timeSeconds: 0.5 };
  await expect(c.store.prepareReferenceImage({ ...request, cookie: c.other })).rejects.toThrow();
  expect(extractions).toBe(0);
  await c.store.prepareReferenceImage(request);
  const saved = await c.reopen().get(request);
  expect(saved.referenceImage).toMatchObject({ sha256: imageHash, sourceCourseId: source.id, sourceRevision: 1, sourceAssetId: source.videoAssets[0].assetId, sourceVideoSha256: hash, timeSeconds: 0.5, decoded: true, width: 720, height: 1280 });
  expect(saved.referenceImage).not.toHaveProperty('bytes');
  expect(saved.providerCalls).toBe(0); expect(saved.reservedMicros).toBe(0);
  const media = await c.mediaStore.get({ cookie: c.input.cookie, now: c.input.now, courseId: target.id, revision: 1, assetId: saved.referenceImage.assetId });
  expect(Buffer.from(media.bytes)).toEqual(image);
  await c.reopen().prepareReferenceImage(request); expect(extractions).toBe(1);
  await expect(c.store.prepareReferenceImage({ ...request, timeSeconds: 1 })).rejects.toThrow();
});

for (const fault of ['wrong-source', 'wrong-hash', 'not-decoded']) test(`T61B reference task: ${fault} never publishes a reference`, async () => {
  const c = await ready(download, async input => {
    const value = extracted(input);
    if (fault === 'wrong-source') value.sourceVideoSha256 = '0'.repeat(64);
    if (fault === 'wrong-hash') value.sha256 = '0'.repeat(64);
    if (fault === 'not-decoded') value.decoded = false;
    return value;
  });
  await c.store.collectVideo(c.input); const source = await c.store.get(c.input);
  const target = await c.store.create({ cookie: c.input.cookie, now: c.input.now, goal: 'Another party scene', revision: 1, requestKey: 'target' });
  const request = { ...c.input, id: target.id, sourceCourseId: source.id, sourceRevision: 1, sourceAssetId: source.videoAssets[0].assetId, timeSeconds: 0.5 };
  await expect(c.store.prepareReferenceImage(request)).rejects.toThrow();
  expect((await c.reopen().get(request)).referenceImage).toBeUndefined();
  expect(c.counts().submits).toBe(1);
});

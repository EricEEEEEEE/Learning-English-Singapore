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
  const options = { directory, sessionSecret: secret, simulation: true, mediaStore, encodedVideoProvider: videoProvider, videoDownload, referenceExtractor,
    audioEncoder: async input => { const bytes = Buffer.from('synthetic AAC'); return { bytes, sha256: createHash('sha256').update(bytes).digest('hex'), sourceSha256: input.sha256, sourceDuration: 2, duration: 2, mimeType: 'audio/mp4', decoded: true }; },
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
  let submits = 0, queries = 0; const submitted = [];
  const provider = { reservedMicros: 90000, audioReviewed: true,
    submit: async input => { submitted.push(input); submits++; return { status: 'pending', jobId: 'synthetic-job' }; },
    query: async id => { queries++; return { jobId: id, status: 'completed', videoUrl: url }; } };
  const context = await setup(provider, download, repair);
  await context.store.runAudio(context.input); await context.store.runAudio(context.input);
  await context.store.assembleAudio(context.input);
  const encoded = await context.store.encodeAudio(context.input);
  await context.store.confirmEncodedAudio({ ...context.input, revision: 1, segmentIndex: 0, sha256: encoded.encodedAudio[0].sha256 });
  await context.store.runVideo(context.input);
  return { ...context, submitted, url, counts: () => ({ submits, queries }) };
}


const video = Buffer.from('synthetic stored bytes, not an actual video');
const hash = createHash('sha256').update(video).digest('hex');
const download = async () => ({ bytes: video, sha256: hash });
const metadata = () => ({ sha256: hash, duration: 2, width: 720, height: 1280, fps: 24, videoCodec: 'h264', audioCodec: 'aac' });

const image = Buffer.from('synthetic extracted PNG bytes');
const imageHash = createHash('sha256').update(image).digest('hex');
const extracted = input => ({ bytes: image, sha256: imageHash, sourceVideoSha256: input.sha256, timeSeconds: input.timeSeconds, mimeType: 'image/png', width: 720, height: 1280, decoded: true });

async function prepared() {
  const c = await ready(download, async input => extracted(input));
  await c.store.collectVideo(c.input); const source = await c.store.get(c.input);
  const target = await c.store.create({ cookie: c.input.cookie, now: c.input.now, goal: 'Longer party', revision: 1, requestKey: 'image-submit' });
  const request = { ...c.input, id: target.id };
  await c.store.prepareReferenceImage({ ...request, sourceCourseId: source.id, sourceRevision: 1, sourceAssetId: source.videoAssets[0].assetId, timeSeconds: 0.5 });
  await c.store.runScript(request); await c.store.runAudio(request); await c.store.runAudio(request); await c.store.assembleAudio(request);
  const encoded = await c.store.encodeAudio(request);
  await c.store.confirmEncodedAudio({ ...request, revision: 1, segmentIndex: 0, sha256: encoded.encodedAudio[0].sha256 });
  return { ...c, request };
}

test('T61B reference submit: stored image accompanies reviewed audio and job records its hash', async () => {
  const c = await prepared();
  const result = await c.store.runVideo(c.request);
  expect(c.submitted).toHaveLength(2);
  expect(c.submitted[1].referenceImage).toMatchObject({ sha256: imageHash, mimeType: 'image/png' });
  expect(Buffer.from(c.submitted[1].referenceImage.bytes)).toEqual(image);
  expect(result.videoJobs[0].referenceImageSha256).toBe(imageHash);
  expect((await c.reopen().get(c.request)).videoJobs[0].referenceImageSha256).toBe(imageHash);
  await expect(c.store.runVideo(c.request)).rejects.toThrow(); expect(c.submitted).toHaveLength(2);
});

for (const fault of ['missing', 'corrupt']) test(`T61B reference submit: ${fault} image stops before reservation or provider call`, async () => {
  const c = await prepared(); const before = await c.store.get(c.request), get = c.mediaStore.get;
  c.mediaStore.get = async locator => {
    const media = await get(locator);
    if (locator.assetId !== before.referenceImage.assetId) return media;
    return fault === 'missing' ? null : { ...media, bytes: Buffer.from('corrupted') };
  };
  await expect(c.store.runVideo(c.request)).rejects.toThrow();
  const after = await c.reopen().get(c.request);
  expect(after.reservedMicros).toBe(before.reservedMicros); expect(after.providerCalls).toBe(before.providerCalls);
  expect(after.videoJobs ?? []).toHaveLength(0); expect(c.submitted).toHaveLength(1);
});

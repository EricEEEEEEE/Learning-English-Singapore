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
  const options = { directory, sessionSecret: secret, simulation: false, maxReservedMicros: 1000000, liveBudget: { scope: 'runtime-repair-test', priorSpentMicros: 0 }, mediaStore, encodedVideoProvider: videoProvider, videoDownload, videoRepair,
    audioEncoder: async input => { const bytes = Buffer.from('synthetic AAC'); return { bytes, sha256: createHash('sha256').update(bytes).digest('hex'), sourceSha256: input.sha256, sourceDuration: 2, duration: 2, mimeType: 'audio/mp4', decoded: true }; },
    scriptProvider: { reservedMicros: 100, generate: async () => ({ requestId: 'script', script: { lines, phrases: [{ id: 'p', text: 'Hello', lineId: 'a', translations }], turns: [{ partnerLineId: 'a', learnerLineId: 'b' }] } }) },
    audioProvider: { reservedMicros: 200, generate: async line => asset(line) } };
  const store = createGenerationTaskStore(options);
  const cookie = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'synthetic-a', email: 'a@example.invalid' }, secret, now);
  const other = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'synthetic-b', email: 'b@example.invalid' }, secret, now);
  const task = await store.create({ cookie, now, goal: 'Party greeting', revision: 1, requestKey: 'one' });
  const input = { cookie, now: now + 1, id: task.id };
  await store.runScript(input);
  return { directory, store, input, other, mediaStore, reopen: () => createGenerationTaskStore(options) };
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
  await context.store.assembleAudio(context.input);
  const encoded = await context.store.encodeAudio(context.input);
  await context.store.confirmEncodedAudio({ ...context.input, revision: 1, segmentIndex: 0, sha256: encoded.encodedAudio[0].sha256 });
  await context.store.runVideo(context.input);
  return { ...context, url, counts: () => ({ submits, queries }) };
}


const video = Buffer.from('synthetic stored bytes, not an actual video');
const hash = createHash('sha256').update(video).digest('hex');
const download = async () => ({ bytes: video, sha256: hash });
const metadata = () => ({ sha256: hash, duration: 2, width: 720, height: 1280, fps: 24, videoCodec: 'h264', audioCodec: 'aac' });

test('T61B runtime repair: stored real-mode task reaches local repair without provider requests and preserves sources on tool failure', async () => {
  const { createLiveGenerationRuntime } = await import('../../lib/live-generation-runtime.ts');
  const c = await ready(download);
  await c.store.collectVideo(c.input);
  const before = await c.store.get(c.input); let requests = 0;
  const runtime = createLiveGenerationRuntime({ enabled: true, directory: c.directory, sessionSecret: secret,
    openaiKey: 'synthetic-only', ltxKey: 'synthetic-only',
    budget: { scope: 'runtime-repair-test', priorSpentMicros: 0, maxReservedMicros: 1000000, scriptMicros: 100, audioMicros: 200, videoMicros: 90000 },
    media: { ffmpeg: '/synthetic/missing-ffmpeg', ffprobe: '/synthetic/missing-ffprobe', allowedHosts: ['media.example.invalid'], maxBytes: 1000000 },
    fetch: async () => { requests++; throw new Error('No transport permitted'); },
  });
  await expect(runtime.repairVideo({ ...c.input, cookie: c.other })).rejects.toThrow();
  // A configured repair reaches its local tool and fails safely. A disconnected
  // runtime instead reports "Video repair disabled", which must not pass here.
  await expect(runtime.repairVideo(c.input)).rejects.toThrow('Video repair failed');
  expect(await runtime.get(c.input)).toEqual(before);
  expect(requests).toBe(0); expect(c.counts().submits).toBe(1);
});

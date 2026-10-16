import { test, expect } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// T71B / K4.1, K6.2, K7: a server-side runner advances a stored task through every real stage on its own,
// resumes from persisted state, never resubmits unknown work, and stops before the batch ceiling.
const secret = 'offline-t71b-session-secret-at-least-32-characters';
const now = Date.UTC(2026, 9, 16);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const translations = Object.fromEntries(['zh-Hans', 'id', 'ja', 'ko', 'hi'].map(k => [k, 'synthetic']));
const lines = Array.from({ length: 4 }, (_, i) => ({ id: 'line' + i, role: i % 2 ? 'learner' : 'partner', text: i % 2 ? 'Hi' : 'Hello', translations }));
const script = { lines, phrases: [{ id: 'phrase', text: 'Hello', lineId: 'line0', translations }], turns: [{ partnerLineId: 'line0', learnerLineId: 'line1' }, { partnerLineId: 'line2', learnerLineId: 'line3' }] };
const pcm = Buffer.alloc(240044);
pcm.write('RIFF'); pcm.writeUInt32LE(240036, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(8000, 24); pcm.writeUInt32LE(16000, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(240000, 40);
const delta = 0.04, duration = 4 * (15 + 2 * delta);
const video = Buffer.from('synthetic video'), aac = Buffer.from('synthetic AAC');

async function setup({ maxReservedMicros, scriptFails = false, queryStatuses = [], failSegment = -1 } = {}) {
  const { createGenerationTaskStore } = await import('../../lib/generation-tasks.ts');
  const { createPrivateMediaStore } = await import('../../lib/private-media-store.ts');
  const { sealGoogleSession } = await import('../../lib/google-auth.ts');
  const { validateFinalVideoProbe } = await import('../../lib/final-video-probe.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-t71b-'));
  const calls = { script: 0, audio: 0, submit: 0, query: 0 };
  const statuses = [...queryStatuses];
  const options = {
    directory, sessionSecret: secret, simulation: true, ...(maxReservedMicros === undefined ? {} : { maxReservedMicros }),
    mediaStore: createPrivateMediaStore({ directory: join(directory, 'media'), sessionSecret: secret }),
    scriptProvider: { reservedMicros: 100, generate: async () => { calls.script++; if (scriptFails) throw new Error('lost'); return { requestId: 'synthetic', script }; } },
    audioProvider: { reservedMicros: 100, generate: async line => { calls.audio++; return { lineId: line.id, role: line.role, bytes: pcm, sha256: sha(pcm), duration: 15 }; } },
    audioEncoder: async input => ({ bytes: aac, sha256: sha(aac), sourceSha256: input.sha256, sourceDuration: 15, duration: 15 + delta, mimeType: 'audio/mp4', decoded: true }),
    encodedVideoProvider: {
      reservedMicros: 1000,
      submit: async () => { calls.submit++; return { status: 'pending', jobId: 'job' + calls.submit }; },
      query: async id => { calls.query++; const status = statuses.length ? statuses.shift() : (Number(id.slice(3)) - 1 === failSegment ? 'failed' : 'completed'); return { jobId: id, status, ...(status === 'completed' ? { videoUrl: 'https://media.example.invalid/sample.mp4' } : {}) }; },
    },
    videoDownload: async () => ({ bytes: video, sha256: sha(video) }),
    videoProbe: async input => ({ sha256: input.sha256, duration: input.expectedDuration + delta, width: 720, height: 1280, fps: 24, videoCodec: 'h264', audioCodec: 'aac' }),
    videoConcat: async () => ({ bytes: video, sha256: sha(video) }),
    finalVideoVerify: async input => ({ ...validateFinalVideoProbe({ format: { format_name: 'mp4', start_time: 0, duration }, streams: [{ codec_type: 'video', codec_name: 'h264', width: 720, height: 1280, avg_frame_rate: '24/1', duration, start_time: 0, disposition: { attached_pic: 0 } }, { codec_type: 'audio', codec_name: 'aac', profile: 'LC', sample_rate: 8000, channels: 1, duration, start_time: 0 }] }, input.plan), sha256: sha(video), decoded: true }),
  };
  const store = createGenerationTaskStore(options);
  const cookie = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'owner-a', email: 'a@example.invalid' }, secret, now);
  const other = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'owner-b', email: 'b@example.invalid' }, secret, now);
  const task = await store.create({ cookie, now, goal: 'Synthetic runner scene', revision: 1, requestKey: 'k' });
  return { store, reopen: () => createGenerationTaskStore(options), calls, input: { cookie, now: now + 1, id: task.id }, other };
}
const passAll = async () => true;
const runner = async (store, extra = {}) => (await import('../../lib/generation-runner.ts')).createGenerationRunner({ store, audioReview: passAll, wait: async () => {}, maxPolls: 3, ...extra });

test('T71B: one advance takes a fresh task through every stage to an openable course', async () => {
  const { store, calls, input } = await setup();
  const result = await (await runner(store)).advance(input);
  expect(result.stopped).toBe('ready');
  expect(calls).toMatchObject({ script: 1, audio: 4, submit: 4 });
  const task = await store.get(input);
  expect(task.status).toBe('video_assembled');
  const course = await store.getCourse({ ...input, revision: 1 });
  expect(course.lines).toHaveLength(4);
});

test('T71B: advancing a ready task again makes no provider calls', async () => {
  const { store, calls, input } = await setup();
  const r = await runner(store);
  await r.advance(input);
  const before = { ...calls };
  expect((await r.advance(input)).stopped).toBe('ready');
  expect(calls).toEqual(before);
});

test('T71B: a still-rendering video pauses the run and a new runner resumes without resubmitting it', async () => {
  const { store, reopen, calls, input } = await setup({ queryStatuses: ['processing', 'processing', 'processing'] });
  const first = await (await runner(store)).advance(input);
  expect(first.stopped).toBe('waiting');
  expect(calls.submit).toBe(1);
  const second = await (await runner(reopen())).advance(input);
  expect(second.stopped).toBe('ready');
  expect(calls.submit).toBe(4);
  expect(calls.script).toBe(1);
});

test('T71B: an unknown submission stops the run and is never retried automatically', async () => {
  const { store, calls, input } = await setup({ scriptFails: true });
  const r = await runner(store);
  expect((await r.advance(input)).stopped).toBe('unknown');
  expect((await r.advance(input)).stopped).toBe('unknown');
  expect(calls.script).toBe(1);
  expect((await store.get(input)).status).toBe('submission_unknown');
});

test('T71B: a failed video segment stops the run without resubmitting any segment', async () => {
  const { store, calls, input } = await setup({ failSegment: 1 });
  const r = await runner(store);
  expect((await r.advance(input)).stopped).toBe('failed');
  const submitted = calls.submit;
  expect(submitted).toBe(2);
  expect((await r.advance(input)).stopped).toBe('failed');
  expect(calls.submit).toBe(submitted);
});

test('T71B: the batch ceiling stops the run before the call that would exceed it', async () => {
  // script 100 + 4 audio × 100 + one video 1000 = 1500; the second video would need 2500.
  const { store, calls, input } = await setup({ maxReservedMicros: 2000 });
  const result = await (await runner(store)).advance(input);
  expect(result.stopped).toBe('budget');
  expect(calls.submit).toBe(1);
  const task = await store.get(input);
  expect(task.reservedMicros).toBeLessThanOrEqual(2000);
  expect(task.status).toBe('video_pending');
});

test('T71B: without an audio review the run stops before any video is requested', async () => {
  const { store, calls, input } = await setup();
  const { createGenerationRunner } = await import('../../lib/generation-runner.ts');
  const result = await createGenerationRunner({ store, wait: async () => {}, maxPolls: 3 }).advance(input);
  expect(result.stopped).toBe('needs_review');
  expect(calls.submit).toBe(0);
  expect((await store.get(input)).status).toBe('audio_assembled');
});

test('T71B: a rejected audio review stops before video and records nothing as reviewed', async () => {
  const { store, calls, input } = await setup();
  const result = await (await runner(store, { audioReview: async ({ segmentIndex }) => segmentIndex !== 2 })).advance(input);
  expect(result.stopped).toBe('review_failed');
  expect(calls.submit).toBe(0);
  expect((await store.get(input)).audioReviews?.some(review => review.segmentIndex === 2)).toBeFalsy();
});

test('T71B: two overlapping advances for the same task share one run', async () => {
  const { store, calls, input } = await setup();
  const r = await runner(store);
  const [a, b] = await Promise.all([r.advance(input), r.advance(input)]);
  expect(a.stopped).toBe('ready');
  expect(b.stopped).toBe('ready');
  expect(calls).toMatchObject({ script: 1, audio: 4, submit: 4 });
});

test('T71B: another account cannot drive the task and causes no provider calls', async () => {
  const { store, calls, input, other } = await setup();
  const result = await (await runner(store)).advance({ ...input, cookie: other });
  expect(result.stopped).toBe('error');
  expect(calls).toEqual({ script: 0, audio: 0, submit: 0, query: 0 });
  expect((await store.get(input)).status).toBe('awaiting_budget');
});

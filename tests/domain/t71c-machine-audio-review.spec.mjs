import { test, expect } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// T71C / K4.1: before any paid video, a machine check of the real assembled speech replaces the earlier human
// listening step. It must reject silence, near-silence, long dead air and mismatched sources, and fail closed.
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const RATE = 8000;
function wav(samples) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF'); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) => b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v))), 44 + i * 2));
  return b;
}
const tone = (seconds, dbfs = -12) => Array.from({ length: Math.round(seconds * RATE) }, (_, i) => 32767 * 10 ** (dbfs / 20) * Math.sin(2 * Math.PI * 220 * i / RATE));
const silence = seconds => new Array(Math.round(seconds * RATE)).fill(0);
const load = () => import('../../lib/machine-audio-review.ts');

function caseFor(bytes, over = {}) {
  const hash = sha(bytes);
  const duration = (bytes.length - 44) / 2 / RATE;
  const segment = { sha256: hash, duration, assetId: 'seg', ...over.segment };
  const encoded = { segmentIndex: 0, sha256: 'e'.repeat(64), sourceSha256: hash, sourceDuration: duration, duration: duration + 0.04, assetId: 'enc', size: 10, mimeType: 'audio/mp4', decoded: true, ...over.encoded };
  const task = { id: 'task', revision: 1, status: 'audio_assembled' };
  return { input: { cookie: 'c', now: 1, id: 'task', task, segmentIndex: 0, encoded, segment }, reads: [] };
}
async function review(bytes, over = {}, read) {
  const { createMachineAudioReview } = await load();
  const c = caseFor(bytes, over);
  const reviewer = createMachineAudioReview({ read: read ?? (async args => { c.reads.push(args); return { bytes, sha256: sha(bytes), size: bytes.length }; }) });
  return { ok: await reviewer(c.input), reads: c.reads };
}

test('T71C: clear continuous speech-level audio passes and reads the stored segment for this task', async () => {
  const { ok, reads } = await review(wav(tone(4)));
  expect(ok).toBe(true);
  expect(reads).toEqual([{ cookie: 'c', now: 1, courseId: 'task', revision: 1, assetId: 'seg' }]);
});

test('T71C: short natural pauses between spoken lines still pass', async () => {
  expect((await review(wav([...tone(2), ...silence(0.8), ...tone(2)]))).ok).toBe(true);
});

for (const [name, samples] of [
  ['complete silence', silence(4)],
  ['near-silent audio', tone(4, -62)],
  ['speech with a long dead-air gap', [...tone(1.5), ...silence(3), ...tone(1.5)]],
  ['a click on otherwise silent audio', [...silence(2), 30000, -30000, ...silence(2)]],
]) test(`T71C: ${name} is rejected before video`, async () => {
  expect((await review(wav(samples))).ok).toBe(false);
});

test('T71C: an encoded file that does not come from this segment is rejected without reading media', async () => {
  const { ok, reads } = await review(wav(tone(3)), { encoded: { sourceSha256: '0'.repeat(64) } });
  expect(ok).toBe(false);
  expect(reads).toHaveLength(0);
});

test('T71C: stored bytes that no longer match the segment hash are rejected', async () => {
  const good = wav(tone(3)), other = wav(tone(3, -6));
  const { ok } = await review(good, {}, async () => ({ bytes: other, sha256: sha(other), size: other.length }));
  expect(ok).toBe(false);
});

for (const [name, read] of [
  ['missing media', async () => null],
  ['a read error', async () => { throw new Error('io'); }],
  ['a corrupt WAV', async () => { const b = Buffer.from('not a wav file at all'); return { bytes: b, sha256: sha(b), size: b.length }; }],
]) test(`T71C: ${name} fails closed`, async () => {
  const bytes = wav(tone(3));
  const { ok } = await review(bytes, name === 'a corrupt WAV' ? { segment: { sha256: sha(Buffer.from('not a wav file at all')) }, encoded: { sourceSha256: sha(Buffer.from('not a wav file at all')) } } : {}, read);
  expect(ok).toBe(false);
});

test('T71C: the runner with the machine check reaches a course for real speech and stops for silent speech', async () => {
  const { createGenerationTaskStore } = await import('../../lib/generation-tasks.ts');
  const { createPrivateMediaStore } = await import('../../lib/private-media-store.ts');
  const { sealGoogleSession } = await import('../../lib/google-auth.ts');
  const { validateFinalVideoProbe } = await import('../../lib/final-video-probe.ts');
  const { createGenerationRunner } = await import('../../lib/generation-runner.ts');
  const { createMachineAudioReview } = await load();
  const translations = Object.fromEntries(['zh-Hans', 'id', 'ja', 'ko', 'hi'].map(k => [k, 'synthetic']));
  const lines = [{ id: 'a', role: 'partner', text: 'Hello', translations }, { id: 'b', role: 'learner', text: 'Hi', translations }];
  const script = { lines, phrases: [{ id: 'p', text: 'Hello', lineId: 'a', translations }], turns: [{ partnerLineId: 'a', learnerLineId: 'b' }] };
  const video = Buffer.from('synthetic video'), aac = Buffer.from('synthetic AAC');
  const secret = 'offline-t71c-session-secret-at-least-32-characters', now = Date.UTC(2026, 9, 16);
  for (const [samples, expected] of [[tone(3), 'ready'], [silence(3), 'review_failed']]) {
    const pcm = wav(samples), d = 3, delta = 0.04, total = 2 * d + 2 * delta;
    const directory = await mkdtemp(join(tmpdir(), 'les-t71c-'));
    const mediaStore = createPrivateMediaStore({ directory: join(directory, 'media'), sessionSecret: secret });
    let submits = 0;
    const store = createGenerationTaskStore({
      directory, sessionSecret: secret, simulation: true, mediaStore,
      scriptProvider: { reservedMicros: 100, generate: async () => ({ requestId: 'r', script }) },
      audioProvider: { reservedMicros: 100, generate: async line => ({ lineId: line.id, role: line.role, bytes: pcm, sha256: sha(pcm), duration: d }) },
      audioEncoder: async input => ({ bytes: aac, sha256: sha(aac), sourceSha256: input.sha256, sourceDuration: 2 * d, duration: 2 * d + delta, mimeType: 'audio/mp4', decoded: true }),
      encodedVideoProvider: { reservedMicros: 1000, submit: async () => { submits++; return { status: 'pending', jobId: 'job' + submits }; }, query: async id => ({ jobId: id, status: 'completed', videoUrl: 'https://media.example.invalid/v.mp4' }) },
      videoDownload: async () => ({ bytes: video, sha256: sha(video) }),
      videoProbe: async input => ({ sha256: input.sha256, duration: input.expectedDuration + delta, width: 720, height: 1280, fps: 24, videoCodec: 'h264', audioCodec: 'aac' }),
      videoConcat: async () => ({ bytes: video, sha256: sha(video) }),
      finalVideoVerify: async input => ({ ...validateFinalVideoProbe({ format: { format_name: 'mp4', start_time: 0, duration: total }, streams: [{ codec_type: 'video', codec_name: 'h264', width: 720, height: 1280, avg_frame_rate: '24/1', duration: total, start_time: 0, disposition: { attached_pic: 0 } }, { codec_type: 'audio', codec_name: 'aac', profile: 'LC', sample_rate: 8000, channels: 1, duration: total, start_time: 0 }] }, input.plan), sha256: sha(video), decoded: true }),
    });
    const cookie = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'owner-a', email: 'a@example.invalid' }, secret, now);
    const task = await store.create({ cookie, now, goal: 'Machine review scene', revision: 1, requestKey: 'k' });
    const runner = createGenerationRunner({ store, audioReview: createMachineAudioReview({ read: input => mediaStore.get(input) }), wait: async () => {}, maxPolls: 2 });
    const result = await runner.advance({ cookie, now: now + 1, id: task.id });
    expect(result.stopped).toBe(expected);
    expect(submits).toBe(expected === 'ready' ? 1 : 0);
  }
});

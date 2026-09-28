// Offline providers and synthetic encoded bytes: this tests task routing, not AAC codec quality.
import { test, expect } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const now = Date.UTC(2026, 8, 26);
const secret = 'offline-audio-task-session-secret-at-least-32';
const translations = Object.fromEntries(['zh-Hans', 'id', 'ja', 'ko', 'hi'].map(k => [k, 'synthetic']));
const lines = [{ id: 'a', role: 'partner', text: 'Hello', translations }, { id: 'b', role: 'learner', text: 'Hi', translations }];
function wav(seconds = 1) {
  const size = seconds * 16000;
  const b = Buffer.alloc(size + 44); b.write('RIFF'); b.writeUInt32LE(size + 36, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(size, 40); return b;
}
async function setup(audioEncoder, simulation = false, providers = {}) {
  const { createGenerationTaskStore } = await import('../../lib/generation-tasks.ts');
  const { createPrivateMediaStore } = await import('../../lib/private-media-store.ts');
  const { sealGoogleSession } = await import('../../lib/google-auth.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-audio-task-'));
  const mediaStore = createPrivateMediaStore({ directory: join(directory, 'media'), sessionSecret: secret });
  const options = { directory, sessionSecret: secret, simulation, maxReservedMicros: 91400, liveBudget: { scope: 'synthetic-live-preparation', priorSpentMicros: 900 }, mediaStore, audioEncoder, ...providers,
    scriptProvider: { reservedMicros: 100, generate: async () => ({ requestId: 'script', script: { lines, phrases: [{ id: 'p', text: 'Hello', lineId: 'a', translations }], turns: [{ partnerLineId: 'a', learnerLineId: 'b' }] } }) },
    audioProvider: providers.audioProvider ?? { reservedMicros: 200, generate: async line => asset(line) } };
  const store = createGenerationTaskStore(options);
  const cookie = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'synthetic-a', email: 'a@example.invalid' }, secret, now);
  const other = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'synthetic-b', email: 'b@example.invalid' }, secret, now);
  const task = await store.create({ cookie, now, goal: 'Party greeting', revision: 1, requestKey: 'one' });
  const input = { cookie, now: now + 1, id: task.id };
  await store.runScript(input);
  return { store, input, other, mediaStore, reopen: () => createGenerationTaskStore(options) };
}
const asset = line => { const bytes = wav(); return { lineId: line.id, role: line.role, duration: 1, bytes, sha256: createHash('sha256').update(bytes).digest('hex') }; };

const encodedBytes = Buffer.from('synthetic AAC');
const encodedHash = createHash('sha256').update(encodedBytes).digest('hex');
const encoded = input => ({ bytes: encodedBytes, sha256: encodedHash, sourceSha256: input.sha256, sourceDuration: 2, duration: 2, mimeType: 'audio/mp4', decoded: true });
async function ready(encoder, providers = {}) {
  const c = await setup(encoder, false, providers);
  await c.store.runAudio(c.input); await c.store.runAudio(c.input); await c.store.assembleAudio(c.input);
  return c;
}

for (const actualDuration of [2.08, 1.94]) test(`T61B live probe: submitted AAC duration controls verification for video duration ${actualDuration}`, async () => {
  const bytes = Buffer.from('synthetic encoded video probe');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const observed = [];
  const c = await ready(async input => ({ ...encoded(input), duration: 2.08 }), {
    encodedVideoProvider: { reservedMicros: 90000,
      submit: async () => ({ status: 'pending', jobId: 'aac-probe' }),
      query: async id => ({ jobId: id, status: 'completed', videoUrl: 'https://media.example.invalid/probe.mp4' }) },
    videoDownload: async () => ({ bytes, sha256 }),
    videoProbe: async input => {
      observed.push(input.expectedDuration);
      return { sha256, duration: actualDuration, width: 720, height: 1280, fps: 24, videoCodec: 'h264', audioCodec: 'aac' };
    },
  });
  await c.store.encodeAudio(c.input);
  await c.store.confirmEncodedAudio({ ...c.input, revision: 1, segmentIndex: 0, sha256: encodedHash });
  await c.store.runVideo(c.input);
  const before = await c.store.collectVideo(c.input);
  if (actualDuration === 2.08) {
    const result = await c.reopen().probeVideo(c.input);
    expect(result.videoChecks).toEqual([{ segmentIndex: 0, sha256, duration: 2.08, width: 720, height: 1280, fps: 24, videoCodec: 'h264', audioCodec: 'aac' }]);
    expect(result.providerCalls).toBe(before.providerCalls);
    expect(result.reservedMicros).toBe(before.reservedMicros);
  } else {
    // 1.94s fits the original 2s PCM tolerance, but not the submitted 2.08s AAC tolerance.
    await expect(c.reopen().probeVideo(c.input)).rejects.toThrow();
    expect((await c.reopen().get(c.input)).videoChecks).toBeUndefined();
  }
  expect(observed).toEqual([2.08]);
});

test('T61B live final: independently valid AAC and video rounding survives final assembly and same-version course read', async () => {
  const { validateFinalVideoProbe } = await import('../../lib/final-video-probe.ts');
  const bytes = Buffer.from('synthetic verified video');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  let concatenations = 0, verifications = 0;
  const c = await ready(async input => ({ ...encoded(input), duration: 2.08 }), {
    encodedVideoProvider: { reservedMicros: 90000,
      submit: async () => ({ status: 'pending', jobId: 'aac-final' }),
      query: async id => ({ jobId: id, status: 'completed', videoUrl: 'https://media.example.invalid/final.mp4' }) },
    videoDownload: async () => ({ bytes, sha256 }),
    videoProbe: async () => ({ sha256, duration: 2.16, width: 720, height: 1280, fps: 24, videoCodec: 'h264', audioCodec: 'aac' }),
    videoConcat: async sources => { concatenations++; expect(sources).toHaveLength(1); return { bytes, sha256 }; },
    finalVideoVerify: async input => {
      verifications++;
      const report = { format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', start_time: '0', duration: '2.16' }, streams: [
        { codec_type: 'video', codec_name: 'h264', width: 720, height: 1280, avg_frame_rate: '24/1', duration: '2.16', start_time: '0', disposition: { attached_pic: 0 } },
        { codec_type: 'audio', codec_name: 'aac', profile: 'LC', sample_rate: '8000', channels: 1, duration: '2.16', start_time: '0' },
      ] };
      return { ...validateFinalVideoProbe(report, input.plan), sha256, decoded: true };
    },
  });
  await c.store.encodeAudio(c.input);
  await c.store.confirmEncodedAudio({ ...c.input, revision: 1, segmentIndex: 0, sha256: encodedHash });
  await c.store.runVideo(c.input); await c.store.collectVideo(c.input);
  const before = await c.store.probeVideo(c.input);
  const result = await c.reopen().assembleVideo(c.input);
  expect(result.status).toBe('video_assembled');
  expect(result.videoTimeline.lines).toEqual([{ lineId: 'a', start: 0, end: 1 }, { lineId: 'b', start: 1, end: 2 }]);
  expect(result.finalVideo.duration).toBe(2.16);
  expect(result.providerCalls).toBe(before.providerCalls);
  expect(result.reservedMicros).toBe(before.reservedMicros);
  expect(await c.reopen().assembleVideo(c.input)).toEqual(result);
  const course = await c.reopen().getCourse({ ...c.input, revision: 1 });
  expect(course.revision).toBe(1);
  expect(course.source).toBe('ai-generated'); // Routing metadata; fixtures are not real generated media.
  expect(await c.reopen().getCourse({ ...c.input, revision: 1 })).toEqual(course);
  await expect(c.reopen().getCourse({ ...c.input, cookie: c.other, revision: 1 })).rejects.toThrow();
  await expect(c.reopen().getCourse({ ...c.input, revision: 2 })).rejects.toThrow();
  expect(Buffer.from((await c.reopen().getCourseMedia({ ...c.input, revision: 1 })).bytes)).toEqual(bytes);
  expect({ concatenations, verifications }).toEqual({ concatenations: 1, verifications: 1 });
});


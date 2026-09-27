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
async function setup(audioEncoder, simulation = true, providers = {}) {
  const { createGenerationTaskStore } = await import('../../lib/generation-tasks.ts');
  const { createPrivateMediaStore } = await import('../../lib/private-media-store.ts');
  const { sealGoogleSession } = await import('../../lib/google-auth.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-audio-task-'));
  const mediaStore = createPrivateMediaStore({ directory: join(directory, 'media'), sessionSecret: secret });
  const options = { directory, sessionSecret: secret, simulation, mediaStore, audioEncoder, ...providers,
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
async function ready(encoder, providers = {}) {
  const c = await setup(encoder, true, providers);
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

test('T61B audio review: explicit confirmation persists exact encoded and source hashes for this revision', async () => {
  const c = await ready(async input => encoded(input));
  const saved = await c.store.encodeAudio(c.input);
  const confirmed = await c.store.confirmEncodedAudio({ ...c.input, revision: 1, segmentIndex: 0, sha256: encodedHash });
  expect(confirmed.audioReviews).toEqual([{ revision: 1, segmentIndex: 0, sha256: encodedHash, sourceSha256: saved.encodedAudio[0].sourceSha256, confirmedAt: c.input.now }]);
  expect(await c.reopen().get(c.input)).toEqual(confirmed);
  expect(await c.reopen().confirmEncodedAudio({ ...c.input, revision: 1, segmentIndex: 0, sha256: encodedHash })).toEqual(confirmed);
  expect(confirmed.providerCalls).toBe(saved.providerCalls);
  expect(confirmed.reservedMicros).toBe(saved.reservedMicros);
});

test('T61B audio review: missing audio, wrong hash, wrong revision and other owner cannot confirm', async () => {
  const c = await ready(async input => encoded(input));
  const request = { ...c.input, revision: 1, segmentIndex: 0, sha256: encodedHash };
  await expect(c.store.confirmEncodedAudio(request)).rejects.toThrow();
  await c.store.encodeAudio(c.input);
  for (const change of [{ revision: 2 }, { sha256: 'd'.repeat(64) }, { segmentIndex: 1 }, { segmentIndex: -1 }, { cookie: c.other }]) {
    await expect(c.store.confirmEncodedAudio({ ...request, ...change })).rejects.toThrow();
  }
  expect((await c.reopen().get(c.input)).audioReviews).toBeUndefined();
});

test('T61B audio review: deleted or inaccessible encoded asset cannot gain confirmation', async () => {
  const c = await ready(async input => encoded(input));
  await c.store.encodeAudio(c.input);
  // Inject a read failure at the media boundary; do not delete any existing file.
  c.mediaStore.get = async () => { throw new Error('synthetic media unavailable'); };
  await expect(c.store.confirmEncodedAudio({ ...c.input, revision: 1, segmentIndex: 0, sha256: encodedHash })).rejects.toThrow();
  expect((await c.reopen().get(c.input)).audioReviews).toBeUndefined();
});

test('T61B encoded video task: submits stored reviewed AAC with reservation persisted before transport', async () => {
  let calls = 0, c;
  c = await ready(async input => encoded(input), { encodedVideoProvider: { reservedMicros: 90000, submit: async input => {
    calls++;
    expect(Buffer.from(input.audio.bytes)).toEqual(encodedBytes);
    expect(input.audio.sha256).toBe(encodedHash);
    expect(input.reviewedSha256).toBe(encodedHash);
    expect(input.goal).toBe('Party greeting');
    const pending = await c.reopen().get(c.input);
    expect(pending).toMatchObject({ status: 'submitting', providerCalls: 4, reservedMicros: 90500 });
    return { status: 'pending', jobId: 'encoded-job' };
  } } });
  await c.store.encodeAudio(c.input);
  await c.store.confirmEncodedAudio({ ...c.input, revision: 1, segmentIndex: 0, sha256: encodedHash });
  const result = await c.reopen().runVideo(c.input);
  expect(result.status).toBe('video_pending');
  expect(result.videoJobs[0]).toMatchObject({ jobId: 'encoded-job', segmentIndex: 0, audioSha256: encodedHash, audioDuration: 2 });
  await expect(c.store.runVideo(c.input)).rejects.toThrow();
  expect(calls).toBe(1);
});

test('T61B encoded video task: missing review never falls back to legacy reviewed flag or reserves cost', async () => {
  let calls = 0;
  const submit = async () => { calls++; return { status: 'pending', jobId: 'unexpected' }; };
  const c = await ready(async input => encoded(input), {
    encodedVideoProvider: { reservedMicros: 90000, submit },
    videoProvider: { reservedMicros: 90000, audioReviewed: true, submit },
  });
  await c.store.encodeAudio(c.input);
  const before = await c.store.get(c.input);
  await expect(c.store.runVideo({ ...c.input, reviewedSha256: encodedHash })).rejects.toThrow();
  expect(calls).toBe(0); expect(await c.reopen().get(c.input)).toEqual(before);
});

test('T61B encoded video task: uncertain submission remains reserved and cannot repeat after reopening', async () => {
  let calls = 0;
  const c = await ready(async input => encoded(input), { encodedVideoProvider: { reservedMicros: 90000, submit: async () => { calls++; throw new Error('synthetic timeout'); } } });
  await c.store.encodeAudio(c.input);
  await c.store.confirmEncodedAudio({ ...c.input, revision: 1, segmentIndex: 0, sha256: encodedHash });
  const result = await c.store.runVideo(c.input);
  expect(result).toMatchObject({ status: 'submission_unknown', providerCalls: 4, reservedMicros: 90500 });
  await expect(c.reopen().runVideo(c.input)).rejects.toThrow(); expect(calls).toBe(1);
});

test('T61B encoded retrieval: reopened task queries encoded provider and privately collects once without another reservation', async () => {
  let submissions = 0, queries = 0, downloads = 0, legacyCalls = 0;
  const bytes = Buffer.from('synthetic private video');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const c = await ready(async input => encoded(input), {
    encodedVideoProvider: { reservedMicros: 90000,
      submit: async () => { submissions++; return { status: 'pending', jobId: 'aac-job' }; },
      query: async id => { queries++; expect(id).toBe('aac-job'); return { jobId: id, status: 'completed', videoUrl: 'https://media.example.invalid/private.mp4?temporary=synthetic' }; } },
    videoProvider: { reservedMicros: 90000, audioReviewed: true,
      submit: async () => { legacyCalls++; throw new Error('wrong provider'); },
      query: async () => { legacyCalls++; throw new Error('wrong provider'); } },
    videoDownload: async url => { downloads++; expect(url).toContain('media.example.invalid'); return { bytes, sha256 }; },
  });
  await c.store.encodeAudio(c.input);
  await c.store.confirmEncodedAudio({ ...c.input, revision: 1, segmentIndex: 0, sha256: encodedHash });
  const submitted = await c.store.runVideo(c.input);
  const queried = await c.reopen().queryVideo(c.input);
  expect(queried.videoJobs[0].status).toBe('completed');
  const collected = await c.reopen().collectVideo(c.input);
  expect(collected.status).toBe('video_pending');
  expect(collected.videoAssets).toHaveLength(1);
  const saved = await c.mediaStore.get({ ...c.input, courseId: c.input.id, revision: 1, assetId: collected.videoAssets[0].assetId });
  expect(Buffer.from(saved.bytes)).toEqual(bytes);
  expect(collected.providerCalls).toBe(submitted.providerCalls);
  expect(collected.reservedMicros).toBe(submitted.reservedMicros);
  expect(JSON.stringify(collected)).not.toContain('temporary=');
  expect(await c.reopen().collectVideo(c.input)).toEqual(collected);
  expect({ submissions, queries, downloads, legacyCalls }).toEqual({ submissions: 1, queries: 2, downloads: 1, legacyCalls: 0 });
});

test('T61B encoded retrieval: missing encoded query cannot fall back to legacy query', async () => {
  let legacyCalls = 0;
  const c = await ready(async input => encoded(input), {
    encodedVideoProvider: { reservedMicros: 90000, submit: async () => ({ status: 'pending', jobId: 'aac-job' }) },
    videoProvider: { reservedMicros: 90000, audioReviewed: true, submit: async () => ({ status: 'pending', jobId: 'wrong' }),
      query: async id => { legacyCalls++; return { jobId: id, status: 'processing' }; } },
    videoDownload: async () => { throw new Error('must not download'); },
  });
  await c.store.encodeAudio(c.input);
  await c.store.confirmEncodedAudio({ ...c.input, revision: 1, segmentIndex: 0, sha256: encodedHash });
  const before = await c.store.runVideo(c.input);
  await expect(c.reopen().queryVideo(c.input)).rejects.toThrow();
  await expect(c.reopen().collectVideo(c.input)).rejects.toThrow();
  expect(legacyCalls).toBe(0);
  expect(await c.reopen().get(c.input)).toEqual(before);
});

for (const actualDuration of [2.08, 1.94]) test(`T61B encoded probe: submitted AAC duration controls verification for video duration ${actualDuration}`, async () => {
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

test('T61B encoded final: independently valid AAC and video rounding survives final assembly and same-version course read', async () => {
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
  expect({ concatenations, verifications }).toEqual({ concatenations: 1, verifications: 1 });
});

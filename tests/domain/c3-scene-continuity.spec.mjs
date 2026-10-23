import { test, expect } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// C3 review fixes (2026-10-17): the user saw cuts between unrelated shots, a woman speaking with a male voice and
// swapped vendor/customer roles. A scripted scene now fixes who is on camera, the partner voice follows that
// person, the video prompt is first-person with only the partner speaking, and later segments start from the
// previous segment's last frame.
const secret = 'offline-t71b-session-secret-at-least-32-characters';
const now = Date.UTC(2026, 9, 16);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const translations = Object.fromEntries(['zh-Hans', 'id', 'ja', 'ko', 'hi'].map(k => [k, 'synthetic']));
const lines = Array.from({ length: 4 }, (_, i) => ({ id: 'line' + i, role: i % 2 ? 'learner' : 'partner', text: i % 2 ? 'Hi ' + 'okay '.repeat(15).trim() : 'Hello ' + 'friend '.repeat(46).trim(), translations })); // 128 words: above the scene minimum
const scene = { setting: 'A busy hawker centre chicken rice stall at lunchtime.', partnerGender: 'male', partnerLook: 'in his fifties, white apron' };
const script = { scene, lines, phrases: [{ id: 'phrase', text: 'Hello', lineId: 'line0', translations }], turns: [{ partnerLineId: 'line0', learnerLineId: 'line1' }, { partnerLineId: 'line2', learnerLineId: 'line3' }] };
const pcm = Buffer.alloc(240044);
pcm.write('RIFF'); pcm.writeUInt32LE(240036, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(8000, 24); pcm.writeUInt32LE(16000, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(240000, 40);
for (let i = 44; i < pcm.length; i += 2) pcm.writeInt16LE(Math.round(8000 * Math.sin(i / 20)), i); // audible speech stand-in
const delta = 0.04, legacyDuration = 4 * (15 + 2 * delta);
const video = Buffer.from('synthetic video'), aac = Buffer.from('synthetic AAC');

const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from('synthetic frame')]);

async function setup(withScene = true) {
  // Scene segments are repaired to exactly the 15-second source audio; legacy ones keep the probe timing.
  const duration = withScene ? 60 : legacyDuration;
  const { createGenerationTaskStore } = await import('../../lib/generation-tasks.ts');
  const { createPrivateMediaStore } = await import('../../lib/private-media-store.ts');
  const { sealGoogleSession } = await import('../../lib/google-auth.ts');
  const { validateFinalVideoProbe } = await import('../../lib/final-video-probe.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-c3-scene-'));
  const seen = { cast: [], submits: [], extracts: [], encoded: [], repairs: [] };
  let jobs = 0;
  const chosen = withScene ? script : (({ scene: _, ...rest }) => rest)(script);
  const store = createGenerationTaskStore({
    directory, sessionSecret: secret, simulation: true,
    mediaStore: createPrivateMediaStore({ directory: join(directory, 'media'), sessionSecret: secret }),
    scriptProvider: { reservedMicros: 100, generate: async () => ({ requestId: 'synthetic', script: chosen }) },
    audioProvider: { reservedMicros: 100, generate: async (line, cast) => { seen.cast.push(cast); return { lineId: line.id, role: line.role, bytes: pcm, sha256: sha(pcm), duration: 15 }; } },
    audioEncoder: async input => { seen.encoded.push(input.bytes); return { bytes: aac, sha256: sha(aac), sourceSha256: input.sha256, sourceDuration: 15, duration: 15 + delta, mimeType: 'audio/mp4', decoded: true }; },
    encodedVideoProvider: {
      reservedMicros: 1000,
      submit: async input => { seen.submits.push({ prompt: input.prompt, reference: input.referenceImage?.sha256 }); return { status: 'pending', jobId: 'job' + ++jobs }; },
      query: async id => ({ jobId: id, status: 'completed', videoUrl: 'https://media.example.invalid/sample.mp4' }),
    },
    videoDownload: async () => ({ bytes: video, sha256: sha(video) }),
    videoProbe: async input => ({ sha256: input.sha256, duration: input.expectedDuration + delta, width: 720, height: 1280, fps: 24, videoCodec: 'h264', audioCodec: 'aac' }),
    videoRepair: async input => { seen.repairs.push(input.audio.bytes); const bytes = Buffer.concat([video, Buffer.from('+full audio')]); return { bytes, sha256: sha(bytes), sourceVideoSha256: input.video.sha256, sourceAudioSha256: input.audio.sha256, decoded: true, duration: 15, width: 720, height: 1280, fps: 24, videoCodec: 'h264', audioCodec: 'aac', targetDuration: 15, padSeconds: 0, padFrames: 0, replaceWithSourceAudio: true }; },
    referenceExtractor: async input => { seen.extracts.push(input.timeSeconds); return { bytes: png, sha256: sha(png), sourceVideoSha256: input.sha256, timeSeconds: input.timeSeconds, mimeType: 'image/png', width: 720, height: 1280, decoded: true }; },
    videoConcat: async () => ({ bytes: video, sha256: sha(video) }),
    finalVideoVerify: async input => ({ ...validateFinalVideoProbe({ format: { format_name: 'mp4', start_time: 0, duration }, streams: [{ codec_type: 'video', codec_name: 'h264', width: 720, height: 1280, avg_frame_rate: '24/1', duration, start_time: 0, disposition: { attached_pic: 0 } }, { codec_type: 'audio', codec_name: 'aac', profile: 'LC', sample_rate: 8000, channels: 1, duration, start_time: 0 }] }, input.plan), sha256: sha(video), decoded: true }),
  });
  const cookie = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'owner-a', email: 'a@example.invalid' }, secret, now);
  const task = await store.create({ cookie, now, goal: '在小贩中心点鸡饭', revision: 1, requestKey: 'k' });
  return { store, seen, input: { cookie, now: now + 1, id: task.id } };
}
const run = async store => (await import('../../lib/generation-runner.ts')).createGenerationRunner({ store, audioReview: async () => true, wait: async () => {}, maxPolls: 3 }).advance;

test('C3 scene: later segments start from the previous last frame, every segment gets the first-person prompt', async () => {
  const { store, seen, input } = await setup();
  expect((await (await run(store))(input)).stopped).toBe('ready');
  expect(seen.submits).toHaveLength(4);
  expect(seen.submits[0].reference).toBeUndefined();
  for (const submit of seen.submits.slice(1)) expect(submit.reference).toBe(sha(png));
  expect(seen.extracts).toHaveLength(3);
  for (const time of seen.extracts) expect(time).toBeCloseTo(15 - 2 / 24, 2); // the repaired segment matches the 15-second source audio
  for (const [i, submit] of seen.submits.entries()) {
    expect(submit.prompt).toContain('first-person');
    expect(submit.prompt).toContain('adult man');
    // C15-4c: each segment's prompt names only that segment's partner words; learner-only segments have none.
    if (i % 2 === 0) expect(submit.prompt).toContain('"Hello friend');
    else { expect(submit.prompt).not.toContain('"Hello friend'); expect(submit.prompt).toContain('In this clip he does not speak at all'); }
    expect(submit.prompt).not.toContain('"Hi okay');
    expect(submit.prompt).toContain('no cuts');
  }
});

test('C3 scene: the video provider hears only the partner, and the full audio is put back on every segment', async () => {
  const { store, seen, input } = await setup();
  await (await run(store))(input);
  const task = await store.get(input);
  expect(task.audioAssembly.segments).toHaveLength(4);
  // Each segment holds one partner line (line0/line2) or one learner line (line1/line3) of 15 s.
  for (const [i, segment] of task.audioAssembly.segments.entries()) {
    const learner = i % 2 === 1, drive = seen.encoded[i];
    expect(segment.driveSha256).toBe(sha(drive));
    expect(drive.subarray(0, 44)).toEqual(pcm.subarray(0, 44));
    if (learner) { expect(segment.driveSha256).not.toBe(segment.sha256); expect(drive.subarray(44).every(byte => byte === 0)).toBe(true); }
    else expect(segment.driveSha256).toBe(segment.sha256);
  }
  expect(seen.repairs).toHaveLength(4);
  for (const audio of seen.repairs) expect(sha(audio)).toBe(sha(pcm));
  expect(task.videoRepairs.map(item => item.segmentIndex)).toEqual([0, 1, 2, 3]);
});

test('C3 scene: every audio line is generated with the on-camera partner gender', async () => {
  const { store, seen, input } = await setup();
  await (await run(store))(input);
  expect(seen.cast).toEqual(Array(4).fill({ partnerGender: 'male' }));
});

test('C3 scene: older scripts without a scene keep the goal prompt, legacy voices and no frame chaining', async () => {
  const { store, seen, input } = await setup(false);
  expect((await (await run(store))(input)).stopped).toBe('ready');
  expect(seen.extracts).toHaveLength(0);
  expect(seen.cast).toEqual(Array(4).fill(undefined));
  for (const submit of seen.submits) { expect(submit.prompt).toBe('在小贩中心点鸡饭'); expect(submit.reference).toBeUndefined(); }
});

test('C3 scene: script validation accepts a scene, rejects a malformed one and still accepts scripts without one', async () => {
  const { validateGeneratedScript } = await import('../../lib/generated-script.ts');
  expect(validateGeneratedScript(script).ok).toBe(true);
  expect(validateGeneratedScript((({ scene: _, ...rest }) => rest)(script)).ok).toBe(true);
  for (const bad of [{ ...scene, partnerGender: 'robot' }, { ...scene, partnerLook: '' }, { ...scene, extra: 'x' }, 'scene'])
    expect(validateGeneratedScript({ ...script, scene: bad })).toEqual({ ok: false, issues: ['scene'] });
});

test('C3 scene: a scene script must hold 115 to 160 spoken words; scripts without a scene are not length-checked', async () => {
  const { validateGeneratedScript } = await import('../../lib/generated-script.ts');
  // Short words keep every line under the 500-character line limit.
  const withWords = n => ({ ...script, lines: script.lines.map((line, i) => ({ ...line, text: i === 0 ? ['Hello', ...Array(n - 4).fill('w')].join(' ') : 'w' })) });
  expect(validateGeneratedScript(withWords(115)).ok).toBe(true);
  expect(validateGeneratedScript(withWords(160)).ok).toBe(true);
  expect(validateGeneratedScript(withWords(114))).toEqual({ ok: false, issues: ['length'] });
  expect(validateGeneratedScript(withWords(161))).toEqual({ ok: false, issues: ['length'] });
  const { scene: _, ...legacy } = withWords(10);
  expect(validateGeneratedScript(legacy).ok).toBe(true);
});

test('C3 scene: the partner voice follows the on-camera gender and the learner takes the other voice', async () => {
  const { lineVoice } = await import('../../lib/generated-audio.ts');
  expect([lineVoice('partner', 'female'), lineVoice('learner', 'female')]).toEqual(['marin', 'cedar']);
  expect([lineVoice('partner', 'male'), lineVoice('learner', 'male')]).toEqual(['cedar', 'marin']);
  expect([lineVoice('partner'), lineVoice('learner')]).toEqual(['marin', 'cedar']);
});

test('C3 scene: the prompt names a woman for a female partner and keeps the learner off camera', async () => {
  const { sceneVideoPrompt } = await import('../../lib/scene-video-prompt.ts');
  const prompt = sceneVideoPrompt('goal', { ...script, scene: { ...scene, partnerGender: 'female', partnerLook: 'in her thirties, school lanyard' } });
  expect(prompt).toContain('adult woman, in her thirties, school lanyard');
  expect(prompt).toContain('She is the only person on screen');
  expect(prompt).toContain('stays off camera');
  expect(prompt.length).toBeLessThanOrEqual(5000);
});

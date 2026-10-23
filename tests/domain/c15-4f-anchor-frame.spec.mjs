import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// C15-4f (2026-10-23, zero cost): a fixed reference frame for the whole lesson, framing and light in the prompt, and a
// framing drift check. Attempt 6 of the school lesson (ltx-2-3-pro, task ffd1ae2d) chained every segment from the last
// frame of the one before: the error added up, so the shot pushed in from waist-up to a big close-up (median face height
// 0.33 -> 0.39 -> 0.42 -> 0.45 of the frame), the light turned into a hard side back light, the face aged and the
// expression got exaggerated; the teacher still walked in at the start, and in the last segment she moved her lips while
// the learner said "Thank you, teacher!". Now, after segment 1 is generated, one frame of it where the partner is quiet,
// mouth closed, facing the camera, waist-up and sharp (the existing OpenCV DNN face measurements) becomes the fixed
// reference image of every later segment; without such a frame the old last-frame chain is kept and the task says why.
// Every provider here is a stand-in; nothing calls OpenAI, LTX or an image model.
const ffmpeg = '/usr/bin/ffmpeg', ffprobe = '/usr/bin/ffprobe', python = '/usr/bin/python3';
const secret = 'offline-c15-4f-session-secret-at-least-32-characters';
const now = Date.UTC(2026, 9, 23);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const script = fileURLToPath(new URL('../../scripts/video-qa/face_checks.py', import.meta.url));
const hotel = fileURLToPath(new URL('../../public/media/hotel-pov-12s.mp4', import.meta.url));
const video = '/mnt/project-files/les-c15/video';
const a6 = [0, 1, 2, 3].map(index => `${video}/school-ltx-2-3-pro-a6-seg${index}.mp4`);
const a4seg0 = `${video}/school-ltx-2-3-pro-a4-seg0.mp4`;
const scratch = mkdtempSync(join(tmpdir(), 'les-c15-4f-'));
const quality = () => import('../../lib/video-quality.ts');
const gateModule = () => import('../../lib/video-quality-gate.ts');

// ---- choosing the fixed reference frame (pure rules) ----

const candidate = over => ({ t: 8, face_height: 0.19, mouth_open: 0.01, eye_open: 0.35, yaw: 0.01, sharpness: 60, ...over });
const anchorMeasurement = candidates => ({ status: 'measured', frames: 60, anchor: { candidates } });
const quiet = [{ start: 6, end: 11 }];

test('C15-4f anchor limits: one face, waist-up face height, closed mouth, open eyes, frontal, sharp; marked to be calibrated', async () => {
  const { ANCHOR_FRAME_LIMITS } = await quality();
  expect(ANCHOR_FRAME_LIMITS).toEqual({ minFaceHeight: 0.1, maxFaceHeight: 0.28, maxMouthOpen: 0.05, minEyeOpen: 0.2, maxYaw: 0.1, minSharpness: 20 });
  const source = readFileSync(new URL('../../lib/video-quality.ts', import.meta.url), 'utf8');
  expect(source).toContain('C15-4f');
  expect(source).toContain('待标定');
});

test('C15-4f anchor choice: the quietest qualifying frame inside a learner line is chosen', async () => {
  const { chooseAnchorFrame } = await quality();
  const choice = chooseAnchorFrame(anchorMeasurement([
    candidate({ t: 2, mouth_open: 0.001 }), // outside the learner line: she is talking there
    candidate({ t: 7, mouth_open: 0.03 }),
    candidate({ t: 8.4, mouth_open: 0.008, face_height: 0.2 }),
    candidate({ t: 9, mouth_open: 0.02 }),
  ]), quiet);
  expect(choice).toMatchObject({ status: 'selected', timeSeconds: 8.4, faceHeight: 0.2, mouthOpen: 0.008 });
});

test('C15-4f anchor choice: close-ups, far shots, open mouths, closed eyes, turned or blurred faces never qualify', async () => {
  const { chooseAnchorFrame } = await quality();
  for (const bad of [
    { face_height: 0.33 }, // attempt 6: by the learner line she is already a close-up
    { face_height: 0.08 }, // still far away
    { mouth_open: 0.17 }, // smiling with parted lips
    { eye_open: 0.04 }, // a blink
    { yaw: 0.2 }, // head turned
    { sharpness: 12 }, // blurred
  ]) {
    const choice = chooseAnchorFrame(anchorMeasurement([candidate(bad)]), quiet);
    expect(choice.status).toBe('none');
    expect(typeof choice.reason).toBe('string');
    expect(choice.reason.length).toBeGreaterThan(0);
  }
  // Without any learner line in the segment every sampled frame may be used.
  expect(chooseAnchorFrame(anchorMeasurement([candidate({ t: 2 })]), [])).toMatchObject({ status: 'selected', timeSeconds: 2 });
});

test('C15-4f anchor choice: no measurement, a malformed one or no candidate gives none, never a guess', async () => {
  const { chooseAnchorFrame } = await quality();
  for (const raw of [null, {}, { status: 'not_checked', reason: 'no model' }, { status: 'measured', frames: 3 }, anchorMeasurement('x'),
    anchorMeasurement([]), anchorMeasurement([candidate({ t: -1 })]), anchorMeasurement([candidate({ face_height: 'big' })]), anchorMeasurement([candidate({ sharpness: null })])]) {
    expect(chooseAnchorFrame(raw, quiet).status).toBe('none');
  }
});

test('C15-4f anchor select: the face script runs with --anchor and the learner lines; a failure is none', async () => {
  const { createAnchorFrameSelect } = await gateModule();
  const calls = [];
  const select = createAnchorFrameSelect({ python, script, execute: async (file, args) => {
    calls.push({ file, args });
    return { stdout: JSON.stringify(anchorMeasurement([candidate({ t: 9.2 })])) + '\n', stderr: '' };
  } });
  const bytes = Buffer.from('synthetic segment');
  expect(await select({ video: { bytes, sha256: sha(bytes) }, learnerWindows: quiet })).toMatchObject({ status: 'selected', timeSeconds: 9.2 });
  expect(calls[0].file).toBe(python);
  expect(calls[0].args).toContain('--anchor');
  expect(calls[0].args).toContain(JSON.stringify(quiet));
  const broken = createAnchorFrameSelect({ python, script, execute: async () => { throw new Error('python missing'); } });
  expect((await broken({ video: { bytes, sha256: sha(bytes) }, learnerWindows: quiet })).status).toBe('none');
  const garbled = createAnchorFrameSelect({ python, script, execute: async () => ({ stdout: 'not json', stderr: '' }) });
  expect((await garbled({ video: { bytes, sha256: sha(bytes) }, learnerWindows: quiet })).status).toBe('none');
  expect(() => createAnchorFrameSelect({ python: 'python3', script })).toThrow();
});

// ---- framing drift: each segment's median face height against the first segment's ----

const faceMeasurement = height => ({ status: 'measured', frames: 50, single_face: { ratio: 1, multi_ratio: 0, keyframes: [], multi_keyframes: [], ...(height === undefined ? {} : { face_height: height }) }, learner_mouth: { ratio: 0.1, frames: 10, keyframes: [] } });
const drift = checks => checks.find(check => check.id === 'framing_drift');

test('C15-4f drift threshold: +-35% against the first segment, marked to be calibrated', async () => {
  const { QUALITY_THRESHOLDS, OPTIONAL_QUALITY_CHECK_IDS, QUALITY_CHECK_IDS } = await quality();
  expect(QUALITY_THRESHOLDS.maxFramingDrift).toBe(0.35);
  expect(OPTIONAL_QUALITY_CHECK_IDS).toEqual(['framing_drift']);
  // The five required checks are unchanged.
  expect(QUALITY_CHECK_IDS).toEqual(['cuts', 'single_face', 'learner_mouth', 'seam_ssim', 'black_freeze']);
});

test('C15-4f drift judge: the first segment sets the reference; later ones pass within 35% and fail beyond it', async () => {
  const { judgeFaceMeasurement } = await gateModule();
  // Without framing information the old two checks come back alone.
  expect(judgeFaceMeasurement(faceMeasurement(0.33), [{ start: 1, end: 2 }]).map(check => check.id)).toEqual(['single_face', 'learner_mouth']);
  expect(drift(judgeFaceMeasurement(faceMeasurement(0.33), [], { segmentIndex: 0 }))).toMatchObject({ status: 'passed', value: 0.33 });
  // Attempt 6 medians: 0.388 (+18%) and 0.419 (+27%) pass, 0.451 (+37%) fails.
  expect(drift(judgeFaceMeasurement(faceMeasurement(0.388), [], { segmentIndex: 1, baseFaceHeight: 0.33 }))).toMatchObject({ status: 'passed', value: 0.388 });
  expect(drift(judgeFaceMeasurement(faceMeasurement(0.419), [], { segmentIndex: 2, baseFaceHeight: 0.33 })).status).toBe('passed');
  const pushed = drift(judgeFaceMeasurement(faceMeasurement(0.451), [], { segmentIndex: 3, baseFaceHeight: 0.33 }));
  expect(pushed).toMatchObject({ status: 'failed', value: 0.451 });
  expect(pushed.reason).toContain('framing');
  // Pulling back to a far shot is drift too.
  expect(drift(judgeFaceMeasurement(faceMeasurement(0.2), [], { segmentIndex: 1, baseFaceHeight: 0.33 })).status).toBe('failed');
});

test('C15-4f drift judge: an unknown reference or a measurement without face height is not_checked, never passed', async () => {
  const { judgeFaceMeasurement } = await gateModule();
  expect(drift(judgeFaceMeasurement(faceMeasurement(0.4), [], { segmentIndex: 2 })).status).toBe('not_checked');
  expect(drift(judgeFaceMeasurement(faceMeasurement(undefined), [], { segmentIndex: 0 })).status).toBe('not_checked');
  expect(drift(judgeFaceMeasurement(faceMeasurement(null), [], { segmentIndex: 1, baseFaceHeight: 0.3 })).status).toBe('not_checked');
  expect(drift(judgeFaceMeasurement({ status: 'not_checked', reason: 'no model' }, [], { segmentIndex: 1, baseFaceHeight: 0.3 })).status).toBe('not_checked');
});

test('C15-4f verdict: a failed drift check blocks the segment, a passed one keeps it passed, an open one needs review', async () => {
  const { combineQualityChecks, validQualityCheck } = await quality();
  const five = ['cuts', 'single_face', 'learner_mouth', 'seam_ssim', 'black_freeze'].map(id => ({ id, status: 'passed' }));
  expect(validQualityCheck({ id: 'framing_drift', status: 'failed', value: 0.451, reason: 'framing drift', keyframes: [] })).toBe(true);
  expect(combineQualityChecks(five)).toBe('passed');
  expect(combineQualityChecks([...five, { id: 'framing_drift', status: 'passed', value: 0.39 }])).toBe('passed');
  expect(combineQualityChecks([...five, { id: 'framing_drift', status: 'failed', value: 0.45 }])).toBe('quality_failed');
  expect(combineQualityChecks([...five, { id: 'framing_drift', status: 'not_checked' }])).toBe('needs_review');
  expect(combineQualityChecks([...five, { id: 'framing_drift', status: 'passed' }, { id: 'framing_drift', status: 'passed' }])).toBe('needs_review');
  expect(combineQualityChecks([...five.slice(0, 4), { id: 'framing_drift', status: 'passed' }])).toBe('needs_review');
});

test('C15-4f gate: the segment index and the first segment face height reach the face checks, and their drift check is kept', async () => {
  const { createVideoQualityGate } = await gateModule();
  const file = join(scratch, 'moving.mp4');
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=24:d=3', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', file]);
  const bytes = readFileSync(file), seen = [];
  const gate = createVideoQualityGate({ ffmpeg, ffprobe, faces: async input => {
    seen.push({ segmentIndex: input.segmentIndex, baseFaceHeight: input.baseFaceHeight });
    return [{ id: 'single_face', status: 'passed', value: 1 }, { id: 'learner_mouth', status: 'passed', value: 0 }, { id: 'framing_drift', status: 'failed', value: 0.45, reason: 'framing drift' }];
  } });
  const report = await gate({ segmentIndex: 2, video: { bytes, sha256: sha(bytes) }, previous: { bytes, sha256: sha(bytes) }, learnerWindows: [], baseFaceHeight: 0.33 });
  expect(seen).toEqual([{ segmentIndex: 2, baseFaceHeight: 0.33 }]);
  expect(drift(report.checks)).toMatchObject({ status: 'failed', value: 0.45 });
  for (const bad of [-0.1, 0, 1.5, Number.NaN, '0.3']) await expect(gate({ segmentIndex: 1, video: { bytes, sha256: sha(bytes) }, learnerWindows: [], baseFaceHeight: bad })).rejects.toThrow();
});

// ---- the prompt: framing, light and expression in every segment; no walk-in; a quiet nodding ending ----

const lessonLines = [
  { id: 'p1', role: 'partner', text: 'Hello, thanks for waiting.' }, { id: 'l1', role: 'learner', text: 'Yes, my child talked about it.' },
  { id: 'p2', role: 'partner', text: 'Take care and have a nice evening.' }, { id: 'l2', role: 'learner', text: 'Thank you, teacher!' },
];
const lessonScene = { setting: 'A primary school classroom door after school.', partnerGender: 'female', partnerLook: 'early 30s, light blue blouse' };
const FRAMING = 'Medium shot, waist-up, same framing as the reference image; the camera does not move or zoom.';
const LIGHT = 'Even soft indoor light, natural calm expression.';
const NO_WALK = 'She is already standing close in front of the camera from the first frame and does not walk in.';
const NOD = 'At the end of the clip she listens silently with her lips closed and nods gently.';

test('C15-4f prompt: every segment asks for the same waist-up framing, a still camera, even light and a calm expression', async () => {
  const { sceneVideoPrompt } = await import('../../lib/scene-video-prompt.ts');
  const script = { lines: lessonLines, scene: lessonScene };
  const first = sceneVideoPrompt('goal', script, { index: 0, count: 2, lines: [{ lineId: 'p1', start: 0, end: 5 }, { lineId: 'l1', start: 5, end: 9 }] });
  const last = sceneVideoPrompt('goal', script, { index: 1, count: 2, lines: [{ lineId: 'p2', start: 0, end: 4 }, { lineId: 'l2', start: 4, end: 8 }] });
  const whole = sceneVideoPrompt('goal', script);
  for (const prompt of [first, last, whole]) {
    expect(prompt).toContain(FRAMING);
    expect(prompt).toContain(LIGHT);
    // The old wording asked for "face and shoulders filling the upper half of the frame", a close-up.
    expect(prompt).not.toContain('face and shoulders filling');
    expect(prompt.length).toBeLessThanOrEqual(5000);
  }
  expect(first).toContain(NO_WALK);
  expect(last).not.toContain(NO_WALK);
  // The silent learner times are still spelled out.
  expect(last).toContain('From 4.0 s to 8.0 s she listens silently with her lips closed');
});

test('C15-4f prompt: only a last segment that ends on a learner line asks for a quiet, nodding ending', async () => {
  const { sceneVideoPrompt } = await import('../../lib/scene-video-prompt.ts');
  const script = { lines: lessonLines, scene: lessonScene };
  const endsLearner = sceneVideoPrompt('goal', script, { index: 1, count: 2, lines: [{ lineId: 'p2', start: 0, end: 4 }, { lineId: 'l2', start: 4, end: 8 }] });
  expect(endsLearner).toContain(NOD);
  const male = sceneVideoPrompt('goal', { lines: lessonLines, scene: { ...lessonScene, partnerGender: 'male' } }, { index: 1, count: 2, lines: [{ lineId: 'p2', start: 0, end: 4 }, { lineId: 'l2', start: 4, end: 8 }] });
  expect(male).toContain('At the end of the clip he listens silently with his lips closed and nods gently.');
  // Not the last segment, or the last one ends on her own line: no nodding ending.
  expect(sceneVideoPrompt('goal', script, { index: 0, count: 2, lines: [{ lineId: 'p1', start: 0, end: 5 }, { lineId: 'l1', start: 5, end: 9 }] })).not.toContain('nods gently');
  expect(sceneVideoPrompt('goal', script, { index: 1, count: 2, lines: [{ lineId: 'l1', start: 0, end: 4 }, { lineId: 'p2', start: 4, end: 8 }] })).not.toContain('nods gently');
});

// ---- store and runner: segment 1 gives the fixed reference frame for every later segment ----

const translations = Object.fromEntries(['zh-Hans', 'id', 'ja', 'ko', 'hi'].map(k => [k, 'synthetic']));
const lines = Array.from({ length: 4 }, (_, i) => ({ id: 'line' + i, role: i % 2 ? 'learner' : 'partner', text: i % 2 ? 'Hi ' + 'okay '.repeat(15).trim() : 'Hello ' + 'friend '.repeat(46).trim(), translations }));
const scene = { setting: 'A busy hawker centre chicken rice stall at lunchtime.', partnerGender: 'male', partnerLook: 'in his fifties, white apron' };
const lessonScript = { scene, lines, phrases: [{ id: 'phrase', text: 'Hello', lineId: 'line0', translations }], turns: [{ partnerLineId: 'line0', learnerLineId: 'line1' }, { partnerLineId: 'line2', learnerLineId: 'line3' }] };
const pcm = Buffer.alloc(240044);
pcm.write('RIFF'); pcm.writeUInt32LE(240036, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(8000, 24); pcm.writeUInt32LE(16000, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(240000, 40);
for (let i = 44; i < pcm.length; i += 2) pcm.writeInt16LE(Math.round(8000 * Math.sin(i / 20)), i);
const delta = 0.04, aac = Buffer.from('synthetic AAC'), final = Buffer.from('synthetic final video');
const frameAt = time => Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from(`synthetic frame at ${time}`)]);
const description = '在小贩中心点鸡饭';
const requirement = { revision: 1, content: { description, language: 'zh-Hans', keywords: { location: '', learnerRole: '', partnerRole: '', topic: '', goal: '', special: '' } } };
const passedChecks = ['cuts', 'single_face', 'learner_mouth', 'seam_ssim', 'black_freeze'].map(id => ({ id, status: 'passed' }));

async function setup({ anchorFrameSelect, gate } = {}) {
  const { createGenerationTaskStore } = await import('../../lib/generation-tasks.ts');
  const { createPrivateMediaStore } = await import('../../lib/private-media-store.ts');
  const { sealGoogleSession } = await import('../../lib/google-auth.ts');
  const { validateFinalVideoProbe } = await import('../../lib/final-video-probe.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-c15-4f-store-'));
  const seen = { submits: [], extracts: [], selects: [], gates: [] };
  let jobs = 0, renders = 0;
  const store = createGenerationTaskStore({
    directory, sessionSecret: secret, simulation: false, maxReservedMicros: 100_000, liveBudget: { scope: 'c15-4f-offline', priorSpentMicros: 0 },
    mediaStore: createPrivateMediaStore({ directory: join(directory, 'media'), sessionSecret: secret }),
    scriptProvider: { reservedMicros: 100, generate: async () => ({ requestId: 'synthetic', script: lessonScript }) },
    audioProvider: { reservedMicros: 100, generate: async line => ({ lineId: line.id, role: line.role, bytes: pcm, sha256: sha(pcm), duration: 15 }) },
    audioEncoder: async input => ({ bytes: aac, sha256: sha(aac), sourceSha256: input.sha256, sourceDuration: 15, duration: 15 + delta, mimeType: 'audio/mp4', decoded: true }),
    encodedVideoProvider: {
      reservedMicros: 1000,
      submit: async input => { seen.submits.push({ reference: input.referenceImage?.sha256, prompt: input.prompt }); return { status: 'pending', jobId: 'job' + ++jobs }; },
      query: async id => ({ jobId: id, status: 'completed', videoUrl: `https://media.example.invalid/${id}.mp4` }),
    },
    videoDownload: async () => { const bytes = Buffer.from(`synthetic segment render ${++renders}`); return { bytes, sha256: sha(bytes) }; },
    videoProbe: async input => ({ sha256: input.sha256, duration: input.expectedDuration + delta, width: 720, height: 1280, fps: 24, videoCodec: 'h264', audioCodec: 'aac' }),
    videoRepair: async input => { const bytes = Buffer.concat([Buffer.from(input.video.bytes), Buffer.from('+full audio')]); return { bytes, sha256: sha(bytes), sourceVideoSha256: input.video.sha256, sourceAudioSha256: input.audio.sha256, decoded: true, duration: 15, width: 720, height: 1280, fps: 24, videoCodec: 'h264', audioCodec: 'aac', targetDuration: 15, padSeconds: 0, padFrames: 0, replaceWithSourceAudio: true }; },
    referenceExtractor: async input => { seen.extracts.push(input.timeSeconds); const bytes = frameAt(input.timeSeconds); return { bytes, sha256: sha(bytes), sourceVideoSha256: input.sha256, timeSeconds: input.timeSeconds, mimeType: 'image/png', width: 720, height: 1280, decoded: true }; },
    videoConcat: async () => ({ bytes: final, sha256: sha(final) }),
    finalVideoVerify: async input => ({ ...validateFinalVideoProbe({ format: { format_name: 'mp4', start_time: 0, duration: 60 }, streams: [{ codec_type: 'video', codec_name: 'h264', width: 720, height: 1280, avg_frame_rate: '24/1', duration: 60, start_time: 0, disposition: { attached_pic: 0 } }, { codec_type: 'audio', codec_name: 'aac', profile: 'LC', sample_rate: 8000, channels: 1, duration: 60, start_time: 0 }] }, input.plan), sha256: sha(final), decoded: true }),
    ...(gate ? { videoQualityGate: async input => { seen.gates.push({ segmentIndex: input.segmentIndex, baseFaceHeight: input.baseFaceHeight }); return gate(input); } } : {}),
    ...(anchorFrameSelect ? { anchorFrameSelect: async input => { seen.selects.push({ sha256: input.video.sha256, learnerWindows: input.learnerWindows }); return anchorFrameSelect(input); } } : {}),
  });
  const cookie = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'c15-4f-owner', email: 'c15-4f@example.invalid' }, secret, now);
  const task = await store.create({ cookie, now, goal: description, revision: 1, requestKey: 'k', requirement });
  const input = { cookie, now: now + 1, id: task.id };
  const { createGenerationRunner } = await import('../../lib/generation-runner.ts');
  const runner = createGenerationRunner({ store, audioReview: async () => true, wait: async () => {}, maxPolls: 3 });
  return { store, seen, input, run: () => runner.advance(input) };
}
const report = checks => async input => ({ sha256: input.video.sha256, mode: 'ffmpeg', checks: structuredClone(checks) });
const selected = { status: 'selected', timeSeconds: 8.5, faceHeight: 0.19, mouthOpen: 0.01, eyeOpen: 0.35, yaw: 0.01, sharpness: 60 };

test('C15-4f store: segment 1 is searched once and its chosen frame is the image of every later segment', async () => {
  const c = await setup({ anchorFrameSelect: async () => structuredClone(selected) });
  expect((await c.run()).stopped).toBe('ready');
  const task = await c.store.get(c.input);
  const seg0 = task.videoAssets.find(asset => asset.segmentIndex === 0);
  // Searched once, on the final bytes of segment 1, with its learner lines (none in this partner-only segment).
  expect(c.seen.selects).toEqual([{ sha256: seg0.sha256, learnerWindows: [] }]);
  // Only the chosen moment is extracted; no last frame is taken from any segment.
  expect(c.seen.extracts).toEqual([8.5]);
  const anchor = sha(frameAt(8.5));
  expect(c.seen.submits.map(item => item.reference)).toEqual([undefined, anchor, anchor, anchor]);
  expect(task.anchorFrame).toMatchObject({ status: 'selected', timeSeconds: 8.5, faceHeight: 0.19, sha256: anchor, sourceVideoSha256: seg0.sha256 });
  expect(task.referenceImage).toMatchObject({ sha256: anchor, origin: 'anchor' });
  expect(c.store.anchorFrameEnabled).toBe(true);
});

test('C15-4f store: the prompts sent carry the no-walk-in opening and the quiet nodding ending', async () => {
  const c = await setup({ anchorFrameSelect: async () => structuredClone(selected) });
  await c.run();
  const prompts = c.seen.submits.map(item => item.prompt);
  expect(prompts).toHaveLength(4);
  expect(prompts[0]).toContain('He is already standing close in front of the camera from the first frame and does not walk in.');
  for (const prompt of prompts.slice(1)) expect(prompt).not.toContain('from the first frame and does not walk in');
  for (const prompt of prompts) expect(prompt).toContain(FRAMING);
  // The lesson ends on a learner line (segment 4): only that prompt asks for the quiet nodding ending.
  expect(prompts[3]).toContain('At the end of the clip he listens silently with his lips closed and nods gently.');
  for (const prompt of prompts.slice(0, 3)) expect(prompt).not.toContain('nods gently');
});

test('C15-4f store: with no qualifying frame the old last-frame chain runs and the task says why', async () => {
  const c = await setup({ anchorFrameSelect: async () => ({ status: 'none', reason: 'no quiet waist-up frame: face too large' }) });
  expect((await c.run()).stopped).toBe('ready');
  const task = await c.store.get(c.input);
  expect(c.seen.selects).toHaveLength(1);
  expect(task.anchorFrame).toMatchObject({ status: 'fallback', reason: 'no quiet waist-up frame: face too large', sourceVideoSha256: task.videoAssets.find(asset => asset.segmentIndex === 0).sha256 });
  // Three last frames, one after each of segments 1-3, as before C15-4f.
  expect(c.seen.extracts).toHaveLength(3);
  expect(c.seen.submits.map(item => item.reference)).toEqual([undefined, ...c.seen.extracts.map(time => sha(frameAt(time)))]);
  expect(task.referenceImage.origin).toBeUndefined();
});

test('C15-4f store: a selector that throws, or picks a time outside the segment, also falls back and is recorded', async () => {
  for (const anchorFrameSelect of [async () => { throw new Error('python missing'); }, async () => ({ ...selected, timeSeconds: 30 }), async () => ({ status: 'selected' })]) {
    const c = await setup({ anchorFrameSelect });
    expect((await c.run()).stopped).toBe('ready');
    const task = await c.store.get(c.input);
    expect(task.anchorFrame.status).toBe('fallback');
    expect(typeof task.anchorFrame.reason).toBe('string');
    expect(task.anchorFrame.reason.length).toBeGreaterThan(0);
    expect(c.seen.submits).toHaveLength(4);
    expect(c.seen.submits.slice(1).every(item => item.reference && item.reference !== sha(frameAt(8.5)))).toBe(true);
  }
});

test('C15-4f store: without a selector the pipeline chains last frames exactly as before and records nothing', async () => {
  const c = await setup();
  expect((await c.run()).stopped).toBe('ready');
  const task = await c.store.get(c.input);
  expect(task.anchorFrame).toBeUndefined();
  expect(c.seen.extracts).toHaveLength(3);
  expect(c.store.anchorFrameEnabled).toBe(false);
});

test('C15-4f store: a redone later segment starts from the same fixed frame', async () => {
  let failedOnce = false;
  const c = await setup({ anchorFrameSelect: async () => structuredClone(selected), gate: async input => {
    if (input.segmentIndex === 2 && !failedOnce) { failedOnce = true; return report(passedChecks.map(check => check.id === 'cuts' ? { id: 'cuts', status: 'failed', value: 1 } : check))(input); }
    return report(passedChecks)(input);
  } });
  expect((await c.run()).stopped).toBe('ready');
  const anchor = sha(frameAt(8.5));
  expect(c.seen.submits.map(item => item.reference)).toEqual([undefined, anchor, anchor, anchor, anchor]);
  expect(c.seen.extracts).toEqual([8.5]);
});

test('C15-4f store: later segments get the first segment face height for the drift check; a failed drift is quality_failed', async () => {
  const withDrift = (segmentIndex, check) => report([...passedChecks, check]);
  const c = await setup({ anchorFrameSelect: async () => structuredClone(selected), gate: async input =>
    input.segmentIndex === 0 ? withDrift(0, { id: 'framing_drift', status: 'passed', value: 0.3, reason: 'first segment sets the reference framing' })(input)
      : input.segmentIndex === 3 ? withDrift(3, { id: 'framing_drift', status: 'failed', value: 0.45, reason: 'framing drift' })(input)
        : withDrift(input.segmentIndex, { id: 'framing_drift', status: 'passed', value: 0.33 })(input) });
  expect((await c.run()).stopped).toBe('quality_failed');
  expect(c.seen.gates[0]).toEqual({ segmentIndex: 0, baseFaceHeight: undefined });
  expect(c.seen.gates.slice(1).every(item => item.baseFaceHeight === 0.3)).toBe(true);
  const task = await c.store.get(c.input);
  expect(task.videoQuality.filter(record => record.segmentIndex === 3).map(record => record.verdict)).toEqual(['quality_failed', 'quality_failed']);
});

test('C15-4f store: without a passed first-segment drift value no reference height is passed on', async () => {
  const c = await setup({ gate: report(passedChecks) });
  await c.run();
  expect(c.seen.gates.every(item => item.baseFaceHeight === undefined)).toBe(true);
});

test('C15-4f runtime: the live provider runtime selects the fixed frame; the preview runtime does not', async () => {
  const { createLiveGenerationRuntime } = await import('../../lib/live-generation-runtime.ts');
  const options = dir => ({ enabled: true, directory: dir, sessionSecret: 'offline-c15-4f-session-secret-at-least-32-chars', openaiKey: 'sk-synthetic', ltxKey: 'ltx-synthetic',
    budget: { scope: 'c15-4f', priorSpentMicros: 0, maxReservedMicros: 1_000_000, scriptMicros: 1, audioMicros: 1, videoMicros: 1 },
    media: { ffmpeg, ffprobe, python, allowedHosts: ['storage.googleapis.com'], maxBytes: 1_000_000 } });
  expect(createLiveGenerationRuntime(options(mkdtempSync(join(tmpdir(), 'les-c15-4f-live-')))).anchorFrameEnabled).toBe(true);
  expect(createLiveGenerationRuntime({ ...options(mkdtempSync(join(tmpdir(), 'les-c15-4f-preview-'))), previewVideo: true }).anchorFrameEnabled).toBe(false);
});

// ---- real measurements on this machine (skipped, with a log line, when the detector or the samples are missing) ----

const runScript = args => JSON.parse(execFileSync(python, ['-I', script, ...args], { encoding: 'utf8', timeout: 240_000, cwd: tmpdir() }).trim().split('\n').pop());
function probe() {
  try {
    const out = JSON.parse(execFileSync(python, ['-I', script, '--probe'], { encoding: 'utf8', timeout: 60_000, cwd: tmpdir() }).trim().split('\n').pop());
    return out.status === 'ready' ? { ready: true } : { ready: false, reason: out.reason ?? 'not ready' };
  } catch (error) { return { ready: false, reason: `probe failed: ${error.message.slice(0, 200)}` }; }
}
const detector = probe();
function needDetector(files = []) {
  if (!detector.ready) console.log(`[C15-4f] face detector unavailable: ${detector.reason}`);
  test.skip(!detector.ready, `face detector unavailable: ${detector.reason}`);
  const missing = files.filter(file => !existsSync(file));
  if (missing.length) console.log(`[C15-4f] samples missing on this machine: ${missing.join(', ')}`);
  test.skip(missing.length > 0, 'C15-4 samples not on this machine');
}
const media = file => { const bytes = readFileSync(file); return { bytes, sha256: sha(bytes) }; };

test.describe('C15-4f detection', () => {
  test.describe.configure({ timeout: 300_000 });

  test('the script reports each segment median face height and, with --anchor, per-frame anchor measurements', async () => {
    needDetector();
    const plain = runScript(['--video', hotel]);
    expect(plain.single_face.face_height).toBeGreaterThan(0.06);
    expect(plain.single_face.face_height).toBeLessThan(1);
    expect(plain.anchor).toBeUndefined();
    const out = runScript(['--video', hotel, '--anchor']);
    expect(out.anchor.candidates.length).toBeGreaterThan(10);
    for (const item of out.anchor.candidates) for (const key of ['t', 'face_height', 'mouth_open', 'eye_open', 'yaw', 'sharpness']) expect(Number.isFinite(item[key])).toBe(true);
  });

  test('attempt 6: the drift check passes segments 2 and 3 and stops segment 4 (pushed in to a close-up)', async () => {
    needDetector(a6);
    const { createFaceChecks } = await gateModule();
    const faces = createFaceChecks({ python, script, timeoutMs: 240_000 });
    const first = drift(await faces({ file: a6[0], duration: 11.9, learnerWindows: [{ start: 6.85, end: 11.9 }], segmentIndex: 0 }));
    console.log(`[C15-4f] attempt 6 segment 1: ${JSON.stringify(first)}`);
    expect(first.status).toBe('passed');
    expect(first.value).toBeGreaterThan(0.3);
    expect(first.value).toBeLessThan(0.36);
    const results = [];
    for (const [index, duration, windows] of [[1, 10.25, [{ start: 6.3, end: 10.25 }]], [2, 19.85, [{ start: 7.75, end: 11.8 }, { start: 16.2, end: 19.85 }]], [3, 9.05, [{ start: 4.5, end: 9.05 }]]]) {
      results.push(drift(await faces({ file: a6[index], duration, learnerWindows: windows, segmentIndex: index, baseFaceHeight: first.value })));
    }
    console.log(`[C15-4f] attempt 6 segments 2-4: ${JSON.stringify(results)}`);
    expect(results.map(item => item.status)).toEqual(['passed', 'passed', 'failed']);
  });

  test('attempt 6 segment 1 has no qualifying quiet frame (already a close-up); attempt 4 segment 1 has one', async () => {
    needDetector([a6[0], a4seg0]);
    const { createAnchorFrameSelect } = await gateModule();
    const select = createAnchorFrameSelect({ python, script, timeoutMs: 240_000 });
    const six = await select({ video: media(a6[0]), learnerWindows: [{ start: 6.85, end: 11.9 }] });
    console.log(`[C15-4f] attempt 6 segment 1 anchor: ${JSON.stringify(six)}`);
    expect(six.status).toBe('none');
    const four = await select({ video: media(a4seg0), learnerWindows: [{ start: 6.65, end: 11.35 }] });
    console.log(`[C15-4f] attempt 4 segment 1 anchor: ${JSON.stringify(four)}`);
    expect(four.status).toBe('selected');
    // Inside the learner line, mouth closed. (Measured: closed-mouth, open-eye frames at 8.4-9.2 s and 10.2-11.2 s.)
    expect(four.timeSeconds).toBeGreaterThanOrEqual(6.65);
    expect(four.timeSeconds).toBeLessThanOrEqual(11.35);
    expect(four.mouthOpen).toBeLessThanOrEqual(0.05);
    expect(four.faceHeight).toBeGreaterThanOrEqual(0.1);
    expect(four.faceHeight).toBeLessThanOrEqual(0.28);
  });
});

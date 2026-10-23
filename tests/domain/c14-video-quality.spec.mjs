import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// C14 (2026-10-18, zero cost): video quality gate before learners see a course, the partner keyframe as the
// first segment's first frame, and the LTX request parameters with a model whitelist. Every video here is a
// synthetic ffmpeg lavfi clip or a stand-in provider; nothing calls OpenAI, LTX or an image model. A gate built
// without the C14-4 face script (tests/domain/c14-4-face-checks.spec.mjs) keeps the two face checks "not_checked".
const ffmpeg = '/usr/bin/ffmpeg', ffprobe = '/usr/bin/ffprobe';
const secret = 'offline-c14-session-secret-at-least-32-characters';
const now = Date.UTC(2026, 9, 18);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const scratch = mkdtempSync(join(tmpdir(), 'les-c14-samples-'));

// ---- synthetic samples (ffmpeg lavfi only) ----
const encode = ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '24'];
function sample(name, args) {
  const file = join(scratch, `${name}.mp4`);
  execFileSync(ffmpeg, ['-v', 'error', '-y', ...args, ...encode, file]);
  const bytes = readFileSync(file);
  return { bytes, sha256: sha(bytes) };
}
const samples = {
  // One continuous moving shot: no cut, no black, no freeze.
  normal: () => sample('normal', ['-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=24:d=4']),
  // A hard cut to an unrelated shot at 2 s.
  cut: () => sample('cut', ['-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=24:d=2', '-f', 'lavfi', '-i', 'mandelbrot=s=360x640:r=24',
    '-filter_complex', '[1]trim=duration=2,setpts=PTS-STARTPTS,format=yuv420p[b];[0]format=yuv420p[a];[a][b]concat=n=2:v=1']),
  // 1.5 s of black in the middle.
  black: () => sample('black', ['-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=24:d=1', '-f', 'lavfi', '-i', 'color=black:s=360x640:r=24:d=1.5',
    '-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=24:d=1.5', '-filter_complex', '[0][1][2]concat=n=3:v=1']),
  // The picture stops moving for 1.5 s (the same frame repeated).
  freeze: () => sample('freeze', ['-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=24:d=3', '-vf', 'loop=loop=36:size=1:start=24,setpts=N/24/TB']),
  // Seam samples: "previous" ends at 2 s of a moving shot; the good next segment carries on from there, the bad one is a different picture.
  previous: () => sample('previous', ['-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=24:d=2']),
  nextGood: () => sample('next-good', ['-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=24:d=4', '-vf', 'trim=start=2,setpts=PTS-STARTPTS']),
  // C15-4b: random noise instead of mandelbrot (its flat black areas score 0.52 against testsrc2, above the new 0.3).
  nextBad: () => sample('next-bad-noise', ['-f', 'lavfi', '-i', "nullsrc=s=360x640:r=24,geq=lum='random(1)*255':cb=128:cr=128", '-t', '2']),
};
const load = () => import('../../lib/video-quality-gate.ts');
const byId = (report, id) => report.checks.find(check => check.id === id);

test('C14-1 gate: a continuous synthetic shot passes every ffmpeg check, but the face checks stay not_checked so it is only needs_review', async () => {
  const { createVideoQualityGate, qualityVerdict, FACE_CHECK_PENDING } = await load();
  const gate = createVideoQualityGate({ ffmpeg, ffprobe });
  const report = await gate({ segmentIndex: 0, video: samples.normal(), learnerWindows: [] });
  expect(report.mode).toBe('ffmpeg');
  expect(report.checks.map(check => check.id).sort()).toEqual(['black_freeze', 'cuts', 'learner_mouth', 'seam_ssim', 'single_face']);
  for (const id of ['cuts', 'black_freeze', 'seam_ssim']) expect(byId(report, id).status).toBe('passed');
  expect(byId(report, 'cuts').value).toBe(0);
  for (const id of ['single_face', 'learner_mouth']) expect(byId(report, id)).toMatchObject({ status: 'not_checked', reason: FACE_CHECK_PENDING });
  expect(FACE_CHECK_PENDING).toBe('没有接人脸检测');
  expect(qualityVerdict(report)).toBe('needs_review');
});

test('C14-1 gate: a cut inside a segment is caught with its time as the key frame', async () => {
  const { createVideoQualityGate, qualityVerdict } = await load();
  const report = await createVideoQualityGate({ ffmpeg, ffprobe })({ segmentIndex: 0, video: samples.cut(), learnerWindows: [] });
  const cuts = byId(report, 'cuts');
  expect(cuts.status).toBe('failed');
  expect(cuts.value).toBeGreaterThanOrEqual(1);
  expect(cuts.keyframes.some(time => Math.abs(time - 2) < 0.1)).toBe(true);
  expect(typeof cuts.reason).toBe('string');
  expect(qualityVerdict(report)).toBe('quality_failed');
});

test('C14-1 gate: more than one second of black or of a frozen picture is caught', async () => {
  const { createVideoQualityGate, qualityVerdict, QUALITY_THRESHOLDS } = await load();
  expect(QUALITY_THRESHOLDS.maxBlackSeconds).toBe(1); expect(QUALITY_THRESHOLDS.maxFreezeSeconds).toBe(1);
  const gate = createVideoQualityGate({ ffmpeg, ffprobe });
  const black = await gate({ segmentIndex: 0, video: samples.black(), learnerWindows: [] });
  expect(byId(black, 'black_freeze').status).toBe('failed');
  expect(byId(black, 'black_freeze').keyframes.some(time => Math.abs(time - 1) < 0.1)).toBe(true);
  expect(qualityVerdict(black)).toBe('quality_failed');
  const frozen = await gate({ segmentIndex: 0, video: samples.freeze(), learnerWindows: [] });
  expect(byId(frozen, 'black_freeze').status).toBe('failed');
  expect(byId(frozen, 'black_freeze').value).toBeGreaterThan(1);
  expect(qualityVerdict(frozen)).toBe('quality_failed');
});

test('C14-1 gate: the seam SSIM compares the previous last frame with this first frame (threshold 0.3 since C15-4b, was 0.6)', async () => {
  const { createVideoQualityGate, qualityVerdict, QUALITY_THRESHOLDS } = await load();
  expect(QUALITY_THRESHOLDS.minSeamSsim).toBe(0.3);
  const gate = createVideoQualityGate({ ffmpeg, ffprobe });
  const previous = samples.previous();
  const good = await gate({ segmentIndex: 1, previous, video: samples.nextGood(), learnerWindows: [] });
  expect(byId(good, 'seam_ssim').status).toBe('passed');
  expect(byId(good, 'seam_ssim').value).toBeGreaterThanOrEqual(0.3);
  const bad = await gate({ segmentIndex: 1, previous, video: samples.nextBad(), learnerWindows: [] });
  expect(byId(bad, 'seam_ssim').status).toBe('failed');
  expect(byId(bad, 'seam_ssim').value).toBeLessThan(0.3);
  expect(qualityVerdict(bad)).toBe('quality_failed');
});

test('C14-1 gate: face checks are pluggable; a stand-in that sees two faces blocks the segment', async () => {
  const { createVideoQualityGate, qualityVerdict } = await load();
  const seen = [];
  const faces = async input => { seen.push(input.learnerWindows); return [
    { id: 'single_face', status: 'failed', value: 0.4, reason: 'two faces', keyframes: [1] },
    { id: 'learner_mouth', status: 'passed', value: 0.1 },
  ]; };
  const report = await createVideoQualityGate({ ffmpeg, ffprobe, faces })({ segmentIndex: 0, video: samples.normal(), learnerWindows: [{ start: 0.5, end: 2 }] });
  expect(seen).toEqual([[{ start: 0.5, end: 2 }]]);
  expect(byId(report, 'single_face').status).toBe('failed');
  expect(qualityVerdict(report)).toBe('quality_failed');
});

test('C14-1 three states: any failure is quality_failed, any not_checked caps the result at needs_review, a missing check is never passed', async () => {
  const { combineQualityChecks, qualityVerdict } = await load();
  const all = status => ['cuts', 'single_face', 'learner_mouth', 'seam_ssim', 'black_freeze'].map(id => ({ id, status }));
  expect(combineQualityChecks(all('passed'))).toBe('passed');
  const oneOpen = all('passed'); oneOpen[1] = { id: 'single_face', status: 'not_checked', reason: 'x' };
  expect(combineQualityChecks(oneOpen)).toBe('needs_review');
  const failedAndOpen = [...oneOpen]; failedAndOpen[0] = { id: 'cuts', status: 'failed', value: 1 };
  expect(combineQualityChecks(failedAndOpen)).toBe('quality_failed');
  expect(combineQualityChecks(all('passed').slice(0, 4))).toBe('needs_review');
  expect(combineQualityChecks([])).toBe('needs_review');
  expect(combineQualityChecks(all('not_checked'))).toBe('needs_review');
  expect(combineQualityChecks([...all('passed'), { id: 'cuts', status: 'bogus' }])).toBe('needs_review');
  expect(qualityVerdict({ mode: 'ffmpeg', checks: [] })).toBe('needs_review');
});

test('C14-1 preview: a local preview card passes the preview gate without running the real video checks', async () => {
  const { createPreviewQualityGate, qualityVerdict } = await load();
  const { createPreviewVideoProvider } = await import('../../lib/preview-video-provider.ts');
  const dir = mkdtempSync(join(tmpdir(), 'les-c14-preview-')), audio = join(dir, 'a.m4a');
  execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', 'aac', audio]);
  const provider = createPreviewVideoProvider({ ffmpeg });
  const { jobId } = await provider.submit({ audio: { bytes: readFileSync(audio), duration: 2 }, prompt: 'Vertical first-person view.' });
  const card = provider.download((await provider.query(jobId)).videoUrl);
  const report = await createPreviewQualityGate()({ segmentIndex: 0, video: card, learnerWindows: [] });
  expect(report).toEqual({ sha256: card.sha256, mode: 'preview', checks: [] });
  expect(qualityVerdict(report)).toBe('passed');
});

// ---- store and runner: quality_failed never reaches learners; one redo at most, through the budget guard ----

const translations = Object.fromEntries(['zh-Hans', 'id', 'ja', 'ko', 'hi'].map(k => [k, 'synthetic']));
const lines = Array.from({ length: 4 }, (_, i) => ({ id: 'line' + i, role: i % 2 ? 'learner' : 'partner', text: i % 2 ? 'Hi ' + 'okay '.repeat(15).trim() : 'Hello ' + 'friend '.repeat(46).trim(), translations }));
const scene = { setting: 'A busy hawker centre chicken rice stall at lunchtime.', partnerGender: 'male', partnerLook: 'in his fifties, white apron' };
const script = { scene, lines, phrases: [{ id: 'phrase', text: 'Hello', lineId: 'line0', translations }], turns: [{ partnerLineId: 'line0', learnerLineId: 'line1' }, { partnerLineId: 'line2', learnerLineId: 'line3' }] };
const pcm = Buffer.alloc(240044);
pcm.write('RIFF'); pcm.writeUInt32LE(240036, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(8000, 24); pcm.writeUInt32LE(16000, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(240000, 40);
for (let i = 44; i < pcm.length; i += 2) pcm.writeInt16LE(Math.round(8000 * Math.sin(i / 20)), i);
const delta = 0.04, aac = Buffer.from('synthetic AAC'), final = Buffer.from('synthetic final video');
const lastFrame = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from('synthetic last frame')]);
const description = '在小贩中心点鸡饭';
const requirement = { revision: 1, content: { description, language: 'zh-Hans', keywords: { location: '', learnerRole: '', partnerRole: '', topic: '', goal: '', special: '' } } };
const passedChecks = ['cuts', 'single_face', 'learner_mouth', 'seam_ssim', 'black_freeze'].map(id => ({ id, status: 'passed' }));
const failedChecks = passedChecks.map(check => check.id === 'cuts' ? { id: 'cuts', status: 'failed', value: 1, reason: 'cut inside segment', keyframes: [2] } : check);
const openChecks = passedChecks.map(check => ['single_face', 'learner_mouth'].includes(check.id) ? { id: check.id, status: 'not_checked', reason: '需要人脸检测库，待用户批准' } : check);

async function setup({ gate, maxReservedMicros = 100_000, keyframeProvider, referenceFrameCheck } = {}) {
  const { createGenerationTaskStore } = await import('../../lib/generation-tasks.ts');
  const { createPrivateMediaStore } = await import('../../lib/private-media-store.ts');
  const { sealGoogleSession } = await import('../../lib/google-auth.ts');
  const { validateFinalVideoProbe } = await import('../../lib/final-video-probe.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-c14-store-'));
  const seen = { submits: [], gates: [], frames: [] };
  let jobs = 0, renders = 0;
  const store = createGenerationTaskStore({
    directory, sessionSecret: secret, simulation: false, maxReservedMicros, liveBudget: { scope: 'c14-offline', priorSpentMicros: 0 },
    mediaStore: createPrivateMediaStore({ directory: join(directory, 'media'), sessionSecret: secret }),
    scriptProvider: { reservedMicros: 100, generate: async () => ({ requestId: 'synthetic', script }) },
    audioProvider: { reservedMicros: 100, generate: async line => ({ lineId: line.id, role: line.role, bytes: pcm, sha256: sha(pcm), duration: 15 }) },
    audioEncoder: async input => ({ bytes: aac, sha256: sha(aac), sourceSha256: input.sha256, sourceDuration: 15, duration: 15 + delta, mimeType: 'audio/mp4', decoded: true }),
    encodedVideoProvider: {
      reservedMicros: 1000,
      submit: async input => { seen.submits.push({ reference: input.referenceImage?.sha256 }); return { status: 'pending', jobId: 'job' + ++jobs }; },
      query: async id => ({ jobId: id, status: 'completed', videoUrl: `https://media.example.invalid/${id}.mp4` }),
    },
    // Every render is a different byte string, so a redone segment has a new hash.
    videoDownload: async () => { const bytes = Buffer.from(`synthetic segment render ${++renders}`); return { bytes, sha256: sha(bytes) }; },
    videoProbe: async input => ({ sha256: input.sha256, duration: input.expectedDuration + delta, width: 720, height: 1280, fps: 24, videoCodec: 'h264', audioCodec: 'aac' }),
    videoRepair: async input => { const bytes = Buffer.concat([Buffer.from(input.video.bytes), Buffer.from('+full audio')]); return { bytes, sha256: sha(bytes), sourceVideoSha256: input.video.sha256, sourceAudioSha256: input.audio.sha256, decoded: true, duration: 15, width: 720, height: 1280, fps: 24, videoCodec: 'h264', audioCodec: 'aac', targetDuration: 15, padSeconds: 0, padFrames: 0, replaceWithSourceAudio: true }; },
    referenceExtractor: async input => ({ bytes: lastFrame, sha256: sha(lastFrame), sourceVideoSha256: input.sha256, timeSeconds: input.timeSeconds, mimeType: 'image/png', width: 720, height: 1280, decoded: true }),
    videoConcat: async () => ({ bytes: final, sha256: sha(final) }),
    finalVideoVerify: async input => ({ ...validateFinalVideoProbe({ format: { format_name: 'mp4', start_time: 0, duration: 60 }, streams: [{ codec_type: 'video', codec_name: 'h264', width: 720, height: 1280, avg_frame_rate: '24/1', duration: 60, start_time: 0, disposition: { attached_pic: 0 } }, { codec_type: 'audio', codec_name: 'aac', profile: 'LC', sample_rate: 8000, channels: 1, duration: 60, start_time: 0 }] }, input.plan), sha256: sha(final), decoded: true }),
    ...(gate ? { videoQualityGate: async input => { seen.gates.push({ segmentIndex: input.segmentIndex, previous: !!input.previous, learnerWindows: input.learnerWindows }); return gate(input); } } : {}),
    ...(keyframeProvider ? { keyframeProvider } : {}),
    ...(referenceFrameCheck ? { referenceFrameCheck: async input => { seen.frames.push(input.bytes); return referenceFrameCheck(input); } } : {}),
  });
  const cookie = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'c14-owner', email: 'c14@example.invalid' }, secret, now);
  const task = await store.create({ cookie, now, goal: description, revision: 1, requestKey: 'k', requirement });
  const input = { cookie, now: now + 1, id: task.id };
  const { createGenerationRunner } = await import('../../lib/generation-runner.ts');
  const runner = createGenerationRunner({ store, audioReview: async () => true, wait: async () => {}, maxPolls: 3 });
  const { createSceneGenerationService } = await import('../../lib/scene-generation.ts');
  const service = createSceneGenerationService({ requirements: { get: async () => structuredClone(requirement) }, tasks: store });
  const { createLearningLibrary } = await import('../../lib/learning-library.ts');
  const library = createLearningLibrary({ courseStore: { list: store.list, getCourse: store.getCourse }, progressStore: { latest: async () => null, get: async () => null, save: async () => null } });
  return { store, seen, input, cookie, run: () => runner.advance(input), view: () => service.get({ cookie, now: now + 1, requirementRevision: 1 }), library: () => library.list({ cookie, now: now + 1 }) };
}
const report = checks => async input => ({ sha256: input.video.sha256, mode: 'ffmpeg', checks: structuredClone(checks) });

test('C14-1 store: a segment that fails twice is redone once only, the run stops quality_failed and learners never see it', async () => {
  const c = await setup({ gate: async input => input.segmentIndex === 0 ? report(failedChecks)(input) : report(passedChecks)(input) });
  expect((await c.run()).stopped).toBe('quality_failed');
  // Segment 0 was submitted twice (original and one redo); nothing after it was submitted.
  expect(c.seen.submits).toHaveLength(2);
  const task = await c.store.get(c.input);
  expect(task.status).not.toBe('video_assembled');
  expect(task.finalVideo).toBeUndefined();
  expect(task.videoRedos).toHaveLength(1);
  expect(task.videoRedos[0]).toMatchObject({ segmentIndex: 0 });
  const records = task.videoQuality.filter(item => item.segmentIndex === 0);
  expect(records).toHaveLength(2);
  for (const record of records) {
    expect(record.verdict).toBe('quality_failed');
    expect(record.checks.find(check => check.id === 'cuts')).toMatchObject({ status: 'failed', reason: 'cut inside segment', keyframes: [2] });
  }
  const view = await c.view();
  expect(view.phase).toBe('quality_failed');
  expect(view.course).toBeNull();
  expect((await c.library()).scenes).toEqual([]);
  // Running again never redoes it a second time.
  expect((await c.run()).stopped).toBe('quality_failed');
  expect(c.seen.submits).toHaveLength(2);
  await expect(c.store.redoVideoSegment(c.input)).rejects.toThrow();
});

test('C14-1 store: a segment that fails once and then passes is redone once and the course is published', async () => {
  let first = true;
  const c = await setup({ gate: async input => {
    if (input.segmentIndex === 0 && first) { first = false; return report(failedChecks)(input); }
    return report(passedChecks)(input);
  } });
  expect((await c.run()).stopped).toBe('ready');
  expect(c.seen.submits).toHaveLength(5);
  const task = await c.store.get(c.input);
  expect(task.status).toBe('video_assembled');
  expect(task.videoRedos).toHaveLength(1);
  // The redo reserved one more segment through the same ledger: script 100 + 4 voices 400 + 5 segments 5000.
  expect(task.reservedMicros).toBe(5500);
  expect(task.providerCalls).toBe(10);
  const view = await c.view();
  expect(view.phase).toBe('ready');
  expect(view.quality).toBe('passed');
  expect((await c.library()).scenes).toHaveLength(1);
});

test('C14-1 store: the redo goes through the budget guard and is refused when no reservation is left', async () => {
  // Script 100 + four voices 400 + the first segment 1000: nothing left for a redo.
  const c = await setup({ maxReservedMicros: 1500, gate: report(failedChecks) });
  expect((await c.run()).stopped).toBe('budget');
  expect(c.seen.submits).toHaveLength(1);
  const task = await c.store.get(c.input);
  expect(task.reservedMicros).toBe(1500);
  expect(task.providerCalls).toBe(6);
  expect(task.videoRedos ?? []).toEqual([]);
  expect(task.finalVideo).toBeUndefined();
  expect((await c.library()).scenes).toEqual([]);
});

test('C14-1 store: not_checked face checks never count as passed; the course is needs_review and says so', async () => {
  const c = await setup({ gate: report(openChecks) });
  expect((await c.run()).stopped).toBe('ready');
  expect(c.seen.submits).toHaveLength(4);
  const task = await c.store.get(c.input);
  expect(task.videoQuality.map(item => item.verdict)).toEqual(['needs_review', 'needs_review', 'needs_review', 'needs_review']);
  expect(task.videoRedos ?? []).toEqual([]);
  const view = await c.view();
  expect(view.phase).toBe('ready');
  expect(view.quality).toBe('needs_review');
});

test('C14-1 store: the gate gets the previous segment for the seam and the learner line windows of each segment', async () => {
  const c = await setup({ gate: report(passedChecks) });
  await c.run();
  expect(c.seen.gates.map(item => [item.segmentIndex, item.previous])).toEqual([[0, false], [1, true], [2, true], [3, true]]);
  // Segments 1 and 3 hold one 15-second learner line each; 0 and 2 are partner lines.
  expect(c.seen.gates[0].learnerWindows).toEqual([]);
  expect(c.seen.gates[1].learnerWindows).toEqual([{ start: 0, end: 15 }]);
});

test('C14-1 store: without a configured gate the pipeline behaves as before and adds no quality field', async () => {
  const c = await setup();
  expect((await c.run()).stopped).toBe('ready');
  expect(c.seen.submits).toHaveLength(4);
  const task = await c.store.get(c.input);
  expect(task.videoQuality).toBeUndefined();
  const view = await c.view();
  expect(view.phase).toBe('ready');
  expect(view.quality).toBeUndefined();
});

// ---- C14-2: partner keyframe as the first frame, fallback when a last frame is unusable ----

test('C14-2 keyframe: the local placeholder is a decodable 720x1280 PNG made without any network call', async () => {
  const { createPlaceholderKeyframeProvider, keyframePrompt } = await import('../../lib/generated-keyframe.ts');
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('no network in C14'); };
  try {
    const provider = createPlaceholderKeyframeProvider({ ffmpeg, ffprobe });
    expect(provider.source).toBe('placeholder');
    const image = await provider.generate(scene);
    expect(image).toMatchObject({ mimeType: 'image/png', width: 720, height: 1280, decoded: true, source: 'placeholder' });
    expect(Buffer.from(image.bytes).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(image.sha256).toBe(sha(image.bytes));
    const prompt = keyframePrompt(scene);
    expect(prompt).toContain('in his fifties, white apron');
    expect(prompt).toContain('hawker centre');
    expect(prompt).toContain('man');
  } finally { globalThis.fetch = original; }
  expect(calls).toBe(0);
});

test('C14-2 keyframe: the first segment starts from the keyframe, later ones from the last frame, and an unusable last frame falls back to the keyframe', async () => {
  const { createPlaceholderKeyframeProvider } = await import('../../lib/generated-keyframe.ts');
  let checks = 0;
  const c = await setup({ gate: report(openChecks), keyframeProvider: createPlaceholderKeyframeProvider({ ffmpeg, ffprobe }),
    // The second extracted last frame (after segment 1) is judged blurred.
    referenceFrameCheck: async () => (++checks === 2 ? { usable: false, checks: [{ id: 'sharp', status: 'failed', value: 60 }] } : { usable: true, checks: [{ id: 'sharp', status: 'passed', value: 4 }] }) });
  expect((await c.run()).stopped).toBe('ready');
  const task = await c.store.get(c.input);
  expect(task.keyframe).toMatchObject({ source: 'placeholder', mimeType: 'image/png', width: 720, height: 1280 });
  const keyframe = task.keyframe.sha256;
  expect(c.seen.submits.map(item => item.reference)).toEqual([keyframe, sha(lastFrame), keyframe, sha(lastFrame)]);
  expect(c.seen.frames).toHaveLength(3);
  const view = await c.view();
  expect(view.keyframe).toBe(true);
  const image = await c.store.getKeyframe({ cookie: c.cookie, now: now + 1, id: c.input.id, revision: 1 });
  expect(sha(image.bytes)).toBe(keyframe);
  expect(image.mimeType).toBe('image/png');
});

test('C14-2 keyframe: another account cannot read the keyframe', async () => {
  const { createPlaceholderKeyframeProvider } = await import('../../lib/generated-keyframe.ts');
  const { sealGoogleSession } = await import('../../lib/google-auth.ts');
  const c = await setup({ gate: report(openChecks), keyframeProvider: createPlaceholderKeyframeProvider({ ffmpeg, ffprobe }) });
  await c.run();
  const other = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'c14-other', email: 'o@example.invalid' }, secret, now);
  await expect(c.store.getKeyframe({ cookie: other, now: now + 1, id: c.input.id, revision: 1 })).rejects.toThrow();
});

test('C14-2 keyframe: without a keyframe provider the first segment has no first frame, as before', async () => {
  const c = await setup({ gate: report(openChecks) });
  await c.run();
  expect(c.seen.submits[0].reference).toBeUndefined();
  const view = await c.view();
  expect(view.keyframe).toBeUndefined();
});

test('C14-2 frame check: a sharp frame is usable, a black or blurred one is not; the face part stays not_checked', async () => {
  const { createReferenceFrameCheck } = await import('../../lib/generated-keyframe.ts');
  const frame = (name, filter) => {
    const file = join(scratch, `${name}.png`);
    execFileSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=720x1280', ...(filter ? ['-vf', filter] : []), '-frames:v', '1', file]);
    return readFileSync(file);
  };
  const check = createReferenceFrameCheck({ ffmpeg });
  const sharp = await check({ bytes: frame('sharp') });
  expect(sharp.usable).toBe(true);
  expect(sharp.checks.find(item => item.id === 'face')).toMatchObject({ status: 'not_checked', reason: '没有接人脸检测' });
  expect((await check({ bytes: frame('blurred', 'gblur=sigma=25') })).usable).toBe(false);
  expect((await check({ bytes: frame('black', 'lutyuv=y=16:u=128:v=128') })).usable).toBe(false);
});

// ---- C14-3: request parameters and the model whitelist ----

const audio = Buffer.from('synthetic verified AAC bytes');
const encodedInput = () => ({ audio: { bytes: audio, sha256: sha(audio), sourceSha256: 'b'.repeat(64), sourceDuration: 12, duration: 12, mimeType: 'audio/mp4', decoded: true }, prompt: 'A fictional adult greets the viewer.' });

test('C14-3 request: the body asks for a static camera and the default model when none is configured', async () => {
  const { submitEncodedVideoSegment } = await import('../../lib/generated-video.ts');
  const bodies = [];
  const fetch = async (_, options) => { bodies.push(JSON.parse(options.body)); return Response.json({ id: 'job' }, { status: 202 }); };
  await submitEncodedVideoSegment(encodedInput(), { enabled: true, apiKey: 'synthetic', reviewedSha256: sha(audio), fetch });
  await submitEncodedVideoSegment(encodedInput(), { enabled: true, apiKey: 'synthetic', reviewedSha256: sha(audio), fetch, model: 'ltx-2-3-pro' });
  expect(bodies.map(body => [body.camera_motion, body.model, body.resolution, body.fps])).toEqual([['static', 'ltx-2-5-fast', '720x1280', 24], ['static', 'ltx-2-3-pro', '720x1280', 24]]);
  let calls = 0;
  await expect(submitEncodedVideoSegment(encodedInput(), { enabled: true, apiKey: 'synthetic', reviewedSha256: sha(audio), model: 'ltx-9-ultra', fetch: async () => { calls++; return Response.json({ id: 'x' }, { status: 202 }); } })).rejects.toThrow();
  expect(calls).toBe(0);
});

test('C14-3 prompt: steady eye-level single shot, never handheld or multi-shot', async () => {
  const { sceneVideoPrompt } = await import('../../lib/scene-video-prompt.ts');
  const prompt = sceneVideoPrompt('goal', script);
  expect(prompt).toContain('steady eye-level shot, single shot');
  expect(prompt).not.toContain('handheld');
  expect(prompt).toContain('no cuts');
  expect(prompt).toContain('first-person');
  expect(prompt.length).toBeLessThanOrEqual(5000);
});

test('C14-3 whitelist: LES_LTX_MODEL accepts only ltx-2-5-fast and ltx-2-3-pro and the reservation follows the model', async () => {
  const { LTX_MODELS, resolveLtxModel } = await import('../../lib/generated-video.ts');
  const { LIVE_RESERVATIONS, liveVideoSettings } = await import('../../lib/live-scene-runner.ts');
  expect(Object.keys(LTX_MODELS).sort()).toEqual(['ltx-2-3-pro', 'ltx-2-5-fast']);
  expect(resolveLtxModel(undefined)).toBe('ltx-2-5-fast');
  expect(resolveLtxModel('ltx-2-3-pro')).toBe('ltx-2-3-pro');
  for (const bad of ['ltx-2', 'LTX-2-3-PRO', ' ltx-2-3-pro', 'ltx-2-5-pro']) expect(() => resolveLtxModel(bad)).toThrow();
  // Unconfigured keeps today's model and reservation; 2.3-pro reserves USD1.20 per 20-second segment.
  expect(LIVE_RESERVATIONS.videoMicros).toBe(1_900_000);
  expect(liveVideoSettings({})).toEqual({ model: 'ltx-2-5-fast', videoMicros: 1_900_000 });
  expect(liveVideoSettings({ LES_LTX_MODEL: 'ltx-2-5-fast' })).toEqual({ model: 'ltx-2-5-fast', videoMicros: 1_900_000 });
  expect(liveVideoSettings({ LES_LTX_MODEL: 'ltx-2-3-pro' })).toEqual({ model: 'ltx-2-3-pro', videoMicros: 1_200_000 });
  expect(() => liveVideoSettings({ LES_LTX_MODEL: 'ltx-9' })).toThrow();
});

test('C14-3 startup: a model outside the whitelist is refused before any runner exists', async () => {
  const { createLiveSceneRunner } = await import('../../lib/live-scene-runner.ts');
  const { createLiveGenerationRuntime } = await import('../../lib/live-generation-runtime.ts');
  const dir = mkdtempSync(join(tmpdir(), 'les-c14-runner-'));
  const env = { LES_LIVE_GENERATION: '1', OPENAI_API_KEY: 'sk-synthetic', LTX_API_KEY: 'ltx-synthetic', AUTH_SESSION_SECRET: secret, LES_LIVE_BUDGET_SCOPE: 'c14', LES_LIVE_MAX_MICROS: '1000000', LES_MEDIA_HOSTS: 'storage.googleapis.com', LES_FFMPEG: ffmpeg, LES_FFPROBE: ffprobe };
  expect(createLiveSceneRunner(env, dir)).not.toBeNull();
  expect(createLiveSceneRunner({ ...env, LES_LTX_MODEL: 'ltx-2-3-pro' }, dir)).not.toBeNull();
  expect(createLiveSceneRunner({ ...env, LES_LTX_MODEL: 'ltx-9' }, dir)).toBeNull();
  const options = { enabled: true, directory: dir, sessionSecret: secret, openaiKey: 'sk-synthetic', ltxKey: 'ltx-synthetic',
    budget: { scope: 'c14', priorSpentMicros: 0, maxReservedMicros: 1_000_000, scriptMicros: 1, audioMicros: 1, videoMicros: 1 },
    media: { ffmpeg, ffprobe, allowedHosts: ['storage.googleapis.com'], maxBytes: 1_000_000 } };
  expect(() => createLiveGenerationRuntime({ ...options, videoModel: 'ltx-9' })).toThrow('Live runtime video model not allowed');
  expect(() => createLiveGenerationRuntime({ ...options, videoModel: 'ltx-2-3-pro' })).not.toThrow();
  expect(() => createLiveGenerationRuntime(options)).not.toThrow();
});

test('C14-3 runbook: the paid-run runbook names the model switch and the quality gate', async () => {
  const runbook = await readFile(new URL('../../docs/runbooks/c3-paid-run.md', import.meta.url), 'utf8');
  expect(runbook).toContain('LES_LTX_MODEL');
  expect(runbook).toContain('quality_failed');
  expect(runbook).toContain('needs_review');
});

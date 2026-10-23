import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// C14-4 (2026-10-18, zero cost): the two face checks of the C14 quality gate (single face share >= 0.9, partner mouth
// movement during learner lines <= 0.35) run scripts/video-qa/face_checks.py with python3 -I (MediaPipe face
// landmarker model, local only). The user approved PySceneDetect and MediaPipe on 2026-10-18 for this offline script.
//
// Samples: public/media/hotel-pov-12s.mp4 (a real AI course clip in the repo, one woman facing the camera, partner line
// 1-2.5 s, learner line 6-7.7 s) is the single-face positive; ffmpeg builds the rest from it: two copies side by side
// (two faces, negative), one frame looped (still mouth, positive) and the talking part (mouth moving, negative); a
// testsrc2 clip has no face at all. When the C3 course videos are on this machine (/mnt/project-files/les-c3-courses/)
// one of them is measured too.
//
// Environment: the detection tests need python3 with the pinned libraries (scripts/video-qa/requirements.txt) and the
// official model in the local cache (python3 -I scripts/video-qa/face_checks.py --fetch-model). The file probes that
// once; if it is not usable, every detection test is skipped and prints "[C14-4] face detector unavailable: <reason>",
// which shows up in the verify log. The tests that a missing detector must give not_checked (never passed) always run.
// Nothing here calls a model API; the script never downloads anything during these tests.
const ffmpeg = '/usr/bin/ffmpeg', ffprobe = '/usr/bin/ffprobe', python = '/usr/bin/python3';
const script = fileURLToPath(new URL('../../scripts/video-qa/face_checks.py', import.meta.url));
const hotel = fileURLToPath(new URL('../../public/media/hotel-pov-12s.mp4', import.meta.url));
const c3Hawker = '/mnt/project-files/les-c3-courses/hawker-chicken-rice.mp4';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const scratch = mkdtempSync(join(tmpdir(), 'les-c14-4-'));
const load = () => import('../../lib/video-quality-gate.ts');
const byId = (report, id) => report.checks.find(check => check.id === id);

function probe() {
  if (!existsSync(script)) return { ready: false, reason: 'face check script missing' };
  try {
    const out = JSON.parse(execFileSync(python, ['-I', script, '--probe'], { encoding: 'utf8', timeout: 60_000, cwd: tmpdir() }).trim().split('\n').pop());
    return out.status === 'ready' ? { ready: true, reason: `backend ${out.backend}` } : { ready: false, reason: out.reason ?? 'not ready' };
  } catch (error) { return { ready: false, reason: `probe failed: ${error.message.slice(0, 200)}` }; }
}
const detector = probe();
function needDetector() {
  if (!detector.ready) console.log(`[C14-4] face detector unavailable: ${detector.reason}`);
  test.skip(!detector.ready, `face detector unavailable: ${detector.reason}`);
}

const encode = ['-an', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '24'];
function sample(name, args) {
  const file = join(scratch, `${name}.mp4`);
  if (!existsSync(file)) execFileSync(ffmpeg, ['-v', 'error', '-y', ...args, ...encode, file]);
  const bytes = readFileSync(file);
  return { file, bytes, sha256: sha(bytes) };
}
const samples = {
  hotel: () => { const bytes = readFileSync(hotel); return { file: hotel, bytes, sha256: sha(bytes) }; },
  // Two people: the first 4 s and a mirrored later 4 s of the clip side by side.
  twoFaces: () => sample('two-faces', ['-i', hotel, '-i', hotel, '-filter_complex',
    '[0:v]trim=duration=4,setpts=PTS-STARTPTS,scale=360:640[a];[1:v]trim=start=4:duration=4,setpts=PTS-STARTPTS,scale=360:640,hflip[b];[a][b]hstack']),
  // One frame of the listening part, looped for 4 s: one face, mouth never moves.
  still: () => {
    const frame = join(scratch, 'still.png');
    if (!existsSync(frame)) execFileSync(ffmpeg, ['-v', 'error', '-y', '-ss', '6', '-i', hotel, '-frames:v', '1', frame]);
    return sample('still', ['-loop', '1', '-i', frame, '-t', '4']);
  },
  // The first 4 s, where the partner says "Hello. Checking in?" (1-2.5 s).
  talking: () => sample('talking', ['-i', hotel, '-t', '4']),
  noFace: () => sample('no-face', ['-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=24:d=3']),
  // A hard cut at 2 s from the face clip to an unrelated picture.
  cut: () => sample('cut', ['-i', hotel, '-f', 'lavfi', '-i', 'mandelbrot=s=720x1280:r=24', '-filter_complex',
    '[0:v]trim=duration=2,setpts=PTS-STARTPTS,format=yuv420p[a];[1:v]trim=duration=2,setpts=PTS-STARTPTS,format=yuv420p[b];[a][b]concat=n=2:v=1']),
};
const runScript = (args) => JSON.parse(execFileSync(python, ['-I', script, ...args], { encoding: 'utf8', timeout: 120_000, cwd: tmpdir() }).trim().split('\n').pop());

// ---- always run: without a working detector both checks are not_checked and the result is at most needs_review ----

test('C14-4 thresholds: single face >= 0.9, learner mouth <= 0.35, about 5 frames a second, all marked for C15-4 calibration', async () => {
  const { QUALITY_THRESHOLDS, FACE_DETECTION } = await load();
  expect(QUALITY_THRESHOLDS.minSingleFaceRatio).toBe(0.75); // C15-4a calibration (was 0.9)
  expect(QUALITY_THRESHOLDS.maxLearnerMouthRatio).toBe(0.35);
  expect(FACE_DETECTION.sampleFps).toBe(5);
  expect(FACE_DETECTION.timeoutMs).toBeGreaterThan(0);
  const source = readFileSync(new URL('../../lib/video-quality.ts', import.meta.url), 'utf8');
  expect(source).toContain('C15-4');
  const requirements = readFileSync(new URL('../../scripts/video-qa/requirements.txt', import.meta.url), 'utf8');
  for (const pin of ['mediapipe==1.1.1', 'opencv-python-headless==5.0.0', 'scenedetect==0.7.2']) expect(requirements).toContain(pin);
  expect(requirements).toContain('python3 -I');
});

test('C14-4 fallback: a missing Python gives not_checked for both face checks and the segment is only needs_review', async () => {
  const { createVideoQualityGate, createFaceChecks, qualityVerdict } = await load();
  const faces = createFaceChecks({ python: '/nonexistent/python3', script });
  const report = await createVideoQualityGate({ ffmpeg, ffprobe, faces })({ segmentIndex: 0, video: samples.hotel(), learnerWindows: [{ start: 6, end: 7.7 }] });
  for (const id of ['single_face', 'learner_mouth']) {
    expect(byId(report, id).status).toBe('not_checked');
    expect(typeof byId(report, id).reason).toBe('string');
  }
  expect(qualityVerdict(report)).toBe('needs_review');
});

test('C14-4 fallback: a gate built without the face script still says not_checked, never passed', async () => {
  const { createVideoQualityGate, qualityVerdict, FACE_CHECK_PENDING } = await load();
  const report = await createVideoQualityGate({ ffmpeg, ffprobe })({ segmentIndex: 0, video: samples.hotel(), learnerWindows: [] });
  for (const id of ['single_face', 'learner_mouth']) expect(byId(report, id)).toMatchObject({ status: 'not_checked', reason: FACE_CHECK_PENDING });
  expect(FACE_CHECK_PENDING).not.toContain('待用户批准');
  expect(qualityVerdict(report)).toBe('needs_review');
});

test('C14-4 fallback: a crash, a timeout, garbage output or a not_checked answer are never passed', async () => {
  const { createFaceChecks } = await load();
  const input = { file: hotel, duration: 12, learnerWindows: [{ start: 6, end: 7.7 }] };
  const answers = [
    async () => { throw Object.assign(new Error('boom'), { code: 1 }); },
    async () => { throw Object.assign(new Error('timeout'), { killed: true, signal: 'SIGTERM' }); },
    async () => ({ stdout: 'not json', stderr: '' }),
    async () => ({ stdout: '{"status":"not_checked","reason":"face model not in the local cache"}\n', stderr: '' }),
    async () => ({ stdout: '{"status":"passed"}\n', stderr: '' }),
    async () => ({ stdout: JSON.stringify({ status: 'measured', frames: 10, single_face: { ratio: 7, keyframes: [] }, learner_mouth: { ratio: -1, frames: 10, keyframes: [] } }), stderr: '' }),
    async () => ({ stdout: JSON.stringify({ status: 'measured', frames: 10, single_face: { ratio: 1 }, learner_mouth: { ratio: 0, frames: 10 } }), stderr: '' }),
  ];
  for (const execute of answers) {
    const checks = await createFaceChecks({ python, script, execute })(input);
    expect(checks.map(check => [check.id, check.status])).toEqual([['single_face', 'not_checked'], ['learner_mouth', 'not_checked']]);
  }
  // The real child process is killed at the timeout.
  const slow = await createFaceChecks({ python, script, timeoutMs: 1 })(input);
  expect(slow.map(check => check.status)).toEqual(['not_checked', 'not_checked']);
});

test('C14-4 fallback: the script itself reports not_checked for a missing model, a missing video or bad windows', async () => {
  const empty = mkdtempSync(join(tmpdir(), 'les-c14-4-nomodel-'));
  expect(runScript(['--video', hotel, '--model-dir', empty])).toMatchObject({ status: 'not_checked' });
  expect(runScript(['--probe', '--model-dir', empty])).toMatchObject({ status: 'not_checked' });
  expect(runScript(['--video', join(scratch, 'missing.mp4')])).toMatchObject({ status: 'not_checked' });
  expect(runScript(['--video', hotel, '--learner-windows', '{"start":1}'])).toMatchObject({ status: 'not_checked' });
  expect(runScript(['--video', hotel, '--learner-windows', '[{"start":3,"end":1}]'])).toMatchObject({ status: 'not_checked' });
});

test('C14-4 judge: measured ratios are compared with the thresholds; no learner line passes the mouth check, no partner face does not', async () => {
  const { judgeFaceMeasurement } = await load();
  const measured = (face, mouth, frames = 20) => ({ status: 'measured', frames, single_face: { ratio: face, multi_ratio: 0, keyframes: [1] }, learner_mouth: { ratio: mouth, frames: mouth === null ? 0 : 8, keyframes: [2] } });
  const windows = [{ start: 0, end: 2 }];
  expect(judgeFaceMeasurement(measured(0.9, 0.35), windows).map(check => check.status)).toEqual(['passed', 'passed']);
  const failed = judgeFaceMeasurement(measured(0.74, 0.36), windows);
  expect(failed.map(check => check.status)).toEqual(['failed', 'failed']);
  expect(failed[0]).toMatchObject({ value: 0.74, keyframes: [1] });
  expect(failed[1]).toMatchObject({ value: 0.36, keyframes: [2] });
  for (const check of failed) expect(typeof check.reason).toBe('string');
  expect(judgeFaceMeasurement(measured(1, null), [])[1]).toMatchObject({ id: 'learner_mouth', status: 'passed' });
  expect(judgeFaceMeasurement(measured(1, null), windows)[1]).toMatchObject({ id: 'learner_mouth', status: 'not_checked' });
  expect(judgeFaceMeasurement(null, windows).map(check => check.status)).toEqual(['not_checked', 'not_checked']);
});

test('C14-4 runtime: the live runtime takes an absolute Python path for the face script and refuses a relative one', async () => {
  const { createLiveGenerationRuntime } = await import('../../lib/live-generation-runtime.ts');
  const dir = mkdtempSync(join(tmpdir(), 'les-c14-4-runtime-'));
  const options = { enabled: true, directory: dir, sessionSecret: 'offline-c14-4-session-secret-at-least-32-chars', openaiKey: 'sk-synthetic', ltxKey: 'ltx-synthetic',
    budget: { scope: 'c14-4', priorSpentMicros: 0, maxReservedMicros: 1_000_000, scriptMicros: 1, audioMicros: 1, videoMicros: 1 },
    media: { ffmpeg, ffprobe, allowedHosts: ['storage.googleapis.com'], maxBytes: 1_000_000 } };
  expect(() => createLiveGenerationRuntime(options)).not.toThrow();
  expect(() => createLiveGenerationRuntime({ ...options, media: { ...options.media, python } })).not.toThrow();
  expect(() => createLiveGenerationRuntime({ ...options, media: { ...options.media, python: 'python3' } })).toThrow('Live runtime media configuration required');
});

// ---- detection: real measurements on this machine (skipped, with a log line, when the detector is unavailable) ----

test.describe('C14-4 detection', () => {
  test.describe.configure({ timeout: 120_000 });

  test('the real single-person course clip passes both face checks and, with the ffmpeg checks, the whole gate', async () => {
    needDetector();
    const { createVideoQualityGate, createFaceChecks, qualityVerdict } = await load();
    const gate = createVideoQualityGate({ ffmpeg, ffprobe, faces: createFaceChecks({ python, script }) });
    const report = await gate({ segmentIndex: 0, video: samples.hotel(), learnerWindows: [{ start: 6, end: 7.7 }] });
    console.log(`[C14-4] hotel-pov-12s: ${JSON.stringify(report.checks)}`);
    expect(byId(report, 'single_face').status).toBe('passed');
    expect(byId(report, 'single_face').value).toBeGreaterThanOrEqual(0.9);
    expect(byId(report, 'learner_mouth').status).toBe('passed');
    expect(byId(report, 'learner_mouth').value).toBeLessThanOrEqual(0.35);
    expect(report.checks.every(check => check.status === 'passed')).toBe(true);
    expect(qualityVerdict(report)).toBe('passed');
  });

  test('two faces side by side fail the single-face check and block the segment', async () => {
    needDetector();
    const { createVideoQualityGate, createFaceChecks, qualityVerdict } = await load();
    const gate = createVideoQualityGate({ ffmpeg, ffprobe, faces: createFaceChecks({ python, script }) });
    const report = await gate({ segmentIndex: 0, video: samples.twoFaces(), learnerWindows: [] });
    const single = byId(report, 'single_face');
    expect(single.status).toBe('failed');
    expect(single.value).toBeLessThan(0.9);
    expect(single.keyframes.length).toBeGreaterThan(0);
    expect(qualityVerdict(report)).toBe('quality_failed');
    expect(runScript(['--video', samples.twoFaces().file]).single_face.max_faces).toBe(2);
  });

  test('a looped still face passes the mouth check during a learner line', async () => {
    needDetector();
    const { createFaceChecks } = await load();
    const checks = await createFaceChecks({ python, script })({ file: samples.still().file, duration: 4, learnerWindows: [{ start: 0.5, end: 3.5 }] });
    expect(checks.find(check => check.id === 'single_face')).toMatchObject({ status: 'passed' });
    expect(checks.find(check => check.id === 'learner_mouth')).toMatchObject({ status: 'passed', value: 0 });
  });

  test('the partner talking inside a learner window fails the mouth check, with key frames', async () => {
    needDetector();
    const { createFaceChecks } = await load();
    const faces = createFaceChecks({ python, script });
    const talking = await faces({ file: samples.talking().file, duration: 4, learnerWindows: [{ start: 0.5, end: 2 }] });
    const mouth = talking.find(check => check.id === 'learner_mouth');
    expect(mouth.status).toBe('failed');
    expect(mouth.value).toBeGreaterThan(0.35);
    expect(mouth.keyframes.every(time => time >= 0.5 && time <= 2)).toBe(true);
    // The same clip with the learner line where the partner is silent (the real course timing) passes.
    const quiet = await faces({ file: hotel, duration: 12, learnerWindows: [{ start: 6, end: 7.7 }] });
    expect(quiet.find(check => check.id === 'learner_mouth').status).toBe('passed');
  });

  test('a clip with no face fails the single-face check and cannot measure the partner mouth', async () => {
    needDetector();
    const { createFaceChecks } = await load();
    const checks = await createFaceChecks({ python, script })({ file: samples.noFace().file, duration: 3, learnerWindows: [{ start: 0, end: 3 }] });
    expect(checks.find(check => check.id === 'single_face')).toMatchObject({ status: 'failed', value: 0 });
    expect(checks.find(check => check.id === 'learner_mouth').status).toBe('not_checked');
  });

  test('PySceneDetect cross-check lists the hard cut at 2 s', async () => {
    needDetector();
    const out = runScript(['--video', samples.cut().file, '--scenes']);
    expect(out.status).toBe('measured');
    expect(out.scene_cuts.length).toBe(1);
    expect(Math.abs(out.scene_cuts[0] - 2)).toBeLessThan(0.1);
    expect(runScript(['--video', hotel, '--scenes']).scene_cuts).toEqual([]);
  });

  test('a real C3 course video with two people in frame is not a single-face video', async () => {
    needDetector();
    if (!existsSync(c3Hawker)) console.log(`[C14-4] ${c3Hawker} not on this machine, skipped`);
    test.skip(!existsSync(c3Hawker), 'C3 course video not on this machine');
    const out = runScript(['--video', c3Hawker]);
    console.log(`[C14-4] hawker-chicken-rice: ${JSON.stringify(out.single_face)}`);
    expect(out.status).toBe('measured');
    expect(out.single_face.ratio).toBeLessThan(0.9);
    expect(out.single_face.max_faces).toBeGreaterThanOrEqual(2);
  });
});

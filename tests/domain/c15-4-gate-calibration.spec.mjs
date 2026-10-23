import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// C15-4a (2026-10-23, zero cost): calibration of the C14 single-face check with the first paid C15-4 sample.
// The school lesson (ltx-2-3-pro, task 752bd329) failed single_face twice (0.8152, then 0.7935 on the redo). Per-frame
// detection of the redo: frames 0-3.2 s have no face at all (the teacher walks in from the far end of the corridor,
// her face under 6% of the frame height), only 2 of 92 frames have two faces (background children); one woman, one
// shot, throughout. The user's 2026-10-17 complaint was two people / swapped roles, not a walk-in. The two C3 videos
// the user rejected measure 0.4254 and 0.5891. So: exactly-one-face share >= 0.75 (was 0.9), and a separate cap on
// frames with two or more faces (<= 0.1) so a second person is still caught. The video prompt also now asks for the
// partner to stand close from the first frame and for nobody else in view.
const ffmpeg = '/usr/bin/ffmpeg', python = '/usr/bin/python3';
const script = fileURLToPath(new URL('../../scripts/video-qa/face_checks.py', import.meta.url));
const hotel = fileURLToPath(new URL('../../public/media/hotel-pov-12s.mp4', import.meta.url));
const schoolRedo = '/mnt/project-files/les-c15/video/school-ltx-2-3-pro-a2-seg0-redo.mp4';
const c3 = ['/mnt/project-files/les-c3-courses/hawker-chicken-rice.mp4', '/mnt/project-files/les-c3-courses/school-pickup.mp4'];
const load = () => import('../../lib/video-quality-gate.ts');
const scratch = mkdtempSync(join(tmpdir(), 'les-c15-4a-'));
const runScript = args => JSON.parse(execFileSync(python, ['-I', script, ...args], { encoding: 'utf8', timeout: 120_000, cwd: tmpdir() }).trim().split('\n').pop());
function probe() {
  try {
    const out = JSON.parse(execFileSync(python, ['-I', script, '--probe'], { encoding: 'utf8', timeout: 60_000, cwd: tmpdir() }).trim().split('\n').pop());
    return out.status === 'ready' ? { ready: true } : { ready: false, reason: out.reason ?? 'not ready' };
  } catch (error) { return { ready: false, reason: `probe failed: ${error.message.slice(0, 200)}` }; }
}
const detector = probe();
function needDetector() {
  if (!detector.ready) console.log(`[C15-4a] face detector unavailable: ${detector.reason}`);
  test.skip(!detector.ready, `face detector unavailable: ${detector.reason}`);
}
const measured = (ratio, multi, extra = {}) => ({ status: 'measured', frames: 92, single_face: { ratio, multi_ratio: multi, keyframes: [0, 0.2], multi_keyframes: [8.2], ...extra }, learner_mouth: { ratio: 0.1, frames: 20, keyframes: [] } });
const windows = [{ start: 1, end: 3 }];

test('C15-4a thresholds: one face in >= 75% of frames, two or more faces in <= 10%, marked as calibrated in C15-4', async () => {
  const { QUALITY_THRESHOLDS } = await load();
  expect(QUALITY_THRESHOLDS.minSingleFaceRatio).toBe(0.75);
  expect(QUALITY_THRESHOLDS.maxMultiFaceRatio).toBe(0.1);
  const source = readFileSync(new URL('../../lib/video-quality.ts', import.meta.url), 'utf8');
  expect(source).toContain('C15-4a');
});

test('C15-4a judge: a walk-in opening with a few background faces passes; a second person in many frames fails', async () => {
  const { judgeFaceMeasurement } = await load();
  // The measured school redo: 0.7935 one face, 2/92 two faces.
  expect(judgeFaceMeasurement(measured(0.7935, 0.0217), windows)[0]).toMatchObject({ id: 'single_face', status: 'passed', value: 0.7935 });
  expect(judgeFaceMeasurement(measured(0.75, 0.1), windows)[0].status).toBe('passed');
  const lowShare = judgeFaceMeasurement(measured(0.74, 0), windows)[0];
  expect(lowShare).toMatchObject({ status: 'failed', value: 0.74, keyframes: [0, 0.2] });
  expect(lowShare.reason).toContain('exactly one face');
  // Many single-face frames are not enough when a second face keeps showing up.
  const second = judgeFaceMeasurement(measured(0.88, 0.12), windows)[0];
  expect(second).toMatchObject({ status: 'failed', value: 0.88, keyframes: [8.2] });
  expect(second.reason).toContain('more than one face');
});

test('C15-4a judge: a measurement without the multi-face share, or with a bad one, is not_checked, never passed', async () => {
  const { judgeFaceMeasurement } = await load();
  for (const multi of [undefined, null, -0.1, 1.5, 'x']) {
    const raw = measured(0.95, multi);
    if (multi === undefined) delete raw.single_face.multi_ratio;
    expect(judgeFaceMeasurement(raw, windows)[0]).toMatchObject({ id: 'single_face', status: 'not_checked' });
  }
});

test('C15-4a prompt: the partner already stands close from the first frame and nobody else is in view', async () => {
  const { sceneVideoPrompt } = await import('../../lib/scene-video-prompt.ts');
  const scene = { setting: 'After school at a classroom door, students leaving with their parents.', partnerGender: 'female', partnerLook: 'in her forties, school lanyard' };
  const prompt = sceneVideoPrompt('goal', { lines: [{ id: 'l1', role: 'partner', text: 'Hello!' }, { id: 'l2', role: 'learner', text: 'Hi.' }], scene });
  expect(prompt).toContain('From the very first frame she already stands close in front of the viewer');
  expect(prompt).toContain('she does not walk in from a distance');
  expect(prompt).toContain('No one else is in the frame');
  expect(prompt).toContain('She is the only person on screen');
  const male = sceneVideoPrompt('goal', { lines: [{ id: 'l1', role: 'partner', text: 'Hello!' }], scene: { ...scene, partnerGender: 'male' } });
  expect(male).toContain('From the very first frame he already stands close in front of the viewer');
  expect(prompt.length).toBeLessThanOrEqual(5000);
});

test.describe('C15-4a detection', () => {
  test.describe.configure({ timeout: 180_000 });

  test('the script reports the share of frames with two or more faces', async () => {
    needDetector();
    const two = join(scratch, 'two.mp4');
    execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', hotel, '-i', hotel, '-filter_complex', '[0:v]trim=duration=3,setpts=PTS-STARTPTS,scale=360:640[a];[1:v]trim=start=4:duration=3,setpts=PTS-STARTPTS,scale=360:640,hflip[b];[a][b]hstack', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '24', two]);
    const out = runScript(['--video', two]);
    expect(out.single_face.multi_ratio).toBeGreaterThan(0.5);
    expect(out.single_face.multi_keyframes.length).toBeGreaterThan(0);
    const one = runScript(['--video', hotel]);
    expect(one.single_face.multi_ratio).toBe(0);
    expect(one.single_face.multi_keyframes).toEqual([]);
  });

  test('the real C15-4 school redo segment passes the face checks; the two rejected C3 courses still fail', async () => {
    needDetector();
    const files = [schoolRedo, ...c3].filter(existsSync);
    if (files.length < 3) console.log(`[C15-4a] calibration videos missing on this machine: ${[schoolRedo, ...c3].filter(f => !existsSync(f)).join(', ')}`);
    test.skip(files.length < 3, 'calibration videos not on this machine');
    const { createFaceChecks } = await load();
    const faces = createFaceChecks({ python, script });
    const redo = await faces({ file: schoolRedo, duration: 18.3, learnerWindows: [] });
    console.log(`[C15-4a] school redo: ${JSON.stringify(redo)}`);
    expect(redo.find(check => check.id === 'single_face').status).toBe('passed');
    for (const file of c3) {
      const checks = await faces({ file, duration: 60, learnerWindows: [] });
      console.log(`[C15-4a] ${file}: ${JSON.stringify(checks[0])}`);
      expect(checks.find(check => check.id === 'single_face').status).toBe('failed');
    }
  });
});

// C15-4b (2026-10-23, zero cost): seam SSIM calibration. Attempt 3 of the school lesson: segment 2 (chained from the last
// frame of segment 1) failed seam_ssim at 0.42 on both takes, while frame by frame the seam is continuous (same woman,
// same room, a small shift). Gray SSIM at 360x640 is 0.43 even between the first and last frame of one continuous
// segment; the two user-rejected C3 seams (a different person after the seam) measure 0.13 and 0.23. Threshold 0.6 -> 0.3.
const seamPrevious = '/mnt/project-files/les-c15/video/school-ltx-2-3-pro-a3-seg0.mp4';
const seamNext = '/mnt/project-files/les-c15/video/school-ltx-2-3-pro-a3-seg1-redo.mp4';
const media = file => { const bytes = readFileSync(file); return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') }; };
function c3Halves(file, at) {
  const a = join(scratch, `${at}-a.mp4`), b = join(scratch, `${at}-b.mp4`);
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', file, '-t', String(at), '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '24', a]);
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-ss', String(at + 0.05), '-i', file, '-t', '3', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '24', b]);
  return [media(a), media(b)];
}

test('C15-4b threshold: seam SSIM >= 0.3, marked as calibrated in C15-4b', async () => {
  const { QUALITY_THRESHOLDS } = await load();
  expect(QUALITY_THRESHOLDS.minSeamSsim).toBe(0.3);
  expect(readFileSync(new URL('../../lib/video-quality.ts', import.meta.url), 'utf8')).toContain('C15-4b');
});

test('C15-4b seam: the real continuous C15-4 seam passes; the two rejected C3 seams still fail', async () => {
  test.setTimeout(120_000);
  const files = [seamPrevious, seamNext, ...c3];
  if (!files.every(existsSync)) console.log(`[C15-4b] seam videos missing on this machine: ${files.filter(f => !existsSync(f)).join(', ')}`);
  test.skip(!files.every(existsSync), 'seam videos not on this machine');
  const { createVideoQualityGate } = await load();
  const gate = createVideoQualityGate({ ffmpeg, ffprobe: '/usr/bin/ffprobe' });
  const seam = report => report.checks.find(check => check.id === 'seam_ssim');
  const real = seam(await gate({ segmentIndex: 1, previous: media(seamPrevious), video: media(seamNext), learnerWindows: [] }));
  console.log(`[C15-4b] school a3 seam: ${JSON.stringify(real)}`);
  expect(real.status).toBe('passed');
  for (const [file, at] of [[c3[0], 19.042], [c3[1], 18.0]]) {
    const [previous, video] = c3Halves(file, at);
    const jump = seam(await gate({ segmentIndex: 1, previous, video, learnerWindows: [] }));
    console.log(`[C15-4b] ${file} seam: ${JSON.stringify(jump)}`);
    expect(jump.status).toBe('failed');
  }
});

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
  // Stop 0.15 s before the seam: re-encoding at 24 fps up to the seam time can end on the first frame after it.
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', file, '-t', String(at - 0.15), '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '24', a]);
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

// C15-4c (2026-10-23, zero cost): per-segment video prompt. Attempt 4 of the school lesson: segment 2 opens with a
// 4-second learner line (silent in the drive audio) and the teacher visibly mouths words through it on both takes
// (learner_mouth 0.6327 twice; frame by frame her mouth opens and closes, eyes shut, as if talking). Every segment's
// prompt listed all five partner lines of the lesson ("She says: ..."), so the model had words to say but no voice for
// them. Now each segment's prompt names only that segment's partner words and says when she listens silently.
const lessonLines = [
  { id: 'p1', role: 'partner', text: 'Hello, you are here early today.' }, { id: 'l1', role: 'learner', text: 'Thank you for letting me know.' },
  { id: 'p2', role: 'partner', text: 'Your child is making friends.' }, { id: 'l2', role: 'learner', text: 'At home she shared a bit.' },
  { id: 'p3', role: 'partner', text: 'She tries her best in class.' }, { id: 'l3', role: 'learner', text: 'I am glad to know.' },
];
const lessonScene = { setting: 'A primary school classroom door after school.', partnerGender: 'female', partnerLook: 'in her forties, school lanyard' };

test('C15-4c prompt: a segment names only its own partner words, and when she listens silently', async () => {
  const { sceneVideoPrompt } = await import('../../lib/scene-video-prompt.ts');
  const script = { lines: lessonLines, scene: lessonScene };
  const prompt = sceneVideoPrompt('goal', script, { lines: [{ lineId: 'l2', start: 0, end: 4.2 }, { lineId: 'p3', start: 4.2, end: 11 }, { lineId: 'l3', start: 11, end: 16.7 }] });
  expect(prompt).toContain('In this clip she says only: "She tries her best in class."');
  for (const other of ['Hello, you are here early today.', 'Your child is making friends.']) expect(prompt).not.toContain(other);
  for (const learner of lessonLines.filter(line => line.role === 'learner')) expect(prompt).not.toContain(learner.text);
  expect(prompt).toContain('The clip opens with her listening');
  expect(prompt).toContain('From 0.0 s to 4.2 s she listens silently with her lips closed');
  expect(prompt).toContain('From 11.0 s to 16.7 s she listens silently with her lips closed');
  expect(prompt).toContain('She is the only person on screen');
  expect(prompt.length).toBeLessThanOrEqual(5000);
  // A segment that starts with her own line does not say it opens with listening.
  const first = sceneVideoPrompt('goal', script, { lines: [{ lineId: 'p1', start: 0, end: 6.6 }, { lineId: 'l1', start: 6.6, end: 11.3 }, { lineId: 'p2', start: 11.3, end: 18.1 }] });
  expect(first).toContain('In this clip she says only: "Hello, you are here early today." / "Your child is making friends."');
  expect(first).not.toContain('The clip opens with her listening');
  expect(first).toContain('From 6.6 s to 11.3 s she listens silently with her lips closed');
  // A learner-only segment: no partner words at all.
  const only = sceneVideoPrompt('goal', { lines: lessonLines, scene: { ...lessonScene, partnerGender: 'male' } }, { lines: [{ lineId: 'l3', start: 0, end: 3.8 }] });
  expect(only).toContain('In this clip he does not speak at all');
  expect(only).toContain('From 0.0 s to 3.8 s he listens silently with his lips closed');
  expect(only).not.toContain(' says only');
});

test('C15-4c prompt: without segment timings the whole-lesson prompt is unchanged', async () => {
  const { sceneVideoPrompt } = await import('../../lib/scene-video-prompt.ts');
  const prompt = sceneVideoPrompt('goal', { lines: lessonLines, scene: lessonScene });
  expect(prompt).toContain('She says: "Hello, you are here early today." / "Your child is making friends." / "She tries her best in class."');
  expect(prompt).not.toContain('In this clip');
  expect(sceneVideoPrompt('plain goal')).toBe('plain goal');
});

// C15-4d (2026-10-23, zero cost): segment boundaries before a partner line. Attempts 3-5 of the school lesson: the
// second segment always opened with a learner line (silent in the drive audio) and started from the last frame of the
// first segment, taken while the partner was mid-sentence; the partner kept mouthing words through those first 4 s on
// all four takes (learner_mouth 0.51 / 0.63 / 0.63 / 0.51 / 0.47, key frames 0.2-4 s), even with the C15-4c prompt.
// Segments that opened with the partner's own line passed every time. In a scene lesson (learner lines marked silence)
// the lines are now packed as partner line + following learner lines, so every segment starts with the partner speaking
// and ends with her listening; if that cannot fit in four segments of at most 20 s, the old line-by-line plan is kept.
const schoolA5 = [['p1', 5.75], ['l1', 4.25], ['p2', 6.7], ['l2', 4.05], ['p3', 7.7], ['l3', 4.5], ['p4', 6.55], ['l4', 4.4], ['p5', 5.8], ['l5', 2.6]]
  .map(([lineId, duration]) => ({ lineId, duration, silence: lineId.startsWith('l') }));

test('C15-4d plan: in a scene lesson every segment starts with a partner line and ends after her listener line', async () => {
  const { planAudioSegments } = await import('../../lib/generated-audio.ts');
  const plan = planAudioSegments(schoolA5);
  expect(plan.map(segment => segment.lineIds)).toEqual([['p1', 'l1'], ['p2', 'l2'], ['p3', 'l3'], ['p4', 'l4', 'p5', 'l5']]);
  for (const segment of plan) { expect(segment.lineIds[0]).toMatch(/^p/); expect(segment.duration).toBeLessThanOrEqual(20); }
  expect(plan.map(segment => +segment.duration.toFixed(2))).toEqual([10, 10.75, 12.2, 19.35]);
  // The old greedy plan for the same lines (what attempts 3-5 got) put l2 at the start of segment 2.
  const legacy = planAudioSegments(schoolA5.map(({ lineId, duration }) => ({ lineId, duration })));
  expect(legacy.map(segment => segment.lineIds)).toEqual([['p1', 'l1', 'p2'], ['l2', 'p3', 'l3'], ['p4', 'l4', 'p5', 'l5']]);
});

test('C15-4d plan: a lesson opening with a learner line keeps it first; if pairs need more than four segments the old plan is kept', async () => {
  const { planAudioSegments } = await import('../../lib/generated-audio.ts');
  const opening = [{ lineId: 'l0', duration: 3, silence: true }, { lineId: 'p1', duration: 9, silence: false }, { lineId: 'l1', duration: 9, silence: true }, { lineId: 'p2', duration: 5, silence: false }];
  expect(planAudioSegments(opening).map(segment => segment.lineIds)).toEqual([['l0'], ['p1', 'l1'], ['p2']]);
  // Five pairs of 11 s cannot fit four 20 s segments as whole pairs: the line-by-line plan is used instead.
  const long = Array.from({ length: 10 }, (_, i) => ({ lineId: `x${i}`, duration: i % 2 ? 5 : 6, silence: i % 2 === 1 }));
  const greedy = planAudioSegments(long.map(({ lineId, duration }) => ({ lineId, duration })));
  expect(planAudioSegments(long)).toEqual(greedy);
});

test('C15-4d assembly: the scene audio assembly starts every segment with the partner line', async () => {
  const { assembleCourseAudio } = await import('../../lib/assemble-course-audio.ts');
  const wav = seconds => {
    const data = Math.round(seconds * 16000) * 2, bytes = Buffer.alloc(44 + data);
    bytes.write('RIFF'); bytes.writeUInt32LE(36 + data, 4); bytes.write('WAVE', 8); bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(data, 40);
    for (let i = 44; i < bytes.length; i += 2) bytes.writeInt16LE(Math.round(6000 * Math.sin(i / 15)), i);
    return bytes;
  };
  const inputs = schoolA5.map(({ lineId, duration, silence }) => { const bytes = wav(duration); return { lineId, bytes, sha256: createHash('sha256').update(bytes).digest('hex'), silence }; });
  const assembled = assembleCourseAudio(inputs);
  expect(assembled.segments.map(segment => segment.lineIds[0])).toEqual(['p1', 'p2', 'p3', 'p4']);
  for (const line of assembled.lines.filter(line => line.segmentStart === 0)) expect(line.lineId).toMatch(/^p/);
});

// C15-4e (2026-10-23, zero cost): tail repair limit. Attempt 6 of the school lesson passed the gate on segments 1-3;
// segment 4 (9.05 s of audio) came back from LTX as 209 frames, 8.708 s, 0.342 s (8.2 frames) short, just over the
// 8-frame pad limit, so the run stopped with "Verified tail repair failed" and no course. Segments now end on the
// partner listening (C15-4d), so holding her last frame a little longer is harmless (the gate still rejects any
// freeze over 1 s). A short video is padded up to 12 frames (0.5 s); a long one is still trimmed only up to 8 frames.
test('C15-4e tail repair: the real 8.2-frame LTX shortfall is padded; more than 12 frames short or 8 frames long still fails', async () => {
  const { planVideoTailRepair } = await import('../../lib/video-tail-repair.ts');
  const base = { videoStart: 0, audioStart: 0, fps: 24, width: 720, height: 1280 };
  expect(planVideoTailRepair({ ...base, sourceAudioDuration: 9.05, videoDuration: 8.708333 })).toMatchObject({ targetDuration: 9.05, padFrames: 9, replaceWithSourceAudio: true });
  expect(planVideoTailRepair({ ...base, sourceAudioDuration: 10, videoDuration: 9.5 })).toMatchObject({ padFrames: 12 });
  expect(() => planVideoTailRepair({ ...base, sourceAudioDuration: 10, videoDuration: 9.45 })).toThrow();
  expect(planVideoTailRepair({ ...base, sourceAudioDuration: 10, videoDuration: 10.3 })).toMatchObject({ padFrames: 0 });
  expect(() => planVideoTailRepair({ ...base, sourceAudioDuration: 10, videoDuration: 10.4 })).toThrow();
});

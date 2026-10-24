import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// C15-4g (2026-10-23, zero cost; nothing here calls OpenAI, LTX or any paid service). After attempt 7 of the school
// lesson (ltx-2-3-pro, 4 segments, all 6 gate checks passed) the human review still found: segment 2 (13-28 s of the
// lesson) has drifting white dots in the background that no check looks at; at the end, while the learner says "I
// appreciate that. Have a good evening.", the partner's lips move for about 2 s as if whispering along, yet the mouth
// check passed (0.3333 against 0.35) because it cannot tell that from the open, toothy smiles of l3 / l4; the seams at
// 12.5 / 47.1 s visibly jump; the driver had no per-run cap of its own (attempt 7 needed an outside wrapper); and the
// learning-page screenshot showed "学习位置暂未保存" because the test double saved progress with a fixed media hash.
const ffmpeg = '/usr/bin/ffmpeg', ffprobe = '/usr/bin/ffprobe', python = '/usr/bin/python3';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const repo = fileURLToPath(new URL('../..', import.meta.url));
const script = join(repo, 'scripts', 'video-qa', 'face_checks.py');
const video = '/mnt/project-files/les-c15/video';
const a7 = [0, 1, 2, 3].map(index => `${video}/school-ltx-2-3-pro-a7-seg${index}.mp4`);
const a7final = `${video}/school-ltx-2-3-pro-a7.mp4`, a7v2 = `${video}/school-ltx-2-3-pro-a7-v2.mp4`;
// Learner lines of attempt 7 inside each segment (lesson timeline minus the segment start 0 / 12.5 / 27.958 / 47.125).
const a7windows = [[{ start: 6.7, end: 12.5 }], [{ start: 6.8, end: 15.45 }], [{ start: 6.05, end: 10.35 }, { start: 16.15, end: 19.15 }], [{ start: 6.7, end: 10.25 }]];
const scratch = mkdtempSync(join(tmpdir(), 'les-c15-4g-'));
const quality = () => import('../../lib/video-quality.ts');
const gateModule = () => import('../../lib/video-quality-gate.ts');
const runCapModule = () => import('../../scripts/c15/run-cap.mjs');
const byId = (checks, id) => checks.find(check => check.id === id);

// ---- 1. the driver's own per-run cap, checked before each paid request ----

test('C15-4g run cap: LTX requests are priced from their own audio, rounded up to whole seconds, and refused past the cap', async () => {
  const { createRunCap } = await runCapModule();
  const seen = [];
  const cap = createRunCap({ maxUsd: 1.6, ltxUsdPerSecond: 0.06, ltxWorstUsd: 1.2, probeSeconds: uri => { seen.push(uri); return 12.5; } });
  const body = JSON.stringify({ audio_uri: 'data:audio/mp4;base64,AAAA', prompt: 'p' });
  expect(cap.reserve({ kind: 'ltx', body }).usd).toBeCloseTo(0.78, 6); // ceil(12.5) = 13 s x 0.06
  expect(cap.reserve({ kind: 'ltx', body }).usd).toBeCloseTo(0.78, 6);
  expect(cap.total()).toBeCloseTo(1.56, 6);
  // A third one would make 2.34 > 1.6: refused here, so the caller never sends it.
  expect(() => cap.reserve({ kind: 'ltx', body })).toThrow(/run cap/);
  expect(cap.total()).toBeCloseTo(1.56, 6);
  expect(seen).toEqual(['data:audio/mp4;base64,AAAA', 'data:audio/mp4;base64,AAAA', 'data:audio/mp4;base64,AAAA']);
  // A whole number of seconds is not rounded up again.
  expect(createRunCap({ maxUsd: 5, ltxUsdPerSecond: 0.06, ltxWorstUsd: 1.2, probeSeconds: () => 10 }).reserve({ kind: 'ltx', body }).usd).toBeCloseTo(0.6, 6);
});

test('C15-4g run cap: unreadable audio counts at the worst-case segment price; OpenAI counts at its reservation until settled', async () => {
  const { createRunCap } = await runCapModule();
  for (const probeSeconds of [() => null, () => { throw new Error('ffprobe missing'); }, () => Number.NaN, () => 0]) {
    const cap = createRunCap({ maxUsd: 2, ltxUsdPerSecond: 0.06, ltxWorstUsd: 1.2, probeSeconds });
    expect(cap.reserve({ kind: 'ltx', body: JSON.stringify({ audio_uri: 'data:audio/mp4;base64,AAAA' }) }).usd).toBeCloseTo(1.2, 6);
  }
  expect(createRunCap({ maxUsd: 2, ltxUsdPerSecond: 0.06, ltxWorstUsd: 1.2, probeSeconds: () => 3 }).reserve({ kind: 'ltx', body: 'not json' }).usd).toBeCloseTo(1.2, 6);
  const cap = createRunCap({ maxUsd: 0.2, ltxUsdPerSecond: 0.06, ltxWorstUsd: 1.2, probeSeconds: () => 1 });
  const script = cap.reserve({ kind: 'script', worstUsd: 0.09 });
  expect(cap.total()).toBeCloseTo(0.09, 6);
  script.settle(0.004);
  expect(cap.total()).toBeCloseTo(0.004, 6);
  cap.reserve({ kind: 'tts', worstUsd: 0.05 }).settle(0.001);
  expect(cap.total()).toBeCloseTo(0.005, 6);
  // 0.005 + 0.06 fits; then the worst case of a script request (0.09) plus 0.065 does not pass 0.2 either; 0.2 would.
  cap.reserve({ kind: 'ltx', body: JSON.stringify({ audio_uri: 'x' }) });
  expect(() => cap.reserve({ kind: 'script', worstUsd: 0.15 })).toThrow(/run cap/);
  expect(() => cap.reserve({ kind: 'tts' })).toThrow();
  expect(cap.summary()).toMatchObject({ maxUsd: 0.2, requests: 3 });
});

test('C15-4g run cap: --max-usd accepts a positive amount up to USD25 and nothing else', async () => {
  const { parseMaxUsd, createRunCap } = await runCapModule();
  expect(parseMaxUsd(undefined)).toBeUndefined();
  expect(parseMaxUsd('4.5')).toBe(4.5);
  expect(parseMaxUsd('3')).toBe(3);
  for (const bad of ['0', '-1', 'abc', '', '26', '1e2', '4.555', 'NaN']) expect(() => parseMaxUsd(bad)).toThrow();
  for (const bad of [{ maxUsd: 0 }, { maxUsd: 1, ltxUsdPerSecond: 0 }, { maxUsd: 1, ltxUsdPerSecond: 0.06, ltxWorstUsd: -1 }]) expect(() => createRunCap({ ltxUsdPerSecond: 0.06, ltxWorstUsd: 1.2, ...bad })).toThrow();
});

test('C15-4g run cap: the default reader measures the seconds of a real data-URI audio with ffprobe', async () => {
  const { probeDataUriSeconds, createRunCap } = await runCapModule();
  const file = join(scratch, 'tone.m4a');
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2.3', '-c:a', 'aac', file]);
  const uri = `data:audio/mp4;base64,${readFileSync(file).toString('base64')}`;
  const seconds = probeDataUriSeconds(uri);
  expect(seconds).toBeGreaterThan(2.25);
  expect(seconds).toBeLessThan(2.4);
  expect(probeDataUriSeconds('data:text/plain;base64,AAAA')).toBeNull();
  expect(probeDataUriSeconds('data:audio/mp4;base64,AAAA')).toBeNull();
  expect(createRunCap({ maxUsd: 1, ltxUsdPerSecond: 0.06, ltxWorstUsd: 1.2 }).reserve({ kind: 'ltx', body: JSON.stringify({ audio_uri: uri }) }).usd).toBeCloseTo(0.18, 6);
});

test('C15-4g driver: --max-usd is parsed and every paid request passes the run cap before it is sent', async () => {
  const source = readFileSync(join(repo, 'scripts', 'c15', 'video-sample.mjs'), 'utf8');
  expect(source).toContain('--max-usd');
  expect(source).toContain("from './run-cap.mjs'");
  const paid = source.slice(source.indexOf('async function guardedFetch'), source.indexOf('const priorSpentMicros'));
  const capAt = paid.indexOf('runCap.reserve('), sendAt = paid.indexOf('try { response = await realFetch(url, init); }');
  expect(capAt).toBeGreaterThan(0);
  expect(sendAt).toBeGreaterThan(capAt);
  // OpenAI requests are settled on the run cap too, and the run summary carries the cap.
  expect(paid).toContain('ticket?.settle(');
  expect(source).toContain('runCap: runCap ? runCap.summary() : null');
});

// ---- 2. a short picture cross-fade at each seam; audio, length and line timings unchanged ----

function segment(name, color, seconds = 1) {
  const file = join(scratch, `${name}.mp4`);
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=72x128:r=24:d=${seconds}`, '-f', 'lavfi', '-i', `sine=frequency=${color === 'black' ? 300 : 500}:sample_rate=48000:duration=${seconds}`,
    '-shortest', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', file]);
  const bytes = readFileSync(file);
  return { bytes, sha256: sha(bytes) };
}
// Small gray frames of a video file (72x128), for luma and frame-to-frame comparisons.
const grayFrames = file => {
  const raw = execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-map', '0:v:0', '-vf', 'scale=72:128', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 64_000_000 });
  const size = 72 * 128, out = [];
  for (let i = 0; i + size <= raw.length; i += size) out.push(raw.subarray(i, i + size));
  return out;
};
const mean = frame => frame.reduce((sum, value) => sum + value, 0) / frame.length;
const step = (a, b) => { let sum = 0; for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]); return sum / a.length; };
const lumas = bytes => {
  const file = join(mkdtempSync(join(scratch, 'out-')), 'v.mp4');
  writeFileSync(file, bytes);
  return { file, lumas: grayFrames(file).map(mean) };
};
const pcm = file => sha(execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-map', '0:a:0', '-f', 's16le', '-ac', '1', '-ar', '48000', '-'], { maxBuffer: 64_000_000 }));
const probeDuration = file => Number(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim());

test('C15-4g cross-fade: the next segment fades in from the held last frame over 3 frames; same length, same audio', async () => {
  const { concatVideoBytes, SEAM_CROSSFADE_FRAMES } = await import('../../lib/concat-video-bytes.ts');
  expect(SEAM_CROSSFADE_FRAMES).toBe(3);
  const inputs = [segment('dark', 'black'), segment('light', 'white')];
  const plain = lumas((await concatVideoBytes(inputs, { executable: ffmpeg, normalizeDuration: 2 })).bytes);
  const faded = lumas((await concatVideoBytes(inputs, { executable: ffmpeg, normalizeDuration: 2, crossfadeAt: [1] })).bytes);
  expect(faded.lumas).toHaveLength(48);
  expect(plain.lumas).toHaveLength(48);
  expect(Math.abs(probeDuration(faded.file) - 2)).toBeLessThanOrEqual(0.001001);
  const dark = plain.lumas[0], light = plain.lumas[47];
  expect(light - dark).toBeGreaterThan(150);
  // Without the cross-fade the cut is hard at frame 24.
  expect(Math.abs(plain.lumas[23] - dark)).toBeLessThan(2);
  expect(Math.abs(plain.lumas[24] - light)).toBeLessThan(2);
  // With it: frames 0-23 untouched, 24 still the held last frame, 25 and 26 in between and rising, 27 on the new segment.
  for (let i = 0; i < 24; i++) expect(Math.abs(faded.lumas[i] - dark)).toBeLessThan(2);
  expect(faded.lumas[25]).toBeGreaterThan(dark + 20);
  expect(faded.lumas[26]).toBeGreaterThan(faded.lumas[25] + 20);
  expect(faded.lumas[26]).toBeLessThan(light - 20);
  for (let i = 27; i < 48; i++) expect(Math.abs(faded.lumas[i] - light)).toBeLessThan(2);
  // The sound is not touched.
  expect(pcm(faded.file)).toBe(pcm(plain.file));
});

test('C15-4g cross-fade: seams must match the segments, lie inside the lesson and come with CFR output; checked before ffmpeg runs', async () => {
  const { concatVideoBytes } = await import('../../lib/concat-video-bytes.ts');
  const fake = ['a', 'b', 'c'].map(text => { const bytes = Buffer.from(`segment ${text}`); return { bytes, sha256: sha(bytes) }; });
  let calls = 0;
  const execute = async () => { calls++; return { stdout: '', stderr: '' }; };
  for (const [inputs, options] of [
    [fake, { crossfadeAt: [10, 20] }], // no normalizeDuration: stream copy cannot blend
    [fake, { normalizeDuration: 30, crossfadeAt: [10] }], // one seam short
    [fake, { normalizeDuration: 30, crossfadeAt: [20, 10] }], // out of order
    [fake, { normalizeDuration: 30, crossfadeAt: [10, 30] }], // at the very end
    [fake, { normalizeDuration: 30, crossfadeAt: [0, 10] }],
    [fake, { normalizeDuration: 30, crossfadeAt: [10, Number.NaN] }],
    [fake, { normalizeDuration: 30, crossfadeAt: [10, '20'] }],
    [fake.slice(0, 1), { normalizeDuration: 30, crossfadeAt: [] }],
  ]) await expect(concatVideoBytes(inputs, { executable: ffmpeg, execute, ...options })).rejects.toThrow();
  expect(calls).toBe(0);
});

test('C15-4g cross-fade: the store hands the timeline start of every later segment to the assembly', async () => {
  const c = await setupStore();
  expect((await c.run()).stopped).toBe('ready');
  const task = await c.store.get(c.input);
  expect(c.concats).toHaveLength(1);
  const [count, duration, seams] = c.concats[0];
  expect(count).toBe(4);
  expect(duration).toBe(task.videoTimeline.duration);
  expect(seams).toEqual(task.videoTimeline.segments.slice(1).map(segment => segment.start));
  expect(seams).toHaveLength(3);
  // The line timings the learner sees are the planned ones (the cross-fade does not move them).
  expect(task.videoTimeline.lines.map(line => line.start)).toEqual(task.videoTimeline.segments.map(segment => segment.start));
});

test('C15-4g cross-fade: the live runtime asks for the cross-fade, the source says why', async () => {
  const runtime = readFileSync(join(repo, 'lib', 'live-generation-runtime.ts'), 'utf8');
  expect(runtime).toMatch(/crossfadeAt: seams/);
  expect(readFileSync(join(repo, 'lib', 'concat-video-bytes.ts'), 'utf8')).toContain('C15-4g');
});

// ---- 3 and 4. background noise and learner mouth motion: thresholds, judge, verdict ----

const measured = over => ({ status: 'measured', frames: 50, single_face: { ratio: 1, multi_ratio: 0, keyframes: [], multi_keyframes: [], face_height: 0.25 },
  learner_mouth: { ratio: 0.1, frames: 10, keyframes: [] }, background_specks: { frames: 50, baseline: 55, peak: 61, peak_t: 3, growth: 1.1 },
  learner_mouth_motion: { windows: 1, frames: 17, peak: 0.1, peak_t: 7 }, ...over });
const windows = [{ start: 6, end: 10 }];

test('C15-4g thresholds: background specks may grow up to 3x, back-and-forth lip motion up to 0.2 a second; both to be calibrated', async () => {
  const { QUALITY_THRESHOLDS, OPTIONAL_QUALITY_CHECK_IDS, QUALITY_CHECK_IDS } = await quality();
  expect(QUALITY_THRESHOLDS.maxBackgroundSpeckGrowth).toBe(3);
  expect(QUALITY_THRESHOLDS.maxLearnerMouthMotion).toBe(0.2);
  // C16-2 added background_haze after them (考题随 C16-2 更新).
  expect(OPTIONAL_QUALITY_CHECK_IDS).toEqual(['framing_drift', 'background_noise', 'learner_mouth_motion', 'background_haze']);
  expect(QUALITY_CHECK_IDS).toEqual(['cuts', 'single_face', 'learner_mouth', 'seam_ssim', 'black_freeze']);
  // The old mouth check and its threshold stay as they were.
  expect(QUALITY_THRESHOLDS.maxLearnerMouthRatio).toBe(0.35);
  const source = readFileSync(join(repo, 'lib', 'video-quality.ts'), 'utf8');
  expect(source).toContain('C15-4g');
  expect(source.slice(source.indexOf('C15-4g'))).toContain('待标定');
});

test('C15-4g judge: background specks growing past 3x fail with the moment they peak; within 3x pass', async () => {
  const { judgeFaceMeasurement } = await gateModule();
  const framing = { segmentIndex: 1, baseFaceHeight: 0.25 };
  const noisy = byId(judgeFaceMeasurement(measured({ background_specks: { frames: 78, baseline: 55, peak: 494.5, peak_t: 14.833, growth: 8.9909 } }), windows, framing), 'background_noise');
  expect(noisy).toMatchObject({ status: 'failed', value: 8.991, keyframes: [14.833] });
  expect(noisy.reason).toContain('background specks');
  expect(byId(judgeFaceMeasurement(measured({ background_specks: { frames: 63, baseline: 52, peak: 106, peak_t: 12.4, growth: 2.0385 } }), windows, framing), 'background_noise')).toMatchObject({ status: 'passed', value: 2.039 });
  expect(byId(judgeFaceMeasurement(measured({ background_specks: { frames: 10, baseline: 10, peak: 60, peak_t: 1, growth: 3 } }), windows, framing), 'background_noise').status).toBe('passed');
  // The first segment is judged on its own growth too.
  expect(byId(judgeFaceMeasurement(measured({ background_specks: { frames: 10, baseline: 10, peak: 80, peak_t: 1, growth: 4 } }), windows, { segmentIndex: 0 }), 'background_noise').status).toBe('failed');
});

test('C15-4g judge: lips moving back and forth while the learner speaks fail; a held smile passes; no learner line passes', async () => {
  const { judgeFaceMeasurement } = await gateModule();
  const framing = { segmentIndex: 3, baseFaceHeight: 0.25 };
  const whisper = byId(judgeFaceMeasurement(measured({ learner_mouth_motion: { windows: 1, frames: 17, peak: 0.3652, peak_t: 7.833 } }), windows, framing), 'learner_mouth_motion');
  expect(whisper).toMatchObject({ status: 'failed', value: 0.365, keyframes: [7.833] });
  expect(whisper.reason).toContain('learner speaks');
  expect(byId(judgeFaceMeasurement(measured({ learner_mouth_motion: { windows: 2, frames: 34, peak: 0.1172, peak_t: 9.2 } }), windows, framing), 'learner_mouth_motion')).toMatchObject({ status: 'passed', value: 0.117 });
  expect(byId(judgeFaceMeasurement(measured({ learner_mouth_motion: { windows: 0, frames: 0, peak: null, peak_t: null } }), [], framing), 'learner_mouth_motion')).toMatchObject({ status: 'passed', value: 0 });
  // The old ratio check is still there and still judged as before (0.3333 passes).
  const checks = judgeFaceMeasurement(measured({ learner_mouth: { ratio: 0.3333, frames: 18, keyframes: [6.8] }, learner_mouth_motion: { windows: 1, frames: 17, peak: 0.3652, peak_t: 7.833 } }), windows, framing);
  expect(byId(checks, 'learner_mouth')).toMatchObject({ status: 'passed', value: 0.3333 });
});

test('C15-4g judge: missing, malformed or unavailable measurements are not_checked, never passed; without framing nothing new appears', async () => {
  const { judgeFaceMeasurement } = await gateModule();
  const framing = { segmentIndex: 2, baseFaceHeight: 0.25 };
  for (const over of [{ background_specks: undefined }, { background_specks: { frames: 0, growth: null } }, { background_specks: { frames: 5, growth: 'big' } }, { background_specks: { frames: 5, growth: -1 } }]) {
    expect(byId(judgeFaceMeasurement(measured(over), windows, framing), 'background_noise').status).toBe('not_checked');
  }
  for (const over of [{ learner_mouth_motion: undefined }, { learner_mouth_motion: { windows: 1, frames: 0, peak: null, peak_t: null } }, { learner_mouth_motion: { windows: 1, frames: 5, peak: 'x' } }, { learner_mouth_motion: { windows: 1, frames: 5, peak: -0.1 } }]) {
    expect(byId(judgeFaceMeasurement(measured(over), windows, framing), 'learner_mouth_motion').status).toBe('not_checked');
  }
  const none = judgeFaceMeasurement({ status: 'not_checked', reason: 'no model' }, windows, framing);
  expect(byId(none, 'background_noise').status).toBe('not_checked');
  expect(byId(none, 'learner_mouth_motion').status).toBe('not_checked');
  expect(judgeFaceMeasurement(measured({}), windows).map(check => check.id)).toEqual(['single_face', 'learner_mouth']);
});

test('C15-4g verdict: a failed new check blocks the segment, an open one needs review, passed ones keep it passed', async () => {
  const { combineQualityChecks, validQualityCheck } = await quality();
  const five = ['cuts', 'single_face', 'learner_mouth', 'seam_ssim', 'black_freeze'].map(id => ({ id, status: 'passed' }));
  for (const id of ['background_noise', 'learner_mouth_motion']) {
    expect(validQualityCheck({ id, status: 'failed', value: 9, reason: 'x', keyframes: [14.8] })).toBe(true);
    expect(combineQualityChecks([...five, { id, status: 'passed', value: 1 }])).toBe('passed');
    expect(combineQualityChecks([...five, { id, status: 'failed', value: 9 }])).toBe('quality_failed');
    expect(combineQualityChecks([...five, { id, status: 'not_checked' }])).toBe('needs_review');
    expect(combineQualityChecks([...five, { id, status: 'passed' }, { id, status: 'passed' }])).toBe('needs_review');
  }
  expect(combineQualityChecks([...five, { id: 'framing_drift', status: 'passed' }, { id: 'background_noise', status: 'passed' }, { id: 'learner_mouth_motion', status: 'passed' }])).toBe('passed');
});

test('C15-4g gate: the new checks from the face checks are kept in the report; a script failure leaves them not_checked', async () => {
  const { createVideoQualityGate, createFaceChecks } = await gateModule();
  const file = join(scratch, 'moving.mp4');
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=24:d=3', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', file]);
  const bytes = readFileSync(file);
  const gate = createVideoQualityGate({ ffmpeg, ffprobe, faces: async () => [
    { id: 'single_face', status: 'passed', value: 1 }, { id: 'learner_mouth', status: 'passed', value: 0 },
    { id: 'framing_drift', status: 'passed', value: 0.25 }, { id: 'background_noise', status: 'failed', value: 9, reason: 'background specks grew 9x' },
    { id: 'learner_mouth_motion', status: 'failed', value: 0.37, reason: 'lips', keyframes: [7.8] }] });
  const report = await gate({ segmentIndex: 1, video: { bytes, sha256: sha(bytes) }, previous: { bytes, sha256: sha(bytes) }, learnerWindows: [{ start: 1, end: 2 }], baseFaceHeight: 0.25 });
  expect(byId(report.checks, 'background_noise')).toMatchObject({ status: 'failed', value: 9 });
  expect(byId(report.checks, 'learner_mouth_motion')).toMatchObject({ status: 'failed', keyframes: [7.8] });
  const broken = await createFaceChecks({ python, script, execute: async () => { throw Object.assign(new Error('boom'), { code: 1 }); } })({ file, duration: 3, learnerWindows: [], segmentIndex: 1, baseFaceHeight: 0.25 });
  expect(broken.map(check => [check.id, check.status])).toEqual([['single_face', 'not_checked'], ['learner_mouth', 'not_checked'], ['framing_drift', 'not_checked'], ['background_noise', 'not_checked'], ['learner_mouth_motion', 'not_checked'], ['background_haze', 'not_checked']]); // C16-2: background_haze joins them (考题随 C16-2 更新)
});

// ---- store setup (offline stand-ins only, as in C15-4f) ----

const secret = 'offline-c15-4g-session-secret-at-least-32-characters';
const now = Date.UTC(2026, 9, 23);
const translations = Object.fromEntries(['zh-Hans', 'id', 'ja', 'ko', 'hi'].map(k => [k, 'synthetic']));
const lines = Array.from({ length: 4 }, (_, i) => ({ id: 'line' + i, role: i % 2 ? 'learner' : 'partner', text: i % 2 ? 'Hi ' + 'okay '.repeat(15).trim() : 'Hello ' + 'friend '.repeat(46).trim(), translations }));
const lessonScript = { scene: { setting: 'A primary school classroom door after school.', partnerGender: 'female', partnerLook: 'early 30s, light blue blouse' }, lines,
  phrases: [{ id: 'phrase', text: 'Hello', lineId: 'line0', translations }], turns: [{ partnerLineId: 'line0', learnerLineId: 'line1' }, { partnerLineId: 'line2', learnerLineId: 'line3' }] };
const wav = Buffer.alloc(240044);
wav.write('RIFF'); wav.writeUInt32LE(240036, 4); wav.write('WAVE', 8); wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(240000, 40);
for (let i = 44; i < wav.length; i += 2) wav.writeInt16LE(Math.round(8000 * Math.sin(i / 20)), i);
const delta = 0.04, aac = Buffer.from('synthetic AAC'), final = Buffer.from('synthetic final video');
const frameAt = time => Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from(`synthetic frame at ${time}`)]);
const description = '放学接孩子';
const requirement = { revision: 1, content: { description, language: 'zh-Hans', keywords: { location: '', learnerRole: '', partnerRole: '', topic: '', goal: '', special: '' } } };

async function setupStore() {
  const { createGenerationTaskStore } = await import('../../lib/generation-tasks.ts');
  const { createPrivateMediaStore } = await import('../../lib/private-media-store.ts');
  const { sealGoogleSession } = await import('../../lib/google-auth.ts');
  const { validateFinalVideoProbe } = await import('../../lib/final-video-probe.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-c15-4g-store-'));
  const concats = [];
  let jobs = 0, renders = 0;
  const store = createGenerationTaskStore({
    directory, sessionSecret: secret, simulation: false, maxReservedMicros: 100_000, liveBudget: { scope: 'c15-4g-offline', priorSpentMicros: 0 },
    mediaStore: createPrivateMediaStore({ directory: join(directory, 'media'), sessionSecret: secret }),
    scriptProvider: { reservedMicros: 100, generate: async () => ({ requestId: 'synthetic', script: lessonScript }) },
    audioProvider: { reservedMicros: 100, generate: async line => ({ lineId: line.id, role: line.role, bytes: wav, sha256: sha(wav), duration: 15 }) },
    audioEncoder: async input => ({ bytes: aac, sha256: sha(aac), sourceSha256: input.sha256, sourceDuration: 15, duration: 15 + delta, mimeType: 'audio/mp4', decoded: true }),
    encodedVideoProvider: { reservedMicros: 1000, submit: async () => ({ status: 'pending', jobId: 'job' + ++jobs }), query: async id => ({ jobId: id, status: 'completed', videoUrl: `https://media.example.invalid/${id}.mp4` }) },
    videoDownload: async () => { const bytes = Buffer.from(`synthetic segment render ${++renders}`); return { bytes, sha256: sha(bytes) }; },
    videoProbe: async input => ({ sha256: input.sha256, duration: input.expectedDuration + delta, width: 720, height: 1280, fps: 24, videoCodec: 'h264', audioCodec: 'aac' }),
    videoRepair: async input => { const bytes = Buffer.concat([Buffer.from(input.video.bytes), Buffer.from('+full audio')]); return { bytes, sha256: sha(bytes), sourceVideoSha256: input.video.sha256, sourceAudioSha256: input.audio.sha256, decoded: true, duration: 15, width: 720, height: 1280, fps: 24, videoCodec: 'h264', audioCodec: 'aac', targetDuration: 15, padSeconds: 0, padFrames: 0, replaceWithSourceAudio: true }; },
    referenceExtractor: async input => { const bytes = frameAt(input.timeSeconds); return { bytes, sha256: sha(bytes), sourceVideoSha256: input.sha256, timeSeconds: input.timeSeconds, mimeType: 'image/png', width: 720, height: 1280, decoded: true }; },
    videoConcat: async (inputs, duration, seams) => { concats.push([inputs.length, duration, seams]); return { bytes: final, sha256: sha(final) }; },
    finalVideoVerify: async input => ({ ...validateFinalVideoProbe({ format: { format_name: 'mp4', start_time: 0, duration: 60 }, streams: [{ codec_type: 'video', codec_name: 'h264', width: 720, height: 1280, avg_frame_rate: '24/1', duration: 60, start_time: 0, disposition: { attached_pic: 0 } }, { codec_type: 'audio', codec_name: 'aac', profile: 'LC', sample_rate: 8000, channels: 1, duration: 60, start_time: 0 }] }, input.plan), sha256: sha(final), decoded: true }),
  });
  const cookie = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'c15-4g-owner', email: 'c15-4g@example.invalid' }, secret, now);
  const task = await store.create({ cookie, now, goal: description, revision: 1, requestKey: 'k', requirement });
  const input = { cookie, now: now + 1, id: task.id };
  const { createGenerationRunner } = await import('../../lib/generation-runner.ts');
  const runner = createGenerationRunner({ store, audioReview: async () => true, wait: async () => {}, maxPolls: 3 });
  return { store, concats, input, run: () => runner.advance(input) };
}

// ---- real measurements on attempt 7 (skipped, with a log line, when the detector or the samples are missing) ----

const runScript = args => JSON.parse(execFileSync(python, ['-I', script, ...args], { encoding: 'utf8', timeout: 240_000, cwd: tmpdir() }).trim().split('\n').pop());
function probe() {
  try {
    const out = JSON.parse(execFileSync(python, ['-I', script, '--probe'], { encoding: 'utf8', timeout: 60_000, cwd: tmpdir() }).trim().split('\n').pop());
    return out.status === 'ready' ? { ready: true } : { ready: false, reason: out.reason ?? 'not ready' };
  } catch (error) { return { ready: false, reason: `probe failed: ${error.message.slice(0, 200)}` }; }
}
const detector = probe();
function need(files = [], detect = true) {
  if (detect && !detector.ready) console.log(`[C15-4g] face detector unavailable: ${detector.reason}`);
  test.skip(detect && !detector.ready, `face detector unavailable: ${detector.reason}`);
  const missing = files.filter(file => !existsSync(file));
  if (missing.length) console.log(`[C15-4g] samples missing on this machine: ${missing.join(', ')}`);
  test.skip(missing.length > 0, 'C15-4 samples not on this machine');
}

test.describe('C15-4g attempt 7', () => {
  test.describe.configure({ timeout: 600_000 });

  test('the script reports background specks and learner mouth motion next to the old measurements', async () => {
    need([a7[3]]);
    const out = runScript(['--video', a7[3], '--learner-windows', JSON.stringify(a7windows[3])]);
    expect(out.status).toBe('measured');
    for (const key of ['baseline', 'peak', 'peak_t', 'growth']) expect(Number.isFinite(out.background_specks[key])).toBe(true);
    expect(out.background_specks.frames).toBe(out.frames);
    expect(Number.isFinite(out.learner_mouth_motion.peak)).toBe(true);
    expect(out.learner_mouth_motion.frames).toBeGreaterThan(5);
    // The old ratio is unchanged by C15-4g (attempt 7 segment 4: 0.3333).
    expect(out.learner_mouth.ratio).toBe(0.3333);
  });

  test('background noise: segment 2 (white dots, 13-28 s of the lesson) fails; segments 1 and 3 pass', async () => {
    need(a7.slice(0, 3));
    const { createFaceChecks } = await gateModule();
    const faces = createFaceChecks({ python, script, timeoutMs: 300_000 });
    const results = [];
    for (const index of [0, 1, 2]) results.push(byId(await faces({ file: a7[index], duration: 20, learnerWindows: a7windows[index], segmentIndex: index, baseFaceHeight: 0.2262 }), 'background_noise'));
    console.log(`[C15-4g] attempt 7 background_noise segments 1-3: ${JSON.stringify(results)}`);
    expect(results.map(item => item.status)).toEqual(['passed', 'failed', 'passed']);
    // The peak falls inside segment 2, i.e. 12.5 + t is within 13-28 s of the lesson.
    expect(12.5 + results[1].keyframes[0]).toBeGreaterThanOrEqual(13);
    expect(12.5 + results[1].keyframes[0]).toBeLessThanOrEqual(28);
  });

  test('mouth motion: the whisper at the start of l5 fails segment 4; the toothy smiles of l3 / l4 pass segment 3', async () => {
    need([a7[2], a7[3]]);
    const { createFaceChecks } = await gateModule();
    const faces = createFaceChecks({ python, script, timeoutMs: 300_000 });
    const smile = byId(await faces({ file: a7[2], duration: 19.17, learnerWindows: a7windows[2], segmentIndex: 2, baseFaceHeight: 0.2262 }), 'learner_mouth_motion');
    const whisper = byId(await faces({ file: a7[3], duration: 10.25, learnerWindows: a7windows[3], segmentIndex: 3, baseFaceHeight: 0.2262 }), 'learner_mouth_motion');
    console.log(`[C15-4g] attempt 7 learner_mouth_motion l3/l4: ${JSON.stringify(smile)}; l5: ${JSON.stringify(whisper)}`);
    expect(smile.status).toBe('passed');
    expect(whisper.status).toBe('failed');
    // In the first 2 s of l5 (6.7-8.7 s of the segment, 53.8-55.8 s of the lesson).
    expect(whisper.keyframes[0]).toBeGreaterThanOrEqual(6.7);
    expect(whisper.keyframes[0]).toBeLessThanOrEqual(8.7);
  });

  test('the offline re-assembly v2 keeps the length, frame count and sound of the original and softens the seams', async () => {
    need([a7final, a7v2, ...a7], false);
    expect(Math.abs(probeDuration(a7v2) - 57.375)).toBeLessThanOrEqual(0.001001);
    const frames = Number(execFileSync(ffprobe, ['-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', a7v2], { encoding: 'utf8' }).trim());
    expect(frames).toBe(1377);
    expect(pcm(a7v2)).toBe(pcm(a7final));
    // At each seam (frames 300 / 671 / 1131) the biggest frame-to-frame change is smaller than the original's hard cut;
    // away from the seams the picture is the same as before.
    const before = grayFrames(a7final), after = grayFrames(a7v2);
    for (const seam of [300, 671, 1131]) {
      const hard = step(before[seam - 1], before[seam]);
      const soft = Math.max(...[0, 1, 2, 3].map(k => step(after[seam + k - 1], after[seam + k])));
      console.log(`[C15-4g] a7 seam frame ${seam}: original jump ${hard.toFixed(2)}, v2 largest step ${soft.toFixed(2)}`);
      expect(soft).toBeLessThan(hard * 0.6);
      expect(step(before[seam + 10], after[seam + 10])).toBeLessThan(2);
    }
  });
});

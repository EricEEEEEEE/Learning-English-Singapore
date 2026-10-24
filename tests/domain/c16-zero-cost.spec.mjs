import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash, createHmac } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sealGoogleSession } from '../../lib/google-auth.ts';
import { dataFixture } from '../fixtures/c5-data-store.mjs';

// C16 (2026-10-24, zero cost). The user accepted the two real lessons as the first version (06:12 UTC, hawker attempt 9:
// "可以，我觉得这两个问题不大，都挺好的继续推进吧"; 03:41 UTC, school attempt 7). This batch closes the gaps that need no
// money, no deployment and nobody's hands: C16-1 the video prompt names the place's fixed things, keeps the clothing on
// screen, keeps the background clear of steam and keeps crowds out; C16-2 a gate check for a background swallowed by a
// large bright haze (hawker segment 2); C16-3 each seam is either a hard cut or one blended frame, not a two-frame ghost;
// C16-4 the private media can live in an S3-compatible object store (engineering only, not deployed); C16-6 the review
// is set beside the last review of another scene. Nothing here calls OpenAI, LTX or any paid service: the object store
// is an in-process stand-in on 127.0.0.1 and the real clips are files already on disk.
const ffmpeg = '/usr/bin/ffmpeg', ffprobe = '/usr/bin/ffprobe', python = '/usr/bin/python3';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const repo = fileURLToPath(new URL('../..', import.meta.url));
const script = join(repo, 'scripts', 'video-qa', 'face_checks.py');
const scratch = mkdtempSync(join(tmpdir(), 'les-c16-'));
const video = '/mnt/project-files/les-c15/video';
const a9 = [0, 1, 2].map(index => `${video}/hawker-ltx-2-3-pro-a9-seg${index}.mp4`);
const a7 = [0, 1, 2, 3].map(index => `${video}/school-ltx-2-3-pro-a7-seg${index}.mp4`);
const quality = () => import('../../lib/video-quality.ts');
const gateModule = () => import('../../lib/video-quality-gate.ts');
const byId = (checks, id) => checks.find(check => check.id === id);

// ---- C16-1: the prompt names the place, keeps the clothing visible, the background clear and crowds out ----

// The real attempt 9 scene (gpt-4.1 rewrite) and the real attempt 7 scene.
const hawkerScene = { setting: 'The chicken rice stall is bright and busy in a local hawker centre, with roasted chickens hanging at the front and customers lined up.', partnerGender: 'male', partnerLook: 'A man in his late forties, wearing an apron and a T-shirt with short hair, stands behind the stall counter.' };
const schoolScene = { setting: 'It is after school at the door of a bright primary school classroom, with children leaving in groups and parents waiting outside.', partnerGender: 'female', partnerLook: 'female, 30s, neat light blue blouse and black skirt' };
const lessonOf = scene => ({ scene, lines: [{ id: 'p1', role: 'partner', text: 'Hi, what would you like to order today?' }, { id: 'l1', role: 'learner', text: "I'd like one chicken rice, please." }] });
const timing = { lines: [{ lineId: 'p1', start: 0, end: 6.45 }, { lineId: 'l1', start: 6.45, end: 9.4 }], index: 1, count: 3 };

test('C16-1 / F6.4: the hawker prompt puts him behind a stall counter in a hawker centre hall, apron on in every frame', async () => {
  const { sceneVideoPrompt } = await import('../../lib/scene-video-prompt.ts');
  for (const prompt of [sceneVideoPrompt('我想在小贩中心点一份鸡饭', lessonOf(hawkerScene)), sceneVideoPrompt('我想在小贩中心点一份鸡饭', lessonOf(hawkerScene), timing)]) {
    expect(prompt).toMatch(/counter/i);
    expect(prompt).toMatch(/hawker centre hall/i);
    expect(prompt).toMatch(/apron[^.]*every frame/i);
    expect(prompt.length).toBeLessThanOrEqual(5000);
    // Earlier rules are still there.
    expect(prompt).toContain('No one else is in the frame');
    expect(prompt).toContain('steady eye-level shot, single shot');
  }
});

test('C16-1 / F12.1: every scene prompt keeps the background clear of steam, smoke and haze, and keeps crowds from the setting out of view', async () => {
  const { sceneVideoPrompt } = await import('../../lib/scene-video-prompt.ts');
  const hawker = sceneVideoPrompt('我想在小贩中心点一份鸡饭', lessonOf(hawkerScene), timing);
  const school = sceneVideoPrompt('放学接孩子', lessonOf(schoolScene), timing);
  for (const prompt of [hawker, school]) {
    expect(prompt).toMatch(/background stays clear/i);
    expect(prompt).toMatch(/no steam, smoke, mist, fog or haze/i);
    // The setting mentions customers / children and parents; they never become other people on screen.
    expect(prompt).toMatch(/(customers|queue|crowd|children|parents|people)[^.]*out of view/i);
  }
  // A setting without people gets the clear-background line but no crowd line.
  const quiet = sceneVideoPrompt('goal', lessonOf({ setting: 'A quiet clinic reception desk with a plant.', partnerGender: 'female', partnerLook: '40s, nurse uniform' }));
  expect(quiet).toMatch(/no steam, smoke, mist, fog or haze/i);
  expect(quiet).not.toMatch(/out of view/i);
  expect(quiet).toMatch(/uniform[^.]*every frame/i);
});

test('C16-1: the school prompt names school things and nothing from a hawker centre; a place not in the table adds no place line', async () => {
  const { sceneVideoPrompt } = await import('../../lib/scene-video-prompt.ts');
  const school = sceneVideoPrompt('放学接孩子', lessonOf(schoolScene), timing);
  expect(school).toMatch(/school/i);
  expect(school).not.toMatch(/hawker/i);
  expect(school).not.toMatch(/counter/i);
  // No clothing item from the list in her look: no "every frame" clothing sentence.
  expect(school).not.toMatch(/every frame/i);
  const park = sceneVideoPrompt('goal', lessonOf({ setting: 'A park bench under a tree on a sunny morning.', partnerGender: 'male', partnerLook: '60s, polo shirt' }));
  expect(park).not.toMatch(/hawker|counter|classroom/i);
  // An older script without a scene still sends the stored goal unchanged.
  expect(sceneVideoPrompt('plain goal', { lines: [] })).toBe('plain goal');
});

test('C16-1: the script request asks for two or three fixed visible things in the setting, and no crowds or steam', async () => {
  const { generateSceneScript } = await import('../../lib/generated-script.ts');
  let body;
  await generateSceneScript({ goal: 'synthetic chicken rice order' }, { enabled: true, apiKey: 'synthetic-only', fetch: async (_url, options) => { body = options.body; return Response.json({ id: 'x', status: 'failed' }); } }).catch(() => null);
  const system = JSON.parse(body).input.find(item => item.role === 'system').content;
  expect(system).toMatch(/(two or three|2 to 3|2-3) fixed visible (things|objects)/i);
  expect(system).toMatch(/no crowds?[^.]*steam|steam[^.]*crowd/i);
  expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(20_000);
});

// ---- C16-2: a background swallowed by a large bright haze ----

const measured = over => ({ status: 'measured', frames: 50, single_face: { ratio: 1, multi_ratio: 0, keyframes: [], multi_keyframes: [], face_height: 0.22 },
  learner_mouth: { ratio: 0.1, frames: 10, keyframes: [] }, background_specks: { frames: 50, baseline: 55, peak: 61, peak_t: 3, growth: 1.1 },
  learner_mouth_motion: { windows: 1, frames: 17, peak: 0.1, peak_t: 7 }, background_haze: { frames: 50, baseline: 0.08, peak: 0.1, peak_t: 2, increase: 0.02 }, ...over });
const windows = [{ start: 6, end: 9 }];

test('C16-2 thresholds: background haze may grow by at most 0.2 of the background (to be calibrated); the old checks are unchanged', async () => {
  const { QUALITY_THRESHOLDS, OPTIONAL_QUALITY_CHECK_IDS, QUALITY_CHECK_IDS } = await quality();
  expect(QUALITY_THRESHOLDS.maxBackgroundHazeIncrease).toBe(0.2);
  expect(OPTIONAL_QUALITY_CHECK_IDS).toEqual(['framing_drift', 'background_noise', 'learner_mouth_motion', 'background_haze']);
  expect(QUALITY_CHECK_IDS).toEqual(['cuts', 'single_face', 'learner_mouth', 'seam_ssim', 'black_freeze']);
  expect(QUALITY_THRESHOLDS).toMatchObject({ maxBackgroundSpeckGrowth: 3, maxLearnerMouthMotion: 0.2, maxLearnerMouthRatio: 0.35, minSeamSsim: 0.3, minSingleFaceRatio: 0.75, maxMultiFaceRatio: 0.1, maxFramingDrift: 0.35 });
  const source = readFileSync(join(repo, 'lib', 'video-quality.ts'), 'utf8');
  expect(source.slice(source.indexOf('C16-2'))).toContain('待标定');
});

test('C16-2 judge: haze growing past 0.2 fails with the moment it peaks; within 0.2 passes; unknown is not_checked', async () => {
  const { judgeFaceMeasurement } = await gateModule();
  const framing = { segmentIndex: 1, baseFaceHeight: 0.22 };
  const steam = byId(judgeFaceMeasurement(measured({ background_haze: { frames: 25, baseline: 0.043, peak: 0.568, peak_t: 2.4, increase: 0.5254 } }), windows, framing), 'background_haze');
  expect(steam).toMatchObject({ status: 'failed', value: 0.525, keyframes: [2.4] });
  expect(steam.reason).toMatch(/haze/);
  expect(byId(judgeFaceMeasurement(measured({ background_haze: { frames: 78, baseline: 0.073, peak: 0.125, peak_t: 9, increase: 0.0513 } }), windows, framing), 'background_haze')).toMatchObject({ status: 'passed', value: 0.051 });
  expect(byId(judgeFaceMeasurement(measured({ background_haze: { frames: 9, baseline: 0, peak: 0.2, peak_t: 1, increase: 0.2 } }), windows, framing), 'background_haze').status).toBe('passed');
  for (const over of [{ background_haze: undefined }, { background_haze: { frames: 0, increase: null } }, { background_haze: { frames: 4, increase: 'big' } }, { background_haze: { frames: 4, increase: -0.1 } }]) {
    expect(byId(judgeFaceMeasurement(measured(over), windows, framing), 'background_haze').status).toBe('not_checked');
  }
  expect(byId(judgeFaceMeasurement({ status: 'not_checked', reason: 'no model' }, windows, framing), 'background_haze').status).toBe('not_checked');
  // Without framing (older callers) nothing new appears.
  expect(judgeFaceMeasurement(measured({}), windows).map(check => check.id)).toEqual(['single_face', 'learner_mouth']);
});

test('C16-2 verdict: a failed haze check blocks the segment, an open one needs review, a passed one keeps it passed', async () => {
  const { combineQualityChecks, validQualityCheck } = await quality();
  const five = ['cuts', 'single_face', 'learner_mouth', 'seam_ssim', 'black_freeze'].map(id => ({ id, status: 'passed' }));
  expect(validQualityCheck({ id: 'background_haze', status: 'failed', value: 0.5, reason: 'haze', keyframes: [2.4] })).toBe(true);
  expect(combineQualityChecks([...five, { id: 'background_haze', status: 'passed', value: 0.05 }])).toBe('passed');
  expect(combineQualityChecks([...five, { id: 'background_haze', status: 'failed', value: 0.5 }])).toBe('quality_failed');
  expect(combineQualityChecks([...five, { id: 'background_haze', status: 'not_checked' }])).toBe('needs_review');
});

test('C16-2 gate: a script failure leaves the haze check not_checked next to the others', async () => {
  const { createFaceChecks } = await gateModule();
  const broken = await createFaceChecks({ python, script, execute: async () => { throw Object.assign(new Error('boom'), { code: 1 }); } })({ file: '/nonexistent.mp4', duration: 3, learnerWindows: [], segmentIndex: 1, baseFaceHeight: 0.25 });
  expect(byId(broken, 'background_haze')).toMatchObject({ status: 'not_checked' });
});

const runScript = args => JSON.parse(execFileSync(python, ['-I', script, ...args], { encoding: 'utf8', timeout: 300_000, cwd: tmpdir() }).trim().split('\n').pop());
function probe() {
  try {
    const out = JSON.parse(execFileSync(python, ['-I', script, '--probe'], { encoding: 'utf8', timeout: 60_000, cwd: tmpdir() }).trim().split('\n').pop());
    return out.status === 'ready' ? { ready: true } : { ready: false, reason: out.reason ?? 'not ready' };
  } catch (error) { return { ready: false, reason: `probe failed: ${error.message.slice(0, 200)}` }; }
}
const detector = probe();
function need(files = [], detect = true) {
  if (detect && !detector.ready) console.log(`[C16] face detector unavailable: ${detector.reason}`);
  test.skip(detect && !detector.ready, `face detector unavailable: ${detector.reason}`);
  const missing = files.filter(file => !existsSync(file));
  if (missing.length) console.log(`[C16] samples missing on this machine: ${missing.join(', ')}`);
  test.skip(missing.length > 0, 'C15-4 samples not on this machine');
}

test.describe('C16-2 measurement', () => {
  test.describe.configure({ timeout: 600_000 });

  test('the script reports background haze: a large white haze sliding over a busy background grows; a still background does not', async () => {
    need();
    const hazy = join(scratch, 'hazy.mp4'), still = join(scratch, 'still.mp4');
    // A busy, saturated background; from 1 s to 2.5 s a flat white sheet slides over the top half from the right.
    execFileSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=24:d=4', '-f', 'lavfi', '-i', 'color=c=white:s=360x320:r=24:d=4',
      '-filter_complex', "[0:v][1:v]overlay=x='360-min(360,max(0,(t-1))*240)':y=0:eval=frame", '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', hazy]);
    execFileSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=24:d=4', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', still]);
    const grown = runScript(['--video', hazy]).background_haze, calm = runScript(['--video', still]).background_haze;
    console.log(`[C16-2] synthetic haze ${JSON.stringify(grown)}; still ${JSON.stringify(calm)}`);
    for (const out of [grown, calm]) for (const key of ['baseline', 'peak', 'peak_t', 'increase']) expect(Number.isFinite(out[key])).toBe(true);
    expect(grown.increase).toBeGreaterThan(0.5);
    expect(grown.peak_t).toBeGreaterThanOrEqual(1.5);
    expect(calm.increase).toBeLessThan(0.05);
  });

  test('real clips: hawker attempt 9 segments 2 and 3 (steam) fail, segment 1 passes; all four school attempt 7 segments pass', async () => {
    need([...a9, ...a7]);
    const { createFaceChecks } = await gateModule();
    const faces = createFaceChecks({ python, script, timeoutMs: 300_000 });
    const hawker = [], school = [];
    for (const [index, file] of a9.entries()) hawker.push(byId(await faces({ file, duration: 20, learnerWindows: [], segmentIndex: index, baseFaceHeight: 0.2246 }), 'background_haze'));
    for (const [index, file] of a7.entries()) school.push(byId(await faces({ file, duration: 20, learnerWindows: [], segmentIndex: index, baseFaceHeight: 0.2262 }), 'background_haze'));
    console.log(`[C16-2] hawker a9 background_haze: ${JSON.stringify(hawker)}`);
    console.log(`[C16-2] school a7 background_haze: ${JSON.stringify(school)}`);
    expect(hawker.map(item => item.status)).toEqual(['passed', 'failed', 'failed']);
    expect(school.map(item => item.status)).toEqual(['passed', 'passed', 'passed', 'passed']);
    // The steam in segment 2 is already there in its first seconds after 19.35 s of the lesson.
    expect(hawker[1].keyframes[0]).toBeLessThanOrEqual(12.35);
  });
});

// ---- C16-3: each seam a hard cut or one blended frame ----

function segment(name, color, seconds = 1) {
  const file = join(scratch, `${name}.mp4`);
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=72x128:r=24:d=${seconds}`, '-f', 'lavfi', '-i', `sine=frequency=${color === 'black' ? 300 : 500}:sample_rate=48000:duration=${seconds}`,
    '-shortest', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', file]);
  const bytes = readFileSync(file);
  return { bytes, sha256: sha(bytes) };
}
const grayFrames = file => {
  const raw = execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-map', '0:v:0', '-vf', 'scale=72:128', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 64_000_000 });
  const size = 72 * 128, out = [];
  for (let i = 0; i + size <= raw.length; i += size) out.push(raw.subarray(i, i + size));
  return out;
};
const mean = frame => frame.reduce((sum, value) => sum + value, 0) / frame.length;
const written = bytes => { const file = join(mkdtempSync(join(scratch, 'out-')), 'v.mp4'); writeFileSync(file, bytes); return file; };
const pcm = file => sha(execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-map', '0:a:0', '-f', 's16le', '-ac', '1', '-ar', '48000', '-'], { maxBuffer: 64_000_000 }));
const probeDuration = file => Number(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim());

test('C16-3 seams: a cut seam switches in one frame, a short seam has exactly one blended frame; same length and sound', async () => {
  const { concatVideoBytes, SEAM_CROSSFADE_FRAMES, SEAM_SHORT_FRAMES } = await import('../../lib/concat-video-bytes.ts');
  expect(SEAM_CROSSFADE_FRAMES).toBe(3);
  expect(SEAM_SHORT_FRAMES).toBe(2);
  const inputs = [segment('c16-dark-a', 'black'), segment('c16-light', 'white'), segment('c16-dark-b', 'black')];
  const plain = written((await concatVideoBytes(inputs, { executable: ffmpeg, normalizeDuration: 3 })).bytes);
  const mixed = written((await concatVideoBytes(inputs, { executable: ffmpeg, normalizeDuration: 3, crossfadeAt: [1, 2], seamModes: ['cut', 'short'] })).bytes);
  const lumas = grayFrames(mixed).map(mean), base = grayFrames(plain).map(mean);
  expect(lumas).toHaveLength(72);
  expect(Math.abs(probeDuration(mixed) - 3)).toBeLessThanOrEqual(0.001001);
  const dark = base[0], light = base[30];
  expect(light - dark).toBeGreaterThan(150);
  // Cut at frame 24: the frame before is the old segment, the frame at the seam is the new one; nothing in between.
  for (let i = 0; i < 24; i++) expect(Math.abs(lumas[i] - dark)).toBeLessThan(2);
  for (let i = 24; i < 48; i++) expect(Math.abs(lumas[i] - light)).toBeLessThan(2);
  // Short at frame 48: exactly one frame in between (about halfway), then the new segment.
  expect(lumas[48]).toBeLessThan(light - 20);
  expect(lumas[48]).toBeGreaterThan(dark + 20);
  for (let i = 49; i < 72; i++) expect(Math.abs(lumas[i] - dark)).toBeLessThan(2);
  const between = lumas.filter(value => value > dark + 20 && value < light - 20);
  expect(between).toHaveLength(1);
  expect(pcm(mixed)).toBe(pcm(plain));
});

test('C16-3 seams: without seamModes every seam is the C15-4g three-frame fade, as before', async () => {
  const { concatVideoBytes } = await import('../../lib/concat-video-bytes.ts');
  const inputs = [segment('c16-old-dark', 'black'), segment('c16-old-light', 'white')];
  const lumas = grayFrames(written((await concatVideoBytes(inputs, { executable: ffmpeg, normalizeDuration: 2, crossfadeAt: [1] })).bytes)).map(mean);
  const all = grayFrames(written((await concatVideoBytes(inputs, { executable: ffmpeg, normalizeDuration: 2, crossfadeAt: [1], seamModes: ['fade'] })).bytes)).map(mean);
  expect(all.map(Math.round)).toEqual(lumas.map(Math.round));
  expect(lumas[25]).toBeGreaterThan(lumas[0] + 20);
  expect(lumas[26]).toBeGreaterThan(lumas[25] + 20);
});

test('C16-3 seams: seamModes must match the seams and use known modes; checked before ffmpeg runs', async () => {
  const { concatVideoBytes } = await import('../../lib/concat-video-bytes.ts');
  const fake = ['a', 'b', 'c'].map(text => { const bytes = Buffer.from(`segment ${text}`); return { bytes, sha256: sha(bytes) }; });
  let calls = 0;
  const execute = async () => { calls++; return { stdout: '', stderr: '' }; };
  for (const options of [
    { normalizeDuration: 30, seamModes: ['cut', 'cut'] }, // modes without seams
    { normalizeDuration: 30, crossfadeAt: [10, 20], seamModes: ['cut'] },
    { normalizeDuration: 30, crossfadeAt: [10, 20], seamModes: ['cut', 'dissolve'] },
    { normalizeDuration: 30, crossfadeAt: [10, 20], seamModes: 'cut' },
    { normalizeDuration: 30, crossfadeAt: [10, 20], seamModes: ['cut', null] },
  ]) await expect(concatVideoBytes(fake, { executable: ffmpeg, execute, ...options })).rejects.toThrow();
  expect(calls).toBe(0);
});

test('C16-3 seam choice: a seam whose gate SSIM is under 0.45 is cut; otherwise, or without a measurement, one blended frame', async () => {
  const { seamModesFor, SEAM_TRANSITION } = await quality();
  expect(SEAM_TRANSITION.cutBelowSsim).toBe(0.45);
  const record = (segmentIndex, sha256, value) => ({ segmentIndex, sha256, mode: 'ffmpeg', verdict: 'passed', checkedAt: 1, checks: [{ id: 'seam_ssim', status: 'passed', ...(value === undefined ? {} : { value }) }] });
  const task = {
    videoAssets: [0, 1, 2, 3].map(i => ({ segmentIndex: i, sha256: String(i).repeat(64) })),
    // Attempt 9 seams 0.405 / 0.498; a third seam measured on older bytes only (a redo), so it counts as unmeasured.
    videoQuality: [record(0, '0'.repeat(64)), record(1, '1'.repeat(64), 0.405), record(2, '2'.repeat(64), 0.498), record(3, 'f'.repeat(64), 0.2)],
  };
  expect(seamModesFor(task)).toEqual(['cut', 'short', 'short']);
  expect(seamModesFor({ videoAssets: task.videoAssets })).toEqual(['short', 'short', 'short']);
  expect(seamModesFor({ videoAssets: task.videoAssets.slice(0, 1) })).toEqual([]);
});

const secret = 'offline-c16-session-secret-at-least-32-characters';
const now = Date.UTC(2026, 9, 24);
const translations = Object.fromEntries(['zh-Hans', 'id', 'ja', 'ko', 'hi'].map(k => [k, 'synthetic']));
const lines = Array.from({ length: 4 }, (_, i) => ({ id: 'line' + i, role: i % 2 ? 'learner' : 'partner', text: i % 2 ? 'Hi ' + 'okay '.repeat(15).trim() : 'Hello ' + 'friend '.repeat(46).trim(), translations }));
const lessonScript = { scene: { setting: 'A hawker centre chicken rice stall.', partnerGender: 'male', partnerLook: '40s, apron' }, lines,
  phrases: [{ id: 'phrase', text: 'Hello', lineId: 'line0', translations }], turns: [{ partnerLineId: 'line0', learnerLineId: 'line1' }, { partnerLineId: 'line2', learnerLineId: 'line3' }] };
const wav = Buffer.alloc(240044);
wav.write('RIFF'); wav.writeUInt32LE(240036, 4); wav.write('WAVE', 8); wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(240000, 40);
for (let i = 44; i < wav.length; i += 2) wav.writeInt16LE(Math.round(8000 * Math.sin(i / 20)), i);
const delta = 0.04, aac = Buffer.from('synthetic AAC'), final = Buffer.from('synthetic final video');
const frameAt = time => Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from(`synthetic frame at ${time}`)]);
const requirement = { revision: 1, content: { description: '小贩中心点鸡饭', language: 'zh-Hans', keywords: { location: '', learnerRole: '', partnerRole: '', topic: '', goal: '', special: '' } } };

test('C16-3 store: the assembly gets one seam mode per seam, chosen from each later segment\'s seam SSIM', async () => {
  const { createGenerationTaskStore } = await import('../../lib/generation-tasks.ts');
  const { createPrivateMediaStore } = await import('../../lib/private-media-store.ts');
  const { validateFinalVideoProbe } = await import('../../lib/final-video-probe.ts');
  const { createGenerationRunner } = await import('../../lib/generation-runner.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-c16-store-'));
  const concats = [], ssims = [undefined, 0.405, 0.62, 0.3];
  let jobs = 0, renders = 0;
  const five = index => [{ id: 'cuts', status: 'passed', value: 0 }, { id: 'single_face', status: 'passed', value: 1 }, { id: 'learner_mouth', status: 'passed', value: 0 },
    index === 0 ? { id: 'seam_ssim', status: 'passed', reason: 'first segment, no seam' } : { id: 'seam_ssim', status: 'passed', value: ssims[index] }, { id: 'black_freeze', status: 'passed', value: 0 }];
  const store = createGenerationTaskStore({
    directory, sessionSecret: secret, simulation: false, maxReservedMicros: 100_000, liveBudget: { scope: 'c16-offline', priorSpentMicros: 0 },
    mediaStore: createPrivateMediaStore({ directory: join(directory, 'media'), sessionSecret: secret }),
    scriptProvider: { reservedMicros: 100, generate: async () => ({ requestId: 'synthetic', script: lessonScript }) },
    audioProvider: { reservedMicros: 100, generate: async line => ({ lineId: line.id, role: line.role, bytes: wav, sha256: sha(wav), duration: 15 }) },
    audioEncoder: async input => ({ bytes: aac, sha256: sha(aac), sourceSha256: input.sha256, sourceDuration: 15, duration: 15 + delta, mimeType: 'audio/mp4', decoded: true }),
    encodedVideoProvider: { reservedMicros: 1000, submit: async () => ({ status: 'pending', jobId: 'job' + ++jobs }), query: async id => ({ jobId: id, status: 'completed', videoUrl: `https://media.example.invalid/${id}.mp4` }) },
    videoDownload: async () => { const bytes = Buffer.from(`synthetic segment render ${++renders}`); return { bytes, sha256: sha(bytes) }; },
    videoProbe: async input => ({ sha256: input.sha256, duration: input.expectedDuration + delta, width: 720, height: 1280, fps: 24, videoCodec: 'h264', audioCodec: 'aac' }),
    videoRepair: async input => { const bytes = Buffer.concat([Buffer.from(input.video.bytes), Buffer.from('+full audio')]); return { bytes, sha256: sha(bytes), sourceVideoSha256: input.video.sha256, sourceAudioSha256: input.audio.sha256, decoded: true, duration: 15, width: 720, height: 1280, fps: 24, videoCodec: 'h264', audioCodec: 'aac', targetDuration: 15, padSeconds: 0, padFrames: 0, replaceWithSourceAudio: true }; },
    referenceExtractor: async input => { const bytes = frameAt(input.timeSeconds); return { bytes, sha256: sha(bytes), sourceVideoSha256: input.sha256, timeSeconds: input.timeSeconds, mimeType: 'image/png', width: 720, height: 1280, decoded: true }; },
    videoQualityGate: async input => ({ sha256: input.video.sha256, mode: 'ffmpeg', checks: five(input.segmentIndex) }),
    videoConcat: async (inputs, duration, seams, modes) => { concats.push({ count: inputs.length, duration, seams, modes }); return { bytes: final, sha256: sha(final) }; },
    finalVideoVerify: async input => ({ ...validateFinalVideoProbe({ format: { format_name: 'mp4', start_time: 0, duration: 60 }, streams: [{ codec_type: 'video', codec_name: 'h264', width: 720, height: 1280, avg_frame_rate: '24/1', duration: 60, start_time: 0, disposition: { attached_pic: 0 } }, { codec_type: 'audio', codec_name: 'aac', profile: 'LC', sample_rate: 8000, channels: 1, duration: 60, start_time: 0 }] }, input.plan), sha256: sha(final), decoded: true }),
  });
  const cookie = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'c16-owner', email: 'c16@example.invalid' }, secret, now);
  const task = await store.create({ cookie, now, goal: requirement.content.description, revision: 1, requestKey: 'k', requirement });
  const input = { cookie, now: now + 1, id: task.id };
  const runner = createGenerationRunner({ store, audioReview: async () => true, wait: async () => {}, maxPolls: 3 });
  expect((await runner.advance(input)).stopped).toBe('ready');
  const saved = await store.get(input);
  expect(concats).toHaveLength(1);
  expect(concats[0].count).toBe(4);
  expect(concats[0].seams).toEqual(saved.videoTimeline.segments.slice(1).map(item => item.start));
  expect(concats[0].modes).toEqual(['cut', 'short', 'cut']);
});

test('C16-3 runtime: the live runtime hands the seam modes to the assembly', async () => {
  const runtime = readFileSync(join(repo, 'lib', 'live-generation-runtime.ts'), 'utf8');
  expect(runtime).toMatch(/seamModes: modes/);
  expect(readFileSync(join(repo, 'lib', 'concat-video-bytes.ts'), 'utf8')).toContain('C16-3');
});

// ---- C16-4: private media in an S3-compatible object store (in-process stand-in; nothing deployed) ----

const AWS = { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' };
const emptySha = sha('');

test('C16-4 SigV4: the signer reproduces the AWS documentation examples (GET object with a range, list objects)', async () => {
  const { signS3Request } = await import('../../lib/object-media-store.ts');
  const date = new Date('2013-05-24T00:00:00Z');
  const get = signS3Request({ method: 'GET', url: 'https://examplebucket.s3.amazonaws.com/test.txt', headers: { range: 'bytes=0-9' }, payloadSha256: emptySha, region: 'us-east-1', ...AWS, date });
  expect(get.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\/20130524\/us-east-1\/s3\/aws4_request, ?SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ?Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41$/);
  expect(get['x-amz-date']).toBe('20130524T000000Z');
  expect(get['x-amz-content-sha256']).toBe(emptySha);
  const list = signS3Request({ method: 'GET', url: 'https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J', headers: {}, payloadSha256: emptySha, region: 'us-east-1', ...AWS, date });
  expect(list.authorization).toContain('Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7');
});

// An independent SigV4 check, written here from the AWS documentation, not taken from the product code.
function expectedSignature(req, body, secretKey) {
  const auth = req.headers.authorization ?? '';
  const match = /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/s3\/aws4_request, ?SignedHeaders=([^,]+), ?Signature=([0-9a-f]{64})$/.exec(auth);
  if (!match) return { ok: false, why: 'malformed authorization' };
  const [, , day, region, signed, signature] = match;
  const url = new URL(req.url, 'http://placeholder');
  const enc = value => encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const query = [...url.searchParams].map(([k, v]) => [enc(k), enc(v)]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('&');
  const names = signed.split(';');
  const canonical = [req.method, url.pathname, query, ...names.map(name => `${name}:${String(req.headers[name] ?? '').trim()}`), '', signed, req.headers['x-amz-content-sha256']].join('\n');
  if (req.headers['x-amz-content-sha256'] !== sha(body)) return { ok: false, why: 'payload hash' };
  const scope = `${day}/${region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', req.headers['x-amz-date'], scope, sha(canonical)].join('\n');
  const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
  const key = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, day), region), 's3'), 'aws4_request');
  return { ok: createHmac('sha256', key).update(toSign).digest('hex') === signature && names.includes('host') && names.includes('x-amz-date'), why: 'signature' };
}

async function s3Stub({ bucket = 'les-media', secretKey = AWS.secretAccessKey } = {}) {
  const objects = new Map(), log = [];
  const state = { objects, log, fail: false, bad: 0 };
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks), url = new URL(req.url, 'http://placeholder');
      const check = expectedSignature(req, body, secretKey);
      log.push({ method: req.method, path: url.pathname, query: url.search, ifNoneMatch: req.headers['if-none-match'] ?? null, signed: check.ok });
      if (!check.ok) { state.bad++; res.writeHead(403); return res.end('<Error><Code>SignatureDoesNotMatch</Code></Error>'); }
      if (state.fail) { res.writeHead(500); return res.end('<Error><Code>InternalError</Code></Error>'); }
      const prefix = `/${bucket}`;
      if (!url.pathname.startsWith(prefix)) { res.writeHead(404); return res.end('<Error><Code>NoSuchBucket</Code></Error>'); }
      const key = decodeURIComponent(url.pathname.slice(prefix.length + 1));
      if (req.method === 'GET' && !key && url.searchParams.get('list-type') === '2') {
        const wanted = url.searchParams.get('prefix') ?? '';
        const keys = [...objects.keys()].filter(item => item.startsWith(wanted)).sort();
        res.writeHead(200, { 'content-type': 'application/xml' });
        return res.end(`<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${bucket}</Name><Prefix>${wanted}</Prefix><KeyCount>${keys.length}</KeyCount><IsTruncated>false</IsTruncated>${keys.map(item => `<Contents><Key>${item}</Key><Size>${objects.get(item).length}</Size></Contents>`).join('')}</ListBucketResult>`);
      }
      if (req.method === 'PUT') {
        if (req.headers['if-none-match'] === '*' && objects.has(key)) { res.writeHead(412); return res.end('<Error><Code>PreconditionFailed</Code></Error>'); }
        objects.set(key, body); res.writeHead(200); return res.end();
      }
      if (req.method === 'GET') {
        if (!objects.has(key)) { res.writeHead(404); return res.end('<Error><Code>NoSuchKey</Code></Error>'); }
        res.writeHead(200); return res.end(objects.get(key));
      }
      if (req.method === 'DELETE') { objects.delete(key); res.writeHead(204); return res.end(); }
      res.writeHead(405); res.end();
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  state.endpoint = `http://127.0.0.1:${server.address().port}`;
  state.close = () => new Promise(resolve => server.close(resolve));
  return state;
}

const identity = subject => ({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: subject, email: 'synthetic@example.invalid' });
async function sessions() {
  return { a: { cookie: await sealGoogleSession(identity('c16-media-a'), secret, now), now }, b: { cookie: await sealGoogleSession(identity('c16-media-b'), secret, now), now } };
}

// The same contract for the local store and the object store.
async function mediaContract(store) {
  const { a, b } = await sessions();
  const bytes = Buffer.from('c16 synthetic media bytes'), other = Buffer.from('c16 other bytes');
  const at = { courseId: 'course-one', revision: 1, assetId: 'final-1' };
  expect(await store.put({ ...a, ...at, bytes, sha256: sha(bytes) })).toEqual({ ...at, sha256: sha(bytes), size: bytes.length });
  const got = await store.get({ ...a, ...at });
  expect(Buffer.from(got.bytes).equals(bytes)).toBe(true);
  expect(got).toMatchObject({ ...at, sha256: sha(bytes), size: bytes.length });
  // Another account sees nothing at the same locator.
  expect(await store.get({ ...b, ...at })).toBeNull();
  // Wrong hash, replacement with other bytes, bad locators and no session are refused; the same bytes again are fine.
  await expect(store.put({ ...a, courseId: 'course-one', revision: 1, assetId: 'x', bytes, sha256: sha(other) })).rejects.toThrow('Invalid asset bytes');
  await expect(store.put({ ...a, ...at, bytes: other, sha256: sha(other) })).rejects.toThrow('Asset replacement prohibited');
  expect(await store.put({ ...a, ...at, bytes, sha256: sha(bytes) })).toEqual({ ...at, sha256: sha(bytes), size: bytes.length });
  await expect(store.get({ ...a, courseId: '../x', revision: 1, assetId: 'a' })).rejects.toThrow('Invalid asset locator');
  await expect(store.get({ ...a, courseId: 'c', revision: 0, assetId: 'a' })).rejects.toThrow('Invalid asset locator');
  await expect(store.get({ cookie: null, now, ...at })).rejects.toThrow('Authenticated session required');
  // A second course shares the bytes; deleting the first keeps them for the second.
  const second = { courseId: 'course-two', revision: 3, assetId: 'final-3' };
  await store.put({ ...a, ...second, bytes, sha256: sha(bytes) });
  await store.put({ ...b, ...at, bytes: other, sha256: sha(other) });
  await store.removeCourse({ ...a, courseId: 'course-one' });
  expect(await store.get({ ...a, ...at })).toBeNull();
  expect(Buffer.from((await store.get({ ...a, ...second })).bytes).equals(bytes)).toBe(true);
  // Delete everything of one account; the other account keeps its media.
  await store.removeAll(a);
  expect(await store.get({ ...a, ...second })).toBeNull();
  expect(Buffer.from((await store.get({ ...b, ...at })).bytes).equals(other)).toBe(true);
}

test('C16-4 contract: the local private media store keeps the shared contract (reference)', async () => {
  const { createPrivateMediaStore } = await import('../../lib/private-media-store.ts');
  await mediaContract(createPrivateMediaStore({ directory: await mkdtemp(join(tmpdir(), 'les-c16-local-')), sessionSecret: secret }));
});

test('C16-4 contract: the object store keeps the same contract; every request is signed and writes never overwrite', async () => {
  const { createObjectMediaStore } = await import('../../lib/object-media-store.ts');
  const stub = await s3Stub();
  try {
    await mediaContract(createObjectMediaStore({ endpoint: stub.endpoint, bucket: 'les-media', region: 'ap-southeast-1', ...AWS, sessionSecret: secret }));
    expect(stub.log.length).toBeGreaterThan(10);
    expect(stub.bad).toBe(0);
    expect(stub.log.every(entry => entry.signed)).toBe(true);
    const puts = stub.log.filter(entry => entry.method === 'PUT');
    expect(puts.length).toBeGreaterThan(0);
    expect(puts.every(entry => entry.ifNoneMatch === '*')).toBe(true);
    // Keys sit under one folder per account hash; no cookie, owner id or course text in them.
    for (const key of stub.objects.keys()) expect(key).toMatch(/^les-media\/[0-9a-f]{64}\/[0-9a-f]{64}\.(json|bin)$/);
  } finally { await stub.close(); }
});

test('C16-4 object store: tampered bytes are refused; provider errors never carry the keys; invalid input sends nothing', async () => {
  const { createObjectMediaStore } = await import('../../lib/object-media-store.ts');
  const stub = await s3Stub();
  try {
    const store = createObjectMediaStore({ endpoint: stub.endpoint, bucket: 'les-media', region: 'ap-southeast-1', ...AWS, sessionSecret: secret });
    const { a } = await sessions();
    const bytes = Buffer.from('c16 tamper test');
    const at = { courseId: 'course-t', revision: 1, assetId: 'final-t' };
    await store.put({ ...a, ...at, bytes, sha256: sha(bytes) });
    const bin = [...stub.objects.keys()].find(key => key.endsWith('.bin'));
    stub.objects.set(bin, Buffer.from('c16 tamper TEST'));
    await expect(store.get({ ...a, ...at })).rejects.toThrow('Asset integrity failed');
    const before = stub.log.length;
    await expect(store.get({ ...a, courseId: 'bad id!', revision: 1, assetId: 'x' })).rejects.toThrow('Invalid asset locator');
    await expect(store.put({ cookie: 'forged', now, ...at, bytes, sha256: sha(bytes) })).rejects.toThrow('Authenticated session required');
    expect(stub.log.length).toBe(before);
    stub.fail = true;
    const error = await store.put({ ...a, courseId: 'course-u', revision: 1, assetId: 'final-u', bytes, sha256: sha(bytes) }).then(() => null, value => value);
    expect(error).toBeInstanceOf(Error);
    for (const text of [AWS.secretAccessKey, AWS.accessKeyId, 'Signature=', 'authorization']) expect(`${error.message} ${error.stack ?? ''}`).not.toContain(text);
  } finally { await stub.close(); }
});

test('C16-4 object store: the endpoint must be https, except a loopback address; bucket and region are checked', async () => {
  const { createObjectMediaStore } = await import('../../lib/object-media-store.ts');
  const ok = { bucket: 'les-media', region: 'ap-southeast-1', ...AWS, sessionSecret: secret };
  expect(() => createObjectMediaStore({ ...ok, endpoint: 'https://s3.ap-southeast-1.amazonaws.com' })).not.toThrow();
  expect(() => createObjectMediaStore({ ...ok, endpoint: 'http://127.0.0.1:9000' })).not.toThrow();
  for (const endpoint of ['http://s3.example.com', 'ftp://127.0.0.1', 'https://user:pass@s3.example.com', 'not a url', '']) expect(() => createObjectMediaStore({ ...ok, endpoint })).toThrow();
  for (const bad of [{ bucket: 'Bad_Bucket' }, { bucket: '' }, { region: '' }, { region: 'ap southeast' }, { accessKeyId: '' }, { secretAccessKey: '' }, { sessionSecret: '' }]) expect(() => createObjectMediaStore({ ...ok, endpoint: 'https://s3.example.com', ...bad })).toThrow();
});

test('C16-4 config: without LES_MEDIA_STORE the local store is used; "object" needs every variable and names only the missing ones', async () => {
  const { createMediaStore, mediaStoreKind } = await import('../../lib/media-store-config.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-c16-config-'));
  expect(mediaStoreKind({})).toBe('local');
  expect(mediaStoreKind({ LES_MEDIA_STORE: 'local' })).toBe('local');
  const local = createMediaStore({ directory, sessionSecret: secret, env: {} });
  await mediaContract(local);
  const full = { LES_MEDIA_STORE: 'object', LES_MEDIA_S3_ENDPOINT: 'https://s3.example.com', LES_MEDIA_S3_BUCKET: 'les-media', LES_MEDIA_S3_REGION: 'ap-southeast-1', LES_MEDIA_S3_ACCESS_KEY_ID: AWS.accessKeyId, LES_MEDIA_S3_SECRET_ACCESS_KEY: AWS.secretAccessKey };
  expect(mediaStoreKind(full)).toBe('object');
  expect(() => createMediaStore({ directory, sessionSecret: secret, env: full })).not.toThrow();
  for (const name of ['LES_MEDIA_S3_ENDPOINT', 'LES_MEDIA_S3_BUCKET', 'LES_MEDIA_S3_REGION', 'LES_MEDIA_S3_ACCESS_KEY_ID', 'LES_MEDIA_S3_SECRET_ACCESS_KEY']) {
    const { [name]: _, ...partial } = full;
    let message = '';
    try { createMediaStore({ directory, sessionSecret: secret, env: partial }); } catch (error) { message = error.message; }
    expect(message).toContain(name);
    expect(message).not.toContain(AWS.secretAccessKey);
    expect(message).not.toContain(AWS.accessKeyId);
  }
  expect(() => createMediaStore({ directory, sessionSecret: secret, env: { LES_MEDIA_STORE: 's3-ish' } })).toThrow();
  // Through the selector the object store keeps the contract too.
  const stub = await s3Stub();
  try { await mediaContract(createMediaStore({ directory, sessionSecret: secret, env: { ...full, LES_MEDIA_S3_ENDPOINT: stub.endpoint } })); }
  finally { await stub.close(); }
});

test('C16-4 wiring: every place that built the local media store goes through the selector now', async () => {
  for (const file of ['local-course-store.ts', 'live-scene-runner.ts', 'live-generation-runtime.ts', 'my-data.ts']) {
    const source = readFileSync(join(repo, 'lib', file), 'utf8');
    expect(source, file).toContain('createMediaStore(');
    expect(source, file).not.toContain('createPrivateMediaStore(');
  }
  const store = readFileSync(join(repo, 'lib', 'object-media-store.ts'), 'utf8');
  expect(store).not.toMatch(/console\.(log|info|warn|error)/);
  expect(readFileSync(join(repo, 'package.json'), 'utf8')).not.toMatch(/aws-sdk|@aws-sdk|minio/);
});

// ---- C16-6: the review beside the last review of another scene ----

test('C16-6 / F10.4: a review comes back with the latest review of another of my courses; none for a first practice or only the same course', async () => {
  const f = await dataFixture();
  const { createPracticeReviewStore } = await import('../../lib/practice-reviews.ts');
  const store = createPracticeReviewStore({ directory: f.directory, sessionSecret: f.options.sessionSecret, getCourse: async () => ({ turns: [{}, {}] }) });
  const hotel = await f.generated(f.a, '我想在酒店办理入住，确认预订。', 100_000);
  const clinic = await f.generated(f.a, '我想在诊所改约时间。', 100_000);
  const theirs = await f.generated(f.b, '我想在超市问价格。', 100_000);
  const help = { hints: 1, autoHelp: 0, translations: 0, native: 0 };
  const save = (session, pointer, id, outcomes, at = now) => store.save({ ...session, now: at, course: pointer, session: id, turns: outcomes.map((outcome, turnIndex) => ({ turnIndex, outcome })), help });
  const first = await save(f.a, hotel.pointer, 'session-hotel-1', ['independent', 'after_hint'], f.a.now);
  expect(first.previous).toBeNull();
  expect(first).not.toHaveProperty('otherScene');
  const again = await save(f.a, hotel.pointer, 'session-hotel-2', ['independent', 'independent'], f.a.now + 1000);
  expect(again.previous).toMatchObject({ session: 'session-hotel-1' });
  expect(again).not.toHaveProperty('otherScene');
  const clinicReview = await save(f.a, clinic.pointer, 'session-clinic-1', ['needs_help', 'unobserved'], f.a.now + 2000);
  expect(clinicReview.previous).toBeNull();
  expect(clinicReview.otherScene).toMatchObject({ session: 'session-hotel-2', turns: [{ turnIndex: 0, outcome: 'independent' }, { turnIndex: 1, outcome: 'independent' }], help });
  expect(Object.keys(clinicReview.otherScene).sort()).toEqual(['at', 'help', 'session', 'turns']);
  // Another account never sees mine.
  const theirsReview = await save(f.b, theirs.pointer, 'session-theirs-1', ['independent'], f.b.now + 3000);
  expect(theirsReview).not.toHaveProperty('otherScene');
  // After deleting the hotel scene, the clinic has no other scene to compare with; after deleting everything, nothing.
  const { createMyDataStore } = await import('../../lib/my-data.ts');
  const data = createMyDataStore(f.options);
  await data.deleteScene({ ...f.a, ...hotel.pointer });
  expect(await save(f.a, clinic.pointer, 'session-clinic-2', ['independent', 'independent'], f.a.now + 4000)).not.toHaveProperty('otherScene');
  await data.deleteAll(f.a);
  expect(await save(f.a, hotel.pointer, 'session-hotel-3', ['independent', 'independent'], f.a.now + 5000)).not.toHaveProperty('otherScene');
});

// ---- C16-7: the "start at entry level" line is in all five languages, with no level or score ----

test('C16-7 / F2.3: the confirm card says the lesson starts at entry level in all five languages, without a level name or score', async () => {
  const { sceneConfirmCopy } = await import('../../app/scene-confirm-copy.ts');
  expect(Object.keys(sceneConfirmCopy).sort()).toEqual(['hi', 'id', 'ja', 'ko', 'zh-Hans']);
  expect(sceneConfirmCopy['zh-Hans'].level).toBe('暂按入门程度：短句，可以放慢。');
  for (const [language, copy] of Object.entries(sceneConfirmCopy)) {
    expect(typeof copy.level, language).toBe('string');
    expect(copy.level.length, language).toBeGreaterThan(5);
    expect(copy.level, language).not.toMatch(/\d|%|CEFR|A1|A2|分数|等级/);
  }
});

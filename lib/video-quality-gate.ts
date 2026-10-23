import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { QUALITY_THRESHOLDS, FACE_CHECK_PENDING, FACE_DETECTION, type QualityCheck, type QualityReport } from './video-quality';

export { QUALITY_THRESHOLDS, MAX_SEGMENT_REDOS, FACE_CHECK_PENDING, FACE_DETECTION, QUALITY_CHECK_IDS, combineQualityChecks, qualityVerdict, validQualityCheck, taskQuality } from './video-quality';

type Media = { bytes: Uint8Array; sha256: string };
export type QualityGateInput = { segmentIndex: number; video: Media; previous?: Media; learnerWindows: { start: number; end: number }[] };
export type QualityGate = (input: QualityGateInput) => Promise<QualityReport>;
// Pluggable face checks (single face share, partner mouth movement while the learner speaks). They receive a local
// file and return the two checks; createFaceChecks runs the C14-4 script, and without it they must say not_checked.
export type FaceChecks = (input: { file: string; duration: number; learnerWindows: { start: number; end: number }[] }) => Promise<QualityCheck[]>;
type Execute = (file: string, args: string[], options: { timeout: number; maxBuffer: number; encoding: 'utf8'; cwd?: string; env?: Record<string, string> }) => Promise<{ stdout: string; stderr: string }>;
const run = promisify(execFile) as unknown as Execute;
const round = (value: number) => Math.round(value * 1000) / 1000;

export const notCheckedFaces: FaceChecks = async () => [
  { id: 'single_face', status: 'not_checked', reason: FACE_CHECK_PENDING },
  { id: 'learner_mouth', status: 'not_checked', reason: FACE_CHECK_PENDING },
];

type Window = { start: number; end: number };
const keyframeList = (value: unknown) => Array.isArray(value) && value.length <= 20 && value.every(time => typeof time === 'number' && Number.isFinite(time) && time >= 0) ? value as number[] : undefined;
const ratio = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : undefined;
const open = (reason: string): QualityCheck[] => [
  { id: 'single_face', status: 'not_checked', reason: reason.slice(0, 300) },
  { id: 'learner_mouth', status: 'not_checked', reason: reason.slice(0, 300) },
];

// C14-4: turn the script's measurements into the two checks. The script only measures; the thresholds live here.
// Anything that is not a well-formed measurement is not_checked, never passed.
export function judgeFaceMeasurement(raw: unknown, learnerWindows: Window[]): QualityCheck[] {
  const result = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, any> : {};
  if (result.status !== 'measured') return open(`人脸检测没有完成：${typeof result.reason === 'string' ? result.reason : 'no measurement'}`);
  const t = QUALITY_THRESHOLDS, checks: QualityCheck[] = [];
  const face = result.single_face, faceRatio = ratio(face?.ratio), faceKeys = keyframeList(face?.keyframes);
  // C15-4a: the share of frames with two or more faces is judged separately; without it the check is not_checked.
  const multiRatio = ratio(face?.multi_ratio), multiKeys = keyframeList(face?.multi_keyframes ?? []);
  if (!Number.isSafeInteger(result.frames) || result.frames <= 0 || faceRatio === undefined || !faceKeys || multiRatio === undefined || !multiKeys) checks.push(open('人脸检测结果不完整')[0]);
  else if (multiRatio > t.maxMultiFaceRatio) checks.push({ id: 'single_face', status: 'failed', value: faceRatio, reason: 'more than one face on screen in too many frames', keyframes: multiKeys });
  else checks.push({ id: 'single_face', status: faceRatio >= t.minSingleFaceRatio ? 'passed' : 'failed', value: faceRatio,
    ...(faceRatio >= t.minSingleFaceRatio ? {} : { reason: 'not exactly one face on screen in too many frames', keyframes: faceKeys }) });
  const mouth = result.learner_mouth;
  if (!learnerWindows.length) checks.push({ id: 'learner_mouth', status: 'passed', value: 0, reason: 'no learner line in this segment' });
  else if (mouth?.ratio === null && mouth?.frames === 0) checks.push({ id: 'learner_mouth', status: 'not_checked', reason: 'partner face not found during learner lines' });
  else {
    const mouthRatio = ratio(mouth?.ratio), mouthKeys = keyframeList(mouth?.keyframes);
    if (mouthRatio === undefined || !mouthKeys || !Number.isSafeInteger(mouth?.frames) || mouth.frames <= 0) checks.push(open('人脸检测结果不完整')[1]);
    else checks.push({ id: 'learner_mouth', status: mouthRatio <= t.maxLearnerMouthRatio ? 'passed' : 'failed', value: mouthRatio,
      ...(mouthRatio <= t.maxLearnerMouthRatio ? {} : { reason: 'partner mouth moves while the learner speaks', keyframes: mouthKeys }) });
  }
  return checks;
}

export const FACE_SCRIPT = join(process.cwd(), 'scripts', 'video-qa', 'face_checks.py');

// C14-4: the face checks as a child process: python3 -I scripts/video-qa/face_checks.py, with a timeout, a small
// output limit and an environment without any keys. A missing Python, missing library or model, a crash, a timeout
// or unreadable output all give not_checked.
export function createFaceChecks(options: { python: string; script?: string; modelDir?: string; timeoutMs?: number; execute?: Execute }): FaceChecks {
  const script = options?.script ?? FACE_SCRIPT;
  if (!options || [options.python, script, ...(options.modelDir !== undefined ? [options.modelDir] : [])].some(path => typeof path !== 'string' || !isAbsolute(path) || path.includes('\0'))) throw new Error('Invalid face check configuration');
  const timeout = options.timeoutMs ?? FACE_DETECTION.timeoutMs;
  if (!Number.isSafeInteger(timeout) || timeout <= 0) throw new Error('Invalid face check configuration');
  const execute = options.execute ?? run, d = FACE_DETECTION;
  return async input => {
    const windows = Array.isArray(input?.learnerWindows) ? input.learnerWindows.filter(item => Number.isFinite(item?.start) && Number.isFinite(item?.end)).map(item => ({ start: item.start, end: item.end })) : [];
    const args = ['-I', script, '--video', input.file, '--learner-windows', JSON.stringify(windows), '--fps', String(d.sampleFps),
      '--min-face-height', String(d.minFaceHeight), '--mouth-delta', String(d.mouthMoveDelta), ...(options.modelDir ? ['--model-dir', options.modelDir] : [])];
    let stdout: string;
    try {
      ({ stdout } = await execute(options.python, args, { timeout, maxBuffer: 1_000_000, encoding: 'utf8', cwd: tmpdir(), env: { PATH: '/usr/bin:/bin', HOME: homedir(), LANG: 'C.UTF-8' } }));
    } catch (error) {
      const killed = !!error && typeof error === 'object' && ((error as { killed?: boolean }).killed || (error as { code?: unknown }).code === 'ETIMEDOUT');
      return open(killed ? '人脸检测超时' : '人脸检测脚本无法运行');
    }
    let parsed: unknown;
    try { parsed = JSON.parse(stdout.trim().split('\n').pop() ?? ''); } catch { return open('人脸检测输出无法读取'); }
    return judgeFaceMeasurement(parsed, windows);
  };
}

// Event intervals from ffmpeg's blackdetect / freezedetect log lines; an interval still open at the end runs to the end.
function intervals(log: string, kind: 'black' | 'freeze', duration: number) {
  const found: { start: number; duration: number }[] = [];
  if (kind === 'black') {
    for (const match of log.matchAll(/black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)\s+black_duration:\s*([\d.]+)/g)) found.push({ start: Number(match[1]), duration: Number(match[3]) });
    return found;
  }
  let open: number | null = null;
  for (const match of log.matchAll(/lavfi\.freezedetect\.freeze_(start|duration|end):\s*([\d.]+)/g)) {
    const value = Number(match[2]);
    if (match[1] === 'start') open = value;
    else if (match[1] === 'duration' && open !== null) { found.push({ start: open, duration: value }); open = null; }
  }
  if (open !== null) found.push({ start: open, duration: Math.max(0, duration - open) });
  return found;
}

// C14-1: local ffmpeg/ffprobe checks of one generated segment (no model, no network, no new dependency).
export function createVideoQualityGate(options: { ffmpeg: string; ffprobe: string; faces?: FaceChecks; execute?: Execute }): QualityGate {
  if (!options || [options.ffmpeg, options.ffprobe].some(path => typeof path !== 'string' || !isAbsolute(path) || path.includes('\0'))) throw new Error('Invalid quality gate configuration');
  const execute = options.execute ?? run, faces = options.faces ?? notCheckedFaces;
  const tool = (file: string, args: string[]) => execute(file, args, { timeout: 120_000, maxBuffer: 8_000_000, encoding: 'utf8' });
  return async input => {
    const valid = (media?: Media) => !!media && media.bytes instanceof Uint8Array && media.bytes.length > 0 && media.bytes.length <= 100_000_000 && createHash('sha256').update(media.bytes).digest('hex') === media.sha256;
    if (!input || !Number.isSafeInteger(input.segmentIndex) || input.segmentIndex < 0 || !valid(input.video) || (input.previous !== undefined && !valid(input.previous)) || !Array.isArray(input.learnerWindows)) throw new Error('Invalid quality gate input');
    const directory = await mkdtemp(join(tmpdir(), 'les-video-quality-'));
    try {
      const video = join(directory, 'segment.mp4');
      await writeFile(video, input.video.bytes, { flag: 'wx', mode: 0o600 });
      const probe = JSON.parse((await tool(options.ffprobe, ['-v', 'error', '-protocol_whitelist', 'file', '-show_entries', 'format=duration', '-of', 'json', video])).stdout);
      const duration = Number(probe?.format?.duration);
      if (!Number.isFinite(duration) || duration <= 0) throw new Error('Unreadable segment');
      const t = QUALITY_THRESHOLDS;
      // One decode pass: shot changes, black intervals and frozen intervals (reported from 0.5 s, judged at > 1 s).
      const { stderr } = await tool(options.ffmpeg, ['-hide_banner', '-nostdin', '-nostats', '-v', 'info', '-protocol_whitelist', 'file', '-i', video, '-an',
        '-vf', `scdet=threshold=${t.sceneChangeScore}:sc_pass=0,blackdetect=d=0.5:pix_th=0.10,freezedetect=n=-60dB:d=0.5`, '-f', 'null', '-']);
      const cutTimes = [...stderr.matchAll(/lavfi\.scd\.score:\s*([\d.]+),\s*lavfi\.scd\.time:\s*([\d.]+)/g)].filter(match => Number(match[1]) >= t.sceneChangeScore).map(match => round(Number(match[2])));
      const checks: QualityCheck[] = [{
        id: 'cuts', status: cutTimes.length > t.maxCutsPerSegment ? 'failed' : 'passed', value: cutTimes.length,
        ...(cutTimes.length ? { reason: 'shot change inside the segment', keyframes: cutTimes.slice(0, 20) } : {}),
      }];
      const events = [...intervals(stderr, 'black', duration).map(item => ({ ...item, kind: 'black' })), ...intervals(stderr, 'freeze', duration).map(item => ({ ...item, kind: 'freeze' }))];
      const long = events.filter(item => item.kind === 'black' ? item.duration > t.maxBlackSeconds : item.duration > t.maxFreezeSeconds);
      const longest = events.reduce((max, item) => Math.max(max, item.duration), 0);
      checks.push({ id: 'black_freeze', status: long.length ? 'failed' : 'passed', value: round(longest),
        ...(long.length ? { reason: [...new Set(long.map(item => item.kind === 'black' ? 'black frames over 1 s' : 'frozen picture over 1 s'))].join('; '), keyframes: long.map(item => round(item.start)).slice(0, 20) } : {}) });
      if (input.previous) {
        const previous = join(directory, 'previous.mp4'), last = join(directory, 'previous-last.png');
        await writeFile(previous, input.previous.bytes, { flag: 'wx', mode: 0o600 });
        // The last decoded frame of the previous segment (each later frame overwrites the file).
        await tool(options.ffmpeg, ['-nostdin', '-v', 'error', '-protocol_whitelist', 'file', '-sseof', '-0.5', '-i', previous, '-an', '-update', '1', '-f', 'image2', last]);
        const result = await tool(options.ffmpeg, ['-hide_banner', '-nostdin', '-nostats', '-v', 'info', '-protocol_whitelist', 'file', '-i', last, '-i', video,
          '-filter_complex', '[0:v]scale=360:640,format=gray[a];[1:v]trim=end_frame=1,setpts=PTS-STARTPTS,scale=360:640,format=gray[b];[a][b]ssim', '-f', 'null', '-']);
        const match = /SSIM .*All:\s*([\d.]+)/.exec(result.stderr);
        const ssim = match ? Number(match[1]) : NaN;
        if (!Number.isFinite(ssim)) checks.push({ id: 'seam_ssim', status: 'not_checked', reason: 'seam could not be measured' });
        else checks.push({ id: 'seam_ssim', status: ssim >= t.minSeamSsim ? 'passed' : 'failed', value: round(ssim), ...(ssim >= t.minSeamSsim ? {} : { reason: 'jump at the seam with the previous segment', keyframes: [0] }) });
      } else checks.push({ id: 'seam_ssim', status: 'passed', reason: 'first segment, no seam' });
      const faceChecks = await faces({ file: video, duration, learnerWindows: structuredClone(input.learnerWindows) });
      for (const id of ['single_face', 'learner_mouth'] as const) {
        const found = Array.isArray(faceChecks) ? faceChecks.find(check => check?.id === id) : undefined;
        checks.push(found ? structuredClone(found) : { id, status: 'not_checked', reason: FACE_CHECK_PENDING });
      }
      return { sha256: input.video.sha256, mode: 'ffmpeg', checks };
    } finally { await rm(directory, { recursive: true, force: true }); }
  };
}

// Preview cards (LES_VIDEO_PREVIEW) are static local stand-ins: the real checks would only report a frozen
// picture, so they take the preview path and pass. Never used for provider video.
export function createPreviewQualityGate(): QualityGate {
  return async input => ({ sha256: input.video.sha256, mode: 'preview', checks: [] });
}

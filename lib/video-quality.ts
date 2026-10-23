// C14-1: pure rules of the video quality gate (no Node imports, safe to share with course builders).
// Initial thresholds come from report 4 P0-1 and are to be calibrated in C15-4 with paid samples.
export const QUALITY_THRESHOLDS = {
  // ffmpeg scdet score (0-100) at or above which a frame starts a new shot.
  sceneChangeScore: 10,
  maxCutsPerSegment: 0,
  // C15-4a (2026-10-23, first paid C15-4 sample): one face in >= 75% of sampled frames (was 0.9: a 3 s walk-in with the
  // face under the minimum size failed a single-woman segment at 0.79; the two user-rejected C3 courses measure 0.43 / 0.59)
  // and two or more faces in <= 10% of them, so a second person is still caught.
  minSingleFaceRatio: 0.75,
  maxMultiFaceRatio: 0.1,
  maxLearnerMouthRatio: 0.35,
  // C15-4b (2026-10-23): gray SSIM at 360x640 of a visually continuous real seam is 0.42 (one continuous segment's first
  // vs last frame: 0.43); the two user-rejected C3 seams, a different person after the seam, are 0.13 / 0.23. Was 0.6.
  minSeamSsim: 0.3,
  maxBlackSeconds: 1,
  maxFreezeSeconds: 1,
  // C15-4f (2026-10-23): framing drift, each segment's median face height against the first segment's, at most +-35%
  // (待标定: attempt 6 medians 0.33 / 0.388 / 0.419 / 0.451 = +18% / +27% / +37%, the last one a big close-up).
  maxFramingDrift: 0.35,
} as const;
// A failed segment may be generated again once (after a fresh reservation); a second failure stops the course.
export const MAX_SEGMENT_REDOS = 1;
// C14-4: the two face checks run scripts/video-qa/face_checks.py (MediaPipe face landmarker, python3 -I). A gate
// built without that script, or a run where it cannot measure, reports them as not_checked, never as passed.
export const FACE_CHECK_PENDING = '没有接人脸检测';
// C14-4 detector settings handed to the script. First values come from local samples (public/media/hotel-pov-12s.mp4
// and the C3 course videos); all of them are to be calibrated in C15-4 with paid samples, like the thresholds above.
export const FACE_DETECTION = {
  // Frames sampled per second of video.
  sampleFps: 5,
  // A face counts only if its landmark box is at least this share of the frame height (ignores tiny background faces).
  minFaceHeight: 0.06,
  // A sampled frame counts as "mouth moving" when lip gap / mouth width changes by at least this much from the previous one.
  mouthMoveDelta: 0.03,
  // The script is killed after this long and both checks become not_checked.
  timeoutMs: 120_000,
} as const;
export const QUALITY_CHECK_IDS = ['cuts', 'single_face', 'learner_mouth', 'seam_ssim', 'black_freeze'] as const;
// C15-4f: checks that a report may carry on top of the five. When present they count like the others (failed blocks,
// not_checked caps at needs_review); when absent the five alone decide, as before.
export const OPTIONAL_QUALITY_CHECK_IDS = ['framing_drift'] as const;

// C15-4f: limits for the fixed reference frame chosen from segment 1 (one face, measured by scripts/video-qa/face_checks.py
// --anchor). All 待标定 (to be calibrated) with more paid samples. First values from the C15-4 school segments 1:
// attempt 4 waist-up face height 0.15-0.20, attempt 6 already a close-up at 0.33-0.37 during the learner line; closed lips
// measure <= 0.02 (smiling parted lips 0.17); a blink <= 0.14 against 0.25-0.40 open; frontal yaw within 0.05;
// Laplacian variance of the face box 20-120 on these clips.
export const ANCHOR_FRAME_LIMITS = { minFaceHeight: 0.1, maxFaceHeight: 0.28, maxMouthOpen: 0.05, minEyeOpen: 0.2, maxYaw: 0.1, minSharpness: 20 } as const;

export type AnchorChoice =
  | { status: 'selected'; timeSeconds: number; faceHeight: number; mouthOpen: number; eyeOpen: number; yaw: number; sharpness: number }
  | { status: 'none'; reason: string };

// C15-4f: the quietest qualifying frame. With learner lines in the segment only frames inside them count (the partner is
// silent there); among frames that meet every limit the one with the smallest mouth opening wins (earliest on a tie).
export function chooseAnchorFrame(raw: unknown, learnerWindows: { start: number; end: number }[]): AnchorChoice {
  const result = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, any> : {};
  if (result.status !== 'measured') return { status: 'none', reason: `face measurement not available: ${typeof result.reason === 'string' ? result.reason.slice(0, 200) : 'no measurement'}` };
  const candidates = result.anchor?.candidates;
  if (!Array.isArray(candidates)) return { status: 'none', reason: 'face measurement has no anchor candidates' };
  const numbers = ['t', 'face_height', 'mouth_open', 'eye_open', 'yaw', 'sharpness'];
  const valid = candidates.filter(item => item && typeof item === 'object' && numbers.every(key => finite(item[key])) && item.t >= 0);
  const windows = (Array.isArray(learnerWindows) ? learnerWindows : []).filter(item => finite(item?.start) && finite(item?.end));
  const quiet = windows.length ? valid.filter(item => windows.some(window => item.t >= window.start && item.t <= window.end)) : valid;
  if (!quiet.length) return { status: 'none', reason: windows.length ? 'no one-face frame measured during the learner lines' : 'no one-face frame measured' };
  const l = ANCHOR_FRAME_LIMITS, misses = new Map<string, number>();
  const miss = (key: string) => { misses.set(key, (misses.get(key) ?? 0) + 1); return false; };
  const passing = quiet.filter(item =>
    (item.face_height <= l.maxFaceHeight || miss('face too large (closer than waist-up)')) && (item.face_height >= l.minFaceHeight || miss('face too small (too far)'))
    && (item.mouth_open <= l.maxMouthOpen || miss('mouth open')) && (item.eye_open >= l.minEyeOpen || miss('eyes closed'))
    && (Math.abs(item.yaw) <= l.maxYaw || miss('face turned')) && (item.sharpness >= l.minSharpness || miss('blurred')));
  if (!passing.length) return { status: 'none', reason: `no quiet, closed-mouth, front-facing waist-up frame among ${quiet.length}: ${[...misses].map(([key, count]) => `${key} ${count}`).join(', ')}`.slice(0, 300) };
  const best = passing.reduce((a, b) => b.mouth_open < a.mouth_open ? b : a);
  return { status: 'selected', timeSeconds: best.t, faceHeight: best.face_height, mouthOpen: best.mouth_open, eyeOpen: best.eye_open, yaw: best.yaw, sharpness: best.sharpness };
}

export type QualityCheckId = typeof QUALITY_CHECK_IDS[number] | typeof OPTIONAL_QUALITY_CHECK_IDS[number];
export type QualityCheck = { id: QualityCheckId; status: 'passed' | 'failed' | 'not_checked'; value?: number; reason?: string; keyframes?: number[] };
export type QualityVerdict = 'passed' | 'quality_failed' | 'needs_review';
export type QualityReport = { sha256: string; mode: 'ffmpeg' | 'preview'; checks: QualityCheck[] };
export type QualityRecord = QualityReport & { segmentIndex: number; verdict: QualityVerdict; checkedAt: number };
export type VideoRedo = { segmentIndex: number; jobId: string; sha256: string; reasons: QualityCheckId[]; at: number };
export type TaskQualityVerdict = QualityVerdict | 'preview';

const statuses = ['passed', 'failed', 'not_checked'];
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function validQualityCheck(value: unknown): value is QualityCheck {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const check = value as Record<string, unknown>;
  if (Object.keys(check).some(key => !['id', 'status', 'value', 'reason', 'keyframes'].includes(key))) return false;
  if (![...QUALITY_CHECK_IDS, ...OPTIONAL_QUALITY_CHECK_IDS].includes(check.id as QualityCheckId) || !statuses.includes(check.status as string)) return false;
  if (check.value !== undefined && !finite(check.value)) return false;
  if (check.reason !== undefined && (typeof check.reason !== 'string' || check.reason.length > 300)) return false;
  if (check.keyframes !== undefined && (!Array.isArray(check.keyframes) || check.keyframes.length > 20 || check.keyframes.some(time => !finite(time) || time < 0))) return false;
  return true;
}

// Three states. Any failure blocks; otherwise every one of the five checks must be present once and passed.
// A missing, duplicated, malformed or not_checked check can only ever give needs_review.
export function combineQualityChecks(checks: unknown): QualityVerdict {
  if (!Array.isArray(checks)) return 'needs_review';
  if (checks.some(check => !!check && typeof check === 'object' && (check as { status?: unknown }).status === 'failed')) return 'quality_failed';
  const optional = checks.filter(check => OPTIONAL_QUALITY_CHECK_IDS.includes((check as { id?: unknown } | null)?.id as typeof OPTIONAL_QUALITY_CHECK_IDS[number]));
  if (checks.length - optional.length !== QUALITY_CHECK_IDS.length) return 'needs_review';
  for (const id of QUALITY_CHECK_IDS) {
    const matches = checks.filter(check => (check as { id?: unknown } | null)?.id === id);
    if (matches.length !== 1 || !validQualityCheck(matches[0]) || matches[0].status !== 'passed') return 'needs_review';
  }
  for (const id of OPTIONAL_QUALITY_CHECK_IDS) {
    const matches = optional.filter(check => (check as { id?: unknown }).id === id);
    if (matches.length > 1 || (matches.length === 1 && (!validQualityCheck(matches[0]) || matches[0].status !== 'passed'))) return 'needs_review';
  }
  return 'passed';
}

// A preview card is a local stand-in, not a course video: it takes the preview path and passes without checks.
export function qualityVerdict(report: { mode?: unknown; checks?: unknown }): QualityVerdict {
  if (report?.mode === 'preview') return Array.isArray(report.checks) && report.checks.length === 0 ? 'passed' : 'needs_review';
  return combineQualityChecks(report?.checks);
}

type QualityTask = {
  videoAssets?: { segmentIndex: number; sha256: string }[];
  videoQuality?: QualityRecord[];
  videoRedos?: VideoRedo[];
  audioAssembly?: { segments: unknown[] };
};
export const redoCount = (task: QualityTask, segmentIndex: number) => (task.videoRedos ?? []).filter(redo => redo.segmentIndex === segmentIndex).length;

// failed: some current segment did not pass (it must never be shown). blocked: it already used its redo, so the
// course stops as quality_failed. verdict: only once every segment has a record for its current bytes.
export function taskQuality(task: QualityTask): { failed: boolean; blocked: boolean; verdict?: TaskQualityVerdict } {
  const records = task.videoQuality;
  if (!records?.length) return { failed: false, blocked: false };
  const current = (task.videoAssets ?? []).map(asset => ({ asset, record: records.find(item => item.segmentIndex === asset.segmentIndex && item.sha256 === asset.sha256) }));
  const failing = current.filter(item => item.record?.verdict === 'quality_failed');
  const failed = failing.length > 0;
  const blocked = failing.some(item => redoCount(task, item.asset.segmentIndex) >= MAX_SEGMENT_REDOS);
  const segments = task.audioAssembly?.segments.length ?? 0;
  if (failed || !segments || current.length !== segments || current.some(item => !item.record)) return { failed, blocked };
  const verdicts = current.map(item => item.record!);
  const verdict: TaskQualityVerdict = verdicts.every(item => item.mode === 'preview' && item.verdict === 'passed') ? 'preview'
    : verdicts.some(item => item.verdict === 'needs_review') ? 'needs_review' : 'passed';
  return { failed, blocked, verdict };
}

import { validateGeneratedScript } from './generated-script';
import type { GenerationTask } from './generation-tasks';

const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
// The approved short-course source is <=60s; up to four segments include codec padding.
const maxDuration = 60 + 4 * 0.129002;

// Internal projection of a server-owned task. It grants no access to private media.
export function buildGeneratedCourse(task: GenerationTask) {
  if (!task || task.status !== 'video_assembled' || !identifier(task.id) || !Number.isSafeInteger(task.revision) || task.revision < 1 || typeof task.simulation !== 'boolean') throw new Error('Course task unavailable');
  const script = validateGeneratedScript(task.script);
  const media = task.finalVideo, timeline = task.videoTimeline;
  if (!script.ok || !media || !identifier(media.assetId) || typeof media.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(media.sha256) || !Number.isSafeInteger(media.size) || media.size <= 0 || media.size > 100_000_000 || media.decoded !== true || !finite(media.duration) || media.duration <= 0 || media.duration > maxDuration || media.width !== 720 || media.height !== 1280 || !finite(media.fps) || Math.abs(media.fps - 24) > 0.001 || media.videoCodec !== 'h264' || media.audioCodec !== 'aac') throw new Error('Invalid course media');
  if (!timeline || !finite(timeline.duration) || Math.abs(timeline.duration - media.duration) > 0.001001 || !Array.isArray(timeline.lines) || timeline.lines.length !== script.value.lines.length) throw new Error('Invalid course timeline');
  let previousEnd = 0;
  const lines = script.value.lines.map((line, index) => {
    const timing = timeline.lines[index];
    if (!timing || timing.lineId !== line.id || !finite(timing.start) || !finite(timing.end) || timing.start < previousEnd || timing.end <= timing.start || timing.end > media.duration) throw new Error('Invalid course line timing');
    previousEnd = timing.end;
    return { ...line, revision: task.revision, start: timing.start, end: timing.end };
  });
  return {
    id: task.id, revision: task.revision,
    source: task.simulation ? 'test-fixture' as const : 'ai-generated' as const,
    media: { courseId: task.id, revision: task.revision, assetId: media.assetId, sha256: media.sha256, duration: media.duration },
    lines, phrases: script.value.phrases, turns: script.value.turns,
  };
}

export type GeneratedCourse = ReturnType<typeof buildGeneratedCourse>;

// Internal, server-owned editing projection; this does not grant access or save a revision.
export function buildRevisedLearningCourse(task: GenerationTask, revision: unknown) {
  const course = buildGeneratedCourse(task);
  const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const fields = (v: unknown, keys: string[]): v is Record<string, unknown> => record(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
  if (!fields(revision, ['courseId', 'sourceRevision', 'mediaSha256', 'materialsRevision', 'lineTranslations', 'phrases']) || revision.courseId !== course.id || revision.sourceRevision !== course.revision || revision.mediaSha256 !== course.media.sha256 || !Number.isSafeInteger(revision.materialsRevision) || (revision.materialsRevision as number) < 1 || !Array.isArray(revision.lineTranslations) || revision.lineTranslations.length !== course.lines.length) throw new Error('Invalid material revision');
  const translations = new Map<string, unknown>();
  for (const entry of revision.lineTranslations) {
    if (!fields(entry, ['lineId', 'translations']) || typeof entry.lineId !== 'string' || translations.has(entry.lineId) || !course.lines.some(line => line.id === entry.lineId)) throw new Error('Invalid material line');
    translations.set(entry.lineId, entry.translations);
  }
  const checked = validateGeneratedScript({
    lines: course.lines.map(line => ({ id: line.id, role: line.role, text: line.text, translations: translations.get(line.id) })),
    phrases: revision.phrases,
    turns: course.turns,
  });
  if (!checked.ok) throw new Error('Invalid revised materials');
  return {
    ...course,
    materialsRevision: revision.materialsRevision as number,
    lines: course.lines.map((line, index) => ({ ...line, translations: checked.value.lines[index].translations })),
    phrases: checked.value.phrases,
  };
}

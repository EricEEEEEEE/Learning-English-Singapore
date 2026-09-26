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

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { ownerIdFromSessionCookie } from './private-owner';
import { createGenerationTaskStore, type GenerationTask } from './generation-tasks';
import { createPrivateMediaStore } from './private-media-store';
import { createLocalCourseLibrary } from './local-course-library';
import { createSceneProgressStore } from './scene-progress';
import { createSceneRequirementStore } from './scene-requirements';
import { createSentenceReportStore } from './sentence-reports';
import { createPracticeFeedbackStore } from './practice-feedback';

type Session = { cookie?: string | null; now?: number };
export type GenerationRecordStatus = 'ready' | 'failed' | 'unknown' | 'in_progress' | 'simulation' | 'deleted';
export type GenerationRecord = { id: string; revision: number; description: string | null; status: GenerationRecordStatus; reservedMicros: number; providerCalls: number; deletedAt?: number };
export type DeletionEvent = { kind: 'scene' | 'all'; at: number };
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(value);

function recordStatus(task: GenerationTask): GenerationRecordStatus {
  if (task.status === 'deleted') return 'deleted';
  if (task.simulation) return 'simulation';
  if (task.videoJobs?.some(job => job.status === 'failed')) return 'failed';
  if (task.status === 'submission_unknown') return 'unknown';
  return task.status === 'video_assembled' ? 'ready' : 'in_progress';
}

// The learner's own local data: delete one scene, delete everything, and read a cost-honest history.
// Deletion removes content (course, media, positions, requirement text, reports, practice feedback marks) but keeps each task's reserved
// cost, because the spending ledger that enforces the budget ceiling must never shrink.
export function createMyDataStore({ directory, requirementsDirectory, sessionSecret }: { directory: string; requirementsDirectory: string; sessionSecret: string }) {
  if (!directory || !requirementsDirectory || !sessionSecret) throw new Error('Data store configuration required');
  const media = createPrivateMediaStore({ directory: join(directory, 'media'), sessionSecret });
  const tasks = createGenerationTaskStore({ directory, sessionSecret, mediaStore: media });
  const copies = createLocalCourseLibrary({ directory, sessionSecret, mediaStore: media });
  const progress = createSceneProgressStore({ directory, sessionSecret });
  const requirements = createSceneRequirementStore({ directory: requirementsDirectory, sessionSecret });
  const reports = createSentenceReportStore({ directory, sessionSecret });
  const feedback = createPracticeFeedbackStore({ directory, sessionSecret });
  async function owner(input: Session) {
    const id = await ownerIdFromSessionCookie(input.cookie, sessionSecret, input.now);
    if (!id) throw new Error('Authenticated session required');
    return id;
  }
  function events<T>(work: (db: DatabaseSync) => T): T {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = join(directory, 'deletion-events.sqlite'), db = new DatabaseSync(file, { timeout: 5000 });
    try {
      chmodSync(file, 0o600);
      db.exec('PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS deletion_events (owner TEXT NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL)');
      return work(db);
    } finally { db.close(); }
  }
  const remember = (id: string, kind: DeletionEvent['kind'], at: number) => events(db => db.prepare('INSERT INTO deletion_events VALUES(?,?,?)').run(id, kind, at));
  return {
    async deleteScene(input: Session & { id: string; revision: number }) {
      const session = { cookie: input.cookie, now: input.now }, courseId = input.id, revision = input.revision;
      if (!identifier(courseId) || !Number.isSafeInteger(revision) || revision < 1) throw new Error('Invalid course selector');
      const id = await owner(session), at = session.now ?? Date.now();
      // Look first, delete dependants next, and remove the course itself last: a failure part-way leaves the
      // scene listed so the learner sees it was not deleted and a retry finishes the job.
      if (courseId.startsWith('copy-')) {
        const copy = (await copies.list({ ...session, now: at })).find(course => course.id === courseId && course.revision === revision);
        if (!copy) throw new Error('Course unavailable');
        await progress.removeCourse({ ...session, id: courseId });
        await reports.removeCourse({ ...session, id: courseId });
        await feedback.removeCourse({ ...session, id: courseId });
        await media.removeCourse({ ...session, courseId });
        await copies.remove({ ...session, now: at, id: courseId });
      } else {
        const task = await tasks.get({ ...session, id: courseId });
        if (!task || task.status === 'deleted' || task.revision !== revision) throw new Error('Course unavailable');
        await progress.removeCourse({ ...session, id: courseId });
        await reports.removeCourse({ ...session, id: courseId });
        await feedback.removeCourse({ ...session, id: courseId });
        if (task.requirement) await requirements.remove({ ...session, revision: task.requirement.revision, content: task.requirement.content });
        await media.removeCourse({ ...session, courseId });
        await tasks.tombstone({ ...session, now: at, id: courseId });
      }
      remember(id, 'scene', at);
      return { deleted: true as const };
    },
    async deleteAll(input: Session) {
      const session = { cookie: input.cookie, now: input.now }, id = await owner(session), at = session.now ?? Date.now();
      await progress.removeAll(session);
      await reports.removeAll(session);
      await feedback.removeAll(session);
      await requirements.removeAll(session);
      await media.removeAll(session);
      await copies.removeAll({ ...session, now: at });
      await tasks.tombstoneAll({ ...session, now: at });
      remember(id, 'all', at);
      return { deleted: true as const };
    },
    async records(input: Session): Promise<{ tasks: GenerationRecord[]; deletions: DeletionEvent[] }> {
      const session = { cookie: input.cookie, now: input.now }, id = await owner(session);
      const rows = (await tasks.list(session)).map(task => {
        const status = recordStatus(task);
        return { id: task.id, revision: task.revision, description: status === 'deleted' ? null : task.goal, status, reservedMicros: task.reservedMicros, providerCalls: task.providerCalls,
          ...(status === 'deleted' && task.deletedAt !== undefined ? { deletedAt: task.deletedAt } : {}) };
      });
      const deletions = events(db => db.prepare('SELECT kind,at FROM deletion_events WHERE owner=? ORDER BY rowid').all(id).map(row => ({ kind: String(row.kind) as DeletionEvent['kind'], at: Number(row.at) })));
      return { tasks: rows, deletions };
    },
  };
}

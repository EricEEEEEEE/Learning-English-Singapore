import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { ownerIdFromSessionCookie } from './private-owner';

type Session = { cookie?: string | null; now?: number };
type Pointer = { id: string; revision: number; materialsRevision?: number };
export type PracticeFeedback = { turnIndex: number; note: string; status: 'received'; at: number };
type CourseReader = (input: Session & Pointer) => Promise<{ turns: unknown[] }>;
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(value);
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
function pointer(input: Pointer): Pointer {
  if (!identifier(input?.id) || !positive(input.revision) || input.materialsRevision !== undefined && !positive(input.materialsRevision)) throw new Error('Invalid course selector');
  return { id: input.id, revision: input.revision, ...(input.materialsRevision === undefined ? {} : { materialsRevision: input.materialsRevision }) };
}

// C6: the learner marks one coach note as wrong. Only the mark is kept, per owner and exact course turn,
// next to the sentence reports; nothing is regenerated and the course does not change.
export function createPracticeFeedbackStore({ directory, sessionSecret, getCourse }: { directory: string; sessionSecret: string; getCourse?: CourseReader }) {
  if (!directory || !sessionSecret) throw new Error('Feedback store configuration required');
  async function owner(input: Session) {
    const id = await ownerIdFromSessionCookie(input.cookie, sessionSecret, input.now);
    if (!id) throw new Error('Authenticated session required');
    return id;
  }
  function transact<T>(work: (db: DatabaseSync) => T): T {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = join(directory, 'practice-feedback.sqlite'), db = new DatabaseSync(file, { timeout: 5000 });
    try {
      chmodSync(file, 0o600);
      db.exec('PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS practice_feedback (owner TEXT NOT NULL, course TEXT NOT NULL, revision INTEGER NOT NULL, materials INTEGER NOT NULL, turn INTEGER NOT NULL, note TEXT NOT NULL, at INTEGER NOT NULL); BEGIN IMMEDIATE;');
      const result = work(db); db.exec('COMMIT'); return result;
    } finally { db.close(); }
  }
  return {
    async list(input: Session & Pointer): Promise<PracticeFeedback[]> {
      const id = await owner(input), course = pointer(input);
      return transact(db => db.prepare('SELECT turn,note,at FROM practice_feedback WHERE owner=? AND course=? AND revision=? AND materials=? ORDER BY rowid')
        .all(id, course.id, course.revision, course.materialsRevision ?? 0).map(row => ({ turnIndex: Number(row.turn), note: String(row.note), status: 'received' as const, at: Number(row.at) })));
    },
    async report(input: Session & { course: Pointer; turnIndex: number; note: string }): Promise<PracticeFeedback> {
      const id = await owner(input), course = pointer(input.course);
      const note = typeof input.note === 'string' ? input.note.trim() : '';
      if (!note || note.length > 200) throw new Error('Invalid note');
      if (!Number.isSafeInteger(input.turnIndex) || input.turnIndex < 0 || !getCourse) throw new Error('Invalid turn');
      const saved = await getCourse({ cookie: input.cookie, now: input.now, ...course });
      if (!Array.isArray(saved?.turns) || input.turnIndex >= saved.turns.length) throw new Error('Invalid turn');
      const feedback: PracticeFeedback = { turnIndex: input.turnIndex, note, status: 'received', at: input.now ?? Date.now() };
      transact(db => db.prepare('INSERT INTO practice_feedback VALUES(?,?,?,?,?,?,?)').run(id, course.id, course.revision, course.materialsRevision ?? 0, feedback.turnIndex, note, feedback.at));
      return feedback;
    },
    async removeCourse(input: Session & { id: string }) {
      const id = await owner(input);
      if (!identifier(input.id)) throw new Error('Invalid course selector');
      return transact(db => { db.prepare('DELETE FROM practice_feedback WHERE owner=? AND course=?').run(id, input.id); });
    },
    async removeAll(input: Session) {
      const id = await owner(input);
      return transact(db => { db.prepare('DELETE FROM practice_feedback WHERE owner=?').run(id); });
    },
  };
}

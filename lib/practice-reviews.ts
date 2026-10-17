import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { ownerIdFromSessionCookie } from './private-owner';

type Session = { cookie?: string | null; now?: number };
type Pointer = { id: string; revision: number; materialsRevision?: number };
type CourseReader = (input: Session & Pointer) => Promise<{ turns: unknown[] }>;

import { practiceOutcomes, type PracticeOutcome } from './practice-review-outcomes';
export { practiceOutcomes, classifyPracticeTurn, countOutcomes, type PracticeOutcome } from './practice-review-outcomes';

import type { PracticeHelp, PracticeReview } from './practice-review-outcomes';
export type { PracticeHelp, PracticeReview } from './practice-review-outcomes';

const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(value);
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 999;
const HELP_KEYS = ['hints', 'autoHelp', 'translations', 'native'];
function pointer(input: unknown): Pointer {
  if (!object(input) || Object.keys(input).some(key => !['id', 'revision', 'materialsRevision'].includes(key)) || !identifier(input.id) || !positive(input.revision)
    || input.materialsRevision !== undefined && !positive(input.materialsRevision)) throw new Error('Invalid course selector');
  return { id: input.id, revision: input.revision, ...(input.materialsRevision === undefined ? {} : { materialsRevision: input.materialsRevision }) };
}
function parse(input: Record<string, unknown>) {
  if (Object.keys(input).some(key => !['cookie', 'now', 'course', 'session', 'turns', 'help'].includes(key))) throw new Error('Invalid review');
  if (typeof input.session !== 'string' || !/^[a-zA-Z0-9_-]{8,64}$/.test(input.session)) throw new Error('Invalid review session');
  if (!Array.isArray(input.turns) || !input.turns.length || input.turns.length > 50) throw new Error('Invalid review turns');
  const seen = new Set<number>();
  const turns = input.turns.map(item => {
    if (!object(item) || Object.keys(item).length !== 2 || !Number.isSafeInteger(item.turnIndex) || (item.turnIndex as number) < 0 || seen.has(item.turnIndex as number)
      || !(practiceOutcomes as readonly unknown[]).includes(item.outcome)) throw new Error('Invalid review turns');
    seen.add(item.turnIndex as number);
    return { turnIndex: item.turnIndex as number, outcome: item.outcome as PracticeOutcome };
  }).sort((a, b) => a.turnIndex - b.turnIndex);
  const help = input.help;
  if (!object(help) || Object.keys(help).length !== HELP_KEYS.length || !HELP_KEYS.every(key => count(help[key]))) throw new Error('Invalid review help');
  return { course: pointer(input.course), session: input.session, turns, help: { hints: help.hints, autoHelp: help.autoHelp, translations: help.translations, native: help.native } as PracticeHelp };
}

// C9-6 (spec F10.4): the practice review is kept per owner and course revision so the next review can be compared
// with it. Only outcomes and help counts are kept: no audio, no transcript, no score.
export function createPracticeReviewStore({ directory, sessionSecret, getCourse }: { directory: string; sessionSecret: string; getCourse?: CourseReader }) {
  if (!directory || !sessionSecret) throw new Error('Review store configuration required');
  async function owner(input: Session) {
    const id = await ownerIdFromSessionCookie(input.cookie, sessionSecret, input.now);
    if (!id) throw new Error('Authenticated session required');
    return id;
  }
  function transact<T>(work: (db: DatabaseSync) => T): T {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = join(directory, 'practice-reviews.sqlite'), db = new DatabaseSync(file, { timeout: 5000 });
    try {
      chmodSync(file, 0o600);
      db.exec('PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS practice_reviews (owner TEXT NOT NULL, course TEXT NOT NULL, revision INTEGER NOT NULL, materials INTEGER NOT NULL, session TEXT NOT NULL, body TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(owner,course,revision,session)); BEGIN IMMEDIATE;');
      const result = work(db); db.exec('COMMIT'); return result;
    } finally { db.close(); }
  }
  const project = (row: Record<string, unknown> | undefined): PracticeReview | null => row ? { session: String(row.session), ...JSON.parse(String(row.body)), at: Number(row.at) } : null;
  return {
    async save(input: Session & Record<string, unknown>): Promise<{ review: PracticeReview; previous: PracticeReview | null }> {
      const id = await owner(input);
      const review = parse(input);
      if (!getCourse) throw new Error('Course unavailable');
      const saved = await getCourse({ cookie: input.cookie, now: input.now, ...review.course });
      if (!Array.isArray(saved?.turns) || review.turns.some(turn => turn.turnIndex >= saved.turns.length)) throw new Error('Invalid review turns');
      const at = input.now ?? Date.now(), body = JSON.stringify({ turns: review.turns, help: review.help });
      return transact(db => {
        const keys = [id, review.course.id, review.course.revision] as const;
        db.prepare('INSERT INTO practice_reviews VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner,course,revision,session) DO UPDATE SET materials=excluded.materials,body=excluded.body,at=excluded.at')
          .run(...keys, review.course.materialsRevision ?? 0, review.session, body, at);
        const previous = project(db.prepare('SELECT session,body,at FROM practice_reviews WHERE owner=? AND course=? AND revision=? AND session<>? ORDER BY at DESC, rowid DESC LIMIT 1').get(...keys, review.session));
        return { review: { session: review.session, turns: review.turns, help: review.help, at }, previous };
      });
    },
    async removeCourse(input: Session & { id: string }) {
      const id = await owner(input);
      if (!identifier(input.id)) throw new Error('Invalid course selector');
      return transact(db => { db.prepare('DELETE FROM practice_reviews WHERE owner=? AND course=?').run(id, input.id); });
    },
    async removeAll(input: Session) {
      const id = await owner(input);
      return transact(db => { db.prepare('DELETE FROM practice_reviews WHERE owner=?').run(id); });
    },
  };
}

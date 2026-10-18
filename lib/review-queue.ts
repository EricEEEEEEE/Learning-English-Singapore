import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { ownerIdFromSessionCookie } from './private-owner';

// C13-1 (report 1 P1-1 + report 5 P0-1): "listen to these again today" across courses. A fixed 1/3/7/14-day schedule
// with three self-ratings instead of FSRS (no new dependency, and FSRS defaults come from text flashcards). The row
// keeps a step index and a run of "understood", so a later switch to FSRS can replace the schedule function only.
// Nothing here measures ability: the rating is the learner's own feeling and is never shown as a score.
// C13-2: "heard N sentences" counts distinct sentences heard; it only grows, and deleting all data starts it again.
type Session = { cookie?: string | null; now?: number };
type Pointer = { id: string; revision: number; materialsRevision?: number };
type Line = { id: string; text: string; start: number; end: number; translations: Record<string, string>; plainAlternative?: string | null };
type Course = { lines: Line[]; turns: { partnerLineId: string; learnerLineId: string }[]; phrases?: { lineId: string; plainAlternative?: string | null }[] };
type CourseReader = (input: Session & Pointer) => Promise<Course>;
type DisabledReader = (input: Session & Pointer) => Promise<Set<string>>;
export type ReviewItem = { course: Pointer; lineId: string; text: string; translations: Record<string, string>; start: number; end: number; plainAlternative?: string };
export type ReviewToday = { items: ReviewItem[]; limit: number; heard: number; resetAt: number | null };

export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14] as const;
export const REVIEW_DAILY_DEFAULT = 5;
export const REVIEW_DAILY_MAX = 10;
export const reviewRatings = ['missed', 'hint', 'clear'] as const;
export type ReviewRating = typeof reviewRatings[number];
export const reviewSources = ['learned', 'review', 'report'] as const;
export type ReviewSource = typeof reviewSources[number];
const DAY = 86_400_000, SINGAPORE = 8 * 3_600_000;
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(value);
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
// Review days follow Singapore time: a sentence due "tomorrow" is due from local midnight.
export const reviewDayStart = (t: number) => Math.floor((t + SINGAPORE) / DAY) * DAY - SINGAPORE;
const dayKey = (t: number) => new Date(t + SINGAPORE).toISOString().slice(0, 10);
const dueAfter = (now: number, step: number) => reviewDayStart(now) + REVIEW_INTERVAL_DAYS[step] * DAY;

function pointer(input: unknown): Pointer {
  if (!object(input) || Object.keys(input).some(key => !['id', 'revision', 'materialsRevision'].includes(key)) || !identifier(input.id) || !positive(input.revision)
    || input.materialsRevision !== undefined && !positive(input.materialsRevision)) throw new Error('Invalid course selector');
  return { id: input.id, revision: input.revision, ...(input.materialsRevision === undefined ? {} : { materialsRevision: input.materialsRevision }) };
}
function lineIds(value: unknown, { min = 1 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > 20 || value.some(id => !identifier(id))) throw new Error('Invalid review lines');
  return [...new Set(value as string[])];
}
const outcomesNeedingHelp = ['needs_help', 'after_hint', 'chose_meaning'];
// The partner line and the model answer of each practice turn that needed help.
export function reviewTurnLines(course: Pick<Course, 'turns'>, turns: { turnIndex: number; outcome: string }[]) {
  return turns.filter(turn => outcomesNeedingHelp.includes(turn.outcome) && course.turns[turn.turnIndex])
    .sort((a, b) => a.turnIndex - b.turnIndex)
    .flatMap(turn => [course.turns[turn.turnIndex].partnerLineId, course.turns[turn.turnIndex].learnerLineId]);
}
// C13-2: where the learner stopped, as "sentence 3" or "turn 2" (1-based), from the saved learning position.
export function lastPlace(course: Pick<Course, 'lines'>, position: { page: string; time: number; turnIndex: number }) {
  if (position.page === 'sentences') return { page: position.page, index: Math.max(1, course.lines.filter(line => line.start <= position.time + 0.05).length) };
  if (position.page === 'prompt' || position.page === 'practice') return { page: position.page, index: position.turnIndex + 1 };
  return { page: position.page, index: null };
}

export function createReviewQueueStore({ directory, sessionSecret, getCourse, disabledLines }: { directory: string; sessionSecret: string; getCourse?: CourseReader; disabledLines?: DisabledReader }) {
  if (!directory || !sessionSecret) throw new Error('Review queue configuration required');
  async function owner(input: Session) {
    const id = await ownerIdFromSessionCookie(input.cookie, sessionSecret, input.now);
    if (!id) throw new Error('Authenticated session required');
    return id;
  }
  function transact<T>(work: (db: DatabaseSync) => T): T {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = join(directory, 'review-queue.sqlite'), db = new DatabaseSync(file, { timeout: 5000 });
    try {
      chmodSync(file, 0o600);
      db.exec(`PRAGMA synchronous=FULL;
        CREATE TABLE IF NOT EXISTS review_items (owner TEXT NOT NULL, course TEXT NOT NULL, revision INTEGER NOT NULL, materials INTEGER NOT NULL, line TEXT NOT NULL, source TEXT NOT NULL, added_at INTEGER NOT NULL, due_at INTEGER NOT NULL, step INTEGER NOT NULL, clears INTEGER NOT NULL, done INTEGER NOT NULL, PRIMARY KEY(owner,course,revision,materials,line));
        CREATE TABLE IF NOT EXISTS review_rated (owner TEXT NOT NULL, day TEXT NOT NULL, course TEXT NOT NULL, revision INTEGER NOT NULL, materials INTEGER NOT NULL, line TEXT NOT NULL, rating TEXT NOT NULL, PRIMARY KEY(owner,day,course,revision,materials,line));
        CREATE TABLE IF NOT EXISTS review_settings (owner TEXT PRIMARY KEY, daily INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS heard_lines (owner TEXT NOT NULL, course TEXT NOT NULL, revision INTEGER NOT NULL, materials INTEGER NOT NULL, line TEXT NOT NULL, PRIMARY KEY(owner,course,revision,materials,line));
        CREATE TABLE IF NOT EXISTS heard_totals (owner TEXT PRIMARY KEY, total INTEGER NOT NULL, reset_at INTEGER);
        BEGIN IMMEDIATE;`);
      const result = work(db); db.exec('COMMIT'); return result;
    } finally { db.close(); }
  }
  const keys = (id: string, course: Pointer) => [id, course.id, course.revision, course.materialsRevision ?? 0] as const;
  async function readCourse(input: Session, course: Pointer) {
    if (!getCourse) throw new Error('Course unavailable');
    const saved = await getCourse({ cookie: input.cookie, now: input.now, ...course });
    if (!saved || !Array.isArray(saved.lines) || !Array.isArray(saved.turns)) throw new Error('Course unavailable');
    return saved;
  }
  async function checkedLines(input: Session, course: Pointer, ids: string[]) {
    if (!ids.length) return;
    const saved = await readCourse(input, course), known = new Set(saved.lines.map(line => line.id));
    if (ids.some(id => !known.has(id))) throw new Error('Invalid review lines');
  }
  function insert(db: DatabaseSync, id: string, course: Pointer, ids: string[], source: ReviewSource, now: number) {
    let added = 0;
    for (const line of ids) {
      const row = db.prepare('SELECT due_at,done FROM review_items WHERE owner=? AND course=? AND revision=? AND materials=? AND line=?').get(...keys(id, course), line);
      const due = dueAfter(now, 0);
      if (!row) {
        db.prepare('INSERT INTO review_items VALUES(?,?,?,?,?,?,?,?,0,0,0)').run(...keys(id, course), line, source, now, due); added++;
      } else if (source !== 'learned') {
        // Help in practice or a "hard to hear" report brings a sentence back to the first step, even one that left.
        db.prepare('UPDATE review_items SET source=?, step=0, clears=0, done=0, due_at=MIN(CASE WHEN done=1 THEN ? ELSE due_at END, ?) WHERE owner=? AND course=? AND revision=? AND materials=? AND line=?')
          .run(source, due, due, ...keys(id, course), line);
      }
    }
    return added;
  }
  function heardTotal(db: DatabaseSync, id: string) {
    const row = db.prepare('SELECT total,reset_at FROM heard_totals WHERE owner=?').get(id);
    return { heard: row ? Number(row.total) : 0, resetAt: row && row.reset_at !== null ? Number(row.reset_at) : null };
  }
  return {
    async add(input: Session & { course: unknown; lineIds: unknown; source: unknown }) {
      const id = await owner(input), course = pointer(input.course), ids = lineIds(input.lineIds), now = input.now ?? Date.now();
      if (!(reviewSources as readonly unknown[]).includes(input.source)) throw new Error('Invalid review source');
      await checkedLines(input, course, ids);
      return { added: transact(db => insert(db, id, course, ids, input.source as ReviewSource, now)) };
    },
    async addReview(input: Session & { course: unknown; turns: { turnIndex: number; outcome: string }[] }) {
      const id = await owner(input), course = pointer(input.course), now = input.now ?? Date.now();
      const saved = await readCourse(input, course), ids = [...new Set(reviewTurnLines(saved, Array.isArray(input.turns) ? input.turns : []))].slice(0, 20);
      if (!ids.length) return { added: 0 };
      return { added: transact(db => insert(db, id, course, ids, 'review', now)) };
    },
    async listen(input: Session & { course: unknown; heard: unknown; learned: unknown }) {
      const id = await owner(input), course = pointer(input.course), now = input.now ?? Date.now();
      const heard = lineIds(input.heard, { min: 0 }), learned = lineIds(input.learned, { min: 0 });
      if (!heard.length && !learned.length) throw new Error('Invalid review lines');
      await checkedLines(input, course, [...new Set([...heard, ...learned])]);
      return transact(db => {
        // A learned sentence has been heard too.
        let fresh = 0;
        for (const line of new Set([...heard, ...learned])) fresh += Number(db.prepare('INSERT OR IGNORE INTO heard_lines VALUES(?,?,?,?,?)').run(...keys(id, course), line).changes);
        if (fresh) db.prepare('INSERT INTO heard_totals VALUES(?,?,NULL) ON CONFLICT(owner) DO UPDATE SET total=total+excluded.total').run(id, fresh);
        insert(db, id, course, learned, 'learned', now);
        return { heard: heardTotal(db, id).heard };
      });
    },
    async rate(input: Session & { course: unknown; lineId: unknown; rating: unknown }) {
      const id = await owner(input), course = pointer(input.course), now = input.now ?? Date.now();
      if (!identifier(input.lineId)) throw new Error('Invalid review lines');
      if (!(reviewRatings as readonly unknown[]).includes(input.rating)) throw new Error('Invalid review rating');
      const rating = input.rating as ReviewRating, line = input.lineId;
      return transact(db => {
        const row = db.prepare('SELECT step,clears,due_at FROM review_items WHERE owner=? AND course=? AND revision=? AND materials=? AND line=? AND done=0').get(...keys(id, course), line);
        if (!row || Number(row.due_at) > now) throw new Error('Review item unavailable');
        let step = Number(row.step), clears = Number(row.clears), done = false;
        if (rating === 'clear') { clears++; done = clears >= 2; step = Math.min(step + 1, REVIEW_INTERVAL_DAYS.length - 1); }
        else { clears = 0; if (rating === 'missed') step = 0; }
        const dueAt = done ? null : dueAfter(now, step);
        db.prepare('UPDATE review_items SET step=?, clears=?, done=?, due_at=? WHERE owner=? AND course=? AND revision=? AND materials=? AND line=?')
          .run(step, clears, done ? 1 : 0, dueAt ?? now, ...keys(id, course), line);
        db.prepare('INSERT OR REPLACE INTO review_rated VALUES(?,?,?,?,?,?,?)').run(id, dayKey(now), course.id, course.revision, course.materialsRevision ?? 0, line, rating);
        return { done, dueAt };
      });
    },
    async setLimit(input: Session & { limit: unknown }) {
      const id = await owner(input);
      if (!Number.isSafeInteger(input.limit) || (input.limit as number) < 1 || (input.limit as number) > REVIEW_DAILY_MAX) throw new Error('Invalid review limit');
      return transact(db => { db.prepare('INSERT INTO review_settings VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET daily=excluded.daily').run(id, input.limit as number); return { limit: input.limit as number }; });
    },
    // Today's sentences: due ones, oldest first, at most the daily number minus what was already rated today.
    // Days away never add up: the page always asks for at most the daily number.
    async today(input: Session): Promise<ReviewToday> {
      const id = await owner(input), now = input.now ?? Date.now(), session = { cookie: input.cookie, now: input.now };
      const { limit, room, rows, heard } = transact(db => {
        const setting = db.prepare('SELECT daily FROM review_settings WHERE owner=?').get(id);
        const limit = setting ? Number(setting.daily) : REVIEW_DAILY_DEFAULT;
        const rated = Number(db.prepare('SELECT count(*) AS n FROM review_rated WHERE owner=? AND day=?').get(id, dayKey(now))?.n ?? 0);
        const rows = db.prepare('SELECT course,revision,materials,line FROM review_items WHERE owner=? AND done=0 AND due_at<=? ORDER BY due_at, rowid LIMIT 200').all(id, now);
        return { limit, room: Math.max(0, limit - rated), rows, heard: heardTotal(db, id) };
      });
      const items: ReviewItem[] = [], courses = new Map<string, Course | null>(), disabled = new Map<string, Set<string>>(), gone: { course: Pointer; line: string }[] = [];
      for (const row of rows) {
        if (items.length >= room) break;
        const course: Pointer = { id: String(row.course), revision: Number(row.revision), ...(Number(row.materials) ? { materialsRevision: Number(row.materials) } : {}) };
        const key = `${course.id}:${course.revision}:${course.materialsRevision ?? 0}`;
        if (!courses.has(key)) {
          try { courses.set(key, await readCourse(session, course)); }
          catch (error) { if (error instanceof Error && error.message === 'Authenticated session required') throw error; courses.set(key, null); }
          if (disabledLines && courses.get(key)) {
            try { disabled.set(key, await disabledLines({ ...session, ...course })); } catch { disabled.set(key, new Set()); }
          }
        }
        const saved = courses.get(key);
        // An unreadable course is skipped this time (its own deletion removes its rows).
        if (!saved) continue;
        const line = saved.lines.find(item => item.id === String(row.line));
        // C9-5: a sentence its owner turned off, or one no longer in the course, leaves the queue for good.
        if (!line || disabled.get(key)?.has(line.id)) { gone.push({ course, line: String(row.line) }); continue; }
        const plain = typeof line.plainAlternative === 'string' && line.plainAlternative.trim() ? line.plainAlternative
          : saved.phrases?.find(phrase => phrase.lineId === line.id && typeof phrase.plainAlternative === 'string' && phrase.plainAlternative.trim())?.plainAlternative ?? undefined;
        items.push({ course, lineId: line.id, text: line.text, translations: structuredClone(line.translations), start: line.start, end: line.end, ...(plain ? { plainAlternative: plain } : {}) });
      }
      if (gone.length) transact(db => { for (const item of gone) db.prepare('DELETE FROM review_items WHERE owner=? AND course=? AND revision=? AND materials=? AND line=?').run(...keys(id, item.course), item.line); });
      return { items, limit, heard: heard.heard, resetAt: heard.resetAt };
    },
    async removeCourse(input: Session & { id: string }) {
      const id = await owner(input);
      if (!identifier(input.id)) throw new Error('Invalid course selector');
      // "Heard" keeps its number: it only grows. The sentences themselves are no longer kept.
      return transact(db => { for (const table of ['review_items', 'review_rated', 'heard_lines']) db.prepare(`DELETE FROM ${table} WHERE owner=? AND course=?`).run(id, input.id); });
    },
    async removeAll(input: Session) {
      const id = await owner(input), at = input.now ?? Date.now();
      return transact(db => {
        for (const table of ['review_items', 'review_rated', 'heard_lines', 'review_settings']) db.prepare(`DELETE FROM ${table} WHERE owner=?`).run(id);
        db.prepare('INSERT INTO heard_totals VALUES(?,0,?) ON CONFLICT(owner) DO UPDATE SET total=0, reset_at=excluded.reset_at').run(id, at);
      });
    },
  };
}

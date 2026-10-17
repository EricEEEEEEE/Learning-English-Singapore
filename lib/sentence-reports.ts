import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { ownerIdFromSessionCookie } from './private-owner';

type Session = { cookie?: string | null; now?: number };
type Pointer = { id: string; revision: number; materialsRevision?: number };
export const sentenceReportReasons = ['unclear', 'not_local', 'wrong_meaning'] as const;
export type SentenceReportReason = typeof sentenceReportReasons[number];
// C9-5: how a report is being handled. Only the owner of the report can change it (there is no global admin).
export const sentenceReportStatuses = ['received', 'processing', 'disabled', 'corrected'] as const;
export type SentenceReportStatus = typeof sentenceReportStatuses[number];
export type SentenceReport = { lineId: string; reason: SentenceReportReason; note: string; status: SentenceReportStatus; at: number };
type CourseReader = (input: Session & Pointer) => Promise<{ lines: { id: string }[] }>;
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(value);
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

function pointer(input: Pointer): Pointer {
  if (!identifier(input?.id) || !positive(input.revision) || input.materialsRevision !== undefined && !positive(input.materialsRevision)) throw new Error('Invalid course selector');
  return { id: input.id, revision: input.revision, ...(input.materialsRevision === undefined ? {} : { materialsRevision: input.materialsRevision }) };
}

// A learner's report on one sentence of one exact course version. Reporting only records the report:
// it never regenerates, edits or hides the course the learner keeps listening to.
export function createSentenceReportStore({ directory, sessionSecret, getCourse }: { directory: string; sessionSecret: string; getCourse?: CourseReader }) {
  if (!directory || !sessionSecret) throw new Error('Report store configuration required');
  async function owner(input: Session) {
    const id = await ownerIdFromSessionCookie(input.cookie, sessionSecret, input.now);
    if (!id) throw new Error('Authenticated session required');
    return id;
  }
  function transact<T>(work: (db: DatabaseSync) => T): T {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = join(directory, 'sentence-reports.sqlite'), db = new DatabaseSync(file, { timeout: 5000 });
    try {
      chmodSync(file, 0o600);
      db.exec('PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS sentence_reports (owner TEXT NOT NULL, course TEXT NOT NULL, revision INTEGER NOT NULL, materials INTEGER NOT NULL, line TEXT NOT NULL, reason TEXT NOT NULL, note TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(owner,course,revision,materials,line)); BEGIN IMMEDIATE;');
      // C9-5: tables written before C9 have no status column; adding it keeps every existing report as received.
      if (!db.prepare('PRAGMA table_info(sentence_reports)').all().some(column => column.name === 'status')) db.exec("ALTER TABLE sentence_reports ADD COLUMN status TEXT NOT NULL DEFAULT 'received'");
      const result = work(db); db.exec('COMMIT'); return result;
    } finally { db.close(); }
  }
  const project = (row: Record<string, unknown>): SentenceReport => ({ lineId: String(row.line), reason: String(row.reason) as SentenceReportReason, note: String(row.note),
    status: (sentenceReportStatuses as readonly unknown[]).includes(row.status) ? row.status as SentenceReportStatus : 'received', at: Number(row.at) });
  return {
    async list(input: Session & Pointer): Promise<SentenceReport[]> {
      const id = await owner(input), course = pointer(input);
      return transact(db => db.prepare('SELECT line,reason,note,status,at FROM sentence_reports WHERE owner=? AND course=? AND revision=? AND materials=? ORDER BY rowid')
        .all(id, course.id, course.revision, course.materialsRevision ?? 0).map(project));
    },
    async report(input: Session & { course: Pointer; lineId: string; reason: string; note?: string }): Promise<SentenceReport> {
      const id = await owner(input), course = pointer(input.course);
      if (!(sentenceReportReasons as readonly string[]).includes(input.reason)) throw new Error('Invalid reason');
      if (input.note !== undefined && typeof input.note !== 'string') throw new Error('Invalid note');
      const note = (input.note ?? '').trim();
      if (note.length > 200) throw new Error('Invalid note');
      if (!identifier(input.lineId) || !getCourse) throw new Error('Invalid sentence');
      const saved = await getCourse({ cookie: input.cookie, now: input.now, ...course });
      if (!Array.isArray(saved?.lines) || !saved.lines.some(line => line?.id === input.lineId)) throw new Error('Invalid sentence');
      const report: SentenceReport = { lineId: input.lineId, reason: input.reason as SentenceReportReason, note, status: 'received', at: input.now ?? Date.now() };
      // Reporting the same sentence again updates the reason and note but keeps how it is being handled.
      return transact(db => {
        db.prepare('INSERT INTO sentence_reports(owner,course,revision,materials,line,reason,note,at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(owner,course,revision,materials,line) DO UPDATE SET reason=excluded.reason,note=excluded.note,at=excluded.at')
          .run(id, course.id, course.revision, course.materialsRevision ?? 0, report.lineId, report.reason, report.note, report.at);
        const row = db.prepare('SELECT status FROM sentence_reports WHERE owner=? AND course=? AND revision=? AND materials=? AND line=?').get(id, course.id, course.revision, course.materialsRevision ?? 0, report.lineId);
        return { ...report, status: (sentenceReportStatuses as readonly unknown[]).includes(row?.status) ? row!.status as SentenceReportStatus : 'received' };
      });
    },
    // C9-5: the owner-local handling step. It changes only the caller's own report; the course itself never changes.
    async setStatus(input: Session & { course: Pointer; lineId: string; status: string }): Promise<SentenceReport> {
      const id = await owner(input), course = pointer(input.course);
      if (!(sentenceReportStatuses as readonly string[]).includes(input.status)) throw new Error('Invalid status');
      if (!identifier(input.lineId)) throw new Error('Invalid sentence');
      return transact(db => {
        const keys = [id, course.id, course.revision, course.materialsRevision ?? 0, input.lineId] as const;
        const changed = db.prepare('UPDATE sentence_reports SET status=? WHERE owner=? AND course=? AND revision=? AND materials=? AND line=?').run(input.status, ...keys);
        if (!Number(changed.changes)) throw new Error('Report unavailable');
        return project(db.prepare('SELECT line,reason,note,status,at FROM sentence_reports WHERE owner=? AND course=? AND revision=? AND materials=? AND line=?').get(...keys)!);
      });
    },
    async removeCourse(input: Session & { id: string }) {
      const id = await owner(input);
      if (!identifier(input.id)) throw new Error('Invalid course selector');
      return transact(db => { db.prepare('DELETE FROM sentence_reports WHERE owner=? AND course=?').run(id, input.id); });
    },
    async removeAll(input: Session) {
      const id = await owner(input);
      return transact(db => { db.prepare('DELETE FROM sentence_reports WHERE owner=?').run(id); });
    },
  };
}

type ListedCourse = { id: string; revision: number; materialsRevision?: number; goal: string; status: string; simulation?: boolean };
type LinesReader = (input: Session & Pointer) => Promise<{ lines: { id: string; text: string }[] }>;
export type SameSentencePlace = { id: string; revision: number; materialsRevision?: number; description: string };

// C9-5 (spec F12.5): where else the owner meets exactly the same English sentence. Only the owner's own ready
// courses are read, through the same private course reader; nothing is regenerated or changed.
export function createSameSentenceFinder({ list, getCourse }: { list: (input: Session) => Promise<ListedCourse[]>; getCourse: LinesReader }) {
  return {
    async find(input: Session & { course: Pointer; lineIds: string[] }): Promise<Record<string, SameSentencePlace[]>> {
      const session = { cookie: input.cookie, now: input.now }, current = pointer(input.course);
      const source = await getCourse({ ...session, ...current });
      const wanted = new Map<string, string>();
      for (const lineId of input.lineIds) { const text = source.lines.find(line => line.id === lineId)?.text.trim(); if (text) wanted.set(lineId, text); }
      const found: Record<string, SameSentencePlace[]> = {};
      if (!wanted.size) return found;
      for (const row of await list(session)) {
        if (row.id === current.id || row.status !== 'video_assembled' || row.simulation) continue;
        const place: SameSentencePlace = { id: row.id, revision: row.revision, ...(row.materialsRevision === undefined ? {} : { materialsRevision: row.materialsRevision }), description: row.goal };
        let lines: { text: string }[];
        try { lines = (await getCourse({ ...session, id: row.id, revision: row.revision, ...(row.materialsRevision === undefined ? {} : { materialsRevision: row.materialsRevision }) })).lines; }
        catch { continue; } // an unreadable course is simply not listed
        const texts = new Set(lines.map(line => line.text.trim()));
        for (const [lineId, text] of wanted) if (texts.has(text)) (found[lineId] ??= []).push(place);
      }
      return found;
    },
  };
}

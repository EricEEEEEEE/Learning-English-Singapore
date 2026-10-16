import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ownerIdFromSessionCookie } from './private-owner';
import { sceneLanguages, type SceneCourse, type SceneLanguage } from './scene-course';

type Audio = { bytes: Uint8Array; mimeType: string };
type PracticeCourse = { id: string; lines: Pick<SceneCourse['lines'][number], 'id' | 'role' | 'text'>[]; turns: SceneCourse['turns'] };
type History = { learner: string; partner: string }[];
export type PracticeContext = { partnerLine: string; expectedLearnerLine: string; sceneLines: { role: 'partner' | 'learner'; text: string }[]; transcript: string; history: History; language: SceneLanguage };
type Options = {
  directory: string; sessionSecret: string; maxReservedMicros: number; turnMicros: number; maxTurnsPerCourse?: number;
  getCourse: (input: { cookie?: string | null; now?: number; id: string; revision: number; materialsRevision?: number }) => Promise<PracticeCourse>;
  transcribe: (input: Audio) => Promise<{ text: string }>;
  respond: (input: PracticeContext) => Promise<{ reply: string; understood: boolean }>;
  speak: (input: { text: string }) => Promise<{ bytes: Uint8Array; mimeType: string }>;
};
type TurnInput = { cookie?: string | null; now?: number; courseId: string; revision: number; materialsRevision?: number; turnIndex: number; language: string; history: History; audio: Audio };
export type PracticeTurnResult = { kind: 'silence' } | { kind: 'reply'; transcript: string; understood: boolean; reply: { text: string; audioBase64: string; mimeType: string } };

const TURN_KEYS = ['cookie', 'now', 'courseId', 'revision', 'materialsRevision', 'turnIndex', 'language', 'history', 'audio'];
const AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav'];
const MAX_AUDIO_BYTES = 1_000_000;
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;

// One spoken practice turn. Cost is reserved in a persistent ledger before the first provider call; the partner's
// context always comes from the owner's stored course, and a turn that may have been charged is never retried here.
export function createPracticeTurnService(options: Options) {
  const { directory, sessionSecret, maxReservedMicros, turnMicros, maxTurnsPerCourse = 20 } = options;
  if (!Number.isSafeInteger(maxReservedMicros) || maxReservedMicros <= 0 || !Number.isSafeInteger(turnMicros) || turnMicros <= 0 || !Number.isSafeInteger(maxTurnsPerCourse) || maxTurnsPerCourse <= 0) throw new Error('Invalid practice configuration');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(directory, 'practice.sqlite'));
  db.exec('CREATE TABLE IF NOT EXISTS practice_turns (seq INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, course TEXT NOT NULL, micros INTEGER NOT NULL, status TEXT NOT NULL, at INTEGER NOT NULL)');

  function reserve(owner: string, course: string, at: number) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const total = Number(db.prepare('SELECT COALESCE(SUM(micros),0) AS n FROM practice_turns').get()?.n);
      if (!Number.isSafeInteger(total) || total + turnMicros > maxReservedMicros) throw new Error('Practice budget exceeded');
      const used = Number(db.prepare('SELECT count(*) AS n FROM practice_turns WHERE owner=? AND course=?').get(owner, course)?.n);
      if (used >= maxTurnsPerCourse) throw new Error('Practice turn limit');
      const seq = Number(db.prepare('INSERT INTO practice_turns(owner,course,micros,status,at) VALUES(?,?,?,?,?)').run(owner, course, turnMicros, 'reserved', at).lastInsertRowid);
      db.exec('COMMIT');
      return seq;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  const mark = (seq: number, status: string) => db.prepare('UPDATE practice_turns SET status=? WHERE seq=?').run(status, seq);

  return {
    async turn(input: TurnInput): Promise<PracticeTurnResult> {
      if (!input || typeof input !== 'object' || Object.keys(input).some(key => !TURN_KEYS.includes(key))) throw new Error('Invalid practice turn');
      const { audio, history } = input;
      if (!audio || !(audio.bytes instanceof Uint8Array) || !audio.bytes.length || audio.bytes.length > MAX_AUDIO_BYTES || !AUDIO_TYPES.includes(audio.mimeType)) throw new Error('Invalid practice audio');
      if (!sceneLanguages.includes(input.language as SceneLanguage)) throw new Error('Invalid practice language');
      if (!Array.isArray(history) || history.length > 10 || history.some(item => !item || !text(item.learner, 500) || !text(item.partner, 500))) throw new Error('Invalid practice history');
      if (typeof input.courseId !== 'string' || !input.courseId || !Number.isSafeInteger(input.revision) || input.revision < 1 || !Number.isSafeInteger(input.turnIndex) || input.turnIndex < 0 || (input.materialsRevision !== undefined && (!Number.isSafeInteger(input.materialsRevision) || input.materialsRevision < 1))) throw new Error('Invalid practice turn');
      const owner = await ownerIdFromSessionCookie(input.cookie, sessionSecret, input.now);
      if (!owner) throw new Error('Authenticated session required');
      const course = await options.getCourse({ cookie: input.cookie, now: input.now, id: input.courseId, revision: input.revision, ...(input.materialsRevision !== undefined ? { materialsRevision: input.materialsRevision } : {}) });
      const turn = course.turns[input.turnIndex];
      const partner = course.lines.find(line => line.id === turn?.partnerLineId), learner = course.lines.find(line => line.id === turn?.learnerLineId);
      if (!turn || !partner || !learner) throw new Error('Invalid practice turn');

      const seq = reserve(owner, course.id, input.now ?? Date.now());
      try {
        const heard = await options.transcribe({ bytes: audio.bytes, mimeType: audio.mimeType });
        const transcript = typeof heard?.text === 'string' ? heard.text.trim() : '';
        if (!transcript) { mark(seq, 'silence'); return { kind: 'silence' }; }
        const answer = await options.respond({
          partnerLine: partner.text, expectedLearnerLine: learner.text,
          sceneLines: course.lines.map(line => ({ role: line.role, text: line.text })),
          transcript: transcript.slice(0, 500), history: history.map(item => ({ ...item })), language: input.language as SceneLanguage,
        });
        const reply = typeof answer?.reply === 'string' ? answer.reply.trim() : '';
        if (!reply || reply.length > 300 || typeof answer.understood !== 'boolean') throw new Error('Invalid reply');
        const spoken = await options.speak({ text: reply });
        if (!spoken || !(spoken.bytes instanceof Uint8Array) || !spoken.bytes.length || spoken.bytes.length > 4_000_000 || typeof spoken.mimeType !== 'string') throw new Error('Invalid speech');
        mark(seq, 'answered');
        return { kind: 'reply', transcript, understood: answer.understood, reply: { text: reply, audioBase64: Buffer.from(spoken.bytes).toString('base64'), mimeType: spoken.mimeType } };
      } catch {
        mark(seq, 'unknown'); // the provider may have charged; keep the reservation and let the learner decide to try again
        throw new Error('Practice turn failed');
      }
    },
  };
}

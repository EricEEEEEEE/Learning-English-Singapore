import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ownerIdFromSessionCookie } from './private-owner';
import { sceneLanguages, type SceneCourse, type SceneLanguage } from './scene-course';
import { sceneSafetyKind, type SceneSafetyKind } from './scene-safety';

type Audio = { bytes: Uint8Array; mimeType: string };
type PracticeCourse = { id: string; lines: Pick<SceneCourse['lines'][number], 'id' | 'role' | 'text'>[]; turns: SceneCourse['turns'] };
type History = { learner: string; partner: string }[];
export const practiceFocuses = ['normal', 'refusal', 'rephrase', 'unclear'] as const;
export const practiceModes = ['english', 'native'] as const;
export const practiceCorrections = ['normal', 'less'] as const;
export type PracticeFocus = typeof practiceFocuses[number];
export type PracticeCorrection = typeof practiceCorrections[number];
export type PracticeGoal = { revision: number; summary: string };
export type GoalChange = { summary: string; confirm: string };
export type PracticeContext = { partnerLine: string; expectedLearnerLine: string; sceneLines: { role: 'partner' | 'learner'; text: string }[]; transcript: string; history: History; language: SceneLanguage; focus: PracticeFocus; correction: PracticeCorrection; goal: PracticeGoal | null; safety: SceneSafetyKind | null };
export type PracticeAnswer = { reply: string; understood: boolean; done: boolean; coachNote: string | null; goalChange?: GoalChange | null };
export type NativeContext = Pick<PracticeContext, 'partnerLine' | 'expectedLearnerLine' | 'sceneLines' | 'transcript' | 'language' | 'safety'>;
export type NativeAnswer = { understood: boolean; suggestion: string | null };
export const MAX_COACH_NOTE = 120;
export const MAX_GOAL_SUMMARY = 120, MAX_GOAL_CONFIRM = 200, MAX_SUGGESTION_WORDS = 20;
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
// C9-1: a proposed goal change is exactly a short summary and the one question the partner asks to confirm it.
export function isGoalChange(value: unknown): value is GoalChange {
  return plain(value) && Object.keys(value).length === 2 && typeof value.summary === 'string' && typeof value.confirm === 'string'
    && !!value.summary.trim() && value.summary.trim().length <= MAX_GOAL_SUMMARY && !!value.confirm.trim() && value.confirm.trim().length <= MAX_GOAL_CONFIRM;
}
// C9-2: the suggestion is one short English sentence (Latin letters and punctuation only), at most 20 words.
export function isShortEnglish(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  return !!text && text.length <= 160 && /[A-Za-z]/.test(text) && /^[A-Za-z0-9\s.,!?'"\u2018\u2019\u201c\u201d\-\u2013\u2014:;()&$%/\u2026]+$/.test(text) && text.split(/\s+/).length <= MAX_SUGGESTION_WORDS;
}
export function isNativeAnswer(value: unknown): value is NativeAnswer {
  return plain(value) && typeof value.understood === 'boolean' && (value.understood ? isShortEnglish(value.suggestion) : value.suggestion === null);
}
// The coach never judges sound from a transcript: a note about pronunciation or accent is dropped, the reply kept.
const SOUND_JUDGEMENT = /pronunc|accent|发音|發音|口音|発音|なまり|訛り|발음|억양|उच्चारण|लहजा|pelafalan|pengucapan|aksen|logat/i;
type Options = {
  directory: string; sessionSecret: string; maxReservedMicros: number; turnMicros: number; maxTurnsPerCourse?: number;
  getCourse: (input: { cookie?: string | null; now?: number; id: string; revision: number; materialsRevision?: number }) => Promise<PracticeCourse>;
  transcribe: (input: Audio & { language?: SceneLanguage }) => Promise<{ text: string }>;
  respond: (input: PracticeContext) => Promise<PracticeAnswer>;
  suggest?: (input: NativeContext) => Promise<NativeAnswer>;
  speak: (input: { text: string }) => Promise<{ bytes: Uint8Array; mimeType: string }>;
};
type TurnInput = { cookie?: string | null; now?: number; courseId: string; revision: number; materialsRevision?: number; turnIndex: number; language: string; history: History; audio: Audio; focus?: string; correction?: string; mode?: string; goal?: unknown };
type Spoken = { text: string; audioBase64: string; mimeType: string };
export type PracticeTurnResult = { kind: 'silence' }
  | { kind: 'reply'; transcript: string; understood: boolean; done: boolean; coachNote: string | null; goalChange: GoalChange | null; goalRevision: number; reply: Spoken }
  | { kind: 'native'; transcript: string; understood: boolean; suggestion: Spoken | null; goalRevision: number };

const TURN_KEYS = ['cookie', 'now', 'courseId', 'revision', 'materialsRevision', 'turnIndex', 'language', 'history', 'audio', 'focus', 'correction', 'mode', 'goal'];
// A confirmed goal from the page: its revision and the short summary the partner proposed and the learner accepted.
function parseGoal(value: unknown): PracticeGoal | null {
  if (value === undefined) return null;
  if (!plain(value) || Object.keys(value).some(key => !['revision', 'summary'].includes(key)) || !Number.isSafeInteger(value.revision) || (value.revision as number) < 1 || (value.revision as number) > 1000
    || typeof value.summary !== 'string' || !value.summary.trim() || value.summary.trim().length > MAX_GOAL_SUMMARY) throw new Error('Invalid practice turn');
  return { revision: value.revision as number, summary: value.summary.trim() };
}
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
      const focus = (input.focus ?? 'normal') as PracticeFocus, correction = (input.correction ?? 'normal') as PracticeCorrection;
      if (!practiceFocuses.includes(focus) || !practiceCorrections.includes(correction)) throw new Error('Invalid practice turn');
      const mode = input.mode ?? 'english';
      if (!(practiceModes as readonly unknown[]).includes(mode) || (mode === 'native' && !options.suggest)) throw new Error('Invalid practice turn');
      const goal = parseGoal(input.goal), goalRevision = goal?.revision ?? 0;
      if (!Array.isArray(history) || history.length > 10 || history.some(item => !item || !text(item.learner, 500) || !text(item.partner, 500))) throw new Error('Invalid practice history');
      if (typeof input.courseId !== 'string' || !input.courseId || !Number.isSafeInteger(input.revision) || input.revision < 1 || !Number.isSafeInteger(input.turnIndex) || input.turnIndex < 0 || (input.materialsRevision !== undefined && (!Number.isSafeInteger(input.materialsRevision) || input.materialsRevision < 1))) throw new Error('Invalid practice turn');
      const owner = await ownerIdFromSessionCookie(input.cookie, sessionSecret, input.now);
      if (!owner) throw new Error('Authenticated session required');
      const course = await options.getCourse({ cookie: input.cookie, now: input.now, id: input.courseId, revision: input.revision, ...(input.materialsRevision !== undefined ? { materialsRevision: input.materialsRevision } : {}) });
      const turn = course.turns[input.turnIndex];
      const partner = course.lines.find(line => line.id === turn?.partnerLineId), learner = course.lines.find(line => line.id === turn?.learnerLineId);
      if (!turn || !partner || !learner) throw new Error('Invalid practice turn');
      // C9-4: the same visible C8 rule, applied to the course's own lines.
      const safety = sceneSafetyKind({ description: course.lines.map(line => line.text).join(' '), keywords: {} });
      const sceneLines = course.lines.map(line => ({ role: line.role, text: line.text }));

      const seq = reserve(owner, course.id, input.now ?? Date.now());
      try {
        const language = input.language as SceneLanguage;
        // C9-2: speech in the help language is transcribed with that language; English turns keep the English request.
        const heard = await options.transcribe(mode === 'native' ? { bytes: audio.bytes, mimeType: audio.mimeType, language } : { bytes: audio.bytes, mimeType: audio.mimeType });
        const transcript = typeof heard?.text === 'string' ? heard.text.trim() : '';
        if (!transcript) { mark(seq, 'silence'); return { kind: 'silence' }; }
        if (mode === 'native') {
          // The partner waits: one short English line the learner can say, spoken in the reply voice, and no scene reply.
          const native = await options.suggest!({ partnerLine: partner.text, expectedLearnerLine: learner.text, sceneLines, transcript: transcript.slice(0, 500), language, safety });
          if (!isNativeAnswer(native)) throw new Error('Invalid suggestion');
          if (!native.understood) { mark(seq, 'answered'); return { kind: 'native', transcript, understood: false, suggestion: null, goalRevision }; }
          const text = (native.suggestion as string).trim();
          const voiced = await options.speak({ text });
          if (!voiced || !(voiced.bytes instanceof Uint8Array) || !voiced.bytes.length || voiced.bytes.length > 4_000_000 || typeof voiced.mimeType !== 'string') throw new Error('Invalid speech');
          mark(seq, 'answered');
          return { kind: 'native', transcript, understood: true, suggestion: { text, audioBase64: Buffer.from(voiced.bytes).toString('base64'), mimeType: voiced.mimeType }, goalRevision };
        }
        const answer = await options.respond({
          partnerLine: partner.text, expectedLearnerLine: learner.text, sceneLines,
          transcript: transcript.slice(0, 500), history: history.map(item => ({ ...item })), language, focus, correction, goal, safety,
        });
        const reply = typeof answer?.reply === 'string' ? answer.reply.trim() : '';
        if (!reply || reply.length > 300 || typeof answer.understood !== 'boolean' || typeof answer.done !== 'boolean') throw new Error('Invalid reply');
        if (answer.coachNote !== null && (typeof answer.coachNote !== 'string' || answer.coachNote.trim().length > MAX_COACH_NOTE)) throw new Error('Invalid reply');
        // C9-1: a goal change is optional; when present it is strictly shaped and never comes with a finished scene.
        const proposed = answer.goalChange ?? null;
        if (proposed !== null && (!isGoalChange(proposed) || answer.done)) throw new Error('Invalid reply');
        const goalChange = proposed ? { summary: proposed.summary.trim(), confirm: proposed.confirm.trim() } : null;
        let coachNote = typeof answer.coachNote === 'string' && answer.coachNote.trim() ? answer.coachNote.trim() : null;
        // Less correction: a note only when the meaning was unclear, so the needed clarification stays.
        if (coachNote && (SOUND_JUDGEMENT.test(coachNote) || (correction === 'less' && answer.understood))) coachNote = null;
        const spoken = await options.speak({ text: reply });
        if (!spoken || !(spoken.bytes instanceof Uint8Array) || !spoken.bytes.length || spoken.bytes.length > 4_000_000 || typeof spoken.mimeType !== 'string') throw new Error('Invalid speech');
        mark(seq, 'answered');
        return { kind: 'reply', transcript, understood: answer.understood, done: answer.done, coachNote, goalChange, goalRevision, reply: { text: reply, audioBase64: Buffer.from(spoken.bytes).toString('base64'), mimeType: spoken.mimeType } };
      } catch {
        mark(seq, 'unknown'); // the provider may have charged; keep the reservation and let the learner decide to try again
        throw new Error('Practice turn failed');
      }
    },
  };
}

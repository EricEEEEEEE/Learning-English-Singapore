import { validateLessonCandidate, type LessonRole, type SyntheticLesson } from './lesson-contract';

type LoopScope = 'all' | 'chapter' | 'sentence' | 'ab';
type FixedSentence = {
  id: string;
  role_id: string;
  text: string;
  action: string;
  chapter: number;
};
type Playback = {
  id: string;
  sentence_id: string;
  role_id: string;
  text: string;
  lesson_revision: string;
  lesson_fingerprint: string;
};
type Loop = { scope: LoopScope; start: number; end: number };

export type FixedLessonSession = {
  schema: 1;
  source: 'simulation';
  eligible_for_assessment: false;
  lesson_revision: string;
  lesson_fingerprint: string;
  scenario_version_id: string;
  goal_revision: number;
  user_goal: string;
  session_id: string;
  roles: LessonRole[];
  learner_role_id: string;
  partner_role_id: string;
  material: {
    lesson_revision: string;
    lesson_fingerprint: string;
    sentences: FixedSentence[];
  };
  mode: 'listen' | 'practice';
  position: number;
  loop: Loop;
  sequence: number;
  current_playback: Playback | null;
};

export type FixedLessonEvent =
  | { type: 'start-listening' | 'enter-practice' }
  | { type: 'set-loop'; scope: LoopScope; start_sentence_id: string; end_sentence_id: string }
  | { type: 'playback-ended'; playback_id: string; sentence_id: string; lesson_revision: string; lesson_fingerprint: string };

function fingerprint(value: SyntheticLesson): string {
  const input = JSON.stringify(value);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ (code + index), 0x85ebca6b) >>> 0;
  }
  return `${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}`;
}

function playback(state: FixedLessonSession, position: number): FixedLessonSession {
  const sentence = state.material.sentences[position];
  const sequence = state.sequence + 1;
  return {
    ...state,
    position,
    sequence,
    current_playback: {
      id: `${state.session_id}/${state.lesson_fingerprint}/playback-${sequence}`,
      sentence_id: sentence.id,
      role_id: sentence.role_id,
      text: sentence.text,
      lesson_revision: state.lesson_revision,
      lesson_fingerprint: state.lesson_fingerprint,
    },
  };
}

export function createFixedLessonSession(candidate: unknown, learnerRoleId: string): FixedLessonSession {
  const validated = validateLessonCandidate(candidate);
  if (!validated.ok) throw new Error(`Invalid lesson candidate: ${validated.issues.join(', ')}`);
  const lesson = validated.value;
  const learner = lesson.roles.find(role => role.id === learnerRoleId);
  if (!learner) throw new Error('Invalid learner role');
  const partner = lesson.roles.find(role => role.id !== learnerRoleId)!;
  const lessonFingerprint = fingerprint(lesson);
  const sentences = lesson.sentences.map((sentence, index) => ({
    id: sentence.id,
    role_id: sentence.role_id,
    text: sentence.text,
    action: sentence.action,
    chapter: Math.floor(index / 2) + 1,
  }));
  return {
    schema: 1,
    source: 'simulation',
    eligible_for_assessment: false,
    lesson_revision: lesson.lesson_revision,
    lesson_fingerprint: lessonFingerprint,
    scenario_version_id: lesson.scenario_version_id,
    goal_revision: lesson.goal_revision,
    user_goal: lesson.user_goal,
    session_id: crypto.randomUUID(),
    roles: lesson.roles.map(role => ({ ...role })),
    learner_role_id: learner.id,
    partner_role_id: partner.id,
    material: {
      lesson_revision: lesson.lesson_revision,
      lesson_fingerprint: lessonFingerprint,
      sentences,
    },
    mode: 'listen',
    position: 0,
    loop: { scope: 'all', start: 0, end: sentences.length - 1 },
    sequence: 0,
    current_playback: null,
  };
}

function indexOf(state: FixedLessonSession, sentenceId: string): number {
  return state.material.sentences.findIndex(sentence => sentence.id === sentenceId);
}

function loopFor(state: FixedLessonSession, event: Extract<FixedLessonEvent, { type: 'set-loop' }>): Loop | null {
  const sentences = state.material.sentences;
  const start = indexOf(state, event.start_sentence_id);
  const end = indexOf(state, event.end_sentence_id);
  if (start < 0 || end < start) return null;
  if (event.scope === 'all') return { scope: 'all', start: 0, end: sentences.length - 1 };
  if (event.scope === 'sentence') return start === end ? { scope: 'sentence', start, end } : null;
  if (event.scope === 'chapter' && sentences[start].chapter !== sentences[end].chapter) return null;
  return { scope: event.scope, start, end };
}

export function applyFixedLessonEvent(state: FixedLessonSession, event: FixedLessonEvent): FixedLessonSession {
  if (event.type === 'set-loop') {
    const loop = loopFor(state, event);
    return loop ? { ...state, mode: 'listen', position: loop.start, loop, current_playback: null } : state;
  }
  if (event.type === 'start-listening') return playback({ ...state, mode: 'listen' }, state.position);
  if (event.type === 'enter-practice') {
    const opening = state.material.sentences.findIndex(sentence => sentence.role_id === state.partner_role_id);
    return playback({ ...state, mode: 'practice' }, opening);
  }
  if (event.type !== 'playback-ended') return state;
  const current = state.current_playback;
  if (!current || event.playback_id !== current.id || event.sentence_id !== current.sentence_id ||
    event.lesson_revision !== state.lesson_revision || event.lesson_fingerprint !== state.lesson_fingerprint) return state;
  if (state.mode === 'practice') return { ...state, current_playback: null };
  const position = state.position < state.loop.start || state.position >= state.loop.end ? state.loop.start : state.position + 1;
  return playback(state, position);
}

export function replaceFixedLesson(state: FixedLessonSession, candidate: unknown): FixedLessonSession {
  const next = createFixedLessonSession(candidate, state.learner_role_id);
  if (next.lesson_revision === state.lesson_revision || next.goal_revision <= state.goal_revision || next.scenario_version_id === state.scenario_version_id) return state;
  return next;
}

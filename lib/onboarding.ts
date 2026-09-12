export type ContentBand = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
export type Question = {
  id: string;
  key: string;
  kind: 'preference' | 'listening';
  topic: string;
  band?: ContentBand;
  options: { id: string; icon: string }[];
};
export type AnswerRecord = {
  firstChoiceId: string | null;
  latestChoiceId: string | null;
  response: 'choice' | 'unknown' | 'skipped' | null;
  promptPlayCount: number;
  replayCount: number;
  answerExposed: boolean;
  deviceFailure: boolean;
  firstChoiceHadAnswer: boolean;
  firstChoicePromptPlayed: boolean;
  firstChoiceDeviceFailure: boolean;
  evidenceSource: 'simulation';
  eligibleForAssessment: false;
};
export type OnboardingSession = {
  schema: 1;
  createdAt: string;
  status: 'active' | 'paused' | 'completed';
  phase: 'core' | 'optional';
  cursor: number;
  optionalUsed: number;
  records: Record<string, AnswerRecord>;
};
export type OnboardingEvent =
  | { type: 'answer'; questionId: string; choiceId: string | null; response: 'choice' | 'unknown' | 'skipped' }
  | { type: 'playback'; questionId: string; kind: 'prompt' | 'answer'; outcome: 'ended' | 'failed'; source: 'simulation' }
  | { type: 'back' | 'pause' | 'resume' | 'finish' | 'start-optional' };

function question(key: string, kind: Question['kind'], topic: string, options: string[], band?: ContentBand): Question {
  return { id: `intro-v1:${key}`, key, kind, topic, band, options: options.map(id => ({ id, icon: id })) };
}
const preferences = [
  question('experience', 'preference', 'experience', ['new', 'words', 'simple', 'natural']),
  question('situation', 'preference', 'purpose', ['school', 'work', 'daily', 'own']),
  question('voice', 'preference', 'conditions', ['speak', 'quiet', 'listen']),
  question('time', 'preference', 'conditions', ['short', 'medium', 'long']),
  question('support', 'preference', 'support', ['show', 'twoChoices', 'wait']),
];
const foundation = [
  question('foundation-drink', 'listening', 'daily', ['coffee', 'water', 'tea'], 'L0'),
  question('foundation-greeting', 'listening', 'school', ['wave', 'enter', 'leave'], 'L0'),
  question('foundation-time', 'listening', 'school', ['morning', 'noon', 'evening'], 'L1'),
  question('foundation-number', 'listening', 'daily', ['one', 'two', 'three'], 'L1'),
  question('foundation-action', 'listening', 'work', ['wait', 'enter', 'take'], 'L1'),
  question('foundation-place', 'listening', 'school', ['here', 'upstairs', 'outside'], 'L1'),
  question('foundation-direction', 'listening', 'transport', ['left', 'right', 'straight'], 'L1'),
];
const natural = [
  question('natural-order', 'listening', 'work', ['waitThenEnter', 'enterThenWait', 'wait'], 'L2'),
  question('natural-plan', 'listening', 'school', ['morning', 'afternoon', 'tomorrow'], 'L2'),
  question('natural-appointment', 'listening', 'clinic', ['cancel', 'move', 'confirm'], 'L3'),
  question('natural-response', 'listening', 'work', ['cannot', 'repeat', 'ready'], 'L3'),
  question('natural-number', 'listening', 'daily', ['one', 'two', 'three'], 'L1'),
  question('natural-direction', 'listening', 'transport', ['left', 'right', 'straight'], 'L1'),
  question('natural-local', 'listening', 'daily', ['repeat', 'slow', 'anotherWay'], 'L4'),
];
const optionalFoundation = foundation.slice(0, 4).map(q => ({ ...q, id: `intro-v1:extra-${q.key}`, key: `extra-${q.key}` }));
const optionalNatural = [natural[4], natural[1], natural[2], natural[6]].map(q => ({ ...q, id: `intro-v1:extra-${q.key}`, key: `extra-${q.key}` }));
const allQuestions = [...preferences, ...foundation, ...natural, ...optionalFoundation, ...optionalNatural];

export function createOnboardingSession(): OnboardingSession {
  return { schema: 1, createdAt: new Date().toISOString(), status: 'active', phase: 'core', cursor: 0, optionalUsed: 0, records: {} };
}

function pathFor(session: OnboardingSession): Question[] {
  const prior = session.records[preferences[0].id]?.latestChoiceId;
  const useNatural = prior === 'natural' || prior === 'simple';
  return session.phase === 'core'
    ? [...preferences, ...(useNatural ? natural : foundation)]
    : (useNatural ? optionalNatural : optionalFoundation);
}

export function getCurrentQuestion(session: OnboardingSession): Question | null {
  return session.status === 'active' ? pathFor(session)[session.cursor] ?? null : null;
}

export function canStartOptional(session: OnboardingSession): boolean {
  return session.status === 'completed' && session.optionalUsed < 4 &&
    (session.phase === 'optional' || session.cursor === 12);
}

function emptyRecord(): AnswerRecord {
  return { firstChoiceId: null, latestChoiceId: null, response: null, promptPlayCount: 0, replayCount: 0,
    answerExposed: false, deviceFailure: false, firstChoiceHadAnswer: false, firstChoicePromptPlayed: false,
    firstChoiceDeviceFailure: false, evidenceSource: 'simulation', eligibleForAssessment: false };
}

export function applyOnboardingEvent(session: OnboardingSession, event: OnboardingEvent): OnboardingSession {
  if (event.type === 'resume') return session.status === 'paused' ? { ...session, status: 'active' } : session;
  if (event.type === 'start-optional') return canStartOptional(session)
    ? { ...session, status: 'active', phase: 'optional', cursor: session.optionalUsed } : session;
  if (event.type === 'finish') return session.status !== 'completed' ? { ...session, status: 'completed' } : session;
  if (session.status !== 'active') return session;
  if (event.type === 'pause') return { ...session, status: 'paused' };
  if (event.type === 'back') return session.cursor > 0 ? { ...session, cursor: session.cursor - 1 } : session;
  if (event.type !== 'answer' && event.type !== 'playback') return session;
  const current = getCurrentQuestion(session);
  if (!current || event.questionId !== current.id) return session;
  const before = session.records[current.id] ?? emptyRecord();
  if (event.type === 'playback') {
    if (current.kind !== 'listening' || event.source !== 'simulation') return session;
    const record = { ...before };
    if (event.outcome === 'failed') record.deviceFailure = true;
    else if (event.kind === 'answer') record.answerExposed = true;
    else {
      record.promptPlayCount += 1;
      record.replayCount = Math.max(0, record.promptPlayCount - 1);
    }
    return { ...session, records: { ...session.records, [current.id]: record } };
  }
  if (!['choice', 'unknown', 'skipped'].includes(event.response)) return session;
  if (event.response === 'choice' && !current.options.some(option => option.id === event.choiceId)) return session;
  const selected = event.response === 'choice' ? event.choiceId : null;
  const record: AnswerRecord = { ...before, response: event.response, latestChoiceId: selected };
  if (before.response === null) {
    record.firstChoiceId = selected;
    record.firstChoiceHadAnswer = before.answerExposed;
    record.firstChoicePromptPlayed = before.promptPlayCount > 0;
    record.firstChoiceDeviceFailure = before.deviceFailure;
  }
  const cursor = session.cursor + 1;
  return { ...session, cursor, status: cursor === pathFor(session).length ? 'completed' : 'active',
    optionalUsed: session.phase === 'optional' ? Math.max(session.optionalUsed, cursor) : session.optionalUsed,
    records: { ...session.records, [current.id]: record } };
}

// Local snapshots are untrusted and may belong to an older version. Reject an
// invalid snapshot visibly in the UI rather than losing history silently.
export function readOnboardingSession(raw: string | null): OnboardingSession | null {
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('Invalid guide snapshot');
  const data = value as OnboardingSession;
  if (data.schema !== 1 || !['active', 'paused', 'completed'].includes(data.status) ||
      !['core', 'optional'].includes(data.phase) || !Number.isInteger(data.cursor) || data.cursor < 0 ||
      data.cursor > (data.phase === 'core' ? 12 : 4) ||
      (data.status !== 'completed' && data.cursor === (data.phase === 'core' ? 12 : 4)) ||
      !Number.isInteger(data.optionalUsed) || data.optionalUsed < 0 || data.optionalUsed > 4 ||
      typeof data.createdAt !== 'string' || !Number.isFinite(Date.parse(data.createdAt)) ||
      !data.records || typeof data.records !== 'object' || Array.isArray(data.records)) throw new Error('Invalid guide snapshot');
  for (const [id, record] of Object.entries(data.records)) {
    const item = allQuestions.find(q => q.id === id);
    if (!item || !record || typeof record !== 'object' || record.evidenceSource !== 'simulation' ||
        record.eligibleForAssessment !== false || ![null, 'choice', 'unknown', 'skipped'].includes(record.response) ||
        ![record.firstChoiceId, record.latestChoiceId].every(choice => choice === null || item.options.some(option => option.id === choice)) ||
        !Number.isInteger(record.promptPlayCount) || record.promptPlayCount < 0 ||
        record.replayCount !== Math.max(0, record.promptPlayCount - 1) ||
        !['answerExposed', 'deviceFailure', 'firstChoiceHadAnswer', 'firstChoicePromptPlayed', 'firstChoiceDeviceFailure']
          .every(key => typeof record[key as keyof AnswerRecord] === 'boolean')) throw new Error('Invalid guide record');
  }
  return data;
}

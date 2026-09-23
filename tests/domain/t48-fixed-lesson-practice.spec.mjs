import { test, expect } from '@playwright/test';

const fixed = () => import('../../lib/fixed-lesson-practice.ts');

function lesson(overrides = {}) {
  return {
    schema: 1,
    source: 'simulation',
    eligible_for_assessment: false,
    lesson_revision: 'scenario-1/lesson-1',
    scenario_version_id: 'scenario-1',
    goal_revision: 1,
    user_goal: 'Ask the teacher how to prepare.',
    content_band: 'L0',
    auxiliary_language: 'zh-Hans',
    roles: [
      { id: 'teacher', label: 'Teacher' },
      { id: 'parent', label: 'Parent' },
    ],
    sentences: [
      { id: 'line-1', role_id: 'teacher', language: 'en', text: 'Hello. How can I help?', action: 'greets', grounding: 'generic', source_refs: ['template:greeting'] },
      { id: 'line-2', role_id: 'parent', language: 'en', text: 'How can we prepare?', action: 'asks', grounding: 'user-goal', source_refs: ['user:goal'] },
      { id: 'line-3', role_id: 'teacher', language: 'en', text: 'Let me explain slowly.', action: 'offers help', grounding: 'generic', source_refs: ['template:general-help'] },
      { id: 'line-4', role_id: 'parent', language: 'en', text: 'Could you repeat that?', action: 'asks again', grounding: 'generic', source_refs: ['template:repair'] },
    ],
    unknown_facts: ['School-specific requirements are unknown.'],
    ...overrides,
  };
}

function exactEndEvent(state) {
  return {
    type: 'playback-ended',
    playback_id: state.current_playback.id,
    sentence_id: state.current_playback.sentence_id,
    lesson_revision: state.lesson_revision,
    lesson_fingerprint: state.lesson_fingerprint,
  };
}

test('T48 / F6.2,F11.4: the same validated lesson always has the same fixed material and fingerprint', async () => {
  const { createFixedLessonSession } = await fixed();
  const candidate = lesson();
  const before = structuredClone(candidate);
  const first = createFixedLessonSession(candidate, 'parent');
  const second = createFixedLessonSession(structuredClone(candidate), 'parent');

  expect(first.lesson_fingerprint).toBeTruthy();
  expect(second.lesson_fingerprint).toBe(first.lesson_fingerprint);
  expect(second.material).toEqual(first.material);
  expect(first.material.lesson_revision).toBe(candidate.lesson_revision);
  expect(first.material.lesson_fingerprint).toBe(first.lesson_fingerprint);
  expect(first.material.sentences.map(line => line.id)).toEqual(candidate.sentences.map(line => line.id));
  expect(first.source).toBe('simulation');
  expect(first.eligible_for_assessment).toBe(false);
  expect(candidate).toEqual(before);

  const changed = lesson({ sentences: lesson().sentences.map((line, index) => index === 2 ? { ...line, text: 'Please ask one clear question.' } : line) });
  expect(createFixedLessonSession(changed, 'parent').lesson_fingerprint).not.toBe(first.lesson_fingerprint);
});

test('T48 / F7.1: partner and opening are derived from the learner role, not role order or a hard-coded teacher', async () => {
  const { createFixedLessonSession, applyFixedLessonEvent } = await fixed();
  const reversed = lesson({ roles: [...lesson().roles].reverse() });
  let parentPractice = createFixedLessonSession(reversed, 'parent');
  parentPractice = applyFixedLessonEvent(parentPractice, { type: 'enter-practice' });
  expect(parentPractice.partner_role_id).toBe('teacher');
  expect(parentPractice.current_playback).toMatchObject({ sentence_id: 'line-1', role_id: 'teacher' });

  let teacherPractice = createFixedLessonSession(reversed, 'teacher');
  teacherPractice = applyFixedLessonEvent(teacherPractice, { type: 'enter-practice' });
  expect(teacherPractice.partner_role_id).toBe('parent');
  expect(teacherPractice.current_playback).toMatchObject({ sentence_id: 'line-2', role_id: 'parent' });
});

test('T48 / F6.2,F7.1: listening and practice use the same partner, first line and lesson version', async () => {
  const { createFixedLessonSession, applyFixedLessonEvent } = await fixed();
  let state = createFixedLessonSession(lesson(), 'parent');
  state = applyFixedLessonEvent(state, { type: 'start-listening' });
  const listened = structuredClone(state.current_playback);
  expect(listened).toMatchObject({ sentence_id: 'line-1', role_id: 'teacher', text: 'Hello. How can I help?' });

  state = applyFixedLessonEvent(state, { type: 'enter-practice' });
  expect(state.mode).toBe('practice');
  expect(state.partner_role_id).toBe('teacher');
  expect(state.current_playback).toMatchObject({
    sentence_id: listened.sentence_id,
    role_id: listened.role_id,
    text: listened.text,
    lesson_revision: state.lesson_revision,
    lesson_fingerprint: state.lesson_fingerprint,
  });
  expect(state.material.sentences.find(line => line.id === listened.sentence_id).text).toBe(listened.text);
});

for (const [scope, start, end, expected] of [
  ['all', 'line-1', 'line-4', ['line-1', 'line-2', 'line-3', 'line-4', 'line-1']],
  ['chapter', 'line-1', 'line-2', ['line-1', 'line-2', 'line-1', 'line-2', 'line-1']],
  ['sentence', 'line-3', 'line-3', ['line-3', 'line-3', 'line-3', 'line-3', 'line-3']],
  ['ab', 'line-2', 'line-3', ['line-2', 'line-3', 'line-2', 'line-3', 'line-2']],
]) test(`T48 / F6.3,F6.5: ${scope} repeats fixed sentence ids without changing the lesson`, async () => {
  const { createFixedLessonSession, applyFixedLessonEvent } = await fixed();
  let state = createFixedLessonSession(lesson(), 'parent');
  const material = structuredClone(state.material);
  state = applyFixedLessonEvent(state, { type: 'set-loop', scope, start_sentence_id: start, end_sentence_id: end });
  state = applyFixedLessonEvent(state, { type: 'start-listening' });
  const heard = [];
  for (let index = 0; index < 5; index += 1) {
    heard.push(state.current_playback.sentence_id);
    state = applyFixedLessonEvent(state, exactEndEvent(state));
  }
  expect(heard).toEqual(expected);
  expect(state.material).toEqual(material);
  expect(state.lesson_fingerprint).toBe(material.lesson_fingerprint);
});

test('T48 / F11.1,F11.4: wrong sentence, stale revision and cross-version playback events are ignored', async () => {
  const { createFixedLessonSession, applyFixedLessonEvent } = await fixed();
  let state = createFixedLessonSession(lesson(), 'parent');
  state = applyFixedLessonEvent(state, { type: 'start-listening' });
  const snapshot = structuredClone(state);
  for (const changed of [
    { sentence_id: 'missing-line' },
    { lesson_revision: 'scenario-old/lesson-old' },
    { lesson_fingerprint: `${state.lesson_fingerprint}-forged` },
    { playback_id: 'old-playback' },
  ]) {
    expect(applyFixedLessonEvent(state, { ...exactEndEvent(state), ...changed })).toEqual(snapshot);
  }
  expect(applyFixedLessonEvent(state, exactEndEvent(state)).position).toBe(1);
});

test('T48 / F11.4: changed content cannot replace a played revision, while a new revision starts cleanly', async () => {
  const { createFixedLessonSession, replaceFixedLesson, applyFixedLessonEvent } = await fixed();
  let state = createFixedLessonSession(lesson(), 'parent');
  state = applyFixedLessonEvent(state, { type: 'start-listening' });
  const oldPlayback = exactEndEvent(state);
  const sameRevisionChanged = lesson({
    user_goal: 'Ask about a different school task.',
    sentences: lesson().sentences.map((line, index) => index === 1 ? { ...line, text: 'What should we bring?' } : line),
  });
  const oldSnapshot = structuredClone(state);
  expect(replaceFixedLesson(state, sameRevisionChanged)).toEqual(oldSnapshot);
  expect(state).toEqual(oldSnapshot);

  const newRevision = { ...sameRevisionChanged, lesson_revision: 'scenario-2/lesson-2', scenario_version_id: 'scenario-2', goal_revision: 2 };
  const next = replaceFixedLesson(state, newRevision);
  expect(next.lesson_revision).toBe('scenario-2/lesson-2');
  expect(next.lesson_fingerprint).not.toBe(state.lesson_fingerprint);
  expect(next.user_goal).toBe(sameRevisionChanged.user_goal);
  expect(next.material.sentences.find(line => line.id === 'line-2').text).toBe('What should we bring?');
  expect(next.position).toBe(0);
  expect(next.current_playback).toBeNull();
  expect(applyFixedLessonEvent(next, oldPlayback)).toEqual(next);
});

test('T48 / F6.2,F11.4: invalid lesson, learner role and loop ids fail safely', async () => {
  const { createFixedLessonSession, applyFixedLessonEvent } = await fixed();
  expect(() => createFixedLessonSession({ ...lesson(), source: 'openai' }, 'parent')).toThrow(/lesson|candidate|valid/i);
  const duplicateSentence = lesson();
  duplicateSentence.sentences[1].id = 'line-1';
  expect(() => createFixedLessonSession(duplicateSentence, 'parent')).toThrow(/lesson|candidate|valid/i);
  expect(() => createFixedLessonSession(lesson(), 'visitor')).toThrow(/role/i);

  let state = createFixedLessonSession(lesson(), 'parent');
  const before = structuredClone(state);
  for (const event of [
    { type: 'set-loop', scope: 'sentence', start_sentence_id: 'missing', end_sentence_id: 'missing' },
    { type: 'set-loop', scope: 'ab', start_sentence_id: 'line-3', end_sentence_id: 'line-2' },
    { type: 'set-loop', scope: 'chapter', start_sentence_id: 'missing', end_sentence_id: 'missing' },
  ]) expect(applyFixedLessonEvent(state, event)).toEqual(before);
});

import { test, expect } from '@playwright/test';

const contract = () => import('../../lib/lesson-contract.ts');

function validLesson() {
  return {
    schema: 1,
    source: 'simulation',
    eligible_for_assessment: false,
    lesson_revision: 'scenario-1/lesson-1',
    scenario_version_id: 'scenario-1',
    goal_revision: 1,
    user_goal: 'Ask the teacher how my child can prepare for sports day.',
    content_band: 'L0',
    auxiliary_language: 'zh-Hans',
    roles: [
      { id: 'teacher', label: 'Teacher' },
      { id: 'parent', label: 'Parent' },
    ],
    sentences: [
      {
        id: 'line-1', role_id: 'teacher', language: 'en',
        text: 'Hello. How can I help?', action: 'greets slowly',
        grounding: 'generic', source_refs: ['template:greeting'],
      },
      {
        id: 'line-2', role_id: 'parent', language: 'en',
        text: 'How can we prepare?', action: 'asks one question',
        grounding: 'user-goal', source_refs: ['user:goal'],
        support: { language: 'zh-Hans', text: '我们可以怎样准备？' },
      },
      {
        id: 'line-3', role_id: 'teacher', language: 'en',
        text: 'Let me explain slowly.', action: 'offers general help',
        grounding: 'generic', source_refs: ['template:general-help'],
      },
    ],
    unknown_facts: ['The school-specific sports day requirements are unknown.'],
  };
}

function expectRejectedWithoutMutation(validateLessonCandidate, candidate, issue) {
  const before = structuredClone(candidate);
  expect(validateLessonCandidate(candidate)).toMatchObject({
    ok: false,
    issues: expect.arrayContaining([issue]),
  });
  expect(candidate).toEqual(before);
}

test('T47 / F4.1,F4.2,F6.1: a short two-role simulation passes without mutating its input', async () => {
  const { validateLessonCandidate } = await contract();
  const candidate = validLesson();
  const before = structuredClone(candidate);
  const result = validateLessonCandidate(candidate);

  expect(result.ok).toBe(true);
  expect(result.value).toEqual(before);
  expect(candidate).toEqual(before);
  expect(result.value).not.toBe(candidate);
  expect(result.value.source).toBe('simulation');
  expect(result.value.eligible_for_assessment).toBe(false);
});

test('T47 / F4.1,F4.2: missing, duplicate and unknown roles are rejected', async () => {
  const { validateLessonCandidate } = await contract();
  const missingRole = validLesson();
  missingRole.roles = [missingRole.roles[0]];
  expect(validateLessonCandidate(missingRole)).toMatchObject({ ok: false, issues: expect.arrayContaining(['roles.exactly_two', 'sentences.unknown_role']) });

  const duplicateRole = validLesson();
  duplicateRole.roles[1].id = 'teacher';
  expect(validateLessonCandidate(duplicateRole)).toMatchObject({ ok: false, issues: expect.arrayContaining(['roles.unique_ids']) });

  for (const brokenRole of [{ id: '', label: 'Teacher' }, { id: 'teacher', label: '' }, {}]) {
    const incompleteRole = validLesson();
    incompleteRole.roles[0] = brokenRole;
    expectRejectedWithoutMutation(validateLessonCandidate, incompleteRole, 'roles.complete');
  }
});

test('T47 / F3.2,F4.1,F6.1: version, goal, level and action metadata are mandatory', async () => {
  const { validateLessonCandidate } = await contract();
  const cases = [
    ['lesson_revision', '', 'lesson_revision.required'],
    ['scenario_version_id', '', 'scenario_version_id.required'],
    ['goal_revision', 0, 'goal_revision.required'],
    ['user_goal', '   ', 'user_goal.required'],
    ['content_band', 'L9', 'content_band.invalid'],
  ];
  for (const [field, value, issue] of cases) {
    const candidate = validLesson();
    candidate[field] = value;
    expectRejectedWithoutMutation(validateLessonCandidate, candidate, issue);
  }

  const missingAction = validLesson();
  missingAction.sentences[1].action = '';
  expectRejectedWithoutMutation(validateLessonCandidate, missingAction, 'sentences.action_required');
});

test('T47 / F4.3,F6.1: duplicate sentence ids and a role mismatch never enter a lesson', async () => {
  const { validateLessonCandidate } = await contract();
  const candidate = validLesson();
  candidate.sentences[1].id = 'line-1';
  candidate.sentences[2].role_id = 'visitor';
  expect(validateLessonCandidate(candidate)).toMatchObject({
    ok: false,
    issues: expect.arrayContaining(['sentences.unique_ids', 'sentences.unknown_role']),
  });
});

test('T47 / F4.1,F4.2,F6.1: a lesson needs non-empty lines spoken by both roles', async () => {
  const { validateLessonCandidate } = await contract();
  const cases = [
    [[], 'sentences.required'],
    [[{ ...validLesson().sentences[0], id: '' }], 'sentences.complete'],
    [[{ ...validLesson().sentences[0], text: '   ' }], 'sentences.complete'],
    [validLesson().sentences.filter(sentence => sentence.role_id === 'teacher'), 'sentences.both_roles_required'],
  ];
  for (const [sentences, issue] of cases) {
    const candidate = validLesson();
    candidate.sentences = sentences;
    expectRejectedWithoutMutation(validateLessonCandidate, candidate, issue);
  }
});

test('T47 / F3.2,F4.3: L0 lines stay short instead of silently accepting advanced material', async () => {
  const { validateLessonCandidate } = await contract();
  const boundary = validLesson();
  boundary.sentences[0].text = 'Could you please explain the next step slowly?';
  expect(validateLessonCandidate(boundary).ok).toBe(true);

  for (const content_band of ['L0', 'L1', 'L2', 'L3', 'L4']) {
    const supportedBand = validLesson();
    supportedBand.content_band = content_band;
    expect(validateLessonCandidate(supportedBand).ok).toBe(true);
  }

  const candidate = validLesson();
  candidate.sentences[0].text = 'Hello, I would appreciate a comprehensive explanation of every administrative requirement today.';
  expectRejectedWithoutMutation(validateLessonCandidate, candidate, 'sentences.above_band_limit');
});

test('T47 / F3.4,F12.4: unverified school, government or medical claims are rejected', async () => {
  const { validateLessonCandidate } = await contract();
  for (const claim of [
    'Your school requires every parent to pay today.',
    'The government guarantees approval tomorrow.',
    'This medicine is always safe for your child.',
  ]) {
    const candidate = validLesson();
    candidate.sentences[2] = {
      ...candidate.sentences[2], text: claim, grounding: 'external-assertion', source_refs: ['web:unverified-claim'],
    };
    expectRejectedWithoutMutation(validateLessonCandidate, candidate, 'sentences.unverified_fact');
  }

  const userStatement = validLesson();
  userStatement.sentences[1].text = 'My child feels nervous.';
  userStatement.sentences[1].grounding = 'user-goal';
  userStatement.sentences[1].source_refs = ['user:goal'];
  expect(validateLessonCandidate(userStatement).ok).toBe(true);
});

test('T47 / F4.1,F4.3: English dialogue and auxiliary-language help cannot swap fields', async () => {
  const { validateLessonCandidate } = await contract();
  const wrongDialogueLanguage = validLesson();
  wrongDialogueLanguage.sentences[1].language = 'zh-Hans';
  expect(validateLessonCandidate(wrongDialogueLanguage)).toMatchObject({
    ok: false,
    issues: expect.arrayContaining(['sentences.english_required']),
  });

  const wrongSupportLanguage = validLesson();
  wrongSupportLanguage.sentences[1].support.language = 'en';
  expect(validateLessonCandidate(wrongSupportLanguage)).toMatchObject({
    ok: false,
    issues: expect.arrayContaining(['support.auxiliary_language_required']),
  });
});

test('T47 / F3.2,F3.4,F12.4: provenance and unknown facts cannot be omitted', async () => {
  const { validateLessonCandidate } = await contract();
  const noProvenance = validLesson();
  noProvenance.sentences[0].source_refs = [];
  expect(validateLessonCandidate(noProvenance)).toMatchObject({
    ok: false,
    issues: expect.arrayContaining(['sentences.source_required']),
  });

  const noUnknownBoundary = validLesson();
  noUnknownBoundary.unknown_facts = [];
  expect(validateLessonCandidate(noUnknownBoundary)).toMatchObject({
    ok: false,
    issues: expect.arrayContaining(['unknown_facts.required']),
  });
});

test('T47 / F6.1: a candidate cannot claim real generation or assessment eligibility', async () => {
  const { validateLessonCandidate } = await contract();
  const candidate = validLesson();
  candidate.source = 'openai';
  candidate.eligible_for_assessment = true;
  expect(validateLessonCandidate(candidate)).toMatchObject({
    ok: false,
    issues: expect.arrayContaining(['source.simulation_only', 'assessment.not_eligible']),
  });
});

test('T47 / F3.2,F4.1: malformed model output is safely rejected instead of throwing', async () => {
  const { validateLessonCandidate } = await contract();
  for (const malformed of [null, [], {}, { ...validLesson(), sentences: null }]) {
    expect(() => validateLessonCandidate(malformed)).not.toThrow();
    expect(validateLessonCandidate(malformed)).toMatchObject({ ok: false });
  }
});

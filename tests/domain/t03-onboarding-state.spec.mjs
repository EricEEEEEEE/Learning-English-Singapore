import { test, expect } from '@playwright/test';

const loadFlow = () => import('../../lib/onboarding.ts');
const answer = (flow, state, choiceId = null, response = 'unknown') => flow.applyOnboardingEvent(state, {
  type: 'answer', questionId: flow.getCurrentQuestion(state).id, choiceId, response,
});
const playback = (flow, state, kind = 'prompt', outcome = 'ended') => flow.applyOnboardingEvent(state, {
  type: 'playback', questionId: flow.getCurrentQuestion(state).id, kind, outcome, source: 'simulation',
});
function toListening(flow, state = flow.createOnboardingSession()) {
  for (let guard = 0; guard < 6; guard += 1) {
    if (flow.getCurrentQuestion(state).kind === 'listening') return state;
    state = answer(flow, state);
  }
  throw new Error('Expected a listening item after 4–6 preference questions');
}

test('T03: core and optional paths have separate hard caps and unique question identities', async () => {
  const flow = await loadFlow();
  let state = flow.createOnboardingSession();
  const core = [];
  for (let guard = 0; guard < 15 && flow.getCurrentQuestion(state); guard += 1) {
    const question = flow.getCurrentQuestion(state);
    expect(question.options.length).toBeGreaterThanOrEqual(2);
    expect(question.options.length).toBeLessThanOrEqual(4);
    core.push(question);
    state = answer(flow, state);
  }
  expect(core).toHaveLength(12);
  expect(core.filter(q => q.kind === 'preference')).toHaveLength(5);
  expect(core.filter(q => q.kind === 'listening')).toHaveLength(7);
  expect(new Set(core.map(q => q.id)).size).toBe(12);
  expect(state.status).toBe('completed');
  expect(flow.getCurrentQuestion(state)).toBeNull();
  const optional = [];
  state = flow.applyOnboardingEvent(state, { type: 'start-optional' });
  for (let guard = 0; guard < 5 && flow.getCurrentQuestion(state); guard += 1) {
    optional.push(flow.getCurrentQuestion(state).id);
    state = answer(flow, state);
  }
  expect(optional).toHaveLength(4);
  expect(new Set([...core.map(q => q.id), ...optional]).size).toBe(16);
  expect(flow.getCurrentQuestion(state)).toBeNull();
  expect(flow.getCurrentQuestion(flow.applyOnboardingEvent(state, { type: 'start-optional' }))).toBeNull();
});

for (const helpBeforeFirstChoice of [true, false]) {
  test(`T03: first answer, replay and full-answer history survive back and changed answers (help first=${helpBeforeFirstChoice})`, async () => {
    const flow = await loadFlow();
    let state = toListening(flow);
    const question = flow.getCurrentQuestion(state);
    const first = question.options[0].id;
    const second = question.options[1].id;
    state = playback(flow, state);
    state = playback(flow, state);
    if (helpBeforeFirstChoice) state = playback(flow, state, 'answer');
    state = answer(flow, state, first, 'choice');
    const keysBeforeReanswer = Object.keys(state.records).sort();
    const otherRecordsBefore = structuredClone(state.records);
    delete otherRecordsBefore[question.id];
    state = flow.applyOnboardingEvent(state, { type: 'back' });
    if (!helpBeforeFirstChoice) state = playback(flow, state, 'answer');
    state = answer(flow, state, second, 'choice');
    state = flow.applyOnboardingEvent(state, { type: 'back' });
    const record = structuredClone(state.records[question.id]);
    expect(record.firstChoiceId).toBe(first);
    expect(record.latestChoiceId).toBe(second);
    expect(record.response).toBe('choice');
    expect(record.promptPlayCount).toBe(2);
    expect(record.replayCount).toBe(1);
    expect(record.answerExposed).toBe(true);
    expect(record.firstChoiceHadAnswer).toBe(helpBeforeFirstChoice);
    expect(record.firstChoicePromptPlayed).toBe(true);
    expect(record.evidenceSource).toBe('simulation');
    expect(Object.keys(state.records).sort()).toEqual(keysBeforeReanswer);
    const otherRecordsAfter = structuredClone(state.records);
    delete otherRecordsAfter[question.id];
    expect(otherRecordsAfter).toEqual(otherRecordsBefore);
    const restored = flow.applyOnboardingEvent(JSON.parse(JSON.stringify(flow.applyOnboardingEvent(state, { type: 'pause' }))), { type: 'resume' });
    expect(restored.records[question.id]).toEqual(record);
    expect(flow.getCurrentQuestion(restored).id).toBe(question.id);
  });
}

test('T03: failed playback, unknown and skipped responses stay separate and never become played answers', async () => {
  const flow = await loadFlow();
  let state = toListening(flow);
  const failedId = flow.getCurrentQuestion(state).id;
  state = playback(flow, state, 'answer', 'failed');
  state = answer(flow, state);
  expect(state.records[failedId]).toMatchObject({ response: 'unknown', firstChoiceId: null, latestChoiceId: null,
    promptPlayCount: 0, replayCount: 0, answerExposed: false, deviceFailure: true,
    firstChoicePromptPlayed: false, firstChoiceDeviceFailure: true, evidenceSource: 'simulation' });
  const skippedId = flow.getCurrentQuestion(state).id;
  state = answer(flow, state, null, 'skipped');
  expect(state.records[skippedId]).toMatchObject({ response: 'skipped', firstChoiceId: null, latestChoiceId: null,
    answerExposed: false, deviceFailure: false, evidenceSource: 'simulation' });
  state = flow.applyOnboardingEvent(state, { type: 'back' });
  state = flow.applyOnboardingEvent(state, { type: 'back' });
  const option = flow.getCurrentQuestion(state).options[0].id;
  state = answer(flow, state, option, 'choice');
  expect(state.records[failedId].deviceFailure).toBe(true);
  expect(state.records[failedId].firstChoiceId).toBeNull();
  expect(state.records[failedId].latestChoiceId).toBe(option);
});

test('T03: pause/finish ignore late question events and an early finish does not force the minimum core length', async () => {
  const flow = await loadFlow();
  let state = toListening(flow);
  const question = flow.getCurrentQuestion(state);
  state = flow.applyOnboardingEvent(state, { type: 'pause' });
  const pausedSnapshot = structuredClone(state);
  expect(flow.applyOnboardingEvent(state, { type: 'playback', questionId: question.id, kind: 'answer', outcome: 'ended', source: 'simulation' })).toEqual(pausedSnapshot);
  state = flow.applyOnboardingEvent(state, { type: 'resume' });
  state = flow.applyOnboardingEvent(state, { type: 'finish' });
  expect(state.status).toBe('completed');
  expect(flow.getCurrentQuestion(state)).toBeNull();
  const completedSnapshot = structuredClone(state);
  expect(flow.applyOnboardingEvent(state, { type: 'answer', questionId: question.id, choiceId: question.options[0].id, response: 'choice' })).toEqual(completedSnapshot);
  const early = flow.applyOnboardingEvent(flow.createOnboardingSession(), { type: 'finish' });
  expect(early.status).toBe('completed');
  expect(Object.keys(early.records)).toHaveLength(0);
});

test('T03: changing self-report changes content identities without erasing earlier support evidence', async () => {
  const flow = await loadFlow();
  let state = flow.createOnboardingSession();
  const experience = flow.getCurrentQuestion(state);
  expect(experience.options.map(option => option.id)).toContain('new');
  expect(experience.options.map(option => option.id)).toContain('natural');
  state = answer(flow, state, 'new', 'choice');
  state = toListening(flow, state);
  const foundation = flow.getCurrentQuestion(state);
  let foundationWalk = structuredClone(state);
  for (let count = 0; count < 7; count += 1) {
    expect(flow.getCurrentQuestion(foundationWalk).band).toMatch(/^L[01]$/);
    foundationWalk = answer(flow, foundationWalk);
  }
  expect(flow.getCurrentQuestion(foundationWalk)).toBeNull();
  state = playback(flow, state, 'answer');
  const record = structuredClone(state.records[foundation.id]);
  for (let index = 0; index < 5; index += 1) state = flow.applyOnboardingEvent(state, { type: 'back' });
  expect(flow.getCurrentQuestion(state).id).toBe(experience.id);
  state = answer(flow, state, 'natural', 'choice');
  state = toListening(flow, state);
  expect(flow.getCurrentQuestion(state).id).not.toBe(foundation.id);
  expect(state.records[foundation.id]).toEqual(record);
  expect(state.records[experience.id].firstChoiceId).toBe('new');
  expect(state.records[experience.id].latestChoiceId).toBe('natural');
  const currentId = flow.getCurrentQuestion(state).id;
  const beforeLateEvent = structuredClone(state);
  const unchanged = flow.applyOnboardingEvent(state, { type: 'playback', questionId: foundation.id, kind: 'prompt', outcome: 'ended', source: 'simulation' });
  expect(unchanged).toEqual(beforeLateEvent);
  expect(unchanged.records[currentId]).toBeUndefined();
});

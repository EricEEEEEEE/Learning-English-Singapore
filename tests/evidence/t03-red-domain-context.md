# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: domain/t03-onboarding-state.spec.mjs >> T03: core and optional paths have separate hard caps and unique question identities
- Location: domain/t03-onboarding-state.spec.mjs:18:1

# Error details

```
Error: Cannot find module '/Users/eric/projects/Learning English  Singapore/lib/onboarding.ts' imported from /Users/eric/projects/Learning English  Singapore/tests/domain/t03-onboarding-state.spec.mjs
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
> 3   | const loadFlow = () => import('../../lib/onboarding.ts');
      |                        ^ Error: Cannot find module '/Users/eric/projects/Learning English  Singapore/lib/onboarding.ts' imported from /Users/eric/projects/Learning English  Singapore/tests/domain/t03-onboarding-state.spec.mjs
  4   | const answer = (flow, state, choiceId = null, response = 'unknown') => flow.applyOnboardingEvent(state, {
  5   |   type: 'answer', questionId: flow.getCurrentQuestion(state).id, choiceId, response,
  6   | });
  7   | const playback = (flow, state, kind = 'prompt', outcome = 'ended') => flow.applyOnboardingEvent(state, {
  8   |   type: 'playback', questionId: flow.getCurrentQuestion(state).id, kind, outcome, source: 'simulation',
  9   | });
  10  | function toListening(flow, state = flow.createOnboardingSession()) {
  11  |   for (let guard = 0; guard < 6; guard += 1) {
  12  |     if (flow.getCurrentQuestion(state).kind === 'listening') return state;
  13  |     state = answer(flow, state);
  14  |   }
  15  |   throw new Error('Expected a listening item after 4–6 preference questions');
  16  | }
  17  | 
  18  | test('T03: core and optional paths have separate hard caps and unique question identities', async () => {
  19  |   const flow = await loadFlow();
  20  |   let state = flow.createOnboardingSession();
  21  |   const core = [];
  22  |   for (let guard = 0; guard < 15 && flow.getCurrentQuestion(state); guard += 1) {
  23  |     const question = flow.getCurrentQuestion(state);
  24  |     expect(question.options.length).toBeGreaterThanOrEqual(2);
  25  |     expect(question.options.length).toBeLessThanOrEqual(4);
  26  |     core.push(question);
  27  |     state = answer(flow, state);
  28  |   }
  29  |   expect(core).toHaveLength(12);
  30  |   expect(core.filter(q => q.kind === 'preference')).toHaveLength(5);
  31  |   expect(core.filter(q => q.kind === 'listening')).toHaveLength(7);
  32  |   expect(new Set(core.map(q => q.id)).size).toBe(12);
  33  |   expect(state.status).toBe('completed');
  34  |   expect(flow.getCurrentQuestion(state)).toBeNull();
  35  |   const optional = [];
  36  |   state = flow.applyOnboardingEvent(state, { type: 'start-optional' });
  37  |   for (let guard = 0; guard < 5 && flow.getCurrentQuestion(state); guard += 1) {
  38  |     optional.push(flow.getCurrentQuestion(state).id);
  39  |     state = answer(flow, state);
  40  |   }
  41  |   expect(optional).toHaveLength(4);
  42  |   expect(new Set([...core.map(q => q.id), ...optional]).size).toBe(16);
  43  |   expect(flow.getCurrentQuestion(state)).toBeNull();
  44  |   expect(flow.getCurrentQuestion(flow.applyOnboardingEvent(state, { type: 'start-optional' }))).toBeNull();
  45  | });
  46  | 
  47  | for (const helpBeforeFirstChoice of [true, false]) {
  48  |   test(`T03: first answer, replay and full-answer history survive back and changed answers (help first=${helpBeforeFirstChoice})`, async () => {
  49  |     const flow = await loadFlow();
  50  |     let state = toListening(flow);
  51  |     const question = flow.getCurrentQuestion(state);
  52  |     const first = question.options[0].id;
  53  |     const second = question.options[1].id;
  54  |     state = playback(flow, state);
  55  |     state = playback(flow, state);
  56  |     if (helpBeforeFirstChoice) state = playback(flow, state, 'answer');
  57  |     state = answer(flow, state, first, 'choice');
  58  |     state = flow.applyOnboardingEvent(state, { type: 'back' });
  59  |     if (!helpBeforeFirstChoice) state = playback(flow, state, 'answer');
  60  |     state = answer(flow, state, second, 'choice');
  61  |     state = flow.applyOnboardingEvent(state, { type: 'back' });
  62  |     const record = state.records[question.id];
  63  |     expect(record.firstChoiceId).toBe(first);
  64  |     expect(record.latestChoiceId).toBe(second);
  65  |     expect(record.response).toBe('choice');
  66  |     expect(record.promptPlayCount).toBe(2);
  67  |     expect(record.replayCount).toBe(1);
  68  |     expect(record.answerExposed).toBe(true);
  69  |     expect(record.firstChoiceHadAnswer).toBe(helpBeforeFirstChoice);
  70  |     expect(record.firstChoicePromptPlayed).toBe(true);
  71  |     expect(record.evidenceSource).toBe('simulation');
  72  |     expect(Object.keys(state.records).filter(id => id === question.id)).toHaveLength(1);
  73  |     const restored = flow.applyOnboardingEvent(JSON.parse(JSON.stringify(flow.applyOnboardingEvent(state, { type: 'pause' }))), { type: 'resume' });
  74  |     expect(restored.records[question.id]).toEqual(record);
  75  |     expect(flow.getCurrentQuestion(restored).id).toBe(question.id);
  76  |   });
  77  | }
  78  | 
  79  | test('T03: failed playback, unknown and skipped responses stay separate and never become played answers', async () => {
  80  |   const flow = await loadFlow();
  81  |   let state = toListening(flow);
  82  |   const failedId = flow.getCurrentQuestion(state).id;
  83  |   state = playback(flow, state, 'answer', 'failed');
  84  |   state = answer(flow, state);
  85  |   expect(state.records[failedId]).toMatchObject({ response: 'unknown', firstChoiceId: null, latestChoiceId: null,
  86  |     promptPlayCount: 0, replayCount: 0, answerExposed: false, deviceFailure: true,
  87  |     firstChoicePromptPlayed: false, firstChoiceDeviceFailure: true, evidenceSource: 'simulation' });
  88  |   const skippedId = flow.getCurrentQuestion(state).id;
  89  |   state = answer(flow, state, null, 'skipped');
  90  |   expect(state.records[skippedId]).toMatchObject({ response: 'skipped', firstChoiceId: null, latestChoiceId: null,
  91  |     answerExposed: false, deviceFailure: false, evidenceSource: 'simulation' });
  92  |   state = flow.applyOnboardingEvent(state, { type: 'back' });
  93  |   state = flow.applyOnboardingEvent(state, { type: 'back' });
  94  |   const option = flow.getCurrentQuestion(state).options[0].id;
  95  |   state = answer(flow, state, option, 'choice');
  96  |   expect(state.records[failedId].deviceFailure).toBe(true);
  97  |   expect(state.records[failedId].firstChoiceId).toBeNull();
  98  |   expect(state.records[failedId].latestChoiceId).toBe(option);
  99  | });
  100 | 
  101 | test('T03: pause/finish ignore late question events and an early finish does not force the minimum core length', async () => {
  102 |   const flow = await loadFlow();
  103 |   let state = toListening(flow);
```
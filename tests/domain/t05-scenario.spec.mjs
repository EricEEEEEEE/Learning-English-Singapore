import { test, expect } from '@playwright/test';
const load = () => import('../../lib/scenario.ts');
const context = { content_band: 'L1', speed: 'slow', support: 'minimal', listening_status: 'unknown', speaking_status: 'unobserved' };
const customGoal = '陪邻居和物业确认电梯检修时间';
const nextGoal = '和物业确认楼梯照明损坏如何报修';
async function draft(goal = customGoal) {
  const flow = await load();
  let state = flow.createScenarioSession(context);
  state = flow.applyScenarioEvent(state, { type: 'choose-start', kind: 'custom' });
  state = flow.applyScenarioEvent(state, { type: 'describe', text: goal });
  return { flow, state };
}
const active = state => state.versions.find(version => version.id === state.active_version_id);
function step(flow, state, part, outcome = 'ready', overrides = {}) {
  const version = active(state);
  return flow.applyScenarioEvent(state, { type: 'demo-step', request_id: version.request_id,
    version_id: version.id, part, outcome, ...overrides });
}
function complete(flow, state) {
  for (const part of ['dialogue', 'media', 'check']) state = step(flow, state, part);
  return state;
}

test('T05: three seed categories and an unlisted goal all reach explicit confirmation, never real generation', async () => {
  const flow = await load();
  for (const kind of ['school', 'work', 'daily']) {
    const state = flow.applyScenarioEvent(flow.createScenarioSession(context), { type: 'choose-start', kind });
    expect(state.stage).toBe('confirming');
    expect(state.draft.origin).toBe(kind);
    expect(state.draft.goal.trim().length).toBeGreaterThan(0);
    expect(state.versions).toEqual([]);
  }
  const { state } = await draft();
  expect(state.stage).toBe('confirming');
  expect(state.draft.goal).toBe(customGoal);
  expect(state.draft.grounding_status).toBe('user-provided');
  expect(state.draft.unknown_facts.length).toBeGreaterThan(0);
  expect(state.versions).toEqual([]);
});

test('T05: three demo candidates retain the user goal and selecting a different focus changes the planned interaction', async () => {
  const { flow, state: original } = await draft();
  const originalSnapshot = structuredClone(original);
  const candidates = original.draft.candidates;
  expect(candidates).toHaveLength(3);
  expect(new Set(candidates.map(candidate => candidate.id)).size).toBe(3);
  for (const candidate of candidates) {
    expect(candidate.user_goal).toBe(customGoal);
    expect(candidate.grounding_status).toBe('user-provided');
    expect(candidate.source_refs).toEqual([]);
    expect(candidate.possible_intents.length).toBeGreaterThan(0);
    expect(candidate.open_branches.length).toBeGreaterThan(0);
    expect(candidate.unknown_facts).toEqual(original.draft.unknown_facts);
    expect(candidate.complexity_budget).toBe(1);
  }
  const initial = structuredClone(active(flow.applyScenarioEvent(original, { type: 'confirm' })));
  const changed = flow.applyScenarioEvent(original, { type: 'choose-candidate', candidate_id: candidates[1].id });
  const next = active(flow.applyScenarioEvent(changed, { type: 'confirm' }));
  expect(next.user_goal).toBe(customGoal);
  expect(next.plan.steps).not.toEqual(initial.plan.steps);
  expect(next.plan.practice_prompts).not.toEqual(initial.plan.practice_prompts);
  expect(next.plan.focus).toBe(candidates[1].focus);
  expect(changed.versions).toEqual([]);
  expect(original).toEqual(originalSnapshot);
});

test('T05: an empty description asks exactly one necessary question and preserves unknown facts', async () => {
  const { flow } = await draft();
  let state = flow.applyScenarioEvent(flow.createScenarioSession(context), { type: 'choose-start', kind: 'custom' });
  state = flow.applyScenarioEvent(state, { type: 'describe', text: '   ' });
  expect(state.stage).toBe('clarifying');
  expect(state.clarification).toEqual({ field: 'goal' });
  const before = structuredClone(state);
  expect(flow.applyScenarioEvent(state, { type: 'confirm' })).toEqual(before);
  state = flow.applyScenarioEvent(state, { type: 'clarify', value: customGoal });
  expect(state.stage).toBe('confirming');
  expect(state.draft.goal).toBe(customGoal);
  expect(state.draft.who).toBeNull();
  expect(state.draft.where).toBeNull();
  expect(state.draft.unknown_facts.length).toBeGreaterThan(0);
});

test('T05: confirmation creates a goal revision and simulation-only preparation tied to chosen learning support', async () => {
  const { flow, state: unconfirmed } = await draft();
  const before = structuredClone(unconfirmed);
  const state = flow.applyScenarioEvent(unconfirmed, { type: 'confirm' });
  const version = active(state);
  expect(state.stage).toBe('preparing');
  expect(version.goal_revision).toBe(1);
  expect(version.user_goal).toBe(customGoal);
  expect(version.learning_context).toEqual(context);
  expect(version.source).toBe('simulation');
  expect(version.real_media_ready).toBe(false);
  expect(version.preparation).toEqual({ dialogue: 'pending', media: 'pending', check: 'pending' });
  expect(version.unknown_facts).toEqual(unconfirmed.draft.unknown_facts);
  expect(unconfirmed).toEqual(before);
  const confirmedSnapshot = structuredClone(state);
  expect(flow.applyScenarioEvent(state, { type: 'confirm' })).toEqual(confirmedSnapshot);
});

test('T05: preparation is ordered and successful demo parts are idempotent', async () => {
  const { flow, state: draftState } = await draft();
  let state = flow.applyScenarioEvent(draftState, { type: 'confirm' });
  const before = structuredClone(state);
  expect(step(flow, state, 'media')).toEqual(before);
  expect(step(flow, state, 'check')).toEqual(before);
  state = step(flow, state, 'dialogue');
  const dialogue = structuredClone(active(state).artifacts.dialogue);
  expect(dialogue).toMatchObject({ source: 'simulation', goal_revision: 1 });
  expect(JSON.stringify(dialogue)).toContain(customGoal);
  const afterDialogue = structuredClone(state);
  expect(step(flow, state, 'dialogue')).toEqual(afterDialogue);
  state = step(flow, state, 'media');
  state = step(flow, state, 'check');
  expect(state.stage).toBe('ready');
  expect(active(state).real_media_ready).toBe(false);
  expect(active(state).artifacts.dialogue).toEqual(dialogue);
  expect(active(state).preparation).toEqual({ dialogue: 'ready', media: 'ready', check: 'ready' });
});

test('T05: media-only retry preserves completed dialogue and rejects late events from the previous attempt', async () => {
  const { flow, state: draftState } = await draft();
  let state = flow.applyScenarioEvent(draftState, { type: 'confirm' });
  state = step(flow, state, 'dialogue');
  state = step(flow, state, 'media', 'failed');
  expect(state.stage).toBe('partial');
  const before = structuredClone(state);
  const oldRequest = active(state).request_id;
  const dialogue = structuredClone(active(state).artifacts.dialogue);
  const restored = flow.readScenarioSession(JSON.stringify(state));
  expect(restored).toEqual(before);
  state = flow.applyScenarioEvent(restored, { type: 'retry-failed' });
  expect(active(state).request_id).not.toBe(oldRequest);
  expect(active(state).artifacts.dialogue).toEqual(dialogue);
  expect(active(state).preparation).toEqual({ dialogue: 'ready', media: 'pending', check: 'pending' });
  const retrySnapshot = structuredClone(state);
  expect(step(flow, state, 'media', 'ready', { request_id: oldRequest })).toEqual(retrySnapshot);
  state = step(flow, state, 'media');
  state = step(flow, state, 'check');
  expect(state.stage).toBe('ready');
  expect(active(state).artifacts.dialogue).toEqual(dialogue);
  expect(restored).toEqual(before);
});

for (const failedPart of ['dialogue', 'check']) {
  test(`T05: retry of ${failedPart} resumes the failed part and keeps other completed assets`, async () => {
    const { flow, state: draftState } = await draft();
    let state = flow.applyScenarioEvent(draftState, { type: 'confirm' });
    if (failedPart === 'check') { state = step(flow, state, 'dialogue'); state = step(flow, state, 'media'); }
    state = step(flow, state, failedPart, 'failed');
    const old = structuredClone(active(state).artifacts);
    state = flow.applyScenarioEvent(state, { type: 'retry-failed' });
    expect(active(state).artifacts).toEqual(old);
    if (failedPart === 'dialogue') { state = step(flow, state, 'dialogue'); state = step(flow, state, 'media'); }
    state = step(flow, state, 'check');
    expect(state.stage).toBe('ready');
  });
}

test('T05: cancellation is durable, keeps successful work and ignores all late completion events', async () => {
  const { flow, state: draftState } = await draft();
  let state = flow.applyScenarioEvent(draftState, { type: 'confirm' });
  state = step(flow, state, 'dialogue');
  const dialogue = structuredClone(active(state).artifacts.dialogue);
  state = flow.applyScenarioEvent(state, { type: 'cancel' });
  expect(state.stage).toBe('cancelled');
  const snapshot = structuredClone(state);
  expect(flow.readScenarioSession(JSON.stringify(state))).toEqual(snapshot);
  expect(step(flow, state, 'media')).toEqual(snapshot);
  expect(step(flow, state, 'check')).toEqual(snapshot);
  expect(active(state).artifacts.dialogue).toEqual(dialogue);
});

test('T05: a revised goal changes dialogue steps and practice prompts, keeping the old version and its assets intact', async () => {
  const { flow, state: draftState } = await draft();
  let state = complete(flow, flow.applyScenarioEvent(draftState, { type: 'confirm' }));
  const first = structuredClone(active(state));
  state = flow.applyScenarioEvent(state, { type: 'edit-goal' });
  state = flow.applyScenarioEvent(state, { type: 'edit-field', field: 'goal', value: nextGoal });
  expect(state.stage).toBe('confirming');
  expect(state.versions).toEqual([first]);
  state = flow.applyScenarioEvent(state, { type: 'confirm' });
  const second = active(state);
  expect(second.id).not.toBe(first.id);
  expect(second.goal_revision).toBe(2);
  expect(second.user_goal).toBe(nextGoal);
  expect(second.plan.steps).not.toEqual(first.plan.steps);
  expect(second.plan.practice_prompts).not.toEqual(first.plan.practice_prompts);
  expect(JSON.stringify(second.plan.steps)).toContain(nextGoal);
  expect(JSON.stringify(second.plan.practice_prompts)).toContain(nextGoal);
  expect(JSON.stringify(second.plan)).not.toContain(customGoal);
  expect(state.versions.find(version => version.id === first.id)).toEqual(first);
  const beforeLate = structuredClone(state);
  expect(step(flow, state, 'dialogue', 'ready', { version_id: first.id, request_id: first.request_id })).toEqual(beforeLate);
  state = complete(flow, state);
  state = flow.applyScenarioEvent(state, { type: 'view-version', version_id: first.id });
  expect(active(state)).toEqual(first);
  expect(state.stage).toBe('ready');
  expect(state.versions).toHaveLength(2);
});

test('T05: changing who/where/worry never silently confirms or invents institutional facts', async () => {
  const { flow, state: original } = await draft();
  const originalSnapshot = structuredClone(original);
  let state = original;
  for (const [field, value] of [['who','物业接待员'],['where','楼下服务处'],['worry','怕听不清时间']]) {
    state = flow.applyScenarioEvent(state, { type: 'edit-field', field, value });
    expect(state.draft[field]).toBe(value);
  }
  expect(state.stage).toBe('confirming');
  expect(state.versions).toEqual([]);
  expect(state.draft.goal).toBe(customGoal);
  expect(state.draft.unknown_facts).toEqual(originalSnapshot.draft.unknown_facts);
  expect(state.draft.grounding_status).toBe('user-provided');
  expect(original).toEqual(originalSnapshot);
});

test('T05: refresh preserves in-progress identity and malformed snapshots are rejected without silently replacing them', async () => {
  const { flow, state: draftState } = await draft();
  const state = step(flow, flow.applyScenarioEvent(draftState, { type: 'confirm' }), 'dialogue');
  expect(flow.readScenarioSession(JSON.stringify(state))).toEqual(state);
  expect(flow.readScenarioSession(null)).toBeNull();
  for (const raw of ['null','{bad','{"schema":999}',JSON.stringify({ ...state, active_version_id: 'missing' })]) {
    expect(() => flow.readScenarioSession(raw)).toThrow();
  }
});

test('T05: changing the goal during preparation isolates the new request from old late completions', async () => {
  const { flow, state: draftState } = await draft();
  let state = flow.applyScenarioEvent(draftState, { type: 'confirm' });
  state = step(flow, state, 'dialogue');
  const old = structuredClone(active(state));
  state = flow.applyScenarioEvent(state, { type: 'edit-goal' });
  state = flow.applyScenarioEvent(state, { type: 'edit-field', field: 'goal', value: nextGoal });
  state = flow.applyScenarioEvent(state, { type: 'confirm' });
  expect(active(state).goal_revision).toBe(2);
  expect(active(state).request_id).not.toBe(old.request_id);
  const beforeLate = structuredClone(state);
  expect(step(flow, state, 'media', 'ready', { version_id: old.id, request_id: old.request_id })).toEqual(beforeLate);
  expect(active(state).user_goal).toBe(nextGoal);
  expect(active(state).preparation.dialogue).toBe('pending');
});

test('T05: branching from an older version allocates the next global revision without changing either saved version', async () => {
  const { flow, state: draftState } = await draft();
  let state = complete(flow, flow.applyScenarioEvent(draftState, { type: 'confirm' }));
  const first = structuredClone(active(state));
  state = flow.applyScenarioEvent(state, { type: 'edit-goal' });
  state = flow.applyScenarioEvent(state, { type: 'edit-field', field: 'goal', value: nextGoal });
  state = complete(flow, flow.applyScenarioEvent(state, { type: 'confirm' }));
  const second = structuredClone(active(state));
  state = flow.applyScenarioEvent(state, { type: 'view-version', version_id: first.id });
  state = flow.applyScenarioEvent(state, { type: 'edit-goal' });
  state = flow.applyScenarioEvent(state, { type: 'edit-field', field: 'goal', value: '向物业确认包裹代收时间' });
  state = flow.applyScenarioEvent(state, { type: 'confirm' });
  expect(active(state).goal_revision).toBe(3);
  expect(new Set(state.versions.map(version => version.id)).size).toBe(3);
  expect(state.versions.map(version => version.goal_revision)).toEqual([1, 2, 3]);
  expect(state.versions.find(version => version.id === first.id)).toEqual(first);
  expect(state.versions.find(version => version.id === second.id)).toEqual(second);
});

test('T05: viewing a cancelled historical version never revives it or changes a newer preparing version', async () => {
  const { flow, state: draftState } = await draft();
  let state = flow.applyScenarioEvent(draftState, { type: 'confirm' });
  state = step(flow, state, 'dialogue');
  state = flow.applyScenarioEvent(state, { type: 'cancel' });
  const cancelled = structuredClone(active(state));
  state = flow.applyScenarioEvent(state, { type: 'edit-goal' });
  state = flow.applyScenarioEvent(state, { type: 'edit-field', field: 'goal', value: nextGoal });
  state = flow.applyScenarioEvent(state, { type: 'confirm' });
  const preparing = structuredClone(active(state));
  state = flow.applyScenarioEvent(state, { type: 'view-version', version_id: cancelled.id });
  expect(state.stage).toBe('cancelled');
  state = flow.readScenarioSession(JSON.stringify(state));
  expect(state.stage).toBe('cancelled');
  const beforeLate = structuredClone(state);
  expect(step(flow, state, 'media')).toEqual(beforeLate);
  state = flow.applyScenarioEvent(state, { type: 'view-version', version_id: preparing.id });
  expect(state.stage).toBe('preparing');
  expect(active(state)).toEqual(preparing);
  expect(state.versions.find(version => version.id === cancelled.id)).toEqual(cancelled);
});

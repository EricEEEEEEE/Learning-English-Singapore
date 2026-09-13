import { test, expect } from '@playwright/test';
import { applyScenarioEvent, createScenarioSession } from '../../lib/scenario.ts';
const load = () => import('../../lib/practice.ts');
const context = { content_band: 'L1', speed: 'slow', support: 'minimal', listening_status: 'unknown', speaking_status: 'unobserved' };
function sceneState() {
  let state = applyScenarioEvent(createScenarioSession(context), { type: 'choose-start', kind: 'school' });
  state = applyScenarioEvent(state, { type: 'confirm' });
  for (const part of ['dialogue','media','check']) {
    const version = state.versions.at(-1);
    state = applyScenarioEvent(state, { type: 'demo-step', version_id: version.id, request_id: version.request_id, part, outcome: 'ready' });
  }
  return state;
}
function scene() { return sceneState().versions.at(-1); }
async function session() { const flow = await load(); return { flow, version: scene(), state: flow.createPracticeSession(scene()) }; }
function apply(flow, state, type, rest = {}) { return flow.applyPracticeEvent(state, { type, ...rest }); }
function opening(flow, state) { return apply(flow, apply(flow, state, 'enter-practice'), 'allow-playback'); }
function ended(flow, state, at = 1000) {
  const utterance = state.current_utterance;
  state = apply(flow, state, 'playback-started', { utterance_id: utterance.id, goal_revision: state.goal_revision, at: at - 100, source: 'simulation' });
  return apply(flow, state, 'playback-ended', { utterance_id: utterance.id, goal_revision: state.goal_revision, at, source: 'simulation' });
}

test('T06: ready scenario yields two distinct roles and immutable demo material, never assessment or real media', async () => {
  const { flow, version, state } = await session();
  expect(state.scenario_version_id).toBe(version.id);
  expect(state.goal_revision).toBe(version.goal_revision);
  expect(state.user_goal).toBe(version.user_goal);
  expect(state.roles).toHaveLength(2);
  expect(new Set(state.roles.map(role => role.id)).size).toBe(2);
  expect(new Set(state.roles.map(role => role.voice_ref)).size).toBe(2);
  expect(state.material.sentences.length).toBeGreaterThanOrEqual(4);
  expect(new Set(state.material.sentences.map(sentence => sentence.role_id))).toEqual(new Set(state.roles.map(role => role.id)));
  expect(state.source).toBe('simulation');
  expect(state.eligible_for_assessment).toBe(false);
  expect(state.speaking_status).toBe('unobserved');
  expect(state.mode).toBe('listen');
  expect(state.preferences).toMatchObject({ auto_hints: true, wait_ms: 6000, speed: 'slow' });
  expect(() => flow.createPracticeSession({ ...version, status: 'preparing' })).toThrow();
});

test('T06: practice is available before completing a listen and the same partner opens only after a playback gesture', async () => {
  const { flow, state: initial } = await session();
  const before = structuredClone(initial);
  let state = apply(flow, initial, 'enter-practice');
  expect(state.mode).toBe('practice');
  expect(state.phase).toBe('needs_gesture');
  expect(state.awaiting_since_ms).toBeNull();
  expect(state.current_utterance).toBeNull();
  state = apply(flow, state, 'allow-playback');
  expect(state.phase).toBe('agent_opening');
  expect(state.current_utterance.role_id).toBe(initial.roles[0].id);
  expect(state.current_utterance.kind).toBe('opening');
  expect(state.roles).toEqual(before.roles);
  expect(state.material).toEqual(before.material);
  expect(initial).toEqual(before);
});

test('T06: neither response readiness, playback start nor elapsed wall time starts silence before the matching playback end', async () => {
  const { flow, state: initial } = await session();
  let state = opening(flow, initial);
  const id = state.current_utterance.id;
  state = apply(flow, state, 'response-ready', { utterance_id: id, at: 100 });
  state = apply(flow, state, 'playback-started', { utterance_id: id, goal_revision: state.goal_revision, at: 200, source: 'simulation' });
  state = apply(flow, state, 'tick', { at: 60000 });
  expect(state.automatic_hints).toBe(0);
  expect(state.awaiting_since_ms).toBeNull();
  state = apply(flow, state, 'playback-ended', { utterance_id: id, goal_revision: state.goal_revision, at: 60001, source: 'simulation' });
  expect(state.phase).toBe('awaiting_user');
  expect(state.awaiting_since_ms).toBe(60001);
  expect(apply(flow, state, 'tick', { at: 66000 }).automatic_hints).toBe(0);
  state = apply(flow, state, 'tick', { at: 66001 });
  expect(state.automatic_hints).toBe(1);
  expect(state.phase).toBe('guided_hint');
});

test('T06: each help waits for its own playback end, offers two meanings then returns to listening without a third nudge', async () => {
  const { flow, state: initial } = await session();
  let state = ended(flow, opening(flow, initial));
  state = apply(flow, state, 'tick', { at: 7000 });
  expect(state.automatic_hints).toBe(1);
  state = apply(flow, state, 'tick', { at: 100000 });
  expect(state.automatic_hints).toBe(1);
  state = ended(flow, state, 100001);
  state = apply(flow, state, 'tick', { at: 106001 });
  expect(state.phase).toBe('choice_support');
  expect(state.automatic_hints).toBe(2);
  expect(state.choices).toHaveLength(2);
  expect(new Set(state.choices.map(choice => choice.id)).size).toBe(2);
  state = ended(flow, state, 107001);
  state = apply(flow, state, 'tick', { at: 113001 });
  expect(state.mode).toBe('listen');
  expect(state.automatic_hints).toBe(2);
  state = apply(flow, state, 'tick', { at: 999999 });
  expect(state.automatic_hints).toBe(2);
  expect(state.speaking_status).toBe('unobserved');
});

for (const wait_ms of [10000,15000]) test(`T06: ${wait_ms}ms patience preference persists and uses the exact playback-end boundary`, async () => {
  const { flow, version, state: initial } = await session();
  let state = apply(flow, initial, 'set-preferences', { wait_ms });
  state = flow.readPracticeSession(JSON.stringify(state), version);
  state = ended(flow, opening(flow, state));
  expect(apply(flow, state, 'tick', { at: 1000 + wait_ms - 1 }).automatic_hints).toBe(0);
  expect(apply(flow, state, 'tick', { at: 1000 + wait_ms }).automatic_hints).toBe(1);
});

test('T06: disabling proactive help persists, keeps AI opening and leaves manual help available', async () => {
  const { flow, version, state: initial } = await session();
  let state = apply(flow, initial, 'set-preferences', { auto_hints: false });
  state = flow.readPracticeSession(JSON.stringify(state), version);
  state = opening(flow, state);
  expect(state.current_utterance.kind).toBe('opening');
  state = ended(flow, state);
  state = apply(flow, state, 'tick', { at: 999999 });
  expect(state.automatic_hints).toBe(0);
  expect(state.phase).toBe('awaiting_user');
  state = apply(flow, state, 'manual-help');
  expect(state.current_utterance.kind).toBe('hint1');
  expect(state.automatic_hints).toBe(0);
});

for (const type of ['think','speech-start','pause']) test(`T06: ${type} suppresses queued silence and resume requires a fresh partner playback`, async () => {
  const { flow, state: initial } = await session();
  let state = ended(flow, opening(flow, initial));
  state = apply(flow, state, type);
  expect(state.awaiting_since_ms).toBeNull();
  state = apply(flow, state, 'tick', { at: 999999 });
  expect(state.automatic_hints).toBe(0);
  state = apply(flow, state, type === 'speech-start' ? 'speech-finished' : 'resume');
  expect(state.current_utterance.role_id).toBe(initial.roles[0].id);
  expect(state.awaiting_since_ms).toBeNull();
  state = ended(flow, state, 1000000);
  expect(state.awaiting_since_ms).toBe(1000000);
  expect(state.speaking_status).toBe('unobserved');
});

for (const environment of [{ visible: false },{ connected: false },{ audible: false },{ microphone: 'denied' }]) {
  test(`T06: environment ${JSON.stringify(environment)} blocks nudges and never marks a speaking failure`, async () => {
    const { flow, state: initial } = await session();
    let state = ended(flow, opening(flow, initial));
    state = apply(flow, state, 'environment', environment);
    state = apply(flow, state, 'tick', { at: 999999 });
    expect(state.awaiting_since_ms).toBeNull();
    expect(state.automatic_hints).toBe(0);
    expect(state.current_utterance).toBeNull();
    expect(state.speaking_status).toBe('unobserved');
    const blocked = structuredClone(state);
    const listening = apply(flow, state, 'listen-only');
    expect(listening.mode).toBe('listen');
    expect(listening.eligible_for_assessment).toBe(false);
    state = apply(flow, blocked, 'environment', { visible:true, connected:true, audible:true, microphone:'unrequested' });
    expect(state.awaiting_since_ms).toBeNull();
    state = apply(flow, state, 'resume');
    expect(state.current_utterance.role_id).toBe(initial.roles[0].id);
    expect(state.awaiting_since_ms).toBeNull();
    state = ended(flow, state, 1000000);
    expect(state.awaiting_since_ms).toBe(1000000);
  });
}

test('T06: a choice or speech cancels a pending help response and stale utterance/version completion cannot reopen waiting', async () => {
  const { flow, state: initial } = await session();
  let state = apply(flow, ended(flow, opening(flow, initial)), 'tick', { at: 7000 });
  const old = structuredClone(state.current_utterance);
  state = apply(flow, state, 'speech-start');
  const speaking = structuredClone(state);
  expect(apply(flow, state, 'playback-ended', { utterance_id: old.id, goal_revision: state.goal_revision, at: 8000, source: 'simulation' })).toEqual(speaking);
  state = apply(flow, state, 'speech-finished');
  const replying = structuredClone(state);
  expect(apply(flow, state, 'playback-ended', { utterance_id: state.current_utterance.id, goal_revision: 999, at: 9000, source: 'simulation' })).toEqual(replying);
  state = ended(flow, state, 10000);
  state = apply(flow, state, 'tick', { at: 16000 });
  state = ended(flow, state, 17000);
  state = apply(flow, state, 'tick', { at: 23000 });
  expect(state.choices).toHaveLength(2);
  const choice = state.choices[1];
  state = apply(flow, state, 'choose-meaning', { choice_id: choice.id });
  expect(state.current_utterance.role_id).toBe(initial.roles[0].id);
  expect(state.current_utterance.kind).toBe('reply');
  expect(state.awaiting_since_ms).toBeNull();
  expect(state.speaking_status).toBe('unobserved');
});

test('T06: interruption and playback failure clear the old queue and preserve fixed material', async () => {
  const { flow, state: initial } = await session();
  for (const type of ['interrupt','playback-failed','end']) {
    let state = opening(flow, initial);
    const old = structuredClone(state.current_utterance);
    state = apply(flow, state, type, { utterance_id: old.id, goal_revision: state.goal_revision });
    const snapshot = structuredClone(state);
    expect(state.current_utterance).toBeNull();
    expect(state.awaiting_since_ms).toBeNull();
    expect(state.material).toEqual(initial.material);
    expect(apply(flow, state, 'playback-ended', { utterance_id: old.id, goal_revision: state.goal_revision, at: 10000, source: 'simulation' })).toEqual(snapshot);
  }
});

for (const scope of ['all','chapter','sentence','ab']) test(`T06: ${scope} looping, previous sentence and speed keep the same material and role voices`, async () => {
  const { flow, state: initial } = await session();
  const material = structuredClone(initial.material), roles = structuredClone(initial.roles);
  let state = apply(flow, initial, 'set-loop', { scope, start: 1, end: 2 });
  state = apply(flow, state, 'set-preferences', { speed: 'natural' });
  state = apply(flow, state, 'allow-playback');
  const heard = [];
  for (let turn = 0; turn < 8; turn += 1) {
    heard.push(state.current_utterance.text);
    state = ended(flow, state, 1000 * (turn + 1));
  }
  expect(state.material).toEqual(material);
  expect(state.roles).toEqual(roles);
  expect(heard.every(text => material.sentences.some(sentence => sentence.text === text))).toBe(true);
  if (scope === 'all') expect(heard).toEqual(Array.from({ length: 8 },(_, index) => material.sentences[index % material.sentences.length].text));
  if (scope === 'chapter') {
    const chapter = material.sentences.filter(sentence => sentence.chapter === material.sentences[1].chapter);
    expect(chapter.length).toBeGreaterThanOrEqual(2);
    expect(chapter.length).toBeLessThan(material.sentences.length);
    expect(heard).toEqual(Array.from({ length: 8 },(_, index) => chapter[index % chapter.length].text));
  }
  if (scope === 'sentence') expect(heard).toEqual(Array(8).fill(material.sentences[1].text));
  if (scope === 'ab') expect(heard).toEqual(Array.from({ length: 8 },(_, index) => material.sentences[1 + index % 2].text));
  const previousPosition = Math.max(0, state.position - 1);
  state = apply(flow, state, 'previous');
  expect(state.position).toBe(previousPosition);
  expect(state.current_utterance.text).toBe(material.sentences[previousPosition].text);
  expect(state.material).toEqual(material);
  state = apply(flow, state, 'pause');
  const position = state.position;
  state = apply(flow, state, 'tick', { at: 999999 });
  expect(state.position).toBe(position);
  expect(state.preferences.speed).toBe('natural');
});

test('T06: malformed or wrong-scenario records are rejected; reload keeps settings but never resumes an old wall-clock timer', async () => {
  const { flow, version, state: initial } = await session();
  const state = ended(flow, opening(flow, initial));
  const restored = flow.readPracticeSession(JSON.stringify(state), version);
  expect(restored.phase).toBe('paused');
  expect(restored.awaiting_since_ms).toBeNull();
  expect(restored.current_utterance).toBeNull();
  expect(restored.preferences).toEqual(state.preferences);
  expect(restored.material).toEqual(state.material);
  expect(restored.roles).toEqual(state.roles);
  expect(flow.readPracticeSession(null,version)).toBeNull();
  for (const raw of ['null','{broken',JSON.stringify({ ...state, schema: 99 }),JSON.stringify({ ...state, phase: ['awaiting_user'] }),JSON.stringify({ ...state, scenario_version_id: 'missing' })]) expect(() => flow.readPracticeSession(raw,version)).toThrow();
  const snapshot = structuredClone(state);
  expect(apply(flow,state,'tick',{at:500})).toEqual(snapshot);
});

for (const [start,end] of [[-1,1],[2,1],[0,999],[0.5,2]]) test(`T06: invalid A-B range ${start}..${end} is rejected without altering the playing material`, async () => {
  const { flow, state: initial } = await session();
  const state = apply(flow, initial, 'allow-playback');
  const before = structuredClone(state);
  expect(apply(flow, state, 'set-loop', { scope:'ab',start,end })).toEqual(before);
});

test('T06: unstarted or repeated ended and an old failed event are ignored without resetting the clock or stopping newer speech', async () => {
  const { flow,state:initial } = await session();
  let state = opening(flow,initial);
  const old = structuredClone(state.current_utterance), beforeStart = structuredClone(state);
  const endEvent = { utterance_id:old.id,goal_revision:state.goal_revision,source:'simulation' };
  expect(apply(flow,state,'playback-ended',{...endEvent,at:1000})).toEqual(beforeStart);
  state = ended(flow,state,1000);
  const waiting = structuredClone(state);
  expect(apply(flow,state,'playback-ended',{...endEvent,at:7000})).toEqual(waiting);
  expect(state.awaiting_since_ms).toBe(1000);
  state = apply(flow,state,'manual-help');
  const helping = structuredClone(state);
  expect(state.current_utterance.id).not.toBe(old.id);
  expect(apply(flow,state,'playback-failed',{utterance_id:old.id,goal_revision:state.goal_revision})).toEqual(helping);
});

test('T06: a real second confirmed goal has distinct lesson identity and cannot restore the previous goal’s practice', async () => {
  const flow = await load();
  let scenarios = sceneState();
  const first = structuredClone(scenarios.versions[0]);
  const practiceA = flow.createPracticeSession(first);
  scenarios = applyScenarioEvent(scenarios,{type:'edit-goal'});
  scenarios = applyScenarioEvent(scenarios,{type:'edit-field',field:'goal',value:'询问老师下一次可以联系的时间'});
  scenarios = applyScenarioEvent(scenarios,{type:'confirm'});
  for(const part of ['dialogue','media','check']) {
    const current = scenarios.versions.at(-1);
    scenarios = applyScenarioEvent(scenarios,{type:'demo-step',version_id:current.id,request_id:current.request_id,part,outcome:'ready'});
  }
  const second = scenarios.versions.at(-1), practiceB = flow.createPracticeSession(second);
  expect(second.goal_revision).toBe(2);
  expect(practiceB.scenario_version_id).toBe(second.id);
  expect(practiceB.user_goal).toBe(second.user_goal);
  expect(practiceB.material.id).not.toBe(practiceA.material.id);
  expect(practiceB.material).not.toEqual(practiceA.material);
  expect(practiceB.material.sentences).not.toEqual(practiceA.material.sentences);
  expect(practiceB.material.sentences.some(sentence => sentence.text.includes(second.user_goal))).toBe(true);
  expect(() => flow.readPracticeSession(JSON.stringify(practiceA),second)).toThrow();
  expect(scenarios.versions[0]).toEqual(first);
});

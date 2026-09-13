import type { ScenarioContext, ScenarioVersion } from './scenario';

type Phase = 'needs_gesture' | 'listening' | 'agent_opening' | 'awaiting_user' | 'guided_hint' | 'choice_support' | 'thinking' | 'user_speaking' | 'replying' | 'resuming' | 'paused' | 'disconnected' | 'microphone_denied' | 'inaudible' | 'background' | 'ended';
type Kind = 'lesson' | 'opening' | 'hint1' | 'hint2' | 'reply' | 'resume';
type Preferences = { auto_hints: boolean; wait_ms: 6000 | 10000 | 15000; speed: 'slow' | 'natural' };
type Environment = { visible: boolean; connected: boolean; audible: boolean; microphone: 'unrequested' | 'denied' };
type Sentence = { id: string; role_id: string; text: string; chapter: number };
type Utterance = { id: string; role_id: string; text: string; kind: Kind };
export type PracticeSession = {
  schema: 1; scenario_version_id: string; goal_revision: number; user_goal: string;
  learning_context: ScenarioContext; last_question: string;
  source: 'simulation'; eligible_for_assessment: false; speaking_status: 'unobserved';
  roles: { id: string; voice_ref: string }[]; material: { id: string; sentences: Sentence[] };
  mode: 'listen' | 'practice'; phase: Phase; preferences: Preferences; environment: Environment;
  position: number; loop: { scope: 'all' | 'chapter' | 'sentence' | 'ab'; start: number; end: number };
  current_utterance: Utterance | null; awaiting_since_ms: number | null; playback_started_at: number | null;
  automatic_hints: number; choices: { id: string }[]; sequence: number; has_playback_gesture: boolean;
};
export type PracticeEvent =
  | { type: 'enter-practice' | 'allow-playback' | 'think' | 'resume' | 'speech-start' | 'speech-finished' | 'manual-help' | 'pause' | 'interrupt' | 'listen-only' | 'end' | 'previous' }
  | { type: 'response-ready'; utterance_id: string; at: number }
  | { type: 'playback-started' | 'playback-ended'; utterance_id: string; goal_revision: number; at: number; source: 'simulation' }
  | { type: 'playback-failed'; utterance_id: string; goal_revision: number }
  | { type: 'tick'; at: number }
  | { type: 'choose-meaning'; choice_id: string }
  | ({ type: 'set-preferences' } & Partial<Preferences>)
  | ({ type: 'environment' } & Partial<Environment>)
  | { type: 'set-loop'; scope: PracticeSession['loop']['scope']; start: number; end: number };
const phases: Phase[] = ['needs_gesture','listening','agent_opening','awaiting_user','guided_hint','choice_support','thinking','user_speaking','replying','resuming','paused','disconnected','microphone_denied','inaudible','background','ended'];
const kinds: Kind[] = ['lesson','opening','hint1','hint2','reply','resume'];

export function createPracticeSession(version: ScenarioVersion): PracticeSession {
  if (version.status !== 'ready') throw new Error('Scenario is not ready for a demo');
  const roles = [{ id: 'partner', voice_ref: 'unconnected-demo-voice-a' }, { id: 'visitor', voice_ref: 'unconnected-demo-voice-b' }];
  const text = ['Hello. How can I help you?', `I would like to ask about: ${version.user_goal}`, 'What would you like to check?', 'Could you say that again, please?'];
  return {
    schema: 1, scenario_version_id: version.id, goal_revision: version.goal_revision, user_goal: version.user_goal,
    learning_context: structuredClone(version.learning_context), last_question: text[0],
    source: 'simulation', eligible_for_assessment: false, speaking_status: 'unobserved', roles,
    material: { id: `${version.id}/demo-lesson-v1`, sentences: text.map((text, index) => ({ id: `sentence-${index + 1}`, role_id: roles[index % 2].id, text, chapter: Math.floor(index / 2) + 1 })) },
    mode: 'listen', phase: 'needs_gesture', preferences: { auto_hints: true, wait_ms: 6000, speed: version.learning_context.speed },
    environment: { visible: true, connected: true, audible: true, microphone: 'unrequested' },
    position: 0, loop: { scope: 'all', start: 0, end: text.length - 1 }, current_utterance: null,
    awaiting_since_ms: null, playback_started_at: null, automatic_hints: 0, choices: [], sequence: 0, has_playback_gesture: false,
  };
}
function clear(state: PracticeSession, phase: Phase): PracticeSession {
  return { ...state, phase, current_utterance: null, awaiting_since_ms: null, playback_started_at: null, choices: [] };
}
function blocked(state: PracticeSession): Phase | null {
  const env = state.environment;
  return !env.visible ? 'background' : !env.connected ? 'disconnected' : !env.audible ? 'inaudible' : state.mode === 'practice' && env.microphone === 'denied' ? 'microphone_denied' : null;
}
function speak(state: PracticeSession, kind: Kind, repeatedText?: string): PracticeSession {
  const unavailable = blocked(state);
  if (unavailable) return clear(state, unavailable);
  if (!state.has_playback_gesture) return clear(state, 'needs_gesture');
  const fixed = state.material.sentences[state.position];
  const lines: Record<Exclude<Kind,'lesson'>, string> = {
    opening: 'Hello. How can I help you?', hint1: 'You can begin with: I would like to ask about…',
    hint2: 'Would you like to ask a question, or hear it again?', reply: 'Thank you. What would you like to check?', resume: 'Let us try again. How can I help you?',
  };
  const phase: Record<Kind, Phase> = { lesson: 'listening', opening: 'agent_opening', hint1: 'guided_hint', hint2: 'choice_support', reply: 'replying', resume: 'resuming' };
  const spoken = repeatedText ?? (kind === 'lesson' ? fixed.text : lines[kind]);
  return { ...state, last_question: ['opening','reply','resume'].includes(kind) ? spoken : state.last_question, phase: phase[kind], sequence: state.sequence + 1, awaiting_since_ms: null, playback_started_at: null,
    current_utterance: { id: `${state.scenario_version_id}/utterance-${state.sequence + 1}`, role_id: kind === 'lesson' ? fixed.role_id : state.roles[0].id, kind, text: spoken },
    choices: kind === 'hint2' ? [{ id: 'ask' }, { id: 'again' }] : [] };
}
function freshReply(state: PracticeSession, kind: 'reply' | 'resume', repeatedText?: string) {
  return speak({ ...state, automatic_hints: 0, has_playback_gesture: true }, kind, repeatedText);
}
export function applyPracticeEvent(state: PracticeSession, event: PracticeEvent): PracticeSession {
  switch (event.type) {
    case 'response-ready': return state;
    case 'set-preferences': {
      const next = { ...state.preferences };
      if (typeof event.auto_hints === 'boolean') next.auto_hints = event.auto_hints;
      if (event.wait_ms === 6000 || event.wait_ms === 10000 || event.wait_ms === 15000) next.wait_ms = event.wait_ms;
      if (event.speed === 'slow' || event.speed === 'natural') next.speed = event.speed;
      return { ...state, preferences: next };
    }
    case 'environment': {
      const environment = { ...state.environment };
      for (const key of ['visible','connected','audible'] as const) if (typeof event[key] === 'boolean') environment[key] = event[key];
      if (event.microphone === 'denied' || event.microphone === 'unrequested') environment.microphone = event.microphone;
      const next = { ...state, environment };
      const unavailable = blocked(next);
      return unavailable ? clear(next, unavailable) : next;
    }
    case 'enter-practice': {
      const next = clear({ ...state, mode: 'practice', automatic_hints: 0 }, 'needs_gesture');
      return next.has_playback_gesture ? speak(next, 'opening') : next;
    }
    case 'allow-playback': return speak({ ...state, has_playback_gesture: true }, state.mode === 'listen' ? 'lesson' : 'opening');
    case 'pause': case 'interrupt': return clear(state, 'paused');
    case 'end': return clear(state, 'ended');
    case 'think': return state.mode === 'practice' ? clear(state, 'thinking') : state;
    case 'speech-start': return state.mode === 'practice' && !blocked(state) ? clear(state, 'user_speaking') : state;
    case 'speech-finished': return state.phase === 'user_speaking' ? freshReply(state, 'reply') : state;
    case 'resume': return state.mode === 'practice' ? freshReply(state, 'resume') : speak({ ...state, has_playback_gesture: true }, 'lesson');
    case 'listen-only': return clear({ ...state, mode: 'listen' }, 'listening');
    case 'manual-help': return state.mode === 'practice' ? speak(state, 'hint1') : state;
    case 'choose-meaning': return state.choices.some(choice => choice.id === event.choice_id) ? freshReply(state, 'reply', event.choice_id === 'again' ? state.last_question : undefined) : state;
    case 'playback-failed': return state.awaiting_since_ms === null && state.current_utterance?.id === event.utterance_id && event.goal_revision === state.goal_revision ? clear(state, 'paused') : state;
    case 'playback-started':
      if (state.current_utterance?.id !== event.utterance_id || event.goal_revision !== state.goal_revision || event.source !== 'simulation' || !Number.isFinite(event.at) || state.awaiting_since_ms !== null || state.playback_started_at !== null) return state;
      return { ...state, playback_started_at: event.at };
    case 'playback-ended': {
      if (state.current_utterance?.id !== event.utterance_id || event.goal_revision !== state.goal_revision || event.source !== 'simulation' || state.playback_started_at === null || !Number.isFinite(event.at) || event.at < state.playback_started_at) return state;
      if (state.mode === 'listen') {
        const { start, end } = state.loop;
        const position = state.position < start || state.position >= end ? start : state.position + 1;
        return speak({ ...state, position }, 'lesson');
      }
      return { ...state, phase: state.current_utterance.kind === 'hint1' ? 'guided_hint' : state.current_utterance.kind === 'hint2' ? 'choice_support' : 'awaiting_user', playback_started_at: null, awaiting_since_ms: event.at };
    }
    case 'tick': {
      if (state.mode !== 'practice' || !state.preferences.auto_hints || blocked(state) || state.awaiting_since_ms === null || !Number.isFinite(event.at) || event.at - state.awaiting_since_ms < state.preferences.wait_ms) return state;
      if (state.automatic_hints >= 2) return clear({ ...state, mode: 'listen' }, 'listening');
      return speak({ ...state, automatic_hints: state.automatic_hints + 1 }, state.automatic_hints === 0 ? 'hint1' : 'hint2');
    }
    case 'previous': return speak({ ...state, mode: 'listen', position: Math.max(0, state.position - 1), has_playback_gesture: true }, 'lesson');
    case 'set-loop': {
      const sentences = state.material.sentences;
      if (!['all','chapter','sentence','ab'].includes(event.scope)) return state;
      if (event.scope !== 'all' && (!Number.isInteger(event.start) || event.start < 0 || event.start >= sentences.length)) return state;
      if (event.scope === 'ab' && (!Number.isInteger(event.end) || event.end < event.start || event.end >= sentences.length)) return state;
      let start = event.start, end = event.start;
      if (event.scope === 'all') { start = 0; end = sentences.length - 1; }
      if (event.scope === 'chapter') {
        const chapter = sentences[event.start].chapter;
        start = sentences.findIndex(sentence => sentence.chapter === chapter);
        end = sentences.findLastIndex(sentence => sentence.chapter === chapter);
      }
      if (event.scope === 'ab') end = event.end;
      const next: PracticeSession = { ...state, mode: 'listen', position: start, loop: { scope: event.scope, start, end } };
      return state.current_utterance ? speak(next, 'lesson') : next;
    }
  }
}

// Stored data is untrusted. Fixed content must still match its confirmed scenario;
// a restored record never inherits an active playback or an old waiting clock.
export function readPracticeSession(raw: string | null, version: ScenarioVersion): PracticeSession | null {
  if (raw === null) return null;
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid practice record');
  const s = data as PracticeSession;
  const fixed = createPracticeSession(version);
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (!same(s.learning_context, fixed.learning_context) || typeof s.last_question !== 'string' || !s.last_question || s.schema !== 1 || s.scenario_version_id !== version.id || s.goal_revision !== version.goal_revision || s.user_goal !== version.user_goal || s.source !== 'simulation' || s.eligible_for_assessment !== false || s.speaking_status !== 'unobserved' || !same(s.roles, fixed.roles) || !same(s.material, fixed.material)
    || (s.mode !== 'listen' && s.mode !== 'practice') || !phases.some(phase => phase === s.phase)
    || !s.preferences || typeof s.preferences.auto_hints !== 'boolean' || ![6000,10000,15000].some(value => value === s.preferences.wait_ms) || !['slow','natural'].some(value => value === s.preferences.speed)
    || !s.environment || !['visible','connected','audible'].every(key => typeof (s.environment as Record<string, unknown>)[key] === 'boolean') || !['unrequested','denied'].some(value => value === s.environment.microphone)
    || !Number.isSafeInteger(s.sequence) || s.sequence < 0 || typeof s.has_playback_gesture !== 'boolean' || !Number.isInteger(s.position) || s.position < 0 || s.position >= fixed.material.sentences.length
    || !s.loop || !['all','chapter','sentence','ab'].some(value => value === s.loop.scope) || !Number.isInteger(s.loop.start) || !Number.isInteger(s.loop.end) || s.loop.start < 0 || s.loop.end < s.loop.start || s.loop.end >= fixed.material.sentences.length
    || !Number.isInteger(s.automatic_hints) || s.automatic_hints < 0 || s.automatic_hints > 2 || !Array.isArray(s.choices) || s.choices.length > 2 || !s.choices.every(choice => choice && (choice.id === 'ask' || choice.id === 'again'))
    || ![s.awaiting_since_ms,s.playback_started_at].every(value => value === null || (typeof value === 'number' && Number.isFinite(value)))
    || (s.current_utterance !== null && (!s.current_utterance || typeof s.current_utterance.id !== 'string' || typeof s.current_utterance.text !== 'string' || !kinds.some(kind => kind === s.current_utterance!.kind) || !fixed.roles.some(role => role.id === s.current_utterance!.role_id)))) throw new Error('Invalid practice record');
  const restored = Object.fromEntries(Object.keys(fixed).map(key => [key, (s as unknown as Record<string, unknown>)[key]])) as PracticeSession;
  return clear({ ...restored, has_playback_gesture: false }, 'paused');
}

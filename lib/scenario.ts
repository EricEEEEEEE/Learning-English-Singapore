import type { StudyChoice } from './placement';
import { focusIds, focusText, planContent, seedContent, unknownFact,
  type ScenarioFocus, type ScenarioLanguage, type ScenarioOrigin } from './scenario-content';

export type ScenarioContext = StudyChoice & { listening_status: 'unknown' | 'provisional' | 'supported'; speaking_status: 'unobserved' };
export type ScenarioField = 'who' | 'where' | 'goal' | 'worry';
export type PreparationPart = 'dialogue' | 'media' | 'check';
type PartStatus = 'pending' | 'ready' | 'failed';
type VersionStatus = 'preparing' | 'partial' | 'ready' | 'cancelled';
type Stage = 'choosing' | 'describing' | 'clarifying' | 'confirming' | VersionStatus;
type Candidate = { id: ScenarioFocus; user_goal: string; focus: string; possible_intents: string[]; open_branches: string[];
  source_refs: string[]; grounding_status: 'user-provided' | 'spec-seed'; unknown_facts: string[]; complexity_budget: 1 };
export type ScenarioDraft = { origin: ScenarioOrigin; language: ScenarioLanguage; description: string; who: string | null; where: string | null;
  goal: string; worry: string | null; grounding_status: Candidate['grounding_status']; source_refs: string[]; unknown_facts: string[];
  candidates: Candidate[]; candidate_id: ScenarioFocus };
type Artifact = { id: string; source: 'simulation'; goal_revision: number; content: string[] };
export type ScenarioVersion = { id: string; goal_revision: number; user_goal: string; learning_context: ScenarioContext;
  source: 'simulation'; real_media_ready: false; draft: ScenarioDraft; plan: ReturnType<typeof planContent>; unknown_facts: string[];
  status: VersionStatus; preparation: Record<PreparationPart, PartStatus>; artifacts: Partial<Record<PreparationPart, Artifact>>;
  attempt: number; request_id: string };
export type ScenarioSession = { schema: 1; stage: Stage; learning_context: ScenarioContext; draft: ScenarioDraft;
  clarification: { field: 'goal' } | null; versions: ScenarioVersion[]; active_version_id: string | null;
  form: { editing: ScenarioField | null; text: string } };
export type ScenarioEvent =
  | { type: 'choose-start'; kind: ScenarioOrigin; language?: ScenarioLanguage }
  | { type: 'describe'; text: string } | { type: 'clarify'; value: string }
  | { type: 'edit-field'; field: ScenarioField; value: string }
  | { type: 'choose-candidate'; candidate_id: string }
  | { type: 'confirm' | 'edit-goal' | 'cancel' | 'retry-failed' | 'choose-another' }
  | { type: 'demo-step'; version_id: string; request_id: string; part: PreparationPart; outcome: 'ready' | 'failed' }
  | { type: 'view-version'; version_id: string }
  | { type: 'set-context'; context: ScenarioContext }
  | { type: 'begin-edit'; field: ScenarioField } | { type: 'input'; value: string } | { type: 'cancel-edit' };
export const preparationParts: PreparationPart[] = ['dialogue', 'media', 'check'];

function candidates(draft: ScenarioDraft): Candidate[] {
  return focusIds.map(id => ({ id, user_goal: draft.goal, focus: focusText(id, draft.language),
    possible_intents: planContent(draft.goal, id, draft.language).steps,
    open_branches: focusIds.filter(focus => focus !== id).map(focus => focusText(focus, draft.language)),
    source_refs: [...draft.source_refs], grounding_status: draft.grounding_status, unknown_facts: [...draft.unknown_facts], complexity_budget: 1 }));
}
function emptyDraft(language: ScenarioLanguage = 'zh-Hans'): ScenarioDraft {
  return { origin: 'custom', language, description: '', who: null, where: null, goal: '', worry: null,
    grounding_status: 'user-provided', source_refs: [], unknown_facts: [unknownFact(language)], candidates: [], candidate_id: 'purpose' };
}
export function createScenarioSession(context: ScenarioContext): ScenarioSession {
  return { schema: 1, stage: 'choosing', learning_context: structuredClone(context), draft: emptyDraft(), clarification: null, versions: [], active_version_id: null, form: { editing: null, text: '' } };
}
export function activeScenarioVersion(state: ScenarioSession) { return state.versions.find(version => version.id === state.active_version_id); }

export function applyScenarioEvent(state: ScenarioSession, event: ScenarioEvent): ScenarioSession {
  const version = activeScenarioVersion(state);
  if (event.type === 'set-context') return { ...state, learning_context: structuredClone(event.context) };
  if (event.type === 'choose-another') return { ...state, stage: 'choosing', draft: emptyDraft(state.draft.language), clarification: null, form: { editing: null, text: '' } };
  if (event.type === 'input' && (state.stage === 'describing' || state.stage === 'clarifying' || (state.stage === 'confirming' && state.form.editing))) {
    return { ...state, form: { ...state.form, text: event.value } };
  }
  if (event.type === 'cancel-edit' && state.stage === 'confirming') return { ...state, form: { editing: null, text: '' } };
  if (event.type === 'choose-start') {
    const draft = emptyDraft(event.language ?? 'zh-Hans');
    draft.origin = event.kind;
    if (event.kind !== 'custom') {
      const seed = seedContent(event.kind, draft.language);
      Object.assign(draft, { goal: seed.goal, description: seed.goal, who: seed.who, where: seed.where, worry: seed.worry,
        grounding_status: 'spec-seed', source_refs: [seed.source] });
      draft.candidates = candidates(draft);
    }
    return { ...state, stage: event.kind === 'custom' ? 'describing' : 'confirming', draft, clarification: null, form: { editing: null, text: '' } };
  }
  if ((event.type === 'describe' && state.stage === 'describing') || (event.type === 'clarify' && state.stage === 'clarifying')) {
    const goal = (event.type === 'describe' ? event.text : event.value).trim();
    const draft = { ...state.draft, goal, description: goal };
    draft.candidates = goal ? candidates(draft) : [];
    return { ...state, draft, stage: goal ? 'confirming' : 'clarifying', clarification: goal ? null : { field: 'goal' }, form: { editing: null, text: '' } };
  }
  if (event.type === 'edit-field' && state.stage === 'confirming') {
    const value = event.value.trim();
    const draft = { ...state.draft, [event.field]: event.field === 'goal' ? value : value || null };
    if (event.field === 'goal') draft.description = value;
    if (draft[event.field] !== state.draft[event.field]) {
      draft.grounding_status = 'user-provided';
      draft.source_refs = [];
    }
    draft.candidates = draft.goal ? candidates(draft) : [];
    return { ...state, draft, stage: draft.goal ? 'confirming' : 'clarifying', clarification: draft.goal ? null : { field: 'goal' }, form: { editing: null, text: '' } };
  }
  if (event.type === 'choose-candidate' && state.stage === 'confirming') {
    const candidate = state.draft.candidates.find(item => item.id === event.candidate_id);
    return candidate ? { ...state, draft: { ...state.draft, candidate_id: candidate.id } } : state;
  }
  if ((event.type === 'edit-goal' && version) || (event.type === 'begin-edit' && (version || state.stage === 'confirming'))) {
    const field = event.type === 'begin-edit' ? event.field : 'goal';
    const draft = structuredClone(event.type === 'edit-goal' || state.stage !== 'confirming' ? version!.draft : state.draft);
    return { ...state, stage: 'confirming', draft, clarification: null, form: { editing: field, text: draft[field] ?? '' } };
  }
  if (event.type === 'confirm' && state.stage === 'confirming' && state.draft.goal.trim()) {
    const revision = Math.max(0, ...state.versions.map(item => item.goal_revision)) + 1;
    const id = `scenario-${revision}`;
    const draft = structuredClone(state.draft);
    const next: ScenarioVersion = { id, goal_revision: revision, user_goal: draft.goal, draft,
      learning_context: structuredClone(state.learning_context), source: 'simulation', real_media_ready: false,
      plan: planContent(draft.goal, draft.candidate_id, draft.language), unknown_facts: [...draft.unknown_facts],
      status: 'preparing', preparation: { dialogue: 'pending', media: 'pending', check: 'pending' }, artifacts: {},
      attempt: 1, request_id: `${id}/attempt-1` };
    return { ...state, stage: 'preparing', versions: [...state.versions, next], active_version_id: id, clarification: null, form: { editing: null, text: '' } };
  }
  if (event.type === 'view-version') {
    const selected = state.versions.find(item => item.id === event.version_id);
    return selected ? { ...state, stage: selected.status, active_version_id: selected.id, draft: structuredClone(selected.draft), clarification: null, form: { editing: null, text: '' } } : state;
  }
  if (!version) return state;
  let changed: ScenarioVersion;
  if (event.type === 'cancel' && (state.stage === 'preparing' || state.stage === 'partial')) {
    changed = { ...version, status: 'cancelled' };
  } else if (event.type === 'retry-failed' && state.stage === 'partial') {
    const preparation = { ...version.preparation };
    for (const part of preparationParts) if (preparation[part] === 'failed') preparation[part] = 'pending';
    const attempt = version.attempt + 1;
    changed = { ...version, preparation, attempt, request_id: `${version.id}/attempt-${attempt}`, status: 'preparing' };
  } else if (event.type === 'demo-step' && state.stage === 'preparing' && version.status === 'preparing') {
    const nextPart = preparationParts.find(part => version.preparation[part] !== 'ready');
    if (event.version_id !== version.id || event.request_id !== version.request_id || nextPart !== event.part) return state;
    const preparation = { ...version.preparation, [event.part]: event.outcome };
    const artifacts = { ...version.artifacts };
    if (event.outcome === 'ready') artifacts[event.part] = { id: `${version.id}/${event.part}`, source: 'simulation', goal_revision: version.goal_revision,
      content: event.part === 'dialogue' ? [...version.plan.steps] : [event.part === 'media' ? 'simulation: no real audio or video' : 'simulation: no real content approval'] };
    const status = event.outcome === 'failed' ? 'partial' : preparationParts.every(part => preparation[part] === 'ready') ? 'ready' : 'preparing';
    changed = { ...version, preparation, artifacts, status };
  } else return state;
  return { ...state, stage: changed.status, versions: state.versions.map(item => item.id === changed.id ? changed : item) };
}

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every(item => typeof item === 'string'); }
function oneOf(value: unknown, options: readonly string[]): value is string { return typeof value === 'string' && options.includes(value); }
function contextValid(value: unknown): boolean {
  return record(value) && oneOf(value.content_band, ['L0','L1','L2','L3','L4']) && oneOf(value.speed, ['slow','natural']) &&
    oneOf(value.support, ['full','guided','minimal']) && oneOf(value.listening_status, ['unknown','provisional','supported']) && value.speaking_status === 'unobserved';
}
function draftValid(value: unknown): value is ScenarioDraft {
  if (!record(value) || !oneOf(value.origin, ['custom','school','work','daily']) || !oneOf(value.language, ['zh-Hans','id','ja','ko','hi']) ||
    typeof value.goal !== 'string' || typeof value.description !== 'string' || !['who','where','worry'].every(field => value[field] === null || typeof value[field] === 'string') ||
    !oneOf(value.grounding_status, ['user-provided','spec-seed']) || !strings(value.source_refs) || !strings(value.unknown_facts) || !value.unknown_facts.length ||
    !focusIds.includes(value.candidate_id as ScenarioFocus) || !Array.isArray(value.candidates)) return false;
  return value.candidates.length === (value.goal ? 3 : 0) && value.candidates.every((candidate, index) => record(candidate) && candidate.id === focusIds[index] &&
    candidate.user_goal === value.goal && typeof candidate.focus === 'string' && strings(candidate.possible_intents) && strings(candidate.open_branches) &&
    strings(candidate.source_refs) && strings(candidate.unknown_facts) && candidate.grounding_status === value.grounding_status && candidate.complexity_budget === 1);
}
function versionValid(value: unknown): value is ScenarioVersion {
  if (!record(value) || !Number.isSafeInteger(value.goal_revision) || Number(value.goal_revision) < 1 || value.id !== `scenario-${value.goal_revision}` ||
    !contextValid(value.learning_context) || value.source !== 'simulation' || value.real_media_ready !== false || !draftValid(value.draft) || !value.draft.goal || value.user_goal !== value.draft.goal ||
    !strings(value.unknown_facts) || !record(value.plan) || typeof value.plan.focus !== 'string' || !strings(value.plan.steps) || !strings(value.plan.practice_prompts) ||
    !Number.isSafeInteger(value.attempt) || Number(value.attempt) < 1 || value.request_id !== `${value.id}/attempt-${value.attempt}` ||
    !oneOf(value.status, ['preparing','partial','ready','cancelled']) || !record(value.preparation) || !record(value.artifacts)) return false;
  const prep = value.preparation, artifacts = value.artifacts;
  let incomplete = false;
  for (const part of preparationParts) {
    if (!oneOf(prep[part], ['ready','pending','failed'])) return false;
    if (incomplete && prep[part] !== 'pending') return false;
    if (prep[part] !== 'ready') incomplete = true;
    const artifact = artifacts[part];
    if (prep[part] === 'ready') {
      if (!record(artifact) || artifact.id !== `${value.id}/${part}` || artifact.source !== 'simulation' || artifact.goal_revision !== value.goal_revision || !strings(artifact.content)) return false;
    } else if (artifact !== undefined) return false;
  }
  const hasFailure = preparationParts.some(part => prep[part] === 'failed');
  return value.status === 'cancelled' || (value.status === 'ready' ? !incomplete : value.status === 'partial' ? hasFailure : incomplete && !hasFailure);
}
export function readScenarioSession(raw: string | null): ScenarioSession | null {
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (record(value)) {
    const migrateDraftLanguage = (draft: unknown) => { if (record(draft) && draft.language === 'en') draft.language = 'zh-Hans'; };
    migrateDraftLanguage(value.draft);
    if (Array.isArray(value.versions)) value.versions.forEach(version => { if (record(version)) migrateDraftLanguage(version.draft); });
  }
  if (!record(value) || value.schema !== 1 || !contextValid(value.learning_context) || !draftValid(value.draft) || !Array.isArray(value.versions) ||
    !value.versions.every(versionValid) || !oneOf(value.stage, ['choosing','describing','clarifying','confirming','preparing','partial','ready','cancelled'])) throw new Error('Invalid scenario record');
  if (!record(value.form) || typeof value.form.text !== 'string' || !(value.form.editing === null || oneOf(value.form.editing, ['who','where','goal','worry'])) ||
    (value.form.editing !== null && value.stage !== 'confirming')) throw new Error('Invalid scenario form');
  const versions = value.versions as ScenarioVersion[];
  if (versions.some((version, index) => version.goal_revision !== index + 1) ||
    (value.active_version_id !== null && !versions.some(version => version.id === value.active_version_id))) throw new Error('Invalid scenario version');
  const active = versions.find(version => version.id === value.active_version_id);
  if (['preparing','partial','ready','cancelled'].includes(value.stage) && (!active || active.status !== value.stage)) throw new Error('Invalid preparation state');
  if (value.stage === 'clarifying' ? !record(value.clarification) || value.clarification.field !== 'goal' : value.clarification !== null) throw new Error('Invalid clarification');
  if (value.stage === 'confirming' && !value.draft.goal.trim()) throw new Error('Missing scenario goal');
  return value as ScenarioSession;
}

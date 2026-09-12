import { getOnboardingQuestion, type ContentBand, type OnboardingSession } from './onboarding';

export type ListeningEvidence = {
  question_id: string;
  band: ContentBand;
  topic: string;
  task_type: string;
  tags: string[];
  first_response: 'correct' | 'incorrect' | 'unknown' | 'skipped' | 'unanswered';
  prompt_played_before_choice: boolean;
  device_failure_before_choice: boolean;
  answer_before_choice: boolean;
  translation_before_choice: boolean;
  answer_needed: boolean;
  replay_count: number;
  prompt_play_count?: number;
  answer_exposed?: boolean;
  device_failure?: boolean;
  source: 'observed' | 'simulation';
  reviewed: boolean;
  local_voice_id: string | null;
  local_voice_reviewed: boolean;
  is_followup: boolean;
  recorded_at: string;
};
type EvidenceGroup = { success_question_ids: string[]; failure_question_ids: string[] };
export type LearningProfile = {
  rule_version: 'placement_rules_v1';
  listening_band: ContentBand | null;
  placement_status: 'unknown' | 'provisional';
  recommended_content_band: ContentBand;
  evidence_confidence: 'insufficient' | 'provisional' | 'reduced';
  support_level: 'full' | 'guided';
  local_listening_familiarity: 'unknown' | 'provisional';
  speaking_status: 'unobserved';
  evidence_date: string;
  evidence: {
    valid_question_ids: string[];
    success_question_ids: string[];
    excluded: { question_id: string; reason: string }[];
    by_task: Record<string, EvidenceGroup>;
  };
  support_records: ListeningEvidence[];
  unresolved_bands: ContentBand[];
  followups: { band: ContentBand; task_type: string; count: 1 }[];
};
type PlacementOptions = { as_of: string; previous_extra_question_ids: string[]; ended: boolean };
export const contentBands: ContentBand[] = ['L0', 'L1', 'L2', 'L3', 'L4'];
const taskKey = (row: ListeningEvidence) => `${row.band}:${row.task_type}`;

function exclusion(row: ListeningEvidence): string | null {
  if (row.source !== 'observed') return 'simulation';
  if (!row.reviewed) return 'unreviewed';
  if (!row.prompt_played_before_choice) return 'not-played';
  if (row.device_failure_before_choice) return 'device-failure';
  if (row.first_response !== 'correct' && row.first_response !== 'incorrect') return row.first_response;
  if (row.answer_before_choice || row.translation_before_choice) return 'answer-support';
  return null;
}

// This deterministic rule engine is not a calibrated ability assessment.
// Only separately reviewed, observed inputs can support a provisional band.
export function evaluatePlacement(input: ListeningEvidence[], options: PlacementOptions): LearningProfile {
  const seen = new Set<string>();
  const rows = [...input].sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at))
    .filter(row => { if (seen.has(row.question_id)) return false; seen.add(row.question_id); return true; });
  const extraIds = new Set(options.previous_extra_question_ids);
  const firstFollowups = new Map<string, ListeningEvidence>();
  const invalidExtra = new Set<string>();
  for (const row of rows.filter(row => row.is_followup)) {
    const key = taskKey(row);
    const withinBudget = extraIds.has(row.question_id) || extraIds.size < 4;
    extraIds.add(row.question_id);
    if (firstFollowups.has(key) || !withinBudget) invalidExtra.add(row.question_id);
    else firstFollowups.set(key, row);
  }
  const excluded: LearningProfile['evidence']['excluded'] = [];
  const valid = rows.filter(row => {
    const reason = invalidExtra.has(row.question_id) ? 'extra-limit' : exclusion(row);
    if (reason) excluded.push({ question_id: row.question_id, reason });
    return reason === null;
  });
  const success = valid.filter(row => row.first_response === 'correct');
  const successIds = new Set(success.map(row => row.question_id));
  const byTask: Record<string, EvidenceGroup> = Object.create(null);
  for (const row of valid) {
    const group = byTask[row.task_type] ??= { success_question_ids: [], failure_question_ids: [] };
    group[row.first_response === 'correct' ? 'success_question_ids' : 'failure_question_ids'].push(row.question_id);
  }
  const conflicts = new Map<string, ListeningEvidence>();
  const core = valid.filter(row => !row.is_followup);
  for (const row of core) {
    if (row.first_response === 'incorrect' && core.some(other => taskKey(other) === taskKey(row) && other.first_response === 'correct')) {
      conflicts.set(taskKey(row), row);
    }
  }
  const unresolved = new Set<ContentBand>();
  const resolved = new Set<ContentBand>();
  const followups: LearningProfile['followups'] = [];
  let room = Math.max(0, 4 - extraIds.size);
  for (const [key, row] of conflicts) {
    const extra = firstFollowups.get(key);
    const topics = new Set(success.filter(other => other.band === row.band).map(other => other.topic));
    if (extra && successIds.has(extra.question_id) && topics.size >= 2) resolved.add(row.band);
    else {
      unresolved.add(row.band);
      if (!extra && !options.ended && room > 0) {
        followups.push({ band: row.band, task_type: row.task_type, count: 1 });
        room -= 1;
      }
    }
  }
  const basicAttempts = rows.filter(row => row.band === 'L0' && row.source === 'observed' && row.reviewed &&
    row.prompt_played_before_choice && !row.device_failure_before_choice && row.answer_needed &&
    (row.first_response === 'correct' || row.first_response === 'incorrect') && !invalidExtra.has(row.question_id));
  let band: ContentBand | null = basicAttempts.length >= 2 && !unresolved.has('L0') ? 'L0' : null;
  let reduced = false;
  for (const level of contentBands.slice(1)) {
    const own = success.filter(row => row.band === level);
    if (new Set(own.map(row => row.topic)).size < 2 || unresolved.has(level)) break;
    if (level === 'L4') {
      const local = own.filter(row => row.local_voice_reviewed && row.local_voice_id);
      if (new Set(local.map(row => row.topic)).size < 2 || new Set(local.map(row => row.local_voice_id)).size < 2) break;
    }
    band = level;
    if (resolved.has(level)) reduced = true;
  }
  // A follow-up cannot confirm a higher band whose prerequisites are still missing.
  for (const level of resolved) {
    if (band === null || contentBands.indexOf(level) > contentBands.indexOf(band)) unresolved.add(level);
  }
  return {
    rule_version: 'placement_rules_v1', listening_band: band,
    placement_status: band === null ? 'unknown' : 'provisional', recommended_content_band: band ?? 'L0',
    evidence_confidence: band === null ? 'insufficient' : reduced ? 'reduced' : 'provisional',
    support_level: band === null || band === 'L0' ? 'full' : 'guided',
    local_listening_familiarity: band === 'L4' ? 'provisional' : 'unknown', speaking_status: 'unobserved',
    evidence_date: options.as_of,
    evidence: { valid_question_ids: valid.map(row => row.question_id), success_question_ids: [...successIds], excluded, by_task: byTask },
    support_records: rows.map(row => ({ ...row, tags: [...row.tags] })),
    unresolved_bands: contentBands.filter(level => unresolved.has(level)), followups,
  };
}

export function profileFromOnboarding(session: OnboardingSession, asOf: string): LearningProfile {
  const rows: ListeningEvidence[] = [];
  for (const [id, record] of Object.entries(session.records)) {
    const question = getOnboardingQuestion(id);
    if (question?.kind !== 'listening' || !question.band) continue;
    const task = question.key.includes('number') ? 'number' : question.key.includes('local') ? 'local' : 'intent';
    rows.push({ question_id: id, band: question.band, topic: question.topic, task_type: task, tags: [task],
      // No answer key or real audio exists in this prototype. A selected picture is not a scored response.
      first_response: record.response === 'skipped' ? 'skipped' : 'unknown',
      prompt_played_before_choice: record.firstChoicePromptPlayed, device_failure_before_choice: record.firstChoiceDeviceFailure,
      answer_before_choice: record.firstChoiceHadAnswer, translation_before_choice: false,
      answer_needed: false, replay_count: record.replayCount,
      prompt_play_count: record.promptPlayCount, answer_exposed: record.answerExposed, device_failure: record.deviceFailure,
      source: 'simulation', reviewed: false,
      local_voice_id: null, local_voice_reviewed: false, is_followup: false, recorded_at: session.createdAt,
    });
  }
  return evaluatePlacement(rows, { as_of: asOf, ended: session.status === 'completed',
    previous_extra_question_ids: Object.keys(session.records).filter(id => id.startsWith('intro-v1:extra-')) });
}

export type StudyChoice = { content_band: ContentBand; speed: 'slow' | 'natural'; support: 'full' | 'guided' | 'minimal' };
export type StudySettings = { schema: 1; recommended: StudyChoice; chosen: StudyChoice; user_modified: boolean; feedback_flagged: boolean };
export type StudyAction = 'simpler' | 'more-natural' | 'slower' | 'natural-speed' | 'fewer-hints' | 'restore' | 'flag-feedback';
function recommendation(profile: LearningProfile): StudyChoice {
  return { content_band: profile.recommended_content_band, speed: profile.support_level === 'full' ? 'slow' : 'natural', support: profile.support_level };
}
export function createStudySettings(profile: LearningProfile): StudySettings {
  const recommended = recommendation(profile);
  return { schema: 1, recommended, chosen: { ...recommended }, user_modified: false, feedback_flagged: false };
}
export function refreshStudyRecommendation(settings: StudySettings, profile: LearningProfile): StudySettings {
  const recommended = recommendation(profile);
  return { ...settings, recommended, chosen: { ...(settings.user_modified ? settings.chosen : recommended) } };
}
export function applyStudyAction(settings: StudySettings, action: StudyAction): StudySettings {
  if (action === 'flag-feedback') return { ...settings, feedback_flagged: true };
  if (action === 'restore') return { ...settings, chosen: { ...settings.recommended }, user_modified: false };
  const chosen = { ...settings.chosen };
  const index = contentBands.indexOf(chosen.content_band);
  if (action === 'simpler') chosen.content_band = contentBands[Math.max(0, index - 1)];
  if (action === 'more-natural') chosen.content_band = contentBands[Math.min(4, index + 1)];
  if (action === 'slower') chosen.speed = 'slow';
  if (action === 'natural-speed') chosen.speed = 'natural';
  if (action === 'fewer-hints') chosen.support = 'minimal';
  return { ...settings, chosen, user_modified: true };
}
export function readStudySettings(raw: string | null, profile: LearningProfile): StudySettings {
  if (raw === null) return createStudySettings(profile);
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('Invalid study settings');
  const saved = value as StudySettings;
  const validChoice = (choice: StudyChoice | undefined) => choice && contentBands.includes(choice.content_band) &&
    ['slow', 'natural'].includes(choice.speed) && ['full', 'guided', 'minimal'].includes(choice.support);
  if (saved.schema !== 1 || !validChoice(saved.chosen) || !validChoice(saved.recommended) ||
      typeof saved.user_modified !== 'boolean' || typeof saved.feedback_flagged !== 'boolean') throw new Error('Invalid study settings');
  return refreshStudyRecommendation(saved, profile);
}

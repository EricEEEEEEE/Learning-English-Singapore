type ContentBand = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
type AuxiliaryLanguage = 'zh-Hans' | 'id' | 'ja' | 'ko' | 'hi';
type Grounding = 'generic' | 'user-goal' | 'external-assertion';

export type LessonRole = { id: string; label: string };
export type LessonSentence = {
  id: string;
  role_id: string;
  language: 'en';
  text: string;
  action: string;
  grounding: Grounding;
  source_refs: string[];
  support?: { language: AuxiliaryLanguage; text: string };
};
export type SyntheticLesson = {
  schema: 1;
  source: 'simulation';
  eligible_for_assessment: false;
  lesson_revision: string;
  scenario_version_id: string;
  goal_revision: number;
  user_goal: string;
  content_band: ContentBand;
  auxiliary_language: AuxiliaryLanguage;
  roles: LessonRole[];
  sentences: LessonSentence[];
  unknown_facts: string[];
};

export type LessonValidation =
  | { ok: true; value: SyntheticLesson }
  | { ok: false; issues: string[] };

const bands: ContentBand[] = ['L0', 'L1', 'L2', 'L3', 'L4'];
const auxiliaryLanguages: AuxiliaryLanguage[] = ['zh-Hans', 'id', 'ja', 'ko', 'hi'];
const groundings: Grounding[] = ['generic', 'user-goal', 'external-assertion'];

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(nonEmpty);
}

function wordCount(text: string): number {
  return text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/gu)?.length ?? 0;
}

function sourceMatchesGrounding(grounding: unknown, sourceRefs: unknown): boolean {
  if (!stringList(sourceRefs)) return false;
  const traceable = (kind: 'template' | 'user', ref: string) => new RegExp(`^${kind}:[A-Za-z0-9][A-Za-z0-9._/-]*$`, 'u').test(ref);
  if (grounding === 'generic') return sourceRefs.every(ref => traceable('template', ref));
  if (grounding === 'user-goal') return sourceRefs.every(ref => traceable('user', ref));
  return false;
}

function resemblesUnverifiedHighRiskClaim(text: unknown): boolean {
  if (typeof text !== 'string') return false;
  return /\b(?:your|the|this|every)?\s*(?:school|government|medicine|medical office|doctor|clinic|hospital)\b.{0,48}\b(?:require(?:s|d)?|must|guarantee(?:s|d)?|approve(?:s|d)?|is safe|are safe|always|will)\b/iu.test(text);
}

function containsAuxiliaryScript(text: unknown): boolean {
  return typeof text === 'string' && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Devanagari}]/u.test(text);
}

export function validateLessonCandidate(candidate: unknown): LessonValidation {
  if (!record(candidate)) return { ok: false, issues: ['candidate.invalid'] };
  const issues = new Set<string>();

  if (candidate.schema !== 1) issues.add('schema.invalid');
  if (candidate.source !== 'simulation') issues.add('source.simulation_only');
  if (candidate.eligible_for_assessment !== false) issues.add('assessment.not_eligible');
  if (!nonEmpty(candidate.lesson_revision)) issues.add('lesson_revision.required');
  if (!nonEmpty(candidate.scenario_version_id)) issues.add('scenario_version_id.required');
  if (!Number.isSafeInteger(candidate.goal_revision) || Number(candidate.goal_revision) < 1) issues.add('goal_revision.required');
  if (!nonEmpty(candidate.user_goal)) issues.add('user_goal.required');
  if (!bands.includes(candidate.content_band as ContentBand)) issues.add('content_band.invalid');
  if (!auxiliaryLanguages.includes(candidate.auxiliary_language as AuxiliaryLanguage)) issues.add('auxiliary_language.invalid');
  if (!stringList(candidate.unknown_facts)) issues.add('unknown_facts.required');

  const roles = Array.isArray(candidate.roles) ? candidate.roles : [];
  if (roles.length !== 2) issues.add('roles.exactly_two');
  if (!roles.every(role => record(role) && nonEmpty(role.id) && nonEmpty(role.label))) issues.add('roles.complete');
  const roleIds = roles.flatMap(role => record(role) && nonEmpty(role.id) ? [role.id] : []);
  if (new Set(roleIds).size !== roleIds.length) issues.add('roles.unique_ids');

  const sentences = Array.isArray(candidate.sentences) ? candidate.sentences : [];
  if (!sentences.length) issues.add('sentences.required');
  const sentenceIds: string[] = [];
  const speakingRoles = new Set<string>();
  for (const sentence of sentences) {
    if (!record(sentence)) {
      issues.add('sentences.complete');
      continue;
    }
    if (!nonEmpty(sentence.id) || !nonEmpty(sentence.role_id) || !nonEmpty(sentence.text)) issues.add('sentences.complete');
    if (nonEmpty(sentence.id)) sentenceIds.push(sentence.id);
    if (!roleIds.includes(sentence.role_id as string)) issues.add('sentences.unknown_role');
    else speakingRoles.add(sentence.role_id as string);
    if (sentence.language !== 'en' || containsAuxiliaryScript(sentence.text)) issues.add('sentences.english_required');
    if (!nonEmpty(sentence.action)) issues.add('sentences.action_required');
    if (!groundings.includes(sentence.grounding as Grounding)) issues.add('sentences.grounding_invalid');
    if (sentence.grounding === 'external-assertion' || resemblesUnverifiedHighRiskClaim(sentence.text)) issues.add('sentences.unverified_fact');
    if (!stringList(sentence.source_refs)) issues.add('sentences.source_required');
    else if (!sourceMatchesGrounding(sentence.grounding, sentence.source_refs)) issues.add('sentences.source_mismatch');
    if (candidate.content_band === 'L0' && nonEmpty(sentence.text) && wordCount(sentence.text) > 8) issues.add('sentences.above_band_limit');

    if (sentence.support !== undefined) {
      if (!record(sentence.support) || sentence.support.language !== candidate.auxiliary_language || !nonEmpty(sentence.support.text)) {
        issues.add('support.auxiliary_language_required');
      }
    }
  }
  if (new Set(sentenceIds).size !== sentenceIds.length) issues.add('sentences.unique_ids');
  if (roles.length === 2 && roleIds.length === 2 && roleIds.some(roleId => !speakingRoles.has(roleId))) issues.add('sentences.both_roles_required');

  if (issues.size) return { ok: false, issues: [...issues] };
  const valid = candidate as SyntheticLesson;
  const value: SyntheticLesson = {
    schema: 1,
    source: 'simulation',
    eligible_for_assessment: false,
    lesson_revision: valid.lesson_revision,
    scenario_version_id: valid.scenario_version_id,
    goal_revision: valid.goal_revision,
    user_goal: valid.user_goal,
    content_band: valid.content_band,
    auxiliary_language: valid.auxiliary_language,
    roles: valid.roles.map(role => ({ id: role.id, label: role.label })),
    sentences: valid.sentences.map(sentence => ({
      id: sentence.id,
      role_id: sentence.role_id,
      language: 'en',
      text: sentence.text,
      action: sentence.action,
      grounding: sentence.grounding,
      source_refs: [...sentence.source_refs],
      ...(sentence.support ? { support: { language: sentence.support.language, text: sentence.support.text } } : {}),
    })),
    unknown_facts: [...valid.unknown_facts],
  };
  return { ok: true, value };
}

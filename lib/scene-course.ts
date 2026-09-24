export const sceneLanguages = ['zh-Hans', 'id', 'ja', 'ko', 'hi'] as const;
export type SceneLanguage = typeof sceneLanguages[number];
type Translations = Record<SceneLanguage, string>;
export type SceneLine = { id: string; role: 'partner' | 'learner'; text: string; start: number; end: number; version: string; translations: Translations };
export type SceneCourse = {
  id: string; version: string; source: 'ai-sample' | 'test-fixture';
  media: { src: string; duration: number; version: string };
  lines: SceneLine[];
  phrases: { id: string; text: string; lineId: string; translations: Translations }[];
  turns: { partnerLineId: string; learnerLineId: string }[];
};
type Validation = { ok: true; value: SceneCourse } | { ok: false; issues: string[] };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const words = (value: string) => value.toLowerCase().match(/[a-z0-9]+(?:['’][a-z0-9]+)*/g) ?? [];
const containsPhrase = (line: string, phrase: string) => {
  const source = words(line), target = words(phrase);
  return target.length > 0 && source.some((_, index) => target.every((word, offset) => source[index + offset] === word));
};
const translated = (v: unknown) => object(v) && sceneLanguages.every(k => text(v[k]));
export function validateSceneCourse(candidate: unknown): Validation {
  const issues: string[] = [];
  if (!object(candidate)) return { ok: false, issues: ['course'] };
  const c = candidate;
  if (!text(c.id) || !text(c.version) || (c.source !== 'ai-sample' && c.source !== 'test-fixture')) issues.push('identity');
  if (!object(c.media) || !text(c.media.src) || !/^\/media\/[a-zA-Z0-9_-]+\.mp4$/.test(c.media.src) || !finite(c.media.duration) || c.media.duration <= 0 || c.media.version !== c.version) issues.push('media');
  if (!Array.isArray(c.lines) || !c.lines.length || !Array.isArray(c.phrases) || !c.phrases.length || !Array.isArray(c.turns) || !c.turns.length) return { ok: false, issues: [...issues, 'materials'] };
  const lines = new Map<string, Record<string, unknown>>();
  let lastEnd = 0;
  for (const line of c.lines) {
    if (!object(line) || !text(line.id) || !text(line.text) || (line.role !== 'partner' && line.role !== 'learner') || !translated(line.translations) || line.version !== c.version) { issues.push('line'); continue; }
    if (lines.has(line.id)) issues.push('duplicate-line');
    lines.set(line.id, line);
    if (!finite(line.start) || !finite(line.end) || line.start < lastEnd || line.start < 0 || line.end <= line.start || !object(c.media) || !finite(c.media.duration) || line.end > c.media.duration) issues.push('timing');
    if (finite(line.end)) lastEnd = line.end;
  }
  const phraseIds = new Set();
  for (const phrase of c.phrases) {
    if (!object(phrase) || !text(phrase.id) || !text(phrase.text) || !text(phrase.lineId) || !translated(phrase.translations)) { issues.push('phrase'); continue; }
    const line = lines.get(phrase.lineId);
    if (!line || !containsPhrase(String(line.text), phrase.text)) issues.push('phrase-source');
    if (phraseIds.has(phrase.id)) issues.push('duplicate-phrase');
    phraseIds.add(phrase.id);
  }
  for (const turn of c.turns) {
    if (!object(turn) || !text(turn.partnerLineId) || !text(turn.learnerLineId) || lines.get(turn.partnerLineId)?.role !== 'partner' || lines.get(turn.learnerLineId)?.role !== 'learner') issues.push('turn');
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: structuredClone(candidate) as SceneCourse };
}

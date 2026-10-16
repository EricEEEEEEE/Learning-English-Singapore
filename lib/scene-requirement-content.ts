import type { EntryLanguage } from '../app/entry-copy';

export const sceneKeywordKeys = ['location', 'learnerRole', 'partnerRole', 'topic', 'goal', 'special'] as const;
export type SceneKeywords = Record<typeof sceneKeywordKeys[number], string>;
export type SceneRequirementContent = { description: string; language: EntryLanguage; keywords: SceneKeywords };
export type SceneRequirement = { revision: number; content: SceneRequirementContent };
export const emptySceneKeywords = (): SceneKeywords => ({ location: '', learnerRole: '', partnerRole: '', topic: '', goal: '', special: '' });

export function parseSceneRequirement(input: unknown): SceneRequirement {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['revision', 'content'].includes(key))) throw new Error('Invalid requirement');
  const value = input as SceneRequirement;
  if (!Number.isSafeInteger(value.revision) || value.revision < 1) throw new Error('Invalid requirement revision');
  return { revision: value.revision, content: parseSceneRequirementContent(value.content) };
}

export function parseSceneRequirementContent(input: unknown): SceneRequirementContent {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['description', 'language', 'keywords'].includes(key))) throw new Error('Invalid requirement content');
  const value = input as Record<string, unknown>;
  if (typeof value.description !== 'string' || !value.description.trim() || value.description.length > 2000 || typeof value.language !== 'string' || !['zh-Hans', 'id', 'ja', 'ko', 'hi'].includes(value.language)) throw new Error('Invalid requirement content');
  if (!value.keywords || typeof value.keywords !== 'object' || Array.isArray(value.keywords) || Object.keys(value.keywords).some(key => !sceneKeywordKeys.includes(key as typeof sceneKeywordKeys[number]))) throw new Error('Invalid requirement keywords');
  const keywords = emptySceneKeywords();
  for (const key of sceneKeywordKeys) {
    const field = Object.hasOwn(value.keywords, key) ? (value.keywords as Record<string, unknown>)[key] : '';
    if (typeof field !== 'string' || field.length > 200) throw new Error('Invalid requirement keyword');
    keywords[key] = field;
  }
  return { description: value.description, language: value.language as EntryLanguage, keywords };
}

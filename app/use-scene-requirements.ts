'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EntryLanguage } from './entry-copy';
import { emptySceneKeywords, parseSceneRequirementContent, type SceneKeywords, type SceneRequirement, type SceneRequirementContent } from '../lib/scene-requirement-content';

export type SceneDraft = { owner: string; text: string; page: 'scene' | 'background'; keywords: SceneKeywords };
type Editor = { draft: SceneDraft; revision: number; saved: SceneRequirementContent | null; read: 'loading' | 'ready' | 'failed'; save: 'idle' | 'saving' | 'saved' | 'failed' | 'conflict' };
class RequestFailure extends Error { constructor(readonly status: number) { super('Requirement request failed'); } }

async function requestRequirement(method: 'GET' | 'PUT', controller: AbortController, body?: object): Promise<SceneRequirement | null> {
  const deadline = window.setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch('/api/scene-requirements', { method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    if (response.status === 401) window.dispatchEvent(new Event('le-sg-auth-invalid'));
    if (!response.ok) throw new RequestFailure(response.status);
    const payload = await response.json();
    if (payload?.requirement === null && method === 'GET') return null;
    const value = payload?.requirement;
    if (!value || !Number.isSafeInteger(value.revision) || value.revision < 1) throw new Error('Invalid requirement response');
    return { revision: value.revision, content: parseSceneRequirementContent(value.content) };
  } finally { window.clearTimeout(deadline); }
}

export function useSceneRequirements(owner: string | null, language: EntryLanguage, restoreLanguage: (value: EntryLanguage) => void) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [readAttempt, setReadAttempt] = useState(0);
  const currentOwner = useRef(owner);
  const pendingSave = useRef<AbortController | null>(null);
  useLayoutEffect(() => { currentOwner.current = owner; }, [owner]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    if (!owner) { setEditor(null); return; }
    setEditor(previous => previous?.draft.owner === owner ? { ...previous, read: 'loading' } : {
      draft: { owner, text: '', page: 'scene', keywords: emptySceneKeywords() }, revision: 0, saved: null, read: 'loading', save: 'idle',
    });
    void requestRequirement('GET', controller).then(requirement => {
      if (!active || currentOwner.current !== owner) return;
      if (requirement) restoreLanguage(requirement.content.language);
      setEditor(previous => ({
        draft: { owner, text: requirement?.content.description ?? '', keywords: requirement?.content.keywords ?? emptySceneKeywords(), page: previous?.draft.owner === owner ? previous.draft.page : 'scene' },
        revision: requirement?.revision ?? 0, saved: requirement?.content ?? null, read: 'ready', save: 'idle',
      }));
    }).catch(() => {
      if (active && currentOwner.current === owner) setEditor(previous => previous?.draft.owner === owner ? { ...previous, read: 'failed' } : previous);
    });
    return () => { active = false; controller.abort(); pendingSave.current?.abort(); pendingSave.current = null; };
  }, [owner, readAttempt, restoreLanguage]);

  const current = editor?.draft.owner === owner ? editor : null;
  function change(draft: SceneDraft) {
    setEditor(previous => previous?.draft.owner === draft.owner && currentOwner.current === draft.owner ? {
      ...previous, draft, save: previous.save === 'saving' || previous.save === 'conflict' ? previous.save : 'idle',
    } : previous);
  }
  async function save() {
    if (!owner || !current || current.read !== 'ready' || current.save === 'conflict' || pendingSave.current) return;
    const controller = new AbortController();
    pendingSave.current = controller;
    const content: SceneRequirementContent = { description: current.draft.text, language, keywords: { ...current.draft.keywords } };
    setEditor(previous => previous?.draft.owner === owner ? { ...previous, save: 'saving' } : previous);
    try {
      const result = await requestRequirement('PUT', controller, { expectedRevision: current.revision, content });
      if (!result || JSON.stringify(result.content) !== JSON.stringify(content)) throw new Error('Unexpected saved content');
      if (currentOwner.current !== owner || pendingSave.current !== controller) return;
      // A reply updates the saved version, never the live inputs edited in flight.
      setEditor(previous => previous?.draft.owner === owner ? { ...previous, revision: result.revision, saved: result.content, save: 'saved' } : previous);
    } catch (error) {
      if (currentOwner.current === owner && pendingSave.current === controller) setEditor(previous => previous?.draft.owner === owner ? {
        ...previous, save: error instanceof RequestFailure && error.status === 409 ? 'conflict' : 'failed',
      } : previous);
    } finally { if (pendingSave.current === controller) pendingSave.current = null; }
  }
  const matchesSaved = current && current.saved && JSON.stringify(current.saved) === JSON.stringify({ description: current.draft.text, language, keywords: current.draft.keywords });
  return { draft: current?.draft, loading: !current || current.read === 'loading', readFailed: current?.read === 'failed',
    saving: current?.save === 'saving', saveFailed: current?.save === 'failed', conflict: current?.save === 'conflict', saved: current?.save === 'saved' && !!matchesSaved,
    change, save, retry: () => setReadAttempt(attempt => attempt + 1) };
}

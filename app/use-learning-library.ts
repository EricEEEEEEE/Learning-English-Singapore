'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { parseSceneRequirement } from '../lib/scene-requirement-content';
import type { LearningScene } from '../lib/learning-library';
import { requestLearningJson } from './learning-request';

type Library = { owner: string; status: 'loading' | 'ready' | 'failed'; scenes: LearningScene[]; unavailable: number };
function catalogue(value: unknown): Pick<Library, 'scenes' | 'unavailable'> {
  const data = value as Pick<Library, 'scenes' | 'unavailable'>;
  if (!data || !Array.isArray(data.scenes) || !Number.isSafeInteger(data.unavailable) || data.unavailable < 0) throw new Error('Invalid catalogue');
  const scenes = data.scenes.map(scene => {
    const pointer = scene?.course, requirement = parseSceneRequirement(scene?.requirement);
    if (!pointer || !/^[A-Za-z0-9_-]{1,120}$/.test(pointer.id) || !Number.isSafeInteger(pointer.revision) || pointer.revision < 1
      || pointer.materialsRevision !== undefined && (!Number.isSafeInteger(pointer.materialsRevision) || pointer.materialsRevision < 1)
      || requirement.revision !== pointer.revision || scene.description !== requirement.content.description
      || !Number.isFinite(scene.duration) || scene.duration <= 0 || !['requirement', 'legacy-neutral'].includes(scene.contextSource)
      || scene.contextSource === 'legacy-neutral' && Object.values(requirement.content.keywords).some(value => value.trim())) throw new Error('Invalid scene');
    return { course: { id: pointer.id, revision: pointer.revision, ...(pointer.materialsRevision === undefined ? {} : { materialsRevision: pointer.materialsRevision }) }, requirement, description: scene.description, duration: scene.duration, contextSource: scene.contextSource };
  });
  return { scenes, unavailable: data.unavailable };
}

export function useLearningLibrary(owner: string | null, enabled: boolean) {
  const [openOwner, setOpenOwner] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ owner: string; scene: LearningScene } | null>(null);
  const [result, setResult] = useState<Library | null>(null), [attempt, setAttempt] = useState(0);
  const current = useRef({ owner, enabled });
  useLayoutEffect(() => { current.current = { owner, enabled }; }, [owner, enabled]);
  useEffect(() => { setOpenOwner(null); setSelected(null); setResult(null); }, [owner]);
  useEffect(() => {
    if (!owner || !enabled || openOwner !== owner) return;
    let active = true; const controller = new AbortController();
    setResult({ owner, status: 'loading', scenes: [], unavailable: 0 });
    void requestLearningJson('/api/learning-library', controller).then(data => {
      const parsed = catalogue(data);
      if (active && current.current.owner === owner && current.current.enabled) setResult({ owner, status: 'ready', ...parsed });
    }).catch(() => { if (active && current.current.owner === owner) setResult({ owner, status: 'failed', scenes: [], unavailable: 0 }); });
    return () => { active = false; controller.abort(); };
  }, [owner, enabled, openOwner, attempt]);
  return {
    open: !!owner && openOwner === owner, selected: selected?.owner === owner ? selected.scene : null,
    result: result?.owner === owner ? result : null,
    show: () => { if (owner && enabled) setOpenOwner(owner); },
    close: () => { setOpenOwner(null); setSelected(null); },
    choose: (scene: LearningScene) => { if (owner && enabled) setSelected({ owner, scene }); },
    closeCourse: () => setSelected(null), retry: () => setAttempt(value => value + 1),
  };
}

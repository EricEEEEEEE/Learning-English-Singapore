'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { parseSceneRequirement, type SceneRequirement } from '../lib/scene-requirement-content';
import type { SceneCoursePointer, SceneGenerationView } from '../lib/scene-generation';
import { isOffline } from './use-online';

type Target = number | 'invalid' | null;
type Result = { owner: string; revision: Target; view?: SceneGenerationView; error?: 'read' | 'version' };
class VersionFailure extends Error {}
const statuses = ['awaiting_budget', 'submitting', 'submission_unknown', 'script_ready', 'audio_ready', 'audio_assembled', 'video_pending', 'video_assembled'];
const phases = ['not_submitted', ...statuses.filter(status => status !== 'video_assembled'), 'failed', 'simulation', 'media_unavailable', 'ready', 'cancelled', 'stopped', 'quality_failed'];

function parseView(input: unknown, revision: number): SceneGenerationView {
  const value = input as SceneGenerationView;
  try {
    const requirement = parseSceneRequirement(value?.requirement);
    if (requirement.revision !== revision || !phases.includes(value.phase)) throw new Error();
    if (value.task === null) {
      if (value.phase !== 'not_submitted' || value.course !== null) throw new Error();
    } else {
      const task = value.task;
      if (!task || typeof task.id !== 'string' || !task.id || task.id.length > 128 || task.revision !== revision || task.requirementRevision !== revision || !statuses.includes(task.status) || typeof task.simulation !== 'boolean' || !Number.isSafeInteger(task.providerCalls) || task.providerCalls < 0) throw new Error();
      if (task.simulation !== (value.phase === 'simulation') || value.phase === 'not_submitted') throw new Error();
      // C8-4: "cancelled" only before any provider call; "stopped" only after one.
      if (value.phase === 'cancelled' && (task.status !== 'awaiting_budget' || task.providerCalls !== 0)) throw new Error();
      if (value.phase === 'stopped' && (task.providerCalls < 1 || task.status === 'video_assembled')) throw new Error();
      // C14-1: quality_failed only after a video call and before any course was assembled.
      if (value.phase === 'quality_failed' && (task.providerCalls < 1 || task.status === 'video_assembled')) throw new Error();
      if (value.phase === 'ready') {
        const course = value.course;
        if (task.status !== 'video_assembled' || !course || course.id !== task.id || course.revision !== revision || (course.materialsRevision !== undefined && (!Number.isSafeInteger(course.materialsRevision) || course.materialsRevision < 1))) throw new Error();
      } else if (value.course !== null) throw new Error();
    }
    // C14: a quality note only on a ready course; the keyframe flag only with a task.
    if (value.quality !== undefined && (value.phase !== 'ready' || !['passed', 'needs_review', 'preview'].includes(value.quality))) throw new Error();
    if (value.keyframe !== undefined && (value.keyframe !== true || value.task === null)) throw new Error();
    return { ...value, requirement };
  } catch { throw new VersionFailure('Invalid generation version'); }
}

async function requestGeneration(method: 'GET' | 'POST' | 'CANCEL', revision: number, controller: AbortController) {
  const deadline = window.setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch('/api/scene-generation' + (method === 'GET' ? `?revision=${revision}` : method === 'CANCEL' ? '/cancel' : ''), {
      method: method === 'GET' ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      ...(method !== 'GET' ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requirementRevision: revision }) } : {}),
    });
    if (response.status === 401) window.dispatchEvent(new Event('le-sg-auth-invalid'));
    if (!response.ok) throw new Error('Generation request failed');
    return parseView(await response.json(), revision);
  } finally { window.clearTimeout(deadline); }
}

function readTarget(): Target {
  const values = new URL(window.location.href).searchParams.getAll('generation');
  if (!values.length) return null;
  return values.length === 1 && /^[1-9]\d*$/.test(values[0]) && Number.isSafeInteger(Number(values[0])) ? Number(values[0]) : 'invalid';
}

export function useSceneGeneration(owner: string | null, enabled: boolean) {
  const [target, setTarget] = useState<Target>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [watching, setWatching] = useState<{ owner: string; course: SceneCoursePointer; requirement: SceneRequirement } | null>(null);
  const ownerRef = useRef(owner), targetRef = useRef<Target>(null);
  const busy = useRef(false);
  const preparation = useRef<object | null>(null);
  const submission = useRef<{ owner: string; revision: number; controller: AbortController } | null>(null);
  useLayoutEffect(() => { ownerRef.current = enabled ? owner : null; }, [owner, enabled]);

  useEffect(() => {
    function sync() { targetRef.current = readTarget(); setTarget(targetRef.current); setWatching(null); }
    sync(); window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  useEffect(() => {
    setWatching(null); setPreparing(false); busy.current = false; preparation.current = null;
    return () => { submission.current?.controller.abort(); submission.current = null; };
  }, [owner]);

  useEffect(() => {
    if (!owner || !enabled || target === null) return;
    if (target === 'invalid') { setResult({ owner, revision: target, error: 'version' }); return; }
    let active = true, timer: number | undefined, controller: AbortController | null = null;
    const current = () => active && ownerRef.current === owner && targetRef.current === target;
    async function read() {
      window.clearTimeout(timer);
      // C8-1: nothing is read or retried while offline; the online event below reads once more.
      if (!current() || document.hidden || isOffline() || submission.current?.owner === owner && submission.current.revision === target) return;
      controller?.abort();
      const request = new AbortController(); controller = request;
      setResult({ owner: owner!, revision: target });
      try {
        const view = await requestGeneration('GET', target as number, request);
        if (!current() || controller !== request) return;
        setResult({ owner: owner!, revision: target, view });
        if (['submitting', 'submission_unknown', 'script_ready', 'audio_ready', 'audio_assembled', 'video_pending'].includes(view.phase) && !document.hidden) timer = window.setTimeout(() => void read(), 5000);
      } catch (error) {
        if (current() && controller === request) setResult({ owner: owner!, revision: target, error: error instanceof VersionFailure ? 'version' : 'read' });
      }
    }
    function visibility() {
      if (document.hidden) { window.clearTimeout(timer); controller?.abort(); controller = null; }
      else void read();
    }
    function offline() { window.clearTimeout(timer); controller?.abort(); controller = null; }
    function online() { void read(); }
    void read(); document.addEventListener('visibilitychange', visibility);
    window.addEventListener('offline', offline); window.addEventListener('online', online);
    return () => {
      active = false; window.clearTimeout(timer); controller?.abort(); document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('offline', offline); window.removeEventListener('online', online);
    };
  }, [owner, enabled, target, attempt]);

  function navigate(next: Target) {
    const url = new URL(window.location.href);
    if (next === null) url.searchParams.delete('generation'); else url.searchParams.set('generation', String(next));
    window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`);
    targetRef.current = next; setTarget(next); setWatching(null);
  }
  async function generate(save: () => Promise<SceneRequirement | undefined>) {
    if (!owner || !enabled || busy.current) return;
    const token = {}; preparation.current = token;
    busy.current = true; setPreparing(true);
    try {
      const requirement = await save();
      if (!requirement || ownerRef.current !== owner || preparation.current !== token) return;
      const controller = new AbortController();
      const pending = { owner, revision: requirement.revision, controller };
      submission.current = pending;
      navigate(requirement.revision);
      setResult({ owner, revision: requirement.revision });
      try {
        const view = await requestGeneration('POST', requirement.revision, controller);
        if (ownerRef.current === owner && submission.current === pending && targetRef.current === requirement.revision) setResult({ owner, revision: requirement.revision, view });
      } catch {
        // The server may have committed. Recover only through GET, never a second POST.
      } finally {
        if (submission.current === pending) { submission.current = null; setAttempt(value => value + 1); }
      }
    } finally { if (preparation.current === token) { preparation.current = null; busy.current = false; setPreparing(false); } }
  }
  // C8-4: one cancel request for the task of this requirement; the answer is the task's new view.
  const [cancelState, setCancelState] = useState<{ owner: string; revision: number; stage: 'busy' | 'failed' } | null>(null);
  async function cancel() {
    if (!owner || !enabled || typeof target !== 'number' || isOffline() || cancelState?.stage === 'busy') return;
    const revision = target, controller = new AbortController();
    setCancelState({ owner, revision, stage: 'busy' });
    try {
      const view = await requestGeneration('CANCEL', revision, controller);
      if (ownerRef.current !== owner || targetRef.current !== revision) return;
      setResult({ owner, revision, view }); setCancelState(null);
    } catch {
      if (ownerRef.current === owner && targetRef.current === revision) setCancelState({ owner, revision, stage: 'failed' });
    }
  }
  const current = result?.owner === owner && result.revision === target ? result : null;
  const cancelling = cancelState?.owner === owner && cancelState.revision === target ? cancelState.stage : null;
  return { target, view: current?.view, error: current?.error, preparing, generate, cancel, cancelling,
    retry: () => setAttempt(value => value + 1),
    back: () => { submission.current?.controller.abort(); submission.current = null; preparation.current = null; busy.current = false; setPreparing(false); navigate(null); },
    watch: () => { if (owner && ownerRef.current === owner && current?.view?.phase === 'ready' && current.view.course) setWatching({ owner, course: current.view.course, requirement: current.view.requirement }); },
    watching: watching?.owner === owner ? watching.course : null, watchRequirement: watching?.owner === owner ? watching.requirement : null, closeWatch: () => setWatching(null),
  };
}

'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SceneProgressPosition as Position, SceneProgressRecord as Record } from '../lib/scene-progress';
import type { SceneCoursePointer } from '../lib/scene-generation';
import { LearningRequestFailure, requestLearningJson } from './learning-request';
import { isOffline } from './use-online';

export type ProgressContext = SceneCoursePointer & { mediaSha256: string; duration: number; turns: number };
type Stage = 'loading' | 'empty' | 'restored' | 'saving' | 'saved' | 'readFailed' | 'saveFailed' | 'conflict' | 'offline';
type Operation = { expectedVersion: number; position: Position };
type Session = { key: string; context: ProgressContext; active: boolean; enabled: boolean; started: boolean; readable: boolean; busy: boolean; blocked: boolean; record: Record | null; desired: Position | null; unknown: Operation | null; waiters: Set<() => void>; controller?: AbortController; timer?: number };
const same = (a: Position, b: Position) => a.page === b.page && a.time === b.time && a.turnIndex === b.turnIndex;
const start: Position = { page: 'watch', time: 0, turnIndex: 0 };
const pointer = (context: ProgressContext) => ({ id: context.id, revision: context.revision, ...(context.materialsRevision === undefined ? {} : { materialsRevision: context.materialsRevision }) });
function recordValue(data: unknown, context: ProgressContext): Record | null {
  const row = (data as { progress?: Record })?.progress;
  if (row === null) return null;
  const c = row?.course, p = row?.position;
  if (!c || c.id !== context.id || c.revision !== context.revision || c.materialsRevision !== context.materialsRevision || c.mediaSha256 !== context.mediaSha256
    || !Number.isSafeInteger(row.version) || row.version < 1 || !Number.isSafeInteger(row.updatedAt) || row.updatedAt < 0
    || !p || Object.keys(p).length !== 3 || !['watch', 'role', 'terms', 'sentences', 'prompt', 'practice'].includes(p.page)
    || !Number.isFinite(p.time) || p.time < 0 || p.time > context.duration || !Number.isSafeInteger(p.turnIndex) || p.turnIndex < 0 || p.turnIndex >= context.turns) throw new Error('Invalid learning position');
  return structuredClone(row);
}

export function useSceneProgress(context: ProgressContext | null, enabled: boolean) {
  const key = context ? JSON.stringify(context) : '';
  const session = useRef<Session | null>(null);
  const sequence = useRef(0);
  const [view, setView] = useState<{ key: string; stage: Stage; restore?: { serial: number; position: Position } } | null>(null);
  const valid = (s: Session) => s.active && session.current === s;
  function notify(s: Session) { for (const done of s.waiters) done(); s.waiters.clear(); }
  function publish(s: Session, stage: Stage, restore?: Position) {
    if (valid(s)) setView(previous => ({ key: s.key, stage, restore: restore ? { serial: ++sequence.current, position: restore } : previous?.key === s.key ? previous.restore : undefined }));
  }
  async function get(s: Session, controller: AbortController) {
    return recordValue(await requestLearningJson(`/api/scene-progress?${new URLSearchParams(Object.entries(pointer(s.context)).map(([name, value]) => [name, String(value)]))}`, controller), s.context);
  }
  async function read(s: Session) {
    if (!valid(s) || !s.enabled) return;
    s.started = true;
    s.controller?.abort(); window.clearTimeout(s.timer); s.timer = undefined;
    const controller = new AbortController(); s.controller = controller; s.readable = false; s.blocked = true; s.busy = true; s.desired = null; s.unknown = null;
    publish(s, 'loading');
    try {
      const record = await get(s, controller);
      if (!valid(s) || s.controller !== controller) return;
      if (!s.enabled) { publish(s, 'readFailed'); return; }
      s.record = record; s.readable = true; s.blocked = false;
      publish(s, record ? 'restored' : 'empty', record?.position);
    } catch { if (valid(s) && s.controller === controller) publish(s, 'readFailed'); }
    finally { if (s.controller === controller) { s.controller = undefined; s.busy = false; } notify(s); }
  }
  async function drain(s: Session) {
    if (!valid(s) || !s.enabled || !s.readable || s.blocked || s.busy || !s.desired) return;
    if (same(s.desired, s.record?.position ?? start)) { s.desired = null; publish(s, s.record ? 'saved' : 'empty'); return; }
    // C8-1: offline, the latest position waits here and is sent once when the browser is back online.
    if (isOffline()) { publish(s, 'offline'); return; }
    const operation = { expectedVersion: s.record?.version ?? 0, position: { ...s.desired } }, controller = new AbortController();
    s.busy = true; s.controller = controller; publish(s, 'saving');
    try {
      const record = recordValue(await requestLearningJson('/api/scene-progress', controller, { course: pointer(s.context), ...operation }), s.context);
      if (!record || record.version !== operation.expectedVersion + 1 || !same(record.position, operation.position)) throw new Error('Unexpected saved position');
      if (!valid(s) || s.controller !== controller) return;
      if (!s.enabled) { s.blocked = true; s.unknown = operation; publish(s, 'saveFailed'); return; }
      s.record = record; s.unknown = null;
      if (s.desired && same(s.desired, record.position)) s.desired = null;
      publish(s, s.desired ? 'saving' : 'saved');
    } catch (error) {
      if (valid(s) && s.controller === controller) {
        s.blocked = true;
        s.unknown = error instanceof LearningRequestFailure && error.status === 409 ? null : operation;
        publish(s, s.unknown ? 'saveFailed' : 'conflict');
      }
    } finally {
      if (s.controller === controller) { s.controller = undefined; s.busy = false; }
      if (valid(s) && s.desired && !s.blocked) void drain(s);
      notify(s);
    }
  }
  async function retrySave(s: Session) {
    if (!valid(s) || !s.enabled || s.busy || !s.readable || !s.unknown) return;
    const controller = new AbortController(); s.controller = controller; s.busy = true; publish(s, 'saving');
    try {
      const record = await get(s, controller);
      if (!valid(s) || s.controller !== controller) return;
      if (!s.enabled) { publish(s, 'saveFailed'); return; }
      const known = record?.version === s.record?.version && (!record || !!s.record && same(record.position, s.record.position));
      const acknowledged = !!record && record.version === s.unknown.expectedVersion + 1 && same(record.position, s.unknown.position);
      if (!known && !acknowledged) { publish(s, 'conflict'); s.unknown = null; return; }
      s.record = record; s.unknown = null; s.blocked = false;
      if (s.desired && same(s.desired, record?.position ?? start)) s.desired = null;
      publish(s, s.desired ? 'saving' : 'saved');
    } catch { if (valid(s) && s.controller === controller) publish(s, 'saveFailed'); }
    finally {
      if (s.controller === controller) { s.controller = undefined; s.busy = false; }
      if (valid(s) && !s.blocked && s.desired) void drain(s);
      notify(s);
    }
  }
  useEffect(() => {
    if (!context) { session.current = null; setView(null); return; }
    const s: Session = { key, context: structuredClone(context), active: true, enabled, started: false, readable: false, busy: false, blocked: false, record: null, desired: null, unknown: null, waiters: new Set() };
    session.current = s; void read(s);
    return () => { s.active = false; s.controller?.abort(); window.clearTimeout(s.timer); notify(s); };
    // The serialized context contains every course/material/media field.
  }, [key]);
  useEffect(() => {
    const online = () => { const s = session.current; if (s && valid(s) && s.desired && !s.blocked) void drain(s); };
    const offline = () => {
      const s = session.current;
      if (s && valid(s) && s.desired && !s.busy && !s.blocked) { window.clearTimeout(s.timer); s.timer = undefined; publish(s, 'offline'); }
    };
    window.addEventListener('online', online); window.addEventListener('offline', offline);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, []);
  useLayoutEffect(() => {
    const s = session.current;
    if (s?.key === key) {
      s.enabled = enabled;
      if (!enabled) {
        s.controller?.abort(); window.clearTimeout(s.timer); s.timer = undefined;
        if (s.readable && s.desired && !s.busy) {
          s.blocked = true; s.unknown ??= { expectedVersion: s.record?.version ?? 0, position: { ...s.desired } }; publish(s, 'saveFailed');
        }
      }
      else if (!s.started) void read(s);
    }
  }, [enabled, key]);
  return {
    stage: view?.key === key ? view.stage : 'loading' as Stage,
    restore: view?.key === key ? view.restore : undefined,
    change(position: Position, flush = false) {
      const s = session.current;
      if (!s || s.key !== key || !valid(s) || !s.enabled || !s.readable) return;
      const value = { ...position, time: Math.min(s.context.duration, Math.max(0, position.time)) };
      if (!s.desired && same(value, s.record?.position ?? start)) return;
      s.desired = value;
      if (s.blocked) return;
      if (isOffline()) { window.clearTimeout(s.timer); s.timer = undefined; publish(s, 'offline'); return; }
      publish(s, 'saving');
      if (flush) { window.clearTimeout(s.timer); s.timer = undefined; void drain(s); }
      else if (s.timer === undefined) s.timer = window.setTimeout(() => { s.timer = undefined; void drain(s); }, 750);
    },
    retryRead() { if (session.current) void read(session.current); },
    retrySave() { if (session.current) void retrySave(session.current); },
    async finish() {
      const s = session.current;
      if (!s) return true;
      window.clearTimeout(s.timer); s.timer = undefined;
      if (!s.readable || s.blocked) return false;
      void drain(s);
      while (valid(s) && s.enabled && s.busy) await new Promise<void>(resolve => s.waiters.add(resolve));
      return valid(s) && s.enabled && !s.blocked && !s.desired;
    },
  };
}

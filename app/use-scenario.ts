'use client';

import { useEffect, useRef, useState } from 'react';
import { applyScenarioEvent, createScenarioSession, readScenarioSession, type ScenarioContext, type ScenarioEvent, type ScenarioSession } from '../lib/scenario';

export function useScenario(storageKey: string | null | undefined) {
  const [session, setSession] = useState<ScenarioSession | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null | undefined>(undefined);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<'read' | 'save' | null>(null);
  const current = useRef<ScenarioSession | null>(null);
  const readFailed = useRef(false);
  useEffect(() => {
    current.current = null;
    setSession(null);
    setOpen(false);
    setLoadedKey(undefined);
    setInstanceId(null);
    readFailed.current = false;
    if (!storageKey) { setLoadedKey(storageKey); return; }
    try {
      const restored = readScenarioSession(localStorage.getItem(storageKey));
      current.current = restored;
      setSession(restored);
      setOpen(restored !== null);
      if (restored) {
        const instanceKey = `${storageKey}:instance`;
        let id = localStorage.getItem(instanceKey);
        if (!id) { id = crypto.randomUUID(); localStorage.setItem(instanceKey, id); }
        setInstanceId(id);
      }
    } catch {
      readFailed.current = true;
      setError('read');
    }
    setLoadedKey(storageKey);
  }, [storageKey]);
  function save(next: ScenarioSession) {
    current.current = next;
    setSession(next);
    if (readFailed.current || !storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setError(null);
    } catch {
      setError('save');
    }
  }
  function act(event: ScenarioEvent) {
    if (!current.current) return;
    const next = applyScenarioEvent(current.current, event);
    if (next !== current.current) save(next);
  }
  function enter(context: ScenarioContext) {
    if (!current.current) {
      const id = crypto.randomUUID();
      setInstanceId(id);
      if (storageKey) {
        try { localStorage.setItem(`${storageKey}:instance`, id); } catch { setError('save'); }
      }
    }
    save(current.current ? applyScenarioEvent(current.current, { type: 'set-context', context }) : createScenarioSession(context));
    setOpen(true);
  }
  return { session, error, open, loadedKey, instanceId, enter, act, close: () => setOpen(false) };
}

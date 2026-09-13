'use client';

import { useEffect, useRef, useState } from 'react';
import { applyScenarioEvent, createScenarioSession, readScenarioSession, type ScenarioContext, type ScenarioEvent, type ScenarioSession } from '../lib/scenario';

const storageKey = 'le-sg-scenario-v1';
export function useScenario() {
  const [session, setSession] = useState<ScenarioSession | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<'read' | 'save' | null>(null);
  const current = useRef<ScenarioSession | null>(null);
  const readFailed = useRef(false);
  useEffect(() => {
    try {
      const restored = readScenarioSession(localStorage.getItem(storageKey));
      current.current = restored;
      setSession(restored);
      setOpen(restored !== null);
    } catch {
      readFailed.current = true;
      setError('read');
    }
  }, []);
  function save(next: ScenarioSession) {
    current.current = next;
    setSession(next);
    if (readFailed.current) return;
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
    save(current.current ? applyScenarioEvent(current.current, { type: 'set-context', context }) : createScenarioSession(context));
    setOpen(true);
  }
  return { session, error, open, enter, act, close: () => setOpen(false) };
}

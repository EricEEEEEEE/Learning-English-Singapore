'use client';

import { useEffect, useRef, useState } from 'react';
import { applyPracticeEvent, createPracticeSession, readPracticeSession, type PracticeEvent, type PracticeSession } from '../lib/practice';
import type { ScenarioSession, ScenarioVersion } from '../lib/scenario';
const storageKey = 'le-sg-practice-v1';
export function usePractice(scenarios: ScenarioSession | null) {
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<'read' | 'save' | null>(null);
  const current = useRef<PracticeSession | null>(null);
  const persisted = useRef<string | null>(null);
  const history = useRef<Record<string, PracticeSession>>({});
  const hydrated = useRef(false), readFailed = useRef(false), opened = useRef(false), clock = useRef(0);
  useEffect(() => {
    if (!scenarios || hydrated.current) return;
    hydrated.current = true;
    try {
      const raw = localStorage.getItem(storageKey);
      persisted.current = raw;
      if (raw === null) return;
      const envelope = JSON.parse(raw);
      if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) || typeof envelope.opened !== 'boolean' || !envelope.history || typeof envelope.history !== 'object' || Array.isArray(envelope.history)) throw new Error('Invalid practice history');
      const restoredHistory: Record<string, PracticeSession> = {};
      for (const [id, record] of Object.entries(envelope.history)) {
        const version = scenarios.versions.find(version => version.id === id);
        if (!version) throw new Error('Unknown practice version');
        const restored = readPracticeSession(JSON.stringify(record), version);
        if (!restored) throw new Error('Missing practice record');
        restoredHistory[id] = restored;
      }
      const version = scenarios.versions.find(version => version.id === envelope.scenario_version_id);
      if (!version) throw new Error('Unknown active practice');
      const restored = readPracticeSession(raw, version);
      if (!restored) throw new Error('Missing active practice');
      history.current = { ...restoredHistory, [version.id]: restored };
      current.current = restored;
      setSession(restored);
      opened.current = envelope.opened && scenarios.stage === 'ready' && scenarios.active_version_id === version.id;
      setOpen(opened.current);
    } catch {
      readFailed.current = true;
      setError('read');
    }
  }, [scenarios]);
  function save(next: PracticeSession) {
    current.current = next;
    history.current = { ...history.current, [next.scenario_version_id]: next };
    setSession(next);
    if (readFailed.current) return;
    try {
      // Preserve changes made by another tab or an external storage repair.
      if (localStorage.getItem(storageKey) !== persisted.current) {
        readFailed.current = true;
        setError('read');
        return;
      }
      const value = JSON.stringify({ ...next, history: history.current, opened: opened.current });
      localStorage.setItem(storageKey, value);
      persisted.current = value;
      setError(null);
    } catch { setError('save'); }
  }
  function act(event: PracticeEvent) {
    if (!current.current) return;
    const next = applyPracticeEvent(current.current, event);
    if (next !== current.current) save(next);
  }
  useEffect(() => {
    const change = () => {
      if (!opened.current || !current.current) return;
      save(applyPracticeEvent(current.current, { type: 'environment', visible: !document.hidden }));
    };
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, []);
  function enter(version: ScenarioVersion) {
    const previous = history.current[version.id];
    const restored = previous ? readPracticeSession(JSON.stringify(previous), version) : null;
    opened.current = true;
    setOpen(true);
    save(restored ?? createPracticeSession(version));
  }
  function close() {
    opened.current = false;
    setOpen(false);
    act({ type: 'end' });
  }
  function finishPlayback() {
    const s = current.current;
    if (!s?.current_utterance) return;
    const matching = { utterance_id: s.current_utterance.id, goal_revision: s.goal_revision, source: 'simulation' as const };
    clock.current += 100;
    act({ type: 'playback-started', ...matching, at: clock.current });
    clock.current += 100;
    act({ type: 'playback-ended', ...matching, at: clock.current });
  }
  function wait() { clock.current += 6000; act({ type: 'tick', at: clock.current }); }
  return { session, open, error, enter, close, act, finishPlayback, wait };
}

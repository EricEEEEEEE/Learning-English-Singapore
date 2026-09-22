'use client';

import { useEffect, useRef, useState } from 'react';
import { applyStudyAction, createStudySettings, readStudySettings, refreshStudyRecommendation,
  type LearningProfile, type StudyAction, type StudySettings } from '../lib/placement';

export function useStudySettings(profile: LearningProfile | null, storageKey: string | null) {
  const [settings, setSettings] = useState<StudySettings | null>(null);
  const [displayKey, setDisplayKey] = useState<string | null>(null);
  const [error, setError] = useState<'read' | 'save' | null>(null);
  const current = useRef<StudySettings | null>(null);
  const initialized = useRef(false);
  const readFailed = useRef(false);
  const loadedKey = useRef<string | null>(null);
  useEffect(() => {
    if (loadedKey.current !== storageKey) {
      loadedKey.current = storageKey;
      initialized.current = false;
      current.current = null;
      readFailed.current = false;
      setSettings(null);
      setDisplayKey(null);
    }
    if (!profile || !storageKey) return;
    let next: StudySettings;
    if (!initialized.current) {
      initialized.current = true;
      try {
        next = readStudySettings(localStorage.getItem(storageKey), profile);
      } catch {
        readFailed.current = true;
        setError('read');
        next = createStudySettings(profile);
      }
    } else next = refreshStudyRecommendation(current.current ?? createStudySettings(profile), profile);
    current.current = next;
    setSettings(next);
    setDisplayKey(storageKey);
  }, [profile, storageKey]);

  function act(action: StudyAction) {
    if (!current.current) return;
    const next = applyStudyAction(current.current, action);
    current.current = next;
    setSettings(next);
    if (readFailed.current || !storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setError(null);
    } catch {
      setError('save');
    }
  }
  return { settings, loadedKey: displayKey, error, act };
}

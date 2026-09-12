'use client';

import { useEffect, useRef, useState } from 'react';
import { applyStudyAction, createStudySettings, readStudySettings, refreshStudyRecommendation,
  type LearningProfile, type StudyAction, type StudySettings } from '../lib/placement';

const storageKey = 'le-sg-study-preferences-v1';
export function useStudySettings(profile: LearningProfile | null) {
  const [settings, setSettings] = useState<StudySettings | null>(null);
  const [error, setError] = useState<'read' | 'save' | null>(null);
  const current = useRef<StudySettings | null>(null);
  const initialized = useRef(false);
  const readFailed = useRef(false);
  useEffect(() => {
    if (!profile) return;
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
  }, [profile]);

  function act(action: StudyAction) {
    if (!current.current) return;
    const next = applyStudyAction(current.current, action);
    current.current = next;
    setSettings(next);
    if (readFailed.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setError(null);
    } catch {
      setError('save');
    }
  }
  return { settings, error, act };
}

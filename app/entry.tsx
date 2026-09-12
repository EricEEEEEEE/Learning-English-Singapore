'use client';

import { useEffect, useRef, useState } from 'react';
import DemoNotice from './demo-notice';
import Onboarding from './onboarding';
import { guideCopy } from './guide-copy';
import { applyOnboardingEvent, createOnboardingSession, readOnboardingSession, type OnboardingEvent, type OnboardingSession } from '../lib/onboarding';
import { entryCopy, languageChoices, type EntryLanguage } from './entry-copy';

type Preferences = { language: EntryLanguage | null; largeText: boolean; reducedMotion: boolean };
const defaultPreferences: Preferences = { language: null, largeText: false, reducedMotion: false };
const storageKey = 'le-sg-entry-preferences-v1';
const guideStorageKey = 'le-sg-onboarding-v1';

function readPreferences(value: string | null): Preferences {
  if (!value) return defaultPreferences;
  const saved: unknown = JSON.parse(value);
  if (!saved || typeof saved !== 'object') throw new Error('Invalid preferences');
  const data = saved as Record<string, unknown>;
  if (data.language !== null && !languageChoices.some(language => language.code === data.language)) {
    throw new Error('Invalid language');
  }
  if (typeof data.largeText !== 'boolean' || typeof data.reducedMotion !== 'boolean') {
    throw new Error('Invalid display preferences');
  }
  return data as Preferences;
}

function Icon({ name }: { name: 'language' | 'account' | 'sound' | 'settings' | 'privacy' }) {
  const paths = {
    language: 'M3 5h12M9 3v2M5 5c0 5 4 9 9 10M13 5c0 5-4 9-9 10M14 21l4-10 4 10M16 17h4',
    account: 'M15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM5 21v-2a7 7 0 0 1 14 0v2',
    sound: 'M11 4 6 8H3v8h3l5 4V4ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14',
    settings: 'M4 6h16M4 12h16M4 18h16M9 3v6M15 9v6M9 15v6',
    privacy: 'M12 3 4 6v6c0 4 4 7 8 9 4-2 8-5 8-9V6l-8-3ZM8 12l3 3 5-6',
  };
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export default function Entry() {
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [ready, setReady] = useState(false);
  const [onboarding, setOnboarding] = useState<OnboardingSession | null>(null);
  const onboardingRef = useRef<OnboardingSession | null>(null);
  const guideReadFailed = useRef(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideStorageError, setGuideStorageError] = useState<'read' | 'save' | null>(null);
  const [choosingLanguage, setChoosingLanguage] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [storageError, setStorageError] = useState<'read' | 'save' | null>(null);
  const [providerNotice, setProviderNotice] = useState(false);
  const panelHeading = useRef<HTMLHeadingElement>(null);
  const focusPanel = useRef(false);
  const language = preferences.language ?? 'zh-Hans';
  const copy = entryCopy[language];
  const showChoices = !preferences.language || choosingLanguage;
  const showGuide = guideOpen && onboarding !== null && !showChoices;
  const guide = guideCopy(language);

  useEffect(() => {
    try {
      setPreferences(readPreferences(localStorage.getItem(storageKey)));
    } catch {
      setStorageError('read');
    }
    try {
      const restored = readOnboardingSession(localStorage.getItem(guideStorageKey));
      onboardingRef.current = restored;
      setOnboarding(restored);
      setGuideOpen(restored !== null);
    } catch {
      guideReadFailed.current = true;
      setGuideStorageError('read');
    }
    setReady(true);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    if (focusPanel.current) {
      panelHeading.current?.focus();
      focusPanel.current = false;
    }
  }, [language, showChoices]);

  function savePreferences(next: Preferences) {
    setPreferences(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setStorageError(current => current === 'save' ? null : current);
    } catch {
      setStorageError('save');
    }
  }

  function selectLanguage(next: EntryLanguage) {
    focusPanel.current = true;
    savePreferences({ ...preferences, language: next });
    setChoosingLanguage(false);
    setProviderNotice(false);
    setPermissionsOpen(false);
  }

  function saveOnboarding(next: OnboardingSession) {
    onboardingRef.current = next;
    setOnboarding(next);
    if (guideReadFailed.current) return;
    try {
      localStorage.setItem(guideStorageKey, JSON.stringify(next));
      setGuideStorageError(current => current === 'save' ? null : current);
    } catch {
      setGuideStorageError('save');
    }
  }

  function guideEvent(event: OnboardingEvent) {
    const current = onboardingRef.current;
    if (current) {
      const next = applyOnboardingEvent(current, event);
      if (next !== current) saveOnboarding(next);
    }
  }

  function openGuide() {
    if (!onboardingRef.current) saveOnboarding(createOnboardingSession());
    setGuideOpen(true);
    setProviderNotice(false);
  }

  const utilities = (
    <>
          <p className="trial-note">{copy.trial}</p>
          <button type="button" className="audio-unavailable" disabled>
            <Icon name="sound" /><span>{copy.audio}<small>{copy.unavailable}</small></span>
          </button>
          <div className="help-actions">
            <button type="button" className="text-button" aria-expanded={permissionsOpen} aria-controls="permissions" onClick={() => setPermissionsOpen(!permissionsOpen)}><Icon name="privacy" />{copy.permissions}</button>
            <button type="button" className="text-button" aria-expanded={settingsOpen} aria-controls="display-settings" onClick={() => setSettingsOpen(!settingsOpen)}><Icon name="settings" />{copy.settings}</button>
          </div>
          <section id="permissions" className="help-panel" role="region" aria-labelledby="permissions-title" hidden={!permissionsOpen}>
            <h3 id="permissions-title">{copy.permissions}</h3>
            <p>{copy.permissionsCopy}</p>
            <p>{copy.storageCopy}</p>
            {permissionsOpen && <p>{copy.respect}</p>}
          </section>
          <section id="display-settings" className="help-panel" aria-labelledby="display-settings-title" hidden={!settingsOpen}>
            <h3 id="display-settings-title">{copy.settings}</h3>
            <p>{copy.settingsHint}</p>
            <label className="setting"><input type="checkbox" checked={preferences.largeText} disabled={!ready} onChange={event => savePreferences({ ...preferences, largeText: event.target.checked })} />{copy.large}</label>
            <label className="setting"><input type="checkbox" checked={preferences.reducedMotion} disabled={!ready} onChange={event => savePreferences({ ...preferences, reducedMotion: event.target.checked })} />{copy.reduced}</label>
          </section>
          <div role="status" aria-live="polite" className="entry-status">
            {providerNotice && <p>{copy.providerNotice}</p>}
            {storageError && <p>{storageError === 'read' ? copy.readError : copy.saveError}</p>}
            {guideStorageError && <p>{guideStorageError === 'read' ? guide.readError : guide.saveError}</p>}
          </div>
    </>
  );

  return (
    <div className="app-shell" data-large-text={preferences.largeText} data-reduced-motion={preferences.reducedMotion}>
      <title>{`Learning English in Singapore · ${copy.title.join(' ')}`}</title>
      <header className="site-header">
        <p className="wordmark" lang="en">Learning English<span>in Singapore</span></p>
        <span className="demo-label">{copy.demo}</span>
      </header>

      {showGuide && onboarding ? (
        <main className="guide-main">
          <Onboarding language={language} session={onboarding} onEvent={guideEvent}
            onLanguage={() => setChoosingLanguage(true)} onLeave={() => setGuideOpen(false)} />
          <aside className="guide-utilities" aria-label={copy.settings}>{utilities}</aside>
        </main>
      ) : (
      <main>
        <div className="introduction">
          <h1>{copy.title[0]}<span>{copy.title[1]}</span></h1>
          <p className="intro-copy">{copy.intro}</p>
          <DemoNotice copy={copy} />
          <p className="pace-note">{copy.pace}</p>
        </div>

        <div className="entry-panel">
          {showChoices ? (
            <section aria-labelledby="entry-panel-title">
              <Icon name="language" />
              <h2 id="entry-panel-title" ref={panelHeading} tabIndex={-1}>{copy.choose}</h2>
              <p className="panel-copy">{copy.chooseHint}</p>
              <div className="language-choices">
                {languageChoices.map(choice => (
                  <button key={choice.code} type="button" lang={choice.code} disabled={!ready} onClick={() => selectLanguage(choice.code)}>
                    <span><strong>{choice.name}</strong><small>{choice.note}</small></span>
                    <span aria-hidden="true">→</span>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <>
              <section role="group" aria-labelledby="entry-panel-title">
                <Icon name="account" />
                <h2 id="entry-panel-title" ref={panelHeading} tabIndex={-1}>{copy.login}</h2>
                <p className="panel-copy">{copy.loginHint}</p>
                <div className="account-choices">
                  <button type="button" onClick={() => setProviderNotice(true)}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M15 14a8 8 0 0 1-7 1l-4 2 1-4a6 6 0 1 1 13-3" /><path d="M21 18l1 3-3-1a6 6 0 1 1 2-2Z" /></svg>
                    {copy.wechat}
                    <small>{copy.unavailable}</small>
                  </button>
                  <button type="button" onClick={() => setProviderNotice(true)}>
                    <span className="provider-letter" aria-hidden="true">G</span>
                    Google
                    <small>{copy.unavailable}</small>
                  </button>
                </div>
              </section>
              <button type="button" className="text-button" onClick={() => { focusPanel.current = true; setChoosingLanguage(true); setProviderNotice(false); }}>
                <Icon name="language" />{copy.change}
              </button>
              <div className="guide-entry">
                <button type="button" className="guide-primary" onClick={openGuide}><Icon name="account" />{guide.entry}</button>
                <p>{guide.entryHint}</p>
              </div>
            </>
          )}

          {utilities}
        </div>
      </main>
      )}

      <footer className="site-footer">
        <div><h2>{copy.respectTitle}</h2><p>{copy.respect}</p></div>
        <p className="footer-pace">{copy.pace}</p>
      </footer>
    </div>
  );
}

'use client';

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { entryCopy, languageChoices, type EntryLanguage } from './entry-copy';
import { useAccountBoundary } from './use-account-boundary';
import { sceneEntryCopy } from './scene-entry-copy';

const storageKey = 'le-sg-entry-preferences-v1';
type Preferences = { language: EntryLanguage; largeText: boolean; reducedMotion: boolean };
const defaults: Preferences = { language: 'zh-Hans', largeText: false, reducedMotion: false };
const journeyCopy = {
  'zh-Hans': { scene: '你想在哪个场景下学习英语？', hint: '用你熟悉的语言，简单说说你想准备的场景。', checking: '正在确认登录…', failed: '暂时无法确认登录，请重试。', retry: '重新检查登录' },
  id: { scene: 'Dalam situasi apa Anda ingin belajar bahasa Inggris?', hint: 'Ceritakan singkat situasi yang ingin Anda siapkan dalam bahasa yang Anda pahami.', checking: 'Memeriksa sesi masuk…', failed: 'Sesi masuk belum dapat diperiksa. Coba lagi.', retry: 'Periksa kembali' },
  ja: { scene: 'どんな場面で英語を学びたいですか？', hint: '使い慣れた言語で、準備したい場面を簡単に教えてください。', checking: 'ログインを確認中…', failed: 'ログインを確認できません。もう一度お試しください。', retry: 'もう一度確認' },
  ko: { scene: '어떤 상황에서 영어를 배우고 싶으세요?', hint: '익숙한 언어로 준비하고 싶은 상황을 간단히 알려 주세요.', checking: '로그인 확인 중…', failed: '로그인을 확인할 수 없습니다. 다시 시도해 주세요.', retry: '다시 확인' },
  hi: { scene: 'आप किस परिस्थिति में अंग्रेज़ी सीखना चाहते हैं?', hint: 'अपनी परिचित भाषा में उस परिस्थिति के बारे में थोड़ा बताएँ।', checking: 'साइन इन की जाँच हो रही है…', failed: 'साइन इन की जाँच नहीं हो सकी। फिर कोशिश करें।', retry: 'फिर जाँचें' },
};

function supportedLanguage(value: unknown): EntryLanguage | undefined {
  return languageChoices.find(choice => choice.code === value)?.code;
}

type SceneDraft = { owner: string; text: string; page: 'scene' | 'background' };
type InputFocus = { owner: string; start: number; end: number; direction: 'forward' | 'backward' | 'none' };

function SceneDescription({ draft, onChange, language, title, hint, focusMemory }: {
  draft: SceneDraft; onChange: (next: SceneDraft) => void; language: EntryLanguage;
  title: string; hint: string; focusMemory: RefObject<InputFocus | null>;
}) {
  const copy = sceneEntryCopy[language];
  const input = useRef<HTMLTextAreaElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const nextFocus = useRef<'input' | 'heading' | null>(null);
  const [invalid, setInvalid] = useState(false);

  useLayoutEffect(() => {
    const saved = focusMemory.current;
    if (saved?.owner === draft.owner && document.activeElement === document.body && input.current) {
      input.current.focus({ preventScroll: true });
      input.current.setSelectionRange(saved.start, saved.end, saved.direction);
    }
    return () => {
      const field = input.current;
      focusMemory.current = field && document.activeElement === field
        ? { owner: draft.owner, start: field.selectionStart, end: field.selectionEnd, direction: field.selectionDirection }
        : null;
    };
  }, [draft.owner, focusMemory]);

  useLayoutEffect(() => {
    if (nextFocus.current === 'input' && input.current) {
      input.current.focus();
      input.current.setSelectionRange(draft.text.length, draft.text.length);
    } else if (nextFocus.current === 'heading') heading.current?.focus();
    nextFocus.current = null;
  }, [draft.page, draft.text]);

  if (draft.page === 'background') return <section className="scene-form">
    <h1 ref={heading} tabIndex={-1}>{copy.background}</h1>
    <p className="scene-description">{draft.text}</p>
    <button className="text-button" type="button" onClick={() => { nextFocus.current = 'input'; onChange({ ...draft, page: 'scene' }); }}>{copy.back}</button>
  </section>;

  return <form className="scene-form" noValidate onSubmit={event => {
    event.preventDefault();
    if (!draft.text.trim()) { setInvalid(true); input.current?.focus(); return; }
    setInvalid(false);
    nextFocus.current = 'heading';
    onChange({ ...draft, page: 'background' });
  }}>
    <h1 id="scene-entry-title">{title}</h1>
    <p className="panel-copy" id="scene-entry-hint">{hint}</p>
    <textarea ref={input} aria-labelledby="scene-entry-title" aria-describedby={`scene-entry-hint${invalid ? ' scene-entry-error' : ''}`}
      aria-invalid={invalid || undefined} maxLength={2000} value={draft.text}
      onChange={event => { setInvalid(false); onChange({ ...draft, text: event.target.value }); }} />
    {invalid ? <p className="scene-entry-error" id="scene-entry-error" role="alert">{copy.empty}</p> : null}
    <div className="scene-examples" role="group" aria-label={copy.examplesLabel}>
      {copy.examples.map(example => <button key={example.label} type="button" onClick={() => {
        setInvalid(false);
        if (draft.text === example.text) {
          input.current?.focus();
          input.current?.setSelectionRange(example.text.length, example.text.length);
          return;
        }
        nextFocus.current = 'input';
        onChange({ ...draft, text: example.text });
      }}>{example.label}</button>)}
    </div>
    <button className="guide-primary" type="submit">{copy.next}</button>
  </form>;
}

export default function LearningEntry() {
  const account = useAccountBoundary();
  const [preferences, setPreferences] = useState(defaults);
  const [ready, setReady] = useState(false);
  const [embedded, setEmbedded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [preferenceError, setPreferenceError] = useState<'read' | 'save' | null>(null);
  const [draft, setDraft] = useState<SceneDraft | null>(null);
  const inputFocus = useRef<InputFocus | null>(null);
  const initialized = useRef(false);
  const language = preferences.language;
  const copy = entryCopy[language];
  const journey = journeyCopy[language];

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    let next = { ...defaults };
    for (const preferred of navigator.languages) {
      const match = preferred.startsWith('zh') ? 'zh-Hans' : supportedLanguage(preferred.split('-')[0]);
      if (match) { next.language = match; break; }
    }
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (saved) {
        if (typeof saved.largeText !== 'boolean' || typeof saved.reducedMotion !== 'boolean') throw new Error('Invalid preferences');
        next = { language: supportedLanguage(saved.language) ?? next.language, largeText: saved.largeText, reducedMotion: saved.reducedMotion };
      }
    } catch { setPreferenceError('read'); }
    const url = new URL(window.location.href);
    const callbackLanguage = supportedLanguage(url.searchParams.get('language'));
    if (callbackLanguage) next.language = callbackLanguage;
    if (callbackLanguage) setNotice(url.searchParams.get('auth'));
    for (const name of ['auth', 'language', 'returnTo']) url.searchParams.delete(name);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    setPreferences(next);
    if (callbackLanguage) {
      try { localStorage.setItem(storageKey, JSON.stringify(next)); }
      catch { setPreferenceError('save'); }
    }
    setEmbedded(/MicroMessenger|; wv\)/i.test(navigator.userAgent));
    setReady(true);
  }, []);

  useEffect(() => { document.documentElement.lang = language; }, [language]);

  function changeLanguage(value: string) {
    const selected = supportedLanguage(value);
    if (!selected) return;
    const next = { ...preferences, language: selected };
    setPreferences(next);
    setNotice(null);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setPreferenceError(null); }
    catch { setPreferenceError('save'); }
  }

  const checking = !ready || !account.ready;
  const reason = notice === 'success' ? 'verification_failed' : notice;
  const authMessage = reason && Object.hasOwn(copy.authNotice, reason) ? copy.authNotice[reason] : copy.authNotice.failed;
  const status = checking ? journey.checking : account.failed ? journey.failed
    : preferenceError ? (preferenceError === 'read' ? copy.readError : copy.saveError)
    : !account.authenticated && notice ? notice === 'wechat' ? copy.providerNotice
      : notice === 'webview' ? copy.webViewNotice
      : authMessage
    : null;

  return <div className="app-shell" data-large-text={preferences.largeText} data-reduced-motion={preferences.reducedMotion}>
    <title>Learning English in Singapore</title>
    <header className="site-header">
      <div className="brand-lockup"><p className="wordmark" lang="en">Learning English<span>in Singapore</span></p><p className="brand-slogan">帮你融入新加坡，相信自己可以做到。</p></div>
      <label className="simple-language"><span>{copy.change}</span><select aria-label={copy.change} value={language} disabled={!ready} onChange={event => changeLanguage(event.target.value)}>
        {languageChoices.map(choice => <option key={choice.code} value={choice.code}>{choice.name}</option>)}
      </select></label>
    </header>
    <main className="simple-main">
      {checking ? null : account.failed ? <section><h1>{copy.login}</h1><button className="guide-primary" type="button" onClick={account.retry}>{journey.retry}</button></section>
        : account.authenticated && account.accountKey ? <SceneDescription key={account.accountKey} language={language} title={journey.scene} hint={journey.hint}
          draft={draft?.owner === account.accountKey ? draft : { owner: account.accountKey, text: '', page: 'scene' }} onChange={setDraft} focusMemory={inputFocus} />
        : <section role="group" aria-labelledby="login-title">
          <h1 id="login-title">{copy.login}</h1>
          <div className="account-choices">
            <button type="button" onClick={() => setNotice('wechat')}>{copy.wechat}<small>{copy.unavailable}</small></button>
            {embedded ? <button type="button" onClick={() => setNotice('webview')}>Google</button>
              : <a href={`/api/auth/google/start?language=${encodeURIComponent(language)}&returnTo=%2F`}><span className="provider-letter" aria-hidden="true">G</span>Google</a>}
          </div>
        </section>}
      <p className="entry-status" role="status" aria-live="polite">{status}</p>
    </main>
    <footer className="simple-footer"><details><summary>{copy.respectTitle}</summary><p>{copy.respect}</p></details><p>{copy.trial}</p></footer>
  </div>;
}

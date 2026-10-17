'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { entryCopy, languageChoices, type EntryLanguage } from './entry-copy';
import { useAccountBoundary } from './use-account-boundary';
import { sceneEntryCopy } from './scene-entry-copy';
import { sceneRequirementCopy } from './scene-requirement-copy';
import { useSceneRequirements, type SceneDraft } from './use-scene-requirements';
import { sceneKeywordKeys } from '../lib/scene-requirement-content';
import { useSceneGeneration } from './use-scene-generation';
import { sceneGenerationCopy } from './scene-generation-copy';
import RealSceneCourse from './real-scene-course';
import { useLearningLibrary } from './use-learning-library';
import { learningLibraryCopy } from './learning-library-copy';
import { dataTrustCopy } from './data-trust-copy';
import { SignOutButton, SceneDelete, DeleteAllData, StoredData, GenerationRecords } from './data-trust';

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

type InputFocus = { owner: string; start: number; end: number; direction: 'forward' | 'backward' | 'none' };

function SceneDescription({ draft, onChange, language, title, hint, focusMemory, requirements, generation }: {
  draft: SceneDraft; onChange: (next: SceneDraft) => void; language: EntryLanguage;
  title: string; hint: string; focusMemory: RefObject<InputFocus | null>; requirements: ReturnType<typeof useSceneRequirements>;
  generation: ReturnType<typeof useSceneGeneration>;
}) {
  const copy = sceneEntryCopy[language];
  const requirementCopy = sceneRequirementCopy[language];
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

  if (draft.page === 'background') return <form className="scene-form" onSubmit={event => { event.preventDefault(); void generation.generate(requirements.save); }}>
    <h1 ref={heading} tabIndex={-1}>{copy.background}</h1>
    <p className="scene-description">{draft.text}</p>
    <p className="panel-copy" id="scene-keyword-hint">{requirementCopy.hint}</p>
    <div className="scene-keywords">{sceneKeywordKeys.map(key => <div key={key}>
      <label htmlFor={`scene-keyword-${key}`}>{requirementCopy.fields[key].label}</label>
      <input id={`scene-keyword-${key}`} type="text" maxLength={200} disabled={generation.preparing} value={draft.keywords[key]} aria-describedby="scene-keyword-hint"
        placeholder={requirementCopy.fields[key].example} onChange={event => onChange({ ...draft, keywords: { ...draft.keywords, [key]: event.target.value } })} />
    </div>)}</div>
    {requirements.saveFailed || requirements.conflict ? <p className="scene-entry-error" role="alert">{requirements.conflict ? requirementCopy.conflict : requirementCopy.saveError}</p> : null}
    {requirements.conflict ? <button className="text-button" type="button" onClick={requirements.retry}>{requirementCopy.loadSaved}</button> : null}
    <button className="guide-primary" type="submit" disabled={generation.preparing || requirements.saving || requirements.conflict}>{sceneGenerationCopy[language].generate}</button>
    <button className="text-button" type="button" disabled={generation.preparing || requirements.saving || requirements.conflict} onClick={() => void requirements.save()}>{requirements.saving ? requirementCopy.saving : requirementCopy.save}</button>
    {requirements.saved ? <p className="scene-save-status" role="status">{requirementCopy.saved}</p> : null}
    <p className="scene-note">{requirementCopy.local}</p>
    <button className="text-button" type="button" disabled={generation.preparing} onClick={() => { nextFocus.current = 'input'; onChange({ ...draft, page: 'scene' }); }}>{copy.back}</button>
  </form>;

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
  const inputFocus = useRef<InputFocus | null>(null);
  const verifiedOwner = useRef<string | null>(null);
  const initialized = useRef(false);
  const language = preferences.language;
  const copy = entryCopy[language];
  const journey = journeyCopy[language];
  const restoreLanguage = useCallback((value: EntryLanguage) => setPreferences(previous => ({ ...previous, language: value })), []);
  useLayoutEffect(() => {
    if (account.ready && !account.failed) verifiedOwner.current = account.authenticated ? account.accountKey : null;
  }, [account.ready, account.failed, account.authenticated, account.accountKey]);
  // Retain only memory during an uncertain session check. The private UI below
  // still requires a currently verified session; a confirmed logout clears it.
  const requirementsOwner = !account.ready || account.failed ? verifiedOwner.current : account.authenticated ? account.accountKey : null;
  const requirements = useSceneRequirements(requirementsOwner, language, restoreLanguage);
  const generation = useSceneGeneration(requirementsOwner, account.ready && !account.failed && account.authenticated);
  const verified = ready && account.ready && !account.failed && account.authenticated;
  const library = useLearningLibrary(requirementsOwner, verified);
  const libraryCopy = learningLibraryCopy[language];
  const requirementCopy = sceneRequirementCopy[language];
  const trustCopy = dataTrustCopy[language];
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [dataNotice, setDataNotice] = useState<{ text: 'sceneDeleted' | 'sceneDeleteFailed' | 'allDeleted' | 'allDeleteFailed'; error: boolean } | null>(null);
  useEffect(() => { setRecordsOpen(false); setDataNotice(null); }, [requirementsOwner, library.open]);

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
  const selectedScene = library.selected;
  const viewing = selectedScene?.course ?? generation.watching;
  const player = viewing && requirementsOwner ? <div hidden={!verified}>
    <RealSceneCourse key={`${requirementsOwner}:${viewing.id}:${viewing.revision}:${viewing.materialsRevision ?? 0}`} language={language}
      saved={viewing} guided rememberProgress active={verified} requirement={selectedScene?.requirement ?? generation.watchRequirement}
      contextSource={selectedScene?.contextSource} backLabel={selectedScene ? libraryCopy.back : undefined}
      onBack={selectedScene ? library.closeCourse : generation.closeWatch} />
  </div> : null;

  return <div className="app-shell" data-large-text={preferences.largeText} data-reduced-motion={preferences.reducedMotion}>
    <title>Learning English in Singapore</title>
    <header className="site-header">
      <div className="brand-lockup"><p className="wordmark" lang="en">Learning English<span>in Singapore</span></p><p className="brand-slogan">帮你融入新加坡，相信自己可以做到。</p></div>
      <label className="simple-language"><span>{copy.change}</span><select aria-label={copy.change} value={language} disabled={!ready || generation.preparing} onChange={event => changeLanguage(event.target.value)}>
        {languageChoices.map(choice => <option key={choice.code} value={choice.code}>{choice.name}</option>)}
      </select></label>
    </header>
    <main className="simple-main">
      {player}
      {checking ? null : account.failed ? <section><h1>{copy.login}</h1><button className="guide-primary" type="button" onClick={account.retry}>{journey.retry}</button></section>
        : account.authenticated && account.accountKey ? viewing ? null
        : library.open ? recordsOpen ? <GenerationRecords language={language} onBack={() => setRecordsOpen(false)} /> : <section>
          <h1>{libraryCopy.title}</h1><p className="panel-copy">{libraryCopy.local}</p>
          {dataNotice ? <p className={dataNotice.error ? 'scene-entry-error' : 'scene-save-status'} role={dataNotice.error ? 'alert' : 'status'}>{trustCopy[dataNotice.text]}</p> : null}
          {!library.result || library.result.status === 'loading' ? <p role="status">{libraryCopy.loading}</p> : library.result.status === 'failed'
            ? <><p role="alert">{libraryCopy.error}</p><button className="text-button" type="button" onClick={library.retry}>{libraryCopy.retry}</button></>
            : <>{library.result.unavailable > 0 && <p role="status">{libraryCopy.unavailable(library.result.unavailable)}</p>}
              {library.result.scenes.length ? <ul className="learning-scenes">{library.result.scenes.map(scene => <li key={`${scene.course.id}:${scene.course.revision}:${scene.course.materialsRevision ?? 0}`} className="scene-card">
                <p className="scene-description">{scene.description}</p><button className="text-button" type="button" onClick={() => library.choose(scene)}>{libraryCopy.learn}</button>
                <SceneDelete language={language} description={scene.description} course={scene.course}
                  onDeleted={() => { library.drop(scene.course); setDataNotice({ text: 'sceneDeleted', error: false }); }}
                  onFailed={() => setDataNotice({ text: 'sceneDeleteFailed', error: true })} />
              </li>)}</ul> : library.result.unavailable === 0 ? <p>{libraryCopy.empty}</p> : null}</>}
          <button className="text-button" type="button" onClick={() => setRecordsOpen(true)}>{trustCopy.records}</button>
          <StoredData language={language} />
          <DeleteAllData language={language}
            onDeleted={() => { library.drop(null); requirements.retry(); setDataNotice({ text: 'allDeleted', error: false }); }}
            onFailed={() => setDataNotice({ text: 'allDeleteFailed', error: true })} />
          <button className="text-button" type="button" onClick={library.close}>{libraryCopy.input}</button>
        </section>
        : generation.target !== null ? <section className="scene-form">
          <h1>{sceneGenerationCopy[language].title}</h1>
          {generation.view ? <p className="scene-description">{generation.view.requirement.content.description}</p> : null}
          {generation.error ? <p className="scene-entry-error" role="alert">{sceneGenerationCopy[language][generation.error === 'version' ? 'version' : 'error']}</p>
            : <p className="panel-copy" role="status">{generation.view ? sceneGenerationCopy[language].phases[generation.view.phase] : sceneGenerationCopy[language].loading}</p>}
          {generation.view?.phase === 'ready' ? <button className="guide-primary" type="button" onClick={generation.watch}>{sceneGenerationCopy[language].watch}</button> : null}
          <button className="text-button" type="button" disabled={generation.preparing} onClick={generation.retry}>{sceneGenerationCopy[language].retry}</button>
          <button className="text-button" type="button" onClick={() => {
            if (requirements.draft) requirements.change({ ...requirements.draft, page: 'background' });
            generation.back();
          }}>{sceneGenerationCopy[language].back}</button>
        </section>
        : requirements.readFailed ? <section>
          <p className="scene-entry-error" role="alert">{requirementCopy.readError}</p>
          <button className="guide-primary" type="button" onClick={requirements.retry}>{requirementCopy.retry}</button>
        </section> : requirements.loading || !requirements.draft ? <p role="status">{requirementCopy.loading}</p>
        : <><SceneDescription key={account.accountKey} language={language} title={journey.scene} hint={journey.hint}
          draft={requirements.draft} onChange={requirements.change} focusMemory={inputFocus} requirements={requirements} generation={generation} />
          <button className="text-button" type="button" onClick={library.show}>{libraryCopy.title}</button>
          <SignOutButton language={language} /></>
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

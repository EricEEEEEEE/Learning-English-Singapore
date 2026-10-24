'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
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
import { sceneSeedCategories, sceneSeeds, type SceneSeed, type SceneSeedCategory } from '../lib/scene-seeds';
import { sceneSeedCopy } from './scene-seed-copy';
import { sceneConfirmCopy } from './scene-confirm-copy';
import { resumeSafetyCopy } from './resume-safety-copy';
import { useOnline } from './use-online';
import { ActionBar, AppBar, Icon, Sheet, ShellContext, type CommonOptions } from './shell';
import { shellCopy } from './shell-copy';
import { c11Copy } from './c11-copy';
import { c13Copy } from './c13-copy';
import { c14Copy } from './c14-copy';
import ReviewListen, { useReviewQueue, type ReviewToday } from './review-listen';

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

// C11-3: the last three keywords are optional and fold away; anything already filled there opens them on arrival.
function KeywordsMore({ summary, filled, children }: { summary: string; filled: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(filled);
  return <details className="keywords-more" data-testid="keywords-more" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><Icon name="plus" size={18} />{summary}</summary>
    <div className="keywords-more-fields">{children}</div>
  </details>;
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
  const confirmHeading = useRef<HTMLHeadingElement>(null);
  const nextFocus = useRef<'input' | 'heading' | 'confirm' | null>(null);
  const [invalid, setInvalid] = useState(false);
  // C7 T30A: local example scenes, folded away until asked for. Picking one only fills the editable draft.
  const seedCopy = sceneSeedCopy[language];
  const [seedsOpen, setSeedsOpen] = useState(false);
  const [category, setCategory] = useState<SceneSeedCategory>('school');
  const [picked, setPicked] = useState(false);
  // C7 T14A: "generate" first shows what will be generated; nothing is saved or sent until it is confirmed.
  const [confirming, setConfirming] = useState(false);
  const confirmCopy = sceneConfirmCopy[language];
  const c11 = c11Copy[language];
  const submitting = useRef(false);

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
    else if (nextFocus.current === 'confirm') confirmHeading.current?.focus();
    nextFocus.current = null;
  }, [draft.page, draft.text, confirming, seedsOpen]);

  function pick(seed: SceneSeed) {
    const text = seed.text[language];
    setInvalid(false); setPicked(true); setSeedsOpen(false);
    nextFocus.current = 'input';
    if (draft.text === text.description && JSON.stringify(draft.keywords) === JSON.stringify(text.keywords)) return;
    onChange({ ...draft, text: text.description, keywords: { ...text.keywords } });
  }

  if (draft.page === 'background' && confirming) {
    const filled = sceneKeywordKeys.filter(key => draft.keywords[key].trim());
    const role = (value: string) => value.trim() || confirmCopy.roleUnset;
    return <section className="scene-confirm" aria-labelledby="scene-confirm-title">
      <form className="scene-form" onSubmit={async event => {
        event.preventDefault();
        if (submitting.current) return;
        submitting.current = true;
        try { await generation.generate(requirements.save); }
        finally {
          submitting.current = false;
          // Still here only when nothing was submitted (a failed or conflicting save): back to the inputs and the error.
          setConfirming(false);
        }
      }}>
        <h1 id="scene-confirm-title" ref={confirmHeading} tabIndex={-1}>{confirmCopy.title}</h1>
        <h2>{confirmCopy.scene}</h2>
        <p className="scene-description">{draft.text}</p>
        <div className="confirm-roles">
          <p className="scene-confirm-role">{confirmCopy.you(role(draft.keywords.learnerRole))}</p>
          <span className="confirm-arrow" aria-hidden="true">→</span>
          <p className="scene-confirm-role">{confirmCopy.partner(role(draft.keywords.partnerRole))}</p>
        </div>
        <h2>{confirmCopy.keywords}</h2>
        {filled.length ? <dl className="scene-confirm-keywords">{filled.map(key => <div key={key} className="confirm-chip" data-testid="confirm-chip">
          <dt>{requirementCopy.fields[key].label}</dt><dd>{draft.keywords[key].trim()}</dd>
        </div>)}</dl> : <p>{confirmCopy.none}</p>}
        <p className="scene-note">{confirmCopy.wait}</p>
        <ActionBar>
          <p className="action-note action-note--quiet scene-confirm-length">{confirmCopy.length}</p>
          <p className="action-note">{confirmCopy.cost}</p>
          <button className="btn btn-ghost" type="button" disabled={generation.preparing} onClick={() => { nextFocus.current = 'heading'; setConfirming(false); }}>{confirmCopy.edit}</button>
          <button className="btn btn-primary" type="submit" disabled={generation.preparing || requirements.saving || requirements.conflict}>{confirmCopy.confirm}</button>
        </ActionBar>
      </form>
    </section>;
  }

  if (draft.page === 'background') return <form className="scene-form" onSubmit={event => { event.preventDefault(); nextFocus.current = 'confirm'; setConfirming(true); }}>
    <h1 ref={heading} tabIndex={-1}>{copy.background}</h1>
    <p className="scene-description">{draft.text}</p>
    <p className="panel-copy" id="scene-keyword-hint">{requirementCopy.hint}</p>
    {(() => {
      const field = (key: typeof sceneKeywordKeys[number]) => <div key={key} className="scene-keyword">
        <label htmlFor={`scene-keyword-${key}`}>{requirementCopy.fields[key].label}</label>
        <input id={`scene-keyword-${key}`} type="text" maxLength={200} disabled={generation.preparing} value={draft.keywords[key]} aria-describedby="scene-keyword-hint"
          placeholder={requirementCopy.fields[key].example} onChange={event => onChange({ ...draft, keywords: { ...draft.keywords, [key]: event.target.value } })} />
      </div>;
      const later = sceneKeywordKeys.slice(3);
      return <div className="scene-keywords">
        {sceneKeywordKeys.slice(0, 3).map(field)}
        <KeywordsMore summary={c11.keywordsMore} filled={later.some(key => draft.keywords[key].trim())}>{later.map(field)}</KeywordsMore>
      </div>;
    })()}
    {requirements.saveFailed || requirements.conflict ? <p className="scene-entry-error" role="alert">{requirements.conflict ? requirementCopy.conflict : requirementCopy.saveError}</p> : null}
    {requirements.conflict ? <button className="text-button" type="button" onClick={requirements.retry}>{requirementCopy.loadSaved}</button> : null}
    {requirements.unsavedOffline ? <p className="scene-entry-error" role="alert">{resumeSafetyCopy[language].unsavedOffline}</p> : null}
    {requirements.saved ? <p className="scene-save-status" role="status">{requirementCopy.saved}</p> : null}
    <p className="scene-note">{requirementCopy.local}</p>
    <button className="text-button" type="button" disabled={generation.preparing} onClick={() => { nextFocus.current = 'input'; onChange({ ...draft, page: 'scene' }); }}>{copy.back}</button>
    <ActionBar>
      <button className="btn btn-ghost" type="button" disabled={generation.preparing || requirements.saving || requirements.conflict} onClick={() => void requirements.save()}>{requirements.saving ? requirementCopy.saving : requirementCopy.save}</button>
      <button className="btn btn-primary" type="submit" disabled={generation.preparing || requirements.saving || requirements.conflict}>{sceneGenerationCopy[language].generate}</button>
    </ActionBar>
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
      onChange={event => { setInvalid(false); setPicked(false); onChange({ ...draft, text: event.target.value }); }} />
    {invalid ? <p className="scene-entry-error" id="scene-entry-error" role="alert">{copy.empty}</p> : null}
    <p className="scene-note" data-testid="scene-privacy">{resumeSafetyCopy[language].privacy}</p>
    <div className="scene-examples" role="group" aria-label={copy.examplesLabel}>
      {copy.examples.map(example => <button key={example.label} type="button" onClick={() => {
        setInvalid(false); setPicked(false);
        if (draft.text === example.text) {
          input.current?.focus();
          input.current?.setSelectionRange(example.text.length, example.text.length);
          return;
        }
        nextFocus.current = 'input';
        onChange({ ...draft, text: example.text });
      }}>{example.label}</button>)}
    </div>
    <div className="scene-seeds">
      <button className="text-button browse-link" type="button" aria-haspopup="dialog" aria-expanded={seedsOpen} onClick={() => setSeedsOpen(true)}>{seedCopy.open}<Icon name="chevron" size={18} /></button>
      {picked ? <p className="scene-save-status" role="status">{seedCopy.picked}</p> : null}
    </div>
    <Sheet open={seedsOpen} onClose={() => setSeedsOpen(false)} title={seedCopy.open} testId="seed-sheet" closeLabel={shellCopy[language].close}>
      <p className="sheet-note">{seedCopy.note}</p>
      <div className="scene-seed-categories" role="group" aria-label={seedCopy.categoriesLabel}>
        {sceneSeedCategories.map(item => <button key={item.id} type="button" aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{seedCopy.categories[item.id]}</button>)}
      </div>
      <ul className="scene-seed-list" aria-label={seedCopy.listLabel}>
        {sceneSeeds.filter(seed => seed.category === category).map(seed => <li key={seed.id}><button type="button" onClick={() => pick(seed)}>{seed.text[language].label}</button></li>)}
      </ul>
    </Sheet>
    <ActionBar><button className={`btn btn-primary btn-submit${draft.text.trim() ? '' : ' is-idle'}`} type="submit">{copy.next}</button></ActionBar>
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
  const [rowMenu, setRowMenu] = useState<string | null>(null);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const c11 = c11Copy[language];
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const online = useOnline();
  const extra = resumeSafetyCopy[language];
  // C8-4: after a provider call, cancelling first explains what can and cannot be undone.
  const [stopAsk, setStopAsk] = useState(false);
  useEffect(() => { setStopAsk(false); }, [generation.target, requirementsOwner]);
  const [dataNotice, setDataNotice] = useState<{ text: 'sceneDeleted' | 'sceneDeleteFailed' | 'allDeleted' | 'allDeleteFailed'; error: boolean } | null>(null);
  useEffect(() => { setRecordsOpen(false); setDataNotice(null); setRowMenu(null); }, [requirementsOwner, library.open]);
  useEffect(() => { setSignOutFailed(false); setMoreOpen(false); }, [requirementsOwner]);
  // C13-1/C13-2: today's sentences to listen to again, "continue" and "heard N", read while my scenes are shown.
  const c13 = c13Copy[language];
  const [reviewing, setReviewing] = useState(false);
  useEffect(() => { setReviewing(false); }, [requirementsOwner, library.open]);

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

  // C8-2: the same stored display preferences as before, now switchable from the main path; applied at once.
  function changeDisplay(change: Partial<Omit<Preferences, 'language'>>) {
    const next = { ...preferences, ...change };
    setPreferences(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setPreferenceError(null); }
    catch { setPreferenceError('save'); }
  }

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
  const queue = useReviewQueue(requirementsOwner, verified && library.open && !viewing && !reviewing);
  const placeText = (last: NonNullable<ReviewToday['last']>) => {
    const n = last.index ?? 1, place = c13.place;
    return last.page === 'sentences' ? place.sentences(n) : last.page === 'prompt' ? place.prompt(n) : last.page === 'practice' ? place.practice(n)
      : last.page === 'terms' ? place.terms : last.page === 'role' ? place.role : place.watch;
  };
  const player = viewing && requirementsOwner ? <div hidden={!verified}>
    <RealSceneCourse key={`${requirementsOwner}:${viewing.id}:${viewing.revision}:${viewing.materialsRevision ?? 0}`} language={language}
      saved={viewing} guided rememberProgress active={verified} requirement={selectedScene?.requirement ?? generation.watchRequirement}
      contextSource={selectedScene?.contextSource} backLabel={selectedScene ? libraryCopy.back : undefined}
      onBack={selectedScene ? library.closeCourse : generation.closeWatch} />
  </div> : null;

  const shell = shellCopy[language];
  const showPlayer = !!player && verified;
  const signedIn = !checking && !account.failed && account.authenticated && !!account.accountKey;
  // The brand and slogan stay only on the first pages (sign-in and the scene input); other pages get a short mark.
  const home = !account.authenticated || (!viewing && !library.open && generation.target === null && requirements.draft?.page === 'scene');
  const openMore = () => setMoreOpen(true);
  const languageSelect = <select aria-label={copy.change} value={language} disabled={!ready || generation.preparing} onChange={event => changeLanguage(event.target.value)}>
    {languageChoices.map(choice => <option key={choice.code} value={choice.code}>{choice.name}</option>)}
  </select>;
  // What every "more" sheet ends with: interface language, display, and the notes that used to fill each page.
  const common = ({ meta, trial = false, settings }: CommonOptions) => <>
    <label className="sheet-section sheet-field"><span className="sheet-label"><Icon name="globe" size={18} />{shell.language}</span>{languageSelect}</label>
    <fieldset className="sheet-section switch-group"><legend className="sheet-label">{extra.display}</legend>
      <label className="switch-row"><span>{extra.largeText}</span><input className="switch" type="checkbox" checked={preferences.largeText} disabled={!ready} onChange={event => changeDisplay({ largeText: event.target.checked })} /></label>
      <label className="switch-row"><span>{extra.reducedMotion}</span><input className="switch" type="checkbox" checked={preferences.reducedMotion} disabled={!ready} onChange={event => changeDisplay({ reducedMotion: event.target.checked })} /></label>
    </fieldset>
    {settings}
    <section className="sheet-section sheet-about"><h3 className="sheet-label">{meta ? shell.about : shell.aboutApp}</h3>
      {meta ? <p>{meta}</p> : null}
      <p><strong>{copy.respectTitle}</strong> {copy.respect}</p>
      {trial ? <p>{copy.trial}</p> : null}
    </section>
  </>;
  const languageName = languageChoices.find(choice => choice.code === language)?.name ?? language;

  return <ShellContext.Provider value={{ language, common }}><div className="app-shell" data-large-text={preferences.largeText} data-reduced-motion={preferences.reducedMotion}>
    <title>Learning English in Singapore</title>
    {showPlayer ? null : <AppBar moreLabel={shell.more} moreOpen={moreOpen} onMore={openMore} moreRef={moreButton}
      start={reviewing ? <button className="icon-btn" type="button" aria-label={c13.back} onClick={() => setReviewing(false)}><Icon name="back" /></button> : undefined}
      center={home ? <div className="brand-lockup"><p className="wordmark" lang="en">Learning English in Singapore</p><p className="brand-slogan" lang="zh-Hans">帮你融入新加坡，相信自己可以做到。</p></div>
        : <p className="wordmark wordmark--short" lang="en">Learning English</p>} />}
    <main className="simple-main">
      {!online ? <p className="offline-banner" data-testid="offline-banner" role="alert">{extra.offline}</p> : null}
      {player}
      {checking ? null : account.failed ? <section><h1>{copy.login}</h1><button className="btn btn-primary" type="button" onClick={account.retry}>{journey.retry}</button></section>
        : account.authenticated && account.accountKey ? viewing ? null
        : library.open ? recordsOpen ? <GenerationRecords language={language} onBack={() => setRecordsOpen(false)} />
        : reviewing && queue.today ? <ReviewListen language={language} items={queue.today.items} onDone={() => setReviewing(false)} />
        : <section className="library">
          <h1>{libraryCopy.title}</h1><p className="panel-copy">{libraryCopy.local}</p>
          {dataNotice ? <p className={dataNotice.error ? 'scene-entry-error' : 'scene-save-status'} role={dataNotice.error ? 'alert' : 'status'}>{trustCopy[dataNotice.text]}</p> : null}
          {signOutFailed ? <p className="scene-entry-error" role="alert">{trustCopy.signOutFailed}</p> : null}
          {!library.result || library.result.status === 'loading' ? <p role="status">{libraryCopy.loading}</p> : library.result.status === 'failed'
            ? <><p role="alert">{libraryCopy.error}</p><button className="text-button" type="button" onClick={library.retry}>{libraryCopy.retry}</button></>
            : <>{library.result.unavailable > 0 && <p role="status">{libraryCopy.unavailable(library.result.unavailable)}</p>}
              {(() => {
                const today = queue.today, last = today?.last;
                const scene = last ? library.result.scenes.find(item => item.course.id === last.course.id && item.course.revision === last.course.revision && (item.course.materialsRevision ?? 0) === (last.course.materialsRevision ?? 0)) : undefined;
                return <>
                  {last && scene ? <button className="continue-card" type="button" data-testid="continue-last" onClick={() => library.choose(scene)}>
                    <span className="continue-icon" aria-hidden="true"><Icon name="play" size={22} /></span>
                    <span className="scene-row-text"><span className="continue-label">{c13.continueLast}</span>
                      <span className="continue-description">{scene.description}</span>
                      <span className="scene-row-meta">{placeText(last)}</span></span>
                    <span className="scene-row-go" aria-hidden="true"><Icon name="chevron" size={20} /></span>
                  </button> : null}
                  {today && today.items.length > 0 ? <button className="review-entry" type="button" onClick={() => { setDataNotice(null); setReviewing(true); }}>
                    <span className="review-entry-icon" aria-hidden="true"><Icon name="speaker" size={20} /></span>
                    <span className="review-entry-text">{c13.reviewEntry(today.items.length)}</span>
                    <span className="scene-row-go" aria-hidden="true"><Icon name="chevron" size={18} /></span>
                  </button> : null}
                </>;
              })()}
              {library.result.scenes.length ? <ul className="learning-scenes">{library.result.scenes.map(scene => {
                const key = `${scene.course.id}:${scene.course.revision}:${scene.course.materialsRevision ?? 0}`;
                const words = scene.requirement.content.keywords;
                const meta = [words.learnerRole.trim() || words.partnerRole.trim(), c11.seconds(Math.round(scene.duration))].filter(Boolean).join(' · ');
                return <li key={key} className="scene-card scene-row">
                  <button className="scene-row-main" type="button" aria-label={libraryCopy.learn} aria-describedby={`scene-row-${key}`} onClick={() => library.choose(scene)}>
                    <span className="scene-row-icon" aria-hidden="true"><Icon name="watch" size={22} /></span>
                    <span className="scene-row-text">
                      <span className="scene-description" id={`scene-row-${key}`}>{scene.description}</span>
                      <span className="scene-row-meta" data-testid="scene-row-meta">{meta}</span>
                    </span>
                    <span className="scene-row-go" aria-hidden="true"><Icon name="chevron" size={20} /></span>
                  </button>
                  <button className="icon-btn scene-row-more" type="button" aria-label={c11.rowMore(scene.description)} aria-haspopup="dialog" aria-expanded={rowMenu === key} onClick={() => setRowMenu(key)}><Icon name="more" /></button>
                </li>;
              })}</ul> : library.result.unavailable === 0 ? <p className="library-empty">{libraryCopy.empty}</p> : null}
              {queue.today ? <div className="heard-line"><p data-testid="heard-count" className="heard-count">{c13.heard(queue.today.heard)}</p>
                {queue.today.heard === 0 && queue.today.resetAt !== null ? <p className="heard-reset">{c13.heardReset}</p> : null}</div> : null}</>}
          {(() => {
            const scenes = library.result?.status === 'ready' ? library.result.scenes : [];
            const scene = scenes.find(item => `${item.course.id}:${item.course.revision}:${item.course.materialsRevision ?? 0}` === rowMenu);
            return <Sheet open={!!scene} onClose={() => setRowMenu(null)} title={scene?.description ?? ''} testId="scene-row-sheet" closeLabel={shell.close}>
              {scene ? <SceneDelete language={language} description={scene.description} course={scene.course} onCancel={() => setRowMenu(null)}
                onDeleted={() => { setRowMenu(null); library.drop(scene.course); queue.refresh(); setDataNotice({ text: 'sceneDeleted', error: false }); }}
                onFailed={() => { setRowMenu(null); setDataNotice({ text: 'sceneDeleteFailed', error: true }); }} /> : null}
            </Sheet>;
          })()}
          <ActionBar><button className="btn btn-primary" type="button" onClick={library.close}>{libraryCopy.input}</button></ActionBar>
        </section>
        : generation.target !== null ? (() => {
          const gen = sceneGenerationCopy[language], c14 = c14Copy[language];
          const phase = generation.view?.phase;
          const active = !!generation.view?.task && !generation.error && ['awaiting_budget', 'submitting', 'submission_unknown', 'script_rewriting', 'script_ready', 'audio_ready', 'audio_assembled', 'video_pending'].includes(phase ?? '');
          const stageIndex = generation.error || !phase ? -1 : ({ not_submitted: 0, awaiting_budget: 0, submitting: 0, submission_unknown: 0, script_rewriting: 0, script_ready: 1, audio_ready: 1, audio_assembled: 2, video_pending: 2, video_assembled: 2, simulation: 3, ready: 3 } as Record<string, number>)[phase] ?? -1;
          const tone = generation.error || phase === 'failed' || phase === 'quality_failed' || phase === 'script_rejected' || phase === 'media_unavailable' ? 'alert' : phase === 'ready' || phase === 'simulation' ? 'done' : phase === 'cancelled' || phase === 'stopped' ? 'stopped' : 'busy';
          const icon = tone === 'alert' ? 'alert' : tone === 'done' ? 'check' : tone === 'stopped' ? 'stop' : stageIndex === 1 ? 'voice' : stageIndex === 2 ? 'image' : 'script';
          const primary = phase === 'ready' && !generation.error ? 'watch' : !generation.error && (phase === 'failed' || phase === 'quality_failed' || phase === 'script_rejected' || phase === 'cancelled' || phase === 'stopped') ? 'back' : !active && (generation.error || phase) ? 'retry' : null;
          const retryButton = (className: string) => <button className={className} type="button" disabled={generation.preparing} onClick={generation.retry}>{gen.retry}</button>;
          const backButton = (className: string) => <button className={className} type="button" onClick={() => {
            if (requirements.draft) requirements.change({ ...requirements.draft, page: 'background' });
            generation.back();
          }}>{gen.back}</button>;
          return <section className="scene-form generation-page" data-tone={tone}>
            <div className="generation-icon" data-testid="generation-icon" aria-hidden="true"><Icon name={icon} size={30} /></div>
            <h1>{gen.title}</h1>
            {generation.view ? <p className="generation-description">{generation.view.requirement.content.description}</p> : null}
            {generation.error ? <p className="scene-entry-error" role="alert">{gen[generation.error === 'version' ? 'version' : 'error']}</p>
              : <p className="panel-copy generation-status" role="status" data-testid={phase === 'cancelled' ? 'generation-cancelled' : phase === 'stopped' ? 'generation-stopped' : phase === 'quality_failed' ? 'generation-quality-failed' : undefined}>
                {!generation.view ? gen.loading : phase === 'cancelled' ? extra.cancelled : phase === 'stopped' ? extra.stopped : gen.phases[generation.view.phase]}</p>}
            {!generation.error && phase === 'quality_failed' ? <p className="generation-note">{c14.qualityFailedDetail}</p> : null}
            {!generation.error && phase === 'ready' && generation.view?.quality === 'needs_review' ? <p className="generation-note" data-testid="generation-needs-review">{c14.needsReview}</p> : null}
            {!generation.error && generation.view?.keyframe ? <figure className="partner-look" data-testid="partner-look">
              <img src={`/api/scene-generation/keyframe?revision=${generation.view.requirement.revision}`} alt={c14.partnerLook} width={720} height={1280} />
              <figcaption>{c14.partnerLook}<small>{c14.partnerLookNote}</small></figcaption>
            </figure> : null}
            {stageIndex >= 0 ? <ol className="generation-stages" data-testid="generation-stages" aria-label={c11.stagesLabel}>
              {c11.stages.map((label, index) => <li key={label} data-done={index < stageIndex || undefined} aria-current={index === stageIndex ? 'step' : undefined}><span className="stage-dot" aria-hidden="true" />{label}</li>)}
            </ol> : null}
            {generation.cancelling === 'failed' ? <p className="scene-entry-error" role="alert">{extra.cancelFailed}</p> : null}
            <div className="generation-links">
              {active ? <button className="text-button" type="button" disabled={!online || generation.cancelling === 'busy'} onClick={() => {
                if (generation.view?.task?.providerCalls === 0) void generation.cancel(); else setStopAsk(true);
              }}>{extra.cancel}</button> : null}
              {primary !== 'retry' && primary !== 'watch' ? retryButton('text-button') : null}
              {primary !== 'back' ? backButton('text-button') : null}
            </div>
            <Sheet open={stopAsk && active} onClose={() => setStopAsk(false)} title={extra.cancel} testId="stop-sheet" closeLabel={shell.close}>
              {stopAsk && active ? <div className="sheet-section" data-testid="generation-stop-explain">
                <p>{extra.stopExplain}</p>
                <div className="sheet-actions">
                  <button className="btn btn-danger" type="button" disabled={!online || generation.cancelling === 'busy'} onClick={() => { void generation.cancel(); setStopAsk(false); }}>{extra.stopConfirm}</button>
                  <button className="btn btn-ghost" type="button" onClick={() => setStopAsk(false)}>{extra.keepGoing}</button>
                </div>
              </div> : null}
            </Sheet>
            {primary ? <ActionBar>{primary === 'watch' ? <button className="btn btn-primary" type="button" onClick={generation.watch}>{gen.watch}</button>
              : primary === 'back' ? backButton('btn btn-primary') : retryButton('btn btn-primary')}</ActionBar> : null}
          </section>;
        })()
        : requirements.readFailed ? <section>
          <p className="scene-entry-error" role="alert">{requirementCopy.readError}</p>
          <button className="btn btn-primary" type="button" onClick={requirements.retry}>{requirementCopy.retry}</button>
        </section> : requirements.loading || !requirements.draft ? <p role="status">{requirementCopy.loading}</p>
        : <><SceneDescription key={account.accountKey} language={language} title={journey.scene} hint={journey.hint}
          draft={requirements.draft} onChange={requirements.change} focusMemory={inputFocus} requirements={requirements} generation={generation} />
          {signOutFailed ? <p className="scene-entry-error" role="alert">{trustCopy.signOutFailed}</p> : null}</>
        : <><section role="group" aria-labelledby="login-title">
          <h1 id="login-title">{copy.login}</h1>
          <div className="account-choices">
            <button type="button" onClick={() => setNotice('wechat')}>{copy.wechat}<small>{copy.unavailable}</small></button>
            {embedded ? <button type="button" onClick={() => setNotice('webview')}>Google</button>
              : <a href={`/api/auth/google/start?language=${encodeURIComponent(language)}&returnTo=%2F`}><span className="provider-letter" aria-hidden="true">G</span>Google</a>}
          </div>
        </section>
        <button className="text-button language-link" type="button" aria-haspopup="dialog" aria-expanded={moreOpen} onClick={openMore}><Icon name="globe" size={18} />{shell.changeLanguage(languageName)}</button></>}
      <p className="entry-status" role="status" aria-live="polite">{status}</p>
      {showPlayer ? null : <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={shell.more} testId="more-sheet" closeLabel={shell.close} fallbackFocus={moreButton}>
        {signedIn && !viewing && !library.open && generation.target === null && !requirements.readFailed && !requirements.loading && requirements.draft ? <div className="sheet-rows">
          <button className="sheet-row" type="button" onClick={() => { setMoreOpen(false); library.show(); }}><Icon name="watch" />{libraryCopy.title}</button>
        </div> : null}
        {signedIn && library.open ? <section className="sheet-section" aria-labelledby="data-privacy-title"><h3 className="sheet-label" id="data-privacy-title">{c11.dataPrivacy}</h3>
          <div className="sheet-rows">
            <button className="sheet-row" type="button" onClick={() => { setMoreOpen(false); setRecordsOpen(true); }}><Icon name="script" />{trustCopy.records}</button>
          </div>
          <StoredData language={language} />
          <DeleteAllData language={language}
            onDeleted={() => { setMoreOpen(false); library.drop(null); queue.refresh(); requirements.retry(); setDataNotice({ text: 'allDeleted', error: false }); }}
            onFailed={() => { setMoreOpen(false); setDataNotice({ text: 'allDeleteFailed', error: true }); }} />
        </section> : null}
        {common({ trial: false, settings: signedIn && library.open && queue.today ? <label className="sheet-section sheet-field"><span className="sheet-label"><Icon name="speaker" size={18} />{c13.limitLabel}</span>
          <select aria-label={c13.limitLabel} value={String(queue.today.limit)} onChange={event => void queue.setLimit(Number(event.target.value))}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}</select></label> : null })}
        {signedIn && !viewing && (library.open || (generation.target === null && !requirements.readFailed && !requirements.loading && requirements.draft)) ? <div className="sheet-rows">
          <SignOutButton language={language} row onStart={() => { setSignOutFailed(false); setMoreOpen(false); }} onFailed={() => setSignOutFailed(true)} />
        </div> : null}
      </Sheet>}
    </main>
    {showPlayer ? null : <footer className="simple-footer"><p>{copy.trial}</p></footer>}
  </div></ShellContext.Provider>;
}

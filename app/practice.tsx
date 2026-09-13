'use client';

import { useEffect, useRef, useState } from 'react';
import type { PracticeEvent, PracticeSession } from '../lib/practice';
import type { EntryLanguage } from './entry-copy';
import { entryCopy } from './entry-copy';
import { practiceCopy } from './practice-copy';
import { scenarioCopy } from './scenario-copy';
import { choiceText } from './profile-copy';

type Props = { language: EntryLanguage; session: PracticeSession; error: 'read' | 'save' | null;
  onEvent: (event: PracticeEvent) => void; onBack: () => void; onLanguage: () => void; onEndPlayback: () => void; onWait: () => void };
function Character({ second, active, label }: { second: boolean; active: boolean; label: string }) {
  return <svg role="img" aria-label={label} viewBox="0 0 180 170" className="practice-character" data-active={active}>
    <ellipse cx="90" cy="156" rx="64" ry="8" fill="#dce5df" />
    <path d={second ? 'M51 143 Q48 107 71 101 L107 101 Q132 107 133 143Z' : 'M44 145 Q47 105 69 101 L110 101 Q140 113 138 145Z'} fill={second ? '#ba875d' : '#367361'} />
    <path d="M78 97v15q12 12 24 0V97" fill={second ? '#b98160' : '#d9a980'} />
    <ellipse cx="90" cy="67" rx="32" ry="39" fill={second ? '#c18a66' : '#e0b38c'} />
    <path d={second ? 'M58 60Q45 14 91 21Q128 15 125 58L113 44Q83 49 68 37Z' : 'M58 64Q45 25 72 21Q120 8 124 56L116 45Q85 48 68 40Z'} fill={second ? '#343e3b' : '#41524c'} />
    <path d="M69 58l11-1m21 0 11 1" stroke="#4a4137" strokeWidth="2" strokeLinecap="round" />
    <circle cx="76" cy="65" r="2.4" fill="#342e2b" /><circle cx="105" cy="65" r="2.4" fill="#342e2b" />
    <path d="m90 67-3 11h5" fill="none" stroke="#956b50" strokeWidth="1.5" strokeLinecap="round" />
    {active ? <ellipse data-part="mouth" cx="90" cy="88" rx="6" ry="5" fill="#5d4037" /> : <path data-part="mouth" d="M83 87q7 5 14 0" fill="none" stroke="#654638" strokeWidth="2" strokeLinecap="round" />}
    {active ? <g data-part="gesture"><path d={second ? 'M126 120l22-28' : 'M51 123 28 99'} fill="none" stroke={second ? '#ba875d' : '#367361'} strokeWidth="16" strokeLinecap="round" /><path d={second ? 'm148 92 5-9m-5 9 10-3' : 'm28 99-8-9m8 9-12-3'} stroke={second ? '#c18a66' : '#e0b38c'} strokeWidth="9" strokeLinecap="round" /></g> : <path data-part="gesture" d={second ? 'm124 122-9 22' : 'm56 123 9 21'} stroke={second ? '#c18a66' : '#e0b38c'} strokeWidth="10" strokeLinecap="round" />}
  </svg>;
}
export default function Practice({ language, session: s, error, onEvent, onBack, onLanguage, onEndPlayback, onWait }: Props) {
  const c = practiceCopy(language);
  const heading = useRef<HTMLHeadingElement>(null);
  const [from, setFrom] = useState(s.loop.scope === 'ab' ? s.loop.start : 0), [to, setTo] = useState(s.loop.scope === 'ab' ? s.loop.end : 1);
  useEffect(() => { if (s.loop.scope === 'ab') { setFrom(s.loop.start); setTo(s.loop.end); } }, [s.scenario_version_id, s.loop.scope, s.loop.start, s.loop.end]);
  const inherited = choiceText({ ...s.learning_context, speed: s.preferences.speed }, language);
  useEffect(() => { heading.current?.focus(); }, [language, s.scenario_version_id]);
  const statuses: Record<PracticeSession['phase'], string> = {
    needs_gesture: c.gesture, listening: c.listening, agent_opening: c.opening, awaiting_user: c.awaiting, guided_hint: c.hint1, choice_support: c.hint2,
    thinking: c.thinking, user_speaking: c.speaking, replying: c.replying, resuming: c.resuming, paused: c.paused, disconnected: c.disconnected,
    microphone_denied: c.denied, inaudible: c.inaudible, background: c.background, ended: c.ended,
  };
  const active = s.current_utterance && s.awaiting_since_ms === null;
  const row = s.material.sentences[s.position];
  const setLoop = (scope: PracticeSession['loop']['scope']) => onEvent({ type: 'set-loop', scope, start: scope === 'ab' ? from : s.position, end: to });
  return <div className="practice">
    <header className="guide-heading"><h1 ref={heading} tabIndex={-1}>{c.title}</h1><p className="scenario-demo">{c.demo} · {c.review}</p></header>
    <div className="practice-purpose"><span>{c.version} {s.goal_revision} · {c.goal}</span><p>{s.user_goal}</p></div>
    {error && <p role="status" className="support-history">{error === 'read' ? c.readError : c.saveError}</p>}
    <section className="scene-preferences" aria-label={scenarioCopy(language).prefs}><h2>{scenarioCopy(language).prefs}</h2><p>{inherited.content} · {inherited.speed} · {inherited.support}</p><p>{scenarioCopy(language).ability}</p></section>
    <div className="practice-cast" role="group" aria-label={c.roles}>
      {s.roles.map((role, index) => <figure key={role.id} data-active={!!active && s.current_utterance?.role_id === role.id}>
        <Character second={index === 1} active={!!active && s.current_utterance?.role_id === role.id} label={index === 0 ? c.partner : c.visitor} />
        <figcaption>{index === 0 ? c.partner : s.mode === 'practice' ? c.yours : c.visitor}<small>{active && s.current_utterance?.role_id === role.id ? c.active : c.resting}</small></figcaption>
      </figure>)}
    </div>
    <p role="status" aria-label={c.status} className="practice-status">{statuses[s.phase]}</p>
    <section role="region" aria-label={c.current} className="practice-line"><p>{s.current_utterance?.text ?? row.text}</p></section>
    <p className="scene-note">{c.generic}</p>
    <p className="speaking-unknown">{c.unknown}</p>
    <div className="practice-actions">
      {s.mode === 'listen' && <button type="button" className="guide-primary" onClick={() => onEvent({ type: 'enter-practice' })}>{c.practice}</button>}
      {(s.phase === 'needs_gesture' || (s.mode === 'listen' && !s.current_utterance && s.phase === 'listening')) && <button type="button" className="guide-primary" onClick={() => onEvent({ type: 'allow-playback' })}>{c.start}</button>}
      {s.phase === 'disconnected' ? <button type="button" className="guide-primary" onClick={() => { onEvent({ type: 'environment', connected: true }); onEvent({ type: 'resume' }); }}>{c.retry}</button>
        : ['paused','thinking','background','inaudible','microphone_denied','ended'].includes(s.phase) && <button type="button" className="guide-primary" onClick={() => { onEvent({ type: 'environment', visible: !document.hidden, audible: true, microphone: 'unrequested' }); onEvent({ type: 'resume' }); }}>{c.resume}</button>}
    </div>
    {s.mode === 'practice' && <>
      <div className="question-alternatives"><button type="button" onClick={() => onEvent({ type: 'think' })}>{c.think}</button><button type="button" onClick={() => onEvent({ type: 'manual-help' })}>{c.help}</button></div>
      {s.choices.length > 0 && <><div className="question-alternatives" role="group" aria-label={c.choices}>{s.choices.map(choice => <button type="button" key={choice.id} onClick={() => onEvent({ type: 'choose-meaning', choice_id: choice.id })}>{choice.id === 'ask' ? c.ask : c.again}</button>)}</div><button type="button" className="text-button" onClick={() => onEvent({ type: 'manual-help' })}>{c.other}</button></>}
      <button type="button" className="audio-unavailable" disabled>{c.manual}</button>
      {s.phase === 'user_speaking' && <button type="button" className="guide-primary" onClick={() => onEvent({ type: 'speech-finished' })}>{c.finished}</button>}
      <button type="button" className="text-button" onClick={() => onEvent({ type: 'listen-only' })}>{c.listen}</button>
    </>}
    <div className="question-alternatives"><button type="button" onClick={() => onEvent({ type: 'pause' })}>{c.pause}</button></div>
    {s.mode === 'listen' && <section className="practice-repetition">
      <div className="question-alternatives"><button type="button" onClick={() => onEvent({ type: 'previous' })}>{c.previous}</button>
        {(['sentence','chapter','all'] as const).map(scope => <button type="button" key={scope} aria-pressed={s.loop.scope === scope} onClick={() => setLoop(scope)}>{c[scope]}</button>)}
      </div>
      <div className="practice-selects">{(['from','to'] as const).map(key => <label key={key}>{c[key]}<select value={key === 'from' ? from : to} onChange={event => (key === 'from' ? setFrom : setTo)(Number(event.target.value))}>
        {s.material.sentences.map((sentence, index) => <option value={index} key={sentence.id}>{index + 1}</option>)}
      </select></label>)}</div>
      <button type="button" className="guide-primary" disabled={from > to} onClick={() => setLoop('ab')}>{c.ab}</button>
    </section>}
    <section className="practice-preferences">
      <p role="status" aria-label={c.settings}>{s.preferences.speed === 'slow' ? c.slow : c.natural}</p>
      <div className="question-alternatives"><button type="button" aria-pressed={s.preferences.speed === 'slow'} onClick={() => onEvent({ type: 'set-preferences', speed: 'slow' })}>{c.slow}</button><button type="button" aria-pressed={s.preferences.speed === 'natural'} onClick={() => onEvent({ type: 'set-preferences', speed: 'natural' })}>{c.natural}</button></div>
      <p className="scene-note">{c.speedHint}</p>
      <label className="practice-patience">{c.patience}<select value={s.preferences.wait_ms} onChange={event => onEvent({ type: 'set-preferences', wait_ms: Number(event.target.value) as 6000 | 10000 | 15000 })}><option value="6000">{c.six}</option><option value="10000">{c.ten}</option><option value="15000">{c.fifteen}</option></select></label>
      <label className="setting"><input type="checkbox" checked={s.preferences.auto_hints} onChange={event => onEvent({ type: 'set-preferences', auto_hints: event.target.checked })} />{c.proactive}</label>
    </section>
    <details className="simulation-controls"><summary>{c.controls}</summary><p>{c.controlHint}</p>
      <button type="button" disabled={!s.current_utterance || s.awaiting_since_ms !== null} onClick={onEndPlayback}>{c.endPlayback}</button>
      <button type="button" onClick={onWait}>{c.wait}</button>
      <button type="button" disabled={s.mode !== 'practice'} onClick={() => onEvent({ type: 'speech-start' })}>{c.speech}</button>
      <button type="button" onClick={() => onEvent({ type: 'environment', microphone: 'denied' })}>{c.deny}</button>
      <button type="button" onClick={() => onEvent({ type: 'environment', connected: false })}>{c.disconnect}</button>
    </details>
    <nav className="question-navigation"><button type="button" onClick={onBack}>{c.exit}</button><button type="button" onClick={onLanguage}>{entryCopy[language].change}</button></nav>
  </div>;
}

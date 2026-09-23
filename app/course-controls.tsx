'use client';

import { useEffect, useRef, useState } from 'react';
import { applyFixedLessonEvent, type FixedLessonSession, type FixedLessonEvent } from '../lib/fixed-lesson-practice';
import type { CourseLanguage } from '../lib/synthetic-courses';
import { courseControlsCopy } from './course-controls-copy';

export default function CourseControls({ initial, language, onClose }: { initial: FixedLessonSession; language: CourseLanguage; onClose: () => void }) {
  const [state, setState] = useState(initial);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(initial.material.sentences.length - 1);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const copy = courseControlsCopy[language];
  const sentences = state.material.sentences;
  const row = sentences[state.position];
  const active = state.current_playback;
  const act = (event: FixedLessonEvent) => setState(current => applyFixedLessonEvent(current, event));

  function loop(scope: 'all' | 'chapter' | 'sentence' | 'ab') {
    let start = state.position, end = state.position;
    if (scope === 'all') { start = 0; end = sentences.length - 1; }
    if (scope === 'chapter') {
      start = sentences.findIndex(sentence => sentence.chapter === row.chapter);
      end = sentences.findLastIndex(sentence => sentence.chapter === row.chapter);
    }
    if (scope === 'ab') { start = from; end = to; }
    if (start < 0 || end < start || end >= sentences.length) return;
    act({ type: 'set-loop', scope, start_sentence_id: sentences[start].id, end_sentence_id: sentences[end].id });
  }

  return <section className="practice course-controls" role="region" aria-labelledby="course-controls-title">
    <h2 id="course-controls-title" ref={heading} tabIndex={-1}>{copy.title}</h2>
    <p>{copy.notice}</p>
    <div className="practice-line" aria-live="polite">
      <strong data-testid="current-course-speaker" lang="en">{state.roles.find(role => role.id === row.role_id)?.label}</strong>
      <p data-testid="current-course-sentence" lang="en">{row.text}</p>
    </div>
    <p>{copy.support}</p>
    {state.mode === 'listen' ? <>
      <button type="button" className="guide-primary" onClick={() => act({ type: 'start-listening' })}>{copy.start}</button>
      <div className="question-alternatives">{(['all', 'chapter', 'sentence'] as const).map(scope =>
        <button type="button" key={scope} aria-pressed={state.loop.scope === scope} onClick={() => loop(scope)}>{copy[scope]}</button>)}</div>
      <div className="practice-selects">{(['from', 'to'] as const).map(bound => <label key={bound}>{copy[bound]}
        <select aria-label={copy[bound]} value={bound === 'from' ? from : to} onChange={event => (bound === 'from' ? setFrom : setTo)(Number(event.target.value))}>
          {sentences.map((sentence, index) => <option key={sentence.id} value={index}>{index + 1}</option>)}
        </select>
      </label>)}</div>
      {from > to && <p role="status">{copy.invalid}</p>}
      <button type="button" className="guide-primary" disabled={from > to} aria-pressed={state.loop.scope === 'ab'} onClick={() => loop('ab')}>{copy.ab}</button>
      <button type="button" className="guide-primary" onClick={() => act({ type: 'enter-practice' })}>{copy.practice}</button>
    </> : <>
      <p>{copy.practice}</p>
      <button type="button" className="guide-primary" onClick={() => loop('all')}>{copy.listen}</button>
    </>}
    <button type="button" className="guide-primary" disabled={!active} onClick={() => {
      if (active) act({ type: 'playback-ended', playback_id: active.id, sentence_id: active.sentence_id,
        lesson_revision: active.lesson_revision, lesson_fingerprint: active.lesson_fingerprint });
    }}>{copy.end}</button>
    <button type="button" className="text-button" onClick={onClose}>{copy.close}</button>
  </section>;
}

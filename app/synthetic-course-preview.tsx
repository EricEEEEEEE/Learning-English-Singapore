'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createSyntheticCoursePreview, listSyntheticCourses, type CourseLanguage } from '../lib/synthetic-courses';
import { syntheticCourseCopy } from './synthetic-course-copy';
import CourseControls from './course-controls';
import { courseControlsCopy } from './course-controls-copy';

export default function SyntheticCoursePreview({ language, onBack }: { language: CourseLanguage; onBack: () => void }) {
  const copy = syntheticCourseCopy[language];
  const samples = useMemo(() => listSyntheticCourses(language), [language]);
  const [selected, setSelected] = useState(samples[0].id);
  const [controlsOpen, setControlsOpen] = useState(false);
  const controlsButton = useRef<HTMLButtonElement>(null);
  const sample = samples.find(item => item.id === selected) ?? samples[0];
  const state = useMemo(() => createSyntheticCoursePreview(sample.id, language), [sample.id, language]);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);

  return <section className="synthetic-course" data-testid="synthetic-course-preview" aria-labelledby="synthetic-course-title">
    <h1 id="synthetic-course-title" ref={heading} tabIndex={-1}>{copy.entry}</h1>
    <div className="scene-preferences">{copy.notices.map(notice => <p key={notice}>{notice}</p>)}</div>
    <label className="synthetic-course-choice">{copy.choose}
      <select aria-label={copy.choose} value={sample.id} onChange={event => setSelected(event.target.value)} onKeyDown={event => {
        if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
        event.preventDefault();
        const index = samples.findIndex(item => item.id === sample.id);
        const next = Math.max(0, Math.min(samples.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
        setSelected(samples[next].id);
      }}>{samples.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
    </label>
    <button type="button" ref={controlsButton} className="guide-primary" aria-expanded={controlsOpen}
      onClick={() => setControlsOpen(true)}>{courseControlsCopy[language].open}</button>
    {controlsOpen && <CourseControls key={state.lesson_revision} initial={state} language={language}
      onClose={() => { setControlsOpen(false); controlsButton.current?.focus(); }} />}
    <h2>{copy.purpose}</h2><p data-testid="course-goal" lang="en">{state.user_goal}</p>
    <h2>{copy.roles}</h2>
    <ul>{state.roles.map(role => <li key={role.id} lang="en" data-testid="course-role" data-role-id={role.id}>{role.label}</li>)}</ul>
    <h2>{copy.lines}</h2>
    <ol className="synthetic-course-lines">{state.material.sentences.map(line => {
      const support = sample.lesson.sentences.find(sentence => sentence.id === line.id)?.support;
      return <li key={line.id} data-testid="course-line" data-role-id={line.role_id}>
        <strong data-testid="course-speaker">{state.roles.find(role => role.id === line.role_id)?.label}</strong>
        <p lang="en">{line.text}</p>
        {support && <p className="scene-note" data-testid="course-support" lang={support.language}>{support.text}</p>}
      </li>;
    })}</ol>
    <button type="button" className="guide-primary" onClick={onBack}>{copy.back}</button>
  </section>;
}

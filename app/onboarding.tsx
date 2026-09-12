'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { canStartOptional, getCurrentQuestion, type OnboardingEvent, type OnboardingSession } from '../lib/onboarding';
import { entryCopy, type EntryLanguage } from './entry-copy';
import { guideCopy, optionText, questionText, withNumber } from './guide-copy';
import { ChoiceIcon, GuideIcon } from './guide-icons';

type Props = {
  language: EntryLanguage;
  session: OnboardingSession;
  onEvent: (event: OnboardingEvent) => void;
  onLanguage: () => void;
  onLeave: () => void;
  profilePanel: ReactNode;
};

export default function Onboarding({ language, session, onEvent, onLanguage, onLeave, profilePanel }: Props) {
  const copy = guideCopy(language);
  const entry = entryCopy[language];
  const question = getCurrentQuestion(session);
  const record = question ? session.records[question.id] : undefined;
  const [helpOpen, setHelpOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    setHelpOpen(false);
    heading.current?.focus();
  }, [question?.id, session.status, language]);

  function simulate(kind: 'prompt' | 'answer', outcome: 'ended' | 'failed') {
    if (question) onEvent({ type: 'playback', questionId: question.id, kind, outcome, source: 'simulation' });
  }

  return (
    <section className="guide-content" aria-labelledby="guide-title">
      <div className="guide-heading">
        <h1 id="guide-title">{copy.title}</h1>
        <p>{copy.intro}</p>
        <button type="button" className="text-button" onClick={onLanguage}>{entry.change}<GuideIcon name="next" /></button>
      </div>
      <button type="button" className="audio-unavailable guide-instructions" disabled><GuideIcon name="sound" /><span>{copy.instructions}<small>{entry.unavailable}</small></span></button>

      {session.status === 'paused' ? (
        <div className="guide-result">
          <h2 ref={heading} tabIndex={-1}>{copy.paused}</h2>
          <p>{copy.pauseCopy}</p>
          <button type="button" className="guide-primary" onClick={() => onEvent({ type: 'resume' })}><GuideIcon name="next" />{copy.resume}</button>
          <button type="button" className="text-button" onClick={() => onEvent({ type: 'finish' })}><GuideIcon name="finish" />{copy.finish}</button>
        </div>
      ) : session.status === 'completed' ? (
        <div className="guide-result">
          <h2 ref={heading} tabIndex={-1}>{copy.summary}</h2>
          <p>{copy.starter}</p>
          <p>{copy.unknownResult}</p>
          {profilePanel}
          {canStartOptional(session) && <button type="button" className="guide-primary" onClick={() => onEvent({ type: 'start-optional' })}><GuideIcon name="next" />{copy.optional}</button>}
          <button type="button" className="text-button" onClick={onLeave}><GuideIcon name="back" />{copy.leave}</button>
        </div>
      ) : question && (
        <article className="question" aria-label={copy.article} key={question.id}>
          <div className="question-meta"><span>{withNumber(session.phase === 'core' ? copy.progress : copy.optionalProgress, session.cursor + 1)}</span><span>{question.kind === 'preference' ? copy.preference : copy.listening}</span></div>
          <h2 ref={heading} tabIndex={-1}>{questionText(question.key, language)}</h2>
          {question.kind === 'listening' && <>
            <p className="audio-note">{copy.audioNotice}</p>
            <button type="button" className="audio-unavailable" disabled><GuideIcon name="sound" /><span>{copy.audioQuestion}<small>{entry.unavailable}</small></span></button>
          </>}
          <div className="question-options" role="group" aria-label={copy.answerChoices}>
            {question.options.map(option => <button type="button" key={option.id} aria-pressed={record?.latestChoiceId === option.id} onClick={() => onEvent({ type: 'answer', questionId: question.id, choiceId: option.id, response: 'choice' })}>
              <ChoiceIcon name={option.icon} /><span>{optionText(option.id, language)}</span>
            </button>)}
          </div>
          <div className="question-alternatives">
            <button type="button" onClick={() => onEvent({ type: 'answer', questionId: question.id, choiceId: null, response: 'unknown' })}><GuideIcon name="help" />{copy.unknown}</button>
            <button type="button" onClick={() => onEvent({ type: 'answer', questionId: question.id, choiceId: null, response: 'skipped' })}><GuideIcon name="skip" />{copy.skip}</button>
          </div>
          {question.kind === 'listening' && <>
            <button type="button" className="text-button" aria-controls="question-help" aria-expanded={helpOpen} onClick={() => setHelpOpen(!helpOpen)}><GuideIcon name="help" />{copy.help}</button>
            <section id="question-help" className="help-panel" role="region" aria-labelledby="question-help-title" hidden={!helpOpen}>
              <h3 id="question-help-title">{copy.helpTitle}</h3><p>{copy.helpCopy}</p>
              <button type="button" className="audio-unavailable" disabled><GuideIcon name="sound" /><span>{copy.meaning}<small>{entry.unavailable}</small></span></button>
            </section>
            <details className="simulation-controls">
              <summary>{copy.simulationControls}</summary><p>{copy.simulationCopy}</p>
              <button type="button" onClick={() => simulate('prompt', 'ended')}>{copy.promptEnded}</button>
              <button type="button" onClick={() => simulate('answer', 'ended')}>{copy.answerEnded}</button>
              <button type="button" onClick={() => simulate('prompt', 'failed')}>{copy.playbackFailed}</button>
            </details>
            {record && <div className="support-history">
              <p>{withNumber(copy.replayCount, record.replayCount)}</p>
              {record.answerExposed && <p>{copy.answerShown}</p>}
              {record.deviceFailure && <p>{copy.deviceFailed}</p>}
              <small>{copy.historyHint}</small>
            </div>}
          </>}
        </article>
      )}
      {session.status === 'active' && <nav className="question-navigation" aria-label={copy.title}>
        <button type="button" disabled={session.cursor === 0} onClick={() => onEvent({ type: 'back' })}><GuideIcon name="back" />{copy.back}</button>
        <button type="button" onClick={() => onEvent({ type: 'pause' })}><GuideIcon name="pause" />{copy.pause}</button>
        <button type="button" onClick={() => onEvent({ type: 'finish' })}><GuideIcon name="finish" />{copy.finish}</button>
      </nav>}
      <p className="guide-respect">{copy.respect}</p>
    </section>
  );
}

'use client';

import { useEffect, useRef } from 'react';
import { activeScenarioVersion, preparationParts, type ScenarioEvent, type ScenarioField, type ScenarioSession } from '../lib/scenario';
import { focusText, planContent, unknownFact } from '../lib/scenario-content';
import type { EntryLanguage } from './entry-copy';
import { entryCopy } from './entry-copy';
import { scenarioCopy } from './scenario-copy';
import { choiceText } from './profile-copy';
import { GuideIcon } from './guide-icons';

type Props = { language: EntryLanguage; session: ScenarioSession; error: 'read' | 'save' | null;
  onEvent: (event: ScenarioEvent) => void; onLanguage: () => void; onBack: () => void };
const fields: ScenarioField[] = ['who', 'where', 'goal', 'worry'];

export default function Scenario({ language, session, error, onEvent, onLanguage, onBack }: Props) {
  const copy = scenarioCopy(language);
  const { editing, text } = session.form;
  const heading = useRef<HTMLHeadingElement>(null);
  const version = activeScenarioVersion(session);
  const { stage, draft } = session;
  const showingVersion = ['preparing', 'partial', 'ready', 'cancelled'].includes(stage) && version;
  const title = stage === 'clarifying' ? copy.clarifyTitle : stage === 'describing' ? copy.description : stage === 'confirming' ? copy.card : showingVersion ? copy[version.status] : copy.title;
  const currentPart = version && preparationParts.find(part => version.preparation[part] !== 'ready');
  const choice = version ? choiceText(version.learning_context, language) : null;
  const displayedPlan = version ? planContent(version.user_goal, version.draft.candidate_id, language) : null;
  useEffect(() => { heading.current?.focus(); }, [stage, session.active_version_id]);

  function edit(field: ScenarioField) {
    onEvent({ type: 'begin-edit', field });
  }
  const editLabels = { who: copy.editWho, where: copy.editWhere, goal: copy.editGoal, worry: copy.editWorry };
  return <div className="scenario">
    <header className="guide-heading">
      <h1 ref={heading} tabIndex={-1}>{title}</h1>
      <p className="scenario-demo">{copy.demo}</p>
      <p>{copy.demoHint}</p>
    </header>
    {error && <p role="status" className="support-history">{error === 'read' ? copy.readError : copy.saveError}</p>}

    {stage === 'choosing' && <section className="scene-starts">
      <p>{copy.intro}</p>
      <div role="group" aria-label={copy.starts} className="scene-options">
        {(['school','work','daily'] as const).map((kind, index) => <button type="button" key={kind} onClick={() => onEvent({ type: 'choose-start', kind, language })}>
          <span aria-hidden="true" className="scene-number">0{index + 1}</span>{copy[kind]}<span aria-hidden="true">→</span>
        </button>)}
      </div>
      <button className="guide-primary" type="button" onClick={() => onEvent({ type: 'choose-start', kind: 'custom', language })}><GuideIcon name="next" />{copy.custom}</button>
    </section>}

    {(stage === 'describing' || stage === 'clarifying') && <form className="scene-form" onSubmit={event => {
      event.preventDefault(); onEvent(stage === 'describing' ? { type: 'describe', text } : { type: 'clarify', value: text });
    }}>
      <p>{stage === 'describing' ? copy.describeHint : copy.clarifyHint}</p>
      <label htmlFor="scene-description">{stage === 'describing' ? copy.description : copy.goal}</label>
      <textarea id="scene-description" value={text} onChange={event => onEvent({ type: 'input', value: event.target.value })} rows={4} />
      <p className="scene-privacy">{copy.privacy}</p>
      <button type="button" className="audio-unavailable" disabled><GuideIcon name="help" />{copy.voice}</button>
      <button type="submit" className="guide-primary">{stage === 'describing' ? copy.submit : copy.continue}</button>
    </form>}

    {stage === 'confirming' && <>
      <section className="scene-card" role="region" aria-label={copy.card}>
        <p className="scene-source">{draft.grounding_status === 'user-provided' ? copy.userProvided : copy.seed}</p>
        <dl>{fields.map(field => <div key={field}><dt>{copy[field]}</dt>{' '}<dd>{draft[field] || copy.unknown}</dd>
          {!editing && <button type="button" className="text-button" onClick={() => edit(field)}>{editLabels[field]}</button>}
        </div>)}</dl>
        <p className="scene-unknown">{unknownFact(language)}</p>
        {!!draft.source_refs.length && <p className="scene-source">{draft.source_refs.join(' · ')}</p>}
      </section>
      {editing ? <form className="scene-form" onSubmit={event => { event.preventDefault(); onEvent({ type: 'edit-field', field: editing, value: text }); }}>
        <label htmlFor="scene-edit">{copy[editing]}</label>
        <textarea id="scene-edit" value={text} onChange={event => onEvent({ type: 'input', value: event.target.value })} rows={3} autoFocus />
        <button type="submit" className="guide-primary">{copy.save}</button>
        <button type="button" className="text-button" onClick={() => onEvent({ type: 'cancel-edit' })}>{copy.discard}</button>
      </form> : <>
        <fieldset className="scene-candidates"><legend>{copy.candidates}</legend><p>{copy.candidateHint}</p>
          {draft.candidates.map(candidate => <button type="button" key={candidate.id} aria-pressed={candidate.id === draft.candidate_id}
            onClick={() => onEvent({ type: 'choose-candidate', candidate_id: candidate.id })}>{focusText(candidate.id, language)}</button>)}
        </fieldset>
        <button type="button" className="guide-primary" onClick={() => onEvent({ type: 'confirm' })}><GuideIcon name="next" />{copy.confirm}</button>
      </>}
    </>}

    {showingVersion && <>
      <div className="scene-version"><p>{copy.version.replace('{n}', String(version.goal_revision))}</p><p className="scene-goal">{version.user_goal}</p><p>{copy.noMedia}</p></div>
      <section className="scene-preferences" aria-label={copy.prefs}><h2>{copy.prefs}</h2><p>{choice?.content} · {choice?.speed} · {choice?.support}</p><p>{copy.ability}</p></section>
      <ol className="scene-progress" aria-label={copy.preparing}>{preparationParts.map((part, index) => <li key={part} data-status={version.preparation[part]}>
        <span aria-hidden="true">{index + 1}</span><div>{copy[part]}<small>{copy[version.preparation[part] === 'ready' ? 'done' : version.preparation[part] === 'failed' ? 'failed' : 'pending']}</small></div>
      </li>)}</ol>
      {version.preparation.media === 'failed' && <p role="status" className="support-history">{copy.mediaFailed}</p>}
      {stage === 'partial' && <button type="button" className="guide-primary" onClick={() => onEvent({ type: 'retry-failed' })}>{copy.retry}</button>}
      {(stage === 'preparing' || stage === 'partial') && <button type="button" className="text-button" onClick={() => onEvent({ type: 'cancel' })}>{copy.cancel}</button>}
      {stage === 'preparing' && <details className="simulation-controls"><summary>{copy.controls}</summary><p>{copy.controlHint}</p>
        {preparationParts.map(part => <div key={part}>{(['ready','failed'] as const).map(outcome => <button type="button" key={outcome} disabled={currentPart !== part} onClick={() => onEvent({ type: 'demo-step', version_id: version.id, request_id: version.request_id, part, outcome })}>
          {part === 'dialogue' ? copy[outcome === 'ready' ? 'dialogueReady' : 'dialogueFailed'] : part === 'media' ? copy[outcome === 'ready' ? 'mediaReady' : 'mediaFailureControl'] : copy[outcome === 'ready' ? 'checkReady' : 'checkFailed']}
        </button>)}</div>)}
      </details>}
      {version.preparation.dialogue === 'ready' && <div className="scene-preview">
        <section aria-label={copy.steps}><h2>{copy.steps}</h2><ol>{displayedPlan?.steps.map((step, index) => <li key={index}>{step}</li>)}</ol></section>
        <section aria-label={copy.prompts}><h2>{copy.prompts}</h2><ul>{displayedPlan?.practice_prompts.map((prompt, index) => <li key={index}>{prompt}</li>)}</ul></section>
      </div>}
      <button type="button" className="guide-primary" onClick={() => edit('goal')}>{copy.editGoal}</button>
      <p className="scene-note">{copy.unchanged}</p>
    </>}

    {!!session.versions.length && <nav className="scene-history" aria-label={copy.history}>
      <h2>{copy.history}</h2>{session.versions.map(item => <button type="button" key={item.id} aria-current={showingVersion && item.id === version.id ? 'true' : undefined}
        onClick={() => onEvent({ type: 'view-version', version_id: item.id })}>{copy.view.replace('{n}', String(item.goal_revision))}</button>)}
    </nav>}
    <nav className="question-navigation">
      {stage !== 'choosing' && <button type="button" onClick={() => onEvent({ type: 'choose-another' })}>{copy.newGoal}</button>}
      <button type="button" onClick={onBack}><GuideIcon name="back" />{copy.back}</button>
      <button type="button" onClick={onLanguage}>{entryCopy[language].change}</button>
    </nav>
  </div>;
}

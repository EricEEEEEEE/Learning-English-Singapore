'use client';

import type { EntryLanguage } from './entry-copy';
import type { LearningProfile, StudyAction, StudySettings } from '../lib/placement';
import { profileCopy, bandText, choiceText } from './profile-copy';
import { guideCopy } from './guide-copy';
import { GuideIcon } from './guide-icons';

type Props = { language: EntryLanguage; profile: LearningProfile; settings: StudySettings;
  error: 'read' | 'save' | null; onAction: (action: StudyAction) => void };

export default function LearningProfilePanel({ language, profile, settings, error, onAction }: Props) {
  const copy = profileCopy(language);
  const choice = choiceText(settings.chosen, language);
  return <section className="learning-profile" aria-labelledby="learning-profile-title">
    <h2 id="learning-profile-title">{copy.region}</h2>
    <div className="profile-observation">
      <h3>{copy.listening}</h3>
      <p className="profile-answer">{profile.listening_band === null ? copy.unknown : bandText(profile.listening_band, language)}</p>
      {profile.placement_status === 'provisional' && <p>{copy.provisional}</p>}
      <p className="profile-evidence">{copy.evidence.replace('{n}', String(profile.evidence.success_question_ids.length))}</p>
      <p className="profile-evidence">{copy.demo}</p>
    </div>
    <p className="speaking-unknown">{guideCopy(language).speaking}</p>
    <div className="profile-recommendation"><h3>{copy.recommendation}</h3><p>{bandText(settings.recommended.content_band, language)}</p></div>
    <div className="profile-settings" role="status" aria-live="polite" aria-label={copy.settings}>
      <h3>{copy.settings}</h3>{' '}
      <dl><div><dt>{copy.content}</dt>{' '}<dd>{choice.content}</dd></div>{' '}
        <div><dt>{copy.speedLabel}</dt>{' '}<dd>{choice.speed}</dd></div>{' '}
        <div><dt>{copy.supportLabel}</dt>{' '}<dd>{choice.support}</dd></div></dl>
    </div>
    <p className="profile-hint">{copy.choiceHint}</p>
    <div className="profile-controls">
      <div role="group" aria-label={copy.contentGroup}>
        <button type="button" onClick={() => onAction('simpler')}><GuideIcon name="back" />{copy.simpler}</button>
        <button type="button" onClick={() => onAction('more-natural')}><GuideIcon name="next" />{copy.natural}</button>
      </div>
      <div role="group" aria-label={copy.speedGroup}>
        <button type="button" aria-pressed={settings.chosen.speed === 'slow'} onClick={() => onAction('slower')}>{copy.slower}</button>
        <button type="button" aria-pressed={settings.chosen.speed === 'natural'} onClick={() => onAction('natural-speed')}>{copy.speed}</button>
      </div>
      <div role="group" aria-label={copy.helpGroup}>
        <button type="button" aria-pressed={settings.chosen.support === 'minimal'} onClick={() => onAction('fewer-hints')}><GuideIcon name="help" />{copy.fewer}</button>
        <button type="button" onClick={() => onAction('restore')}>{copy.restore}</button>
      </div>
    </div>
    <div className="profile-feedback">
      <button type="button" className="text-button" aria-pressed={settings.feedback_flagged} onClick={() => onAction('flag-feedback')}>{copy.feedback}</button>
      {settings.feedback_flagged && <div role="status"><p>{copy.flagged}</p><p>{copy.feedbackHint}</p></div>}
    </div>
    {error && <p role="status" className="profile-storage-notice">{error === 'read' ? copy.readError : copy.saveError}</p>}
  </section>;
}

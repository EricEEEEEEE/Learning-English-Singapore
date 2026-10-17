'use client';

import { useEffect, useId, useState } from 'react';
import type { EntryLanguage } from './entry-copy';
import { dataTrustCopy, usd, day } from './data-trust-copy';
import { requestLearningJson } from './learning-request';
import type { GenerationRecord, DeletionEvent } from '../lib/my-data';
import type { SentenceReportStatus, SameSentencePlace } from '../lib/sentence-reports';
import { auditGapsCopy } from './audit-gaps-copy';

const marker = 'le-sg-account-mode-v1';
type Pointer = { id: string; revision: number; materialsRevision?: number };

// Same-origin private write with a 5 second deadline. Only a 2xx answer counts as done.
async function send(url: string, method: 'POST' | 'DELETE', body?: object) {
  const controller = new AbortController(), deadline = window.setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, { method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    if (response.status === 401) window.dispatchEvent(new Event('le-sg-auth-invalid'));
    if (!response.ok) throw new Error('Request failed');
    return await response.json();
  } finally { window.clearTimeout(deadline); }
}

export function SignOutButton({ language }: { language: EntryLanguage }) {
  const copy = dataTrustCopy[language];
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  return <div className="data-action">
    <button className="text-button" type="button" disabled={state === 'busy'} onClick={async () => {
      setState('busy');
      try {
        await send('/api/auth/signout', 'POST');
        try { localStorage.removeItem(marker); } catch { /* The session check below is what matters. */ }
        setState('idle');
        window.dispatchEvent(new Event('le-sg-auth-invalid'));
      } catch { setState('failed'); }
    }}>{state === 'busy' ? copy.signingOut : copy.signOut}</button>
    {state === 'failed' ? <p className="scene-entry-error" role="alert">{copy.signOutFailed}</p> : null}
  </div>;
}

export function SceneDelete({ language, description, course, onDeleted, onFailed }: { language: EntryLanguage; description: string; course: Pointer; onDeleted: () => void; onFailed: () => void }) {
  const copy = dataTrustCopy[language];
  const [step, setStep] = useState<'idle' | 'confirm' | 'busy'>('idle');
  if (step === 'idle') return <button className="text-button danger-text" type="button" aria-label={copy.deleteScene(description)} onClick={() => setStep('confirm')}>{copy.deleteShort}</button>;
  return <div className="data-confirm">
    <p>{copy.sceneConfirm}</p>
    <div className="data-confirm-actions">
      <button className="danger-button" type="button" disabled={step === 'busy'} onClick={async () => {
        setStep('busy');
        try { await send(`/api/learning-library?id=${encodeURIComponent(course.id)}&revision=${course.revision}`, 'DELETE'); onDeleted(); }
        catch { setStep('idle'); onFailed(); }
      }}>{step === 'busy' ? copy.deleting : copy.confirmDelete}</button>
      <button className="text-button" type="button" disabled={step === 'busy'} onClick={() => setStep('idle')}>{copy.cancel}</button>
    </div>
  </div>;
}

export function DeleteAllData({ language, onDeleted, onFailed }: { language: EntryLanguage; onDeleted: () => void; onFailed: () => void }) {
  const copy = dataTrustCopy[language];
  const [step, setStep] = useState<'idle' | 'confirm' | 'busy'>('idle');
  if (step === 'idle') return <button className="text-button danger-text" type="button" onClick={() => setStep('confirm')}>{copy.deleteAll}</button>;
  return <div className="data-confirm">
    <p>{copy.allConfirm}</p>
    <div className="data-confirm-actions">
      <button className="danger-button" type="button" disabled={step === 'busy'} onClick={async () => {
        setStep('busy');
        try { await send('/api/my-data', 'DELETE', { confirm: 'delete-all-my-data' }); setStep('idle'); onDeleted(); }
        catch { setStep('idle'); onFailed(); }
      }}>{step === 'busy' ? copy.deleting : copy.confirmAll}</button>
      <button className="text-button" type="button" disabled={step === 'busy'} onClick={() => setStep('idle')}>{copy.cancel}</button>
    </div>
  </div>;
}

export function StoredData({ language }: { language: EntryLanguage }) {
  const copy = dataTrustCopy[language];
  return <details className="data-explain">
    <summary>{copy.storedTitle}</summary>
    <ul>{copy.stored.map(item => <li key={item}>{item}</li>)}</ul>
    <p>{copy.notStored}</p>
    <p>{copy.account}</p>
  </details>;
}

type Records = { tasks: GenerationRecord[]; deletions: DeletionEvent[] };
const statuses = ['ready', 'failed', 'unknown', 'in_progress', 'simulation', 'deleted', 'cancelled', 'stopped'];
function parseRecords(value: unknown): Records {
  const data = value as Records;
  if (!data || !Array.isArray(data.tasks) || !Array.isArray(data.deletions)) throw new Error('Invalid records');
  for (const task of data.tasks) if (!task || typeof task.id !== 'string' || !statuses.includes(task.status) || !Number.isSafeInteger(task.reservedMicros) || task.reservedMicros < 0
    || (task.description !== null && typeof task.description !== 'string')) throw new Error('Invalid records');
  for (const event of data.deletions) if (!event || !['scene', 'all'].includes(event.kind) || !Number.isFinite(event.at)) throw new Error('Invalid records');
  return data;
}

export function GenerationRecords({ language, onBack }: { language: EntryLanguage; onBack: () => void }) {
  const copy = dataTrustCopy[language];
  const [result, setResult] = useState<Records | 'loading' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; const controller = new AbortController();
    setResult('loading');
    requestLearningJson('/api/generation-records', controller).then(data => { if (active) setResult(parseRecords(data)); }).catch(() => { if (active) setResult('failed'); });
    return () => { active = false; controller.abort(); };
  }, [attempt]);
  return <section data-testid="generation-records">
    <h1>{copy.records}</h1>
    <p className="panel-copy">{copy.recordsNote}</p>
    {result === 'loading' ? <p role="status">{copy.recordsLoading}</p>
      : result === 'failed' ? <><p className="scene-entry-error" role="alert">{copy.recordsError}</p><button className="text-button" type="button" onClick={() => setAttempt(value => value + 1)}>{copy.recordsRetry}</button></>
      : <>
        {result.tasks.length ? <ul className="generation-records">{result.tasks.map(task => <li key={task.id} data-testid="generation-record" className="scene-card">
          <p className="scene-description">{task.description ?? copy.deletedScene}</p>
          <p><strong>{copy.status[task.status]}</strong>{task.status === 'deleted' && task.deletedAt !== undefined ? ` · ${copy.deletedOn(day(task.deletedAt))}` : ''}</p>
          <p>{copy.reserved(usd(task.reservedMicros))}</p>
        </li>)}</ul> : <p>{copy.recordsEmpty}</p>}
        {result.deletions.length ? <ul className="deletion-events">{result.deletions.map((event, index) => <li key={index} data-testid="deletion-event">{`${copy.deletion[event.kind]} · ${day(event.at)}`}</li>)}</ul> : null}
      </>}
    <button className="text-button" type="button" onClick={onBack}>{copy.recordsBack}</button>
  </section>;
}

// Learner reports about sentences of one exact course version; reporting never touches the course itself.
// C9-5: each report carries how it is being handled, and where else the same English sentence appears.
const reportStatuses: SentenceReportStatus[] = ['received', 'processing', 'disabled', 'corrected'];
type ReportState = { key: string; lines: Map<string, SentenceReportStatus>; elsewhere: Record<string, SameSentencePlace[]> };
function parsePlaces(value: unknown): Record<string, SameSentencePlace[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const places: Record<string, SameSentencePlace[]> = {};
  for (const [lineId, list] of Object.entries(value)) if (Array.isArray(list)) places[lineId] = list.filter(item => item && typeof item.id === 'string' && Number.isSafeInteger(item.revision) && typeof item.description === 'string' && item.description.trim());
  return places;
}
export function useSentenceReports(course: Pointer | null) {
  const key = course ? `${course.id}:${course.revision}:${course.materialsRevision ?? 0}` : null;
  const [state, setState] = useState<ReportState | null>(null);
  useEffect(() => {
    if (!key || !course) return;
    let active = true; const controller = new AbortController();
    const query = `id=${encodeURIComponent(course.id)}&revision=${course.revision}${course.materialsRevision === undefined ? '' : `&materialsRevision=${course.materialsRevision}`}`;
    requestLearningJson(`/api/sentence-reports?${query}`, controller).then(data => {
      const listed: [string, SentenceReportStatus][] = Array.isArray(data?.reports) ? data.reports.filter((item: { lineId?: unknown }) => typeof item?.lineId === 'string')
        .map((item: { lineId: string; status?: unknown }) => [item.lineId, reportStatuses.includes(item.status as SentenceReportStatus) ? item.status as SentenceReportStatus : 'received']) : [];
      if (active) setState(previous => ({ key, lines: new Map([...(previous?.key === key ? previous.lines : []), ...listed]), elsewhere: parsePlaces(data?.elsewhere) }));
    }).catch(() => { /* Unknown report state shows nothing rather than a false status. */ });
    return () => { active = false; controller.abort(); };
  }, [key]);
  const current = state?.key === key ? state : null;
  return {
    has: (lineId: string) => !!current?.lines.has(lineId),
    statusOf: (lineId: string) => current?.lines.get(lineId) ?? null,
    elsewhere: (lineId: string) => current?.elsewhere[lineId] ?? [],
    mark: (lineId: string) => { if (key) setState(previous => ({ key, lines: new Map([...(previous?.key === key ? previous.lines : []), [lineId, previous?.key === key ? previous.lines.get(lineId) ?? 'received' : 'received']]), elsewhere: previous?.key === key ? previous.elsewhere : {} })); },
  };
}

export function SentenceReport({ language, course, lineId, text, received, status = 'received', onReceived }: { language: EntryLanguage; course: Pointer; lineId: string; text: string; received: boolean; status?: SentenceReportStatus | null; onReceived: (lineId: string) => void }) {
  const copy = dataTrustCopy[language].report, gaps = auditGapsCopy[language];
  const id = useId();
  const [open, setOpen] = useState(false), [reason, setReason] = useState(''), [note, setNote] = useState('');
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  if (received) return <p className="report-status" data-testid="sentence-report-status" role="status">{status === 'processing' ? gaps.reportProcessing : status === 'disabled' ? gaps.reportDisabled : status === 'corrected' ? gaps.reportCorrected : copy.received}</p>;
  if (!open) return <button className="text-button" type="button" aria-label={copy.open(text)} onClick={() => setOpen(true)}>{copy.short}</button>;
  return <form className="report-form" onSubmit={async event => {
    event.preventDefault(); if (!reason) return;
    setBusy(true); setFailed(false);
    try {
      const pointer = { id: course.id, revision: course.revision, ...(course.materialsRevision === undefined ? {} : { materialsRevision: course.materialsRevision }) };
      await send('/api/sentence-reports', 'POST', { course: pointer, lineId, reason, note: note.trim() });
      onReceived(lineId);
    } catch { setFailed(true); } finally { setBusy(false); }
  }}>
    <div role="radiogroup" aria-labelledby={`${id}-reasons`}>
      <p id={`${id}-reasons`}>{copy.reasons}</p>
      {(['unclear', 'not_local', 'wrong_meaning'] as const).map(value => <label key={value}>
        <input type="radio" name={`${id}-reason`} value={value} checked={reason === value} onChange={() => setReason(value)} /> {copy[value]}
      </label>)}
    </div>
    <label htmlFor={`${id}-note`}>{copy.note}</label>
    <input id={`${id}-note`} type="text" maxLength={200} value={note} onChange={event => setNote(event.target.value)} />
    <p className="scene-note">{copy.unchanged}</p>
    {failed ? <p className="scene-entry-error" role="alert">{copy.failed}</p> : null}
    <div className="data-confirm-actions">
      <button className="guide-primary" type="submit" disabled={!reason || busy}>{copy.submit}</button>
      <button className="text-button" type="button" disabled={busy} onClick={() => { setOpen(false); setFailed(false); }}>{copy.cancel}</button>
    </div>
  </form>;
}

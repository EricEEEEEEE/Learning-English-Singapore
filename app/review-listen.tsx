'use client';

import { useEffect, useRef, useState } from 'react';
import type { EntryLanguage } from './entry-copy';
import { c13Copy } from './c13-copy';
import { ActionBar, Icon } from './shell';
import { listenToolsCopy } from './listen-tools-copy';

// C13-1: "listen to these again today". Each sentence first plays its own slice of the course's original video
// (the subtitle times), then the learner says how it went: not understood / understood after help / understood.
// Nothing here scores, counts overdue items or calls a model; a rating that was not saved is asked for again.
export type ReviewPointer = { id: string; revision: number; materialsRevision?: number };
export type ReviewItem = { course: ReviewPointer; lineId: string; text: string; translations: Partial<Record<EntryLanguage, string>>; start: number; end: number; plainAlternative?: string };
export type ReviewToday = { items: ReviewItem[]; limit: number; heard: number; resetAt: number | null; last: { course: ReviewPointer; page: string; index: number | null } | null };

const pointerOf = (course: ReviewPointer): ReviewPointer => ({ id: course.id, revision: course.revision, ...(course.materialsRevision === undefined ? {} : { materialsRevision: course.materialsRevision }) });

export async function postReview(body: object) {
  const controller = new AbortController(), deadline = window.setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch('/api/review-queue', { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (response.status === 401) window.dispatchEvent(new Event('le-sg-auth-invalid'));
    if (!response.ok) throw new Error('Review request failed');
    return await response.json();
  } finally { window.clearTimeout(deadline); }
}

export function parseReviewToday(value: unknown): ReviewToday {
  const data = value as ReviewToday;
  const pointer = (course: ReviewPointer) => !!course && typeof course.id === 'string' && Number.isSafeInteger(course.revision);
  if (!data || !Array.isArray(data.items) || !Number.isSafeInteger(data.limit) || !Number.isSafeInteger(data.heard) || data.heard < 0) throw new Error('Invalid review queue');
  const items = data.items.filter(item => item && pointer(item.course) && typeof item.lineId === 'string' && typeof item.text === 'string'
    && Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start && item.translations && typeof item.translations === 'object')
    .map(item => ({ course: pointerOf(item.course), lineId: item.lineId, text: item.text, translations: item.translations, start: item.start, end: item.end,
      ...(typeof item.plainAlternative === 'string' && item.plainAlternative.trim() ? { plainAlternative: item.plainAlternative } : {}) }));
  const last = data.last && pointer(data.last.course) && typeof data.last.page === 'string' ? { course: pointerOf(data.last.course), page: data.last.page, index: Number.isSafeInteger(data.last.index) ? data.last.index : null } : null;
  return { items, limit: data.limit, heard: data.heard, resetAt: Number.isSafeInteger(data.resetAt) ? data.resetAt : null, last };
}

export default function ReviewListen({ language, items, onDone }: { language: EntryLanguage; items: ReviewItem[]; onDone: () => void }) {
  const copy = c13Copy[language];
  const [index, setIndex] = useState(0);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const wants = useRef(false);
  const item = items[index] as ReviewItem | undefined;
  const src = item ? `/api/generated-course-media?${new URLSearchParams({ id: item.course.id, revision: String(item.course.revision) })}` : undefined;

  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [index >= items.length]);

  function play() {
    const media = video.current;
    if (!media || !item) return;
    if (media.readyState < 1) { wants.current = true; return; }
    wants.current = true; media.currentTime = item.start;
    setPlaying(true);
    void media.play().catch(() => { wants.current = false; setPlaying(false); });
  }
  // A new sentence plays by itself once its video is ready; the same video is reused when the course is the same.
  useEffect(() => { setHelp(false); setFailed(false); play(); }, [index]);

  async function rate(rating: 'missed' | 'hint' | 'clear') {
    if (!item || busy) return;
    setBusy(true); setFailed(false);
    try {
      await postReview({ action: 'rate', course: pointerOf(item.course), lineId: item.lineId, rating });
      video.current?.pause(); wants.current = false; setPlaying(false);
      setIndex(value => value + 1);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }

  if (!item) return <section className="review-listen review-done" aria-labelledby="review-done-title">
    <div className="review-done-icon" aria-hidden="true"><Icon name="check" size={30} /></div>
    <h1 id="review-done-title" ref={heading} tabIndex={-1}>{copy.doneTitle}</h1>
    <p className="panel-copy">{copy.doneNote}</p>
    <ActionBar><button className="btn btn-primary" type="button" onClick={onDone}>{copy.back}</button></ActionBar>
  </section>;

  const meaning = item.translations[language];
  return <section className="review-listen" aria-labelledby="review-title">
    <div className="review-head"><h1 id="review-title" ref={heading} tabIndex={-1}>{copy.reviewTitle}</h1>
      <span className="review-count" data-testid="review-count">{index + 1}/{items.length}</span></div>
    <video ref={video} data-testid="review-video" className="review-video" src={src} preload="auto" playsInline aria-label={copy.reviewTitle}
      onLoadedMetadata={() => { if (wants.current) play(); else if (video.current) video.current.currentTime = item.start; }}
      onTimeUpdate={() => {
        const media = video.current;
        if (media && wants.current && media.currentTime >= item.end) { media.pause(); wants.current = false; setPlaying(false); }
      }} onPause={() => setPlaying(false)} onEnded={() => { wants.current = false; setPlaying(false); }} />
    <div className="review-tools">
      <button type="button" className="play-btn" aria-label={playing ? copy.play : copy.replay} onClick={play}><Icon name={playing ? 'speaker' : 'replay'} size={26} /></button>
      <p className="review-ask">{copy.ask}</p>
      <button type="button" className="chip-btn" aria-pressed={help} onClick={() => setHelp(open => !open)}><Icon name="translate" size={18} />{listenToolsCopy[language].help}</button>
    </div>
    {help && <div className="review-help" data-testid="review-help">
      <p data-testid="review-text" lang="en" className="review-english">{item.text}</p>
      {meaning ? <p lang={language}>{meaning}</p> : null}
      {item.plainAlternative ? <p className="review-plain">{copy.plain}<span lang="en">{item.plainAlternative}</span></p> : null}
    </div>}
    {failed && <p className="scene-entry-error" role="alert">{copy.saveFailed}</p>}
    <ActionBar className="action-bar--ratings">
      <div className="review-ratings" data-testid="review-ratings" role="group" aria-label={copy.ask}>
        <button type="button" className="btn btn-ghost rating-btn" disabled={busy} onClick={() => void rate('missed')}>{copy.missed}</button>
        <button type="button" className="btn btn-tonal rating-btn" disabled={busy} onClick={() => void rate('hint')}>{copy.hint}</button>
        <button type="button" className="btn btn-tonal rating-btn" disabled={busy} onClick={() => void rate('clear')}>{copy.clear}</button>
      </div>
    </ActionBar>
  </section>;
}

// The queue, "continue" and "heard N" for my scenes. A failed read hides them; the rest of the page is unchanged.
export function useReviewQueue(owner: string | null, enabled: boolean) {
  const [state, setState] = useState<{ owner: string; today: ReviewToday } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { setState(null); }, [owner]);
  useEffect(() => {
    if (!owner || !enabled) return;
    let active = true; const controller = new AbortController(), deadline = window.setTimeout(() => controller.abort(), 5000);
    void fetch('/api/review-queue', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Review queue unavailable'); return response.json(); })
      .then(data => { if (active) setState({ owner, today: parseReviewToday(data) }); })
      .catch(() => { if (active) setState(null); })
      .finally(() => window.clearTimeout(deadline));
    return () => { active = false; controller.abort(); };
  }, [owner, enabled, attempt]);
  const today = state && state.owner === owner ? state.today : null;
  return {
    today, refresh: () => setAttempt(value => value + 1),
    setLimit: async (limit: number) => {
      const previous = today?.limit;
      setState(current => current ? { ...current, today: { ...current.today, limit } } : current);
      try { await postReview({ action: 'limit', limit }); setAttempt(value => value + 1); }
      catch { setState(current => current && previous !== undefined ? { ...current, today: { ...current.today, limit: previous } } : current); }
    },
  };
}

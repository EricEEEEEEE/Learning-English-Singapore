'use client';

import { createContext, useContext, useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import type { EntryLanguage } from './entry-copy';

// C10 shared shell: a thin top bar with "more", a bottom-sheet built on the native <dialog>, and a fixed bottom
// action bar. No UI library: showModal() gives the focus trap, Esc and the inert page behind it.

export type CommonOptions = { meta?: string; trial?: boolean };
export type ShellValue = { language: EntryLanguage; common: (options: CommonOptions) => ReactNode };
export const ShellContext = createContext<ShellValue | null>(null);
export function useShell() { return useContext(ShellContext); }

const paths = {
  back: 'M15 5l-7 7 7 7', more: 'M5 12h.01M12 12h.01M19 12h.01', close: 'M6 6l12 12M18 6 6 18',
  mic: 'M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3Zm-6 8a6 6 0 0 0 12 0M12 18v3', stop: 'M8 8h8v8H8Z',
  play: 'M8 5.5v13l10.5-6.5Z', pause: 'M9 5v14M15 5v14', replay: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5',
  slow: 'M4 15c0-4 3.6-7 8-7s8 3 8 7H4Zm3 0v3m10-3v3M12 8V5', bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z',
  help: 'M4 6h16v10H9l-5 4V6Zm5 4h6', globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3Z',
  translate: 'M4 5h9M8.5 3v2c0 4-2.5 7-5 8m3-4c1 2 3 3.5 5 4M13 21l4-10 4 10m-6.8-3.5h5.6', flag: 'M6 21V4m0 1h11l-2 4 2 4H6',
  watch: 'M4 6h16v12H4Zm6 3v6l5-3Z', exit: 'M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10',
} as const;
export type IconName = keyof typeof paths;

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'more' ? 3 : 1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export function AppBar({ start, center, end, moreLabel, moreOpen, onMore, moreRef, children }: {
  start?: ReactNode; center?: ReactNode; end?: ReactNode; moreLabel: string; moreOpen: boolean; onMore: () => void; moreRef: RefObject<HTMLButtonElement | null>; children?: ReactNode;
}) {
  return <header className="app-bar" data-testid="app-bar">
    <div className="app-bar-inner">
      {start ? <div className="app-bar-start">{start}</div> : null}
      <div className="app-bar-center">{center}</div>
      <div className="app-bar-end">{end}
        <button ref={moreRef} type="button" className="icon-btn" data-testid="more-open" aria-label={moreLabel} aria-haspopup="dialog" aria-expanded={moreOpen} onClick={onMore}><Icon name="more" /></button>
      </div>
    </div>
    {children}
  </header>;
}

export function ActionBar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`action-bar ${className}`.trim()} data-testid="action-bar"><div className="action-bar-inner">{children}</div></div>;
}

// A bottom sheet. Dismissing it (Esc, the backdrop or ✕) returns focus to whatever opened it; an action inside
// it closes it first, so the action's own focus move (for example to a new heading) wins.
export function Sheet({ open, onClose, title, testId, closeLabel, children, fallbackFocus }: {
  open: boolean; onClose: () => void; title: string; testId: string; closeLabel: string; children: ReactNode; fallbackFocus?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const restore = useRef(false);
  const titleId = useId();
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
      restore.current = false;
      try { dialog.showModal(); } catch { dialog.setAttribute('open', ''); }
    } else if (!open && dialog.open) {
      dialog.close();
      const target = opener.current?.isConnected ? opener.current : fallbackFocus?.current;
      if (restore.current && target) target.focus();
      restore.current = false;
    }
  }, [open, fallbackFocus]);
  useLayoutEffect(() => () => { if (ref.current?.open) ref.current.close(); }, []);
  const dismiss = () => { restore.current = true; onClose(); };
  return <dialog ref={ref} className="sheet" data-testid={testId} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); dismiss(); }}
    onClose={() => { if (open) dismiss(); }}
    onClick={event => { if (event.target === event.currentTarget) dismiss(); }}>
    <div className="sheet-body">
      <div className="sheet-grip" aria-hidden="true" />
      <div className="sheet-head"><h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-btn" aria-label={closeLabel} onClick={dismiss}><Icon name="close" /></button></div>
      {children}
    </div>
  </dialog>;
}

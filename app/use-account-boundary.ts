'use client';

import { useEffect, useReducer, useRef, useState } from 'react';

const marker = 'le-sg-account-mode-v1';
const guestScenarioKey = 'le-sg-scenario-v1';

type Boundary = { ready: boolean; authenticated: boolean; accountKey: string | null; scenarioKey: string | null; expired: boolean; failed: boolean };

export function useAccountBoundary(): Boundary & { retry: () => void } {
  const [boundary, setBoundary] = useState<Boundary>({ ready: false, authenticated: false, accountKey: null, scenarioKey: null, expired: false, failed: false });
  const [retryVersion, retry] = useReducer((version: number) => version + 1, 0);
  const current = useRef<Boundary>(boundary);
  useEffect(() => {
    let active = true;
    let serial = 0;
    let pending: AbortController | null = null;
    function publish(next: Boundary) { current.current = next; if (active) setBoundary(next); }
    async function check() {
      const attempt = ++serial;
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      if (current.current.ready) publish({ ...current.current, ready: false, failed: false });
      let session: { authenticated?: boolean; accountKey?: string | null } | null = null;
      let failed = false;
      const deadline = window.setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Session check failed');
        session = await response.json();
        if (typeof session?.authenticated !== 'boolean' || (session.authenticated && (typeof session.accountKey !== 'string' || !/^[A-Za-z0-9_-]{1,96}$/.test(session.accountKey)))) {
          throw new Error('Invalid session response');
        }
      } catch {
        failed = true;
        session = null;
      } finally {
        window.clearTimeout(deadline);
        if (pending === controller) pending = null;
      }
      if (!active || attempt !== serial) return;
      let previouslySignedIn = false;
      try { previouslySignedIn = !!localStorage.getItem(marker); } catch { /* Storage may be unavailable. */ }
      if (session?.authenticated && typeof session.accountKey === 'string' && /^[A-Za-z0-9_-]{1,96}$/.test(session.accountKey)) {
        try { localStorage.setItem(marker, session.accountKey); } catch { /* Scenario storage reports its own error. */ }
        publish({ ready: true, authenticated: true, accountKey: session.accountKey, scenarioKey: `${guestScenarioKey}:${session.accountKey}`, expired: false, failed: false });
      } else {
        publish({ ready: true, authenticated: false, accountKey: null, scenarioKey: failed || previouslySignedIn ? null : guestScenarioKey, expired: previouslySignedIn, failed });
      }
    }
    const onVisibility = () => { if (!document.hidden) void check(); };
    const onStorage = (event: StorageEvent) => { if (event.key === marker && event.newValue !== current.current.accountKey) void check(); };
    void check();
    window.addEventListener('focus', check);
    window.addEventListener('le-sg-auth-invalid', check);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibility);
    const timer = window.setInterval(() => { if (!document.hidden) void check(); }, 60_000);
    return () => { active = false; ++serial; pending?.abort(); window.clearInterval(timer); window.removeEventListener('focus', check); window.removeEventListener('le-sg-auth-invalid', check); window.removeEventListener('storage', onStorage); document.removeEventListener('visibilitychange', onVisibility); };
  }, [retryVersion]);
  return { ...boundary, retry };
}

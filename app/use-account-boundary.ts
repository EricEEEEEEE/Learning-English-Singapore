'use client';

import { useEffect, useRef, useState } from 'react';

const marker = 'le-sg-account-mode-v1';
const guestScenarioKey = 'le-sg-scenario-v1';

type Boundary = { ready: boolean; authenticated: boolean; accountKey: string | null; scenarioKey: string | null; expired: boolean };

export function useAccountBoundary(): Boundary {
  const [boundary, setBoundary] = useState<Boundary>({ ready: false, authenticated: false, accountKey: null, scenarioKey: null, expired: false });
  const current = useRef<Boundary>(boundary);
  useEffect(() => {
    let active = true;
    let serial = 0;
    function publish(next: Boundary) { current.current = next; if (active) setBoundary(next); }
    async function check() {
      const attempt = ++serial;
      if (current.current.ready && current.current.authenticated) publish({ ...current.current, ready: false });
      let session: { authenticated?: boolean; accountKey?: string | null } | null = null;
      try {
        const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' });
        if (response.ok) session = await response.json();
      } catch { /* Treat an uncertain session as signed out on a shared device. */ }
      if (!active || attempt !== serial) return;
      let previouslySignedIn = false;
      try { previouslySignedIn = !!localStorage.getItem(marker); } catch { /* Storage may be unavailable. */ }
      if (session?.authenticated && typeof session.accountKey === 'string' && /^[A-Za-z0-9_-]{1,96}$/.test(session.accountKey)) {
        try { localStorage.setItem(marker, session.accountKey); } catch { /* Scenario storage reports its own error. */ }
        publish({ ready: true, authenticated: true, accountKey: session.accountKey, scenarioKey: `${guestScenarioKey}:${session.accountKey}`, expired: false });
      } else {
        publish({ ready: true, authenticated: false, accountKey: null, scenarioKey: previouslySignedIn ? null : guestScenarioKey, expired: previouslySignedIn });
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
    return () => { active = false; ++serial; window.clearInterval(timer); window.removeEventListener('focus', check); window.removeEventListener('le-sg-auth-invalid', check); window.removeEventListener('storage', onStorage); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);
  return boundary;
}

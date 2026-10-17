'use client';

import { useEffect, useState } from 'react';

// C8-1 (F11.3): the browser's own online/offline state. Starts as online so server and first client render agree;
// the real value is read right after mounting and on every online/offline event.
export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    update();
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  return online;
}

export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

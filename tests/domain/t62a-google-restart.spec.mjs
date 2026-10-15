import { test, expect } from '@playwright/test';

const now = Date.UTC(2026, 9, 15);
const config = {
  clientId: 'synthetic.apps.googleusercontent.com', clientSecret: 'synthetic-client-secret',
  origin: 'https://learning.example.invalid', redirectUri: 'https://learning.example.invalid/api/auth/google/callback',
  secret: 'synthetic-restart-session-secret-at-least-32',
};
function applyCookies(jar, response) {
  for (const value of response.headers.getSetCookie()) {
    const pair = value.split(';')[0], split = pair.indexOf('='), name = pair.slice(0, split);
    if (/Max-Age=0(?:;|$)/i.test(value)) jar.delete(name);
    else jar.set(name, pair.slice(split + 1));
  }
}
const cookieHeader = jar => [...jar].map(([k,v]) => `${k}=${v}`).join('; ');

test('T62A Google restart: stale tab callback cannot destroy the latest pending login', async () => {
  const auth = await import('../../lib/google-auth.ts');
  const { handleGoogleStart } = await import('../../app/api/auth/google/start/route.ts');
  const { handleGoogleCallback } = await import('../../app/api/auth/google/callback/route.ts');
  const jar = new Map();
  const begin = async suffix => {
    const random = { state: 'state-'.padEnd(40, suffix), nonce: 'nonce-'.padEnd(40, suffix), codeVerifier: 'verifier-'.padEnd(60, suffix) };
    const response = await handleGoogleStart(new Request(`${config.origin}/api/auth/google/start?language=zh-Hans&returnTo=%2F`), { config, now, random });
    applyCookies(jar, response);
    return random;
  };
  const old = await begin('a'), current = await begin('b');
  const exchanged = [];
  const dependencies = { config, now: now + 1000,
    exchangeCode: async value => { exchanged.push(value); return { idToken: 'synthetic-id-token' }; },
    verifyIdToken: async () => ({ iss: 'https://accounts.google.com', aud: config.clientId, sub: 'synthetic-user', nonce: current.nonce,
      exp: now / 1000 + 600, email: 'synthetic@example.invalid', email_verified: true }),
  };
  const stale = await handleGoogleCallback(new Request(`${config.redirectUri}?code=old-code&state=${old.state}`, { headers: { cookie: cookieHeader(jar) } }), dependencies);
  expect(new URL(stale.headers.get('location')).searchParams.get('auth')).toBe('invalid_state');
  expect(exchanged).toEqual([]);
  expect(stale.headers.getSetCookie().some(c => c.startsWith(auth.GOOGLE_SESSION_COOKIE + '='))).toBe(false);
  applyCookies(jar, stale);
  const finished = await handleGoogleCallback(new Request(`${config.redirectUri}?code=current-code&state=${current.state}`, { headers: { cookie: cookieHeader(jar) } }), dependencies);
  expect(new URL(finished.headers.get('location')).searchParams.get('auth')).toBe('success');
  expect(exchanged.map(r => ({ code: r.code, verifier: r.codeVerifier }))).toEqual([{ code: 'current-code', verifier: current.codeVerifier }]);
  applyCookies(jar, finished);
  expect(await auth.openGoogleSession(jar.get(auth.GOOGLE_SESSION_COOKIE), config.secret, now + 1001)).toMatchObject({ providerSubject: 'synthetic-user' });
  expect(jar.has(auth.GOOGLE_TRANSACTION_COOKIE)).toBe(false);
});

test('T62A Google restart: state mismatch rejects without exchanging or clearing another pending attempt', async () => {
  const auth = await import('../../lib/google-auth.ts');
  const { handleGoogleCallback } = await import('../../app/api/auth/google/callback/route.ts');
  const transaction = auth.createGoogleTransaction({ language: 'ko', returnTo: '/', now });
  const sealed = await auth.sealGoogleTransaction(transaction, config.secret);
  let exchanged = 0;
  const response = await handleGoogleCallback(new Request(`${config.redirectUri}?code=foreign-code&state=foreign-state`, { headers: { cookie: `${auth.GOOGLE_TRANSACTION_COOKIE}=${sealed}` } }), {
    config, now, exchangeCode: async () => { exchanged++; throw Error('Must not exchange'); }, verifyIdToken: async () => { throw Error('Must not verify'); },
  });
  expect(new URL(response.headers.get('location')).searchParams.get('auth')).toBe('invalid_state');
  expect(exchanged).toBe(0);
  expect(response.headers.getSetCookie()).toEqual([]);
});

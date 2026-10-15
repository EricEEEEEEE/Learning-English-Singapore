import { generateKeyPairSync, sign } from 'node:crypto';
import { test, expect } from '@playwright/test';

const loadAuth = () => import('../../lib/google-auth.ts');
const loadStart = () => import('../../app/api/auth/google/start/route.ts');
const loadCallback = () => import('../../app/api/auth/google/callback/route.ts');
const now = Date.UTC(2026, 8, 14, 6, 0, 0);
const secret = 'test-secret-with-at-least-thirty-two-bytes';
const config = {
  clientId: 'browser-test.apps.googleusercontent.com',
  clientSecret: 'test-client-secret-never-sent-to-google',
  origin: 'https://learning-english.example',
  redirectUri: 'https://learning-english.example/api/auth/google/callback',
  secret,
};
const random = {
  state: 'state-7f29dbbc6f6846d18eaa7e4994a0f15a',
  nonce: 'nonce-e9672f42fce54b48a52ad1d871e5f882',
  codeVerifier: 'verifier-09c981c6ed9e4b9394bbfd0eb640933f0f8b1ad8cbfc4a44b7c1799277683b4c',
};

function cookieValue(setCookie, name) {
  const match = setCookie.match(new RegExp(`(?:^|,\\s*)${name}=([^;,]*)`));
  return match?.[1] ?? null;
}

async function transactionCookie(language = 'zh-Hans', returnTo = '/') {
  const auth = await loadAuth();
  const transaction = auth.createGoogleTransaction({ language, returnTo, now, random });
  return { transaction, sealed: await auth.sealGoogleTransaction(transaction, secret) };
}

test('T43 / F1.1,F1.4: real start route sets a protected transaction cookie and redirects to Google', async () => {
  const auth = await loadAuth();
  const route = await loadStart();
  const response = await route.handleGoogleStart(
    new Request(`${config.origin}/api/auth/google/start?language=hi&returnTo=%2F%3Fresume%3Donboarding`),
    { config, now, random },
  );
  expect(response.status).toBe(302);
  expect(response.headers.get('location')).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
  const setCookie = response.headers.get('set-cookie');
  expect(setCookie).toContain(`${auth.GOOGLE_TRANSACTION_COOKIE}=`);
  expect(setCookie).toMatch(/HttpOnly/i);
  expect(setCookie).toMatch(/Secure/i);
  expect(setCookie).toMatch(/SameSite=Lax/i);
  expect(setCookie).toMatch(/Max-Age=600/i);
  const sealed = cookieValue(setCookie, auth.GOOGLE_TRANSACTION_COOKIE);
  expect(await auth.openGoogleTransaction(sealed, secret, now + 1)).toMatchObject({ language: 'hi', returnTo: '/?resume=onboarding' });
});

test('T43 / F1.2,F1.4: callback exchange receives the original code verifier and identity session keeps issuer+sub', async () => {
  const auth = await loadAuth();
  const route = await loadCallback();
  const { sealed } = await transactionCookie('ja', '/?resume=onboarding');
  const exchanges = [];
  const response = await route.handleGoogleCallback(
    new Request(`${config.redirectUri}?code=one-time-code&state=${random.state}`, { headers: { cookie: `${auth.GOOGLE_TRANSACTION_COOKIE}=${sealed}` } }),
    {
      config, now,
      exchangeCode: async input => { exchanges.push(input); return { idToken: 'verified-id-token' }; },
      verifyIdToken: async input => {
        expect(input).toEqual({ idToken: 'verified-id-token', clientId: config.clientId, nonce: random.nonce, now });
        return ({
        iss: 'https://accounts.google.com', aud: config.clientId, sub: 'google-subject-a',
        exp: Math.floor(now / 1000) + 300, nonce: random.nonce, email: 'learner@example.com', email_verified: true,
        });
      },
    },
  );
  expect(exchanges).toEqual([{ code: 'one-time-code', codeVerifier: random.codeVerifier, clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri }]);
  expect(response.status).toBe(302);
  expect(response.headers.get('location')).toBe(`${config.origin}/?resume=onboarding&auth=success&language=ja`);
  const setCookie = response.headers.get('set-cookie');
  expect(setCookie).toContain(`${auth.GOOGLE_SESSION_COOKIE}=`);
  expect(setCookie).toContain(`${auth.GOOGLE_TRANSACTION_COOKIE}=;`);
  expect(setCookie).toMatch(new RegExp(`${auth.GOOGLE_SESSION_COOKIE}=[^;]+;[^,]*HttpOnly`, 'i'));
  expect(setCookie).toMatch(new RegExp(`${auth.GOOGLE_SESSION_COOKIE}=[^;]+;[^,]*Secure`, 'i'));
  expect(setCookie).toMatch(new RegExp(`${auth.GOOGLE_SESSION_COOKIE}=[^;]+;[^,]*SameSite=Lax`, 'i'));
  expect(setCookie).not.toContain('learner@example.com');
  const session = await auth.openGoogleSession(cookieValue(setCookie, auth.GOOGLE_SESSION_COOKIE), secret, now + 1);
  expect(session).toMatchObject({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'google-subject-a' });
});

test('T43 / F1.2: default verifier rejects an unsigned alg=none ID token', async () => {
  const route = await loadCallback();
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: config.clientId, sub: 'forged' })).toString('base64url');
  await expect(route.verifyGoogleIdToken({ idToken: `${header}.${payload}.`, clientId: config.clientId, nonce: random.nonce, now })).rejects.toThrow(/signature|algorithm|token/i);
});

test('T43 / F1.2: verifier cryptographically rejects a structurally valid RS256 token with the wrong signature', async () => {
  const route = await loadCallback();
  const trusted = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const attacker = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const trustedJwk = trusted.publicKey.export({ format: 'jwk' });
  trustedJwk.kid = 'google-test-key';
  trustedJwk.alg = 'RS256';
  trustedJwk.use = 'sig';
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: trustedJwk.kid })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'https://accounts.google.com', aud: config.clientId, sub: 'forged',
    exp: Math.floor(now / 1000) + 300, nonce: random.nonce, email: 'attacker@example.com', email_verified: true,
  })).toString('base64url');
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), attacker.privateKey).toString('base64url');
  await expect(route.verifyGoogleIdToken({ idToken: `${header}.${payload}.${signature}`, clientId: config.clientId, nonce: random.nonce, now, jwks: { keys: [trustedJwk] } })).rejects.toThrow(/signature|token/i);
});

test('T43 / F1.3,F1.4: matching failures clear their transaction; unrelated callbacks preserve the pending login', async () => {
  const auth = await loadAuth();
  const route = await loadCallback();
  const { sealed } = await transactionCookie('id', '/');
  const cases = [
    { query: `error=access_denied&state=${random.state}`, reason: 'cancelled' },
    { query: `state=${random.state}`, reason: 'missing_code' },
    { query: 'code=one-time-code&state=wrong', reason: 'invalid_state' },
    { query: `code=one-time-code&state=${random.state}`, reason: 'exchange_failed', exchangeFails: true },
    { query: `code=one-time-code&state=${random.state}`, reason: 'verification_failed', verifyFails: true },
  ];
  for (const item of cases) {
    let exchanges = 0;
    const response = await route.handleGoogleCallback(
      new Request(`${config.redirectUri}?${item.query}`, { headers: { cookie: `${auth.GOOGLE_TRANSACTION_COOKIE}=${sealed}` } }),
      { config, now, exchangeCode: async () => { exchanges += 1; if (item.exchangeFails) throw new Error('network'); return { idToken: 'unused' }; }, verifyIdToken: async () => { if (item.verifyFails) throw new Error('bad signature'); throw new Error('must not verify'); } },
    );
    expect(response.headers.get('location')).toBe(`${config.origin}/?auth=${item.reason}&language=id`);
    const setCookie = response.headers.get('set-cookie');
    if (item.reason === 'invalid_state') {
      expect(setCookie).toBeNull();
    } else {
      expect(setCookie).toContain(`${auth.GOOGLE_TRANSACTION_COOKIE}=;`);
      expect(setCookie).toMatch(/Max-Age=0/i);
      expect(setCookie).not.toContain(`${auth.GOOGLE_SESSION_COOKIE}=`);
    }
    expect(exchanges).toBe(item.exchangeFails || item.verifyFails ? 1 : 0);
  }
});

test('T43 / F1.4: a normal browser replay is rejected before a second code exchange', async () => {
  const auth = await loadAuth();
  const route = await loadCallback();
  const { sealed } = await transactionCookie();
  let exchanges = 0;
  const dependencies = {
    config, now,
    exchangeCode: async () => { exchanges += 1; return { idToken: 'verified-id-token' }; },
    verifyIdToken: async () => ({
      iss: 'https://accounts.google.com', aud: config.clientId, sub: 'google-subject-a',
      exp: Math.floor(now / 1000) + 300, nonce: random.nonce, email: 'learner@example.com', email_verified: true,
    }),
  };
  const url = `${config.redirectUri}?code=one-time-code&state=${random.state}`;
  const first = await route.handleGoogleCallback(new Request(url, { headers: { cookie: `${auth.GOOGLE_TRANSACTION_COOKIE}=${sealed}` } }), dependencies);
  const consumed = cookieValue(first.headers.get('set-cookie'), auth.GOOGLE_CONSUMED_COOKIE);
  const secondCookie = `${auth.GOOGLE_TRANSACTION_COOKIE}=${sealed}; ${auth.GOOGLE_CONSUMED_COOKIE}=${consumed}`;
  const second = await route.handleGoogleCallback(new Request(url, { headers: { cookie: secondCookie } }), dependencies);
  expect(exchanges).toBe(1);
  expect(second.headers.get('location')).toBe(`${config.origin}/?auth=replayed&language=zh-Hans`);
  expect(second.headers.get('set-cookie')).not.toContain(`${auth.GOOGLE_SESSION_COOKIE}=`);
});

test('T43 / F1.4: raw transaction replay relies on Google one-time code rejection and never creates another session', async () => {
  const auth = await loadAuth();
  const route = await loadCallback();
  const { sealed } = await transactionCookie();
  let exchanges = 0;
  const dependencies = {
    config, now,
    exchangeCode: async () => {
      exchanges += 1;
      if (exchanges > 1) throw new Error('invalid_grant');
      return { idToken: 'verified-id-token' };
    },
    verifyIdToken: async () => ({
      iss: 'https://accounts.google.com', aud: config.clientId, sub: 'google-subject-a',
      exp: Math.floor(now / 1000) + 300, nonce: random.nonce, email: 'learner@example.com', email_verified: true,
    }),
  };
  const url = `${config.redirectUri}?code=one-time-code&state=${random.state}`;
  await route.handleGoogleCallback(new Request(url, { headers: { cookie: `${auth.GOOGLE_TRANSACTION_COOKIE}=${sealed}` } }), dependencies);
  const replay = await route.handleGoogleCallback(new Request(url, { headers: { cookie: `${auth.GOOGLE_TRANSACTION_COOKIE}=${sealed}` } }), dependencies);
  expect(exchanges).toBe(2);
  expect(replay.headers.get('location')).toBe(`${config.origin}/?auth=exchange_failed&language=zh-Hans`);
  expect(replay.headers.get('set-cookie')).not.toContain(`${auth.GOOGLE_SESSION_COOKIE}=`);
});

test('T43 / F1.4: missing, tampered and expired transactions fail before code exchange', async () => {
  const auth = await loadAuth();
  const route = await loadCallback();
  const { transaction, sealed } = await transactionCookie();
  const expired = await auth.sealGoogleTransaction({ ...transaction, expiresAt: now }, secret);
  const cookieValues = [null, `${sealed.slice(0, -1)}x`, expired];
  let exchanges = 0;
  for (const value of cookieValues) {
    const headers = value ? { cookie: `${auth.GOOGLE_TRANSACTION_COOKIE}=${value}` } : undefined;
    const response = await route.handleGoogleCallback(
      new Request(`${config.redirectUri}?code=one-time-code&state=${random.state}`, { headers }),
      { config, now, exchangeCode: async () => { exchanges += 1; return { idToken: 'unused' }; }, verifyIdToken: async () => { throw new Error('must not verify'); } },
    );
    expect(response.headers.get('location')).toBe(`${config.origin}/?auth=invalid_transaction&language=zh-Hans`);
    expect(response.headers.get('set-cookie')).not.toContain(`${auth.GOOGLE_SESSION_COOKIE}=`);
  }
  expect(exchanges).toBe(0);
});

test('T43 / F1.3,F1.4: callback result overrides reserved auth and language parameters in returnTo', async () => {
  const auth = await loadAuth();
  const route = await loadCallback();
  const { sealed } = await transactionCookie('id', '/?resume=entry&auth=success&language=en');
  const response = await route.handleGoogleCallback(
    new Request(`${config.redirectUri}?error=access_denied&state=${random.state}`, { headers: { cookie: `${auth.GOOGLE_TRANSACTION_COOKIE}=${sealed}` } }),
    { config, now, exchangeCode: async () => { throw new Error('must not exchange'); }, verifyIdToken: async () => { throw new Error('must not verify'); } },
  );
  expect(response.headers.get('location')).toBe(`${config.origin}/?resume=entry&auth=cancelled&language=id`);
});

test('T43 / F1.1,F1.3: exported Next GET handlers are wired to start and cancellation flows', async () => {
  const auth = await loadAuth();
  const start = await loadStart();
  const callback = await loadCallback();
  const previous = Object.fromEntries(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'AUTH_SESSION_SECRET', 'APP_ORIGIN'].map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    GOOGLE_CLIENT_ID: config.clientId,
    GOOGLE_CLIENT_SECRET: config.clientSecret,
    AUTH_SESSION_SECRET: secret,
    APP_ORIGIN: config.origin,
  });
  try {
    const started = await start.GET(new Request(`${config.origin}/api/auth/google/start?language=ko&returnTo=%2F`));
    expect(started.status).toBe(302);
    expect(started.headers.get('location')).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
    const sealed = cookieValue(started.headers.get('set-cookie'), auth.GOOGLE_TRANSACTION_COOKIE);
    const transaction = await auth.openGoogleTransaction(sealed, secret, Date.now());
    expect(transaction.language).toBe('ko');
    const cancelled = await callback.GET(new Request(`${config.redirectUri}?error=access_denied&state=${transaction.state}`, { headers: { cookie: `${auth.GOOGLE_TRANSACTION_COOKIE}=${sealed}` } }));
    expect(cancelled.headers.get('location')).toBe(`${config.origin}/?auth=cancelled&language=ko`);
    expect(cancelled.headers.get('set-cookie')).toContain(`${auth.GOOGLE_TRANSACTION_COOKIE}=;`);
  } finally {
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});

test('T43 / F1.4: exported start GET creates fresh state, nonce and verifier for every attempt', async () => {
  const auth = await loadAuth();
  const start = await loadStart();
  const previous = Object.fromEntries(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'AUTH_SESSION_SECRET', 'APP_ORIGIN'].map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    GOOGLE_CLIENT_ID: config.clientId,
    GOOGLE_CLIENT_SECRET: config.clientSecret,
    AUTH_SESSION_SECRET: secret,
    APP_ORIGIN: config.origin,
  });
  try {
    const attempts = [];
    for (let index = 0; index < 2; index += 1) {
      const response = await start.GET(new Request(`${config.origin}/api/auth/google/start?language=zh-Hans&returnTo=%2F`));
      const sealed = cookieValue(response.headers.get('set-cookie'), auth.GOOGLE_TRANSACTION_COOKIE);
      attempts.push(await auth.openGoogleTransaction(sealed, secret, Date.now()));
    }
    for (const field of ['state', 'nonce', 'codeVerifier']) {
      expect(attempts[0][field].length).toBeGreaterThanOrEqual(43);
      expect(attempts[1][field].length).toBeGreaterThanOrEqual(43);
      expect(attempts[0][field]).not.toBe(attempts[1][field]);
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});

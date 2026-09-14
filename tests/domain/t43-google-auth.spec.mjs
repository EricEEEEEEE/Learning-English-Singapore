import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';
const load = () => import('../../lib/google-auth.ts');

const now = Date.UTC(2026, 8, 14, 6, 0, 0);
const random = {
  state: 'state-7f29dbbc6f6846d18eaa7e4994a0f15a',
  nonce: 'nonce-e9672f42fce54b48a52ad1d871e5f882',
  codeVerifier: 'verifier-09c981c6ed9e4b9394bbfd0eb640933f0f8b1ad8cbfc4a44b7c1799277683b4c',
};
const config = {
  clientId: 'browser-test.apps.googleusercontent.com',
  redirectUri: 'https://learning-english.example/api/auth/google/callback',
};

test('T43 / F1.1,F13.3: authorization uses code+PKCE, state and nonce while retaining language and local purpose', async () => {
  const auth = await load();
  const transaction = auth.createGoogleTransaction({ language: 'ko', returnTo: '/?resume=onboarding', now, random });
  expect(transaction).toMatchObject({ language: 'ko', returnTo: '/?resume=onboarding', ...random });
  expect(transaction.expiresAt).toBe(now + 10 * 60_000);

  const url = new URL(auth.buildGoogleAuthorizationUrl(transaction, config));
  expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
  expect(Object.fromEntries(url.searchParams)).toMatchObject({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: random.state,
    nonce: random.nonce,
    code_challenge_method: 'S256',
  });
  const expectedChallenge = createHash('sha256').update(random.codeVerifier).digest('base64url');
  expect(url.searchParams.get('code_challenge')).toBe(expectedChallenge);
  expect(url.searchParams.has('access_type')).toBe(false);
});

test('T43 / F1.4,F13.4: only five auxiliary languages and same-origin return paths can enter a transaction', async () => {
  const auth = await load();
  for (const language of ['zh-Hans', 'id', 'ja', 'ko', 'hi']) {
    expect(auth.createGoogleTransaction({ language, returnTo: '/?resume=entry', now, random }).language).toBe(language);
  }
  for (const language of ['en', 'fr', '', '../ko']) {
    expect(() => auth.createGoogleTransaction({ language, returnTo: '/', now, random })).toThrow(/language/i);
  }
  for (const returnTo of ['https://attacker.example', '//attacker.example', '/\\attacker', 'javascript:alert(1)']) {
    expect(() => auth.createGoogleTransaction({ language: 'zh-Hans', returnTo, now, random })).toThrow(/return/i);
  }
});

test('T43 / F1.2,F1.4: sealed transaction rejects tampering and expiry without exposing verifier in a URL', async () => {
  const auth = await load();
  const transaction = auth.createGoogleTransaction({ language: 'hi', returnTo: '/', now, random });
  const sealed = await auth.sealGoogleTransaction(transaction, 'test-secret-with-at-least-thirty-two-bytes');
  expect(sealed).not.toContain(random.codeVerifier);
  expect(await auth.openGoogleTransaction(sealed, 'test-secret-with-at-least-thirty-two-bytes', now + 1)).toEqual(transaction);
  expect(await auth.openGoogleTransaction(`${sealed.slice(0, -1)}x`, 'test-secret-with-at-least-thirty-two-bytes', now + 1)).toBeNull();
  expect(await auth.openGoogleTransaction(sealed, 'wrong-secret-with-at-least-thirty-two-bytes', now + 1)).toBeNull();
  expect(await auth.openGoogleTransaction(sealed, 'test-secret-with-at-least-thirty-two-bytes', transaction.expiresAt)).toBeNull();
});

test('T43 / F1.3,F1.4: cancellation, missing code and state mismatch stay unauthenticated and never exchange a code', async () => {
  const auth = await load();
  const transaction = auth.createGoogleTransaction({ language: 'id', returnTo: '/?resume=entry', now, random });
  expect(auth.validateGoogleCallback({ error: 'access_denied', state: random.state }, transaction)).toEqual({ ok: false, reason: 'cancelled' });
  expect(auth.validateGoogleCallback({ state: random.state }, transaction)).toEqual({ ok: false, reason: 'missing_code' });
  expect(auth.validateGoogleCallback({ code: 'one-time-code', state: 'wrong' }, transaction)).toEqual({ ok: false, reason: 'invalid_state' });
  expect(auth.validateGoogleCallback({ code: 'one-time-code', state: random.state }, transaction)).toEqual({ ok: true, code: 'one-time-code' });
});

test('T43 / F1.2,F1.5: verified Google identity is keyed by issuer+sub, never browser email or nickname', async () => {
  const auth = await load();
  const base = {
    iss: 'https://accounts.google.com', aud: config.clientId, exp: Math.floor(now / 1000) + 300,
    nonce: random.nonce, email: 'same@example.com', email_verified: true, name: 'Same Name',
  };
  const first = auth.validateGoogleIdTokenClaims({ ...base, sub: 'google-subject-a' }, { clientId: config.clientId, nonce: random.nonce, now });
  const second = auth.validateGoogleIdTokenClaims({ ...base, sub: 'google-subject-b' }, { clientId: config.clientId, nonce: random.nonce, now });
  expect(first).toMatchObject({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'google-subject-a', email: 'same@example.com' });
  expect(second.providerSubject).toBe('google-subject-b');
  expect(second.providerSubject).not.toBe(first.providerSubject);
});

test('T43 / F1.2,F1.4: unverified, replayed or wrongly addressed ID-token claims are rejected', async () => {
  const auth = await load();
  const valid = {
    iss: 'https://accounts.google.com', aud: config.clientId, sub: 'google-subject',
    exp: Math.floor(now / 1000) + 300, nonce: random.nonce, email: 'learner@example.com', email_verified: true,
  };
  const check = claims => () => auth.validateGoogleIdTokenClaims(claims, { clientId: config.clientId, nonce: random.nonce, now });
  expect(check({ ...valid, iss: 'https://attacker.example' })).toThrow(/issuer/i);
  expect(check({ ...valid, aud: 'other-client' })).toThrow(/audience/i);
  expect(check({ ...valid, exp: Math.floor(now / 1000) })).toThrow(/expired/i);
  expect(check({ ...valid, nonce: 'replayed-nonce' })).toThrow(/nonce/i);
  expect(check({ ...valid, email_verified: false })).toThrow(/email/i);
  expect(check({ ...valid, sub: '' })).toThrow(/subject/i);
});

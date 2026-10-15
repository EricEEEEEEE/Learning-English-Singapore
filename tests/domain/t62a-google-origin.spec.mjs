import { test, expect } from '@playwright/test';

const config = {
  clientId: 'synthetic.apps.googleusercontent.com', clientSecret: 'synthetic-client-secret',
  origin: 'http://localhost:3000', redirectUri: 'http://localhost:3000/api/auth/google/callback',
  secret: 'synthetic-localhost-session-secret-at-least-32',
};

test('T62A Google origin: host alias enters the configured origin before setting a host-only cookie', async () => {
  const { handleGoogleStart } = await import('../../app/api/auth/google/start/route.ts');
  const { openGoogleTransaction, GOOGLE_TRANSACTION_COOKIE } = await import('../../lib/google-auth.ts');
  const now = Date.UTC(2026, 9, 15);
  const query = '?language=ko&returnTo=%2F%3Fresume%3Donboarding';
  const first = await handleGoogleStart(new Request('http://127.0.0.1:3000/api/auth/google/start' + query), { config, now });
  expect(first.status).toBe(302);
  expect(first.headers.get('location')).toBe(config.origin + '/api/auth/google/start' + query);
  expect(first.headers.getSetCookie()).toEqual([]);
  const canonical = await handleGoogleStart(new Request(first.headers.get('location')), { config, now });
  const google = new URL(canonical.headers.get('location'));
  expect(google.origin).toBe('https://accounts.google.com');
  expect(google.searchParams.get('redirect_uri')).toBe(config.redirectUri);
  const cookie = canonical.headers.getSetCookie().find(c => c.startsWith(GOOGLE_TRANSACTION_COOKIE + '='));
  const sealed = cookie.slice(GOOGLE_TRANSACTION_COOKIE.length + 1).split(';')[0];
  expect(await openGoogleTransaction(sealed, config.secret, now + 1)).toMatchObject({ language: 'ko', returnTo: '/?resume=onboarding' });
});

test('T62A Google origin: another local port also returns to the configured entry without leaking a transaction', async () => {
  const { handleGoogleStart } = await import('../../app/api/auth/google/start/route.ts');
  const response = await handleGoogleStart(new Request('http://localhost:3210/api/auth/google/start?language=zh-Hans&returnTo=%2F'), { config });
  expect(response.status).toBe(302);
  expect(response.headers.get('location')).toBe(config.origin + '/api/auth/google/start?language=zh-Hans&returnTo=%2F');
  expect(response.headers.getSetCookie()).toEqual([]);
});

test('T62A Google origin: canonical redirects never accept an external return path', async () => {
  const { handleGoogleStart } = await import('../../app/api/auth/google/start/route.ts');
  const response = await handleGoogleStart(new Request('http://127.0.0.1:3000/api/auth/google/start?language=zh-Hans&returnTo=https%3A%2F%2Fother.example.invalid'), { config });
  expect(response.status).toBe(400);
  expect(response.headers.get('location')).toBeNull();
  expect(response.headers.getSetCookie()).toEqual([]);
});

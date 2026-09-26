import { test, expect } from '@playwright/test';
import { GOOGLE_SESSION_COOKIE } from '../../lib/google-auth.ts';

const url = 'http://localhost/api/generated-courses?id=synthetic-course&revision=2';
const course = { id: 'synthetic-course', revision: 2, source: 'test-fixture', media: { courseId: 'synthetic-course', revision: 2, assetId: 'final-synthetic', sha256: 'a'.repeat(64), duration: 4 }, lines: [], phrases: [], turns: [] };
const request = (address = url, method = 'GET') => new Request(address, { method, headers: { cookie: `irrelevant=x; ${GOOGLE_SESSION_COOKIE}=synthetic-sealed-session` } });

test('T61B course HTTP: forwards signed session and explicit version to read-only store without caching', async () => {
  const { handleGeneratedCourse } = await import('../../app/api/generated-courses/route.ts');
  let calls = 0;
  const response = await handleGeneratedCourse(request(), { now: 1234, store: { getCourse: async input => {
    calls++; expect(input).toEqual({ cookie: 'synthetic-sealed-session', now: 1234, id: 'synthetic-course', revision: 2 }); return course;
  } } });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(course);
  expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  expect(calls).toBe(1);
});

test('T61B course HTTP: rejects missing, ambiguous and malformed identifiers before storage', async () => {
  const { handleGeneratedCourse } = await import('../../app/api/generated-courses/route.ts');
  let calls = 0;
  for (const query of ['', '?id=x', '?id=x&revision=0', '?id=x&revision=1.5', '?id=x&revision=1e2', '?id=x&revision=2&revision=3', '?id=x&id=y&revision=2', '?id=../x&revision=2']) {
    const response = await handleGeneratedCourse(request(`http://localhost/api/generated-courses${query}`), { now: 1, store: { getCourse: async () => { calls++; return course; } } });
    expect(response.status).toBe(400);
  }
  expect(calls).toBe(0);
});

test('T61B course HTTP: rejects mutations without invoking storage', async () => {
  const { handleGeneratedCourse } = await import('../../app/api/generated-courses/route.ts');
  let calls = 0;
  const response = await handleGeneratedCourse(request(url, 'POST'), { now: 1, store: { getCourse: async () => { calls++; return course; } } });
  expect(response.status).toBe(405); expect(response.headers.get('allow')).toBe('GET'); expect(calls).toBe(0);
});

test('T61B course HTTP: authentication and internal failures produce uncached generic errors', async () => {
  const { handleGeneratedCourse } = await import('../../app/api/generated-courses/route.ts');
  for (const [message, status] of [['Authenticated session required', 401], ['Course unavailable', 404], ['Course media unavailable', 404], ['/private/synthetic/path owner=secret-owner', 503]]) {
    const response = await handleGeneratedCourse(request(), { now: 1, store: { getCourse: async () => { throw new Error(message); } } });
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    const body = await response.text();
    expect(body).not.toContain(message); expect(body).not.toContain('secret-owner');
  }
});

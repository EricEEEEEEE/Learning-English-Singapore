import { test, expect } from '@playwright/test';
import { GOOGLE_SESSION_COOKIE } from '../../lib/google-auth.ts';

const bytes = Buffer.from('0123456789');
const url = 'http://localhost/api/generated-course-media?id=synthetic-course&revision=1';
const media = { courseId: 'synthetic-course', revision: 1, assetId: 'final-synthetic', size: 10, sha256: 'a'.repeat(64), bytes };
const request = (range, method = 'GET', address = url) => new Request(address, { method, headers: { cookie: `${GOOGLE_SESSION_COOKIE}=synthetic-session`, ...(range === undefined ? {} : { range }) } });

test('T61B media HTTP: authenticated full read returns private mp4 bytes without regeneration', async () => {
  const { handleGeneratedMedia } = await import('../../app/api/generated-course-media/route.ts');
  let calls = 0;
  const response = await handleGeneratedMedia(request(), { now: 12, store: { getCourseMedia: async input => {
    calls++; expect(input).toEqual({ cookie: 'synthetic-session', now: 12, id: 'synthetic-course', revision: 1 }); return media;
  } } });
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('video/mp4');
  expect(response.headers.get('content-length')).toBe('10');
  expect(response.headers.get('accept-ranges')).toBe('bytes');
  expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  expect(calls).toBe(1);
});

test('T61B media HTTP: single closed open and suffix ranges return exact slices', async () => {
  const { handleGeneratedMedia } = await import('../../app/api/generated-course-media/route.ts');
  for (const [range, body, contentRange] of [['bytes=2-5', '2345', 'bytes 2-5/10'], ['bytes=7-', '789', 'bytes 7-9/10'], ['bytes=-3', '789', 'bytes 7-9/10'], ['bytes=8-99', '89', 'bytes 8-9/10']]) {
    const response = await handleGeneratedMedia(request(range), { now: 12, store: { getCourseMedia: async () => media } });
    expect(response.status).toBe(206); expect(await response.text()).toBe(body);
    expect(response.headers.get('content-range')).toBe(contentRange);
    expect(response.headers.get('content-length')).toBe(String(body.length));
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  }
});

test('T61B media HTTP: unsupported or unsatisfiable range never leaks full file', async () => {
  const { handleGeneratedMedia } = await import('../../app/api/generated-course-media/route.ts');
  for (const range of ['bytes=10-', 'bytes=5-2', 'bytes=-0', 'bytes=0-1,5-6', 'bytes=1.5-2', 'items=0-1']) {
    const response = await handleGeneratedMedia(request(range), { now: 12, store: { getCourseMedia: async () => media } });
    expect(response.status).toBe(416); expect(response.headers.get('content-range')).toBe('bytes */10');
    expect(await response.text()).not.toBe(bytes.toString());
  }
});

test('T61B media HTTP: HEAD authenticates without body and mutations are rejected', async () => {
  const { handleGeneratedMedia } = await import('../../app/api/generated-course-media/route.ts');
  let calls = 0;
  const options = { now: 12, store: { getCourseMedia: async () => { calls++; return media; } } };
  const head = await handleGeneratedMedia(request(undefined, 'HEAD'), options);
  expect(head.status).toBe(200); expect(head.headers.get('content-length')).toBe('10'); expect(await head.text()).toBe('');
  const post = await handleGeneratedMedia(request(undefined, 'POST'), options);
  expect(post.status).toBe(405); expect(post.headers.get('allow')).toBe('GET, HEAD'); expect(calls).toBe(1);
});

test('T61B media HTTP: errors are generic uncached and range cannot bypass identity', async () => {
  const { handleGeneratedMedia } = await import('../../app/api/generated-course-media/route.ts');
  for (const [message, status] of [['Authenticated session required', 401], ['Course unavailable', 404], ['Course media unavailable', 404], ['/private/synthetic-error', 503]]) {
    const response = await handleGeneratedMedia(request('bytes=0-1'), { now: 12, store: { getCourseMedia: async () => { throw new Error(message); } } });
    expect(response.status).toBe(status); expect(response.headers.get('content-range')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0'); expect(await response.text()).not.toContain(message);
  }
});

test('T61B media HTTP: invalid and duplicate version parameters never reach storage', async () => {
  const { handleGeneratedMedia } = await import('../../app/api/generated-course-media/route.ts');
  let calls = 0;
  for (const query of ['?id=x', '?id=x&revision=0', '?id=x&revision=1&revision=2', '?id=../x&revision=1']) {
    const response = await handleGeneratedMedia(request(undefined, 'GET', `http://localhost/api/generated-course-media${query}`), { now: 12, store: { getCourseMedia: async () => { calls++; return media; } } });
    expect(response.status).toBe(400);
  }
  expect(calls).toBe(0);
});

import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
const load = () => import('../../lib/download-generated-media.ts');
const bytes = Buffer.from('synthetic provider bytes');
const url = 'https://assets.example.invalid/course/video.mp4?signature=synthetic';
const opts = fetch => ({ allowedHosts: ['assets.example.invalid'], maxBytes: 1000, fetch });

test('T61B download: exact approved origin, GET without provider credentials, byte hash', async () => {
  const { downloadGeneratedMedia } = await load(); let calls = 0;
  const result = await downloadGeneratedMedia(url, opts(async (target, options) => {
    calls++; expect(target).toBe(url); expect(options.method).toBe('GET'); expect(options.redirect).toBe('error');
    expect(new Headers(options.headers).has('Authorization')).toBe(false); expect(options.signal).toBeTruthy();
    return new Response(bytes);
  }));
  expect(calls).toBe(1); expect(Buffer.from(result.bytes)).toEqual(bytes);
  expect(result.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
  expect(result).not.toHaveProperty('url');
});

for (const target of ['file:///private/a.mp4', 'http://assets.example.invalid/a', 'https://127.0.0.1/a', 'https://[::1]/a', 'https://assets.example.invalid.evil.test/a', 'https://user:pass@assets.example.invalid/a', 'https://assets.example.invalid:444/a']) test(`T61B download: rejects target ${target} before transport`, async () => {
  const { downloadGeneratedMedia } = await load(); let calls = 0;
  await expect(downloadGeneratedMedia(target, opts(async () => { calls++; return new Response(bytes); }))).rejects.toThrow();
  expect(calls).toBe(0);
});

test('T61B download: missing allowlist never downloads', async () => {
  const { downloadGeneratedMedia } = await load(); let calls = 0;
  await expect(downloadGeneratedMedia(url, { ...opts(async () => { calls++; return new Response(bytes); }), allowedHosts: [] })).rejects.toThrow();
  expect(calls).toBe(0);
});

test('T61B download: streamed size overrun cancels the body without trusting headers', async () => {
  const { downloadGeneratedMedia } = await load(); let cancelled = false;
  let chunks = 0;
  const body = new ReadableStream({ pull(controller) { if (++chunks <= 3) controller.enqueue(new Uint8Array(600)); else controller.close(); }, cancel() { cancelled = true; } });
  await expect(downloadGeneratedMedia(url, opts(async () => new Response(body, { headers: { 'Content-Length': '1' } })))).rejects.toThrow();
  expect(cancelled).toBe(true);
});

test('T61B download: IP literal remains forbidden even if mistakenly allowlisted', async () => {
  const { downloadGeneratedMedia } = await load(); let calls = 0;
  await expect(downloadGeneratedMedia('https://127.0.0.1/a', { allowedHosts: ['127.0.0.1'], maxBytes: 1000, fetch: async () => { calls++; return new Response(bytes); } })).rejects.toThrow();
  expect(calls).toBe(0);
});

for (const kind of ['redirect', 'http', 'empty', 'truncated', 'network']) test(`T61B download: ${kind} fails without retry or signed URL leakage`, async () => {
  const { downloadGeneratedMedia } = await load(); let calls = 0, failure;
  try {
    await downloadGeneratedMedia(url, opts(async () => {
      calls++;
      if (kind === 'network') throw new Error(url);
      if (kind === 'redirect') return new Response(null, { status: 302, headers: { Location: 'https://127.0.0.1/a' } });
      if (kind === 'http') return new Response(url, { status: 403 });
      if (kind === 'empty') return new Response(new Uint8Array());
      return new Response(bytes, { headers: { 'Content-Length': String(bytes.length + 10) } });
    }));
  } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(Error); expect(failure.message).not.toContain('signature'); expect(calls).toBe(1);
});

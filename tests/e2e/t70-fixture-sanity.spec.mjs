import { test, expect } from '@playwright/test';
import { setupLearning, progressRecord, coursePointer, key, ownerA, stallBody } from '../fixtures/t70-learning-browser.mjs';

test.use({ locale: 'zh-CN' });

test('T70 fixture sanity only: Request-shaped writes follow version and equal-retry semantics', async ({ page, context, baseURL }) => {
  const { state } = await setupLearning(page, context, baseURL, { progress: progressRecord() }); await page.goto('/');
  const put = position => page.evaluate(async ({ course, position }) => {
    const response = await fetch(new Request(new URL('/api/scene-progress', location.href), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ course, position, expectedVersion: 4 }) }));
    return { status: response.status, body: await response.json() };
  }, { course: coursePointer, position });
  const position = { page: 'sentences', time: 6.4, turnIndex: 0 };
  const saved = await put(position); expect(saved.status).toBe(200); expect(saved.body.progress.version).toBe(5);
  expect(await put(position)).toEqual(saved); expect(await put({ turnIndex: 0, time: 6.4, page: 'sentences' })).toEqual(saved);
  expect((await put({ ...position, time: 7 })).status).toBe(409);
  expect(state.progress[key(ownerA)]).toEqual(saved.body.progress);
});

test('T70 fixture sanity only: the partial JSON body waits until an explicit abort after GET or Request PUT headers', async ({ page, context, baseURL }) => {
  await stallBody(page, '/no-target'); const { state } = await setupLearning(page, context, baseURL); await page.goto('/');
  const control = await page.evaluate(async () => {
    let stream; const response = new Response(new ReadableStream({ start(controller) { stream = controller; controller.enqueue(new TextEncoder().encode('{')); } }));
    const read = response.json(); stream.error(new DOMException('Synthetic control abort', 'AbortError'));
    try { await read; return { status: 'resolved' }; } catch (error) { return { status: 'rejected', name: error.name, message: error.message }; }
  });
  expect(control.status).toBe('rejected'); console.log('T70 native Response stream-error control', control);
  for (const [pathname, method] of [['/api/learning-library', 'GET'], ['/api/generated-courses', 'GET'], ['/api/scene-progress', 'GET'], ['/api/scene-progress', 'PUT']]) {
    const before = await page.evaluate(() => window.t70BodyStalls);
    await page.evaluate(({ pathname, method, course }) => {
      window.t70BodyTarget = { pathname, method }; window.t70InjectedResult = null; window.t70InjectedAbort = new AbortController();
      const url = new URL(pathname, location.href);
      if (method === 'GET' && pathname !== '/api/learning-library') url.search = new URLSearchParams(Object.entries(course).map(([key, value]) => [key, String(value)]));
      const request = new Request(url, { method, signal: window.t70InjectedAbort.signal, ...(method === 'PUT' ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ course, expectedVersion: 0, position: { page: 'watch', time: 1, turnIndex: 0 } }) } : {}) });
      void fetch(request).then(response => response.json()).then(() => { window.t70InjectedResult = { status: 'resolved' }; }, error => { window.t70InjectedResult = { status: 'rejected', name: error.name, message: error.message }; });
    }, { pathname, method, course: coursePointer });
    await expect.poll(() => page.evaluate(() => window.t70BodyStalls)).toBe(before + 1);
    expect(await page.evaluate(() => window.t70InjectedResult)).toBeNull(); await page.evaluate(() => window.t70InjectedAbort.abort());
    expect(await page.evaluate(() => window.t70InjectedAbort.signal.aborted)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.t70InjectedResult?.status)).toBe('rejected');
    expect(await page.evaluate(() => window.t70BodyAborts)).toBe(before + 1);
  }
  expect(await page.evaluate(() => window.t70BodyAborts)).toBe(4); expect(state.progress[key(ownerA)].version).toBe(1);
});

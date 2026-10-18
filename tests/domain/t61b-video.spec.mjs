import { test, expect } from '@playwright/test';
const load = () => import('../../lib/generated-video.ts');
const input = () => ({ audioUri: 'https://assets.example.invalid/audio.wav', duration: 12, prompt: 'One fictional adult speaks to the viewer at a birthday party.' });

test('T61B video: disabled by default despite request approval', async () => {
  const { submitVideoSegment } = await load(); let calls = 0;
  await expect(submitVideoSegment({ ...input(), approved: true }, { apiKey: 'synthetic', fetch: async () => { calls++; return Response.json({ id: 'job-a' }, { status: 202 }); } })).rejects.toThrow();
  expect(calls).toBe(0);
});

test('T61B video: explicit fixed parameters submit once and return pending, never ready', async () => {
  const { submitVideoSegment } = await load(); let calls = 0;
  const result = await submitVideoSegment(input(), { enabled: true, apiKey: 'synthetic', fetch: async (url, options) => {
    calls++; expect(url).toBe('https://api.ltx.io/v2/audio-to-video'); expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ audio_uri: input().audioUri, prompt: input().prompt, model: 'ltx-2-5-fast', resolution: '720x1280', fps: 24, camera_motion: 'static' }); // C14-3: fixed camera
    expect(options.redirect).toBe('error'); expect(options.signal).toBeTruthy();
    return Response.json({ id: 'job-a', created_at: '2026-09-26T00:00:00Z' }, { status: 202 });
  } });
  expect(result).toEqual({ jobId: 'job-a', status: 'pending' }); expect(calls).toBe(1);
});

for (const value of [0, 20.01, NaN]) test(`T61B video: invalid duration ${value} sends nothing`, async () => {
  const { submitVideoSegment } = await load(); let calls = 0;
  await expect(submitVideoSegment({ ...input(), duration: value }, { enabled: true, apiKey: 'synthetic', fetch: async () => { calls++; return Response.json({ id: 'job-a' }, { status: 202 }); } })).rejects.toThrow();
  expect(calls).toBe(0);
});

for (const kind of ['timeout', 'http', 'missing-id']) test(`T61B video: ${kind} is unknown submission, no automatic retry`, async () => {
  const { submitVideoSegment } = await load(); let calls = 0;
  const result = await submitVideoSegment(input(), { enabled: true, apiKey: 'synthetic', fetch: async () => {
    calls++; if (kind === 'timeout') throw new Error('private upstream data');
    return kind === 'http' ? new Response('private upstream data', { status: 500 }) : Response.json({}, { status: 202 });
  } });
  expect(result).toEqual({ status: 'submission_unknown' }); expect(calls).toBe(1);
});

for (const status of ['pending', 'processing', 'failed', 'completed']) test(`T61B video: query ${status} uses original ID with no POST or download`, async () => {
  const { queryVideoSegment } = await load(); const calls = [];
  const result = await queryVideoSegment('job-a', { enabled: true, apiKey: 'synthetic', fetch: async (url, options) => {
    calls.push(url); expect(url).toBe('https://api.ltx.io/v2/audio-to-video/job-a'); expect(options.method).toBe('GET');
    return Response.json({ id: 'job-a', status, result: status === 'completed' ? { video_url: 'https://assets.example.invalid/video.mp4' } : undefined, error: status === 'failed' ? { message: 'private upstream data' } : undefined });
  } });
  expect(result).toEqual(status === 'completed' ? { jobId: 'job-a', status, videoUrl: 'https://assets.example.invalid/video.mp4' } : { jobId: 'job-a', status });
  expect(calls).toHaveLength(1);
});

for (const body of [{ id: 'other-job', status: 'pending' }, { id: 'job-a', status: 'completed' }, { id: 'job-a', status: 'unrecognized' }, { id: 'job-a', status: 'completed', result: { video_url: 'file:///private/example.mp4' } }]) test(`T61B video: invalid query result ${JSON.stringify(body)} rejects`, async () => {
  const { queryVideoSegment } = await load(); let calls = 0;
  await expect(queryVideoSegment('job-a', { enabled: true, apiKey: 'synthetic', fetch: async () => { calls++; return Response.json(body); } })).rejects.toThrow();
  expect(calls).toBe(1);
});

test('T61B video: disabled polling and path-injection ID never reach transport', async () => {
  const { queryVideoSegment } = await load(); let calls = 0;
  const transport = async () => { calls++; return Response.json({ id: 'job-a', status: 'pending' }); };
  await expect(queryVideoSegment('job-a', { apiKey: 'synthetic', fetch: transport })).rejects.toThrow();
  await expect(queryVideoSegment('../other?key=bad', { enabled: true, apiKey: 'synthetic', fetch: transport })).rejects.toThrow();
  expect(calls).toBe(0);
});

test('T61B video: invalid audio URI or empty prompt never submits', async () => {
  const { submitVideoSegment } = await load(); let calls = 0;
  for (const item of [{ ...input(), audioUri: 'file:///private/audio.wav' }, { ...input(), prompt: ' ' }, { ...input(), prompt: 'x'.repeat(5001) }]) await expect(submitVideoSegment(item, { enabled: true, apiKey: 'synthetic', fetch: async () => { calls++; return Response.json({ id: 'job-a' }, { status: 202 }); } })).rejects.toThrow();
  expect(calls).toBe(0);
});

test('T61B video: query failures do not resubmit and do not expose provider details', async () => {
  const { queryVideoSegment } = await load();
  for (const kind of ['http', 'timeout', 'json']) {
    let calls = 0, failure;
    try {
      await queryVideoSegment('job-a', { enabled: true, apiKey: 'synthetic', fetch: async (_url, options) => {
        calls++; expect(options.method).toBe('GET');
        if (kind === 'timeout') throw new Error('private-upstream-marker');
        return new Response('private-upstream-marker', { status: kind === 'http' ? 500 : 200 });
      } });
    } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).not.toContain('private-upstream-marker'); expect(calls).toBe(1);
  }
});

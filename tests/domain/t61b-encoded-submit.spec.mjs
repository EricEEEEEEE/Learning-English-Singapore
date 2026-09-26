import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
const bytes = Buffer.from('synthetic verified AAC bytes');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const input = () => ({ audio: { bytes, sha256, sourceSha256: 'b'.repeat(64), sourceDuration: 12, duration: 12, mimeType: 'audio/mp4', decoded: true }, prompt: 'A fictional adult greets the viewer.' });
const load = () => import('../../lib/generated-video.ts');

test('T61B encoded submit: sends exact reviewed audio as data URI once without exposing a public asset', async () => {
  const { submitEncodedVideoSegment } = await load(); let calls = 0;
  const result = await submitEncodedVideoSegment(input(), { enabled: true, apiKey: 'synthetic', reviewedSha256: sha256, fetch: async (url, options) => {
    calls++; expect(url).toBe('https://api.ltx.io/v2/audio-to-video');
    const body = JSON.parse(options.body);
    expect(body.audio_uri).toBe(`data:audio/mp4;base64,${bytes.toString('base64')}`);
    expect(body.model).toBe('ltx-2-5-fast'); expect(body.resolution).toBe('720x1280'); expect(body.fps).toBe(24);
    expect(body.prompt).toBe(input().prompt); expect(options.redirect).toBe('error');
    return Response.json({ id: 'synthetic-job' }, { status: 202 });
  } });
  expect(result).toEqual({ status: 'pending', jobId: 'synthetic-job' }); expect(calls).toBe(1);
});

for (const fault of ['disabled', 'unreviewed', 'changed-bytes', 'undecoded', 'pcm', 'too-long', 'oversize']) test(`T61B encoded submit: ${fault} sends no request`, async () => {
  const { submitEncodedVideoSegment } = await load(); const value = input(); let calls = 0;
  if (fault === 'changed-bytes') value.audio.bytes = Buffer.from('different');
  if (fault === 'undecoded') value.audio.decoded = false;
  if (fault === 'pcm') value.audio.mimeType = 'audio/wav';
  if (fault === 'too-long') value.audio.duration = 20.01;
  if (fault === 'oversize') { value.audio.bytes = Buffer.alloc(11_250_001); value.audio.sha256 = createHash('sha256').update(value.audio.bytes).digest('hex'); }
  await expect(submitEncodedVideoSegment(value, { enabled: fault !== 'disabled', apiKey: 'synthetic', reviewedSha256: fault === 'unreviewed' ? 'c'.repeat(64) : value.audio.sha256, fetch: async () => { calls++; return Response.json({ id: 'unexpected' }, { status: 202 }); } })).rejects.toThrow();
  expect(calls).toBe(0);
});

test('T61B encoded submit: uncertain response stays unknown and is never retried', async () => {
  const { submitEncodedVideoSegment } = await load(); let calls = 0;
  const result = await submitEncodedVideoSegment(input(), { enabled: true, apiKey: 'synthetic', reviewedSha256: sha256, fetch: async () => { calls++; throw new Error('synthetic provider details'); } });
  expect(result).toEqual({ status: 'submission_unknown' }); expect(calls).toBe(1);
});

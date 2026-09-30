import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const audio = () => { const bytes = Buffer.from('synthetic reviewed AAC'); return { bytes, sha256: hash(bytes), sourceSha256: 'a'.repeat(64), sourceDuration: 2, duration: 2, mimeType: 'audio/mp4', decoded: true }; };
const reference = () => ({ bytes: Buffer.from(png), sha256: hash(png), mimeType: 'image/png' });

test('T61B reference image: exact verified image bytes accompany reviewed audio in one submission', async () => {
  const { submitEncodedVideoSegment } = await import('../../lib/generated-video.ts');
  const a = audio(), image = reference(); let calls = 0;
  const result = await submitEncodedVideoSegment({ audio: a, prompt: 'Synthetic parent listens.', referenceImage: image }, {
    enabled: true, apiKey: 'synthetic', reviewedSha256: a.sha256,
    fetch: async (_url, init) => {
      calls++; const body = JSON.parse(init.body);
      expect(body.image_uri).toBe(`data:image/png;base64,${png.toString('base64')}`);
      expect(body.audio_uri).toBe(`data:audio/mp4;base64,${a.bytes.toString('base64')}`);
      expect(body.model).toBe('ltx-2-5-fast'); expect(body.resolution).toBe('720x1280');
      return Response.json({ id: 'synthetic-job' }, { status: 202 });
    },
  });
  expect(result).toEqual({ status: 'pending', jobId: 'synthetic-job' }); expect(calls).toBe(1);
});

for (const fault of ['hash', 'empty', 'mime', 'signature', 'encoded-limit']) test(`T61B reference image: rejects ${fault} before any request`, async () => {
  const { submitEncodedVideoSegment } = await import('../../lib/generated-video.ts');
  const a = audio(), image = reference(); let calls = 0;
  if (fault === 'hash') image.sha256 = '0'.repeat(64);
  if (fault === 'empty') { image.bytes = Buffer.alloc(0); image.sha256 = hash(image.bytes); }
  if (fault === 'mime') image.mimeType = 'image/svg+xml';
  if (fault === 'signature') { image.bytes = Buffer.from('not a PNG'); image.sha256 = hash(image.bytes); }
  if (fault === 'encoded-limit') { image.bytes = Buffer.alloc(5_250_000); png.copy(image.bytes); image.sha256 = hash(image.bytes); }
  await expect(submitEncodedVideoSegment({ audio: a, prompt: 'Synthetic', referenceImage: image }, { enabled: true, apiKey: 'synthetic', reviewedSha256: a.sha256, fetch: async () => { calls++; return Response.json({ id: 'unexpected' }, { status: 202 }); } })).rejects.toThrow();
  expect(calls).toBe(0);
});

test('T61B reference image: absent optional image preserves audio-only requests', async () => {
  const { submitEncodedVideoSegment } = await import('../../lib/generated-video.ts'); const a = audio();
  const result = await submitEncodedVideoSegment({ audio: a, prompt: 'Synthetic' }, { enabled: true, apiKey: 'synthetic', reviewedSha256: a.sha256, fetch: async (_url, init) => {
    expect(JSON.parse(init.body)).not.toHaveProperty('image_uri'); return Response.json({ id: 'audio-only' }, { status: 202 });
  } });
  expect(result).toEqual({ status: 'pending', jobId: 'audio-only' });
});

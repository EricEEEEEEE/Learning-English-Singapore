import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, access } from 'node:fs/promises';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const source = () => ({ bytes: Buffer.from(png), sha256: hash(png), mimeType: 'image/png' });
const load = () => import('../../lib/verify-reference-image.ts');

for (const fault of ['none', 'codec', 'dimensions', 'extra-stream', 'decode', 'stderr']) test(`T61B reference decode: ${fault}`, async () => {
  const { verifyReferenceImage } = await load(); const paths = []; let probes = 0, decodes = 0;
  const promise = verifyReferenceImage(source(), { ffprobe: '/synthetic/ffprobe', ffmpeg: '/synthetic/ffmpeg', execute: async (exe, args, settings) => {
    expect(settings.shell).toBe(false); expect(settings.timeout).toBeLessThanOrEqual(60000);
    expect(args[args.indexOf('-protocol_whitelist') + 1]).toBe('file');
    const path = exe.endsWith('ffprobe') ? args.at(-1) : args[args.indexOf('-i') + 1];
    paths.push(path); expect(await readFile(path)).toEqual(png);
    if (exe.endsWith('ffprobe')) {
      probes++; const streams = [{ codec_type: 'video', codec_name: 'png', width: 720, height: 1280 }];
      if (fault === 'codec') streams[0].codec_name = 'mjpeg';
      if (fault === 'dimensions') streams[0].width = 100000;
      if (fault === 'extra-stream') streams.push({ codec_type: 'audio' });
      return { stdout: JSON.stringify({ streams }), stderr: fault === 'stderr' ? 'invalid data' : '' };
    }
    decodes++; expect(args).toContain('-xerror');
    if (fault === 'decode') throw new Error('synthetic private decoder error');
    return { stdout: '', stderr: '' };
  } });
  if (fault === 'none') {
    const value = await promise; expect(value).toMatchObject({ sha256: hash(png), mimeType: 'image/png', width: 720, height: 1280, decoded: true });
    expect(Buffer.from(value.bytes)).toEqual(png); expect([probes, decodes]).toEqual([1, 1]);
  } else {
    await expect(promise).rejects.toThrow();
    if (fault !== 'decode') expect(decodes).toBe(0);
  }
  for (const path of paths) await expect(access(path)).rejects.toThrow();
});

test('T61B reference decode: corrupt hash makes zero local tool calls', async () => {
  const { verifyReferenceImage } = await load(); let calls = 0;
  await expect(verifyReferenceImage({ ...source(), sha256: '0'.repeat(64) }, { ffprobe: '/synthetic/ffprobe', ffmpeg: '/synthetic/ffmpeg', execute: async () => { calls++; return { stdout: '', stderr: '' }; } })).rejects.toThrow();
  expect(calls).toBe(0);
});

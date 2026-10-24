import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sources = () => ['first approved segment', 'second approved segment'].map(text => {
  const bytes = Buffer.from(text); return { bytes, sha256: hash(bytes) };
});

test('T61B CFR concat: explicit verified duration normalizes frame rate and preserves input bytes', async () => {
  const { concatVideoBytes } = await import('../../lib/concat-video-bytes.ts');
  const input = sources(), output = Buffer.from('normalized fixture'); let directory;
  const result = await concatVideoBytes(input, { executable: '/synthetic/ffmpeg', normalizeDuration: 34.017,
    execute: async (_file, args, settings) => {
      expect(settings.shell).toBe(false);
      const manifest = args[args.indexOf('-i') + 1]; directory = dirname(manifest);
      for (let i = 0; i < input.length; i++) expect(await readFile(join(directory, `segment-${i}.mp4`))).toEqual(input[i].bytes);
      // C15-4i: the picture also stops at the last whole frame inside the length (34.017 s = 816.4 frames -> 816).
      expect(args[args.indexOf('-vf') + 1]).toMatch(/^fps=24(,trim=end_frame=816)?$/);
      expect(args[args.indexOf('-af') + 1]).toBe('apad');
      expect(args[args.indexOf('-t') + 1]).toBe('34.017');
      expect(args[args.indexOf('-c:v') + 1]).toBe('libx264');
      expect(args[args.indexOf('-c:a') + 1]).toBe('aac');
      expect(args).not.toContain('copy');
      await writeFile(args.at(-1), output); return { stdout: '', stderr: '' };
    } });
  expect(Buffer.from(result.bytes)).toEqual(output); expect(result.sha256).toBe(hash(output));
  await expect(access(directory)).rejects.toThrow();
});

for (const duration of [0, -1, 61, NaN, Infinity, '34.017']) test(`T61B CFR concat: invalid requested duration ${duration} rejects before tools`, async () => {
  const { concatVideoBytes } = await import('../../lib/concat-video-bytes.ts'); let calls = 0;
  await expect(concatVideoBytes(sources(), { executable: '/synthetic/ffmpeg', normalizeDuration: duration,
    execute: async (_file, args) => { calls++; await writeFile(args.at(-1), 'output'); return { stdout: '', stderr: '' }; }
  })).rejects.toThrow();
  expect(calls).toBe(0);
});

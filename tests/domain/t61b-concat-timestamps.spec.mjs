import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

// Native FFmpeg experiment: without copyts the hotel pair starts video at .041992s.
// copyts + disabled automatic shifting yields both starts 0 and duration 24.084s.
test('T61B concat timestamps: preserve original packet timestamps including AAC priming instead of shifting video', async () => {
  const { concatVideoBytes } = await import('../../lib/concat-video-bytes.ts');
  const bytes = Buffer.from('synthetic input'); const sha256 = createHash('sha256').update(bytes).digest('hex');
  let invocation;
  await concatVideoBytes([{ bytes, sha256 }], { executable: '/synthetic/ffmpeg', execute: async (_executable, args) => {
    invocation = args;
    await writeFile(args.at(-1), 'synthetic output'); return { stdout: '', stderr: '' };
  } });
  expect(invocation).toContain('-copyts');
  expect(invocation.indexOf('-copyts')).toBeLessThan(invocation.indexOf('-i'));
  expect(invocation).toContain('-avoid_negative_ts');
  expect(invocation[invocation.indexOf('-avoid_negative_ts') + 1]).toBe('disabled');
  expect(invocation).not.toContain('-start_at_zero');
});

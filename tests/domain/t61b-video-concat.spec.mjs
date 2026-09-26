import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
const load = () => import('../../lib/concat-video-bytes.ts');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const source = () => ['first synthetic clip', 'second synthetic clip'].map(text => { const bytes = Buffer.from(text); return { bytes, sha256: hash(bytes) }; });

test('T61B concat: stages exact segments in order, invokes bounded local process and returns hashed bytes', async () => {
  const { concatVideoBytes } = await load(); const segments = source(), output = Buffer.from('synthetic concatenated transport bytes'); let directory;
  const result = await concatVideoBytes(segments, { executable: '/synthetic/ffmpeg', execute: async (executable, args, options) => {
    expect(executable).toBe('/synthetic/ffmpeg'); expect(options.shell).toBe(false);
    expect(options.timeout).toBeGreaterThan(0); expect(options.timeout).toBeLessThanOrEqual(60000);
    expect(options.maxBuffer).toBeLessThanOrEqual(1_000_000);
    expect(args).toContain('-nostdin'); expect(args).toContain('-protocol_whitelist');
    expect(args[args.indexOf('-protocol_whitelist') + 1]).toBe('file');
    expect(args[args.indexOf('-f') + 1]).toBe('concat'); expect(args[args.indexOf('-safe') + 1]).toBe('1');
    const manifest = args[args.indexOf('-i') + 1]; directory = dirname(manifest);
    expect(await readFile(manifest, 'utf8')).toBe("file 'segment-0.mp4'\nfile 'segment-1.mp4'\n");
    expect(await readFile(join(directory, 'segment-0.mp4'))).toEqual(segments[0].bytes);
    expect(await readFile(join(directory, 'segment-1.mp4'))).toEqual(segments[1].bytes);
    await writeFile(args.at(-1), output); return { stdout: '', stderr: '' };
  } });
  expect(Buffer.from(result.bytes)).toEqual(output); expect(result.sha256).toBe(hash(output));
  await expect(access(directory)).rejects.toThrow();
});

test('T61B concat: corrupt input makes zero process calls', async () => {
  const { concatVideoBytes } = await load(); let calls = 0; const segments = source(); segments[1].sha256 = '0'.repeat(64);
  await expect(concatVideoBytes(segments, { executable: '/synthetic/ffmpeg', execute: async () => { calls++; return { stdout: '', stderr: '' }; } })).rejects.toThrow();
  expect(calls).toBe(0);
});

for (const mode of ['process-failure', 'missing-output', 'empty-output']) test(`T61B concat: ${mode} does not return media and cleans temporary inputs`, async () => {
  const { concatVideoBytes } = await load(); let directory;
  await expect(concatVideoBytes(source(), { executable: '/synthetic/ffmpeg', execute: async (_executable, args) => {
    directory = dirname(args.at(-1));
    if (mode === 'process-failure') throw new Error('synthetic private process details');
    if (mode === 'empty-output') await writeFile(args.at(-1), '');
    return { stdout: '', stderr: '' };
  } })).rejects.toThrow();
  expect(directory).toBeTruthy(); await expect(access(directory)).rejects.toThrow();
});

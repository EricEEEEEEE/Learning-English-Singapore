import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, writeFile, access } from 'node:fs/promises';
import { dirname } from 'node:path';
const load = () => import('../../lib/repair-video-tail-bytes.ts');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const asset = text => { const bytes = Buffer.from(text); return { bytes, sha256: hash(bytes) }; };
const input = () => ({ video: asset('original video'), audio: asset('complete approved wav'), timing: {
  sourceAudioDuration: 16.25, videoDuration: 16.041667, videoStart: 0, audioStart: 0, fps: 24, width: 720, height: 1280,
} });

test('T61B tail bytes: preserves originals and replaces audio while holding only the short tail', async () => {
  const { repairVideoTailBytes } = await load(); const source = input(), before = structuredClone(source);
  const output = Buffer.from('repaired synthetic bytes'); let directory;
  const result = await repairVideoTailBytes(source, { executable: '/synthetic/ffmpeg', execute: async (file, args, settings) => {
    expect(file).toBe('/synthetic/ffmpeg'); expect(settings.shell).toBe(false);
    expect(settings.timeout).toBeGreaterThan(0); expect(settings.timeout).toBeLessThanOrEqual(60000);
    expect(settings.maxBuffer).toBeLessThanOrEqual(1_000_000);
    expect(args).toContain('-nostdin'); expect(args).toContain('-n');
    const paths = args.flatMap((value, index) => value === '-i' ? [args[index + 1]] : []);
    expect(paths).toHaveLength(2); directory = dirname(paths[0]);
    expect(await readFile(paths[0])).toEqual(source.video.bytes);
    expect(await readFile(paths[1])).toEqual(source.audio.bytes);
    expect(args.flatMap((value, index) => value === '-map' ? [args[index + 1]] : [])).toEqual(['0:v:0', '1:a:0']);
    expect(args[args.indexOf('-vf') + 1]).toMatch(/^tpad=stop_mode=clone:stop_duration=0\.20833/);
    expect(args[args.indexOf('-t') + 1]).toBe('16.25');
    expect(args.filter(value => value === '-protocol_whitelist')).toHaveLength(2);
    for (let i = 0; i < args.length; i++) if (args[i] === '-protocol_whitelist') expect(args[i + 1]).toBe('file');
    await writeFile(args.at(-1), output); return { stdout: '', stderr: '' };
  } });
  expect(Buffer.from(result.bytes)).toEqual(output); expect(result.sha256).toBe(hash(output));
  expect(source.video.bytes).toEqual(Buffer.from(before.video.bytes));
  expect(source.audio.bytes).toEqual(Buffer.from(before.audio.bytes));
  await expect(access(directory)).rejects.toThrow();
});

for (const mode of ['video-integrity', 'audio-integrity', 'excess-tail', 'relative-executable']) test(`T61B tail bytes: rejects ${mode} before execution`, async () => {
  const { repairVideoTailBytes } = await load(); const source = input(); let calls = 0;
  if (mode === 'video-integrity') source.video.sha256 = '0'.repeat(64);
  if (mode === 'audio-integrity') source.audio.sha256 = '0'.repeat(64);
  if (mode === 'excess-tail') source.timing.videoDuration = 15;
  await expect(repairVideoTailBytes(source, { executable: mode === 'relative-executable' ? 'ffmpeg' : '/synthetic/ffmpeg', execute: async () => { calls++; return { stdout: '', stderr: '' }; } })).rejects.toThrow();
  expect(calls).toBe(0);
});

for (const mode of ['process-error', 'missing-output', 'empty-output', 'stderr-error']) test(`T61B tail bytes: ${mode} fails closed and cleans temporary files`, async () => {
  const { repairVideoTailBytes } = await load(); let directory;
  await expect(repairVideoTailBytes(input(), { executable: '/synthetic/ffmpeg', execute: async (_file, args) => {
    directory = dirname(args.at(-1));
    if (mode === 'process-error') throw new Error('private process detail');
    if (mode === 'empty-output') await writeFile(args.at(-1), '');
    if (mode === 'stderr-error') await writeFile(args.at(-1), 'incomplete');
    return { stdout: '', stderr: mode === 'stderr-error' ? 'decode error' : '' };
  } })).rejects.toThrow();
  expect(directory).toBeTruthy(); await expect(access(directory)).rejects.toThrow();
});

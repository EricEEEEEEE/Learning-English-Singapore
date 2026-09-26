import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, stat, access } from 'node:fs/promises';
const load = () => import('../../lib/probe-video-bytes.ts');
const bytes = Buffer.from('synthetic transport fixture, not an actual MP4');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const input = () => ({ bytes, sha256, expectedDuration: 12 });
const report = () => ({ format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '12' }, streams: [
  { codec_type: 'video', codec_name: 'h264', width: 720, height: 1280, avg_frame_rate: '24/1', duration: '12', disposition: { attached_pic: 0 } },
  { codec_type: 'audio', codec_name: 'aac', sample_rate: '48000', channels: 2, duration: '12' },
] });

test('T61B probe runner: probes exact private bytes without shell/network and binds hash', async () => {
  const { probeVideoBytes } = await load(); let path, calls = 0;
  const result = await probeVideoBytes(input(), { executable: '/synthetic/ffprobe', execute: async (executable, args, options) => {
    calls++; expect(executable).toBe('/synthetic/ffprobe');
    expect(options.shell).toBe(false); expect(options.timeout).toBeGreaterThan(0); expect(options.timeout).toBeLessThanOrEqual(30000);
    expect(options.maxBuffer).toBeLessThanOrEqual(1_000_000);
    expect(args).toContain('-protocol_whitelist'); expect(args[args.indexOf('-protocol_whitelist') + 1]).toBe('file');
    expect(args).toContain('-show_streams'); expect(args).toContain('-show_format');
    path = args.at(-1); expect(await readFile(path)).toEqual(bytes);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    return { stdout: JSON.stringify(report()), stderr: '' };
  } });
  expect(calls).toBe(1); expect(result).toMatchObject({ sha256, duration: 12, width: 720, height: 1280 });
  expect(JSON.stringify(result)).not.toContain(path);
  await expect(access(path)).rejects.toThrow();
});

test('T61B probe runner: corrupted input never invokes executable', async () => {
  const { probeVideoBytes } = await load(); let calls = 0;
  await expect(probeVideoBytes({ ...input(), sha256: '0'.repeat(64) }, { executable: '/synthetic/ffprobe', execute: async () => { calls++; return { stdout: JSON.stringify(report()), stderr: '' }; } })).rejects.toThrow();
  expect(calls).toBe(0);
});

for (const kind of ['process-failure', 'invalid-json', 'invalid-report']) test(`T61B probe runner: ${kind} fails closed and removes own temporary file`, async () => {
  const { probeVideoBytes } = await load(); let path;
  await expect(probeVideoBytes(input(), { executable: '/synthetic/ffprobe', execute: async (_executable, args) => {
    path = args.at(-1);
    if (kind === 'process-failure') throw new Error('synthetic-private-tool-details');
    return { stdout: kind === 'invalid-json' ? 'bad' : '{}', stderr: '' };
  } })).rejects.toThrow();
  expect(path).toBeTruthy(); await expect(access(path)).rejects.toThrow();
});

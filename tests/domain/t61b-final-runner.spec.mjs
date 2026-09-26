import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, access } from 'node:fs/promises';
const load = () => import('../../lib/verify-final-video.ts');
const bytes = Buffer.from('synthetic final video transport');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const input = () => ({ bytes, sha256, plan: { sourceDuration: 24, segmentDurations: [12.042, 12.042] } });
const report = () => ({ format: { format_name: 'mov,mp4', start_time: '0', duration: '24.084' }, streams: [
  { codec_type: 'video', codec_name: 'h264', width: 720, height: 1280, avg_frame_rate: '1775616/73985', duration: '24.083659', start_time: '0', disposition: { attached_pic: 0 } },
  { codec_type: 'audio', codec_name: 'aac', profile: 'LC', sample_rate: '24000', channels: 1, duration: '24.029', start_time: '0' },
] });

test('T61B final runner: probes and fully decodes exact hashed bytes before returning verification', async () => {
  const { verifyFinalVideo } = await load(); const calls = []; let path;
  const result = await verifyFinalVideo(input(), { ffprobe: '/synthetic/ffprobe', ffmpeg: '/synthetic/ffmpeg', execute: async (exe, args, options) => {
    calls.push(exe); expect(options.shell).toBe(false); expect(options.timeout).toBeLessThanOrEqual(60000); expect(options.maxBuffer).toBeLessThanOrEqual(1_000_000);
    expect(args).toContain('-protocol_whitelist'); expect(args[args.indexOf('-protocol_whitelist') + 1]).toBe('file');
    if (exe.endsWith('ffprobe')) { path = args.at(-1); expect(await readFile(path)).toEqual(bytes); return { stdout: JSON.stringify(report()), stderr: '' }; }
    expect(args).toContain('-xerror'); expect(args).toContain('-nostdin'); expect(args[args.indexOf('-i') + 1]).toBe(path);
    expect(args.slice(-3)).toEqual(['-f', 'null', '-']);
    return { stdout: '', stderr: '' };
  } });
  expect(calls).toEqual(['/synthetic/ffprobe', '/synthetic/ffmpeg']);
  expect(result).toMatchObject({ sha256, duration: 24.084, decoded: true });
  await expect(access(path)).rejects.toThrow();
});

for (const failure of ['hash', 'report', 'decode']) test(`T61B final runner: ${failure} failure cannot yield verified output`, async () => {
  const { verifyFinalVideo } = await load(); let calls = 0, path;
  await expect(verifyFinalVideo({ ...input(), sha256: failure === 'hash' ? '0'.repeat(64) : sha256 }, { ffprobe: '/synthetic/ffprobe', ffmpeg: '/synthetic/ffmpeg', execute: async (exe, args) => {
    calls++;
    if (exe.endsWith('ffprobe')) { path = args.at(-1); return { stdout: JSON.stringify(failure === 'report' ? {} : report()), stderr: '' }; }
    throw new Error('synthetic private decoder details');
  } })).rejects.toThrow();
  expect(calls).toBe(failure === 'hash' ? 0 : failure === 'report' ? 1 : 2);
  if (path) await expect(access(path)).rejects.toThrow();
});

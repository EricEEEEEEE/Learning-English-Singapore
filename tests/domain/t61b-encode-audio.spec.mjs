import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, writeFile, access } from 'node:fs/promises';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function input() {
  const bytes = Buffer.alloc(48044);
  bytes.write('RIFF'); bytes.writeUInt32LE(48036, 4); bytes.write('WAVE', 8);
  bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(24000, 24); bytes.writeUInt32LE(48000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(48000, 40);
  return { bytes, sha256: digest(bytes) };
}
const encoded = Buffer.from('synthetic compressed audio');
const report = () => ({ format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', start_time: '0', duration: '1.04' }, streams: [{ codec_type: 'audio', codec_name: 'aac', profile: 'LC', sample_rate: '24000', channels: 1, start_time: '0', duration: '1.04' }] });

test('T61B audio encode: binds PCM source to probed and fully decoded AAC-LC bytes', async () => {
  const { encodeVideoAudio } = await import('../../lib/encode-video-audio.ts');
  const source = input(), paths = []; let count = 0;
  const result = await encodeVideoAudio(source, { ffmpeg: '/synthetic/ffmpeg', ffprobe: '/synthetic/ffprobe', execute: async (exe, args, options) => {
    count++;
    expect(options.shell).toBe(false); expect(options.timeout).toBeLessThanOrEqual(60000); expect(options.maxBuffer).toBeLessThanOrEqual(1_000_000);
    expect(args[args.indexOf('-protocol_whitelist') + 1]).toBe('file');
    if (count === 1) {
      expect(exe).toBe('/synthetic/ffmpeg');
      const sourcePath = args[args.indexOf('-i') + 1], output = args.at(-1); paths.push(sourcePath, output);
      expect(await readFile(sourcePath)).toEqual(source.bytes);
      expect(args[args.indexOf('-c:a') + 1]).toBe('aac');
      expect(args[args.indexOf('-profile:a') + 1]).toBe('aac_low');
      await writeFile(output, encoded); return { stdout: '', stderr: '' };
    }
    if (count === 2) { expect(exe).toBe('/synthetic/ffprobe'); expect(args.at(-1)).toBe(paths[1]); return { stdout: JSON.stringify(report()), stderr: '' }; }
    expect(exe).toBe('/synthetic/ffmpeg'); expect(args).toContain('-xerror'); expect(args[args.indexOf('-i') + 1]).toBe(paths[1]);
    return { stdout: '', stderr: '' };
  } });
  expect(count).toBe(3);
  expect(result).toMatchObject({ sourceSha256: source.sha256, sourceDuration: 1, sha256: digest(encoded), duration: 1.04, mimeType: 'audio/mp4', decoded: true });
  expect(Buffer.from(result.bytes)).toEqual(encoded);
  for (const path of paths) await expect(access(path)).rejects.toThrow();
});

test('T61B audio encode: invalid source hash prevents any execution', async () => {
  const { encodeVideoAudio } = await import('../../lib/encode-video-audio.ts'); let calls = 0;
  await expect(encodeVideoAudio({ ...input(), sha256: '0'.repeat(64) }, { ffmpeg: '/synthetic/ffmpeg', ffprobe: '/synthetic/ffprobe', execute: async () => { calls++; return { stdout: '', stderr: '' }; } })).rejects.toThrow();
  expect(calls).toBe(0);
});

for (const fault of ['pcm', 'offset', 'duration', 'decode']) test(`T61B audio encode: rejects ${fault} and cleans temporary output`, async () => {
  const { encodeVideoAudio } = await import('../../lib/encode-video-audio.ts'); let count = 0; const paths = [];
  await expect(encodeVideoAudio(input(), { ffmpeg: '/synthetic/ffmpeg', ffprobe: '/synthetic/ffprobe', execute: async (_exe, args) => {
    count++;
    if (count === 1) { paths.push(args[args.indexOf('-i') + 1], args.at(-1)); await writeFile(args.at(-1), encoded); return { stdout: '', stderr: '' }; }
    const value = report();
    if (fault === 'pcm') value.streams[0].codec_name = 'pcm_s16le';
    if (fault === 'offset') value.streams[0].start_time = '0.1';
    if (fault === 'duration') { value.format.duration = '21'; value.streams[0].duration = '21'; }
    if (count === 2) return { stdout: JSON.stringify(value), stderr: '' };
    throw new Error('synthetic decode failure');
  } })).rejects.toThrow();
  expect(count).toBe(fault === 'decode' ? 3 : 2);
  for (const path of paths) await expect(access(path)).rejects.toThrow();
});

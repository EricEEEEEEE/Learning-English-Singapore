import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, writeFile, access } from 'node:fs/promises';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const video = Buffer.from('synthetic source video');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const sourceReport = () => ({ format: { format_name: 'mov,mp4', duration: '2', start_time: '0' }, streams: [
  { codec_type: 'video', codec_name: 'h264', width: 720, height: 1280, avg_frame_rate: '24/1', duration: '2', start_time: '0', disposition: { attached_pic: 0 } },
  { codec_type: 'audio', codec_name: 'aac', sample_rate: '24000', channels: 1, duration: '2', start_time: '0' },
] });

for (const fault of ['none', 'end', 'negative', 'hash', 'source-format', 'missing-output', 'decode']) test(`T61B reference extract: ${fault}`, async () => {
  const { extractReferenceImage } = await import('../../lib/extract-reference-image.ts');
  let calls = 0, extracts = 0, probes = 0, decodes = 0; const paths = [];
  const timeSeconds = fault === 'end' ? 2 : fault === 'negative' ? -1 : 0.5;
  const promise = extractReferenceImage({ bytes: video, sha256: fault === 'hash' ? '0'.repeat(64) : hash(video), timeSeconds }, {
    ffmpeg: '/synthetic/ffmpeg', ffprobe: '/synthetic/ffprobe', execute: async (exe, args, settings) => {
      calls++; expect(settings.shell).toBe(false); expect(settings.timeout).toBeLessThanOrEqual(60000);
      expect(args[args.indexOf('-protocol_whitelist') + 1]).toBe('file');
      if (exe.endsWith('ffprobe')) {
        probes++; const path = args.at(-1); paths.push(path);
        expect(await readFile(path)).toEqual(probes === 1 ? video : png);
        const report = probes === 1 ? sourceReport() : { streams: [{ codec_type: 'video', codec_name: 'png', width: 720, height: 1280 }] };
        if (fault === 'source-format') report.streams[0].codec_name = 'unknown';
        return { stdout: JSON.stringify(report), stderr: '' };
      }
      if (args.includes('-frames:v')) {
        extracts++; expect(args[args.indexOf('-frames:v') + 1]).toBe('1'); expect(args[args.indexOf('-ss') + 1]).toBe('0.5');
        expect(await readFile(args[args.indexOf('-i') + 1])).toEqual(video);
        paths.push(args.at(-1)); if (fault !== 'missing-output') await writeFile(args.at(-1), png);
      } else {
        decodes++; expect(args).toContain('-xerror'); if (fault === 'decode') throw new Error('bad PNG');
      }
      return { stdout: '', stderr: '' };
    },
  });
  if (fault === 'none') {
    const result = await promise;
    expect(result).toMatchObject({ sha256: hash(png), sourceVideoSha256: hash(video), timeSeconds: 0.5, decoded: true, mimeType: 'image/png', width: 720, height: 1280 });
    expect(Buffer.from(result.bytes)).toEqual(png); expect([probes, extracts, decodes]).toEqual([2, 1, 1]);
  } else {
    await expect(promise).rejects.toThrow();
    if (['hash', 'negative'].includes(fault)) expect(calls).toBe(0);
    if (['end', 'source-format'].includes(fault)) expect(extracts).toBe(0);
  }
  for (const path of paths) await expect(access(path)).rejects.toThrow();
});

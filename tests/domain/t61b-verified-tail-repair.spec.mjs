import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, writeFile, access } from 'node:fs/promises';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const asset = bytes => ({ bytes, sha256: hash(bytes) });
function source() {
  const wav = Buffer.alloc(48044);
  wav.write('RIFF'); wav.writeUInt32LE(48036, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(48000, 40);
  return { video: asset(Buffer.from('original synthetic video')), audio: asset(wav) };
}
const report = duration => ({ format: { format_name: 'mov,mp4', duration: String(duration), start_time: '0' }, streams: [
  { codec_type: 'video', codec_name: 'h264', width: 720, height: 1280, avg_frame_rate: '24/1', duration: String(duration), start_time: '0', disposition: { attached_pic: 0 } },
  { codec_type: 'audio', codec_name: 'aac', profile: 'LC', sample_rate: '24000', channels: 1, duration: String(duration), start_time: '0' },
] });
const load = () => import('../../lib/repair-and-verify-video-tail.ts');

for (const fault of ['none', 'offset', 'missing-start', 'excess-tail', 'bad-output-duration', 'decode']) test(`T61B verified tail: ${fault}`, async () => {
  const { repairAndVerifyVideoTail } = await load(); const input = source(), output = Buffer.from('repaired synthetic video');
  const paths = []; let probes = 0, repairs = 0, decodes = 0;
  const promise = repairAndVerifyVideoTail(input, { ffmpeg: '/synthetic/ffmpeg', ffprobe: '/synthetic/ffprobe', execute: async (exe, args, options) => {
    expect(options.shell).toBe(false);
    if (exe === '/synthetic/ffprobe') {
      probes++; const path = args.at(-1); paths.push(path);
      expect(await readFile(path)).toEqual(probes === 1 ? input.video.bytes : output);
      const value = report(probes === 1 ? 0.875 : 1);
      if (probes === 1 && fault === 'offset') value.streams[0].start_time = '0.1';
      if (probes === 1 && fault === 'missing-start') delete value.streams[0].start_time;
      // C15-4e: 13.2 frames short of the 1 s audio (the pad limit is now 12 frames; 0.5 s was exactly 12).
      if (probes === 1 && fault === 'excess-tail') { value.format.duration = '0.45'; for (const s of value.streams) s.duration = '0.45'; }
      if (probes === 2 && fault === 'bad-output-duration') { value.format.duration = '0.875'; for (const s of value.streams) s.duration = '0.875'; }
      return { stdout: JSON.stringify(value), stderr: '' };
    }
    if (args.includes('-vf')) {
      repairs++; expect(args[args.indexOf('-t') + 1]).toBe('1');
      expect(args[args.indexOf('-vf') + 1]).toBe('tpad=stop_mode=clone:stop_duration=0.125');
      paths.push(args.at(-1)); await writeFile(args.at(-1), output);
    } else {
      decodes++; expect(args).toContain('-xerror');
      expect(await readFile(args[args.indexOf('-i') + 1])).toEqual(output);
      if (fault === 'decode') throw new Error('synthetic decode failure');
    }
    return { stdout: '', stderr: '' };
  } });
  if (fault === 'none') {
    const result = await promise;
    expect(result).toMatchObject({ sourceVideoSha256: input.video.sha256, sourceAudioSha256: input.audio.sha256, sha256: hash(output), duration: 1, decoded: true });
    expect(Buffer.from(result.bytes)).toEqual(output); expect([probes, repairs, decodes]).toEqual([2, 1, 1]);
  } else {
    await expect(promise).rejects.toThrow();
    if (['offset', 'missing-start', 'excess-tail'].includes(fault)) expect(repairs).toBe(0);
  }
  for (const path of paths) await expect(access(path)).rejects.toThrow();
});

test('T61B verified tail: corrupt source never invokes tools', async () => {
  const { repairAndVerifyVideoTail } = await load(); const input = source(); input.audio.sha256 = '0'.repeat(64); let calls = 0;
  await expect(repairAndVerifyVideoTail(input, { ffmpeg: '/synthetic/ffmpeg', ffprobe: '/synthetic/ffprobe', execute: async () => { calls++; return { stdout: '', stderr: '' }; } })).rejects.toThrow();
  expect(calls).toBe(0);
});

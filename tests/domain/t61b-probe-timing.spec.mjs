import { test, expect } from '@playwright/test';
const load = () => import('../../lib/video-probe.ts');
// Measured hotel fixture fields, 2026-09-26 native ffprobe. No local paths or account data.
const report = () => ({ format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '12.042000', start_time: '0.000000' }, streams: [
  { codec_type: 'video', codec_name: 'h264', width: 720, height: 1280, avg_frame_rate: '24/1', duration: '12.041667', start_time: '0.000000', disposition: { attached_pic: 0 } },
  { codec_type: 'audio', codec_name: 'aac', profile: 'LC', sample_rate: '24000', channels: 1, duration: '11.987000', start_time: '0.000000' },
] });

test('T61B timing: real hotel report accepted with independent video/audio rounding bounds', async () => {
  const { validateVideoProbe } = await load();
  expect(validateVideoProbe(report(), 12)).toMatchObject({ duration: 12.042, fps: 24 });
});

test('T61B timing: video and audio bounds apply independently, not a broad global allowance', async () => {
  const { validateVideoProbe } = await load();
  const input = report(); input.streams[0].duration = '12.060'; input.format.duration = '12.060';
  expect(() => validateVideoProbe(input, 12)).toThrow();
  const audio = report(); audio.streams[1].duration = '11.940';
  expect(() => validateVideoProbe(audio, 12)).toThrow();
});

test('T61B timing: excessive start offset rejected even when durations match', async () => {
  const { validateVideoProbe } = await load();
  const input = report(); input.format.duration = '12'; input.streams.forEach(s => { s.duration = '12'; });
  input.streams[1].start_time = '0.500';
  expect(() => validateVideoProbe(input, 12)).toThrow();
});

test('T61B timing: sample rate tightens AAC tolerance and malformed start times fail closed', async () => {
  const { validateVideoProbe } = await load();
  const input = report(); input.streams[1].sample_rate = '48000'; input.streams[1].duration = '11.970';
  expect(() => validateVideoProbe(input, 12)).toThrow();
  const invalid = report(); invalid.streams[0].start_time = 'NaN';
  expect(() => validateVideoProbe(invalid, 12)).toThrow();
});

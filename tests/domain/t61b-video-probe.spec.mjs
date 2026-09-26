import { test, expect } from '@playwright/test';
const load = () => import('../../lib/video-probe.ts');
const report = () => ({ format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '12.000000' }, streams: [
  { codec_type: 'video', codec_name: 'h264', width: 720, height: 1280, avg_frame_rate: '24/1', duration: '12.000000', disposition: { attached_pic: 0 } },
  { codec_type: 'audio', codec_name: 'aac', sample_rate: '48000', channels: 2, duration: '12.000000' },
] });

test('T61B probe: validates report against measured source duration and returns limited metadata', async () => {
  const { validateVideoProbe } = await load();
  const input = report(); input.format.filename = '/private/synthetic-file.mp4';
  const result = validateVideoProbe(input, 12);
  expect(result).toEqual({ duration: 12, width: 720, height: 1280, fps: 24, videoCodec: 'h264', audioCodec: 'aac' });
});

for (const kind of ['no-audio', 'wrong-size', 'wrong-fps', 'cover-art', 'wrong-container', 'missing-duration', 'duration-mismatch', 'invalid-number', 'duplicate-video']) {
  test(`T61B probe: rejects ${kind}`, async () => {
    const { validateVideoProbe } = await load(); const input = report();
    if (kind === 'no-audio') input.streams.pop();
    if (kind === 'wrong-size') input.streams[0].width = 1280;
    if (kind === 'wrong-fps') input.streams[0].avg_frame_rate = '30/1';
    if (kind === 'cover-art') input.streams[0].disposition.attached_pic = 1;
    if (kind === 'wrong-container') input.format.format_name = 'matroska,webm';
    if (kind === 'missing-duration') delete input.streams[1].duration;
    if (kind === 'duration-mismatch') input.streams[1].duration = '8';
    if (kind === 'invalid-number') input.format.duration = 'Infinity';
    if (kind === 'duplicate-video') input.streams.push({ ...input.streams[0] });
    expect(() => validateVideoProbe(input, 12)).toThrow();
  });
}

test('T61B probe: rejects invalid expected lengths, missing data and codec outside playback profile', async () => {
  const { validateVideoProbe } = await load();
  for (const duration of [0, -1, 21, NaN, Infinity]) expect(() => validateVideoProbe(report(), duration)).toThrow();
  for (const input of [null, {}, [], { streams: [] }]) expect(() => validateVideoProbe(input, 12)).toThrow();
  const input = report(); input.streams[0].codec_name = 'unknown';
  expect(() => validateVideoProbe(input, 12)).toThrow();
});

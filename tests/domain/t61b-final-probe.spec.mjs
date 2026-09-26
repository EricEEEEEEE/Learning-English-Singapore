import { test, expect } from '@playwright/test';
const load = () => import('../../lib/final-video-probe.ts');
// Real output fields from the corrected two-hotel concat experiment.
const report = () => ({ format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', start_time: '0.000000', duration: '24.084000' }, streams: [
  { codec_type: 'video', codec_name: 'h264', width: 720, height: 1280, avg_frame_rate: '1775616/73985', duration: '24.083659', start_time: '0.000000', disposition: { attached_pic: 0 } },
  { codec_type: 'audio', codec_name: 'aac', profile: 'LC', sample_rate: '24000', channels: 1, duration: '24.029000', start_time: '0.000000' },
] });
const plan = () => ({ sourceDuration: 24, segmentDurations: [12.042, 12.042] });

test('T61B final probe: accepts measured concat with bounded rational-rate rounding', async () => {
  const { validateFinalVideoProbe } = await load();
  expect(validateFinalVideoProbe(report(), plan())).toMatchObject({ duration: 24.084, width: 720, height: 1280, videoCodec: 'h264', audioCodec: 'aac' });
});

for (const kind of ['truncated', 'offset', 'missing-start', 'missing-audio', 'wrong-rate']) test(`T61B final probe: rejects ${kind}`, async () => {
  const { validateFinalVideoProbe } = await load(); const r = report();
  if (kind === 'truncated') { r.format.duration = '20'; r.streams.forEach(s => { s.duration = '20'; }); }
  if (kind === 'offset') r.streams[0].start_time = '0.042';
  if (kind === 'missing-start') delete r.streams[1].start_time;
  if (kind === 'missing-audio') r.streams.pop();
  if (kind === 'wrong-rate') r.streams[0].avg_frame_rate = '25/1';
  expect(() => validateFinalVideoProbe(r, plan())).toThrow();
});

test('T61B final probe: validates approved source and per-segment limits rather than arbitrary total', async () => {
  const { validateFinalVideoProbe } = await load();
  for (const p of [{ sourceDuration: 61, segmentDurations: [20, 20, 20, 1] }, { sourceDuration: 24, segmentDurations: [24.084] }, { sourceDuration: 24, segmentDurations: [] }, { sourceDuration: 24, segmentDurations: [NaN] }, { sourceDuration: 24, segmentDurations: [10, 10] }]) expect(() => validateFinalVideoProbe(report(), p)).toThrow();
});

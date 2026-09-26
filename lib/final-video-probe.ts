const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function positive(value: unknown) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value))) throw new Error('Invalid media number');
  const n = Number(value); if (!Number.isFinite(n) || n <= 0) throw new Error('Invalid media number'); return n;
}

// Final report only; trusted caller must bind report to output hash and separately decode.
export function validateFinalVideoProbe(report: unknown, plan: { sourceDuration: number; segmentDurations: number[] }) {
  if (!plan || typeof plan.sourceDuration !== 'number' || !Number.isFinite(plan.sourceDuration) || plan.sourceDuration <= 0 || plan.sourceDuration > 60 || !Array.isArray(plan.segmentDurations) || !plan.segmentDurations.length || plan.segmentDurations.length > 4 || plan.segmentDurations.some(n => typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > 20)) throw new Error('Invalid final plan');
  const expected = plan.segmentDurations.reduce((sum, n) => sum + n, 0);
  if (Math.abs(expected - plan.sourceDuration) > plan.segmentDurations.length * 0.129002) throw new Error('Inconsistent final plan');
  if (!object(report) || !object(report.format) || !Array.isArray(report.streams) || report.streams.length !== 2 || !report.streams.every(object)) throw new Error('Invalid final report');
  const format = report.format, video = report.streams.find(s => s.codec_type === 'video'), audio = report.streams.find(s => s.codec_type === 'audio');
  if (typeof format.format_name !== 'string' || !format.format_name.split(',').includes('mp4') || !video || !audio || video.codec_name !== 'h264' || audio.codec_name !== 'aac' || audio.profile !== 'LC' || video.width !== 720 || video.height !== 1280 || !object(video.disposition) || video.disposition.attached_pic !== 0) throw new Error('Unsupported final media');
  for (const stream of [format, video, audio]) {
    const start = stream.start_time;
    if ((typeof start !== 'number' && (typeof start !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(start))) || !Number.isFinite(Number(start)) || Math.abs(Number(start)) > 0.000001) throw new Error('Invalid final start');
  }
  const rate = typeof video.avg_frame_rate === 'string' ? /^(\d+)\/(\d+)$/.exec(video.avg_frame_rate) : null;
  if (!rate) throw new Error('Invalid final frame rate');
  const fps = positive(rate[1]) / positive(rate[2]);
  // Allow only tiny time-base quantization, not a different frame-rate profile.
  if (Math.abs(fps - 24) > 0.001) throw new Error('Invalid final frame rate');
  const sampleRate = positive(audio.sample_rate);
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000 || (audio.channels !== 1 && audio.channels !== 2)) throw new Error('Unsupported final audio');
  const duration = positive(format.duration), v = positive(video.duration), a = positive(audio.duration);
  if (Math.abs(duration - expected) > 0.001001 || Math.abs(v - expected) > 1 / 24 + 0.001001 || Math.abs(a - expected) > 1024 / sampleRate * plan.segmentDurations.length + 0.001001 || Math.abs(duration - Math.max(v, a)) > 0.001001) throw new Error('Final duration mismatch');
  return { duration, width: 720, height: 1280, fps, videoCodec: 'h264', audioCodec: 'aac' };
}

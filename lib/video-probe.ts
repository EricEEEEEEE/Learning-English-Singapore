const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function positive(value: unknown): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value))) throw new Error('Invalid media number');
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error('Invalid media number');
  return number;
}

// Checks a trusted probe's report, not decoding, audible content or visual quality.
// Conservative first-short-course playback profile; unsupported outputs require review.
export function validateVideoProbe(report: unknown, expectedDuration: number) {
  if (typeof expectedDuration !== 'number' || !Number.isFinite(expectedDuration) || expectedDuration <= 0 || expectedDuration > 20) throw new Error('Invalid expected duration');
  if (!object(report) || !object(report.format) || !Array.isArray(report.streams) || report.streams.length !== 2 || !report.streams.every(object)) throw new Error('Invalid media report');
  const format = report.format;
  if (typeof format.format_name !== 'string' || !format.format_name.split(',').includes('mp4')) throw new Error('Unsupported container');
  const video = report.streams.find(stream => stream.codec_type === 'video');
  const audio = report.streams.find(stream => stream.codec_type === 'audio');
  if (!video || !audio || video.codec_name !== 'h264' || audio.codec_name !== 'aac' || video.width !== 720 || video.height !== 1280) throw new Error('Unsupported media streams');
  if (!object(video.disposition) || video.disposition.attached_pic !== 0) throw new Error('Invalid video disposition');
  const rate = typeof video.avg_frame_rate === 'string' ? /^(\d+)\/(\d+)$/.exec(video.avg_frame_rate) : null;
  if (!rate || positive(rate[1]) / positive(rate[2]) !== 24) throw new Error('Unsupported frame rate');
  const sampleRate = positive(audio.sample_rate);
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000 || (audio.channels !== 1 && audio.channels !== 2)) throw new Error('Unsupported audio format');
  const duration = positive(format.duration), videoDuration = positive(video.duration), audioDuration = positive(audio.duration);
  // At most one 24fps frame for container rounding; never accept more than 20s.
  const durations = [duration, videoDuration, audioDuration, expectedDuration];
  if (durations.some(value => value > 20) || Math.max(...durations) - Math.min(...durations) > 1 / 24) throw new Error('Media duration mismatch');
  return { duration, width: 720, height: 1280, fps: 24, videoCodec: 'h264', audioCodec: 'aac' };
}

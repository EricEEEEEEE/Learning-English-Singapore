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
  // Separate source-relative bounds: one video frame and one AAC-LC frame.
  // ffprobe serializes seconds to microseconds; MP4 format duration rounds to milliseconds.
  const videoTolerance = 1 / 24 + 0.000001;
  const audioTolerance = audio.profile === 'LC' ? 1024 / sampleRate + 0.000001 : 1 / 24;
  if ([duration, videoDuration, audioDuration].some(value => value > 20) || Math.abs(videoDuration - expectedDuration) > videoTolerance || Math.abs(audioDuration - expectedDuration) > audioTolerance || Math.abs(duration - Math.max(videoDuration, audioDuration)) > 0.001001) throw new Error('Media duration mismatch');
  for (const stream of [format, video, audio]) {
    // Older synthetic reports omit starts; real ffprobe reports are checked when present.
    if (stream.start_time === undefined) continue;
    const raw = stream.start_time;
    if ((typeof raw !== 'number' && (typeof raw !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(raw))) || !Number.isFinite(Number(raw)) || Math.abs(Number(raw)) > 0.000001) throw new Error('Media start offset');
  }
  return { duration, width: 720, height: 1280, fps: 24, videoCodec: 'h264', audioCodec: 'aac' };
}

import { createHash } from 'node:crypto';
import type { AudioReview } from './generation-runner';

type Read = (input: { cookie?: string | null; now?: number; courseId: string; revision: number; assetId: string }) => Promise<{ bytes: Uint8Array; sha256: string; size?: number } | null>;

const WINDOW_SECONDS = 0.05;
const VOICED_DBFS = -45;      // a window quieter than this counts as no speech
const MAX_GAP_SECONDS = 2;    // longer dead air than this is not a natural pause between lines
const MIN_VOICED_SECONDS = 0.5;
const MIN_VOICED_SHARE = 0.3;

// 16-bit PCM WAV only (the format the speech provider returns and the assembler keeps losslessly).
function pcmSamples(bytes: Uint8Array): { samples: Int16Array; rate: number } {
  const b = Buffer.from(bytes);
  if (b.length < 44 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Invalid WAV');
  let rate = 0, channels = 0, bits = 0;
  for (let offset = 12; offset + 8 <= b.length;) {
    const tag = b.toString('ascii', offset, offset + 4), size = b.readUInt32LE(offset + 4), start = offset + 8;
    if (start + size > b.length) throw new Error('Truncated WAV');
    if (tag === 'fmt ') {
      if (size < 16 || b.readUInt16LE(start) !== 1) throw new Error('Unsupported WAV');
      channels = b.readUInt16LE(start + 2); rate = b.readUInt32LE(start + 4); bits = b.readUInt16LE(start + 14);
    } else if (tag === 'data') {
      if (channels !== 1 || bits !== 16 || rate < 8000 || size % 2) throw new Error('Unsupported WAV');
      const copy = b.subarray(start, start + size);
      return { samples: new Int16Array(copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.length)), rate };
    }
    offset = start + size + (size % 2);
  }
  throw new Error('Missing WAV data');
}

export function measureSpeech(bytes: Uint8Array) {
  const { samples, rate } = pcmSamples(bytes);
  const size = Math.max(1, Math.round(rate * WINDOW_SECONDS));
  let voiced = 0, gap = 0, longestGap = 0, windows = 0;
  for (let start = 0; start < samples.length; start += size) {
    const end = Math.min(samples.length, start + size);
    let sum = 0;
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / (end - start));
    const dbfs = rms > 0 ? 20 * Math.log10(rms / 32768) : -Infinity;
    windows++;
    if (dbfs >= VOICED_DBFS) { voiced++; gap = 0; } else { gap++; longestGap = Math.max(longestGap, gap); }
  }
  const seconds = samples.length / rate;
  return { seconds, voicedSeconds: voiced * size / rate, longestGapSeconds: longestGap * size / rate, windows };
}

// Machine stand-in for the earlier human listening step before paid video. It is a signal check, not a
// judgement of accent or wording, and it fails closed on anything it cannot read.
export function createMachineAudioReview({ read }: { read: Read }): AudioReview {
  return async ({ cookie, now, task, encoded, segment }) => {
    try {
      // The encoded track is the partner-only drive when the segment has one; speech is measured on the full segment.
      if (encoded.sourceSha256 !== ((segment as { driveSha256?: string }).driveSha256 ?? segment.sha256) || encoded.sourceDuration !== segment.duration) return false;
      const media = await read({ cookie, now, courseId: task.id, revision: task.revision, assetId: segment.assetId });
      if (!media || !(media.bytes instanceof Uint8Array) || createHash('sha256').update(media.bytes).digest('hex') !== segment.sha256) return false;
      const m = measureSpeech(media.bytes);
      return m.voicedSeconds >= MIN_VOICED_SECONDS && m.voicedSeconds >= MIN_VOICED_SHARE * m.seconds && m.longestGapSeconds <= MAX_GAP_SECONDS;
    } catch {
      return false;
    }
  };
}

import { createHash } from 'node:crypto';
import { wavDuration, planAudioSegments } from './generated-audio';

type Input = { lineId: string; bytes: Uint8Array; sha256: string };
type Timing = { lineId: string; start: number; end: number; segmentIndex: number; segmentStart: number; segmentEnd: number };

// Lossless PCM assembly only: no resampling, invented pauses or provider calls.
export function assembleCourseAudio(inputs: Input[]) {
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > 10) throw new Error('Invalid audio inputs');
  const parsed = inputs.map(input => {
    if (!input || !(input.bytes instanceof Uint8Array) || input.bytes.length > 4_000_000 || createHash('sha256').update(input.bytes).digest('hex') !== input.sha256) throw new Error('Invalid audio integrity');
    const duration = wavDuration(input.bytes);
    const b = Buffer.from(input.bytes);
    let format: Buffer | undefined, data: Buffer | undefined;
    // wavDuration has checked chunk boundaries, PCM parameters and streaming sizes.
    for (let offset = 12; offset < b.length;) {
      const tag = b.toString('ascii', offset, offset + 4), declared = b.readUInt32LE(offset + 4);
      const start = offset + 8, size = declared === 0xffffffff ? b.length - start : declared;
      if (tag === 'fmt ') format = b.subarray(start, start + 16);
      if (tag === 'data') data = b.subarray(start, start + size);
      offset = start + size + size % 2;
    }
    if (!format || !data) throw new Error('Missing PCM chunks');
    return { lineId: input.lineId, duration, format, data };
  });
  const format = parsed[0].format;
  if (parsed.some(item => !item.format.equals(format))) throw new Error('Mixed PCM formats');
  const plans = planAudioSegments(parsed);
  const rate = format.readUInt32LE(8);
  const lines: Timing[] = [];
  let totalBytes = 0, index = 0;
  const segments = plans.map((plan, segmentIndex) => {
    const parts: Buffer[] = []; let segmentBytes = 0;
    for (const lineId of plan.lineIds) {
      const item = parsed[index++];
      lines.push({ lineId, start: totalBytes / rate, end: (totalBytes + item.data.length) / rate,
        segmentIndex, segmentStart: segmentBytes / rate, segmentEnd: (segmentBytes + item.data.length) / rate });
      totalBytes += item.data.length; segmentBytes += item.data.length; parts.push(item.data);
    }
    const bytes = Buffer.alloc(44 + segmentBytes + segmentBytes % 2);
    bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVE', 8);
    bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); format.copy(bytes, 20);
    bytes.write('data', 36); bytes.writeUInt32LE(segmentBytes, 40);
    let offset = 44; for (const part of parts) { part.copy(bytes, offset); offset += part.length; }
    return { lineIds: plan.lineIds, duration: wavDuration(bytes), bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
  return { duration: totalBytes / rate, lines, segments };
}

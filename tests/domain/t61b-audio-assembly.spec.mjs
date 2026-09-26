import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
const load = () => import('../../lib/assemble-course-audio.ts');
function audio(lineId, seconds, marker, rate = 8000) {
  const size = seconds * rate * 2, bytes = Buffer.alloc(44 + size);
  bytes.write('RIFF'); bytes.writeUInt32LE(36 + size, 4); bytes.write('WAVE', 8);
  bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(size, 40); bytes.fill(marker, 44);
  return { lineId, bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}

test('T61B assembly: concatenates actual PCM in order with measured global and segment timing', async () => {
  const { assembleCourseAudio } = await load();
  const a = audio('a', 12, 1), b = audio('b', 8, 2), c = audio('c', 3, 3);
  const result = assembleCourseAudio([a, b, c]);
  expect(result.duration).toBe(23);
  expect(result.lines).toEqual([
    { lineId: 'a', start: 0, end: 12, segmentIndex: 0, segmentStart: 0, segmentEnd: 12 },
    { lineId: 'b', start: 12, end: 20, segmentIndex: 0, segmentStart: 12, segmentEnd: 20 },
    { lineId: 'c', start: 20, end: 23, segmentIndex: 1, segmentStart: 0, segmentEnd: 3 },
  ]);
  expect(result.segments).toHaveLength(2);
  for (const [index, expected] of [[0, Buffer.concat([a.bytes.subarray(44), b.bytes.subarray(44)])], [1, c.bytes.subarray(44)]]) {
    const segment = result.segments[index], bytes = Buffer.from(segment.bytes);
    expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
    expect(bytes.readUInt32LE(4)).toBe(bytes.length - 8);
    expect(bytes.readUInt32LE(40)).toBe(expected.length);
    expect(bytes.subarray(44)).toEqual(expected);
    expect(segment.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
  }
});

test('T61B assembly: ignores declared duration and derives timing from samples', async () => {
  const { assembleCourseAudio } = await load();
  const result = assembleCourseAudio([{ ...audio('a', 2, 1), duration: 19 }]);
  expect(result.duration).toBe(2);
  expect(result.segments[0].duration).toBe(2);
  expect(result.lines[0].end).toBe(2);
});

test('T61B assembly: rejects corrupted assets, mixed PCM formats and repeated line identity', async () => {
  const { assembleCourseAudio } = await load();
  const a = audio('a', 1, 1), bad = audio('b', 1, 2); bad.bytes[45] ^= 1;
  expect(() => assembleCourseAudio([a, bad])).toThrow();
  expect(() => assembleCourseAudio([a, audio('b', 1, 2, 16000)])).toThrow();
  expect(() => assembleCourseAudio([a, a])).toThrow();
  const truncated = audio('x', 1, 1); truncated.bytes = truncated.bytes.subarray(0, 100);
  truncated.sha256 = createHash('sha256').update(truncated.bytes).digest('hex');
  expect(() => assembleCourseAudio([truncated])).toThrow();
});

test('T61B assembly: enforces total duration, segment count and nonempty input', async () => {
  const { assembleCourseAudio } = await load();
  expect(() => assembleCourseAudio([])).toThrow();
  expect(() => assembleCourseAudio([audio('a', 20, 1), audio('b', 20, 2), audio('c', 20, 3), audio('d', 1, 4)])).toThrow();
  expect(() => assembleCourseAudio(Array.from({ length: 5 }, (_, i) => audio(String(i), 11, 1)))).toThrow();
  expect(() => assembleCourseAudio([audio('a', 21, 1)])).toThrow();
});

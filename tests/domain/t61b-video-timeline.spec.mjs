import { test, expect } from '@playwright/test';
const load = () => import('../../lib/video-timeline.ts');
const input = () => ({
  segments: [
    { segmentIndex: 0, assetId: 'video-0', sha256: 'a'.repeat(64), duration: 12.042 },
    { segmentIndex: 1, assetId: 'video-1', sha256: 'b'.repeat(64), duration: 8.01 },
  ],
  audioAssembly: { duration: 20, segments: [{ duration: 12, lineIds: ['a', 'b'] }, { duration: 8, lineIds: ['c'] }], lines: [
    { lineId: 'a', start: 0, end: 6, segmentIndex: 0, segmentStart: 0, segmentEnd: 6 },
    { lineId: 'b', start: 6, end: 12, segmentIndex: 0, segmentStart: 6, segmentEnd: 12 },
    { lineId: 'c', start: 12, end: 20, segmentIndex: 1, segmentStart: 0, segmentEnd: 8 },
  ] },
});

test('T61B timeline: uses actual video segment lengths for downstream subtitle offsets', async () => {
  const { planVideoTimeline } = await load(); const result = planVideoTimeline(input());
  expect(result.duration).toBeCloseTo(20.052, 6);
  expect(result.segments.map(s => [s.segmentIndex, s.start])).toEqual([[0, 0], [1, 12.042]]);
  expect(result.lines).toEqual([{ lineId: 'a', start: 0, end: 6 }, { lineId: 'b', start: 6, end: 12 }, { lineId: 'c', start: 12.042, end: 20.042 }]);
});

for (const kind of ['missing-segment', 'out-of-order', 'duplicate-line', 'outside-video', 'missing-line']) test(`T61B timeline: rejects ${kind} instead of publishing misleading subtitles`, async () => {
  const { planVideoTimeline } = await load(); const data = input();
  if (kind === 'missing-segment') data.segments.pop();
  if (kind === 'out-of-order') data.segments.reverse();
  if (kind === 'duplicate-line') data.audioAssembly.lines[2].lineId = 'a';
  if (kind === 'outside-video') data.segments[1].duration = 7;
  if (kind === 'missing-line') data.audioAssembly.lines.pop();
  expect(() => planVideoTimeline(data)).toThrow();
});

test('T61B timeline: permits only bounded end clipping for encoding rounding and preserves line start', async () => {
  const { planVideoTimeline } = await load(); const data = input(); data.segments[1].duration = 7.99;
  const result = planVideoTimeline(data);
  expect(result.lines[2].start).toBe(12.042);
  expect(result.lines[2].end).toBeCloseTo(20.032, 6);
  const invalid = input(); invalid.segments[0].duration = NaN;
  expect(() => planVideoTimeline(invalid)).toThrow();
});

import { test, expect } from '@playwright/test';

const translations = Object.fromEntries(['zh-Hans', 'id', 'ja', 'ko', 'hi'].map(k => [k, 'synthetic translation']));
function task() {
  return {
    id: 'synthetic-course', ownerId: 'private-owner-not-for-client', goal: 'Party greeting', revision: 2,
    status: 'video_assembled', simulation: true, reservedMicros: 100, providerCalls: 5,
    script: {
      lines: [{ id: 'a', role: 'partner', text: 'Hello there.', translations }, { id: 'b', role: 'learner', text: 'Hello.', translations }],
      phrases: [{ id: 'p', text: 'Hello', lineId: 'a', translations }],
      turns: [{ partnerLineId: 'a', learnerLineId: 'b' }],
    },
    finalVideo: { assetId: 'final-synthetic', sha256: 'a'.repeat(64), size: 123, duration: 4.042, decoded: true, width: 720, height: 1280, fps: 24, videoCodec: 'h264', audioCodec: 'aac' },
    videoTimeline: { duration: 4.042, segments: [], lines: [{ lineId: 'a', start: 0, end: 2 }, { lineId: 'b', start: 2.042, end: 4.042 }] },
  };
}

test('T61B course manifest: binds script materials and measured timing to one private course revision', async () => {
  const { buildGeneratedCourse } = await import('../../lib/generated-course.ts');
  const input = task(), course = buildGeneratedCourse(input);
  expect(course).toEqual({
    id: input.id, revision: 2, source: 'test-fixture',
    media: { courseId: input.id, revision: 2, assetId: 'final-synthetic', sha256: 'a'.repeat(64), duration: 4.042 },
    lines: input.script.lines.map((line, i) => ({ ...line, revision: 2, start: input.videoTimeline.lines[i].start, end: input.videoTimeline.lines[i].end })),
    phrases: input.script.phrases, turns: input.script.turns,
  });
  input.script.lines[0].translations.hi = 'changed';
  expect(course.lines[0].translations.hi).toBe('synthetic translation');
  expect(JSON.stringify(course)).not.toContain('private-owner-not-for-client');
  expect(course.media).not.toHaveProperty('src');
});

test('T61B course manifest: a last line ending under 1 ms past the probed media is clamped to the media end', async () => {
  const { buildGeneratedCourse } = await import('../../lib/generated-course.ts');
  const input = task();
  input.videoTimeline.duration = 4.042333; input.videoTimeline.lines[1].end = 4.042333; // frame-exact timeline vs ms-rounded probe
  expect(buildGeneratedCourse(input).lines[1].end).toBe(4.042);
});

const invalid = {
  pending: t => { t.status = 'video_pending'; },
  undecoded: t => { t.finalVideo.decoded = false; },
  missingLine: t => { t.videoTimeline.lines.pop(); },
  swappedLines: t => { t.videoTimeline.lines.reverse(); },
  overlap: t => { t.videoTimeline.lines[1].start = 1; },
  beyondMedia: t => { t.videoTimeline.lines[1].end = 5; },
  timelineMismatch: t => { t.videoTimeline.duration = 8; },
  invalidRevision: t => { t.revision = 0; },
  missingTranslation: t => { delete t.script.lines[0].translations.ko; },
  wrongPhrase: t => { t.script.phrases[0].text = 'Booking'; },
  invalidHash: t => { t.finalVideo.sha256 = 'bad'; },
};
for (const [name, change] of Object.entries(invalid)) test(`T61B course manifest: rejects ${name}`, async () => {
  const { buildGeneratedCourse } = await import('../../lib/generated-course.ts');
  const input = task(); change(input);
  expect(() => buildGeneratedCourse(input)).toThrow();
});

import { test, expect } from '@playwright/test';
import { courseFixture } from '../fixtures/t60-course.mjs';
const contract = () => import('../../lib/scene-course.ts');

test('T60: valid course preserves IDs, translations, timing and version without mutation', async () => {
  const { validateSceneCourse } = await contract();
  const candidate = courseFixture(); const before = structuredClone(candidate);
  expect(validateSceneCourse(candidate)).toEqual({ ok: true, value: candidate });
  expect(candidate).toEqual(before);
});
const invalid = [
  ['missing data', () => null],
  ['missing translation', c => { delete c.lines[1].translations.hi; return c; }],
  ['empty phrase translation', c => { c.phrases[0].translations.ko = ' '; return c; }],
  ['unrelated phrase', c => { c.phrases[0].text = 'restaurant'; return c; }],
  ['wrong phrase line', c => { c.phrases[0].lineId = 'absent'; return c; }],
  ['media version mismatch', c => { c.media.version = 'old'; return c; }],
  ['line version mismatch', c => { c.lines[0].version = 'old'; return c; }],
  ['negative start', c => { c.lines[0].start = -1; return c; }],
  ['reversed range', c => { c.lines[0].end = 0.5; return c; }],
  ['outside duration', c => { c.lines[1].end = 14; return c; }],
  ['overlapping ranges', c => { c.lines[1].start = 2; return c; }],
  ['duplicate line id', c => { c.lines[1].id = 'a'; return c; }],
  ['missing turn target', c => { c.turns[0].learnerLineId = 'absent'; return c; }],
  ['wrong role', c => { c.lines[1].role = 'partner'; return c; }],
  ['remote media', c => { c.media.src = 'https://example.com/video.mp4'; return c; }],
  ['nonfinite duration', c => { c.media.duration = Infinity; return c; }],
];
for (const [name, change] of invalid) test(`T60: reject ${name} without altering input`, async () => {
  const { validateSceneCourse } = await contract();
  const candidate = change(courseFixture()); const before = structuredClone(candidate);
  const result = validateSceneCourse(candidate);
  expect(result.ok).toBe(false);
  expect(result.issues.length).toBeGreaterThan(0);
  expect(candidate).toEqual(before);
});

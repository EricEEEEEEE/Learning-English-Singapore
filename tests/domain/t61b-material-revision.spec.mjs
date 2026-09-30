import { test, expect } from '@playwright/test';

const tr = value => Object.fromEntries(['zh-Hans', 'id', 'ja', 'ko', 'hi'].map(k => [k, value]));
function fixture() {
  const task = {
    id: 'synthetic-party', revision: 1, status: 'video_assembled', simulation: true,
    script: {
      lines: [
        { id: 'p1', role: 'partner', text: 'Are they in the same class?', translations: tr('original question') },
        { id: 'l1', role: 'learner', text: 'Yes, they are.', translations: tr('original answer') },
      ],
      phrases: [{ id: 'old', text: 'Are they in the same class?', lineId: 'p1', translations: tr('old phrase') }],
      turns: [{ partnerLineId: 'p1', learnerLineId: 'l1' }],
    },
    finalVideo: { assetId: 'final-party', sha256: 'a'.repeat(64), size: 123, duration: 4, decoded: true, width: 720, height: 1280, fps: 24, videoCodec: 'h264', audioCodec: 'aac' },
    videoTimeline: { duration: 4, lines: [{ lineId: 'p1', start: 0, end: 2 }, { lineId: 'l1', start: 2, end: 4 }] },
  };
  const revision = {
    courseId: task.id, sourceRevision: 1, mediaSha256: task.finalVideo.sha256, materialsRevision: 2,
    lineTranslations: [{ lineId: 'p1', translations: tr('same class question') }, { lineId: 'l1', translations: tr('same class answer') }],
    phrases: [{ id: 'class', text: 'same class', lineId: 'p1', translations: tr('class meaning') }],
  };
  return { task, revision };
}

async function api() {
  const module = await import('../../lib/generated-course.ts');
  // Missing implementation must fail outside rejection assertions.
  expect(typeof module.buildRevisedLearningCourse).toBe('function');
  return module;
}

test('T61B materials: separate revision changes translations and phrases without mutating media, dialogue or original course', async () => {
  const { buildGeneratedCourse, buildRevisedLearningCourse } = await api();
  const { task, revision } = fixture(), before = structuredClone(task);
  const original = buildGeneratedCourse(task), revised = buildRevisedLearningCourse(task, revision);
  expect(revised.materialsRevision).toBe(2);
  expect(revised.revision).toBe(1);
  expect(revised.media).toEqual(original.media);
  expect(revised.turns).toEqual(original.turns);
  expect(revised.lines.map(({ translations, ...rest }) => rest)).toEqual(original.lines.map(({ translations, ...rest }) => rest));
  expect(revised.lines.map(l => l.translations)).toEqual(revision.lineTranslations.map(l => l.translations));
  expect(revised.phrases).toEqual(revision.phrases);
  expect(task).toEqual(before);
  revision.phrases[0].translations.hi = 'later edit';
  revised.lines[0].translations.ko = 'client mutation';
  expect(revised.phrases[0].translations.hi).toBe('class meaning');
  expect(buildGeneratedCourse(task)).toEqual(original);
});

const invalid = {
  otherCourse: (_, r) => { r.courseId = 'another'; },
  otherVersion: (_, r) => { r.sourceRevision = 2; },
  otherMedia: (_, r) => { r.mediaSha256 = 'b'.repeat(64); },
  zeroRevision: (_, r) => { r.materialsRevision = 0; },
  fractionalRevision: (_, r) => { r.materialsRevision = 1.5; },
  missingLine: (_, r) => { r.lineTranslations.pop(); },
  repeatedLine: (_, r) => { r.lineTranslations[1].lineId = 'p1'; },
  unrelatedLine: (_, r) => { r.lineTranslations[1].lineId = 'other'; },
  missingLanguage: (_, r) => { delete r.lineTranslations[0].translations.hi; },
  inventedPhrase: (_, r) => { r.phrases[0].text = 'hotel booking'; },
  changedDialogue: (_, r) => { r.lineTranslations[0].text = 'Different audio'; },
  changedMedia: (_, r) => { r.media = { duration: 1 }; },
  unfinishedSource: t => { t.status = 'video_pending'; },
};
for (const [name, change] of Object.entries(invalid)) test(`T61B materials: refuses ${name} without touching source`, async () => {
  const { buildRevisedLearningCourse } = await api();
  const { task, revision } = fixture(); change(task, revision);
  const before = structuredClone(task);
  expect(() => buildRevisedLearningCourse(task, revision)).toThrow();
  expect(task).toEqual(before);
});

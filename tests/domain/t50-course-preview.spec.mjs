import { test, expect } from '@playwright/test';
import { validateLessonCandidate } from '../../lib/lesson-contract.ts';
import { createFixedLessonSession } from '../../lib/fixed-lesson-practice.ts';

const courses = () => import('../../lib/synthetic-courses.ts');
const languages = ['zh-Hans', 'id', 'ja', 'ko', 'hi'];

test('T50: two distinct course samples per language pass T47 and enter T48 without media claims', async () => {
  const { listSyntheticCourses, createSyntheticCoursePreview } = await courses();
  for (const language of languages) {
    const samples = listSyntheticCourses(language);
    expect(samples.length).toBeGreaterThanOrEqual(2);
    expect(new Set(samples.map(sample => sample.id)).size).toBe(samples.length);
    expect(new Set(samples.map(sample => sample.lesson.user_goal)).size).toBe(samples.length);
    expect(new Set(samples.map(sample => sample.lesson.lesson_revision)).size).toBe(samples.length);
    expect(new Set(samples.map(sample => sample.lesson.sentences.map(line => line.text).join('|'))).size).toBe(samples.length);
    for (const sample of samples) {
      expect(sample.title.trim().length).toBeGreaterThan(0);
      const valid = validateLessonCandidate(sample.lesson);
      expect(valid.ok).toBe(true);
      expect(sample.lesson.auxiliary_language).toBe(language);
      expect(sample.lesson).toMatchObject({ source: 'simulation', eligible_for_assessment: false });
      const supports = sample.lesson.sentences.flatMap(line => line.support ? [line.support] : []);
      expect(supports.length).toBeGreaterThan(0);
      for (const support of supports) expect(support.language).toBe(language);
      const preview = createSyntheticCoursePreview(sample.id, language);
      const expected = createFixedLessonSession(sample.lesson, preview.learner_role_id);
      expect(preview.material).toEqual(expected.material);
      expect(preview.user_goal).toBe(sample.lesson.user_goal);
      expect(preview.current_playback).toBeNull();
      expect(preview.mode).toBe('listen');
      const requestBody = { goalRevision: sample.lesson.goal_revision, playbackPositionMs: 0, lesson: sample.lesson, learnerRole: preview.learner_role_id };
      expect(new TextEncoder().encode(JSON.stringify(requestBody)).byteLength).toBeLessThanOrEqual(4096);
    }
  }
});

test('T50: unknown samples and unsupported languages are rejected instead of claiming arbitrary generation', async () => {
  const { listSyntheticCourses, createSyntheticCoursePreview } = await courses();
  expect(() => listSyntheticCourses('en')).toThrow();
  expect(() => createSyntheticCoursePreview('Please create my own situation', 'zh-Hans')).toThrow();
  expect(() => createSyntheticCoursePreview('__proto__', 'hi')).toThrow();
});

test('T50: returned sample mutation cannot change future fixed previews', async () => {
  const { listSyntheticCourses, createSyntheticCoursePreview } = await courses();
  const first = listSyntheticCourses('zh-Hans')[0];
  const before = createSyntheticCoursePreview(first.id, 'zh-Hans');
  first.lesson.sentences[0].text = 'Mutated outside catalogue';
  first.lesson.roles[0].label = 'Changed role';
  const again = createSyntheticCoursePreview(first.id, 'zh-Hans');
  expect(again.material).toEqual(before.material);
  expect(again.roles).toEqual(before.roles);
});

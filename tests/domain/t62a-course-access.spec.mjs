import { test, expect } from '@playwright/test';

const session = { cookie: 'synthetic', now: 123 };
function fixture() {
  const calls = [];
  const copied = { id: 'copy-synthetic', revision: 1, materialsRevision: 2, source: 'ai-generated', media: { assetId: 'final' }, lines: [], phrases: [], turns: [] };
  const generated = { id: 'generated', revision: 1, goal: 'Original', status: 'video_assembled', simulation: false };
  return { calls, copied, generated,
    generationStore: {
      list: async input => { calls.push(['generated-list', input]); return [generated]; },
      getCourse: async input => { calls.push(['generated-course', input]); return { id: 'generated' }; },
      getCourseMedia: async input => { calls.push(['generated-media', input]); return { bytes: new Uint8Array([2]) }; },
    },
    library: {
      list: async input => { calls.push(['copy-list', input]); return [copied]; },
      getCourse: async input => { calls.push(['copy-course', input]); return copied; },
      getCourseMedia: async input => { calls.push(['copy-media', input]); return { bytes: new Uint8Array([1]) }; },
    },
  };
}

test('T62A access: lists copies with selected material version alongside existing tasks', async () => {
  const { createLocalCourseAccess } = await import('../../lib/local-course-access.ts');
  const f = fixture(), access = createLocalCourseAccess(f);
  const rows = await access.list(session);
  expect(rows).toContainEqual(f.generated);
  expect(rows.find(r => r.id === f.copied.id)).toMatchObject({ id: f.copied.id, revision: 1, materialsRevision: 2, status: 'video_assembled', simulation: false });
  expect(rows.find(r => r.id === f.copied.id)).not.toHaveProperty('lines');
  expect(f.calls).toContainEqual(['copy-list', session]);
  expect(f.calls).toContainEqual(['generated-list', session]);
});

test('T62A access: exact source and material selectors reach only intended copy reader', async () => {
  const { createLocalCourseAccess } = await import('../../lib/local-course-access.ts');
  const f = fixture(), access = createLocalCourseAccess(f);
  const request = { ...session, id: f.copied.id, revision: 1, materialsRevision: 2 };
  expect(await access.getCourse(request)).toEqual(f.copied);
  await access.getCourseMedia({ ...session, id: f.copied.id, revision: 1 });
  expect(f.calls).toEqual([['copy-course', request], ['copy-media', { ...session, id: f.copied.id, revision: 1 }]]);
});

test('T62A access: failed copy reads never fall back to generation store', async () => {
  const { createLocalCourseAccess } = await import('../../lib/local-course-access.ts');
  const f = fixture();
  f.library.getCourse = f.library.getCourseMedia = async () => { throw new Error('Course unavailable'); };
  const access = createLocalCourseAccess(f);
  await expect(access.getCourse({ ...session, id: 'copy-missing', revision: 1, materialsRevision: 2 })).rejects.toThrow('Course unavailable');
  await expect(access.getCourseMedia({ ...session, id: 'copy-missing', revision: 1 })).rejects.toThrow('Course unavailable');
  expect(f.calls).toEqual([]);
});

test('T62A access: existing generated courses retain original reader behavior', async () => {
  const { createLocalCourseAccess } = await import('../../lib/local-course-access.ts');
  const f = fixture(), access = createLocalCourseAccess(f), request = { ...session, id: 'generated', revision: 1 };
  await access.getCourse(request); await access.getCourseMedia(request);
  expect(f.calls).toEqual([['generated-course', request], ['generated-media', request]]);
});

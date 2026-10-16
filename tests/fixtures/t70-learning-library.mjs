import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sealGoogleSession } from '../../lib/google-auth.ts';
import { ownerIdFromSessionCookie } from '../../lib/private-owner.ts';
import { createSceneProgressStore } from '../../lib/scene-progress.ts';
import { generatedCourse, requirement } from './t68-generation-browser.mjs';

export const now = Date.UTC(2026, 9, 16, 9);
export const secret = 't70-library-synthetic-secret-at-least-32';
export const position = { page: 'sentences', time: 8.4, turnIndex: 0 };
export const identity = providerSubject => ({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject, email: 'synthetic@example.invalid' });
export const courseKey = pointer => `${pointer.id}:${pointer.revision}:${pointer.materialsRevision ?? 0}`;
export const pointer = course => ({ id: course.id, revision: course.revision, ...(course.materialsRevision === undefined ? {} : { materialsRevision: course.materialsRevision }) });
export async function storageFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'les-t70-library-'));
  const cookie = await sealGoogleSession(identity('owner-a'), secret, now), otherCookie = await sealGoogleSession(identity('owner-b'), secret, now);
  const session = { cookie, now }, other = { cookie: otherCookie, now };
  const course = generatedCourse({ id: 't70-library-course', revision: 2, materialsRevision: 3 });
  const options = { directory, sessionSecret: secret };
  return { directory, session, other, course, openProgress: () => createSceneProgressStore(options), progress: createSceneProgressStore(options) };
}
export async function serviceFixture() {
  const { createLearningLibrary } = await import('../../lib/learning-library.ts');
  const f = await storageFixture(), ownerA = await ownerIdFromSessionCookie(f.session.cookie, secret, now), snapshot = requirement(2);
  const state = { rows: [{ ...pointer(f.course), goal: snapshot.content.description, status: 'video_assembled', simulation: false, requirement: snapshot, ownerId: ownerA, providerJobId: 'private-job-do-not-project', reservedMicros: 123 }],
    courses: { [courseKey(f.course)]: structuredClone(f.course) }, events: [], readFailure: null, latestFailure: null, listFailure: null };
  async function owner(session) {
    const id = await ownerIdFromSessionCookie(session.cookie, secret, session.now);
    if (!id) throw Error('Authenticated session required');
    return id;
  }
  const courseStore = {
    async list(input) {
      state.events.push(['list', { ...input }]); const id = await owner(input);
      if (state.listFailure) throw state.listFailure;
      return id === ownerA ? structuredClone(state.rows) : [];
    },
    async getCourse(input) {
      state.events.push(['course', { ...input }]);
      if (await owner(input) !== ownerA) throw Error('Course unavailable');
      if (state.readFailure) throw state.readFailure;
      const value = state.courses[courseKey(input)]; if (!value) throw Error('Course unavailable');
      return structuredClone(value);
    },
  };
  const progressStore = Object.fromEntries(['get', 'save', 'latest'].map(method => [method, async input => {
    state.events.push([`progress-${method}`, structuredClone(input)]);
    if (method === 'latest' && state.latestFailure) throw state.latestFailure;
    return f.progress[method](input);
  }]));
  return { ...f, ...state, state, snapshot, courseStore, progressStore, library: createLearningLibrary({ courseStore, progressStore }) };
}

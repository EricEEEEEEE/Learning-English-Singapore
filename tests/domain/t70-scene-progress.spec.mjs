import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sealGoogleSession } from '../../lib/google-auth.ts';
import { generatedCourse } from '../fixtures/t68-generation-browser.mjs';

const now = Date.UTC(2026, 9, 16, 8);
const sessionSecret = 't70-synthetic-progress-secret-at-least-32';
const identity = providerSubject => ({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject, email: 'synthetic@example.invalid' });
const position = { page: 'prompt', time: 4.2, turnIndex: 1 };
function courseFixture() {
  const course = generatedCourse({ id: 't70-progress-course', revision: 2, materialsRevision: 3 });
  // Synthetic state contract only, not a second generated video or audio turn.
  course.turns.push({ ...course.turns[0] });
  return course;
}
async function fixture() {
  const { createSceneProgressStore } = await import('../../lib/scene-progress.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-t70-progress-'));
  const cookie = await sealGoogleSession(identity('owner-a'), sessionSecret, now);
  const otherCookie = await sealGoogleSession(identity('owner-b'), sessionSecret, now);
  const session = { cookie, now }, course = courseFixture();
  const open = () => createSceneProgressStore({ directory, sessionSecret });
  return { directory, open, store: open(), session, other: { cookie: otherCookie, now }, course };
}
const pointer = course => ({ id: course.id, revision: course.revision, materialsRevision: course.materialsRevision, mediaSha256: course.media.sha256 });

test('T70 progress: new owner-scoped course has no progress or remembered material pointer', async () => {
  const f = await fixture();
  expect(await f.store.get({ ...f.session, course: f.course })).toBeNull();
  expect(await f.store.latest({ ...f.session, id: f.course.id, revision: 2 })).toBeNull();
});

test('T70 progress: exact course material and paused learning position survive a fresh store instance', async () => {
  const f = await fixture();
  const saved = await f.store.save({ ...f.session, course: f.course, expectedVersion: 0, position });
  expect(saved).toMatchObject({ version: 1, position, course: pointer(f.course) });
  expect(Number.isFinite(saved.updatedAt)).toBe(true);
  expect(await f.open().get({ ...f.session, course: f.course })).toEqual(saved);
  expect(await f.open().latest({ ...f.session, id: f.course.id, revision: 2 })).toEqual(pointer(f.course));
  expect(JSON.stringify(saved)).not.toContain(f.session.cookie);
  expect(JSON.stringify(saved)).not.toMatch(/owner-a|synthetic@example/);
});

test('T70 progress: a renewed signed session for the same identity restores it; another owner cannot read or change it', async () => {
  const f = await fixture(), saved = await f.store.save({ ...f.session, course: f.course, expectedVersion: 0, position });
  const renewed = await sealGoogleSession(identity('owner-a'), sessionSecret, now + 1000);
  expect(await f.open().get({ cookie: renewed, now: now + 1000, course: f.course })).toEqual(saved);
  expect(await f.store.get({ ...f.other, course: f.course })).toBeNull();
  expect(await f.store.latest({ ...f.other, id: f.course.id, revision: 2 })).toBeNull();
  await f.store.save({ ...f.other, course: f.course, expectedVersion: 0, position: { page: 'terms', time: 0, turnIndex: 0 } });
  expect(await f.store.get({ ...f.session, course: f.course })).toEqual(saved);
});

for (const mode of ['missing', 'tampered', 'expired']) test(`T70 progress: ${mode} session cannot read write or select a saved pointer`, async () => {
  const f = await fixture();
  const cookie = mode === 'missing' ? undefined : mode === 'tampered' ? 'not-a-signed-cookie' : f.session.cookie;
  const session = { cookie, now: mode === 'expired' ? now + 10 * 86400_000 : now };
  await expect(f.store.get({ ...session, course: f.course })).rejects.toThrow('Authenticated session required');
  await expect(f.store.save({ ...session, course: f.course, expectedVersion: 0, position })).rejects.toThrow('Authenticated session required');
  await expect(f.store.latest({ ...session, id: f.course.id, revision: 2 })).rejects.toThrow('Authenticated session required');
});

test('T70 progress: material revisions media hashes and course revisions never inherit one another’s progress', async () => {
  const f = await fixture(), original = await f.store.save({ ...f.session, course: f.course, expectedVersion: 0, position });
  for (const changed of [
    { ...f.course, materialsRevision: 4 },
    { ...f.course, revision: 3, media: { ...f.course.media, revision: 3 } },
    { ...f.course, media: { ...f.course.media, sha256: 'b'.repeat(64) } },
    { ...f.course, id: 'other-course', media: { ...f.course.media, courseId: 'other-course' } },
  ]) expect(await f.store.get({ ...f.session, course: changed })).toBeNull();
  expect(await f.store.get({ ...f.session, course: f.course })).toEqual(original);
  expect(await f.store.latest({ ...f.session, id: f.course.id, revision: 3 })).toBeNull();
});

test('T70 progress: an original material version stays selected until a different version is explicitly studied', async () => {
  const f = await fixture();
  await f.store.save({ ...f.session, course: f.course, expectedVersion: 0, position });
  const newer = { ...f.course, materialsRevision: 4 };
  expect(await f.store.get({ ...f.session, course: newer })).toBeNull();
  expect(await f.store.latest({ ...f.session, id: f.course.id, revision: 2 })).toEqual(pointer(f.course));
  await f.store.save({ ...f.session, now: now + 1000, course: newer, expectedVersion: 0, position: { page: 'watch', time: 1, turnIndex: 0 } });
  expect(await f.store.latest({ ...f.session, id: f.course.id, revision: 2 })).toEqual(pointer(newer));
  expect((await f.store.get({ ...f.session, course: f.course })).position).toEqual(position);
});

test('T70 progress: original courses without a material revision restore without becoming a synthetic revision zero', async () => {
  const f = await fixture(), original = structuredClone(f.course); delete original.materialsRevision;
  const saved = await f.store.save({ ...f.session, course: original, expectedVersion: 0, position });
  expect(saved.course).toEqual({ id: original.id, revision: original.revision, mediaSha256: original.media.sha256 });
  expect(saved.course).not.toHaveProperty('materialsRevision');
  expect(await f.open().get({ ...f.session, course: original })).toEqual(saved);
  expect(await f.store.get({ ...f.session, course: f.course })).toBeNull();
  const latest = await f.store.latest({ ...f.session, id: original.id, revision: original.revision });
  expect(latest).toEqual(saved.course); expect(latest).not.toHaveProperty('materialsRevision');
});

test('T70 progress: latest means the last explicit save even when revisiting an older material in the same millisecond', async () => {
  const f = await fixture(), other = { ...f.course, materialsRevision: 4 };
  await f.store.save({ ...f.session, course: f.course, expectedVersion: 0, position });
  await f.store.save({ ...f.session, course: other, expectedVersion: 0, position });
  expect(await f.store.latest({ ...f.session, id: f.course.id, revision: 2 })).toEqual(pointer(other));
  await f.store.save({ ...f.session, course: f.course, expectedVersion: 1, position: { page: 'terms', time: 3, turnIndex: 0 } });
  expect(await f.open().latest({ ...f.session, id: f.course.id, revision: 2 })).toEqual(pointer(f.course));
});

test('T70 progress: equivalent retry after a lost acknowledgement returns the stored version without adding a write', async () => {
  const f = await fixture(), input = { ...f.session, course: f.course, expectedVersion: 0, position };
  const first = await f.store.save(input);
  expect(await f.open().save(input)).toEqual(first);
  expect((await f.store.get({ ...f.session, course: f.course })).version).toBe(1);
});

test('T70 progress: stale or future writes cannot replace a newer learning position', async () => {
  const f = await fixture();
  await f.store.save({ ...f.session, course: f.course, expectedVersion: 0, position });
  const latest = await f.store.save({ ...f.session, course: f.course, expectedVersion: 1, position: { page: 'sentences', time: 8.4, turnIndex: 0 } });
  expect(latest.version).toBe(2);
  for (const expectedVersion of [0, 1, 99]) await expect(f.store.save({ ...f.session, course: f.course, expectedVersion, position })).rejects.toThrow('Progress conflict');
  expect(await f.store.get({ ...f.session, course: f.course })).toEqual(latest);
});

test('T70 progress: a future expected version is rejected even when its position equals the stored position', async () => {
  const f = await fixture(), saved = await f.store.save({ ...f.session, course: f.course, expectedVersion: 0, position });
  await expect(f.store.save({ ...f.session, course: f.course, expectedVersion: 99, position })).rejects.toThrow('Progress conflict');
  expect(await f.open().get({ ...f.session, course: f.course })).toEqual(saved);
});

test('T70 progress: concurrent fresh store writers preserve one accepted position and report the other conflict', async () => {
  const f = await fixture();
  await f.store.save({ ...f.session, course: f.course, expectedVersion: 0, position });
  const inputs = [{ page: 'terms', time: 3, turnIndex: 0 }, { page: 'sentences', time: 8, turnIndex: 0 }];
  const results = await Promise.allSettled(inputs.map(position => f.open().save({ ...f.session, course: f.course, expectedVersion: 1, position })));
  const good = results.filter(result => result.status === 'fulfilled'), bad = results.filter(result => result.status === 'rejected');
  expect(good).toHaveLength(1); expect(bad).toHaveLength(1); expect(bad[0].reason.message).toBe('Progress conflict');
  expect(await f.store.get({ ...f.session, course: f.course })).toEqual(good[0].value);
});

for (const page of ['watch', 'role', 'terms', 'sentences', 'prompt']) test(`T70 progress: persists ${page} without granting autoplay microphone or mastery flags`, async () => {
  const f = await fixture();
  const saved = await f.store.save({ ...f.session, course: f.course, expectedVersion: 0, position: { page, time: 2, turnIndex: 0 } });
  expect(saved.position).toEqual({ page, time: 2, turnIndex: 0 });
  expect(saved.position).not.toHaveProperty('playing'); expect(saved.position).not.toHaveProperty('microphone'); expect(saved.position).not.toHaveProperty('mastered');
});

const invalidPositions = {
  negative: { ...position, time: -0.1 }, beyondDuration: { ...position, time: 12.043 }, notFinite: { ...position, time: NaN },
  wrongPage: { ...position, page: 'free-conversation' }, missingTurn: { ...position, turnIndex: 2 }, fractionalTurn: { ...position, turnIndex: 0.5 },
  extraFlag: { ...position, playing: true }, missingField: { page: 'watch', time: 1 },
};
for (const [name, invalid] of Object.entries(invalidPositions)) test(`T70 progress: rejects ${name} without changing existing progress`, async () => {
  const f = await fixture(), before = await f.store.save({ ...f.session, course: f.course, expectedVersion: 0, position });
  await expect(f.store.save({ ...f.session, course: f.course, expectedVersion: 1, position: invalid })).rejects.toThrow(/Invalid/);
  expect(await f.open().get({ ...f.session, course: f.course })).toEqual(before);
});

test('T70 progress: fractional expected version is invalid and leaves the original record intact', async () => {
  const f = await fixture(), before = await f.store.save({ ...f.session, course: f.course, expectedVersion: 0, position });
  await expect(f.store.save({ ...f.session, course: f.course, expectedVersion: 0.5, position })).rejects.toThrow(/Invalid/);
  expect(await f.store.get({ ...f.session, course: f.course })).toEqual(before);
});

test('T70 progress: corrupted database fails closed and is not reset or overwritten', async () => {
  const f = await fixture();
  await f.store.save({ ...f.session, course: f.course, expectedVersion: 0, position });
  const file = join(f.directory, 'scene-progress.sqlite'), corrupt = Buffer.from('synthetic unreadable progress database');
  await writeFile(file, corrupt);
  await expect(f.open().get({ ...f.session, course: f.course })).rejects.toThrow();
  await expect(f.open().save({ ...f.session, course: f.course, expectedVersion: 0, position })).rejects.toThrow();
  expect(await readFile(file)).toEqual(corrupt);
});

test('T70 progress: caller mutation after save starts cannot switch owner course or learning position', async () => {
  const f = await fixture(), course = structuredClone(f.course), snapshot = { ...position };
  const input = { ...f.session, course, expectedVersion: 0, position: snapshot };
  const work = f.store.save(input);
  input.cookie = f.other.cookie; course.id = 'changed-course'; course.materialsRevision = 99; snapshot.time = 9;
  const saved = await work;
  expect(saved.course).toEqual(pointer(f.course)); expect(saved.position).toEqual(position);
  expect(await f.store.get({ ...f.session, course: f.course })).toEqual(saved);
  expect(await f.store.get({ ...f.other, course: f.course })).toBeNull();
});

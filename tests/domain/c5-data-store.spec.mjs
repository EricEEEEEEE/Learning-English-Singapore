import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataFixture, now } from '../fixtures/c5-data-store.mjs';

// C5 store contracts (T24A deletion, T25A sentence reports, T34A generation records). Real SQLite and private
// media files in a temp directory; two signed synthetic owners; no provider is configured anywhere.
const myData = async f => (await import('../../lib/my-data.ts')).createMyDataStore(f.options);
const reportStore = async f => (await import('../../lib/sentence-reports.ts')).createSentenceReportStore({ directory: f.directory, sessionSecret: f.options.sessionSecret, getCourse: f.getCourse });
async function present(f, session, item) {
  const media = await f.mediaStore.get({ ...session, courseId: item.pointer.id, revision: item.pointer.revision, assetId: 'final' });
  const progress = await f.progress.latest({ ...session, ...item.pointer });
  return { media: !!media, progress: !!progress };
}

// ---- T24A: delete one scene ----

test('T24A / F14.4: deleting one generated scene removes its course, progress, requirement and private media for that owner only', async () => {
  const f = await dataFixture();
  const mine = await f.generated(f.a, '我想在家长会上和老师聊孩子的适应情况。', 480_000);
  const keep = await f.generated(f.a, '我想在诊所改约时间。', 120_000);
  const theirs = await f.generated(f.b, '我想在家长会上和老师聊孩子的适应情况。', 300_000);
  const data = await myData(f);
  expect(await data.deleteScene({ ...f.a, ...mine.pointer })).toEqual({ deleted: true });
  // Course access is gone immediately: no assembled row, no content left in the stored task.
  const listed = await f.tasks.list(f.a);
  expect(listed.filter(task => task.status === 'video_assembled').map(task => task.id)).toEqual([keep.task.id]);
  const stored = f.rawJob(mine.task.id);
  expect(stored.status).toBe('deleted');
  expect(JSON.stringify(stored)).not.toContain('家长会');
  expect(stored).not.toHaveProperty('requirement'); expect(stored).not.toHaveProperty('finalVideo');
  await expect(f.tasks.getCourse({ ...f.a, ...mine.pointer })).rejects.toThrow();
  expect(await present(f, f.a, mine)).toEqual({ media: false, progress: false });
  expect(await f.requirements.get({ ...f.a, revision: mine.requirement.revision })).toBeNull();
  // Same owner's other scene and the other owner's identical scene stay intact.
  expect(await present(f, f.a, keep)).toEqual({ media: true, progress: true });
  expect(await f.requirements.get({ ...f.a, revision: keep.requirement.revision })).toEqual(keep.requirement);
  expect(await present(f, f.b, theirs)).toEqual({ media: true, progress: true });
  expect((await f.tasks.list(f.b)).map(task => task.status)).toEqual(['video_assembled']);
  expect(await f.requirements.get({ ...f.b, revision: theirs.requirement.revision })).toEqual(theirs.requirement);
});

test('T24A / F14.4: a deleted scene keeps its reserved cost so the spending ledger never shrinks, and the same request can be made again', async () => {
  const f = await dataFixture();
  const mine = await f.generated(f.a, '我想在家长会上和老师聊孩子的适应情况。', 480_000);
  const data = await myData(f);
  await data.deleteScene({ ...f.a, ...mine.pointer });
  expect(f.rawJob(mine.task.id)).toMatchObject({ id: mine.task.id, status: 'deleted', reservedMicros: 480_000, providerCalls: 3, deletedAt: now });
  // The deleted task no longer answers for that requirement; asking again starts a new task instead of reviving it.
  expect(await f.tasks.findForRequirement({ ...f.a, requirement: mine.requirement })).toBeNull();
  const again = await f.tasks.create({ ...f.a, goal: mine.requirement.content.description, revision: mine.requirement.revision, requestKey: 'c5-again', requirement: mine.requirement });
  expect(again.id).not.toBe(mine.task.id); expect(again.status).toBe('awaiting_budget');
});

test('T24A / F14.4: deleting a saved course copy removes the copy, its progress and its media, not the other owner copy', async () => {
  const f = await dataFixture();
  const mine = await f.copied(f.a, f.ownerA), theirs = await f.copied(f.b, f.ownerB);
  const data = await myData(f);
  expect(await data.deleteScene({ ...f.a, ...mine.pointer })).toEqual({ deleted: true });
  expect(await f.library.list(f.a)).toEqual([]);
  await expect(f.library.getCourseMedia({ ...f.a, ...mine.pointer })).rejects.toThrow();
  expect(await present(f, f.a, mine)).toEqual({ media: false, progress: false });
  expect((await f.library.list(f.b)).map(course => course.id)).toEqual([theirs.course.id]);
  expect(await present(f, f.b, theirs)).toEqual({ media: true, progress: true });
});

test('T24A / F14.4: another owner cannot delete my scene, and an unknown or anonymous request deletes nothing', async () => {
  const f = await dataFixture();
  const mine = await f.generated(f.a, '我想在家长会上和老师聊孩子的适应情况。', 480_000);
  const data = await myData(f);
  await expect(data.deleteScene({ ...f.b, ...mine.pointer })).rejects.toThrow('Course unavailable');
  await expect(data.deleteScene({ ...f.a, id: 'c5-missing', revision: 1 })).rejects.toThrow('Course unavailable');
  await expect(data.deleteScene({ cookie: null, now, ...mine.pointer })).rejects.toThrow('Authenticated session required');
  await expect(data.deleteScene({ ...f.a, id: '../escape', revision: 1 })).rejects.toThrow(/^Invalid /);
  expect(f.rawJob(mine.task.id).status).toBe('video_assembled');
  expect(await present(f, f.a, mine)).toEqual({ media: true, progress: true });
});

test('T24A / F14.4: a storage failure during deletion is reported as a failure, and a retry finishes the job', async () => {
  const f = await dataFixture();
  const mine = await f.generated(f.a, '我想在家长会上和老师聊孩子的适应情况。', 480_000);
  const data = await myData(f);
  const file = join(f.directory, 'scene-progress.sqlite');
  const { readFileSync } = await import('node:fs'); const original = readFileSync(file);
  writeFileSync(file, 'not a database');
  await expect(data.deleteScene({ ...f.a, ...mine.pointer })).rejects.toThrow();
  writeFileSync(file, original);
  expect(await data.deleteScene({ ...f.a, ...mine.pointer })).toEqual({ deleted: true });
  expect(await present(f, f.a, mine)).toEqual({ media: false, progress: false });
  expect(f.rawJob(mine.task.id).status).toBe('deleted');
});

// ---- T24A: delete all of my learning data ----

test('T24A / F14.4: deleting all my learning data clears every store for me and leaves the other owner untouched', async () => {
  const f = await dataFixture();
  const one = await f.generated(f.a, '我想在家长会上和老师聊孩子的适应情况。', 480_000), two = await f.generated(f.a, '我想在诊所改约时间。', 120_000);
  const copy = await f.copied(f.a, f.ownerA);
  const theirs = await f.generated(f.b, '我想在诊所改约时间。', 300_000), theirCopy = await f.copied(f.b, f.ownerB);
  f.allowCourse(f.ownerA, one.task.id, one.task.revision); f.allowCourse(f.ownerB, theirs.task.id, theirs.task.revision);
  const reports = await reportStore(f);
  await reports.report({ ...f.a, course: one.pointer, lineId: 'line-0', reason: 'unclear', note: '' });
  await reports.report({ ...f.b, course: theirs.pointer, lineId: 'line-0', reason: 'not_local', note: '' });
  const data = await myData(f);
  expect(await data.deleteAll(f.a)).toEqual({ deleted: true });
  expect((await f.tasks.list(f.a)).every(task => task.status === 'deleted')).toBe(true);
  expect(await f.library.list(f.a)).toEqual([]);
  for (const item of [one, two, copy]) expect(await present(f, f.a, item)).toEqual({ media: false, progress: false });
  expect(await f.requirements.get(f.a)).toBeNull();
  expect(await reports.list({ ...f.a, ...one.pointer })).toEqual([]);
  // Owner B keeps everything.
  expect(await present(f, f.b, theirs)).toEqual({ media: true, progress: true });
  expect(await present(f, f.b, theirCopy)).toEqual({ media: true, progress: true });
  expect(await f.requirements.get(f.b)).toEqual(theirs.requirement);
  expect(await reports.list({ ...f.b, ...theirs.pointer })).toHaveLength(1);
  await expect(data.deleteAll({ cookie: 'forged', now })).rejects.toThrow('Authenticated session required');
});

// ---- T34A: generation records ----

test('T34A / F14.1, F14.3: generation records list my tasks with honest status, reserved cost and deletion events, never content of deleted scenes', async () => {
  const f = await dataFixture();
  const ready = await f.generated(f.a, '准备好的课', 480_000);
  const failed = await f.generated(f.a, '失败的课', 250_000, 'video_pending', { videoJobs: [{ segmentIndex: 0, jobId: 'job-x', status: 'failed' }] });
  const unknown = await f.generated(f.a, '结果未知的课', 90_000, 'submission_unknown');
  const removed = await f.generated(f.a, '会被删除的课', 60_000);
  await f.generated(f.b, '别人的课', 999_000);
  const data = await myData(f);
  await data.deleteScene({ ...f.a, ...removed.pointer });
  const records = await data.records(f.a);
  const byId = Object.fromEntries(records.tasks.map(task => [task.id, task]));
  expect(records.tasks).toHaveLength(4);
  expect(byId[ready.task.id]).toEqual({ id: ready.task.id, revision: ready.task.revision, description: '准备好的课', status: 'ready', reservedMicros: 480_000, providerCalls: 3 });
  expect(byId[failed.task.id]).toMatchObject({ description: '失败的课', status: 'failed', reservedMicros: 250_000 });
  expect(byId[unknown.task.id]).toMatchObject({ description: '结果未知的课', status: 'unknown', reservedMicros: 90_000 });
  expect(byId[removed.task.id]).toEqual({ id: removed.task.id, revision: removed.task.revision, description: null, status: 'deleted', reservedMicros: 60_000, providerCalls: 3, deletedAt: now });
  expect(records.deletions).toEqual([{ kind: 'scene', at: now }]);
  expect(JSON.stringify(records)).not.toContain('别人的课');
  expect((await data.records(f.b)).tasks.map(task => task.description)).toEqual(['别人的课']);
  await expect(data.records({ cookie: null, now })).rejects.toThrow('Authenticated session required');
});

test('T34A / F14.4: deleting all data leaves a dated deletion event and the cost ledger rows, without scene text', async () => {
  const f = await dataFixture();
  await f.generated(f.a, '准备好的课', 480_000);
  const data = await myData(f);
  await data.deleteAll(f.a);
  const records = await data.records(f.a);
  expect(records.deletions).toEqual([{ kind: 'all', at: now }]);
  expect(records.tasks).toEqual([expect.objectContaining({ status: 'deleted', reservedMicros: 480_000, description: null })]);
  expect(JSON.stringify(records)).not.toContain('准备好的课');
});

// ---- T25A: sentence reports ----

test('T25A / F12.3: a sentence report is stored per owner and per course revision and never changes the course', async () => {
  const f = await dataFixture();
  f.allowCourse(f.ownerA, 'c5-course', 2, 3); f.allowCourse(f.ownerA, 'c5-course', 2, 4); f.allowCourse(f.ownerB, 'c5-course', 2, 3);
  const reports = await reportStore(f);
  const saved = await reports.report({ ...f.a, course: { id: 'c5-course', revision: 2, materialsRevision: 3 }, lineId: 'line-1', reason: 'wrong_meaning', note: '  翻译好像反了  ' });
  expect(saved).toEqual({ lineId: 'line-1', reason: 'wrong_meaning', note: '翻译好像反了', status: 'received', at: now });
  expect(await reports.list({ ...f.a, id: 'c5-course', revision: 2, materialsRevision: 3 })).toEqual([saved]);
  expect(await reports.list({ ...f.a, id: 'c5-course', revision: 2, materialsRevision: 4 })).toEqual([]);
  expect(await reports.list({ ...f.b, id: 'c5-course', revision: 2, materialsRevision: 3 })).toEqual([]);
  // The only course access is a read through the private reader.
  expect(f.courseReads.map(read => [read.id, read.revision, read.materialsRevision])).toEqual([['c5-course', 2, 3]]);
});

test('T25A / F12.3: reports accept only the three reasons, a short note and a real line of a course I can read', async () => {
  const f = await dataFixture();
  f.allowCourse(f.ownerA, 'c5-course', 2, 3);
  const reports = await reportStore(f), course = { id: 'c5-course', revision: 2, materialsRevision: 3 };
  for (const reason of ['unclear', 'not_local', 'wrong_meaning']) expect((await reports.report({ ...f.a, course, lineId: 'line-0', reason })).reason).toBe(reason);
  expect(await reports.list({ ...f.a, ...course })).toHaveLength(1);
  await expect(reports.report({ ...f.a, course, lineId: 'line-0', reason: 'regenerate' })).rejects.toThrow(/^Invalid /);
  await expect(reports.report({ ...f.a, course, lineId: 'line-0', reason: 'unclear', note: 'x'.repeat(201) })).rejects.toThrow(/^Invalid /);
  await expect(reports.report({ ...f.a, course, lineId: 'line-9', reason: 'unclear' })).rejects.toThrow(/^Invalid /);
  await expect(reports.report({ ...f.b, course, lineId: 'line-0', reason: 'unclear' })).rejects.toThrow('Course unavailable');
  await expect(reports.report({ cookie: null, now, course, lineId: 'line-0', reason: 'unclear' })).rejects.toThrow('Authenticated session required');
  expect(await reports.list({ ...f.b, ...course })).toEqual([]);
});

test('T24A / F14.4: deleting one scene also removes my reports for that course only', async () => {
  const f = await dataFixture();
  const one = await f.generated(f.a, '第一课', 1), two = await f.generated(f.a, '第二课', 1);
  f.allowCourse(f.ownerA, one.task.id, one.task.revision); f.allowCourse(f.ownerA, two.task.id, two.task.revision);
  const reports = await reportStore(f);
  await reports.report({ ...f.a, course: one.pointer, lineId: 'line-0', reason: 'unclear' });
  await reports.report({ ...f.a, course: two.pointer, lineId: 'line-1', reason: 'not_local' });
  await (await myData(f)).deleteScene({ ...f.a, ...one.pointer });
  expect(await reports.list({ ...f.a, ...one.pointer })).toEqual([]);
  expect(await reports.list({ ...f.a, ...two.pointer })).toHaveLength(1);
});

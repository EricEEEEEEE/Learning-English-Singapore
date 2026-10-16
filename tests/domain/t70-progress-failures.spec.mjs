import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { storageFixture, position } from '../fixtures/t70-learning-library.mjs';

for (const bad of ['not-json', JSON.stringify({ page: 'not-a-page', time: 1, turnIndex: 0 })]) test(`T70 storage regression: valid SQLite with ${bad === 'not-json' ? 'bad JSON' : 'invalid position'} cannot be silently reset`, async () => {
  const f = await storageFixture();
  await f.progress.save({ ...f.session, course: f.course, expectedVersion: 0, position });
  const file = join(f.directory, 'scene-progress.sqlite'), db = new DatabaseSync(file);
  try { expect(db.prepare('UPDATE scene_progress SET position=?').run(bad).changes).toBe(1); } finally { db.close(); }
  await expect(f.openProgress().get({ ...f.session, course: f.course })).rejects.toThrow('Stored progress unavailable');
  await expect(f.openProgress().save({ ...f.session, course: f.course, expectedVersion: 0, position })).rejects.toThrow('Stored progress unavailable');
  await expect(f.openProgress().latest({ ...f.session, id: f.course.id, revision: 2 })).rejects.toThrow('Stored progress unavailable');
  const check = new DatabaseSync(file); try { expect(check.prepare('SELECT position FROM scene_progress').get().position).toBe(bad); } finally { check.close(); }
});

test('T70 storage regression: actual SQLite write rejection preserves the old value and permits a subsequent valid save', async () => {
  const f = await storageFixture(), before = await f.progress.save({ ...f.session, course: f.course, expectedVersion: 0, position });
  const db = new DatabaseSync(join(f.directory, 'scene-progress.sqlite'));
  // Real SQLite statement failure in an isolated QA database, not a disk-full claim.
  try { db.exec("CREATE TRIGGER t70_reject_write BEFORE UPDATE ON scene_progress WHEN json_extract(NEW.position,'$.time')>9 BEGIN SELECT RAISE(ABORT,'synthetic write rejection'); END;"); } finally { db.close(); }
  await expect(f.openProgress().save({ ...f.session, course: f.course, expectedVersion: 1, position: { ...position, time: 10 } })).rejects.toThrow('synthetic write rejection');
  expect(await f.openProgress().get({ ...f.session, course: f.course })).toEqual(before);
  const after = await f.openProgress().save({ ...f.session, course: f.course, expectedVersion: 1, position: { ...position, time: 3 } });
  expect(after.version).toBe(2); expect(after.position.time).toBe(3);
});

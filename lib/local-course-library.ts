import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { ownerIdFromSessionCookie } from './private-owner';
import { validateSceneCourse } from './scene-course';
import type { readApprovedCourseCopy } from './local-course-copy';
import type { createPrivateMediaStore } from './private-media-store';

type Bundle = Awaited<ReturnType<typeof readApprovedCourseCopy>>;
type Course = Bundle['course'];
type Session = { cookie?: string | null; now: number };
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

// Trusted local import only: callers supply the bundle from readApprovedCourseCopy.
// No browser write endpoint or generation provider is exposed here.
export function createLocalCourseLibrary({ directory, sessionSecret, mediaStore }: {
  directory: string; sessionSecret: string; mediaStore: ReturnType<typeof createPrivateMediaStore>;
}) {
  if (!directory || !sessionSecret || !mediaStore) throw new Error('Library configuration required');
  function transaction<T>(work: (db: DatabaseSync) => T): T {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = join(directory, 'course-copies.sqlite');
    const db = new DatabaseSync(file, { timeout: 5000 });
    try {
      chmodSync(file, 0o600);
      db.exec('PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS copies (id TEXT PRIMARY KEY, owner TEXT NOT NULL, source_key TEXT NOT NULL, body TEXT NOT NULL, UNIQUE(owner,source_key)); BEGIN IMMEDIATE;');
      const result = work(db); db.exec('COMMIT'); return result;
    } finally { db.close(); }
  }
  async function owner(session: Session) {
    const id = await ownerIdFromSessionCookie(session.cookie, sessionSecret, session.now);
    if (!id) throw new Error('Authenticated session required');
    return id;
  }
  async function read(input: Session & { id: string; revision: number }) {
    const request = { ...input };
    const id = await owner(request);
    const row = transaction(db => db.prepare('SELECT body FROM copies WHERE owner=? AND id=?').get(id, request.id));
    if (!row) throw new Error('Course unavailable');
    const course = JSON.parse(String(row.body)) as Course;
    if (course.revision !== request.revision) throw new Error('Course unavailable');
    const media = await mediaStore.get({ cookie: request.cookie, now: request.now, courseId: course.id, revision: course.revision, assetId: course.media.assetId });
    if (!media || media.sha256 !== course.media.sha256 || hash(media.bytes) !== course.media.sha256) throw new Error('Course media unavailable');
    return { course, media };
  }
  return {
    async importCopy(input: Session & { bundle: Bundle }) {
      const { cookie, now } = input;
      const bundle = structuredClone(input.bundle);
      const target = await owner({ cookie, now });
      const { approval, course, media } = bundle;
      if (!approval || target !== approval.targetOwner || !approval.sourceOwner
        || course.id !== approval.courseId || course.revision !== approval.revision
        || !('materialsRevision' in course) || course.materialsRevision !== approval.materialsRevision
        || !Number.isSafeInteger(approval.materialsRevision) || approval.materialsRevision < 1
        || course.media.courseId !== course.id || course.media.revision !== course.revision
        || media.courseId !== course.id || media.revision !== course.revision || media.assetId !== course.media.assetId
        || media.sha256 !== approval.mediaSha256 || course.media.sha256 !== approval.mediaSha256
        || !(media.bytes instanceof Uint8Array) || media.size !== media.bytes.length || hash(media.bytes) !== approval.mediaSha256) throw new Error('Copy source mismatch');
      const version = String(course.revision);
      if (!Number.isSafeInteger(course.revision) || course.revision < 1 || !['ai-generated', 'test-fixture'].includes(course.source)
        || !Array.isArray(course.lines) || course.lines.some(line => line.revision !== course.revision)
        || !validateSceneCourse({ ...course, version, source: course.source === 'test-fixture' ? 'test-fixture' : 'ai-sample',
          media: { src: '/media/copy-validation.mp4', duration: course.media.duration, version },
          lines: course.lines.map(line => ({ ...line, version })) }).ok) throw new Error('Invalid copy materials');
      const sourceKey = hash(JSON.stringify([approval.sourceOwner, approval.courseId, approval.revision, approval.mediaSha256, approval.materialsRevision]));
      const id = `copy-${hash(JSON.stringify([target, sourceKey]))}`;
      const copied: Course = { ...course, id, media: { ...course.media, courseId: id } };
      const previous = transaction(db => db.prepare('SELECT body FROM copies WHERE owner=? AND source_key=?').get(target, sourceKey));
      if (previous && !isDeepStrictEqual(JSON.parse(String(previous.body)), copied)) throw new Error('Copy content conflict');
      await mediaStore.put({ cookie, now, courseId: id, revision: copied.revision, assetId: copied.media.assetId, bytes: media.bytes, sha256: media.sha256 });
      const stored = await mediaStore.get({ cookie, now, courseId: id, revision: copied.revision, assetId: copied.media.assetId });
      if (!stored || stored.sha256 !== media.sha256 || stored.size !== media.size || hash(stored.bytes) !== media.sha256) throw new Error('Copy media unavailable');
      return transaction(db => {
        const existing = db.prepare('SELECT body FROM copies WHERE owner=? AND source_key=?').get(target, sourceKey);
        if (existing && !isDeepStrictEqual(JSON.parse(String(existing.body)), copied)) throw new Error('Copy content conflict');
        if (!existing) db.prepare('INSERT INTO copies VALUES(?,?,?,?)').run(id, target, sourceKey, JSON.stringify(copied));
        return copied;
      });
    },
    async remove(input: Session & { id: string }) {
      const id = await owner(input);
      return transaction(db => Number(db.prepare('DELETE FROM copies WHERE owner=? AND id=?').run(id, input.id).changes) > 0);
    },
    async removeAll(input: Session) {
      const id = await owner(input);
      return transaction(db => { db.prepare('DELETE FROM copies WHERE owner=?').run(id); });
    },
    async list(input: Session): Promise<Course[]> {
      const id = await owner(input);
      return transaction(db => db.prepare('SELECT body FROM copies WHERE owner=? ORDER BY rowid DESC').all(id).map(row => JSON.parse(String(row.body))));
    },
    async getCourse(input: Session & { id: string; revision: number; materialsRevision: number }): Promise<Course> {
      const request = { ...input };
      const { course } = await read(request);
      if (!('materialsRevision' in course) || course.materialsRevision !== request.materialsRevision) throw new Error('Course unavailable');
      return course;
    },
    async getCourseMedia(input: Session & { id: string; revision: number }) {
      return (await read(input)).media;
    },
  };
}

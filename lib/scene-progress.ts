import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { ownerIdFromSessionCookie } from './private-owner';

type Session = { cookie?: string | null; now?: number };
type Course = { id: string; revision: number; materialsRevision?: number; media: { sha256: string; duration: number }; turns: unknown[] };
export type SceneProgressPointer = { id: string; revision: number; materialsRevision?: number; mediaSha256: string };
export type SceneProgressPosition = { page: 'watch' | 'role' | 'terms' | 'sentences' | 'prompt' | 'practice'; time: number; turnIndex: number };
export type SceneProgressRecord = { course: SceneProgressPointer; version: number; position: SceneProgressPosition; updatedAt: number };
type Row = { id: unknown; revision: unknown; materials: unknown; media_hash: unknown; version: unknown; position: unknown; updated_at: unknown };
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(value);
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const nonnegative = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

function coursePointer(course: Course): SceneProgressPointer {
  if (!course || !identifier(course.id) || !positive(course.revision)
    || course.materialsRevision !== undefined && !positive(course.materialsRevision)
    || !sha(course.media?.sha256) || !Number.isFinite(course.media.duration) || course.media.duration <= 0
    || !Array.isArray(course.turns) || !course.turns.length) throw new Error('Invalid progress course');
  return { id: course.id, revision: course.revision, ...(course.materialsRevision === undefined ? {} : { materialsRevision: course.materialsRevision }), mediaSha256: course.media.sha256 };
}
function positionValue(value: unknown, course?: Course): SceneProgressPosition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid progress position');
  const p = value as SceneProgressPosition;
  if (Object.keys(p).length !== 3 || !['page', 'time', 'turnIndex'].every(key => Object.hasOwn(p, key))
    || !['watch', 'role', 'terms', 'sentences', 'prompt', 'practice'].includes(p.page)
    || typeof p.time !== 'number' || !Number.isFinite(p.time) || p.time < 0 || !nonnegative(p.turnIndex)
    || course && (p.time > course.media.duration || p.turnIndex >= course.turns.length)) throw new Error('Invalid progress position');
  return { page: p.page, time: p.time, turnIndex: p.turnIndex };
}
function stored(row: Row, course?: Course): SceneProgressRecord {
  try {
    if (!identifier(row.id) || !positive(row.revision) || !nonnegative(row.materials) || !sha(row.media_hash)
      || !positive(row.version) || !nonnegative(row.updated_at) || typeof row.position !== 'string') throw new Error();
    const pointer = { id: row.id, revision: row.revision, ...(row.materials === 0 ? {} : { materialsRevision: row.materials }), mediaSha256: row.media_hash };
    if (course && !isDeepStrictEqual(pointer, coursePointer(course))) throw new Error();
    return { course: pointer, version: row.version, position: positionValue(JSON.parse(row.position), course), updatedAt: row.updated_at };
  } catch { throw new Error('Stored progress unavailable'); }
}

// Internal store: the caller must first authorize and read the actual private
// course. These positions neither grant course access nor request playback.
export function createSceneProgressStore({ directory, sessionSecret }: { directory: string; sessionSecret: string }) {
  if (!directory || !sessionSecret) throw new Error('Progress store configuration required');
  async function owner(input: Session) {
    const id = await ownerIdFromSessionCookie(input.cookie, sessionSecret, input.now);
    if (!id) throw new Error('Authenticated session required');
    return id;
  }
  function transact<T>(work: (db: DatabaseSync) => T): T {
    mkdirSync(directory, { recursive: true, mode: 0o700 }); chmodSync(directory, 0o700);
    const file = join(directory, 'scene-progress.sqlite'), db = new DatabaseSync(file, { timeout: 5000 });
    try {
      chmodSync(file, 0o600);
      db.exec('PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS scene_progress (owner TEXT NOT NULL, id TEXT NOT NULL, revision INTEGER NOT NULL, materials INTEGER NOT NULL, media_hash TEXT NOT NULL, version INTEGER NOT NULL, position TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(owner,id,revision,materials,media_hash)); BEGIN IMMEDIATE;');
      const result = work(db); db.exec('COMMIT'); return result;
    } finally { db.close(); }
  }
  function read(db: DatabaseSync, ownerId: string, pointer: SceneProgressPointer) {
    return db.prepare('SELECT id,revision,materials,media_hash,version,position,updated_at FROM scene_progress WHERE owner=? AND id=? AND revision=? AND materials=? AND media_hash=?')
      .get(ownerId, pointer.id, pointer.revision, pointer.materialsRevision ?? 0, pointer.mediaSha256) as Row | undefined;
  }
  return {
    // Learner-requested deletion (C5): every saved position of one course, or all of this owner's positions.
    async removeCourse(input: Session & { id: string }) {
      const request = { ...input }, id = await owner(request);
      if (!identifier(request.id)) throw new Error('Invalid progress course');
      return transact(db => { db.prepare('DELETE FROM scene_progress WHERE owner=? AND id=?').run(id, request.id); });
    },
    async removeAll(input: Session) {
      const id = await owner(input);
      return transact(db => { db.prepare('DELETE FROM scene_progress WHERE owner=?').run(id); });
    },
    async get(input: Session & { course: Course }): Promise<SceneProgressRecord | null> {
      const request = { cookie: input.cookie, now: input.now, course: structuredClone(input.course) };
      const id = await owner(request), pointer = coursePointer(request.course);
      return transact(db => { const row = read(db, id, pointer); return row ? stored(row, request.course) : null; });
    },
    async latest(input: Session & { id: string; revision: number }): Promise<SceneProgressPointer | null> {
      const request = { ...input }, id = await owner(request);
      if (!identifier(request.id) || !positive(request.revision)) throw new Error('Invalid progress course');
      return transact(db => {
        const row = db.prepare('SELECT id,revision,materials,media_hash,version,position,updated_at FROM scene_progress WHERE owner=? AND id=? AND revision=? ORDER BY updated_at DESC,rowid DESC LIMIT 1')
          .get(id, request.id, request.revision) as Row | undefined;
        return row ? stored(row).course : null;
      });
    },
    async save(input: Session & { course: Course; expectedVersion: number; position: unknown }): Promise<SceneProgressRecord> {
      const request = { cookie: input.cookie, now: input.now ?? Date.now(), course: structuredClone(input.course), expectedVersion: input.expectedVersion, position: structuredClone(input.position) };
      const id = await owner(request), pointer = coursePointer(request.course), position = positionValue(request.position, request.course);
      if (!nonnegative(request.expectedVersion) || !nonnegative(request.now)) throw new Error('Invalid progress version');
      return transact(db => {
        const row = read(db, id, pointer), previous = row ? stored(row, request.course) : null;
        const version = previous?.version ?? 0;
        if (request.expectedVersion > version) throw new Error('Progress conflict');
        if (previous && request.expectedVersion < version && isDeepStrictEqual(previous.position, position)) return previous;
        if (request.expectedVersion !== version) throw new Error('Progress conflict');
        const latest = db.prepare('SELECT MAX(updated_at) AS stamp FROM scene_progress WHERE owner=? AND id=? AND revision=?').get(id, pointer.id, pointer.revision);
        const stamp = latest?.stamp ?? -1;
        if (typeof stamp !== 'number' || !Number.isSafeInteger(stamp) || stamp < -1) throw new Error('Stored progress unavailable');
        // Order successful activity within the transaction, including saves in
        // the same clock millisecond or an older material row revisited later.
        const updatedAt = Math.max(request.now, stamp + 1);
        if (!positive(version + 1) || !nonnegative(updatedAt)) throw new Error('Progress limit');
        const saved = { course: pointer, version: version + 1, position, updatedAt };
        db.prepare('INSERT INTO scene_progress VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(owner,id,revision,materials,media_hash) DO UPDATE SET version=excluded.version,position=excluded.position,updated_at=excluded.updated_at')
          .run(id, pointer.id, pointer.revision, pointer.materialsRevision ?? 0, pointer.mediaSha256, saved.version, JSON.stringify(position), updatedAt);
        return saved;
      });
    },
  };
}

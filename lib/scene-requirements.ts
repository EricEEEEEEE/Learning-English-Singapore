import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { ownerIdFromSessionCookie } from './private-owner';
import { parseSceneRequirementContent, type SceneRequirement } from './scene-requirement-content';

type Session = { cookie?: string | null; now?: number };

export function createSceneRequirementStore({ directory, sessionSecret }: { directory: string; sessionSecret: string }) {
  if (!directory || !sessionSecret) throw new Error('Store configuration required');
  async function owner(input: Session) {
    const id = await ownerIdFromSessionCookie(input.cookie, sessionSecret, input.now);
    if (!id) throw new Error('Authenticated session required');
    return id;
  }
  function transact<T>(work: (db: DatabaseSync) => T): T {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
    const path = join(directory, 'requirements.sqlite');
    const db = new DatabaseSync(path, { timeout: 5000 });
    try {
      chmodSync(path, 0o600);
      db.exec('PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS requirements (owner TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(owner,revision)); BEGIN IMMEDIATE;');
      const result = work(db);
      db.exec('COMMIT');
      return result;
    } finally { db.close(); }
  }
  function read(db: DatabaseSync, ownerId: string, revision?: number): SceneRequirement | null {
    const row = revision === undefined
      ? db.prepare('SELECT revision,body FROM requirements WHERE owner=? ORDER BY revision DESC LIMIT 1').get(ownerId)
      : db.prepare('SELECT revision,body FROM requirements WHERE owner=? AND revision=?').get(ownerId, revision);
    if (!row) return null;
    try { return { revision: Number(row.revision), content: parseSceneRequirementContent(JSON.parse(String(row.body))) }; }
    catch { throw new Error('Stored requirement unavailable'); }
  }
  return {
    async get(input: Session & { revision?: number }) {
      const id = await owner(input);
      if (input.revision !== undefined && (!Number.isSafeInteger(input.revision) || input.revision < 1)) throw new Error('Invalid revision');
      return transact(db => read(db, id, input.revision));
    },
    async save(input: Session & { expectedRevision: number; content: unknown }): Promise<SceneRequirement> {
      const id = await owner(input);
      if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error('Invalid revision');
      const content = parseSceneRequirementContent(input.content);
      return transact(db => {
        const current = read(db, id);
        const revision = current?.revision ?? 0;
        if (current && input.expectedRevision <= revision && JSON.stringify(current.content) === JSON.stringify(content)) return current;
        if (input.expectedRevision !== revision) throw new Error('Requirement conflict');
        if (!Number.isSafeInteger(revision + 1)) throw new Error('Invalid revision');
        db.prepare('INSERT INTO requirements VALUES(?,?,?)').run(id, revision + 1, JSON.stringify(content));
        return { revision: revision + 1, content };
      });
    },
  };
}

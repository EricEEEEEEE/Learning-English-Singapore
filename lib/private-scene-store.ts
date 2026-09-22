import {
  createOwnedScene, ownerIdFromSessionCookie,
  type PrivateSceneRecord, type VerifiedOwnerId,
} from './private-owner';

type SessionInput = { cookie: string | null | undefined; now?: number };
type SceneInput = { goalRevision: number; playbackPositionMs: number };
type Lookup = SessionInput & { id: string };

function validRevision(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1;
}

function validPosition(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function createPrivateSceneStore({ sessionSecret }: { sessionSecret: string }) {
  const records = new Map<string, PrivateSceneRecord>();

  async function authenticatedOwner({ cookie, now }: SessionInput): Promise<VerifiedOwnerId> {
    const owner = await ownerIdFromSessionCookie(cookie, sessionSecret, now);
    if (!owner) throw new Error('Authenticated session required');
    return owner;
  }

  function activeRecord(id: string, ownerId: VerifiedOwnerId): PrivateSceneRecord | null {
    const record = records.get(id);
    return record?.ownerId === ownerId && record.revokedAt === null ? record : null;
  }

  return {
    persistence: 'memory-only' as const,

    async create(input: SessionInput & SceneInput): Promise<PrivateSceneRecord> {
      const ownerId = await authenticatedOwner(input);
      const record = createOwnedScene(ownerId, input);
      records.set(record.id, record);
      return { ...record };
    },

    async get(input: Lookup): Promise<PrivateSceneRecord | null> {
      const ownerId = await authenticatedOwner(input);
      const record = activeRecord(input.id, ownerId);
      return record ? { ...record } : null;
    },

    async list(input: SessionInput): Promise<PrivateSceneRecord[]> {
      const ownerId = await authenticatedOwner(input);
      return [...records.values()]
        .filter(record => record.ownerId === ownerId && record.revokedAt === null)
        .map(record => ({ ...record }));
    },

    async update(input: Lookup & Partial<SceneInput>): Promise<PrivateSceneRecord | null> {
      const ownerId = await authenticatedOwner(input);
      const record = activeRecord(input.id, ownerId);
      if (!record) return null;
      const goalRevision = input.goalRevision ?? record.goalRevision;
      const playbackPositionMs = input.playbackPositionMs ?? record.playbackPositionMs;
      if (!validRevision(goalRevision) || !validPosition(playbackPositionMs)) throw new Error('Invalid scene progress');
      const updated = { ...record, goalRevision, playbackPositionMs };
      records.set(record.id, updated);
      return { ...updated };
    },

    async revoke(input: Lookup): Promise<boolean> {
      const ownerId = await authenticatedOwner(input);
      const record = activeRecord(input.id, ownerId);
      if (!record) return false;
      records.set(record.id, { ...record, revokedAt: input.now ?? Date.now() });
      return true;
    },

    async delete(input: Lookup): Promise<boolean> {
      const ownerId = await authenticatedOwner(input);
      const record = records.get(input.id);
      if (!record || record.ownerId !== ownerId) return false;
      records.delete(record.id);
      return true;
    },
  };
}

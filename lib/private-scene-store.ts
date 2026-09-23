import {
  createOwnedScene, ownerIdFromSessionCookie,
  type PrivateSceneRecord, type VerifiedOwnerId,
} from './private-owner';
import { validateLessonCandidate } from './lesson-contract';
import { createFixedLessonSession, restoreFixedLessonSession, type FixedLessonProgress } from './fixed-lesson-practice';

type SessionInput = { cookie: string | null | undefined; now?: number };
type SceneInput = { goalRevision: number; playbackPositionMs: number; lesson?: unknown; learnerRole?: string; lessonProgress?: unknown };
type Lookup = SessionInput & { id: string };

function validRevision(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1;
}

function validPosition(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function createPrivateSceneStore({ sessionSecret }: { sessionSecret: string }) {
  const records = new Map<string, PrivateSceneRecord>();
  const deletedOwners = new Map<string, VerifiedOwnerId>();

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
      if (records.size >= 1000 || [...records.values()].filter(record => record.ownerId === ownerId).length >= 20) {
        throw new Error('Temporary record limit reached');
      }
      const record = createOwnedScene(ownerId, input);
      if (input.lesson !== undefined) {
        const validated = validateLessonCandidate(input.lesson);
        if (!validated.ok || validated.value.goal_revision !== input.goalRevision) throw new Error('Invalid lesson candidate or goal revision');
        const session = createFixedLessonSession(validated.value, input.learnerRole ?? '');
        record.lesson = validated.value;
        record.lessonProgress = {
          lesson_revision: session.lesson_revision, sentence_id: session.material.sentences[0].id,
          mode: session.mode, learner_role_id: session.learner_role_id,
        };
      } else if (input.lessonProgress !== undefined || input.learnerRole !== undefined) throw new Error('Invalid lesson input');
      records.set(record.id, record);
      return structuredClone(record);
    },

    async get(input: Lookup): Promise<PrivateSceneRecord | null> {
      const ownerId = await authenticatedOwner(input);
      const record = activeRecord(input.id, ownerId);
      return record ? structuredClone(record) : null;
    },

    async list(input: SessionInput): Promise<PrivateSceneRecord[]> {
      const ownerId = await authenticatedOwner(input);
      return [...records.values()]
        .filter(record => record.ownerId === ownerId && record.revokedAt === null)
        .map(record => structuredClone(record));
    },

    async update(input: Lookup & Partial<SceneInput>): Promise<PrivateSceneRecord | null> {
      const ownerId = await authenticatedOwner(input);
      const record = activeRecord(input.id, ownerId);
      if (!record) return null;
      if (input.lesson !== undefined || input.learnerRole !== undefined) throw new Error('Invalid change to fixed lesson');
      const goalRevision = input.goalRevision ?? record.goalRevision;
      const playbackPositionMs = input.playbackPositionMs ?? record.playbackPositionMs;
      if (!validRevision(goalRevision) || !validPosition(playbackPositionMs)) throw new Error('Invalid scene progress');
      if (record.lesson && goalRevision !== record.lesson.goal_revision) throw new Error('Invalid fixed lesson goal revision');
      const updated = { ...record, goalRevision, playbackPositionMs };
      if (input.lessonProgress !== undefined) {
        if (!record.lesson || !record.lessonProgress) throw new Error('Invalid lesson progress without lesson');
        const restored = restoreFixedLessonSession(record.lesson, input.lessonProgress);
        if (restored.learner_role_id !== record.lessonProgress.learner_role_id) throw new Error('Invalid change to learner role');
        updated.lessonProgress = {
          lesson_revision: restored.lesson_revision, sentence_id: restored.material.sentences[restored.position].id,
          mode: restored.mode, learner_role_id: restored.learner_role_id,
        } satisfies FixedLessonProgress;
      }
      records.set(record.id, updated);
      return structuredClone(updated);
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
      deletedOwners.set(record.id, ownerId);
      if (deletedOwners.size > 1000) deletedOwners.delete(deletedOwners.keys().next().value!);
      return true;
    },

    async wasDeletedBy(input: Lookup): Promise<boolean> {
      const ownerId = await authenticatedOwner(input);
      return deletedOwners.get(input.id) === ownerId;
    },
  };
}

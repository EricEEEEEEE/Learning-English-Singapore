import { createHash, randomUUID } from 'node:crypto';
import { openGoogleSession } from './google-auth';
import type { SyntheticLesson } from './lesson-contract';
import type { FixedLessonProgress } from './fixed-lesson-practice';

declare const verifiedOwnerBrand: unique symbol;
export type VerifiedOwnerId = string & { readonly [verifiedOwnerBrand]: true };

export type PrivateSceneRecord = {
  id: string;
  ownerId: VerifiedOwnerId;
  goalRevision: number;
  playbackPositionMs: number;
  revokedAt: number | null;
  lesson?: SyntheticLesson;
  lessonProgress?: FixedLessonProgress;
};

export async function ownerIdFromSessionCookie(
  cookie: string | null | undefined,
  sessionSecret: string,
  now = Date.now(),
): Promise<VerifiedOwnerId | null> {
  const session = await openGoogleSession(cookie, sessionSecret, now);
  if (!session?.providerSubject) return null;
  // This is an internal identifier, not an authorization token. It remains
  // stable when the cookie encryption secret is rotated.
  const subject = `google\0${session.issuer}\0${session.providerSubject}`;
  return `usr_${createHash('sha256').update(subject).digest('base64url')}` as VerifiedOwnerId;
}

export function createOwnedScene(
  ownerId: VerifiedOwnerId,
  input: { goalRevision: number; playbackPositionMs: number },
): PrivateSceneRecord {
  if (!ownerId || !ownerId.startsWith('usr_')) throw new Error('Verified owner is required');
  if (!Number.isSafeInteger(input.goalRevision) || input.goalRevision < 1) throw new Error('Invalid goal revision');
  if (!Number.isSafeInteger(input.playbackPositionMs) || input.playbackPositionMs < 0) throw new Error('Invalid playback position');
  return {
    id: randomUUID(), ownerId, goalRevision: input.goalRevision,
    playbackPositionMs: input.playbackPositionMs, revokedAt: null,
  };
}

export function requireOwnedScene(record: PrivateSceneRecord, ownerId: VerifiedOwnerId | null): PrivateSceneRecord {
  if (!ownerId || record.ownerId !== ownerId) throw new Error('Scene access forbidden: owner mismatch');
  if (record.revokedAt !== null) throw new Error('Scene access forbidden: record revoked');
  return record;
}

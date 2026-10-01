import { ownerIdFromSessionCookie } from './private-owner';

type CopyApproval = {
  sourceOwner: string;
  targetOwner: string;
  courseId: string;
  revision: number;
  mediaSha256: string;
  materialsRevision: number;
};
type Session = { cookie?: string | null; secret: string };

// Internal local operator boundary. Approval and secrets must come from trusted
// server configuration, never from a browser request. This does not copy data.
export async function authorizeLocalCourseCopy(input: {
  source: Session; target: Session; now: number; approval: CopyApproval;
}): Promise<CopyApproval> {
  const approval = input?.approval;
  if (!approval || !input.source?.secret || !input.target?.secret || !Number.isFinite(input.now)
    || typeof approval.sourceOwner !== 'string' || typeof approval.targetOwner !== 'string'
    || typeof approval.courseId !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(approval.courseId)
    || !Number.isSafeInteger(approval.revision) || approval.revision < 1
    || typeof approval.mediaSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(approval.mediaSha256)
    || !Number.isSafeInteger(approval.materialsRevision) || approval.materialsRevision < 1) throw new Error('Invalid copy approval');
  // Capture the approved values before awaiting identity verification.
  const approved = { sourceOwner: approval.sourceOwner, targetOwner: approval.targetOwner,
    courseId: approval.courseId, revision: approval.revision,
    mediaSha256: approval.mediaSha256, materialsRevision: approval.materialsRevision };
  const { source, target, now } = input;
  const sourceCookie = source.cookie, sourceSecret = source.secret;
  const targetCookie = target.cookie, targetSecret = target.secret;
  const [sourceOwner, targetOwner] = await Promise.all([
    ownerIdFromSessionCookie(sourceCookie, sourceSecret, now),
    ownerIdFromSessionCookie(targetCookie, targetSecret, now),
  ]);
  if (!sourceOwner || !targetOwner || sourceOwner !== approved.sourceOwner || targetOwner !== approved.targetOwner) throw new Error('Copy identity mismatch');
  return approved;
}

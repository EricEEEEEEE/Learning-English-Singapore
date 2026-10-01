import { ownerIdFromSessionCookie } from './private-owner';
import { createHash } from 'node:crypto';
import { validateSceneCourse } from './scene-course';
import type { createGenerationTaskStore } from './generation-tasks';

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

export async function readApprovedCourseCopy(
  input: Parameters<typeof authorizeLocalCourseCopy>[0],
  sourceStore: Pick<ReturnType<typeof createGenerationTaskStore>, 'getCourse' | 'getCourseMedia'>,
) {
  const captured = { source: { ...input.source }, target: { ...input.target }, now: input.now, approval: { ...input.approval } };
  const approval = await authorizeLocalCourseCopy(captured);
  const request = { cookie: captured.source.cookie, now: captured.now, id: approval.courseId, revision: approval.revision };
  const course = structuredClone(await sourceStore.getCourse({ ...request, materialsRevision: approval.materialsRevision }));
  if (course.id !== approval.courseId || course.revision !== approval.revision
    || !('materialsRevision' in course) || course.materialsRevision !== approval.materialsRevision
    || course.media.courseId !== approval.courseId || course.media.revision !== approval.revision
    || course.media.sha256 !== approval.mediaSha256
    || !/^[a-zA-Z0-9_-]{1,120}$/.test(course.media.assetId)
    || !['ai-generated', 'test-fixture'].includes(course.source)
    || !Array.isArray(course.lines) || course.lines.some(line => line.revision !== approval.revision)) throw new Error('Copy source mismatch');
  const version = String(approval.revision);
  const checked = validateSceneCourse({ ...course, version,
    source: course.source === 'test-fixture' ? 'test-fixture' : 'ai-sample',
    media: { src: '/media/copy-validation.mp4', duration: course.media.duration, version },
    lines: course.lines.map(line => ({ ...line, version })),
  });
  if (!checked.ok) throw new Error('Invalid copy materials');
  const media = structuredClone(await sourceStore.getCourseMedia(request));
  if (media.courseId !== approval.courseId || media.revision !== approval.revision
    || media.assetId !== course.media.assetId || media.sha256 !== approval.mediaSha256
    || !(media.bytes instanceof Uint8Array) || !Number.isSafeInteger(media.size)
    || media.size <= 0 || media.size > 100_000_000 || media.bytes.length !== media.size
    || createHash('sha256').update(media.bytes).digest('hex') !== approval.mediaSha256) throw new Error('Invalid copy media');
  return { approval, course, media };
}

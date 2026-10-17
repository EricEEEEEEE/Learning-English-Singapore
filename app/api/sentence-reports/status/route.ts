import { join } from 'node:path';
import { createLocalCourseStore } from '../../../../lib/local-course-store';
import { parseLearningCoursePointer } from '../../../../lib/learning-library';
import { createSentenceReportStore } from '../../../../lib/sentence-reports';
import { privateReply, sameOrigin, sessionCookie, readSmallBody, localSetup } from '../../../../lib/private-request';

export const runtime = 'nodejs';
type Reports = Pick<ReturnType<typeof createSentenceReportStore>, 'setStatus'>;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const KEYS = ['course', 'lineId', 'status'];

// C9-5: the small owner-local handling step for sentence reports. It has the same local setup, Cookie and
// same-origin guards as the other private routes and changes only the caller's own report. There is no global
// admin: nobody can change another person's report, and setting a status never regenerates or edits a course.
export async function handleSentenceReportStatus(request: Request, { reports, now }: { reports: Reports; now: number }) {
  if (request.method !== 'POST') return privateReply({ error: 'method' }, 405);
  if (!sameOrigin(request)) return privateReply({ error: 'origin' }, 403);
  if (new URL(request.url).searchParams.size) return privateReply({ error: 'invalid' }, 400);
  const raw = await readSmallBody(request, 1024);
  if (raw === null) return privateReply({ error: 'too_large' }, 413);
  let body: unknown; try { body = JSON.parse(raw); } catch { return privateReply({ error: 'invalid' }, 400); }
  if (!object(body) || Object.keys(body).some(key => !KEYS.includes(key)) || !KEYS.every(key => Object.hasOwn(body, key))
    || typeof body.lineId !== 'string' || typeof body.status !== 'string') return privateReply({ error: 'invalid' }, 400);
  try {
    const report = await reports.setStatus({ cookie: sessionCookie(request), now, course: parseLearningCoursePointer(body.course), lineId: body.lineId, status: body.status });
    return privateReply({ report });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Authenticated session required') return privateReply({ error: 'unauthenticated' }, 401);
    if (message === 'Report unavailable') return privateReply({ error: 'not_found' }, 404);
    if (message.startsWith('Invalid ')) return privateReply({ error: 'invalid' }, 400);
    return privateReply({ error: 'temporarily_unavailable' }, 503);
  }
}

export function POST(request: Request) {
  const secret = localSetup();
  if (!secret) return privateReply({ error: 'local_setup_required' }, 503);
  const directory = join(process.cwd(), 'tmp', 'generation-tasks'), courses = createLocalCourseStore(directory, secret);
  return handleSentenceReportStatus(request, { reports: createSentenceReportStore({ directory, sessionSecret: secret, getCourse: courses.getCourse }), now: Date.now() });
}
export const GET = POST;

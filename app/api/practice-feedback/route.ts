import { join } from 'node:path';
import { createLocalCourseStore } from '../../../lib/local-course-store';
import { parseLearningCoursePointer } from '../../../lib/learning-library';
import { createPracticeFeedbackStore } from '../../../lib/practice-feedback';
import { privateReply, sameOrigin, sessionCookie, readSmallBody, localSetup } from '../../../lib/private-request';

export const runtime = 'nodejs';
type Feedback = Pick<ReturnType<typeof createPracticeFeedbackStore>, 'report'>;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

// C6: "this feedback is wrong" on one coach note of one exact course turn. Recording it changes no course.
export async function handlePracticeFeedback(request: Request, { feedback, now }: { feedback: Feedback; now: number }) {
  if (request.method !== 'POST') return privateReply({ error: 'method' }, 405);
  if (!sameOrigin(request)) return privateReply({ error: 'origin' }, 403);
  if (new URL(request.url).searchParams.size) return privateReply({ error: 'invalid' }, 400);
  const raw = await readSmallBody(request, 2048);
  if (raw === null) return privateReply({ error: 'too_large' }, 413);
  let body: unknown; try { body = JSON.parse(raw); } catch { return privateReply({ error: 'invalid' }, 400); }
  if (!object(body) || Object.keys(body).some(key => !['course', 'turnIndex', 'note'].includes(key)) || !['course', 'turnIndex', 'note'].every(key => Object.hasOwn(body, key))
    || !Number.isSafeInteger(body.turnIndex) || typeof body.note !== 'string') return privateReply({ error: 'invalid' }, 400);
  try {
    const report = await feedback.report({ cookie: sessionCookie(request), now, course: parseLearningCoursePointer(body.course), turnIndex: body.turnIndex as number, note: body.note });
    return privateReply({ report }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Authenticated session required') return privateReply({ error: 'unauthenticated' }, 401);
    if (['Course unavailable', 'Course media unavailable'].includes(message)) return privateReply({ error: 'not_found' }, 404);
    if (message.startsWith('Invalid ')) return privateReply({ error: 'invalid' }, 400);
    return privateReply({ error: 'temporarily_unavailable' }, 503);
  }
}

export function POST(request: Request) {
  const secret = localSetup();
  if (!secret) return privateReply({ error: 'local_setup_required' }, 503);
  const directory = join(process.cwd(), 'tmp', 'generation-tasks'), courses = createLocalCourseStore(directory, secret);
  return handlePracticeFeedback(request, { feedback: createPracticeFeedbackStore({ directory, sessionSecret: secret, getCourse: courses.getCourse }), now: Date.now() });
}

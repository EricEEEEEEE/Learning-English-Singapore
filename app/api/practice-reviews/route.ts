import { join } from 'node:path';
import { createLocalCourseStore } from '../../../lib/local-course-store';
import { createPracticeReviewStore } from '../../../lib/practice-reviews';
import { createLocalReviewQueue } from '../../../lib/local-review-queue';
import type { createReviewQueueStore } from '../../../lib/review-queue';
import { privateReply, sameOrigin, sessionCookie, readSmallBody, localSetup } from '../../../lib/private-request';

export const runtime = 'nodejs';
type Reviews = Pick<ReturnType<typeof createPracticeReviewStore>, 'save'>;
type Queue = Pick<ReturnType<typeof createReviewQueueStore>, 'addReview'>;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const KEYS = ['course', 'session', 'turns', 'help'];

// C9-6: save this visit's practice review for the cookie owner and return the previous review of the same course.
export async function handlePracticeReviews(request: Request, { reviews, now, queue }: { reviews: Reviews; now: number; queue?: Queue }) {
  if (request.method !== 'POST') return privateReply({ error: 'method' }, 405);
  if (!sameOrigin(request)) return privateReply({ error: 'origin' }, 403);
  if (new URL(request.url).searchParams.size) return privateReply({ error: 'invalid' }, 400);
  const raw = await readSmallBody(request, 8192);
  if (raw === null) return privateReply({ error: 'too_large' }, 413);
  let body: unknown; try { body = JSON.parse(raw); } catch { return privateReply({ error: 'invalid' }, 400); }
  if (!object(body) || Object.keys(body).some(key => !KEYS.includes(key)) || !KEYS.every(key => Object.hasOwn(body, key))) return privateReply({ error: 'invalid' }, 400);
  try {
    const saved = await reviews.save({ cookie: sessionCookie(request), now, course: body.course, session: body.session, turns: body.turns, help: body.help });
    // C13-1: turns that needed help come back in "listen again". The review is saved either way; a queue problem
    // only means those sentences are not added this time.
    if (queue) await queue.addReview({ cookie: sessionCookie(request), now, course: body.course, turns: body.turns as { turnIndex: number; outcome: string }[] }).catch(() => null);
    return privateReply(saved, 201);
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
  return handlePracticeReviews(request, { reviews: createPracticeReviewStore({ directory, sessionSecret: secret, getCourse: courses.getCourse }), now: Date.now(), queue: createLocalReviewQueue(directory, secret) });
}

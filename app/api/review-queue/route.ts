import { join } from 'node:path';
import { createLocalCourseStore } from '../../../lib/local-course-store';
import { type createReviewQueueStore, lastPlace } from '../../../lib/review-queue';
import { createLocalReviewQueue } from '../../../lib/local-review-queue';
import { createSceneProgressStore } from '../../../lib/scene-progress';
import { privateReply, sameOrigin, sessionCookie, readSmallBody, localSetup } from '../../../lib/private-request';

export const runtime = 'nodejs';
type Queue = Pick<ReturnType<typeof createReviewQueueStore>, 'today' | 'listen' | 'rate' | 'setLimit'>;
type Session = { cookie?: string; now: number };
export type ReviewLast = { course: { id: string; revision: number; materialsRevision?: number }; page: string; index: number | null };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const ACTIONS: Record<string, string[]> = { listen: ['action', 'course', 'heard', 'learned'], rate: ['action', 'course', 'lineId', 'rating'], limit: ['action', 'limit'] };

// C13-1/C13-2: today's sentences to listen to again, the daily number, "heard N sentences" and where the learner
// stopped last; POST records what was heard, a self-rating, or a new daily number. Nothing here calls a model.
export async function handleReviewQueue(request: Request, { queue, now, last }: { queue: Queue; now: number; last?: (session: Session) => Promise<ReviewLast | null> }) {
  if (!['GET', 'POST'].includes(request.method)) return privateReply({ error: 'method' }, 405);
  const session = { cookie: sessionCookie(request), now };
  try {
    if (request.method === 'GET') {
      if (new URL(request.url).searchParams.size) return privateReply({ error: 'invalid' }, 400);
      const today = await queue.today(session);
      // "Continue" is a convenience: if it cannot be read, the queue still answers.
      let place: ReviewLast | null = null;
      if (last) place = await last(session).catch(() => null);
      return privateReply({ ...today, last: place });
    }
    if (!sameOrigin(request)) return privateReply({ error: 'origin' }, 403);
    if (new URL(request.url).searchParams.size) return privateReply({ error: 'invalid' }, 400);
    const raw = await readSmallBody(request, 2048);
    if (raw === null) return privateReply({ error: 'too_large' }, 413);
    let body: unknown; try { body = JSON.parse(raw); } catch { return privateReply({ error: 'invalid' }, 400); }
    const keys = object(body) && typeof body.action === 'string' && Object.hasOwn(ACTIONS, body.action) ? ACTIONS[body.action] : null;
    if (!object(body) || !keys || Object.keys(body).length !== keys.length || !keys.every(key => Object.hasOwn(body, key))) return privateReply({ error: 'invalid' }, 400);
    if (body.action === 'listen') return privateReply(await queue.listen({ ...session, course: body.course, heard: body.heard, learned: body.learned }));
    if (body.action === 'rate') return privateReply(await queue.rate({ ...session, course: body.course, lineId: body.lineId, rating: body.rating }));
    return privateReply(await queue.setLimit({ ...session, limit: body.limit }));
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Authenticated session required') return privateReply({ error: 'unauthenticated' }, 401);
    if (['Course unavailable', 'Course media unavailable', 'Review item unavailable'].includes(message)) return privateReply({ error: 'not_found' }, 404);
    if (message.startsWith('Invalid ')) return privateReply({ error: 'invalid' }, 400);
    return privateReply({ error: 'temporarily_unavailable' }, 503);
  }
}

function configured(request: Request) {
  const secret = localSetup();
  if (!secret) return privateReply({ error: 'local_setup_required' }, 503);
  const directory = join(process.cwd(), 'tmp', 'generation-tasks'), courses = createLocalCourseStore(directory, secret);
  const progress = createSceneProgressStore({ directory, sessionSecret: secret });
  return handleReviewQueue(request, { queue: createLocalReviewQueue(directory, secret), now: Date.now(), last: async session => {
    const latest = await progress.mostRecent(session);
    if (!latest) return null;
    const { mediaSha256, ...course } = latest.course;
    const saved = await courses.getCourse({ ...session, ...course });
    if (saved.media.sha256 !== mediaSha256) return null;
    return { course, ...lastPlace(saved, latest.position) };
  } });
}
export const GET = configured;
export const POST = configured;

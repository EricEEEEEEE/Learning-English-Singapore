import { join } from 'node:path';
import { createLocalCourseStore } from '../../../lib/local-course-store';
import { parseLearningCoursePointer } from '../../../lib/learning-library';
import { createSentenceReportStore, createSameSentenceFinder } from '../../../lib/sentence-reports';
import { createLocalReviewQueue } from '../../../lib/local-review-queue';
import type { createReviewQueueStore } from '../../../lib/review-queue';
import { privateReply, sameOrigin, sessionCookie, readSmallBody, localSetup } from '../../../lib/private-request';

export const runtime = 'nodejs';
type Reports = Pick<ReturnType<typeof createSentenceReportStore>, 'list' | 'report'>;
type SameSentence = Pick<ReturnType<typeof createSameSentenceFinder>, 'find'>;
type Queue = Pick<ReturnType<typeof createReviewQueueStore>, 'add'>;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function queryPointer(params: URLSearchParams) {
  if ([...params.keys()].some(key => !['id', 'revision', 'materialsRevision'].includes(key)) || params.getAll('id').length !== 1 || params.getAll('revision').length !== 1 || params.getAll('materialsRevision').length > 1) throw new Error('Invalid course selector');
  for (const key of ['revision', 'materialsRevision']) if (params.has(key) && !/^[1-9]\d{0,14}$/.test(params.get(key)!)) throw new Error('Invalid course selector');
  return parseLearningCoursePointer({ id: params.get('id'), revision: Number(params.get('revision')), ...(params.has('materialsRevision') ? { materialsRevision: Number(params.get('materialsRevision')) } : {}) });
}

// C5: a learner reports one sentence of one exact course version. Recording a report changes no course.
export async function handleSentenceReports(request: Request, { reports, now, sameSentence, queue }: { reports: Reports; now: number; sameSentence?: SameSentence; queue?: Queue }) {
  if (!['GET', 'POST'].includes(request.method)) return privateReply({ error: 'method' }, 405);
  const session = { cookie: sessionCookie(request), now };
  try {
    if (request.method === 'GET') {
      const course = queryPointer(new URL(request.url).searchParams), listed = await reports.list({ ...session, ...course });
      // C9-5: where else the reported sentences appear. A failed lookup never hides the reports themselves.
      let elsewhere: Awaited<ReturnType<SameSentence['find']>> | null = null;
      if (sameSentence && listed.length) try { elsewhere = await sameSentence.find({ ...session, course, lineIds: listed.map(item => item.lineId) }); } catch { elsewhere = null; }
      return privateReply({ reports: listed, ...(elsewhere ? { elsewhere } : {}) });
    }
    if (!sameOrigin(request)) return privateReply({ error: 'origin' }, 403);
    if (new URL(request.url).searchParams.size) return privateReply({ error: 'invalid' }, 400);
    const raw = await readSmallBody(request, 2048);
    if (raw === null) return privateReply({ error: 'too_large' }, 413);
    let body: unknown; try { body = JSON.parse(raw); } catch { return privateReply({ error: 'invalid' }, 400); }
    if (!object(body) || Object.keys(body).some(key => !['course', 'lineId', 'reason', 'note'].includes(key)) || !['course', 'lineId', 'reason'].every(key => Object.hasOwn(body, key))
      || typeof body.lineId !== 'string' || typeof body.reason !== 'string' || body.note !== undefined && typeof body.note !== 'string') return privateReply({ error: 'invalid' }, 400);
    const course = parseLearningCoursePointer(body.course);
    const report = await reports.report({ ...session, course, lineId: body.lineId, reason: body.reason, ...(body.note === undefined ? {} : { note: body.note as string }) });
    // C13-1: a sentence reported as hard to hear comes back in "listen again"; the report stands either way.
    if (queue && report.reason === 'unclear') await queue.add({ ...session, course, lineIds: [report.lineId], source: 'report' }).catch(() => null);
    return privateReply({ report }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Authenticated session required') return privateReply({ error: 'unauthenticated' }, 401);
    if (['Course unavailable', 'Course media unavailable'].includes(message)) return privateReply({ error: 'not_found' }, 404);
    if (message.startsWith('Invalid ')) return privateReply({ error: 'invalid' }, 400);
    return privateReply({ error: 'temporarily_unavailable' }, 503);
  }
}

function configured(request: Request) {
  const secret = localSetup();
  if (!secret) return privateReply({ error: 'local_setup_required' }, 503);
  const directory = join(process.cwd(), 'tmp', 'generation-tasks'), courses = createLocalCourseStore(directory, secret);
  return handleSentenceReports(request, { reports: createSentenceReportStore({ directory, sessionSecret: secret, getCourse: courses.getCourse }), now: Date.now(),
    sameSentence: createSameSentenceFinder({ list: courses.list, getCourse: courses.getCourse }), queue: createLocalReviewQueue(directory, secret) });
}
export const GET = configured;
export const POST = configured;

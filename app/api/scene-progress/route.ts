import { join } from 'node:path';
import { GOOGLE_SESSION_COOKIE } from '../../../lib/google-auth';
import { createLocalLearningLibrary, parseLearningCoursePointer } from '../../../lib/learning-library';

export const runtime = 'nodejs';
type Library = Pick<ReturnType<typeof createLocalLearningLibrary>, 'getProgress' | 'saveProgress'>;
const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'private, no-store, max-age=0' } });
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function position(value: unknown) {
  if (!object(value) || Object.keys(value).length !== 3 || !['page', 'time', 'turnIndex'].every(key => Object.hasOwn(value, key))
    || typeof value.page !== 'string' || !['watch', 'role', 'terms', 'sentences', 'prompt'].includes(value.page)
    || typeof value.time !== 'number' || !Number.isFinite(value.time) || value.time < 0 || !Number.isSafeInteger(value.turnIndex) || (value.turnIndex as number) < 0) throw new Error('Invalid progress position');
  return { page: value.page, time: value.time, turnIndex: value.turnIndex };
}
function queryPointer(params: URLSearchParams) {
  if ([...params.keys()].some(key => !['id', 'revision', 'materialsRevision'].includes(key)) || params.getAll('id').length !== 1 || params.getAll('revision').length !== 1 || params.getAll('materialsRevision').length > 1) throw new Error('Invalid course selector');
  for (const key of ['revision', 'materialsRevision']) if (params.has(key) && !/^[1-9]\d*$/.test(params.get(key)!)) throw new Error('Invalid course selector');
  return parseLearningCoursePointer({ id: params.get('id'), revision: Number(params.get('revision')), ...(params.has('materialsRevision') ? { materialsRevision: Number(params.get('materialsRevision')) } : {}) });
}

export async function handleSceneProgress(request: Request, { library, now }: { library: Library; now: number }) {
  if (!['GET', 'PUT'].includes(request.method)) return reply({ error: 'method' }, 405);
  const cookie = (request.headers.get('cookie') ?? '').split(';').map(value => value.trim()).find(value => value.startsWith(`${GOOGLE_SESSION_COOKIE}=`))?.slice(GOOGLE_SESSION_COOKIE.length + 1);
  const session = { cookie, now }, url = new URL(request.url);
  try {
    if (request.method === 'GET') return reply({ progress: await library.getProgress({ ...session, ...queryPointer(url.searchParams) }) });
    if (url.searchParams.size) return reply({ error: 'invalid' }, 400);
    const host = request.headers.get('host'); if (host) url.host = host;
    if (request.headers.get('origin') !== url.origin) return reply({ error: 'origin' }, 403);
    const reader = request.body?.getReader(); if (!reader) return reply({ error: 'invalid' }, 400);
    let raw = '', bytes = 0; const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 2048) { await reader.cancel(); return reply({ error: 'too_large' }, 413); }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    let body: unknown; try { body = JSON.parse(raw); } catch { return reply({ error: 'invalid' }, 400); }
    if (!object(body) || Object.keys(body).length !== 3 || !['course', 'expectedVersion', 'position'].every(key => Object.hasOwn(body, key))
      || !Number.isSafeInteger(body.expectedVersion) || (body.expectedVersion as number) < 0) throw new Error('Invalid progress request');
    return reply({ progress: await library.saveProgress({ ...session, ...parseLearningCoursePointer(body.course), expectedVersion: body.expectedVersion as number, position: position(body.position) }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Authenticated session required') return reply({ error: 'unauthenticated' }, 401);
    if (['Course unavailable', 'Course media unavailable', 'Course task unavailable'].includes(message)) return reply({ error: 'not_found' }, 404);
    if (message === 'Progress conflict') return reply({ error: 'conflict' }, 409);
    if (message.startsWith('Invalid ')) return reply({ error: 'invalid' }, 400);
    return reply({ error: 'temporarily_unavailable' }, 503);
  }
}

function configured(request: Request) {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || process.env.VERCEL) return reply({ error: 'local_setup_required' }, 503);
  try { return handleSceneProgress(request, { library: createLocalLearningLibrary(join(process.cwd(), 'tmp', 'generation-tasks'), secret), now: Date.now() }); }
  catch { return reply({ error: 'temporarily_unavailable' }, 503); }
}
export const GET = configured;
export const PUT = configured;

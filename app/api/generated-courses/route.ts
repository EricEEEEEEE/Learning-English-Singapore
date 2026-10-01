import { join } from 'node:path';
import { GOOGLE_SESSION_COOKIE } from '../../../lib/google-auth';
import { createGenerationTaskStore } from '../../../lib/generation-tasks';
import { createLocalCourseStore } from '../../../lib/local-course-store';

export const runtime = 'nodejs';
type Reader = Pick<ReturnType<typeof createGenerationTaskStore>, 'getCourse'>;
const reply = (body: object, status = 200, extra: Record<string, string> = {}) => Response.json(body, {
  status, headers: { 'cache-control': 'private, no-store, max-age=0', ...extra },
});

export async function handleGeneratedCourse(request: Request, { store, now }: { store: Reader; now: number }) {
  if (request.method !== 'GET') return reply({ error: 'method' }, 405, { allow: 'GET' });
  const params = new URL(request.url).searchParams;
  const id = params.get('id'), rawRevision = params.get('revision');
  const materialVersions = params.getAll('materialsRevision');
  if (materialVersions.length > 1 || (materialVersions.length === 1 && (!/^[1-9][0-9]*$/.test(materialVersions[0]) || !Number.isSafeInteger(Number(materialVersions[0]))))) return reply({ error: 'invalid' }, 400);
  if (params.getAll('id').length !== 1 || params.getAll('revision').length !== 1 || !id || !/^[a-zA-Z0-9_-]{1,120}$/.test(id) || !rawRevision || !/^[1-9][0-9]*$/.test(rawRevision) || !Number.isSafeInteger(Number(rawRevision))) return reply({ error: 'invalid' }, 400);
  const cookie = (request.headers.get('cookie') ?? '').split(';').map(s => s.trim()).find(s => s.startsWith(`${GOOGLE_SESSION_COOKIE}=`))?.slice(GOOGLE_SESSION_COOKIE.length + 1);
  try {
    return reply(await store.getCourse({ cookie, now, id, revision: Number(rawRevision),
      ...(materialVersions.length ? { materialsRevision: Number(materialVersions[0]) } : {}) }));
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Authenticated session required') return reply({ error: 'unauthenticated' }, 401);
    if (message === 'Course unavailable' || message === 'Course media unavailable' || message === 'Course task unavailable') return reply({ error: 'not_found' }, 404);
    return reply({ error: 'temporarily_unavailable' }, 503);
  }
}

export async function GET(request: Request) {
  const sessionSecret = process.env.AUTH_SESSION_SECRET;
  // Local disk only; no provider is configured or invoked by this read route.
  if (!sessionSecret || process.env.VERCEL) return reply({ error: 'local_setup_required' }, 503);
  try {
    const directory = join(process.cwd(), 'tmp', 'generation-tasks');
    const store = createLocalCourseStore(directory, sessionSecret);
    return await handleGeneratedCourse(request, { store, now: Date.now() });
  } catch { return reply({ error: 'temporarily_unavailable' }, 503); }
}

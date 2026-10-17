import { join } from 'node:path';
import { GOOGLE_SESSION_COOKIE } from '../../../lib/google-auth';
import { createLocalLearningLibrary } from '../../../lib/learning-library';
import { createMyDataStore } from '../../../lib/my-data';
import { privateReply, sameOrigin, sessionCookie, localSetup } from '../../../lib/private-request';

export const runtime = 'nodejs';
type Library = Pick<ReturnType<typeof createLocalLearningLibrary>, 'list'>;
const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'private, no-store, max-age=0' } });

export async function handleLearningLibrary(request: Request, { library, now }: { library: Library; now: number }) {
  if (request.method !== 'GET') return reply({ error: 'method' }, 405);
  if (new URL(request.url).searchParams.size) return reply({ error: 'invalid' }, 400);
  const cookie = (request.headers.get('cookie') ?? '').split(';').map(value => value.trim()).find(value => value.startsWith(`${GOOGLE_SESSION_COOKIE}=`))?.slice(GOOGLE_SESSION_COOKIE.length + 1);
  try { return reply(await library.list({ cookie, now })); }
  catch (error) {
    return error instanceof Error && error.message === 'Authenticated session required'
      ? reply({ error: 'unauthenticated' }, 401) : reply({ error: 'temporarily_unavailable' }, 503);
  }
}

export async function GET(request: Request) {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || process.env.VERCEL) return reply({ error: 'local_setup_required' }, 503);
  try {
    return await handleLearningLibrary(request, { library: createLocalLearningLibrary(join(process.cwd(), 'tmp', 'generation-tasks'), secret), now: Date.now() });
  } catch { return reply({ error: 'temporarily_unavailable' }, 503); }
}

type SceneData = Pick<ReturnType<typeof createMyDataStore>, 'deleteScene'>;
// C5: the learner deletes one of their own scenes. Never reports success unless every store finished.
export async function handleSceneDelete(request: Request, { data, now }: { data: SceneData; now: number }) {
  if (request.method !== 'DELETE') return privateReply({ error: 'method' }, 405);
  if (!sameOrigin(request)) return privateReply({ error: 'origin' }, 403);
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => !['id', 'revision'].includes(key)) || params.getAll('id').length !== 1 || params.getAll('revision').length !== 1
    || !/^[a-zA-Z0-9_-]{1,120}$/.test(params.get('id')!) || !/^[1-9]\d{0,14}$/.test(params.get('revision')!)) return privateReply({ error: 'invalid' }, 400);
  try { return privateReply(await data.deleteScene({ cookie: sessionCookie(request), now, id: params.get('id')!, revision: Number(params.get('revision')) })); }
  catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Authenticated session required') return privateReply({ error: 'unauthenticated' }, 401);
    if (message === 'Course unavailable') return privateReply({ error: 'not_found' }, 404);
    if (message.startsWith('Invalid ')) return privateReply({ error: 'invalid' }, 400);
    return privateReply({ error: 'delete_failed' }, 503);
  }
}

export async function DELETE(request: Request) {
  const secret = localSetup();
  if (!secret) return privateReply({ error: 'local_setup_required' }, 503);
  const directory = join(process.cwd(), 'tmp', 'generation-tasks'), requirementsDirectory = join(process.cwd(), 'tmp', 'scene-requirements');
  return handleSceneDelete(request, { data: createMyDataStore({ directory, requirementsDirectory, sessionSecret: secret }), now: Date.now() });
}

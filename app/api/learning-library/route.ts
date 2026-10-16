import { join } from 'node:path';
import { GOOGLE_SESSION_COOKIE } from '../../../lib/google-auth';
import { createLocalLearningLibrary } from '../../../lib/learning-library';

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

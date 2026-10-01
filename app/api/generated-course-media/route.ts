import { join } from 'node:path';
import { GOOGLE_SESSION_COOKIE } from '../../../lib/google-auth';
import { createGenerationTaskStore } from '../../../lib/generation-tasks';
import { createLocalCourseStore } from '../../../lib/local-course-store';

export const runtime = 'nodejs';
type Reader = Pick<ReturnType<typeof createGenerationTaskStore>, 'getCourseMedia'>;
const privacy = { 'cache-control': 'private, no-store, max-age=0', 'x-content-type-options': 'nosniff' };
function error(request: Request, code: string, status: number, headers: Record<string, string> = {}) {
  return new Response(request.method === 'HEAD' ? null : JSON.stringify({ error: code }), { status, headers: { ...privacy, 'content-type': 'application/json', ...headers } });
}

export async function handleGeneratedMedia(request: Request, { store, now }: { store: Reader; now: number }) {
  if (!['GET', 'HEAD'].includes(request.method)) return error(request, 'method', 405, { allow: 'GET, HEAD' });
  const params = new URL(request.url).searchParams, id = params.get('id'), revision = params.get('revision');
  if (params.getAll('id').length !== 1 || params.getAll('revision').length !== 1 || !id || !/^[a-zA-Z0-9_-]{1,120}$/.test(id) || !revision || !/^[1-9][0-9]*$/.test(revision) || !Number.isSafeInteger(Number(revision))) return error(request, 'invalid', 400);
  const cookie = (request.headers.get('cookie') ?? '').split(';').map(s => s.trim()).find(s => s.startsWith(`${GOOGLE_SESSION_COOKIE}=`))?.slice(GOOGLE_SESSION_COOKIE.length + 1);
  try {
    // Authenticate and verify the private file before revealing its length or range availability.
    const media = await store.getCourseMedia({ cookie, now, id, revision: Number(revision) });
    if (!(media.bytes instanceof Uint8Array) || !Number.isSafeInteger(media.size) || media.size <= 0 || media.size > 100_000_000 || media.size !== media.bytes.byteLength) throw new Error('Invalid stored media');
    let start = 0, end = media.size - 1, status = 200;
    const range = request.method === 'GET' ? request.headers.get('range') : null;
    if (range !== null) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      const invalid = () => error(request, 'range_not_satisfiable', 416, { 'content-range': `bytes */${media.size}` });
      if (!match || (!match[1] && !match[2])) return invalid();
      if (!match[1]) {
        const count = Number(match[2]);
        if (!Number.isSafeInteger(count) || count <= 0) return invalid();
        start = Math.max(0, media.size - count);
      } else {
        start = Number(match[1]);
        const requestedEnd = match[2] ? Number(match[2]) : end;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start >= media.size || requestedEnd < start) return invalid();
        end = Math.min(requestedEnd, end);
      }
      status = 206;
    }
    const headers: Record<string, string> = { ...privacy, 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-length': String(end - start + 1) };
    if (status === 206) headers['content-range'] = `bytes ${start}-${end}/${media.size}`;
    return new Response(request.method === 'HEAD' ? null : Uint8Array.from(media.bytes.subarray(start, end + 1)), { status, headers });
  } catch (failure) {
    const message = failure instanceof Error ? failure.message : '';
    if (message === 'Authenticated session required') return error(request, 'unauthenticated', 401);
    if (['Course unavailable', 'Course media unavailable', 'Course task unavailable'].includes(message)) return error(request, 'not_found', 404);
    return error(request, 'temporarily_unavailable', 503);
  }
}

async function configured(request: Request) {
  const sessionSecret = process.env.AUTH_SESSION_SECRET;
  if (!sessionSecret || process.env.VERCEL) return error(request, 'local_setup_required', 503);
  try {
    const directory = join(process.cwd(), 'tmp', 'generation-tasks');
    const store = createLocalCourseStore(directory, sessionSecret);
    return await handleGeneratedMedia(request, { store, now: Date.now() });
  } catch { return error(request, 'temporarily_unavailable', 503); }
}
export const GET = configured;
export const HEAD = configured;

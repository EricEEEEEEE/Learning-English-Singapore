import { join } from 'node:path';
import { GOOGLE_SESSION_COOKIE } from '../../../lib/google-auth';
import { createLocalCourseStore } from '../../../lib/local-course-store';
import { createLivePracticeService } from '../../../lib/live-practice';

export const runtime = 'nodejs';
const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'private, no-store, max-age=0' } });
type Service = { turn: (input: Record<string, unknown>) => Promise<unknown> };
const KEYS = ['courseId', 'revision', 'materialsRevision', 'turnIndex', 'language', 'history', 'mimeType', 'audioBase64'];
const MAX_BODY = 1_500_000;

export async function handlePracticeTurn(request: Request, { service, now }: { service?: Service | null; now: number }) {
  if (request.method !== 'POST') return reply({ error: 'method' }, 405);
  const url = new URL(request.url);
  const host = request.headers.get('host');
  if (host) url.host = host;
  if (request.headers.get('origin') !== url.origin) return reply({ error: 'origin' }, 403);
  if (!service) return reply({ error: 'practice_unavailable' }, 503);
  const cookie = (request.headers.get('cookie') ?? '').split(';').map(part => part.trim()).find(part => part.startsWith(`${GOOGLE_SESSION_COOKIE}=`))?.slice(GOOGLE_SESSION_COOKIE.length + 1);
  const reader = request.body?.getReader();
  if (!reader) return reply({ error: 'invalid' }, 400);
  let raw = '', bytes = 0;
  const decoder = new TextDecoder();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > MAX_BODY) { await reader.cancel(); return reply({ error: 'too_large' }, 413); }
    raw += decoder.decode(chunk.value, { stream: true });
  }
  raw += decoder.decode();
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return reply({ error: 'invalid' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !KEYS.includes(key)) || typeof body.audioBase64 !== 'string' || typeof body.mimeType !== 'string') return reply({ error: 'invalid' }, 400);
  const { audioBase64, mimeType, ...rest } = body;
  try {
    return reply(await service.turn({ ...rest, cookie, now, audio: { bytes: new Uint8Array(Buffer.from(audioBase64 as string, 'base64')), mimeType } }) as object);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Authenticated session required') return reply({ error: 'unauthenticated' }, 401);
    if (message === 'Practice budget exceeded') return reply({ error: 'budget' }, 429);
    if (message === 'Practice turn failed') return reply({ error: 'failed' }, 502);
    return reply({ error: 'invalid' }, 400);
  }
}

let live: Service | null | undefined;
function configured(request: Request) {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || process.env.VERCEL) return reply({ error: 'practice_unavailable' }, 503);
  if (live === undefined) {
    const courses = createLocalCourseStore(join(process.cwd(), 'tmp', 'generation-tasks'), secret);
    live = createLivePracticeService(process.env, join(process.cwd(), 'tmp', 'practice'), { getCourse: input => courses.getCourse(input) }) as Service | null;
  }
  return handlePracticeTurn(request, { service: live, now: Date.now() });
}
export const GET = configured;
export const POST = configured;

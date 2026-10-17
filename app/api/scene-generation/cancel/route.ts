import { join } from 'node:path';
import { GOOGLE_SESSION_COOKIE } from '../../../../lib/google-auth';
import { createSceneRequirementStore } from '../../../../lib/scene-requirements';
import { createSceneGenerationService } from '../../../../lib/scene-generation';
import { createLocalCourseStore } from '../../../../lib/local-course-store';

export const runtime = 'nodejs';
const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'private, no-store, max-age=0' } });
type Service = Pick<ReturnType<typeof createSceneGenerationService>, 'cancel'>;

// C8-4: the learner cancels the generation for one saved requirement. Same-origin POST only; the response is the
// task's new view. This route never starts or resumes the runner, and it never changes a reservation.
export async function handleSceneGenerationCancel(request: Request, { service, now }: { service: Service; now: number }) {
  if (request.method !== 'POST') return reply({ error: 'method' }, 405);
  const cookie = (request.headers.get('cookie') ?? '').split(';').map(part => part.trim()).find(part => part.startsWith(`${GOOGLE_SESSION_COOKIE}=`))?.slice(GOOGLE_SESSION_COOKIE.length + 1);
  try {
    const url = new URL(request.url);
    const host = request.headers.get('host');
    if (host) url.host = host;
    if (request.headers.get('origin') !== url.origin) return reply({ error: 'origin' }, 403);
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: 'invalid' }, 400);
    let raw = '', bytes = 0;
    const decoder = new TextDecoder();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 1024) { await reader.cancel(); return reply({ error: 'too_large' }, 413); }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    raw += decoder.decode();
    let body;
    try { body = JSON.parse(raw); } catch { return reply({ error: 'invalid' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'requirementRevision') || !Number.isSafeInteger(body.requirementRevision) || body.requirementRevision < 1) return reply({ error: 'invalid' }, 400);
    return reply(await service.cancel({ cookie, now, requirementRevision: body.requirementRevision }));
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Authenticated session required') return reply({ error: 'unauthenticated' }, 401);
    if (message === 'Requirement not found' || message === 'Task not found') return reply({ error: 'not_found' }, 404);
    if (message === 'Cancel prohibited') return reply({ error: 'conflict' }, 409);
    return reply({ error: 'temporarily_unavailable' }, 503);
  }
}

export function POST(request: Request) {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || process.env.VERCEL) return reply({ error: 'local_setup_required' }, 503);
  return handleSceneGenerationCancel(request, { service: createSceneGenerationService({
    requirements: createSceneRequirementStore({ directory: join(process.cwd(), 'tmp', 'scene-requirements'), sessionSecret: secret }),
    tasks: createLocalCourseStore(join(process.cwd(), 'tmp', 'generation-tasks'), secret),
  }), now: Date.now() });
}

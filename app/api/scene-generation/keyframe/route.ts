import { join } from 'node:path';
import { GOOGLE_SESSION_COOKIE } from '../../../../lib/google-auth';
import { createSceneRequirementStore } from '../../../../lib/scene-requirements';
import { createSceneGenerationService } from '../../../../lib/scene-generation';
import { createLocalCourseStore } from '../../../../lib/local-course-store';

export const runtime = 'nodejs';
const privacy = { 'cache-control': 'private, no-store, max-age=0', 'x-content-type-options': 'nosniff' };
const reply = (body: object, status: number) => Response.json(body, { status, headers: privacy });
type Service = Pick<ReturnType<typeof createSceneGenerationService>, 'keyframe'>;

// C14-2: the partner keyframe ("this is who you will talk to") of the task for one saved requirement.
// GET only, owner-bound, verified PNG bytes; it never starts the runner or calls any model.
export async function handleSceneKeyframe(request: Request, { service, now }: { service: Service; now: number }) {
  if (request.method !== 'GET') return reply({ error: 'method' }, 405);
  const params = new URL(request.url).searchParams, raw = params.get('revision');
  if (params.size !== 1 || !raw || !/^[1-9]\d{0,14}$/.test(raw)) return reply({ error: 'invalid' }, 400);
  const cookie = (request.headers.get('cookie') ?? '').split(';').map(part => part.trim()).find(part => part.startsWith(`${GOOGLE_SESSION_COOKIE}=`))?.slice(GOOGLE_SESSION_COOKIE.length + 1);
  try {
    const image = await service.keyframe({ cookie, now, requirementRevision: Number(raw) });
    if (!(image.bytes instanceof Uint8Array) || !image.bytes.length || image.bytes.length > 5_249_982) throw new Error('Invalid keyframe');
    return new Response(Uint8Array.from(image.bytes), { status: 200, headers: { ...privacy, 'content-type': 'image/png', 'content-length': String(image.bytes.length) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Authenticated session required') return reply({ error: 'unauthenticated' }, 401);
    if (['Requirement not found', 'Task not found', 'Course unavailable', 'Course media unavailable'].includes(message)) return reply({ error: 'not_found' }, 404);
    return reply({ error: 'temporarily_unavailable' }, 503);
  }
}

export function GET(request: Request) {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || process.env.VERCEL) return reply({ error: 'local_setup_required' }, 503);
  return handleSceneKeyframe(request, { service: createSceneGenerationService({
    requirements: createSceneRequirementStore({ directory: join(process.cwd(), 'tmp', 'scene-requirements'), sessionSecret: secret }),
    tasks: createLocalCourseStore(join(process.cwd(), 'tmp', 'generation-tasks'), secret),
  }), now: Date.now() });
}

import { join } from 'node:path';
import { GOOGLE_SESSION_COOKIE } from '../../../lib/google-auth';
import { createSceneRequirementStore } from '../../../lib/scene-requirements';
import { createSceneGenerationService } from '../../../lib/scene-generation';
import { createLocalCourseStore } from '../../../lib/local-course-store';
import { createLiveSceneRunner } from '../../../lib/live-scene-runner';

export const runtime = 'nodejs';
const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'private, no-store, max-age=0' } });
type Service = ReturnType<typeof createSceneGenerationService>;
type Runner = { advance: (input: { cookie?: string | null; now?: number; id: string }) => Promise<unknown>; isRunning: (id: string) => boolean };
type View = Awaited<ReturnType<Service['get']>>;
const ACTIVE = new Set(['awaiting_budget', 'script_ready', 'audio_ready', 'audio_assembled', 'video_pending']);

// Starts or resumes the server runner for an active task; the response never waits for generation.
function kick(runner: Runner | undefined, view: View, cookie: string | undefined, now: number) {
  if (!runner || !view.task || !ACTIVE.has(view.phase) || runner.isRunning(view.task.id)) return view;
  try { runner.advance({ cookie, now, id: view.task.id }).catch(() => {}); } catch { /* the status page still answers */ }
  return view;
}

export async function handleSceneGeneration(request: Request, { service, now, runner }: { service: Service; now: number; runner?: Runner }) {
  const cookie = (request.headers.get('cookie') ?? '').split(';').map(part => part.trim()).find(part => part.startsWith(`${GOOGLE_SESSION_COOKIE}=`))?.slice(GOOGLE_SESSION_COOKIE.length + 1);
  try {
    const url = new URL(request.url);
    if (request.method === 'GET') {
      const raw = url.searchParams.get('revision');
      const revision = Number(raw);
      if (url.searchParams.size !== 1 || !raw || !/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(revision)) return reply({ error: 'invalid' }, 400);
      return reply(kick(runner, await service.get({ cookie, now, requirementRevision: revision }), cookie, now));
    }
    if (request.method !== 'POST') return reply({ error: 'method' }, 405);
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
    return reply(kick(runner, await service.submit({ cookie, now, requirementRevision: body.requirementRevision }), cookie, now), 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Authenticated session required') return reply({ error: 'unauthenticated' }, 401);
    if (message === 'Requirement not found') return reply({ error: 'not_found' }, 404);
    return reply({ error: 'temporarily_unavailable' }, 503);
  }
}

// One runner per server process so overlapping requests share runs; null unless paid generation is configured.
let liveRunner: Runner | null | undefined;
function configured(request: Request) {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || process.env.VERCEL) return reply({ error: 'local_setup_required' }, 503);
  if (liveRunner === undefined) liveRunner = createLiveSceneRunner(process.env, join(process.cwd(), 'tmp', 'generation-tasks'));
  return handleSceneGeneration(request, { service: createSceneGenerationService({
    requirements: createSceneRequirementStore({ directory: join(process.cwd(), 'tmp', 'scene-requirements'), sessionSecret: secret }),
    tasks: createLocalCourseStore(join(process.cwd(), 'tmp', 'generation-tasks'), secret),
  }), now: Date.now(), ...(liveRunner ? { runner: liveRunner } : {}) });
}
export const GET = configured;
export const POST = configured;

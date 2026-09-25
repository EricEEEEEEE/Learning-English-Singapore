import { join } from 'node:path';
import { GOOGLE_SESSION_COOKIE } from '../../../lib/google-auth';
import { createGenerationTaskStore, type GenerationTask } from '../../../lib/generation-tasks';
export const runtime = 'nodejs';
type Store = ReturnType<typeof createGenerationTaskStore>;
const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'private, no-store, max-age=0' } });
const view = (task: GenerationTask) => ({ id: task.id, goal: task.goal, revision: task.revision, status: task.status, providerCalls: task.providerCalls, simulation: task.simulation });
export async function handleGenerationTasks(request: Request, { store, now }: { store: Store; now: number }) {
  const cookie = (request.headers.get('cookie') ?? '').split(';').map(s => s.trim()).find(s => s.startsWith(`${GOOGLE_SESSION_COOKIE}=`))?.slice(GOOGLE_SESSION_COOKIE.length + 1);
  const session = { cookie, now };
  try {
    const tasks = await store.list(session);
    if (request.method === 'GET') {
      const id = new URL(request.url).searchParams.get('id');
      if (!id) return reply({ tasks: tasks.map(view) });
      const task = await store.get({ ...session, id }); return task ? reply(view(task)) : reply({ error: 'not_found' }, 404);
    }
    if (request.method !== 'POST') return reply({ error: 'method' }, 405);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return reply({ error: 'origin' }, 403);
    const reader = request.body?.getReader(); if (!reader) return reply({ error: 'invalid' }, 400);
    let raw = ''; let bytes = 0; const decoder = new TextDecoder();
    while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 12000) { await reader.cancel(); return reply({ error: 'too_large' }, 413); } raw += decoder.decode(value, { stream: true }); }
    raw += decoder.decode();
    let body; try { body = JSON.parse(raw); } catch { return reply({ error: 'invalid' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: 'invalid' }, 400);
    const task = await store.create({ ...session, goal: body.goal, revision: body.revision, requestKey: body.requestKey });
    return reply(view(task), 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Authenticated session required') return reply({ error: 'unauthenticated' }, 401);
    if (/Invalid|conflict|limit/.test(message)) return reply({ error: 'invalid_or_conflict' }, 400);
    return reply({ error: 'temporarily_unavailable' }, 503);
  }
}
function configured(request: Request) {
  const secret = process.env.AUTH_SESSION_SECRET;
  // Local-only milestone: never pretend ephemeral serverless disks are durable storage.
  if (!secret || process.env.VERCEL) return reply({ error: 'local_setup_required' }, 503);
  const store = createGenerationTaskStore({ directory: join(process.cwd(), 'tmp', 'generation-tasks'), sessionSecret: secret });
  return handleGenerationTasks(request, { store, now: Date.now() });
}
export const GET = configured;
export const POST = configured;

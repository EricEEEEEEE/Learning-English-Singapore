import { join } from 'node:path';
import { GOOGLE_SESSION_COOKIE } from '../../../lib/google-auth';
import { createSceneRequirementStore } from '../../../lib/scene-requirements';

export const runtime = 'nodejs';
type Store = ReturnType<typeof createSceneRequirementStore>;
const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'private, no-store, max-age=0' } });

export async function handleSceneRequirements(request: Request, { store, now }: { store: Store; now: number }) {
  const cookie = (request.headers.get('cookie') ?? '').split(';').map(part => part.trim()).find(part => part.startsWith(`${GOOGLE_SESSION_COOKIE}=`))?.slice(GOOGLE_SESSION_COOKIE.length + 1);
  const session = { cookie, now };
  try {
    // Authenticate through the store before reading a body or initializing storage.
    const current = await store.get(session);
    const url = new URL(request.url);
    if (request.method === 'GET') {
      const rawRevision = url.searchParams.get('revision');
      if (rawRevision === null) return reply({ requirement: current });
      const revision = Number(rawRevision);
      if (!/^[1-9]\d*$/.test(rawRevision) || !Number.isSafeInteger(revision)) return reply({ error: 'invalid' }, 400);
      const requirement = await store.get({ ...session, revision });
      return requirement ? reply({ requirement }) : reply({ error: 'not_found' }, 404);
    }
    if (request.method !== 'PUT') return reply({ error: 'method' }, 405);
    // NextURL may normalize loopback aliases; Host identifies the actual origin.
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
      if (bytes > 12000) { await reader.cancel(); return reply({ error: 'too_large' }, 413); }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    raw += decoder.decode();
    let body;
    try { body = JSON.parse(raw); } catch { return reply({ error: 'invalid' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['expectedRevision', 'content'].includes(key))) return reply({ error: 'invalid' }, 400);
    const requirement = await store.save({ ...session, expectedRevision: body.expectedRevision, content: body.content });
    return reply({ requirement });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Authenticated session required') return reply({ error: 'unauthenticated' }, 401);
    if (message === 'Requirement conflict') return reply({ error: 'conflict' }, 409);
    if (message.startsWith('Invalid ')) return reply({ error: 'invalid' }, 400);
    return reply({ error: 'temporarily_unavailable' }, 503);
  }
}

function configured(request: Request) {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || process.env.VERCEL) return reply({ error: 'local_setup_required' }, 503);
  return handleSceneRequirements(request, { store: createSceneRequirementStore({ directory: join(process.cwd(), 'tmp', 'scene-requirements'), sessionSecret: secret }), now: Date.now() });
}
export const GET = configured;
export const PUT = configured;

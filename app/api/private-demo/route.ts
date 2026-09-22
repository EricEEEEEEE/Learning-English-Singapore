import { GOOGLE_SESSION_COOKIE } from '../../../lib/google-auth';
import { createPrivateSceneStore } from '../../../lib/private-scene-store';

export const runtime = 'nodejs';

type Store = ReturnType<typeof createPrivateSceneStore>;
const headers = { 'cache-control': 'private, no-store, max-age=0' };
let cached: { secret: string; store: Store } | null = null;

function cookieValue(request: Request) {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === GOOGLE_SESSION_COOKIE) return part.slice(index + 1).trim();
  }
  return null;
}

function reply(body: object, status = 200) {
  return Response.json(body, { status, headers });
}

function publicRecord(record: Awaited<ReturnType<Store['create']>>) {
  return { id: record.id, goalRevision: record.goalRevision, playbackPositionMs: record.playbackPositionMs };
}

async function bodyObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const reader = request.body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder();
    let raw = '';
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); return null; }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

function validRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

function validPosition(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export async function handlePrivateDemo(request: Request, { store, now }: { store: Store; now: number }) {
  const cookie = cookieValue(request);
  let ownRecords: Awaited<ReturnType<Store['list']>>;
  try {
    ownRecords = await store.list({ cookie, now });
  } catch (error) {
    return reply({ error: error instanceof Error && /authenticated session/i.test(error.message) ? 'unauthenticated' : 'temporarily_unavailable' },
      error instanceof Error && /authenticated session/i.test(error.message) ? 401 : 503);
  }

  try {
    if (request.method === 'GET') {
      const id = new URL(request.url).searchParams.get('id');
      if (!id) return reply({ records: ownRecords.map(publicRecord) });
      const record = await store.get({ cookie, now, id });
      return record ? reply({ record: publicRecord(record) }) : reply({ error: 'not_found' }, 404);
    }

    const body = await bodyObject(request);
    if (!body) return reply({ error: 'invalid_input' }, 400);

    if (request.method === 'POST') {
      if (!validRevision(body.goalRevision) || !validPosition(body.playbackPositionMs)) return reply({ error: 'invalid_input' }, 400);
      const record = await store.create({ cookie, now, goalRevision: body.goalRevision, playbackPositionMs: body.playbackPositionMs });
      return reply({ record: publicRecord(record) }, 201);
    }

    if (typeof body.id !== 'string' || !body.id) return reply({ error: 'invalid_input' }, 400);
    if (request.method === 'PATCH') {
      if (body.goalRevision !== undefined && !validRevision(body.goalRevision) || body.playbackPositionMs !== undefined && !validPosition(body.playbackPositionMs)) return reply({ error: 'invalid_input' }, 400);
      const record = await store.update({ cookie, now, id: body.id,
        ...(body.goalRevision === undefined ? {} : { goalRevision: body.goalRevision as number }),
        ...(body.playbackPositionMs === undefined ? {} : { playbackPositionMs: body.playbackPositionMs as number }) });
      return record ? reply({ record: publicRecord(record) }) : reply({ error: 'not_found' }, 404);
    }

    if (request.method === 'DELETE') {
      if (body.action === 'revoke') {
        const revoked = await store.revoke({ cookie, now, id: body.id });
        if (revoked) await store.delete({ cookie, now, id: body.id });
        return revoked ? new Response(null, { status: 204, headers }) : reply({ error: 'not_found' }, 404);
      }
      if (body.action === 'delete' || body.action === undefined) {
        const deleted = await store.delete({ cookie, now, id: body.id });
        if (deleted || await store.wasDeletedBy({ cookie, now, id: body.id })) return new Response(null, { status: 204, headers });
        return reply({ error: 'not_found' }, 404);
      }
      return reply({ error: 'invalid_input' }, 400);
    }
    return reply({ error: 'method_not_allowed' }, 405);
  } catch {
    return reply({ error: 'temporarily_unavailable' }, 503);
  }
}

function liveStore() {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  if (!cached || cached.secret !== secret) cached = { secret, store: createPrivateSceneStore({ sessionSecret: secret }) };
  return cached.store;
}

function live(request: Request) {
  const store = liveStore();
  return store ? handlePrivateDemo(request, { store, now: Date.now() }) : reply({ error: 'temporarily_unavailable' }, 503);
}

export const GET = live;
export const POST = live;
export const PATCH = live;
export const DELETE = live;

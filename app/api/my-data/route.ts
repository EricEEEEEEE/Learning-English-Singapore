import { join } from 'node:path';
import { createMyDataStore } from '../../../lib/my-data';
import { privateReply, sameOrigin, sessionCookie, readSmallBody, localSetup } from '../../../lib/private-request';

export const runtime = 'nodejs';
type Data = Pick<ReturnType<typeof createMyDataStore>, 'deleteAll'>;

// C5: delete all of the signed-in learner's local learning data, only with the explicit confirmation body.
export async function handleMyData(request: Request, { data, now }: { data: Data; now: number }) {
  if (request.method !== 'DELETE') return privateReply({ error: 'method' }, 405);
  if (!sameOrigin(request)) return privateReply({ error: 'origin' }, 403);
  const raw = await readSmallBody(request, 256);
  if (raw === null) return privateReply({ error: 'too_large' }, 413);
  let body: unknown; try { body = JSON.parse(raw); } catch { return privateReply({ error: 'invalid' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || (body as { confirm?: unknown }).confirm !== 'delete-all-my-data') return privateReply({ error: 'invalid' }, 400);
  try { return privateReply(await data.deleteAll({ cookie: sessionCookie(request), now })); }
  catch (error) {
    return error instanceof Error && error.message === 'Authenticated session required'
      ? privateReply({ error: 'unauthenticated' }, 401) : privateReply({ error: 'delete_failed' }, 503);
  }
}

export async function DELETE(request: Request) {
  const secret = localSetup();
  if (!secret) return privateReply({ error: 'local_setup_required' }, 503);
  const directory = join(process.cwd(), 'tmp', 'generation-tasks'), requirementsDirectory = join(process.cwd(), 'tmp', 'scene-requirements');
  return handleMyData(request, { data: createMyDataStore({ directory, requirementsDirectory, sessionSecret: secret }), now: Date.now() });
}

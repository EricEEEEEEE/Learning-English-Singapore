import { join } from 'node:path';
import { createMyDataStore } from '../../../lib/my-data';
import { privateReply, sessionCookie, localSetup } from '../../../lib/private-request';

export const runtime = 'nodejs';
type Data = Pick<ReturnType<typeof createMyDataStore>, 'records'>;

// C5: read-only history of the learner's own generation tasks, reserved cost and deletions.
export async function handleGenerationRecords(request: Request, { data, now }: { data: Data; now: number }) {
  if (request.method !== 'GET') return privateReply({ error: 'method' }, 405);
  if (new URL(request.url).searchParams.size) return privateReply({ error: 'invalid' }, 400);
  try { return privateReply(await data.records({ cookie: sessionCookie(request), now })); }
  catch (error) {
    return error instanceof Error && error.message === 'Authenticated session required'
      ? privateReply({ error: 'unauthenticated' }, 401) : privateReply({ error: 'temporarily_unavailable' }, 503);
  }
}

export async function GET(request: Request) {
  const secret = localSetup();
  if (!secret) return privateReply({ error: 'local_setup_required' }, 503);
  const directory = join(process.cwd(), 'tmp', 'generation-tasks'), requirementsDirectory = join(process.cwd(), 'tmp', 'scene-requirements');
  try { return await handleGenerationRecords(request, { data: createMyDataStore({ directory, requirementsDirectory, sessionSecret: secret }), now: Date.now() }); }
  catch { return privateReply({ error: 'temporarily_unavailable' }, 503); }
}

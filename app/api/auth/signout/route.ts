import { GOOGLE_SESSION_COOKIE } from '../../../../lib/google-auth';
import { privateReply, sameOrigin } from '../../../../lib/private-request';

export const runtime = 'nodejs';

// C5: sign out clears the session cookie on the server. It deletes no learning data.
export async function handleSignOut(request: Request) {
  if (request.method !== 'POST') return privateReply({ error: 'method' }, 405);
  if (!sameOrigin(request)) return privateReply({ error: 'origin' }, 403);
  return privateReply({ authenticated: false }, 200, { 'set-cookie': `${GOOGLE_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` });
}

export const POST = handleSignOut;

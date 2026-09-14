import { GOOGLE_SESSION_COOKIE, openGoogleSession } from '../../../../lib/google-auth';

export const runtime = 'nodejs';

function cookieValue(request: Request, name: string) {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

export async function GET(request: Request) {
  const secret = process.env.AUTH_SESSION_SECRET;
  const session = secret
    ? await openGoogleSession(cookieValue(request, GOOGLE_SESSION_COOKIE), secret)
    : null;
  return Response.json(
    { authenticated: session !== null },
    { headers: { 'cache-control': 'private, no-store, max-age=0' } },
  );
}

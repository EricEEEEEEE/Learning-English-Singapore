import { buildGoogleAuthorizationUrl, createGoogleTransaction, GOOGLE_TRANSACTION_COOKIE, sealGoogleTransaction, type GoogleRandomValues } from '../../../../../lib/google-auth';

export const runtime = 'nodejs';

export type GoogleAuthConfig = {
  clientId: string;
  clientSecret: string;
  origin: string;
  redirectUri: string;
  secret: string;
};

export function googleAuthConfig(): GoogleAuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const secret = process.env.AUTH_SESSION_SECRET;
  const origin = process.env.APP_ORIGIN;
  if (!clientId || !clientSecret || !secret || !origin) throw new Error('Google auth is not configured');
  const parsedOrigin = new URL(origin);
  const localDevelopment = parsedOrigin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsedOrigin.hostname);
  if (parsedOrigin.protocol !== 'https:' && !localDevelopment) throw new Error('Google auth origin must use HTTPS');
  const normalizedOrigin = parsedOrigin.origin;
  return { clientId, clientSecret, secret, origin: normalizedOrigin, redirectUri: `${normalizedOrigin}/api/auth/google/callback` };
}

export async function handleGoogleStart(request: Request, options: { config: GoogleAuthConfig; now?: number; random?: GoogleRandomValues }) {
  try {
    const url = new URL(request.url);
    const transaction = createGoogleTransaction({
      language: url.searchParams.get('language') ?? '',
      returnTo: url.searchParams.get('returnTo') ?? '/',
      now: options.now,
      random: options.random,
    });
    // NextURL normalizes loopback aliases; Host still identifies the cookie host.
    const configuredOrigin = new URL(options.config.origin);
    const host = request.headers.get('host');
    if (url.origin !== configuredOrigin.origin || (host !== null && host.toLowerCase() !== configuredOrigin.host.toLowerCase())) {
      const canonical = new URL('/api/auth/google/start', configuredOrigin);
      canonical.search = url.search;
      return new Response(null, { status: 302, headers: { location: canonical.toString() } });
    }
    const sealed = await sealGoogleTransaction(transaction, options.config.secret);
    const headers = new Headers({ location: buildGoogleAuthorizationUrl(transaction, options.config) });
    headers.append('set-cookie', `${GOOGLE_TRANSACTION_COOKIE}=${sealed}; Path=/api/auth/google; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
    return new Response(null, { status: 302, headers });
  } catch {
    return new Response('Google sign-in request is invalid.', { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
}

export async function GET(request: Request) {
  try {
    return await handleGoogleStart(request, { config: googleAuthConfig() });
  } catch {
    return new Response('Google sign-in is not configured.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
}

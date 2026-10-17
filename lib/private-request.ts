import { GOOGLE_SESSION_COOKIE } from './google-auth';

// Shared by the C5 private routes: same Cookie, same-origin and no-store rules as the existing routes.
export const privateReply = (body: object, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { 'cache-control': 'private, no-store, max-age=0', ...headers } });
export const sessionCookie = (request: Request) => (request.headers.get('cookie') ?? '').split(';').map(value => value.trim())
  .find(value => value.startsWith(`${GOOGLE_SESSION_COOKIE}=`))?.slice(GOOGLE_SESSION_COOKIE.length + 1);
export function sameOrigin(request: Request) {
  // NextURL may normalize loopback aliases; Host identifies the actual origin.
  const url = new URL(request.url), host = request.headers.get('host');
  if (host) url.host = host;
  const origin = request.headers.get('origin');
  return !!origin && origin === url.origin;
}
// Reads at most `limit` bytes; returns null when the body is larger.
export async function readSmallBody(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) return '';
  let raw = '', bytes = 0; const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    bytes += value.byteLength;
    if (bytes > limit) { await reader.cancel(); return null; }
    raw += decoder.decode(value, { stream: true });
  }
  return raw + decoder.decode();
}
export const localSetup = () => {
  const secret = process.env.AUTH_SESSION_SECRET;
  return !secret || process.env.VERCEL ? null : secret;
};

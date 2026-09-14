import { createPublicKey, verify as verifySignature, type JsonWebKey as NodeJsonWebKey } from 'node:crypto';
import {
  GOOGLE_CONSUMED_COOKIE, GOOGLE_JWKS_ENDPOINT, GOOGLE_SESSION_COOKIE, GOOGLE_TOKEN_ENDPOINT,
  GOOGLE_TRANSACTION_COOKIE, openConsumedState, openGoogleTransaction, sealConsumedState,
  sealGoogleSession, validateGoogleCallback, validateGoogleIdTokenClaims,
} from '../../../../../lib/google-auth';
import { googleAuthConfig, type GoogleAuthConfig } from '../start/route';

export const runtime = 'nodejs';
type JsonWebKeySet = { keys: Array<NodeJsonWebKey & { kid?: string; alg?: string; use?: string }> };
type IdTokenInput = { idToken: string; clientId: string; nonce: string; now?: number; jwks?: JsonWebKeySet };
type ExchangeInput = { code: string; codeVerifier: string; clientId: string; clientSecret: string; redirectUri: string };

function parseCookies(request: Request) {
  const result: Record<string, string> = {};
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) result[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return result;
}

function parseJwtPart(value: string) {
  const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid token');
  return parsed as Record<string, unknown>;
}

export async function verifyGoogleIdToken(input: IdTokenInput) {
  const parts = input.idToken.split('.');
  if (parts.length !== 3 || !parts[2]) throw new Error('Invalid token signature');
  const header = parseJwtPart(parts[0]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) throw new Error('Invalid token algorithm');
  let jwks = input.jwks;
  if (!jwks) {
    const response = await fetch(GOOGLE_JWKS_ENDPOINT, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Unable to load token signature keys');
    jwks = await response.json() as JsonWebKeySet;
  }
  const jwk = jwks.keys.find(key => key.kid === header.kid && key.kty === 'RSA' && (!key.alg || key.alg === 'RS256'));
  if (!jwk) throw new Error('Unknown token signature key');
  const verified = verifySignature('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
  if (!verified) throw new Error('Invalid token signature');
  return parseJwtPart(parts[1]);
}

export async function exchangeGoogleCode(input: ExchangeInput) {
  const body = new URLSearchParams({
    code: input.code, client_id: input.clientId, client_secret: input.clientSecret,
    redirect_uri: input.redirectUri, grant_type: 'authorization_code', code_verifier: input.codeVerifier,
  });
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('Google authorization code exchange failed');
  const payload: unknown = await response.json();
  const idToken = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).id_token : null;
  if (typeof idToken !== 'string' || !idToken) throw new Error('Google response did not include an ID token');
  return { idToken };
}

function callbackLocation(config: GoogleAuthConfig, returnTo: string, auth: string, language: string) {
  const destination = new URL(returnTo, config.origin);
  destination.searchParams.set('auth', auth);
  destination.searchParams.set('language', language);
  return destination.toString();
}

function clearTransaction(headers: Headers) {
  headers.append('set-cookie', `${GOOGLE_TRANSACTION_COOKIE}=; Path=/api/auth/google; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

function redirectFailure(config: GoogleAuthConfig, returnTo: string, language: string, reason: string) {
  const headers = new Headers({ location: callbackLocation(config, returnTo, reason, language) });
  clearTransaction(headers);
  return new Response(null, { status: 302, headers });
}

export async function handleGoogleCallback(request: Request, dependencies: {
  config: GoogleAuthConfig;
  now?: number;
  exchangeCode: (input: ExchangeInput) => Promise<{ idToken: string }>;
  verifyIdToken: (input: IdTokenInput) => Promise<Record<string, unknown>>;
}) {
  const now = dependencies.now ?? Date.now();
  const cookies = parseCookies(request);
  const transaction = await openGoogleTransaction(cookies[GOOGLE_TRANSACTION_COOKIE], dependencies.config.secret, now);
  if (!transaction) return redirectFailure(dependencies.config, '/', 'zh-Hans', 'invalid_transaction');
  const consumed = await openConsumedState(cookies[GOOGLE_CONSUMED_COOKIE], dependencies.config.secret, now);
  if (consumed === transaction.state) return redirectFailure(dependencies.config, transaction.returnTo, transaction.language, 'replayed');

  const url = new URL(request.url);
  const callback = validateGoogleCallback({
    code: url.searchParams.get('code') ?? undefined,
    state: url.searchParams.get('state') ?? undefined,
    error: url.searchParams.get('error') ?? undefined,
  }, transaction);
  if (!callback.ok) return redirectFailure(dependencies.config, transaction.returnTo, transaction.language, callback.reason);

  let token: { idToken: string };
  try {
    token = await dependencies.exchangeCode({
      code: callback.code, codeVerifier: transaction.codeVerifier, clientId: dependencies.config.clientId,
      clientSecret: dependencies.config.clientSecret, redirectUri: dependencies.config.redirectUri,
    });
  } catch {
    return redirectFailure(dependencies.config, transaction.returnTo, transaction.language, 'exchange_failed');
  }

  let identity;
  try {
    const claims = await dependencies.verifyIdToken({ idToken: token.idToken, clientId: dependencies.config.clientId, nonce: transaction.nonce, now });
    identity = validateGoogleIdTokenClaims(claims, { clientId: dependencies.config.clientId, nonce: transaction.nonce, now });
  } catch {
    return redirectFailure(dependencies.config, transaction.returnTo, transaction.language, 'verification_failed');
  }

  const [session, consumedState] = await Promise.all([
    sealGoogleSession(identity, dependencies.config.secret, now),
    sealConsumedState(transaction.state, dependencies.config.secret, now),
  ]);
  const headers = new Headers({ location: callbackLocation(dependencies.config, transaction.returnTo, 'success', transaction.language) });
  headers.append('set-cookie', `${GOOGLE_SESSION_COOKIE}=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800`);
  clearTransaction(headers);
  headers.append('set-cookie', `${GOOGLE_CONSUMED_COOKIE}=${consumedState}; Path=/api/auth/google; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  return new Response(null, { status: 302, headers });
}

export async function GET(request: Request) {
  let config;
  try { config = googleAuthConfig(); } catch { return new Response('Google sign-in is not configured.', { status: 503 }); }
  return handleGoogleCallback(request, { config, exchangeCode: exchangeGoogleCode, verifyIdToken: verifyGoogleIdToken });
}

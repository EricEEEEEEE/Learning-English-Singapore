import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const GOOGLE_TRANSACTION_COOKIE = 'le-sg-google-oauth';
export const GOOGLE_CONSUMED_COOKIE = 'le-sg-google-consumed';
export const GOOGLE_SESSION_COOKIE = 'le-sg-session';
export const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const GOOGLE_JWKS_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/certs';

const languages = new Set(['zh-Hans', 'id', 'ja', 'ko', 'hi']);
const transactionTtl = 10 * 60_000;
const sessionTtl = 8 * 60 * 60_000;

export type GoogleRandomValues = { state: string; nonce: string; codeVerifier: string };
export type GoogleTransaction = GoogleRandomValues & {
  language: string;
  returnTo: string;
  createdAt: number;
  expiresAt: number;
};
export type GoogleIdentity = {
  provider: 'google';
  issuer: 'https://accounts.google.com';
  providerSubject: string;
  email: string;
  name?: string;
};
export type GoogleSession = GoogleIdentity & { createdAt: number; expiresAt: number };

function freshToken() {
  return randomBytes(32).toString('base64url');
}

function validReturnTo(value: string) {
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) throw new Error('Invalid return path');
  const parsed = new URL(value, 'https://local.invalid');
  if (parsed.origin !== 'https://local.invalid') throw new Error('Invalid return path');
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function createGoogleTransaction(input: {
  language: string;
  returnTo: string;
  now?: number;
  random?: GoogleRandomValues;
}): GoogleTransaction {
  if (!languages.has(input.language)) throw new Error('Invalid language');
  const values = input.random ?? { state: freshToken(), nonce: freshToken(), codeVerifier: freshToken() };
  for (const [name, value] of Object.entries(values)) {
    if (typeof value !== 'string' || value.length < 32) throw new Error(`Invalid ${name}`);
  }
  const createdAt = input.now ?? Date.now();
  return { ...values, language: input.language, returnTo: validReturnTo(input.returnTo), createdAt, expiresAt: createdAt + transactionTtl };
}

export function buildGoogleAuthorizationUrl(transaction: GoogleTransaction, config: { clientId: string; redirectUri: string }) {
  const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: transaction.state,
    nonce: transaction.nonce,
    code_challenge: createHash('sha256').update(transaction.codeVerifier).digest('base64url'),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return url.toString();
}

function encryptionKey(secret: string) {
  if (secret.length < 32) throw new Error('Auth secret must contain at least 32 characters');
  return createHash('sha256').update(secret).digest();
}

function seal(value: unknown, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${Buffer.concat([encrypted, cipher.getAuthTag()]).toString('base64url')}`;
}

function open(value: string | null | undefined, secret: string): unknown | null {
  try {
    if (!value) return null;
    const [version, encodedIv, encodedBody, extra] = value.split('.');
    if (version !== 'v1' || !encodedIv || !encodedBody || extra) return null;
    const iv = Buffer.from(encodedIv, 'base64url');
    const body = Buffer.from(encodedBody, 'base64url');
    if (iv.toString('base64url') !== encodedIv || body.toString('base64url') !== encodedBody) return null;
    if (iv.length !== 12 || body.length <= 16) return null;
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), iv);
    decipher.setAuthTag(body.subarray(body.length - 16));
    const decoded = Buffer.concat([decipher.update(body.subarray(0, -16)), decipher.final()]).toString('utf8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function isTransaction(value: unknown): value is GoogleTransaction {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return languages.has(String(data.language)) && typeof data.returnTo === 'string' &&
    typeof data.state === 'string' && typeof data.nonce === 'string' && typeof data.codeVerifier === 'string' &&
    typeof data.createdAt === 'number' && typeof data.expiresAt === 'number';
}

export async function sealGoogleTransaction(transaction: GoogleTransaction, secret: string) {
  return seal(transaction, secret);
}

export async function openGoogleTransaction(value: string | null | undefined, secret: string, now = Date.now()) {
  const decoded = open(value, secret);
  if (!isTransaction(decoded) || decoded.expiresAt <= now) return null;
  try { validReturnTo(decoded.returnTo); } catch { return null; }
  return decoded;
}

export function validateGoogleCallback(query: Record<string, string | undefined>, transaction: GoogleTransaction) {
  if (!query.state || query.state !== transaction.state) return { ok: false as const, reason: 'invalid_state' as const };
  if (query.error === 'access_denied') return { ok: false as const, reason: 'cancelled' as const };
  if (!query.code) return { ok: false as const, reason: 'missing_code' as const };
  return { ok: true as const, code: query.code };
}

export function validateGoogleIdTokenClaims(claims: Record<string, unknown>, input: { clientId: string; nonce: string; now?: number }): GoogleIdentity {
  if (claims.iss !== 'https://accounts.google.com' && claims.iss !== 'accounts.google.com') throw new Error('Invalid issuer');
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(input.clientId)) throw new Error('Invalid audience');
  if (audience.length > 1 && claims.azp !== input.clientId) throw new Error('Invalid authorized party');
  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1000);
  if (typeof claims.exp !== 'number' || claims.exp <= nowSeconds) throw new Error('ID token expired');
  if (claims.nonce !== input.nonce) throw new Error('Invalid nonce');
  if (typeof claims.sub !== 'string' || !claims.sub) throw new Error('Invalid subject');
  if (claims.email_verified !== true || typeof claims.email !== 'string' || !claims.email) throw new Error('Email is not verified');
  return {
    provider: 'google', issuer: 'https://accounts.google.com', providerSubject: claims.sub,
    email: claims.email, ...(typeof claims.name === 'string' && claims.name ? { name: claims.name } : {}),
  };
}

export async function sealGoogleSession(identity: GoogleIdentity, secret: string, now = Date.now()) {
  return seal({ ...identity, createdAt: now, expiresAt: now + sessionTtl }, secret);
}

export async function openGoogleSession(value: string | null | undefined, secret: string, now = Date.now()): Promise<GoogleSession | null> {
  const decoded = open(value, secret);
  if (!decoded || typeof decoded !== 'object') return null;
  const data = decoded as Record<string, unknown>;
  if (data.provider !== 'google' || data.issuer !== 'https://accounts.google.com' || typeof data.providerSubject !== 'string' ||
      typeof data.email !== 'string' || typeof data.createdAt !== 'number' || typeof data.expiresAt !== 'number' || data.expiresAt <= now) return null;
  return data as GoogleSession;
}

export async function sealConsumedState(state: string, secret: string, now = Date.now()) {
  return seal({ state, expiresAt: now + transactionTtl }, secret);
}

export async function openConsumedState(value: string | null | undefined, secret: string, now = Date.now()) {
  const decoded = open(value, secret);
  if (!decoded || typeof decoded !== 'object') return null;
  const data = decoded as Record<string, unknown>;
  return typeof data.state === 'string' && typeof data.expiresAt === 'number' && data.expiresAt > now ? data.state : null;
}

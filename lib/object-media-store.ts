import { createHash, createHmac } from 'node:crypto';
import { ownerIdFromSessionCookie } from './private-owner';

// C16-4 (2026-10-24, zero cost; T62 engineering only, nothing deployed): the private media of courses in an S3-compatible
// object store (AWS S3, Cloudflare R2, MinIO and others) with the same contract as the local private media store:
// one folder per account hash, a manifest per (course, revision, asset), content-addressed bytes, a hash check on every
// read, and no write ever replaces an object (If-None-Match: *). Requests are signed with AWS Signature Version 4 written
// here on node:crypto, so no SDK or other dependency is added. Keys never reach logs or error messages.

type Locator = { cookie?: string | null; now?: number; courseId: string; revision: number; assetId: string };
type Metadata = { courseId: string; revision: number; assetId: string; sha256: string; size: number };
type Send = (url: string, init: { method: string; headers: Record<string, string>; body?: Uint8Array }) => Promise<Response>;
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(v);
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const MAX_BYTES = 100_000_000;

// RFC 3986 unreserved characters stay; everything else is percent-encoded (AWS "UriEncode").
const uriEncode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest();

// AWS Signature Version 4 for S3 (header form). Returns the headers to send, including host, x-amz-date,
// x-amz-content-sha256 and authorization. payloadSha256 is the hex SHA-256 of the exact body (of '' when there is none).
export function signS3Request(input: { method: string; url: string; headers?: Record<string, string>; payloadSha256: string; region: string; accessKeyId: string; secretAccessKey: string; date: Date; service?: string }): Record<string, string> {
  const url = new URL(input.url);
  const stamp = input.date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = stamp.slice(0, 8), service = input.service ?? 's3';
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(input.headers ?? {})) headers[name.toLowerCase()] = String(value);
  Object.assign(headers, { host: url.host, 'x-amz-date': stamp, 'x-amz-content-sha256': input.payloadSha256 });
  const names = Object.keys(headers).sort();
  const path = url.pathname.split('/').map(part => uriEncode(decodeURIComponent(part))).join('/') || '/';
  const query = [...url.searchParams].map(([k, v]) => [uriEncode(k), uriEncode(v)]).sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : a[0] < b[0] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('&');
  const canonical = [input.method.toUpperCase(), path, query, ...names.map(name => `${name}:${headers[name].trim().replace(/\s+/g, ' ')}`), '', names.join(';'), input.payloadSha256].join('\n');
  const scope = `${day}/${input.region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', stamp, scope, digest(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), input.region), service), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

function checkEndpoint(endpoint: unknown) {
  if (typeof endpoint !== 'string' || !endpoint) throw new Error('Object store endpoint required');
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new Error('Invalid object store endpoint'); }
  const secure = url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.has(url.hostname));
  if (!secure || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) throw new Error('Invalid object store endpoint');
  return url.origin;
}

export function createObjectMediaStore(options: { endpoint: string; bucket: string; region: string; accessKeyId: string; secretAccessKey: string; sessionSecret: string; prefix?: string; fetch?: Send; clock?: () => Date }) {
  const origin = checkEndpoint(options?.endpoint);
  const { bucket, region, accessKeyId, secretAccessKey, sessionSecret } = options;
  if (typeof bucket !== 'string' || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error('Invalid object store bucket');
  if (typeof region !== 'string' || !/^[a-z0-9-]{1,40}$/.test(region)) throw new Error('Invalid object store region');
  if (typeof accessKeyId !== 'string' || !accessKeyId || typeof secretAccessKey !== 'string' || !secretAccessKey) throw new Error('Object store credentials required');
  if (typeof sessionSecret !== 'string' || !sessionSecret) throw new Error('Media store configuration required');
  const prefix = options.prefix ?? 'les-media/';
  if (typeof prefix !== 'string' || !/^([a-z0-9-]{1,60}\/)?$/.test(prefix)) throw new Error('Invalid object store prefix');
  const send: Send = options.fetch ?? ((url, init) => fetch(url, init as RequestInit));
  const clock = options.clock ?? (() => new Date());

  // One signed request; any transport problem becomes a plain error without the request, headers or keys.
  async function request(method: 'GET' | 'PUT' | 'DELETE', key: string, extra: { body?: Uint8Array; query?: Record<string, string>; headers?: Record<string, string> } = {}) {
    const url = new URL(`${origin}/${bucket}${key ? `/${key.split('/').map(uriEncode).join('/')}` : ''}`);
    for (const [name, value] of Object.entries(extra.query ?? {})) url.searchParams.set(name, value);
    const body = extra.body ?? new Uint8Array(0);
    const signed = signS3Request({ method, url: url.toString(), headers: extra.headers, payloadSha256: digest(body), region, accessKeyId, secretAccessKey, date: clock() });
    const { host: _host, ...headers } = signed;
    try { return await send(url.toString(), { method, headers, ...(extra.body ? { body: extra.body } : {}) }); }
    catch { throw new Error('Object store request failed'); }
  }
  async function bytesOf(response: Response) {
    try { return Buffer.from(await response.arrayBuffer()); } catch { throw new Error('Object store request failed'); }
  }
  async function getObject(key: string): Promise<Buffer | null> {
    const response = await request('GET', key);
    if (response.status === 404) { await response.body?.cancel(); return null; }
    if (!response.ok) { await response.body?.cancel(); throw new Error('Object store request failed'); }
    const bytes = await bytesOf(response);
    if (bytes.length > MAX_BYTES) throw new Error('Object store request failed');
    return bytes;
  }
  // Creates the object only if it does not exist yet. Returns false when it already existed.
  async function create(key: string, bytes: Uint8Array) {
    const response = await request('PUT', key, { body: bytes, headers: { 'if-none-match': '*', 'content-type': 'application/octet-stream' } });
    await response.body?.cancel();
    if (response.status === 412 || response.status === 409) return false;
    if (!response.ok) throw new Error('Object store request failed');
    return true;
  }
  async function remove(key: string) {
    const response = await request('DELETE', key);
    await response.body?.cancel();
    if (!response.ok && response.status !== 404) throw new Error('Object store request failed');
  }
  async function list(folder: string) {
    const keys: string[] = [];
    let token: string | undefined;
    for (let page = 0; page < 1000; page++) {
      const response = await request('GET', '', { query: { 'list-type': '2', prefix: folder, ...(token ? { 'continuation-token': token } : {}) } });
      if (!response.ok) { await response.body?.cancel(); throw new Error('Object store request failed'); }
      const xml = (await bytesOf(response)).toString('utf8');
      const unescape = (value: string) => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
      for (const match of xml.matchAll(/<Key>([^<]*)<\/Key>/g)) keys.push(unescape(match[1]));
      token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? unescape(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml)?.[1] ?? '') : undefined;
      if (!token) return keys.filter(key => key.startsWith(folder));
    }
    throw new Error('Object store listing too long');
  }
  async function ownerFolder(input: { cookie?: string | null; now?: number }) {
    const owner = await ownerIdFromSessionCookie(input.cookie, sessionSecret, input.now);
    if (!owner) throw new Error('Authenticated session required');
    return `${prefix}${digest(owner)}/`;
  }
  async function paths(input: Locator) {
    const folder = await ownerFolder(input);
    if (!identifier(input.courseId) || !identifier(input.assetId) || !Number.isSafeInteger(input.revision) || input.revision < 1) throw new Error('Invalid asset locator');
    return { folder, manifest: `${folder}${digest(JSON.stringify([input.courseId, input.revision, input.assetId]))}.json` };
  }
  function parseManifest(raw: Buffer, input: Locator): Metadata {
    let meta: Metadata;
    try { meta = JSON.parse(raw.toString('utf8')); } catch { throw new Error('Invalid asset metadata'); }
    if (!meta || meta.courseId !== input.courseId || meta.revision !== input.revision || meta.assetId !== input.assetId || typeof meta.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(meta.sha256) || !Number.isSafeInteger(meta.size) || meta.size <= 0 || meta.size > MAX_BYTES) throw new Error('Invalid asset metadata');
    return { courseId: meta.courseId, revision: meta.revision, assetId: meta.assetId, sha256: meta.sha256, size: meta.size };
  }
  async function load(folder: string, manifest: string, input: Locator): Promise<{ metadata: Metadata; bytes: Buffer } | null> {
    const raw = await getObject(manifest);
    if (!raw) return null;
    const metadata = parseManifest(raw, input);
    const bytes = await getObject(`${folder}${metadata.sha256}.bin`);
    if (!bytes || bytes.length !== metadata.size || digest(bytes) !== metadata.sha256) throw new Error('Asset integrity failed');
    return { metadata, bytes };
  }

  return {
    async put(input: Locator & { bytes: Uint8Array; sha256: string }): Promise<Metadata> {
      const { folder, manifest } = await paths(input);
      if (!(input.bytes instanceof Uint8Array) || !input.bytes.length || input.bytes.length > MAX_BYTES || digest(input.bytes) !== input.sha256) throw new Error('Invalid asset bytes');
      const existing = await load(folder, manifest, input);
      if (existing) {
        if (existing.metadata.sha256 !== input.sha256) throw new Error('Asset replacement prohibited');
        return existing.metadata;
      }
      const metadata: Metadata = { courseId: input.courseId, revision: input.revision, assetId: input.assetId, sha256: input.sha256, size: input.bytes.length };
      const binary = `${folder}${input.sha256}.bin`;
      if (!(await create(binary, input.bytes))) {
        const stored = await getObject(binary);
        if (!stored || !stored.equals(Buffer.from(input.bytes))) throw new Error('Asset replacement prohibited');
      }
      const body = Buffer.from(JSON.stringify(metadata));
      if (!(await create(manifest, body))) {
        const stored = await getObject(manifest);
        if (!stored || JSON.stringify(parseManifest(stored, input)) !== JSON.stringify(metadata)) throw new Error('Asset replacement prohibited');
      }
      return metadata;
    },
    async get(input: Locator) {
      const { folder, manifest } = await paths(input);
      const result = await load(folder, manifest, input);
      return result ? { ...result.metadata, bytes: result.bytes } : null;
    },
    // Learner-requested deletion (C5): remove every asset of one course, then any bytes no other asset still uses.
    async removeCourse(input: { cookie?: string | null; now?: number; courseId: string }) {
      if (!identifier(input.courseId)) throw new Error('Invalid asset locator');
      const folder = await ownerFolder(input);
      const keys = await list(folder);
      const kept = new Set<string>(), dropped = new Set<string>();
      for (const key of keys.filter(item => /^[a-f0-9]{64}\.json$/.test(item.slice(folder.length)))) {
        const raw = await getObject(key);
        if (!raw) continue;
        let meta: Partial<Metadata> | null = null;
        try { meta = JSON.parse(raw.toString('utf8')); } catch { meta = null; }
        if (meta?.courseId === input.courseId) { await remove(key); if (typeof meta.sha256 === 'string') dropped.add(meta.sha256); }
        else if (typeof meta?.sha256 === 'string') kept.add(meta.sha256);
      }
      for (const sha256 of dropped) if (/^[a-f0-9]{64}$/.test(sha256) && !kept.has(sha256)) await remove(`${folder}${sha256}.bin`);
    },
    async removeAll(input: { cookie?: string | null; now?: number }) {
      const folder = await ownerFolder(input);
      for (const key of await list(folder)) await remove(key);
    },
  };
}

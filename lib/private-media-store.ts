import { mkdirSync, readFileSync, writeFileSync, linkSync, unlinkSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { ownerIdFromSessionCookie } from './private-owner';

type Locator = { cookie?: string | null; now?: number; courseId: string; revision: number; assetId: string };
type Metadata = { courseId: string; revision: number; assetId: string; sha256: string; size: number };
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(v);
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';

// Local private files only, outside public/. Does not attest to media format or playability.
export function createPrivateMediaStore({ directory, sessionSecret }: { directory: string; sessionSecret: string }) {
  if (!directory || !sessionSecret) throw new Error('Media store configuration required');
  const root = resolve(directory);
  async function paths(input: Locator) {
    const owner = await ownerIdFromSessionCookie(input.cookie, sessionSecret, input.now);
    if (!owner) throw new Error('Authenticated session required');
    if (!identifier(input.courseId) || !identifier(input.assetId) || !Number.isSafeInteger(input.revision) || input.revision < 1) throw new Error('Invalid asset locator');
    const folder = join(root, digest(owner));
    const key = digest(JSON.stringify([input.courseId, input.revision, input.assetId]));
    return { folder, manifest: join(folder, `${key}.json`) };
  }
  function read(path: string): Buffer {
    if (!lstatSync(path).isFile()) throw new Error('Invalid asset file');
    return readFileSync(path);
  }
  function load(folder: string, manifest: string, input: Locator): { metadata: Metadata; bytes: Buffer } | null {
    let raw: Buffer;
    try {
      if (!lstatSync(root).isDirectory() || !lstatSync(folder).isDirectory()) throw new Error('Invalid media directory');
      raw = read(manifest);
    } catch (error) { if (missing(error)) return null; throw error; }
    const meta = JSON.parse(raw.toString('utf8')) as Metadata;
    if (!meta || meta.courseId !== input.courseId || meta.revision !== input.revision || meta.assetId !== input.assetId || typeof meta.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(meta.sha256) || !Number.isSafeInteger(meta.size) || meta.size <= 0 || meta.size > 100_000_000) throw new Error('Invalid asset metadata');
    const bytes = read(join(folder, `${meta.sha256}.bin`));
    if (bytes.length !== meta.size || digest(bytes) !== meta.sha256) throw new Error('Asset integrity failed');
    return { metadata: meta, bytes };
  }
  // Publish a complete file without replacing an existing file, including across processes.
  function publish(path: string, bytes: Uint8Array) {
    const temp = `${path}.${randomUUID()}.tmp`;
    writeFileSync(temp, bytes, { flag: 'wx', mode: 0o600, flush: true });
    try {
      try { linkSync(temp, path); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (!read(path).equals(Buffer.from(bytes))) throw new Error('Asset replacement prohibited');
      }
    } finally { unlinkSync(temp); }
  }
  return {
    async put(input: Locator & { bytes: Uint8Array; sha256: string }): Promise<Metadata> {
      const { folder, manifest } = await paths(input);
      if (!(input.bytes instanceof Uint8Array) || !input.bytes.length || input.bytes.length > 100_000_000 || digest(input.bytes) !== input.sha256) throw new Error('Invalid asset bytes');
      mkdirSync(root, { recursive: true, mode: 0o700 });
      if (!lstatSync(root).isDirectory()) throw new Error('Invalid media directory');
      mkdirSync(folder, { mode: 0o700, recursive: true });
      if (!lstatSync(folder).isDirectory()) throw new Error('Invalid owner directory');
      const existing = load(folder, manifest, input);
      if (existing) {
        if (existing.metadata.sha256 !== input.sha256) throw new Error('Asset replacement prohibited');
        return existing.metadata;
      }
      const metadata: Metadata = { courseId: input.courseId, revision: input.revision, assetId: input.assetId, sha256: input.sha256, size: input.bytes.length };
      publish(join(folder, `${input.sha256}.bin`), input.bytes);
      publish(manifest, Buffer.from(JSON.stringify(metadata)));
      return metadata;
    },
    async get(input: Locator) {
      const { folder, manifest } = await paths(input);
      const result = load(folder, manifest, input);
      return result ? { ...result.metadata, bytes: result.bytes } : null;
    },
  };
}

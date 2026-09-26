import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const now = Date.UTC(2026, 8, 26);
const secret = 'synthetic-media-store-session-secret-32-chars';
const bytes = Buffer.from('synthetic asset bytes, not playable media');
const hash = b => createHash('sha256').update(b).digest('hex');
async function setup() {
  const { createPrivateMediaStore } = await import('../../lib/private-media-store.ts');
  const { sealGoogleSession } = await import('../../lib/google-auth.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-media-'));
  const options = { directory, sessionSecret: secret };
  const cookie = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'a', email: 'a@example.invalid' }, secret, now);
  const other = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'b', email: 'b@example.invalid' }, secret, now);
  return { store: createPrivateMediaStore(options), reopen: () => createPrivateMediaStore(options), cookie, other, directory };
}
const input = cookie => ({ cookie, now: now + 1, courseId: 'party', revision: 1, assetId: 'line-a', bytes, sha256: hash(bytes) });
const lookup = cookie => ({ cookie, now: now + 1, courseId: 'party', revision: 1, assetId: 'line-a' });

test('T61B media: exact bytes and digest survive reopening without exposing local path', async () => {
  const { store, reopen, cookie } = await setup(); const saved = await store.put(input(cookie));
  expect(saved).toEqual({ courseId: 'party', revision: 1, assetId: 'line-a', sha256: hash(bytes), size: bytes.length });
  expect(Buffer.from((await reopen().get(lookup(cookie))).bytes)).toEqual(bytes);
});

test('T61B media: signed owner and revision isolate identical identifiers', async () => {
  const { store, cookie, other } = await setup(); await store.put(input(cookie));
  expect(await store.get(lookup(other))).toBeNull();
  expect(await store.get({ ...lookup(cookie), revision: 2 })).toBeNull();
  await expect(store.put(input(null))).rejects.toThrow();
  await store.put({ ...input(other), bytes: Buffer.from('other'), sha256: hash(Buffer.from('other')) });
  expect(Buffer.from((await store.get(lookup(cookie))).bytes)).toEqual(bytes);
});

test('T61B media: concurrent identical saves are idempotent, replacement rejected', async () => {
  const { store, reopen, cookie } = await setup();
  const results = await Promise.all([store.put(input(cookie)), reopen().put(input(cookie))]);
  expect(results[0]).toEqual(results[1]);
  await expect(store.put({ ...input(cookie), bytes: Buffer.from('changed'), sha256: hash(Buffer.from('changed')) })).rejects.toThrow();
  expect(Buffer.from((await reopen().get(lookup(cookie))).bytes)).toEqual(bytes);
});

test('T61B media: wrong digest leaves no readable asset', async () => {
  const { store, cookie } = await setup();
  await expect(store.put({ ...input(cookie), sha256: '0'.repeat(64) })).rejects.toThrow();
  expect(await store.get(lookup(cookie))).toBeNull();
});

for (const patch of [{ courseId: '../outside' }, { assetId: '/absolute' }, { revision: 0 }, { revision: 1.5 }]) test(`T61B media: invalid locator ${JSON.stringify(patch)} is rejected`, async () => {
  const { store, cookie } = await setup();
  await expect(store.put({ ...input(cookie), ...patch })).rejects.toThrow();
  await expect(store.get({ ...lookup(cookie), ...patch })).rejects.toThrow();
});

test('T61B media: corruption is detected rather than returned as usable bytes', async () => {
  const { store, cookie, directory } = await setup(); await store.put(input(cookie));
  async function files(dir) {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name); if (entry.isDirectory()) out.push(...await files(path)); else out.push(path);
    }
    return out;
  }
  const candidates = [];
  for (const path of await files(directory)) if ((await readFile(path)).equals(bytes)) candidates.push(path);
  expect(candidates).toHaveLength(1);
  await writeFile(candidates[0], Buffer.alloc(bytes.length, 120));
  await expect(store.get(lookup(cookie))).rejects.toThrow();
});

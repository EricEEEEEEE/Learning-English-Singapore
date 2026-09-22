import { test, expect } from '@playwright/test';

const loadAuth = () => import('../../lib/google-auth.ts');
const loadStore = () => import('../../lib/private-scene-store.ts');
const now = Date.UTC(2026, 8, 22, 8, 0, 0);
const secret = 'offline-private-store-secret-at-least-32-characters';

async function cookie(providerSubject, email = 'same@example.com') {
  const { sealGoogleSession } = await loadAuth();
  return sealGoogleSession({
    provider: 'google', issuer: 'https://accounts.google.com', providerSubject, email,
  }, secret, now);
}

test('T45 / F11.2: a signed session owns a new scene even when the payload names another owner', async () => {
  const { createPrivateSceneStore } = await loadStore();
  const { ownerIdFromSessionCookie } = await import('../../lib/private-owner.ts');
  const firstCookie = await cookie('subject-a');
  const secondCookie = await cookie('subject-b');
  const firstOwner = await ownerIdFromSessionCookie(firstCookie, secret, now + 1);
  const secondOwner = await ownerIdFromSessionCookie(secondCookie, secret, now + 1);
  const store = createPrivateSceneStore({ sessionSecret: secret });
  const scene = await store.create({
    cookie: secondCookie, now: now + 1, goalRevision: 1, playbackPositionMs: 0,
    ownerId: firstOwner, email: 'victim@example.com', name: 'Victim',
  });
  expect(scene.ownerId).toBe(secondOwner);
  expect(scene).not.toHaveProperty('email');
  expect(scene).not.toHaveProperty('name');
  expect(await store.get({ cookie: secondCookie, now: now + 1, id: scene.id })).toEqual(scene);
  expect(await store.get({ cookie: firstCookie, now: now + 1, id: scene.id })).toBeNull();
  expect(await store.list({ cookie: firstCookie, now: now + 1 })).toEqual([]);
});

test('T45 / F11.1,F11.4: only the owner can update goal revision and playback position', async () => {
  const { createPrivateSceneStore } = await loadStore();
  const firstCookie = await cookie('subject-a');
  const secondCookie = await cookie('subject-b');
  const { ownerIdFromSessionCookie } = await import('../../lib/private-owner.ts');
  const secondOwner = await ownerIdFromSessionCookie(secondCookie, secret, now + 1);
  const store = createPrivateSceneStore({ sessionSecret: secret });
  const scene = await store.create({ cookie: firstCookie, now: now + 1, goalRevision: 1, playbackPositionMs: 0 });
  expect(await store.update({ cookie: secondCookie, now: now + 2, id: scene.id, goalRevision: 7, playbackPositionMs: 99_000 })).toBeNull();
  expect(await store.get({ cookie: firstCookie, now: now + 2, id: scene.id })).toMatchObject({ goalRevision: 1, playbackPositionMs: 0 });
  const updated = await store.update({ cookie: firstCookie, now: now + 3, id: scene.id, goalRevision: 2, playbackPositionMs: 12_000, ownerId: secondOwner });
  expect(updated).toMatchObject({ id: scene.id, ownerId: scene.ownerId, goalRevision: 2, playbackPositionMs: 12_000 });
  expect(await store.list({ cookie: firstCookie, now: now + 3 })).toEqual([updated]);
  expect(await store.delete({ cookie: secondCookie, now: now + 4, id: scene.id })).toBe(false);
  expect(await store.get({ cookie: firstCookie, now: now + 4, id: scene.id })).toEqual(updated);
});

test('T45 / F14.4: revocation immediately hides a scene and deletion cannot be replayed', async () => {
  const { createPrivateSceneStore } = await loadStore();
  const firstCookie = await cookie('subject-a');
  const secondCookie = await cookie('subject-b');
  const store = createPrivateSceneStore({ sessionSecret: secret });
  const scene = await store.create({ cookie: firstCookie, now: now + 1, goalRevision: 1, playbackPositionMs: 4_000 });
  expect(await store.revoke({ cookie: secondCookie, now: now + 2, id: scene.id })).toBe(false);
  expect(await store.revoke({ cookie: firstCookie, now: now + 3, id: scene.id })).toBe(true);
  expect(await store.get({ cookie: firstCookie, now: now + 4, id: scene.id })).toBeNull();
  expect(await store.list({ cookie: firstCookie, now: now + 4 })).toEqual([]);
  expect(await store.update({ cookie: firstCookie, now: now + 4, id: scene.id, goalRevision: 2 })).toBeNull();
  expect(await store.delete({ cookie: firstCookie, now: now + 5, id: scene.id })).toBe(true);
  expect(await store.delete({ cookie: firstCookie, now: now + 6, id: scene.id })).toBe(false);
});

test('T45 / F1.2,F11.2: expired or altered sessions cannot read or write the store', async () => {
  const { createPrivateSceneStore } = await loadStore();
  const valid = await cookie('subject-a');
  const altered = `${valid.slice(0, -1)}${valid.endsWith('x') ? 'y' : 'x'}`;
  const store = createPrivateSceneStore({ sessionSecret: secret });
  const scene = await store.create({ cookie: valid, now: now + 1, goalRevision: 1, playbackPositionMs: 0 });
  for (const invalid of [null, altered]) {
    await expect(store.create({ cookie: invalid, now: now + 2, goalRevision: 1, playbackPositionMs: 0 })).rejects.toThrow(/auth|session/i);
    await expect(store.get({ cookie: invalid, now: now + 2, id: scene.id })).rejects.toThrow(/auth|session/i);
    await expect(store.update({ cookie: invalid, now: now + 2, id: scene.id, playbackPositionMs: 90_000 })).rejects.toThrow(/auth|session/i);
    await expect(store.revoke({ cookie: invalid, now: now + 2, id: scene.id })).rejects.toThrow(/auth|session/i);
  }
  await expect(store.list({ cookie: valid, now: now + 8 * 60 * 60_000 })).rejects.toThrow(/auth|session/i);
  await expect(store.delete({ cookie: valid, now: now + 8 * 60 * 60_000, id: scene.id })).rejects.toThrow(/auth|session/i);
});

test('T45 / F11.1: the test store is explicitly volatile and a fresh instance has no old records', async () => {
  const { createPrivateSceneStore } = await loadStore();
  const signed = await cookie('subject-a');
  const first = createPrivateSceneStore({ sessionSecret: secret });
  await first.create({ cookie: signed, now: now + 1, goalRevision: 1, playbackPositionMs: 0 });
  expect((await first.list({ cookie: signed, now: now + 2 })).length).toBe(1);
  const restarted = createPrivateSceneStore({ sessionSecret: secret });
  expect(restarted.persistence).toBe('memory-only');
  expect(await restarted.list({ cookie: signed, now: now + 2 })).toEqual([]);
});

test('T45 / F11.1: returning to a scene in the same running store restores its revision and listening position', async () => {
  const { createPrivateSceneStore } = await loadStore();
  const signed = await cookie('subject-a');
  const store = createPrivateSceneStore({ sessionSecret: secret });
  const scene = await store.create({ cookie: signed, now: now + 1, goalRevision: 1, playbackPositionMs: 0 });
  await store.update({ cookie: signed, now: now + 2, id: scene.id, goalRevision: 3, playbackPositionMs: 43_000 });
  await store.create({ cookie: signed, now: now + 3, goalRevision: 1, playbackPositionMs: 0 });
  const resumed = await store.get({ cookie: signed, now: now + 4, id: scene.id });
  expect(resumed).toMatchObject({ id: scene.id, goalRevision: 3, playbackPositionMs: 43_000 });
});

test('T45 / F11.2: callers cannot mutate returned objects to transfer ownership', async () => {
  const { createPrivateSceneStore } = await loadStore();
  const firstCookie = await cookie('subject-a');
  const secondCookie = await cookie('subject-b');
  const { ownerIdFromSessionCookie } = await import('../../lib/private-owner.ts');
  const firstOwner = await ownerIdFromSessionCookie(firstCookie, secret, now + 1);
  const secondOwner = await ownerIdFromSessionCookie(secondCookie, secret, now + 1);
  const store = createPrivateSceneStore({ sessionSecret: secret });
  const created = await store.create({ cookie: firstCookie, now: now + 1, goalRevision: 1, playbackPositionMs: 0 });
  created.ownerId = secondOwner;
  const listed = await store.list({ cookie: firstCookie, now: now + 2 });
  listed[0].ownerId = secondOwner;
  const read = await store.get({ cookie: firstCookie, now: now + 2, id: created.id });
  expect(read).not.toBeNull();
  read.ownerId = secondOwner;
  expect(await store.get({ cookie: secondCookie, now: now + 2, id: created.id })).toBeNull();
  expect(await store.get({ cookie: firstCookie, now: now + 2, id: created.id })).toMatchObject({ ownerId: firstOwner });
});

import { test, expect } from '@playwright/test';

const auth = () => import('../../lib/google-auth.ts');
const owner = () => import('../../lib/private-owner.ts');
const now = Date.UTC(2026, 8, 22, 6, 0, 0);
const secret = 'offline-owner-test-secret-at-least-32-characters';

async function cookie(providerSubject, email = 'same@example.com') {
  const { sealGoogleSession } = await auth();
  return sealGoogleSession({
    provider: 'google', issuer: 'https://accounts.google.com', providerSubject, email,
  }, secret, now);
}

test('T44 / F1.2,F1.5: a verified Google subject retains one opaque owner across email changes', async () => {
  const { ownerIdFromSessionCookie } = await owner();
  const first = await ownerIdFromSessionCookie(await cookie('google-subject-a', 'old@example.com'), secret, now + 1);
  const renamed = await ownerIdFromSessionCookie(await cookie('google-subject-a', 'new@example.com'), secret, now + 1);
  expect(first).toBeTruthy();
  expect(first).toBe(renamed);
  expect(first).not.toContain('google-subject-a');
  expect(first).not.toContain('example.com');
});

test('T44 / F1.5: two Google subjects with one email never share an owner', async () => {
  const { ownerIdFromSessionCookie } = await owner();
  const first = await ownerIdFromSessionCookie(await cookie('google-subject-a'), secret, now + 1);
  const second = await ownerIdFromSessionCookie(await cookie('google-subject-b'), secret, now + 1);
  expect(second).toBeTruthy();
  expect(second).not.toBe(first);
});

test('T44 / F1.2: absent, expired and tampered session cookies cannot identify an owner', async () => {
  const { ownerIdFromSessionCookie } = await owner();
  const valid = await cookie('google-subject-a');
  const tampered = `${valid.slice(0, -1)}${valid.endsWith('x') ? 'y' : 'x'}`;
  expect(await ownerIdFromSessionCookie(null, secret, now + 1)).toBeNull();
  expect(await ownerIdFromSessionCookie(valid, secret, now + 8 * 60 * 60_000)).toBeNull();
  expect(await ownerIdFromSessionCookie(tampered, secret, now + 1)).toBeNull();
  expect(await ownerIdFromSessionCookie(valid, 'different-offline-secret-at-least-32-chars', now + 1)).toBeNull();
});

test('T44 / F11.2,F14.4: forged owner and revoked records deny access without losing scene fields', async () => {
  const { ownerIdFromSessionCookie, requireOwnedScene } = await owner();
  const first = await ownerIdFromSessionCookie(await cookie('google-subject-a'), secret, now + 1);
  const second = await ownerIdFromSessionCookie(await cookie('google-subject-b'), secret, now + 1);
  const record = {
    id: 'private-scene-1', ownerId: first, goalRevision: 2,
    playbackPositionMs: 12_000, revokedAt: null,
  };
  expect(requireOwnedScene(record, first)).toEqual(record);
  expect(() => requireOwnedScene(record, second)).toThrow(/owner|access|forbidden|unauthorized/i);
  expect(() => requireOwnedScene(record, null)).toThrow(/owner|access|forbidden|unauthorized/i);
  expect(() => requireOwnedScene({ ...record, revokedAt: now }, first)).toThrow(/revoked|access|forbidden/i);
});

test('T44 / F1.5,F11.2: client owner, email and name cannot choose who owns a new scene', async () => {
  const { ownerIdFromSessionCookie, createOwnedScene } = await owner();
  const first = await ownerIdFromSessionCookie(await cookie('google-subject-a'), secret, now + 1);
  const second = await ownerIdFromSessionCookie(await cookie('google-subject-b'), secret, now + 1);
  const scene = createOwnedScene(second, {
    id: 'private-scene-2', goalRevision: 2, playbackPositionMs: 12_000,
    ownerId: first, email: 'victim@example.com', name: 'Victim',
  });
  expect(scene.ownerId).toBe(second);
  expect(scene.goalRevision).toBe(2);
  expect(scene.playbackPositionMs).toBe(12_000);
  expect(scene).not.toHaveProperty('email');
  expect(scene).not.toHaveProperty('name');
});

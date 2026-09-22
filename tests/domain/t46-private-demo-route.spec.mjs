import { test, expect } from '@playwright/test';

const secret = 't46-offline-session-secret-at-least-32-characters';
const clock = Date.UTC(2026, 8, 22, 10, 0, 0);
const url = 'https://learning-english.example/api/private-demo';

async function signed(subject, issuedAt = clock) {
  const { sealGoogleSession } = await import('../../lib/google-auth.ts');
  return sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: subject, email: `${subject}@example.test` }, secret, issuedAt);
}

async function request(method, cookie, body, query = '') {
  const { GOOGLE_SESSION_COOKIE } = await import('../../lib/google-auth.ts');
  return new Request(`${url}${query}`, {
    method,
    headers: { ...(cookie ? { cookie: `${GOOGLE_SESSION_COOKIE}=${cookie}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test('T46 / F1.5,F11.2: HTTP create/list/update/revoke/delete derive owner only from the signed Cookie', async () => {
  const { createPrivateSceneStore } = await import('../../lib/private-scene-store.ts');
  const { handlePrivateDemo } = await import('../../app/api/private-demo/route.ts');
  const store = createPrivateSceneStore({ sessionSecret: secret });
  const a = await signed('account-a');
  const b = await signed('account-b');
  const call = async (method, cookie, body, query) => handlePrivateDemo(await request(method, cookie, body, query), { store, now: clock + 1 });

  const created = await call('POST', a, { goalRevision: 2, playbackPositionMs: 0, ownerId: 'account-b', email: 'account-b@example.test', now: clock - 1000 });
  expect(created.status).toBe(201);
  expect(created.headers.get('cache-control')).toMatch(/no-store/);
  const { record } = await created.json();
  expect(record).toMatchObject({ goalRevision: 2, playbackPositionMs: 0 });
  expect(typeof record.id).toBe('string');
  expect(record).not.toHaveProperty('ownerId');
  expect(record).not.toHaveProperty('email');
  expect(record).not.toHaveProperty('providerSubject');
  expect((await (await call('GET', a)).json()).records).toEqual([record]);
  expect((await (await call('GET', b)).json()).records).toEqual([]);
  expect((await call('GET', b, null, `?id=${record.id}`)).status).toBe(404);
  expect((await call('PATCH', b, { id: record.id, goalRevision: 99, playbackPositionMs: 999_000 })).status).toBe(404);
  expect((await call('DELETE', b, { id: record.id })).status).toBe(404);
  expect(await (await call('GET', a, null, `?id=${record.id}`)).json()).toEqual({ record });

  const updated = await call('PATCH', a, { id: record.id, goalRevision: 3, playbackPositionMs: 43_000, ownerId: 'account-b' });
  expect(updated.status).toBe(200);
  expect((await updated.json()).record).toMatchObject({ id: record.id, goalRevision: 3, playbackPositionMs: 43_000 });
  expect((await call('DELETE', a, { id: record.id, action: 'revoke' })).status).toBe(204);
  expect((await call('GET', a, null, `?id=${record.id}`)).status).toBe(404);
  expect((await call('DELETE', a, { id: record.id, action: 'delete' })).status).toBe(204);
  expect((await call('DELETE', a, { id: record.id, action: 'delete' })).status).toBe(204);
});

test('T46 / F1.5,F11.2: missing, forged and expired sessions fail every HTTP entry, including forged old now', async () => {
  const { createPrivateSceneStore } = await import('../../lib/private-scene-store.ts');
  const { handlePrivateDemo, GET, POST, PATCH, DELETE } = await import('../../app/api/private-demo/route.ts');
  const store = createPrivateSceneStore({ sessionSecret: secret });
  const valid = await signed('account-a');
  const invalid = `${valid.slice(0, 10)}${valid[10] === 'x' ? 'y' : 'x'}${valid.slice(11)}`;
  const expired = await signed('account-a', clock - 9 * 60 * 60_000);
  for (const cookie of [null, invalid, expired]) {
    for (const [method, body] of [['GET', null], ['POST', { goalRevision: 1, playbackPositionMs: 0, now: clock - 9 * 60 * 60_000 }], ['PATCH', { id: 'any', now: clock - 9 * 60 * 60_000 }], ['DELETE', { id: 'any', now: clock - 9 * 60 * 60_000 }]]) {
      const response = await handlePrivateDemo(await request(method, cookie, body, `?now=${clock - 9 * 60 * 60_000}`), { store, now: clock });
      expect(response.status, `${method} must reject ${cookie ? 'bad' : 'missing'} session`).toBe(401);
      expect(response.headers.get('cache-control')).toMatch(/no-store/);
    }
  }
  const oldSecret = process.env.AUTH_SESSION_SECRET;
  process.env.AUTH_SESSION_SECRET = secret;
  try {
    for (const [handler, method, body] of [
      [GET, 'GET', null], [POST, 'POST', { goalRevision: 1, playbackPositionMs: 0, now: clock - 9 * 60 * 60_000 }],
      [PATCH, 'PATCH', { id: 'any', now: clock - 9 * 60 * 60_000 }],
      [DELETE, 'DELETE', { id: 'any', now: clock - 9 * 60 * 60_000 }],
    ]) {
      const response = await handler(await request(method, expired, body, `?now=${clock - 9 * 60 * 60_000}`));
      expect(response.status, `real ${method} route must use server clock`).toBe(401);
    }
  } finally {
    if (oldSecret === undefined) delete process.env.AUTH_SESSION_SECRET;
    else process.env.AUTH_SESSION_SECRET = oldSecret;
  }
});

test('T46 / F11.1,F11.2: exported HTTP routes complete a valid signed-cookie round trip without client owner input', async () => {
  const { GET, POST, PATCH, DELETE } = await import('../../app/api/private-demo/route.ts');
  const previous = process.env.AUTH_SESSION_SECRET;
  process.env.AUTH_SESSION_SECRET = secret;
  try {
    const a = await signed('real-route-account-a', Date.now());
    const b = await signed('real-route-account-b', Date.now());
    const created = await POST(await request('POST', a, { goalRevision: 4, playbackPositionMs: 0, ownerId: 'real-route-account-b' }));
    expect(created.status).toBe(201);
    const { record } = await created.json();
    expect(record).toMatchObject({ goalRevision: 4, playbackPositionMs: 0 });
    expect(record).not.toHaveProperty('ownerId');
    expect((await (await GET(await request('GET', a))).json()).records).toContainEqual(record);
    expect((await (await GET(await request('GET', b))).json()).records).not.toContainEqual(record);
    const changed = await PATCH(await request('PATCH', a, { id: record.id, playbackPositionMs: 9_000 }));
    expect(changed.status).toBe(200);
    expect((await changed.json()).record.playbackPositionMs).toBe(9_000);
    expect((await DELETE(await request('DELETE', a, { id: record.id, action: 'revoke' }))).status).toBe(204);
    expect((await GET(await request('GET', a, null, `?id=${record.id}`))).status).toBe(404);
  } finally {
    if (previous === undefined) delete process.env.AUTH_SESSION_SECRET;
    else process.env.AUTH_SESSION_SECRET = previous;
  }
});

test('T46 / F14.4: malformed input is refused and storage failure is a visible non-success response', async () => {
  const { createPrivateSceneStore } = await import('../../lib/private-scene-store.ts');
  const { handlePrivateDemo } = await import('../../app/api/private-demo/route.ts');
  const cookie = await signed('account-a');
  const store = createPrivateSceneStore({ sessionSecret: secret });
  expect((await handlePrivateDemo(await request('POST', cookie, { goalRevision: 0, playbackPositionMs: -1 }), { store, now: clock + 1 })).status).toBe(400);
  const failingStore = { ...store, create: async () => { throw new Error('disk unavailable'); } };
  const response = await handlePrivateDemo(await request('POST', cookie, { goalRevision: 1, playbackPositionMs: 0 }), { store: failingStore, now: clock + 1 });
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('disk unavailable');
});

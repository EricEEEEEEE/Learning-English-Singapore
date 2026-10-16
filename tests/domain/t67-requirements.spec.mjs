import { test, expect } from '@playwright/test';
import { mkdtemp, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, fork } from 'node:child_process';
import { sealGoogleSession, openGoogleSession, GOOGLE_SESSION_COOKIE } from '../../lib/google-auth.ts';

const secret = 't67-synthetic-local-session-secret-at-least-32';
const now = Date.UTC(2030, 0, 2, 8);
const content = () => ({ description: '  我想在孩子同学的生日聚会上和另一位家长聊天。\n希望慢一点。  ', language: 'zh-Hans', keywords: {
  location: '同学家', learnerRole: '参加聚会的家长', partnerRole: '另一位家长', topic: '孩子的兴趣', goal: '认识对方', special: '第一次见面，英语很少',
} });

async function setup() {
  const { createSceneRequirementStore } = await import('../../lib/scene-requirements.ts');
  const root = await mkdtemp(join(tmpdir(), 'les-t67-'));
  const options = { directory: join(root, 'requirements'), sessionSecret: secret };
  const identity = providerSubject => ({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject, email: 'synthetic@example.invalid' });
  const cookie = await sealGoogleSession(identity('account-a'), secret, now);
  const other = await sealGoogleSession(identity('account-b'), secret, now);
  const session = { cookie, now: now + 1 };
  return { options, cookie, other, session, store: createSceneRequirementStore(options), reopen: () => createSceneRequirementStore(options) };
}

test('T67 store: description, six keywords, role and language persist as one snapshot', async () => {
  const { store, reopen, session } = await setup();
  const saved = await store.save({ ...session, expectedRevision: 0, content: content() });
  expect(saved).toEqual({ revision: 1, content: content() });
  expect(await reopen().get(session)).toEqual(saved);
  expect(await reopen().get({ ...session, revision: 1 })).toEqual(saved);
});

test('T67 store: blank keywords are optional and normalize to the six fields', async () => {
  const { store, session } = await setup();
  const partial = { description: '我想问社区巴士的时间。', language: 'ko', keywords: { location: '巴士站' } };
  expect(await store.save({ ...session, expectedRevision: 0, content: partial })).toEqual({ revision: 1, content: { ...partial, keywords: {
    location: '巴士站', learnerRole: '', partnerRole: '', topic: '', goal: '', special: '',
  } } });
});

test('T67 store: changes make a new immutable version, including language and either role', async () => {
  const { store, reopen, session } = await setup();
  const first = await store.save({ ...session, expectedRevision: 0, content: content() });
  const changed = { ...content(), language: 'ja', keywords: { ...content().keywords, learnerRole: '志愿者', partnerRole: '活动组织者' } };
  const second = await store.save({ ...session, expectedRevision: 1, content: changed });
  expect(second).toEqual({ revision: 2, content: changed });
  expect(await reopen().get({ ...session, revision: 1 })).toEqual(first);
  expect(await reopen().get(session)).toEqual(second);
  expect(await reopen().get({ ...session, revision: 3 })).toBeNull();
});

for (const field of ['language', 'learnerRole', 'partnerRole']) test(`T67 store: changing only ${field} creates a new immutable version`, async () => {
  const { store, session } = await setup();
  const first = await store.save({ ...session, expectedRevision: 0, content: content() });
  const next = field === 'language' ? { ...content(), language: 'hi' } : { ...content(), keywords: { ...content().keywords, [field]: '另一种角色' } };
  expect(await store.save({ ...session, expectedRevision: 1, content: next })).toEqual({ revision: 2, content: next });
  expect(await store.get({ ...session, revision: 1 })).toEqual(first);
});

test('T67 store: repeated and concurrent identical saves share one durable version', async () => {
  const { store, reopen, session } = await setup();
  const rows = await Promise.all(Array.from({ length: 8 }, (_, index) => (index % 2 ? store : reopen()).save({ ...session, expectedRevision: 0, content: content() })));
  expect(rows.every(row => row.revision === 1)).toBe(true);
  expect(await reopen().get({ ...session, revision: 2 })).toBeNull();
  expect(await store.save({ ...session, expectedRevision: 1, content: content() })).toEqual(rows[0]);
});

test('T67 store: competing changes cannot overwrite each other with the same expected version', async () => {
  const { store, reopen, session } = await setup();
  await store.save({ ...session, expectedRevision: 0, content: content() });
  const alternatives = ['学校一对一家长会', '社区运动会'].map(description => ({ ...content(), description }));
  const results = await Promise.allSettled(alternatives.map(next => reopen().save({ ...session, expectedRevision: 1, content: next })));
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  const failure = results.find(result => result.status === 'rejected');
  expect(failure.reason.message).toMatch(/conflict/i);
  const winner = results.find(result => result.status === 'fulfilled').value;
  expect(await store.get(session)).toEqual(winner);
  expect(await store.get({ ...session, revision: 3 })).toBeNull();
});

test('T67 store: stale different data is rejected and same-content retry does not create another version', async () => {
  const { store, session } = await setup();
  await store.save({ ...session, expectedRevision: 0, content: content() });
  const secondContent = { ...content(), description: '和老师聊孩子是否适应学校。' };
  const second = await store.save({ ...session, expectedRevision: 1, content: secondContent });
  await expect(store.save({ ...session, expectedRevision: 1, content: content() })).rejects.toThrow(/conflict/i);
  expect(await store.save({ ...session, expectedRevision: 1, content: secondContent })).toEqual(second);
  await expect(store.save({ ...session, expectedRevision: 99, content: secondContent })).rejects.toThrow();
  expect(await store.get(session)).toEqual(second);
});

test('T67 store: verified cookie owns the record; another account and expired or forged sessions cannot read it', async () => {
  const { store, session, cookie, other } = await setup();
  const first = await store.save({ ...session, ownerId: 'foreign-client-owner', expectedRevision: 0, content: content() });
  expect(await store.get({ cookie: other, now: now + 1 })).toBeNull();
  expect(await store.get({ cookie: other, now: now + 1, revision: 1 })).toBeNull();
  const ownB = await store.save({ cookie: other, now: now + 1, expectedRevision: 0, content: { ...content(), description: '账号B的虚构需求' } });
  expect(await store.get(session)).toEqual(first);
  expect(ownB.content.description).not.toBe(first.content.description);
  const { expiresAt } = await openGoogleSession(cookie, secret, now + 1);
  for (const denied of [{ cookie: null, now }, { cookie: 'forged', now }, { cookie, now: expiresAt }]) {
    await expect(store.get(denied)).rejects.toThrow(/Authenticated session required/);
    await expect(store.save({ ...denied, expectedRevision: 0, content: content() })).rejects.toThrow(/Authenticated session required/);
  }
});

test('T67 store: unauthorized access cannot initialize a private storage directory', async () => {
  const { store, options } = await setup();
  await expect(store.get({ cookie: null, now })).rejects.toThrow();
  await expect(store.save({ cookie: 'forged', now, expectedRevision: 0, content: content() })).rejects.toThrow();
  await expect(access(options.directory)).rejects.toThrow();
});

const invalidContents = [
  ['blank description', { ...content(), description: ' \n\t　' }],
  ['oversize description', { ...content(), description: '场'.repeat(2001) }],
  ['non-string description', { ...content(), description: 123 }],
  ['content array', []],
  ['invalid language', { ...content(), language: 'en' }],
  ['oversize keyword', { ...content(), keywords: { ...content().keywords, topic: '词'.repeat(201) } }],
  ['non-string keyword', { ...content(), keywords: { ...content().keywords, goal: 123 } }],
  ['keyword array', { ...content(), keywords: [] }],
  ['foreign keyword field', { ...content(), keywords: { ...content().keywords, ownerId: 'foreign' } }],
  ['foreign content field', { ...content(), ownerId: 'foreign' }],
];
for (const [name, invalid] of invalidContents) test(`T67 store: ${name} is rejected without changing the current snapshot`, async () => {
  const { store, reopen, session } = await setup();
  const first = await store.save({ ...session, expectedRevision: 0, content: content() });
  await expect(store.save({ ...session, expectedRevision: 1, content: invalid })).rejects.toThrow();
  expect(await reopen().get(session)).toEqual(first);
  expect(await reopen().get({ ...session, revision: 2 })).toBeNull();
});

test('T67 store: revision must be a nonnegative safe integer and invalid revisions leave data unchanged', async () => {
  const { store, session } = await setup();
  const first = await store.save({ ...session, expectedRevision: 0, content: content() });
  for (const expectedRevision of [-1, 0.5, '1', Number.MAX_SAFE_INTEGER + 1, NaN]) {
    await expect(store.save({ ...session, expectedRevision, content: content() })).rejects.toThrow();
    expect(await store.get(session)).toEqual(first);
  }
});

test('T67 store: an independent process reads the same persisted snapshot', async () => {
  const { store, session, options } = await setup();
  const saved = await store.save({ ...session, expectedRevision: 0, content: content() });
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../fixtures/t67-requirement-child.cjs', import.meta.url))], {
    input: JSON.stringify({ options, session }), encoding: 'utf8', timeout: 10000,
  });
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual(saved);
});

test('T67 store: two independent processes competing for one revision have exactly one winner', async () => {
  const { store, session, options } = await setup();
  await store.save({ ...session, expectedRevision: 0, content: content() });
  const fixture = fileURLToPath(new URL('../fixtures/t67-requirement-child.cjs', import.meta.url));
  const children = [];
  try {
    for (const description of ['子进程A的修改', '子进程B的修改']) {
      const child = fork(fixture, [], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
      let output = '', error = '';
      child.stdout.on('data', value => { output += value; }); child.stderr.on('data', value => { error += value; });
      const ready = new Promise((resolve, reject) => {
        child.once('message', message => message?.ready === true ? resolve() : reject(new Error('Child did not report ready')));
        child.once('error', reject);
        child.once('exit', code => reject(new Error(`Child exited before ready (${code}): ${error}`)));
      });
      const finished = new Promise(resolve => child.once('close', code => resolve({ code, output, error })));
      child.stdin.end(JSON.stringify({ action: 'save', options, session, expectedRevision: 1, content: { ...content(), description } }));
      children.push({ process: child, ready, finished });
    }
    await Promise.all(children.map(child => child.ready));
    for (const child of children) child.process.send('go');
    const results = (await Promise.all(children.map(child => child.finished))).map(result => {
      expect(result.code, result.error).toBe(0);
      return JSON.parse(result.output);
    });
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(results.find(result => !result.ok).error).toMatch(/conflict/i);
    expect(await store.get(session)).toEqual(results.find(result => result.ok).value);
    expect(await store.get({ ...session, revision: 3 })).toBeNull();
  } finally { for (const child of children) { if (child.process.exitCode === null) child.process.kill(); } }
});

test('T67 store: local read and save never invoke a network model transport', async () => {
  const { store, session } = await setup();
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('T67 must stay local'); };
  try { await store.save({ ...session, expectedRevision: 0, content: content() }); await store.get(session); }
  finally { globalThis.fetch = original; }
  expect(calls).toBe(0);
});

async function httpFixture() {
  const data = await setup();
  const { handleSceneRequirements } = await import('../../app/api/scene-requirements/route.ts');
  const call = (method, cookie = data.cookie, body, origin = 'http://localhost', query = '') => handleSceneRequirements(new Request(`http://localhost/api/scene-requirements${query}`, {
    method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie: `${GOOGLE_SESSION_COOKIE}=${cookie}` } : {}), ...(origin ? { origin } : {}) },
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  }), { store: data.store, now: now + 1 });
  return { ...data, call, handleSceneRequirements };
}

test('T67 HTTP: actual handler saves and reads private snapshots without returning identity fields', async () => {
  const { call } = await httpFixture();
  expect(await (await call('GET')).json()).toEqual({ requirement: null });
  const response = await call('PUT', undefined, { expectedRevision: 0, content: content() });
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toContain('no-store');
  const saved = await response.json(); expect(saved).toEqual({ requirement: { revision: 1, content: content() } });
  for (const query of ['', '?revision=1']) {
    const loaded = await call('GET', undefined, undefined, undefined, query);
    expect(loaded.headers.get('cache-control')).toContain('no-store'); expect(await loaded.json()).toEqual(saved);
  }
  expect((await call('GET', undefined, undefined, undefined, '?revision=2')).status).toBe(404);
  for (const field of ['ownerId', 'cookie', 'providerSubject', 'email', 'directory']) expect(JSON.stringify(saved)).not.toContain(`"${field}"`);
});

test('T67 HTTP: anonymous and forged reads or writes are 401 and private no-store', async () => {
  const { call } = await httpFixture();
  for (const token of [null, 'forged']) for (const method of ['GET', 'PUT']) {
    const response = await call(method, token, method === 'PUT' ? { expectedRevision: 0, content: content() } : undefined);
    expect(response.status).toBe(401); expect(response.headers.get('cache-control')).toContain('no-store');
  }
});

test('T67 HTTP: client owner claims cannot assign or retrieve another account snapshot', async () => {
  const { call, other } = await httpFixture();
  expect((await call('PUT', undefined, { expectedRevision: 0, content: content(), ownerId: 'foreign' })).status).toBe(400);
  expect(await (await call('GET')).json()).toEqual({ requirement: null });
  expect((await call('PUT', undefined, { expectedRevision: 0, content: content() })).status).toBe(200);
  expect(await (await call('GET', other, undefined, undefined, '?ownerId=foreign')).json()).toEqual({ requirement: null });
});

test('T67 HTTP: missing and foreign Origin reject writes before any record is created', async () => {
  const { call } = await httpFixture();
  for (const origin of [null, 'https://foreign.example.invalid']) expect((await call('PUT', undefined, { expectedRevision: 0, content: content() }, origin)).status).toBe(403);
  expect(await (await call('GET')).json()).toEqual({ requirement: null });
});

test('T67 HTTP: invalid JSON, revision and method reject without publishing a requirement', async () => {
  const { call } = await httpFixture();
  for (const body of ['{', [], { expectedRevision: -1, content: content() }, { expectedRevision: 0, content: { ...content(), keywords: null } }]) expect((await call('PUT', undefined, body)).status).toBe(400);
  expect((await call('GET', undefined, undefined, undefined, '?revision=0')).status).toBe(400);
  expect((await call('DELETE')).status).toBe(405);
  expect(await (await call('GET')).json()).toEqual({ requirement: null });
});

test('T67 HTTP: streamed body overrun is cancelled and never publishes data', async () => {
  const { handleSceneRequirements, store, cookie, call } = await httpFixture();
  let cancelled = false;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(6001)); controller.enqueue(new Uint8Array(6001)); }, cancel() { cancelled = true; } });
  const response = await handleSceneRequirements(new Request('http://localhost/api/scene-requirements', {
    method: 'PUT', duplex: 'half', headers: { origin: 'http://localhost', cookie: `${GOOGLE_SESSION_COOKIE}=${cookie}` }, body,
  }), { store, now: now + 1 });
  expect(response.status).toBe(413); expect(cancelled).toBe(true);
  expect(await (await call('GET')).json()).toEqual({ requirement: null });
});

test('T67 HTTP: stale writes report conflict and preserve the latest full snapshot', async () => {
  const { call } = await httpFixture();
  await call('PUT', undefined, { expectedRevision: 0, content: content() });
  const changed = { ...content(), keywords: { ...content().keywords, goal: '问清下一步' } };
  await call('PUT', undefined, { expectedRevision: 1, content: changed });
  const conflict = await call('PUT', undefined, { expectedRevision: 1, content: content() });
  expect(conflict.status).toBe(409);
  expect(await (await call('GET')).json()).toEqual({ requirement: { revision: 2, content: changed } });
});

test('T67 HTTP: unexpected local storage failure is a private generic 503', async () => {
  const { handleSceneRequirements, cookie } = await httpFixture();
  const response = await handleSceneRequirements(new Request('http://localhost/api/scene-requirements', { headers: { cookie: `${GOOGLE_SESSION_COOKIE}=${cookie}` } }), {
    store: { get: async () => { throw new Error('private synthetic filesystem location'); } }, now,
  });
  expect(response.status).toBe(503); expect(response.headers.get('cache-control')).toContain('no-store');
  expect(await response.json()).toEqual({ error: 'temporarily_unavailable' });
});

test('T67 configured route: local saves survive separate default handler calls; serverless setup is rejected', async () => {
  const route = await import('../../app/api/scene-requirements/route.ts');
  const root = await mkdtemp(join(tmpdir(), 'les-t67-configured-'));
  const previous = { cwd: process.cwd(), secret: process.env.AUTH_SESSION_SECRET, vercel: process.env.VERCEL };
  const freshNow = Date.now();
  const freshCookie = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'configured-synthetic', email: 'synthetic@example.invalid' }, secret, freshNow);
  const request = (method, body) => new Request('http://localhost/api/scene-requirements', { method, headers: { origin: 'http://localhost', cookie: `${GOOGLE_SESSION_COOKIE}=${freshCookie}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    process.chdir(root); process.env.AUTH_SESSION_SECRET = secret; delete process.env.VERCEL;
    expect((await route.PUT(request('PUT', { expectedRevision: 0, content: content() }))).status).toBe(200);
    expect(await (await route.GET(request('GET'))).json()).toEqual({ requirement: { revision: 1, content: content() } });
    process.env.VERCEL = '1'; expect((await route.GET(request('GET'))).status).toBe(503);
    delete process.env.VERCEL; delete process.env.AUTH_SESSION_SECRET; expect((await route.GET(request('GET'))).status).toBe(503);
  } finally {
    process.chdir(previous.cwd);
    if (previous.secret === undefined) delete process.env.AUTH_SESSION_SECRET; else process.env.AUTH_SESSION_SECRET = previous.secret;
    if (previous.vercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = previous.vercel;
  }
});

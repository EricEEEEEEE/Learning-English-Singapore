import { test, expect } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const now = Date.UTC(2026, 8, 26);
const secret = 'offline-t61b-session-secret-at-least-32-characters';
const translations = Object.fromEntries(['zh-Hans', 'id', 'ja', 'ko', 'hi'].map(k => [k, 'synthetic']));
const script = () => ({ lines: [{ id: 'a', role: 'partner', text: 'Hello there', translations }, { id: 'b', role: 'learner', text: 'Hello', translations }], phrases: [{ id: 'p', text: 'Hello', lineId: 'a', translations }], turns: [{ partnerLineId: 'a', learnerLineId: 'b' }] });
async function setup(scriptProvider, simulation = true) {
  const { createGenerationTaskStore } = await import('../../lib/generation-tasks.ts');
  const { sealGoogleSession } = await import('../../lib/google-auth.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-t61b-'));
  const options = { directory, sessionSecret: secret, simulation, scriptProvider };
  const store = createGenerationTaskStore(options);
  const cookie = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'owner-a', email: 'a@example.invalid' }, secret, now);
  const other = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'owner-b', email: 'b@example.invalid' }, secret, now);
  const task = await store.create({ cookie, now, goal: 'Parents at a birthday party', revision: 1, requestKey: 'a' });
  return { store, reopen: () => createGenerationTaskStore(options), input: { cookie, now: now + 1, id: task.id }, other };
}

test('T61B task: disabled runner ignores browser approval claims', async () => {
  const { store, input } = await setup();
  await expect(store.runScript({ ...input, approved: true, reservedMicros: 1 })).rejects.toThrow();
  expect(await store.get(input)).toMatchObject({ status: 'awaiting_budget', providerCalls: 0, reservedMicros: 0 });
});

test('T61B task: live mode stays disabled even with injected provider and claimed approval', async () => {
  let calls = 0;
  const { store, input } = await setup({ reservedMicros: 9000, generate: async () => { calls++; return { requestId: 'r', script: script() }; } }, false);
  await expect(store.runScript({ ...input, approved: true })).rejects.toThrow();
  expect(calls).toBe(0);
  expect(await store.get(input)).toMatchObject({ status: 'awaiting_budget', reservedMicros: 0, providerCalls: 0, simulation: false });
});

test('T61B task: adapter receives stored goal and validated draft survives restart without replay', async () => {
  const { generateSceneScript } = await import('../../lib/generated-script.ts'); let calls = 0;
  const provider = { reservedMicros: 9000, generate: async input => generateSceneScript(input, { enabled: true, apiKey: 'synthetic-only', fetch: async (_url, opts) => {
    calls++; expect(JSON.parse(opts.body).input.find(x => x.role === 'user').content).toBe('Parents at a birthday party');
    return Response.json({ id: 'resp_offline', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(script()) }] }] });
  } }) };
  const { store, reopen, input, other } = await setup(provider);
  await expect(store.runScript({ ...input, cookie: other })).rejects.toThrow();
  expect(calls).toBe(0);
  await store.runScript({ ...input, goal: 'untrusted override' });
  expect(await reopen().get(input)).toMatchObject({ status: 'script_ready', script: script(), providerJobId: 'resp_offline', reservedMicros: 9000, providerCalls: 1, simulation: true });
  expect(await reopen().get({ ...input, cookie: other })).toBeNull();
  await expect(reopen().runScript(input)).rejects.toThrow();
  expect(calls).toBe(1);
});

test('T61B task: reserve before transport and reject concurrent runner', async () => {
  let release, entered; const wait = new Promise(r => { release = r; }); const started = new Promise(r => { entered = r; }); let calls = 0;
  const { store, reopen, input } = await setup({ reservedMicros: 9000, generate: async () => { calls++; entered(); await wait; return { requestId: 'r', script: script() }; } });
  const running = store.runScript(input);
  try {
    await Promise.race([started, running.then(() => { throw new Error('Runner finished without entering provider'); })]);
    expect(await reopen().get(input)).toMatchObject({ status: 'submitting', reservedMicros: 9000, providerCalls: 1 });
    await expect(reopen().runScript(input)).rejects.toThrow();
    expect(calls).toBe(1);
  } finally { release(); await running; }
});

for (const kind of ['timeout', 'invalid-draft']) test(`T61B task: ${kind} retains reservation and blocks retry after reopening`, async () => {
  let calls = 0;
  const { store, reopen, input } = await setup({ reservedMicros: 9000, generate: async () => { calls++; if (kind === 'timeout') throw new Error('synthetic'); return { requestId: 'r', script: { ...script(), phrases: [] } }; } });
  try { await store.runScript(input); } catch { /* Caller may receive an error; persisted state is authoritative. */ }
  expect(await reopen().get(input)).toMatchObject({ status: 'submission_unknown', reservedMicros: 9000, providerCalls: 1 });
  expect((await reopen().get(input)).script).toBeUndefined();
  await expect(reopen().runScript(input)).rejects.toThrow();
  expect(calls).toBe(1);
});

test('T61B script regression: array role and reversed opening rejected with valid control', async () => {
  const { validateGeneratedScript } = await import('../../lib/generated-script.ts');
  expect(validateGeneratedScript(script()).ok).toBe(true);
  const array = script(); array.lines.push({ ...array.lines[0], id: 'c', role: ['partner'] });
  expect(validateGeneratedScript(array).ok).toBe(false);
  const reverse = script(); reverse.lines.reverse();
  expect(validateGeneratedScript(reverse).ok).toBe(false);
});

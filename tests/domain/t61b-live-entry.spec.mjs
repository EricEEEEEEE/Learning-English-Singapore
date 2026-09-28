import { test, expect } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Server-side configuration only. All providers below are offline test doubles.
async function setup() {
  const { createGenerationTaskStore } = await import('../../lib/generation-tasks.ts');
  const { sealGoogleSession } = await import('../../lib/google-auth.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-live-entry-'));
  const sessionSecret = 'synthetic-live-entry-session-secret';
  const now = Date.UTC(2026, 8, 28);
  const cookie = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'synthetic', email: 'synthetic@example.invalid' }, sessionSecret, now);
  let calls = 0;
  const budget = { scope: 'synthetic-shared-budget', priorSpentMicros: 900 };
  const open = (overrides = {}) => createGenerationTaskStore({ directory, sessionSecret, simulation: false, maxReservedMicros: 1000, liveBudget: budget,
    scriptProvider: { reservedMicros: 100, generate: async () => { calls++; throw new Error('synthetic uncertain submission'); } }, ...overrides });
  const create = async (store, goal) => ({ cookie, now, id: (await store.create({ cookie, now, goal, revision: 1, requestKey: goal })).id });
  return { open, create, budget, count: () => calls };
}

test('T61B live entry: historical spend and unknown request exhaust shared cap after restart', async () => {
  const c = await setup();
  const first = await c.create(c.open(), 'Hotel greeting');
  await c.open().runScript(first);
  expect(c.count()).toBe(1);
  expect(await c.open().get(first)).toMatchObject({ simulation: false, status: 'submission_unknown', reservedMicros: 100 });
  const second = await c.create(c.open(), 'Party greeting');
  await expect(c.open().runScript(second)).rejects.toThrow();
  expect(c.count()).toBe(1);
  expect((await c.open().get(second)).reservedMicros).toBe(0);
});

test('T61B live entry: persisted budget cannot be replaced with lower historical spend or another scope', async () => {
  const c = await setup();
  const first = await c.create(c.open(), 'Hotel greeting');
  await c.open().runScript(first);
  const second = await c.create(c.open(), 'Party greeting');
  for (const liveBudget of [{ ...c.budget, priorSpentMicros: 0 }, { ...c.budget, scope: 'another-budget' }]) {
    await expect((async () => c.open({ liveBudget }).runScript(second))()).rejects.toThrow();
  }
  expect(c.count()).toBe(1);
});

test('T61B live entry: simulation cannot execute a real task or bypass its spent balance', async () => {
  const c = await setup();
  const input = await c.create(c.open(), 'Hotel greeting');
  let simulationCalls = 0;
  await expect(c.open({ simulation: true, liveBudget: undefined }).runSimulation(input, async () => { simulationCalls++; return { jobId: 'synthetic' }; })).rejects.toThrow();
  expect(simulationCalls).toBe(0);
  expect(c.count()).toBe(0);
});

for (const overrides of [{ liveBudget: undefined }, { maxReservedMicros: undefined }, { liveBudget: { scope: '', priorSpentMicros: 0 } }, { liveBudget: { scope: 'synthetic', priorSpentMicros: -1 } }]) {
  test(`T61B live entry: incomplete budget rejected ${Object.keys(overrides).join(",")}:${JSON.stringify(overrides)}`, async () => {
    const c = await setup();
    await expect((async () => {
      const store = c.open(overrides);
      const input = await c.create(store, 'Hotel greeting');
      await store.runScript({ ...input, approved: true, liveBudget: c.budget });
    })()).rejects.toThrow();
    expect(c.count()).toBe(0);
  });
}

// Successful output must remain usable after reopening without another provider call.
test('T61B live entry: successful script persists and repeat request does not reserve or generate again', async () => {
  const c = await setup();
  const translations = Object.fromEntries(['zh-Hans', 'id', 'ja', 'ko', 'hi'].map(key => [key, 'synthetic']));
  const script = { lines: [{ id: 'a', role: 'partner', text: 'Hello there', translations }, { id: 'b', role: 'learner', text: 'Hello', translations }], phrases: [{ id: 'p', text: 'Hello', lineId: 'a', translations }], turns: [{ partnerLineId: 'a', learnerLineId: 'b' }] };
  let calls = 0;
  const options = { scriptProvider: { reservedMicros: 100, generate: async () => { calls++; return { requestId: 'synthetic-success', script }; } } };
  const input = await c.create(c.open(options), 'Hotel greeting');
  await c.open(options).runScript(input);
  expect(await c.open(options).get(input)).toMatchObject({ simulation: false, status: 'script_ready', script, providerJobId: 'synthetic-success', reservedMicros: 100, providerCalls: 1 });
  expect(await c.create(c.open(options), 'Hotel greeting')).toEqual(input);
  await expect(c.open(options).runScript(input)).rejects.toThrow();
  expect(calls).toBe(1);
  expect((await c.open(options).get(input)).reservedMicros).toBe(100);
});

for (const firstSimulation of [true, false]) test(`T61B live entry: same goal cannot silently reuse opposite-mode task ${firstSimulation}`, async () => {
  const c = await setup();
  const input = await c.create(c.open({ simulation: firstSimulation }), 'Hotel greeting');
  const before = await c.open().get(input);
  await expect(c.create(c.open({ simulation: !firstSimulation }), 'Hotel greeting')).rejects.toThrow();
  expect(await c.open().get(input)).toEqual(before);
  expect(c.count()).toBe(0);
});

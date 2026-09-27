import { test, expect } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function setup(limit) {
  const { createGenerationTaskStore } = await import('../../lib/generation-tasks.ts');
  const { sealGoogleSession } = await import('../../lib/google-auth.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-total-reservation-'));
  const sessionSecret = 'synthetic-total-budget-session-secret';
  const now = Date.UTC(2026, 8, 27);
  const cookie = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'synthetic', email: 'synthetic@example.invalid' }, sessionSecret, now);
  let calls = 0;
  const options = { directory, sessionSecret, simulation: true, maxReservedMicros: limit,
    scriptProvider: { reservedMicros: 100, generate: async () => { calls++; throw new Error('synthetic uncertain submission'); } } };
  const open = () => createGenerationTaskStore(options);
  const inputs = [];
  for (const goal of ['Hotel greeting', 'School greeting']) {
    const task = await open().create({ cookie, now, goal, revision: 1, requestKey: goal });
    inputs.push({ cookie, now, id: task.id });
  }
  return { open, inputs, count: () => calls };
}

test('T61B total reservation: concurrent tasks share durable cap and unknown submission consumes it after reopen', async () => {
  const c = await setup(150);
  const results = await Promise.allSettled(c.inputs.map(input => c.open().runScript(input)));
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
  expect(c.count()).toBe(1);
  const saved = await Promise.all(c.inputs.map(input => c.open().get(input)));
  expect(saved.reduce((sum, task) => sum + task.reservedMicros, 0)).toBe(100);
  const waiting = saved.findIndex(task => task.status === 'awaiting_budget');
  expect(waiting).toBeGreaterThanOrEqual(0);
  await expect(c.open().runScript(c.inputs[waiting])).rejects.toThrow();
  expect(c.count()).toBe(1);
});

for (const limit of [0, -1, NaN, 1.5]) test(`T61B total reservation: invalid or zero cap ${limit} never reaches provider`, async () => {
  const c = await setup(limit);
  await expect(c.open().runScript(c.inputs[0])).rejects.toThrow();
  expect(c.count()).toBe(0);
  expect((await c.open().get(c.inputs[0])).reservedMicros).toBe(0);
});

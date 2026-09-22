import { test, expect } from '@playwright/test';

const load = () => import('../../lib/x2-budget.ts');

test('T08/X2: a call with no enforceable maximum exposure never reaches the provider', async () => {
  const { createX2Budget, runX2Attempt } = await load();
  const budget = createX2Budget({ approvedUsd: 25 });
  let calls = 0;
  await expect(runX2Attempt(budget, {
    id: 'X2-01-tts', originalId: 'X2-01-tts', kind: 'tts',
    maximumUsd: null, maximumEvidence: null,
  }, async () => { calls++; return { actualUsd: 0.01 }; })).rejects.toThrow(/maximum|bound|exposure/i);
  expect(calls).toBe(0);
  expect(budget.spentUsd).toBe(0);
  expect(budget.reservedUsd).toBe(0);
});

test('T08/X2: TTS and Realtime draw from one USD 25 pool, including in-flight reservations', async () => {
  const { createX2Budget, runX2Attempt } = await load();
  const budget = createX2Budget({ approvedUsd: 25 });
  let finishFirst;
  const first = runX2Attempt(budget, {
    id: 'X2-01-tts', originalId: 'X2-01-tts', kind: 'tts',
    maximumUsd: 15, maximumEvidence: 'endpoint-enforced-max-001',
  }, () => new Promise(resolve => { finishFirst = resolve; }));
  await expect(runX2Attempt(budget, {
    id: 'X2-01-realtime', originalId: 'X2-01-realtime', kind: 'realtime',
    maximumUsd: 11, maximumEvidence: 'endpoint-enforced-max-002',
  }, async () => ({ actualUsd: 0 }))).rejects.toThrow(/budget|limit|25/i);
  expect(budget.reservedUsd).toBe(15);
  finishFirst({ actualUsd: 14 });
  await first;
  expect(budget.spentUsd).toBe(14);
  expect(budget.reservedUsd).toBe(0);
  await expect(runX2Attempt(budget, {
    id: 'X2-02-realtime', originalId: 'X2-02-realtime', kind: 'realtime',
    maximumUsd: 12, maximumEvidence: 'endpoint-enforced-max-003',
  }, async () => ({ actualUsd: 0 }))).rejects.toThrow(/budget|limit|25/i);
});

test('T08/X2: unknown final charge retains its reservation and blocks further spending', async () => {
  const { createX2Budget, runX2Attempt } = await load();
  const budget = createX2Budget({ approvedUsd: 25 });
  await expect(runX2Attempt(budget, {
    id: 'X2-02-tts', originalId: 'X2-02-tts', kind: 'tts',
    maximumUsd: 20, maximumEvidence: 'endpoint-enforced-max-004',
  }, async () => { throw new Error('connection lost after dispatch'); })).rejects.toThrow(/connection lost/);
  expect(budget.reservedUsd).toBe(20);
  await expect(runX2Attempt(budget, {
    id: 'X2-03-tts', originalId: 'X2-03-tts', kind: 'tts',
    maximumUsd: 6, maximumEvidence: 'endpoint-enforced-max-005',
  }, async () => ({ actualUsd: 0 }))).rejects.toThrow(/budget|limit|25/i);
});

test('T08/X2: a third attempt for one sample is rejected before any provider call', async () => {
  const { createX2Budget, runX2Attempt } = await load();
  const budget = createX2Budget({ approvedUsd: 25 });
  let calls = 0;
  for (const id of ['attempt-1', 'attempt-2']) {
    await runX2Attempt(budget, {
      id, originalId: 'X2-04-tts', kind: 'tts', maximumUsd: 1,
      maximumEvidence: 'endpoint-enforced-max-006',
    }, async () => { calls++; return { actualUsd: 0.5 }; });
  }
  await expect(runX2Attempt(budget, {
    id: 'attempt-3', originalId: 'X2-04-tts', kind: 'tts', maximumUsd: 1,
    maximumEvidence: 'endpoint-enforced-max-006',
  }, async () => { calls++; return { actualUsd: 0.5 }; })).rejects.toThrow(/retry|attempt/i);
  expect(calls).toBe(2);
});

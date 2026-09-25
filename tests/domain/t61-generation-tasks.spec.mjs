import { test, expect } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const secret = 't61-offline-session-secret-with-at-least-32-characters';
const now = Date.UTC(2026, 8, 25, 1);
const load = () => import('../../lib/generation-tasks.ts');
async function setup(simulation = false) {
  const { createGenerationTaskStore } = await load();
  const { sealGoogleSession } = await import('../../lib/google-auth.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-t61-'));
  const options = { directory, sessionSecret: secret, simulation };
  const cookie = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'a', email: 'test@example.invalid' }, secret, now);
  const other = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'b', email: 'test@example.invalid' }, secret, now);
  return { store: createGenerationTaskStore(options), reopen: () => createGenerationTaskStore(options), cookie, other, directory };
}
const input = cookie => ({ cookie, now: now + 1, goal: 'Talk to parents at my child’s party', revision: 1, requestKey: 'request-1' });

test('T61A: signed owner, durable state and repeated/concurrent submits share one task', async () => {
  const { store, reopen, cookie, other } = await setup();
  const jobs = await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? reopen() : store).create(input(cookie))));
  expect(new Set(jobs.map(job => job.id)).size).toBe(1);
  expect(jobs[0]).toMatchObject({ status: 'awaiting_budget', revision: 1, providerCalls: 0, reservedMicros: 0 });
  expect(await reopen().get({ cookie, now: now + 2, id: jobs[0].id })).toEqual(jobs[0]);
  expect(await store.get({ cookie: other, now: now + 2, id: jobs[0].id })).toBeNull();
  await expect(store.create(input(null))).rejects.toThrow();
});

test('T61A: replay key cannot silently change goal, new revision is a separate task', async () => {
  const { store, cookie } = await setup();
  const first = await store.create(input(cookie));
  await expect(store.create({ ...input(cookie), goal: 'A different meeting' })).rejects.toThrow();
  const second = await store.create({ ...input(cookie), requestKey: 'request-2', revision: 2, goal: 'A different meeting' });
  expect(second.id).not.toBe(first.id);
  expect((await store.get({ cookie, now: now + 2, id: first.id })).goal).toBe(input(cookie).goal);
});

test('T61A: production mode never invokes an injected provider, even if payload claims approval', async () => {
  const { store, cookie } = await setup(); const task = await store.create(input(cookie)); let calls = 0;
  await expect(store.runSimulation({ cookie, now: now + 2, id: task.id, reservedMicros: 1000, approved: true }, async () => { calls++; return { jobId: 'fake' }; })).rejects.toThrow();
  expect(calls).toBe(0);
  expect(await store.get({ cookie, now: now + 2, id: task.id })).toMatchObject({ status: 'awaiting_budget', reservedMicros: 0, providerCalls: 0 });
});

test('T61A: uncertain submission survives restart and cannot be retried or release reservation', async () => {
  const { store, reopen, cookie } = await setup(true); const task = await store.create(input(cookie)); let calls = 0;
  await store.runSimulation({ cookie, now: now + 2, id: task.id, reservedMicros: 1000 }, async () => { calls++; throw new Error('timeout after submission'); });
  expect(await reopen().get({ cookie, now: now + 3, id: task.id })).toMatchObject({ status: 'submission_unknown', reservedMicros: 1000, providerCalls: 1, simulation: true });
  await expect(reopen().runSimulation({ cookie, now: now + 3, id: task.id, reservedMicros: 1000 }, async () => { calls++; return { jobId: 'duplicate' }; })).rejects.toThrow();
  expect(calls).toBe(1);
});

test('T61A: reservation is durable before submission and concurrent runner cannot duplicate it', async () => {
  const { store, reopen, cookie, other } = await setup(true); const task = await store.create(input(cookie));
  let finish; const gate = new Promise(resolve => { finish = resolve; });
  let entered; const entry = new Promise(resolve => { entered = resolve; });
  const running = store.runSimulation({ cookie, now: now + 2, id: task.id, reservedMicros: 1000 }, async () => { entered(); await gate; return { jobId: 'test-job' }; });
  await entry;
  const durable = await reopen().get({ cookie, now: now + 3, id: task.id });
  expect(durable.reservedMicros).toBe(1000);
  expect(['submitting', 'submission_unknown']).toContain(durable.status);
  let duplicate = 0;
  try {
    await expect(reopen().runSimulation({ cookie, now: now + 3, id: task.id, reservedMicros: 1000 }, async () => { duplicate++; return { jobId: 'duplicate' }; })).rejects.toThrow();
    await expect(store.runSimulation({ cookie: other, now: now + 3, id: task.id, reservedMicros: 1000 }, async () => { duplicate++; return { jobId: 'foreign' }; })).rejects.toThrow();
  } finally { finish(); }
  await running;
  await expect(reopen().runSimulation({ cookie, now: now + 4, id: task.id, reservedMicros: 1000 }, async () => { duplicate++; return { jobId: 'again' }; })).rejects.toThrow();
  expect(duplicate).toBe(0);
  expect(await reopen().get({ cookie, now: now + 4, id: task.id })).toMatchObject({ status: 'video_pending', providerJobId: 'test-job', simulation: true, providerCalls: 1 });
});

for (const change of [{ goal: '' }, { revision: 0 }, { requestKey: '' }]) test(`T61A: invalid create ${JSON.stringify(change)} is rejected`, async () => {
  const { store, cookie } = await setup(); await expect(store.create({ ...input(cookie), ...change })).rejects.toThrow();
});

test('T61A: new request key for identical owner/goal/revision does not duplicate the task', async () => {
  const { store, cookie } = await setup();const first=await store.create(input(cookie));
  expect((await store.create({ ...input(cookie), requestKey: 'after-refresh' })).id).toBe(first.id);
});

test('T61A: a process dies after reserving; independent recovery keeps unknown and reserved funds', async () => {
  const { spawnSync } = await import('node:child_process');
  const { store, cookie, directory } = await setup(true);const task=await store.create(input(cookie));
  const args={options:{directory,sessionSecret:secret,simulation:true}, input:{cookie,now:now+2,id:task.id,reservedMicros:1000}};
  const child=new URL('../fixtures/t61-child.cjs',import.meta.url);
  const crash=spawnSync(process.execPath,[fileURLToPath(child)],{input:JSON.stringify({...args,crash:true}),encoding:'utf8',timeout:10000});
  expect(crash.status,crash.stderr).toBe(17);
  const restored=spawnSync(process.execPath,[fileURLToPath(child)],{input:JSON.stringify(args),encoding:'utf8',timeout:10000});
  expect(restored.status,restored.stderr).toBe(0);
  expect(JSON.parse(restored.stdout)).toMatchObject({status:'submission_unknown',reservedMicros:1000,providerCalls:1,simulation:true});
  let calls=0;
  await expect(store.runSimulation(args.input,async()=>{calls++;return {jobId:'duplicate'};})).rejects.toThrow();
  expect(calls).toBe(0);
});

test('T61A: real HTTP handler derives identity and does not expose private fields', async () => {
  const { handleGenerationTasks } = await import('../../app/api/generation-tasks/route.ts');
  const { GOOGLE_SESSION_COOKIE } = await import('../../lib/google-auth.ts');
  const { store, cookie, other }=await setup();
  const call=(method,token,body,id='')=>handleGenerationTasks(new Request(`http://localhost/api/generation-tasks${id?'?id='+id:''}`,{method,headers:{'content-type':'application/json',...(token?{cookie:`${GOOGLE_SESSION_COOKIE}=${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})}),{store,now:now+2});
  for(const token of [null,'forged']) for(const method of ['GET','POST']) {
    const r=await call(method,token,method==='POST'?input(cookie):undefined);expect(r.status).toBe(401);expect(r.headers.get('cache-control')).toContain('no-store');
  }
  const created=await call('POST',cookie,{...input(cookie),accountId:'foreign',ownerId:'foreign',approved:true,simulation:true});
  expect(created.status).toBe(201);expect(created.headers.get('cache-control')).toContain('no-store');
  const task=await created.json();expect(task).toMatchObject({status:'awaiting_budget',providerCalls:0});
  for(const key of ['ownerId','cookie','providerSubject']) expect(task).not.toHaveProperty(key);
  expect((await call('GET',other,undefined,task.id)).status).toBe(404);
  const read=await call('GET',cookie,undefined,task.id);expect(read.status).toBe(200);expect((await read.json()).id).toBe(task.id);
});

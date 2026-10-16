import { test, expect } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSceneRequirementStore } from '../../lib/scene-requirements.ts';
import { createGenerationTaskStore } from '../../lib/generation-tasks.ts';
import { GOOGLE_SESSION_COOKIE, sealGoogleSession } from '../../lib/google-auth.ts';

// T71D / K4.1, K7: submitting a scene starts the server runner on its own, status reads resume a stopped run,
// and real execution only exists when the server is fully configured within the approved USD30 batch.
const secret = 't71d-synthetic-local-session-secret-at-least-32';
const now = Date.UTC(2031, 0, 3, 8);
const content = { description: '我想在学校和老师聊聊孩子。', language: 'zh-Hans', keywords: { location: '教室', learnerRole: '家长', partnerRole: '班主任', topic: '适应', goal: '听懂建议', special: '' } };

async function fixture({ withRunner = true, advance } = {}) {
  const { createSceneGenerationService } = await import('../../lib/scene-generation.ts');
  const { handleSceneGeneration } = await import('../../app/api/scene-generation/route.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-t71d-'));
  const requirements = createSceneRequirementStore({ directory: join(directory, 'requirements'), sessionSecret: secret });
  const tasks = createGenerationTaskStore({ directory: join(directory, 'tasks'), sessionSecret: secret });
  const identity = s => ({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: s, email: 'synthetic@example.invalid' });
  const cookie = await sealGoogleSession(identity('account-a'), secret, now);
  await requirements.save({ cookie, now: now + 1, expectedRevision: 0, content });
  const service = createSceneGenerationService({ requirements, tasks });
  const calls = [], active = new Set();
  const runner = { advance: input => { calls.push(input); active.add(input.id); return advance ? advance(input) : new Promise(() => {}); }, isRunning: id => active.has(id) };
  const call = (method, c = cookie, body) => handleSceneGeneration(new Request('http://localhost/api/scene-generation' + (method === 'GET' ? '?revision=1' : ''), {
    method, headers: { 'content-type': 'application/json', origin: 'http://localhost', ...(c ? { cookie: `${GOOGLE_SESSION_COOKIE}=${c}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), { service, now: now + 2, ...(withRunner ? { runner } : {}) });
  return { call, calls, active, cookie, tasks };
}

test('T71D: submitting starts the runner for the stored task without waiting for generation to finish', async () => {
  const { call, calls, cookie } = await fixture();
  const response = await call('POST', undefined, { requirementRevision: 1 });
  expect(response.status).toBe(201);
  const body = await response.json();
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ cookie, id: body.task.id });
  expect(body.phase).toBe('awaiting_budget');
});

test('T71D: a repeated submit while the run is active does not start a second run', async () => {
  const { call, calls } = await fixture();
  await call('POST', undefined, { requirementRevision: 1 });
  await call('POST', undefined, { requirementRevision: 1 });
  expect(calls).toHaveLength(1);
});

test('T71D: reading status resumes a stopped active task, and does nothing before submission', async () => {
  const { call, calls, active } = await fixture();
  await call('GET');
  expect(calls).toHaveLength(0);
  const created = await (await call('POST', undefined, { requirementRevision: 1 })).json();
  active.clear(); // the server restarted; nothing is running for this task any more
  await call('GET');
  expect(calls).toHaveLength(2);
  expect(calls[1].id).toBe(created.task.id);
});

test('T71D: without a configured runner submission behaves exactly as before and starts nothing', async () => {
  const { call } = await fixture({ withRunner: false });
  const response = await call('POST', undefined, { requirementRevision: 1 });
  expect(response.status).toBe(201);
  expect((await response.json()).phase).toBe('awaiting_budget');
});

test('T71D: a runner failure never breaks the status response', async () => {
  const { call } = await fixture({ advance: async () => { throw new Error('provider exploded'); } });
  const response = await call('POST', undefined, { requirementRevision: 1 });
  expect(response.status).toBe(201);
  await new Promise(resolve => setTimeout(resolve, 10));
  expect((await call('GET')).status).toBe(200);
});

test('T71D: an anonymous request starts nothing', async () => {
  const { call, calls } = await fixture();
  expect((await call('POST', null, { requirementRevision: 1 })).status).toBe(401);
  expect((await call('GET', null)).status).toBe(401);
  expect(calls).toHaveLength(0);
});

const fullEnv = () => ({
  LES_LIVE_GENERATION: '1', OPENAI_API_KEY: 'synthetic-openai', LTX_API_KEY: 'synthetic-ltx', AUTH_SESSION_SECRET: secret,
  LES_LIVE_BUDGET_SCOPE: 'C3-T71', LES_LIVE_MAX_MICROS: '20000000', LES_LIVE_PRIOR_SPENT_MICROS: '0',
  LES_FFMPEG: '/usr/bin/ffmpeg', LES_FFPROBE: '/usr/bin/ffprobe', LES_MEDIA_HOSTS: 'storage.googleapis.com',
});

test('T71D: a fully configured server builds a live runner without any network call', async () => {
  const { createLiveSceneRunner } = await import('../../lib/live-scene-runner.ts');
  let fetches = 0;
  const directory = await mkdtemp(join(tmpdir(), 'les-t71d-live-'));
  const runner = createLiveSceneRunner(fullEnv(), directory, { fetch: async () => { fetches++; return new Response('{}'); } });
  expect(runner).not.toBeNull();
  expect(typeof runner.advance).toBe('function');
  expect(typeof runner.isRunning).toBe('function');
  expect(fetches).toBe(0);
});

for (const [name, change] of [
  ['the switch is off', env => { delete env.LES_LIVE_GENERATION; }],
  ['the switch has any other value', env => { env.LES_LIVE_GENERATION = 'true'; }],
  ['the OpenAI key is missing', env => { delete env.OPENAI_API_KEY; }],
  ['the LTX key is missing', env => { delete env.LTX_API_KEY; }],
  ['no budget scope is set', env => { delete env.LES_LIVE_BUDGET_SCOPE; }],
  ['the ceiling is not a whole number', env => { env.LES_LIVE_MAX_MICROS = '20.5'; }],
  ['the ceiling exceeds the approved USD30 batch', env => { env.LES_LIVE_MAX_MICROS = '30000001'; }],
  ['prior spending is negative', env => { env.LES_LIVE_PRIOR_SPENT_MICROS = '-1'; }],
  ['no media download host is allowed', env => { env.LES_MEDIA_HOSTS = ''; }],
  ['the media tool path is relative', env => { env.LES_FFMPEG = 'ffmpeg'; }],
]) test(`T71D: no live runner exists when ${name}`, async () => {
  const { createLiveSceneRunner } = await import('../../lib/live-scene-runner.ts');
  const env = fullEnv(); change(env);
  const directory = await mkdtemp(join(tmpdir(), 'les-t71d-off-'));
  expect(createLiveSceneRunner(env, directory)).toBeNull();
});

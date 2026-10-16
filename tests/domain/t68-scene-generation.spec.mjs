import { test, expect } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSceneRequirementStore } from '../../lib/scene-requirements.ts';
import { createGenerationTaskStore } from '../../lib/generation-tasks.ts';
import { GOOGLE_SESSION_COOKIE, sealGoogleSession } from '../../lib/google-auth.ts';
import { courseFixture } from '../fixtures/t60-course.mjs';

const secret = 't68-synthetic-local-session-secret-at-least-32';
const now = Date.UTC(2031, 0, 3, 8);
const content = () => ({ description: '  我想在学校和老师聊聊孩子是否适应新班级。\n希望慢一点。  ', language: 'zh-Hans', keywords: {
  location: '学校教室', learnerRole: '家长', partnerRole: '班主任', topic: '适应学校', goal: '听懂建议', special: '一对一面谈',
} });

async function setup() {
  const { createSceneGenerationService } = await import('../../lib/scene-generation.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-t68-'));
  const requirementOptions = { directory: join(directory, 'requirements'), sessionSecret: secret };
  const taskOptions = { directory: join(directory, 'tasks'), sessionSecret: secret };
  const requirements = createSceneRequirementStore(requirementOptions), tasks = createGenerationTaskStore(taskOptions);
  const identity = providerSubject => ({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject, email: 'synthetic@example.invalid' });
  const cookie = await sealGoogleSession(identity('account-a'), secret, now), other = await sealGoogleSession(identity('account-b'), secret, now);
  const session = { cookie, now: now + 1 }, otherSession = { cookie: other, now: now + 1 };
  const requirement = await requirements.save({ ...session, expectedRevision: 0, content: content() });
  const service = createSceneGenerationService({ requirements, tasks });
  return { directory, requirementOptions, taskOptions, requirements, tasks, service, cookie, other, session, otherSession, requirement, createSceneGenerationService,
    input: { ...session, requirementRevision: 1 },
    reopen: () => createSceneGenerationService({ requirements: createSceneRequirementStore(requirementOptions), tasks: createGenerationTaskStore(taskOptions) }),
  };
}

test('T68: reading a saved requirement does not create or execute a generation task', async () => {
  const { service, tasks, input, session, requirement } = await setup();
  expect(await service.get(input)).toEqual({ requirement, task: null, phase: 'not_submitted', course: null });
  expect(await tasks.list(session)).toEqual([]);
});

test('T68: explicit submit binds the exact description, six keywords, language and revision to one durable task', async () => {
  const { service, tasks, input, session, requirement, reopen } = await setup();
  const result = await service.submit(input);
  expect(result).toMatchObject({ requirement, phase: 'awaiting_budget', course: null, task: { revision: 1, requirementRevision: 1, status: 'awaiting_budget', simulation: false, providerCalls: 0 } });
  expect(await tasks.get({ ...session, id: result.task.id })).toMatchObject({ requirement, goal: content().description.trim(), revision: 1, status: 'awaiting_budget', reservedMicros: 0, providerCalls: 0 });
  expect(await reopen().get(input)).toEqual(result);
  for (const key of ['ownerId', 'cookie', 'providerSubject', 'email', 'directory', 'reservedMicros', 'providerJobId']) expect(JSON.stringify(result)).not.toContain(`"${key}"`);
});

test('T68: repeated and competing submits across store instances share exactly one task', async () => {
  const { service, reopen, input, tasks, session } = await setup();
  const results = await Promise.all(Array.from({ length: 8 }, (_, index) => (index % 2 ? service : reopen()).submit(input)));
  expect(new Set(results.map(result => result.task.id)).size).toBe(1);
  expect(await tasks.list(session)).toHaveLength(1);
  expect((await reopen().get(input)).task.id).toBe(results[0].task.id);
});

test('T68: a legacy task with the same description and revision cannot impersonate a structured requirement', async () => {
  const { service, tasks, session, input } = await setup();
  const legacy = await tasks.create({ ...session, goal: content().description, revision: 1, requestKey: 'legacy-task' });
  const bound = await service.submit(input);
  expect(bound.task.id).not.toBe(legacy.id);
  expect(await tasks.list(session)).toHaveLength(2);
  expect((await service.get(input)).task.id).toBe(bound.task.id);
});

for (const field of ['description', 'language', 'location', 'learnerRole', 'partnerRole', 'topic', 'goal', 'special']) test(`T68: changing ${field} creates a new requirement task without mutating the old task`, async () => {
  const { service, requirements, tasks, session, input, requirement } = await setup();
  const first = await service.submit(input);
  const changed = field === 'description' ? { ...content(), description: '我想在社区活动里认识新邻居。' }
    : field === 'language' ? { ...content(), language: 'ko' } : { ...content(), keywords: { ...content().keywords, [field]: '不同的背景关键词' } };
  const next = await requirements.save({ ...session, expectedRevision: 1, content: changed });
  const second = await service.submit({ ...input, requirementRevision: next.revision });
  expect(second.task.id).not.toBe(first.task.id);
  expect(second.requirement).toEqual(next);
  expect(await tasks.get({ ...session, id: second.task.id })).toMatchObject({ requirement: next, revision: 2 });
  expect((await service.get(input)).requirement).toEqual(requirement);
  expect((await service.get(input)).task.id).toBe(first.task.id);
});

test('T68: a pinned historical revision is never silently replaced by the latest saved requirement', async () => {
  const { service, requirements, session, input, requirement } = await setup();
  await requirements.save({ ...session, expectedRevision: 1, content: { ...content(), description: '较新的另一份需求' } });
  expect((await service.submit(input)).requirement).toEqual(requirement);
  expect((await service.get({ ...input, requirementRevision: 2 })).task).toBeNull();
});

test('T68: requirement lookup fingerprints all content rather than only description and version', async () => {
  const { service, tasks, input, session, requirement } = await setup();
  const created = await service.submit(input);
  for (const field of ['description', 'descriptionWhitespace', 'language', 'location', 'learnerRole', 'partnerRole', 'topic', 'goal', 'special']) {
    const changed = field === 'description' ? { ...requirement.content, description: '不同的原始描述' }
      : field === 'descriptionWhitespace' ? { ...requirement.content, description: requirement.content.description.trim() }
      : field === 'language' ? { ...requirement.content, language: 'hi' } : { ...requirement.content, keywords: { ...requirement.content.keywords, [field]: '不同字段' } };
    expect(await tasks.findForRequirement({ ...session, requirement: { revision: 1, content: changed } })).toBeNull();
  }
  expect((await tasks.findForRequirement({ ...session, requirement })).id).toBe(created.task.id);
});

test('T68: internal task creation rejects inconsistent source goal or revision without creating a job', async () => {
  const { tasks, session, requirement } = await setup();
  for (const change of [{ goal: '并非这份需求的描述' }, { revision: 2 }, { requirement: { ...requirement, content: { ...content(), language: 'en' } } }]) {
    await expect(tasks.create({ ...session, goal: content().description, revision: 1, requestKey: 'inconsistent-source', requirement, ...change })).rejects.toThrow();
    expect(await tasks.list(session)).toEqual([]);
  }
});

test('T68: raw requirement supplied to the legacy task HTTP endpoint cannot become a trusted source binding', async () => {
  const { handleGenerationTasks } = await import('../../app/api/generation-tasks/route.ts');
  const { tasks, session, requirement, service, input, cookie } = await setup();
  const response = await handleGenerationTasks(new Request('http://localhost/api/generation-tasks', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: `${GOOGLE_SESSION_COOKIE}=${cookie}` },
    body: JSON.stringify({ goal: content().description, revision: 1, requestKey: 'legacy-claimed-source', requirement }),
  }), { store: tasks, now: now + 1 });
  expect(response.status).toBe(201);
  const legacy = await response.json();
  expect(await tasks.get({ ...session, id: legacy.id })).not.toHaveProperty('requirement');
  expect((await service.get(input)).task).toBeNull();
  expect((await service.submit(input)).task.id).not.toBe(legacy.id);
});

test('T68: an independent process recovers the same task without another submission', async () => {
  const { service, input, requirementOptions, taskOptions } = await setup();
  const first = await service.submit(input);
  const child = spawnSync(process.execPath, [fileURLToPath(new URL('../fixtures/t68-generation-child.cjs', import.meta.url))], {
    input: JSON.stringify({ requirementOptions, taskOptions, input }), encoding: 'utf8', timeout: 10000,
  });
  expect(child.status, child.stderr).toBe(0);
  expect(JSON.parse(child.stdout)).toEqual(first);
});

test('T68: another account cannot read or submit A requirement, while its own same-number version is separate', async () => {
  const { service, requirements, input, otherSession } = await setup();
  const first = await service.submit(input);
  await expect(service.get({ ...otherSession, requirementRevision: 1 })).rejects.toThrow(/Requirement not found/);
  await expect(service.submit({ ...otherSession, requirementRevision: 1 })).rejects.toThrow(/Requirement not found/);
  await requirements.save({ ...otherSession, expectedRevision: 0, content: content() });
  const second = await service.submit({ ...otherSession, requirementRevision: 1 });
  expect(second.task.id).not.toBe(first.task.id);
  expect((await service.get(input)).task.id).toBe(first.task.id);
});

test('T68: missing, forged and expired sessions never read or create tasks', async () => {
  const { service, tasks, input, session } = await setup();
  for (const denied of [{ cookie: null, now }, { cookie: 'forged', now }, { cookie: input.cookie, now: now + 1000 * 60 * 60 * 24 * 365 }]) {
    await expect(service.get({ ...denied, requirementRevision: 1 })).rejects.toThrow(/Authenticated session required/);
    await expect(service.submit({ ...denied, requirementRevision: 1 })).rejects.toThrow(/Authenticated session required/);
  }
  expect(await tasks.list(session)).toEqual([]);
});

test('T68: invalid or absent requirement revisions cannot create tasks', async () => {
  const { service, input, tasks, session } = await setup();
  for (const requirementRevision of [0, -1, 0.5, '1', Number.MAX_SAFE_INTEGER + 1, undefined]) await expect(service.submit({ ...input, requirementRevision })).rejects.toThrow();
  await expect(service.submit({ ...input, requirementRevision: 999 })).rejects.toThrow(/Requirement not found/);
  expect(await tasks.list(session)).toEqual([]);
});

test('T68: read and submit never invoke a provider or network model transport', async () => {
  const { service, input, tasks, session } = await setup();
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('No T68 model calls'); };
  try { await service.submit(input); await service.get(input); await service.submit(input); }
  finally { globalThis.fetch = original; }
  expect(calls).toBe(0);
  for (const task of await tasks.list(session)) expect(task).toMatchObject({ reservedMicros: 0, providerCalls: 0, status: 'awaiting_budget' });
});

function privateCourse(task) {
  const fixture = courseFixture();
  return { ...fixture, id: task.id, revision: task.revision, source: 'ai-generated',
    media: { courseId: task.id, revision: task.revision, assetId: 'synthetic-final', sha256: 'a'.repeat(64), duration: 12.042 },
    lines: fixture.lines.map(({ version, ...line }) => ({ ...line, revision: task.revision })),
  };
}

async function projected(taskChange, readCourse) {
  const context = await setup();
  const submitted = await context.service.submit(context.input);
  const calls = { create: 0, course: [] };
  const service = context.createSceneGenerationService({ requirements: context.requirements, tasks: {
    ...context.tasks,
    create: async input => { calls.create++; return context.tasks.create(input); },
    findForRequirement: async input => ({ ...await context.tasks.findForRequirement(input), ...taskChange }),
    getCourse: async input => { calls.course.push(input); return readCourse ? readCourse(input, submitted.task) : privateCourse(submitted.task); },
  } });
  return { ...context, submitted, calls, service };
}

for (const status of ['submitting', 'submission_unknown', 'script_ready', 'audio_ready', 'audio_assembled', 'video_pending']) test(`T68: ${status} is an actual read-only stage and cannot make a ready course`, async () => {
  const { service, input, calls } = await projected({ status });
  const result = await service.get(input);
  expect(result.phase).toBe(status); expect(result.course).toBeNull();
  expect(calls).toEqual({ create: 0, course: [] });
});

test('T68: failed video jobs and simulation cannot be advertised as a ready generated scene', async () => {
  for (const [change, phase] of [[{ status: 'video_pending', videoJobs: [{ status: 'failed' }] }, 'failed'], [{ status: 'video_assembled', simulation: true }, 'simulation']]) {
    const { service, input, calls } = await projected(change);
    expect((await service.get(input)).phase).toBe(phase);
    expect((await service.get(input)).course).toBeNull(); expect(calls.create).toBe(0); expect(calls.course).toEqual([]);
  }
});

test('T68: video_assembled is ready only after the exact private course is read successfully', async () => {
  const { service, input, calls, submitted, session } = await projected({ status: 'video_assembled' });
  const result = await service.get(input);
  expect(result.phase).toBe('ready');
  expect(result.course).toEqual({ id: submitted.task.id, revision: 1 });
  expect(calls.course).toEqual([{ ...session, id: submitted.task.id, revision: 1 }]);
  expect(calls.create).toBe(0);
});

test('T68: the verified learning material revision is preserved in the watch pointer', async () => {
  const { service, input, calls, submitted, session } = await projected({ status: 'video_assembled', materialsRevision: 3 }, (_input, task) => ({ ...privateCourse(task), materialsRevision: 3 }));
  const result = await service.get(input);
  expect(result.course).toEqual({ id: submitted.task.id, revision: 1, materialsRevision: 3 });
  expect(calls.course).toEqual([{ ...session, id: submitted.task.id, revision: 1, materialsRevision: 3 }]);
});

test('T68: a different material revision cannot be used as a fallback for the verified pointer', async () => {
  const { service, input, calls } = await projected({ status: 'video_assembled', materialsRevision: 3 }, (_input, task) => ({ ...privateCourse(task), materialsRevision: 2 }));
  const result = await service.get(input);
  expect(result.phase).toBe('media_unavailable'); expect(result.course).toBeNull(); expect(calls.course).toHaveLength(1);
});

for (const wrong of ['missing', 'id', 'revision', 'mediaOwner', 'mediaRevision', 'simulation']) test(`T68: ${wrong} course data blocks watch without sample fallback or recreation`, async () => {
  const { service, input, calls } = await projected({ status: 'video_assembled' }, (_input, task) => {
    if (wrong === 'missing') throw new Error('Course media unavailable');
    const course = privateCourse(task);
    if (wrong === 'id') course.id = 'unrelated-old-party';
    if (wrong === 'revision') course.revision = 99;
    if (wrong === 'mediaOwner') course.media.courseId = 'unrelated-old-party';
    if (wrong === 'mediaRevision') course.media.revision = 99;
    if (wrong === 'simulation') course.source = 'test-fixture';
    return course;
  });
  const result = await service.get(input);
  expect(result.phase).toBe('media_unavailable'); expect(result.course).toBeNull(); expect(calls.create).toBe(0);
  expect(calls.course).toHaveLength(1);
});

test('T68: a task whose source requirement is missing or different is rejected rather than guessed from its title', async () => {
  for (const requirement of [undefined, { revision: 1, content: { ...content(), keywords: { ...content().keywords, goal: '不同目标' } } }]) {
    const { service, input, calls } = await projected({ requirement, status: 'video_assembled' });
    await expect(service.get(input)).rejects.toThrow(/source|mismatch/i);
    expect(calls.course).toEqual([]);
  }
});

async function httpFixture() {
  const context = await setup();
  const { handleSceneGeneration } = await import('../../app/api/scene-generation/route.ts');
  const call = (method, cookie = context.cookie, body, query = '?revision=1', origin = 'http://localhost') => handleSceneGeneration(new Request(`http://localhost/api/scene-generation${query}`, {
    method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie: `${GOOGLE_SESSION_COOKIE}=${cookie}` } : {}), ...(origin ? { origin } : {}) },
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  }), { service: context.service, now: now + 1 });
  return { ...context, call, handleSceneGeneration };
}

test('T68 HTTP: explicit POST and later GET use the same server-owned requirement and private task', async () => {
  const { call } = await httpFixture();
  const before = await call('GET'); expect(before.status).toBe(200); expect((await before.json()).task).toBeNull();
  const created = await call('POST', undefined, { requirementRevision: 1 }); expect(created.status).toBe(201);
  const result = await created.json();
  for (const response of [created, await call('GET')]) expect(response.headers.get('cache-control')).toContain('no-store');
  expect(await (await call('GET')).json()).toEqual(result);
  expect(await (await call('POST', undefined, { requirementRevision: 1 })).json()).toEqual(result);
});

test('T68 HTTP: forged identities and another account cannot recover or create the selected task', async () => {
  const { call, other } = await httpFixture();
  for (const token of [null, 'forged']) {
    expect((await call('GET', token)).status).toBe(401);
    expect((await call('POST', token, { requirementRevision: 1 })).status).toBe(401);
  }
  expect((await call('GET', other)).status).toBe(404);
  expect((await call('POST', other, { requirementRevision: 1 })).status).toBe(404);
});

test('T68 HTTP: client owner, status, snapshot or budget claims reject instead of altering the bound task', async () => {
  const { call, tasks, session } = await httpFixture();
  for (const extra of [{ ownerId: 'foreign' }, { status: 'video_assembled' }, { requirement: { revision: 1, content: content() } }, { approved: true }, { simulation: true }]) {
    expect((await call('POST', undefined, { requirementRevision: 1, ...extra })).status).toBe(400);
  }
  expect(await tasks.list(session)).toHaveLength(0);
});

test('T68 HTTP: invalid queries, JSON, revisions and unsupported methods cannot create tasks', async () => {
  const { call, tasks, session } = await httpFixture();
  for (const query of ['', '?revision=0', '?revision=1e2', '?revision=01', '?revision=1&revision=2', '?revision=9007199254740992']) expect((await call('GET', undefined, undefined, query)).status).toBe(400);
  for (const body of ['{', [], {}, { requirementRevision: -1 }, { requirementRevision: '1' }]) expect((await call('POST', undefined, body)).status).toBe(400);
  expect((await call('DELETE')).status).toBe(405);
  expect(await tasks.list(session)).toEqual([]);
});

test('T68 HTTP: missing or foreign Origin and oversized streaming bodies are rejected', async () => {
  const { call, handleSceneGeneration, service, cookie, tasks, session } = await httpFixture();
  for (const origin of [null, 'https://foreign.example.invalid']) expect((await call('POST', undefined, { requirementRevision: 1 }, '', origin)).status).toBe(403);
  let cancelled = false;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(513)); controller.enqueue(new Uint8Array(513)); }, cancel() { cancelled = true; } });
  const response = await handleSceneGeneration(new Request('http://localhost/api/scene-generation', { method: 'POST', duplex: 'half', headers: { origin: 'http://localhost', cookie: `${GOOGLE_SESSION_COOKIE}=${cookie}` }, body }), { service, now });
  expect(response.status).toBe(413); expect(cancelled).toBe(true); expect(await tasks.list(session)).toEqual([]);
});

test('T68 HTTP: unexpected read errors are private generic 503 without exposing stored content or paths', async () => {
  const { handleSceneGeneration, cookie } = await httpFixture();
  const response = await handleSceneGeneration(new Request('http://localhost/api/scene-generation?revision=1', { headers: { cookie: `${GOOGLE_SESSION_COOKIE}=${cookie}` } }), {
    service: { get: async () => { throw new Error('/private/synthetic/owner-data'); } }, now,
  });
  expect(response.status).toBe(503); expect(response.headers.get('cache-control')).toContain('no-store');
  expect(await response.json()).toEqual({ error: 'temporarily_unavailable' });
});

test('T68 configured HTTP: a saved requirement creates and recovers its task across fresh default calls', async () => {
  const route = await import('../../app/api/scene-generation/route.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-t68-default-'));
  const previous = { cwd: process.cwd(), secret: process.env.AUTH_SESSION_SECRET, vercel: process.env.VERCEL };
  const freshNow = Date.now();
  const cookie = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'configured-synthetic', email: 'synthetic@example.invalid' }, secret, freshNow);
  const requirements = createSceneRequirementStore({ directory: join(directory, 'tmp', 'scene-requirements'), sessionSecret: secret });
  await requirements.save({ cookie, now: freshNow, expectedRevision: 0, content: content() });
  const request = method => new Request(`http://localhost/api/scene-generation${method === 'GET' ? '?revision=1' : ''}`, { method, headers: { origin: 'http://localhost', cookie: `${GOOGLE_SESSION_COOKIE}=${cookie}`, 'content-type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify({ requirementRevision: 1 }) } : {}) });
  try {
    process.chdir(directory); process.env.AUTH_SESSION_SECRET = secret; delete process.env.VERCEL;
    const created = await route.POST(request('POST')); expect(created.status).toBe(201);
    const first = await created.json(); expect(first.phase).toBe('awaiting_budget');
    expect(await (await route.GET(request('GET'))).json()).toEqual(first);
    process.env.VERCEL = '1'; expect((await route.GET(request('GET'))).status).toBe(503);
    delete process.env.VERCEL; delete process.env.AUTH_SESSION_SECRET; expect((await route.GET(request('GET'))).status).toBe(503);
  } finally {
    process.chdir(previous.cwd);
    if (previous.secret === undefined) delete process.env.AUTH_SESSION_SECRET; else process.env.AUTH_SESSION_SECRET = previous.secret;
    if (previous.vercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = previous.vercel;
  }
});

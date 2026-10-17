import { test, expect } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GOOGLE_SESSION_COOKIE, sealGoogleSession } from '../../lib/google-auth.ts';
import { generatedCourse } from '../fixtures/t68-generation-browser.mjs';

// C8 (user 2026-10-17: finish the product before real video; self-audit docs/evidence/first-version-audit.md).
// C8-3 the practice page is a saved learning position; C8-4 a generation task can be cancelled before any provider
// call and stopped after the current step once one was made, without ever shrinking the spending ledger;
// C8-5 "pick a meaning" options come from the course's own learner lines; C8-6 a simple medical / official
// procedure rule. Every provider here is an in-memory fake: nothing calls OpenAI or LTX.
const languages = ['zh-Hans', 'id', 'ja', 'ko', 'hi'];
const now = Date.UTC(2026, 9, 17, 8);
const secret = 'c8-synthetic-local-session-secret-at-least-32';
const identity = providerSubject => ({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject, email: 'synthetic@example.invalid' });
const translations = Object.fromEntries(languages.map(k => [k, 'synthetic']));
const lines = Array.from({ length: 4 }, (_, i) => ({ id: 'line' + i, role: i % 2 ? 'learner' : 'partner', text: i % 2 ? 'Hi' : 'Hello', translations }));
const script = { lines, phrases: [{ id: 'phrase', text: 'Hello', lineId: 'line0', translations }], turns: [{ partnerLineId: 'line0', learnerLineId: 'line1' }, { partnerLineId: 'line2', learnerLineId: 'line3' }] };
const wav = (() => {
  const pcm = Buffer.alloc(240044);
  pcm.write('RIFF'); pcm.writeUInt32LE(240036, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(8000, 24); pcm.writeUInt32LE(16000, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(240000, 40);
  return pcm;
})();

// ---- C8-3: the practice page is a saved position ----

async function progressFixture() {
  const { createSceneProgressStore } = await import('../../lib/scene-progress.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-c8-progress-'));
  const cookie = await sealGoogleSession(identity('owner-a'), secret, now);
  const course = generatedCourse({ id: 'c8-progress-course', revision: 2, materialsRevision: 3 });
  course.turns.push({ ...course.turns[0] });
  const open = () => createSceneProgressStore({ directory, sessionSecret: secret });
  return { open, store: open(), session: { cookie, now }, course };
}

test('C8-3 / F11.1: the practice page and its turn are a valid saved position that survives a fresh store', async () => {
  const f = await progressFixture();
  const position = { page: 'practice', time: 4.2, turnIndex: 1 };
  const saved = await f.store.save({ ...f.session, course: f.course, expectedVersion: 0, position });
  expect(saved).toMatchObject({ version: 1, position });
  expect((await f.open().get({ ...f.session, course: f.course })).position).toEqual(position);
});

test('C8-3 / F11.1: a practice position still obeys the turn range and the three-field shape', async () => {
  const f = await progressFixture();
  for (const invalid of [{ page: 'practice', time: 1, turnIndex: 2 }, { page: 'practice', time: 1, turnIndex: 0, history: [] }, { page: 'practice-free', time: 1, turnIndex: 0 }]) {
    await expect(f.store.save({ ...f.session, course: f.course, expectedVersion: 0, position: invalid })).rejects.toThrow(/Invalid/);
  }
  expect(await f.store.get({ ...f.session, course: f.course })).toBeNull();
});

test('C8-3 / F11.1: the progress HTTP route accepts a practice position and passes it through unchanged', async () => {
  const { handleSceneProgress } = await import('../../app/api/scene-progress/route.ts');
  const origin = 'http://localhost:3000', selected = { id: 'c8-http-course', revision: 2, materialsRevision: 3 };
  const position = { page: 'practice', time: 2.5, turnIndex: 0 }, calls = [];
  const record = { course: { ...selected, mediaSha256: 'a'.repeat(64) }, version: 1, position, updatedAt: now };
  const library = { async getProgress() { return record; }, async saveProgress(input) { calls.push(input); return record; } };
  const response = await handleSceneProgress(new Request(origin + '/api/scene-progress', { method: 'PUT',
    headers: { cookie: `${GOOGLE_SESSION_COOKIE}=synthetic-opaque-cookie`, origin, 'content-type': 'application/json' },
    body: JSON.stringify({ course: selected, expectedVersion: 0, position }) }), { library, now });
  expect(response.status).toBe(200);
  expect(calls).toEqual([{ cookie: 'synthetic-opaque-cookie', now, ...selected, expectedVersion: 0, position }]);
});

// ---- C8-4: cancel before any provider call, stop after the current step once one was made ----

async function taskFixture({ onAudio } = {}) {
  const { createGenerationTaskStore } = await import('../../lib/generation-tasks.ts');
  const { createPrivateMediaStore } = await import('../../lib/private-media-store.ts');
  const { createHash } = await import('node:crypto');
  const directory = await mkdtemp(join(tmpdir(), 'les-c8-tasks-'));
  const calls = { script: 0, audio: 0 };
  let store;
  const options = {
    directory, sessionSecret: secret, simulation: true, maxReservedMicros: 100_000,
    mediaStore: createPrivateMediaStore({ directory: join(directory, 'media'), sessionSecret: secret }),
    scriptProvider: { reservedMicros: 100, generate: async () => { calls.script++; return { requestId: 'synthetic', script }; } },
    audioProvider: { reservedMicros: 10, generate: async line => {
      calls.audio++; if (onAudio) await onAudio(store, calls.audio);
      return { lineId: line.id, role: line.role, bytes: wav, sha256: createHash('sha256').update(wav).digest('hex'), duration: 15 };
    } },
  };
  store = createGenerationTaskStore(options);
  const cookie = await sealGoogleSession(identity('owner-a'), secret, now);
  const other = await sealGoogleSession(identity('owner-b'), secret, now);
  const task = await store.create({ cookie, now, goal: 'Synthetic cancel scene', revision: 1, requestKey: 'k' });
  const input = { cookie, now: now + 1, id: task.id };
  const runner = async () => (await import('../../lib/generation-runner.ts')).createGenerationRunner({ store, audioReview: async () => true, wait: async () => {}, maxPolls: 3 });
  return { store, reopen: () => createGenerationTaskStore(options), calls, input, other, runner };
}

test('C8-4 / F14.1: a task not yet submitted is really cancelled: no provider call, no reservation, nothing to resume', async () => {
  const f = await taskFixture();
  expect(await f.store.stopState(f.input)).toBeNull();
  expect(await f.store.cancel(f.input)).toMatchObject({ kind: 'cancelled' });
  expect(await f.reopen().stopState(f.input)).toMatchObject({ kind: 'cancelled' });
  await expect(f.store.runScript(f.input)).rejects.toThrow('Generation stopped');
  const result = await (await f.runner()).advance(f.input);
  expect(result.stopped).toBe('cancelled');
  expect(f.calls).toEqual({ script: 0, audio: 0 });
  expect(await f.store.get(f.input)).toMatchObject({ status: 'awaiting_budget', reservedMicros: 0, providerCalls: 0 });
});

test('C8-4 / F14.1: cancelling twice keeps the first record and another owner cannot cancel', async () => {
  const f = await taskFixture();
  const first = await f.store.cancel(f.input);
  expect(await f.store.cancel({ ...f.input, now: now + 99 })).toEqual(first);
  const g = await taskFixture();
  await expect(g.store.cancel({ ...g.input, cookie: g.other })).rejects.toThrow();
  expect(await g.store.stopState(g.input)).toBeNull();
});

test('C8-4 / F14.1: after a provider call the request becomes "stop after this step"; the ledger never shrinks', async () => {
  const f = await taskFixture();
  await f.store.runScript(f.input);
  const before = await f.store.get(f.input);
  expect(before.providerCalls).toBe(1);
  expect(await f.store.cancel(f.input)).toMatchObject({ kind: 'stop' });
  await expect(f.store.runAudio(f.input)).rejects.toThrow('Generation stopped');
  const result = await (await f.runner()).advance(f.input);
  expect(result.stopped).toBe('cancelled');
  const after = await f.store.get(f.input);
  expect(f.calls).toEqual({ script: 1, audio: 0 });
  expect(after.reservedMicros).toBe(before.reservedMicros);
  expect(after.providerCalls).toBe(before.providerCalls);
  expect(after.status).toBe(before.status);
});

test('C8-4 / F14.1: a stop requested while a provider call is in flight lets that step finish, then submits nothing new', async () => {
  const f = await taskFixture({ onAudio: async (store, n) => { if (n === 1) await store.cancel(f.input); } });
  const result = await (await f.runner()).advance(f.input);
  expect(result.stopped).toBe('cancelled');
  expect(f.calls).toEqual({ script: 1, audio: 1 });
  const task = await f.store.get(f.input);
  // The finished step is kept with its cost: one script reservation plus one voice line.
  expect(task).toMatchObject({ status: 'script_ready', reservedMicros: 110, providerCalls: 2 });
  expect(task.audioAssets).toHaveLength(1);
  expect(await f.store.stopState(f.input)).toMatchObject({ kind: 'stop' });
});

test('C8-4 / F14.1: a deleted task cannot be cancelled and keeps its ledger entry', async () => {
  const f = await taskFixture();
  await f.store.runScript(f.input);
  await f.store.tombstone(f.input);
  await expect(f.store.cancel(f.input)).rejects.toThrow();
  expect(await f.store.get(f.input)).toMatchObject({ status: 'deleted', reservedMicros: 100, providerCalls: 1 });
});

async function serviceFixture({ live = false } = {}) {
  const { createSceneGenerationService } = await import('../../lib/scene-generation.ts');
  const { createSceneRequirementStore } = await import('../../lib/scene-requirements.ts');
  const { createGenerationTaskStore } = await import('../../lib/generation-tasks.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-c8-service-'));
  const calls = { script: 0 };
  const requirements = createSceneRequirementStore({ directory: join(directory, 'requirements'), sessionSecret: secret });
  const tasks = createGenerationTaskStore({ directory: join(directory, 'tasks'), sessionSecret: secret,
    ...(live ? { maxReservedMicros: 10_000, liveBudget: { scope: 'c8-synthetic', priorSpentMicros: 0 },
      scriptProvider: { reservedMicros: 100, generate: async () => { calls.script++; return { requestId: 'synthetic', script }; } } } : {}) });
  const cookie = await sealGoogleSession(identity('account-a'), secret, now);
  const session = { cookie, now: now + 1 };
  await requirements.save({ ...session, expectedRevision: 0, content: { description: '我想在诊所改约。', language: 'zh-Hans', keywords: { location: '诊所', learnerRole: '病人', partnerRole: '接待员', topic: '改约', goal: '改到下午', special: '' } } });
  const service = createSceneGenerationService({ requirements, tasks });
  return { service, tasks, session, calls, input: { ...session, requirementRevision: 1 } };
}

test('C8-4 / F14.1: the scene generation view shows a cancelled task, and an explicit new submit starts it again', async () => {
  const f = await serviceFixture();
  const submitted = await f.service.submit(f.input);
  expect(submitted.phase).toBe('awaiting_budget');
  const cancelled = await f.service.cancel(f.input);
  expect(cancelled).toMatchObject({ phase: 'cancelled', task: { status: 'awaiting_budget', providerCalls: 0 }, course: null });
  expect(await f.service.get(f.input)).toEqual(cancelled);
  const again = await f.service.submit(f.input);
  expect(again.phase).toBe('awaiting_budget');
  expect(again.task.id).toBe(submitted.task.id);
  expect(await f.tasks.stopState({ ...f.session, id: submitted.task.id })).toBeNull();
});

test('C8-4 / F14.1: once a provider was called the view says "stopped", and a new submit does not restart it', async () => {
  const f = await serviceFixture({ live: true });
  const submitted = await f.service.submit(f.input);
  await f.tasks.runScript({ ...f.session, id: submitted.task.id });
  const stopped = await f.service.cancel(f.input);
  expect(stopped.phase).toBe('stopped');
  expect(stopped.task.providerCalls).toBe(1);
  expect((await f.service.submit(f.input)).phase).toBe('stopped');
  await expect(f.tasks.runAudio({ ...f.session, id: submitted.task.id })).rejects.toThrow();
  expect(f.calls.script).toBe(1);
});

test('C8-4 / F14.1: cancelling a requirement with no task is a 404, never a new task', async () => {
  const f = await serviceFixture();
  await expect(f.service.cancel(f.input)).rejects.toThrow('Task not found');
  expect(await f.tasks.list(f.session)).toEqual([]);
});

test('C8-4 / F14.1: the cancel route is same-origin POST only, small, and never starts the runner', async () => {
  const { handleSceneGenerationCancel } = await import('../../app/api/scene-generation/cancel/route.ts');
  const origin = 'http://localhost:3000', calls = [];
  const view = { phase: 'cancelled' };
  const service = { async cancel(input) { calls.push(input); return view; } };
  const request = (body, headers = {}, method = 'POST') => new Request(origin + '/api/scene-generation/cancel', { method,
    headers: { cookie: `${GOOGLE_SESSION_COOKIE}=synthetic-opaque-cookie`, origin, 'content-type': 'application/json', ...headers },
    ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
  const ok = await handleSceneGenerationCancel(request({ requirementRevision: 3 }), { service, now });
  expect(ok.status).toBe(200); expect(await ok.json()).toEqual(view);
  expect(ok.headers.get('cache-control')).toContain('no-store');
  expect(calls).toEqual([{ cookie: 'synthetic-opaque-cookie', now, requirementRevision: 3 }]);
  expect((await handleSceneGenerationCancel(request({ requirementRevision: 3 }, { origin: 'https://foreign.invalid' }), { service, now })).status).toBe(403);
  for (const body of ['{bad', { requirementRevision: 0 }, { requirementRevision: 1, extra: true }, { requirementRevision: 'x'.repeat(2000) }]) {
    expect([400, 413]).toContain((await handleSceneGenerationCancel(request(body), { service, now })).status);
  }
  expect((await handleSceneGenerationCancel(request(undefined, {}, 'GET'), { service, now })).status).toBe(405);
  expect(calls).toHaveLength(1);
  const missing = { async cancel() { throw new Error('Task not found'); } };
  expect((await handleSceneGenerationCancel(request({ requirementRevision: 3 }), { service: missing, now })).status).toBe(404);
  const anonymous = { async cancel() { throw new Error('Authenticated session required'); } };
  expect((await handleSceneGenerationCancel(request({ requirementRevision: 3 }), { service: anonymous, now })).status).toBe(401);
});

// ---- C8-5: "pick a meaning" comes from the course's own learner lines ----

test('C8-5 / F7.5: meaning options are 2-3 distinct learner meanings from this course and always include this turn', async () => {
  const { meaningOptions } = await import('../../lib/practice-meanings.ts');
  const t = text => Object.fromEntries(languages.map(k => [k, `${text}-${k}`]));
  const course = { lines: [
    { id: 'p0', text: 'Hello?', translations: t('p0') }, { id: 'l0', text: 'Hi.', translations: t('l0') },
    { id: 'p1', text: 'Name?', translations: t('p1') }, { id: 'l1', text: 'Tan.', translations: t('l1') },
    { id: 'p2', text: 'Room?', translations: t('p2') }, { id: 'l2', text: 'Ten.', translations: t('l2') },
    { id: 'p3', text: 'Bye?', translations: t('p3') }, { id: 'l3', text: 'Bye.', translations: t('l3') },
  ], turns: [0, 1, 2, 3].map(i => ({ partnerLineId: `p${i}`, learnerLineId: `l${i}` })) };
  for (let turn = 0; turn < 4; turn++) for (const language of languages) {
    const options = meaningOptions(course, turn, language);
    expect(options.length).toBeGreaterThanOrEqual(2); expect(options.length).toBeLessThanOrEqual(3);
    expect(options.map(o => o.lineId)).toContain(`l${turn}`);
    for (const option of options) {
      expect(option.lineId).toMatch(/^l\d$/);
      expect(option.meaning).toBe(`${option.lineId}-${language}`);
    }
    expect(new Set(options.map(o => o.meaning)).size).toBe(options.length);
  }
  // Same course, same turn: the same options in the same order (no hidden randomness).
  expect(meaningOptions(course, 2, 'ja')).toEqual(meaningOptions(course, 2, 'ja'));
});

test('C8-5 / F7.5: duplicate or missing meanings are dropped rather than invented', async () => {
  const { meaningOptions } = await import('../../lib/practice-meanings.ts');
  const same = Object.fromEntries(languages.map(k => [k, 'same']));
  const course = { lines: [
    { id: 'p0', text: 'Q', translations: same }, { id: 'l0', text: 'A', translations: same },
    { id: 'p1', text: 'Q2', translations: same }, { id: 'l1', text: 'B', translations: same },
    { id: 'p2', text: 'Q3', translations: same }, { id: 'l2', text: 'C', translations: { ...same, 'zh-Hans': '' } },
  ], turns: [0, 1, 2].map(i => ({ partnerLineId: `p${i}`, learnerLineId: `l${i}` })) };
  const options = meaningOptions(course, 1, 'zh-Hans');
  expect(options).toEqual([{ lineId: 'l1', meaning: 'same' }]);
});

// ---- C8-6: medical and official-procedure scenes ----

test('C8-6 / F12.4: every clinic example scene is recognised as medical in all five languages', async () => {
  const { sceneSafetyKind } = await import('../../lib/scene-safety.ts');
  const { sceneSeeds } = await import('../../lib/scene-seeds.ts');
  const clinic = sceneSeeds.filter(seed => seed.category === 'clinic');
  expect(clinic.length).toBeGreaterThanOrEqual(4);
  for (const seed of clinic) for (const language of languages) {
    expect(sceneSafetyKind(seed.text[language]), `${seed.id} ${language}`).toBe('medical');
  }
});

test('C8-6 / F12.4: official procedures are recognised, while ordinary scenes like hotel check-in are not', async () => {
  const { sceneSafetyKind } = await import('../../lib/scene-safety.ts');
  const empty = { location: '', learnerRole: '', partnerRole: '', topic: '', goal: '', special: '' };
  const official = ['我要去移民局问工作准证的手续。', 'Saya ingin bertanya tentang visa di kantor imigrasi.', '役所でビザの手続きについて聞きたいです。', '출입국 사무소에서 비자 문의를 하고 싶어요.', 'मुझे इमिग्रेशन दफ़्तर में वीज़ा के बारे में पूछना है।', 'I need to ask about my work pass at a government office.'];
  for (const description of official) expect(sceneSafetyKind({ description, keywords: empty }), description).toBe('official');
  const ordinary = ['我想在酒店办理入住，确认预订。', '我想在食阁点一碗面，少辣。', 'Saya ingin memesan kopi di kedai.', 'ホテルでチェックインしたいです。', '버스를 타고 학교에 가요.', 'मैं होटल में चेक-इन करना चाहता हूँ।'];
  for (const description of ordinary) expect(sceneSafetyKind({ description, keywords: empty }), description).toBeNull();
  // Keywords count too: a neutral description with a clinic location is still a medical scene.
  expect(sceneSafetyKind({ description: '我想问一下时间。', keywords: { ...empty, location: '诊所' } })).toBe('medical');
});

// ---- Copy for C8 in all five help languages (not native-reviewed) ----

test('C8: the new copy exists in all five help languages and the Chinese wording matches the agreed text', async () => {
  const { resumeSafetyCopy, resumeSafetyCopyReviewed } = await import('../../app/resume-safety-copy.ts');
  expect(resumeSafetyCopyReviewed).toBe(false);
  expect(Object.keys(resumeSafetyCopy).sort()).toEqual([...languages].sort());
  const zh = resumeSafetyCopy['zh-Hans'];
  expect(zh.offline).toContain('网络断开');
  expect(zh.unsavedOffline).toBe('未保存，连上网后再试。');
  expect(zh.safety).toBe('这是沟通练习，不是医疗或办事的真实结论。');
  expect(zh.privacy).toBe('不必写真实姓名、学校或证件号。');
  expect(zh.largeText).toBe('大字号'); expect(zh.reducedMotion).toBe('减少动画');
  expect(zh.cancelled).toContain('已取消');
  expect(zh.resumeListen).toBe('先听对方这句'); expect(zh.resumeContinue).toBe('直接继续');
  expect(zh.think).toBe('我想一想'); expect(zh.pause).toBe('停一下'); expect(zh.choose).toBe('选意思');
  expect(zh.turnChosen(1)).toBe('第 1 回合：选了意思，未开口');
  for (const language of languages) for (const [key, value] of Object.entries(resumeSafetyCopy[language])) {
    const text = typeof value === 'function' ? value(2) : value;
    expect(typeof text, `${language}.${key}`).toBe('string');
    expect(text.trim(), `${language}.${key}`).not.toBe('');
  }
});

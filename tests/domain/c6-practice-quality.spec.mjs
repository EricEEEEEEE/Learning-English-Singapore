import { test, expect } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sealGoogleSession, GOOGLE_SESSION_COOKIE } from '../../lib/google-auth.ts';
import { ownerIdFromSessionCookie } from '../../lib/private-owner.ts';
import { courseFixture } from '../fixtures/t60-course.mjs';
import { dataFixture } from '../fixtures/c5-data-store.mjs';

// C6 (user 2026-10-17: finish the product before real video): practice quality at zero cost.
// T19A the partner keeps the conversation going and closes it when the scene goal is done; T21A one light,
// trustworthy coach note at most, which the learner can switch down or mark as wrong; the turn contract is
// validated strictly so a malformed model answer fails instead of being filled in. Every provider is a fake.
// What the real model does with the new prompt cannot be checked here; these tests pin the contract only.
const secret = 'c6-practice-quality-synthetic-secret-at-least-32';
const now = Date.UTC(2026, 9, 17, 14);
const identity = s => ({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: s, email: 'synthetic@example.invalid' });
const voice = Buffer.from('synthetic learner speech');
const answer = over => ({ reply: 'Sure, no problem. What time is better for you?', understood: true, done: false, coachNote: null, ...over });

async function setup({ respond = async () => answer() } = {}) {
  const { createPracticeTurnService } = await import('../../lib/practice-turn.ts');
  const cookie = await sealGoogleSession(identity('c6-owner'), secret, now);
  const course = courseFixture();
  const calls = { transcribe: 0, respond: [], speak: [] };
  const service = createPracticeTurnService({
    directory: await mkdtemp(join(tmpdir(), 'les-c6-turn-')), sessionSecret: secret, maxReservedMicros: 10_000_000, turnMicros: 100_000,
    getCourse: async () => course,
    transcribe: async () => { calls.transcribe++; return { text: 'Can we change to Friday instead?' }; },
    respond: async input => { calls.respond.push(input); return respond(input); },
    speak: async input => { calls.speak.push(input); return { bytes: Buffer.from('partner wav'), mimeType: 'audio/wav' }; },
  });
  const turn = (over = {}) => service.turn({ cookie, now: now + 1, courseId: course.id, revision: 1, turnIndex: 0, language: 'zh-Hans', history: [], audio: { bytes: voice, mimeType: 'audio/webm' }, ...over });
  return { turn, calls };
}

// ---- T19A: the turn contract carries the learner's focus and the partner's "done" ----

test('T19A / F9.4: the learner focus reaches the partner context; without one the turn practises normally', async () => {
  const { turn, calls } = await setup();
  await turn({ focus: 'refusal' });
  await turn({ focus: 'rephrase' });
  await turn();
  expect(calls.respond.map(c => c.focus)).toEqual(['refusal', 'rephrase', 'normal']);
  expect(calls.respond.map(c => c.correction)).toEqual(['normal', 'normal', 'normal']);
});

test('T19A: an unknown focus or correction setting is rejected before any reservation or provider call', async () => {
  const { turn, calls } = await setup();
  await expect(turn({ focus: 'drill-until-perfect' })).rejects.toThrow();
  await expect(turn({ correction: 'strict' })).rejects.toThrow();
  await expect(turn({ focus: 7 })).rejects.toThrow();
  expect(calls.transcribe).toBe(0);
});

test('T19A / F9.5: a finished scene comes back as done together with the partner closing line', async () => {
  const { turn, calls } = await setup({ respond: async () => answer({ reply: 'Okay, Friday at ten then. See you!', done: true }) });
  const result = await turn();
  expect(result).toMatchObject({ kind: 'reply', transcript: 'Can we change to Friday instead?', understood: true, done: true, coachNote: null, reply: { text: 'Okay, Friday at ten then. See you!' } });
  expect(calls.speak).toEqual([{ text: 'Okay, Friday at ten then. See you!' }]);
});

for (const [name, bad] of [
  ['done is missing', { done: undefined }],
  ['done is not a boolean', { done: 'yes' }],
  ['the coach note is not text', { coachNote: 3 }],
  ['the coach note is longer than 120 characters', { coachNote: '换'.repeat(121) }],
  ['understood is missing', { understood: undefined }],
]) test(`T19A: a reply where ${name} fails honestly and is not spoken`, async () => {
  const { turn, calls } = await setup({ respond: async () => answer(bad) });
  await expect(turn()).rejects.toThrow('Practice turn failed');
  expect(calls.speak).toHaveLength(0);
});

// ---- T21A: one light coach note, learner-controlled ----

test('T21A / F8.3: one short coach note is passed through next to the in-role reply', async () => {
  const note = '“change to Friday” 很清楚；也可以说 “Could we move it to Friday?”';
  const { turn } = await setup({ respond: async () => answer({ coachNote: note }) });
  expect(await turn()).toMatchObject({ understood: true, coachNote: note, reply: { text: 'Sure, no problem. What time is better for you?' } });
});

test('T21A / F8.5: with "less correction" a coach note is dropped when the meaning was clear, kept when it was not', async () => {
  let understood = true;
  const { turn, calls } = await setup({ respond: async () => answer({ understood, coachNote: '可以说 Friday morning。' }) });
  expect(await turn({ correction: 'less' })).toMatchObject({ coachNote: null, understood: true });
  understood = false;
  expect(await turn({ correction: 'less' })).toMatchObject({ coachNote: '可以说 Friday morning。', understood: false });
  expect(calls.respond.map(c => c.correction)).toEqual(['less', 'less']);
});

test('T21A / F8.4: a coach note that talks about pronunciation or accent is never shown; the reply still is', async () => {
  for (const note of ['Your pronunciation of Friday was wrong.', '你的发音不标准', 'Work on your accent.', '口音太重了']) {
    const { turn } = await setup({ respond: async () => answer({ coachNote: note }) });
    expect(await turn()).toMatchObject({ coachNote: null, reply: { text: 'Sure, no problem. What time is better for you?' } });
  }
});

// ---- Adapter: strict schema and prompt rules ----

const providers = () => import('../../lib/practice-providers.ts');
const context = over => ({
  partnerLine: 'Can you come on Thursday at ten?', expectedLearnerLine: 'Yes, Thursday at ten is fine.',
  sceneLines: [{ role: 'partner', text: 'Can you come on Thursday at ten?' }, { role: 'learner', text: 'Yes, Thursday at ten is fine.' }],
  transcript: 'Actually, Friday is better for me.', history: [], language: 'zh-Hans', focus: 'normal', correction: 'normal', ...over,
});
const completed = value => ({ id: 'resp', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
async function ask(over, value = answer()) {
  const { respondInScene } = await providers(); const bodies = [];
  const result = await respondInScene(context(over), { enabled: true, apiKey: 'synthetic', fetch: async (_u, o) => { bodies.push(JSON.parse(o.body)); return Response.json(completed(value)); } });
  const system = bodies[0].input.find(x => x.role === 'system').content;
  return { result, body: bodies[0], system };
}

test('T19A adapter: the strict schema asks for reply, understood, done and an optional coach note', async () => {
  const { body, result } = await ask({}, answer({ done: true, coachNote: '可以说 Friday works better.' }));
  const schema = body.text.format.schema;
  expect(body.text.format.strict).toBe(true);
  expect(Object.keys(schema.properties).sort()).toEqual(['coachNote', 'done', 'reply', 'understood']);
  expect([...schema.required].sort()).toEqual(['coachNote', 'done', 'reply', 'understood']);
  expect(schema.additionalProperties).toBe(false);
  expect(schema.properties.done.type).toBe('boolean');
  expect([...schema.properties.coachNote.type].sort()).toEqual(['null', 'string']);
  expect(result).toEqual({ reply: answer().reply, understood: true, done: true, coachNote: '可以说 Friday works better.' });
});

test('T19A / F9.1–F9.5 adapter: the prompt keeps the conversation going and ends it when the goal is done', async () => {
  const { system } = await ask();
  expect(system).toMatch(/different from the typical answer/i);
  expect(system).toMatch(/one short clarifying question/i);
  expect(system).toMatch(/changes? (their|his or her) mind/i);
  expect(system).toMatch(/refuses?/i);
  expect(system).toMatch(/asks? (you )?(a question|something) back/i);
  expect(system).toMatch(/one new condition/i);
  expect(system).toMatch(/done/i);
  expect(system).toMatch(/never (ask|make) the learner (repeat|recite)/i);
});

test('T19A / F9.4 adapter: the chosen focus changes the prompt, and the normal focus adds no extra drill', async () => {
  const normal = (await ask({ focus: 'normal' })).system, refusal = (await ask({ focus: 'refusal' })).system, rephrase = (await ask({ focus: 'rephrase' })).system;
  expect(refusal).toMatch(/practi[sc]e (being refused|refusals?)/i);
  expect(refusal).toMatch(/change of mind|change (their|his or her) mind/i);
  expect(rephrase).toMatch(/ask .*in a different way|rephrase/i);
  expect(normal).not.toMatch(/practi[sc]e (being refused|refusals?)/i);
  expect(normal).not.toBe(refusal); expect(normal).not.toBe(rephrase);
});

test('T21A / F8.3–F8.5 adapter: the prompt answers meaning first, allows one coach point and never judges pronunciation', async () => {
  const normal = (await ask({ correction: 'normal' })).system, less = (await ask({ correction: 'less' })).system;
  expect(normal).toMatch(/respond to the meaning first/i);
  expect(normal).toMatch(/at most one/i);
  expect(normal).toMatch(/120 characters/);
  expect(normal).toMatch(/pronunciation/i);
  expect(normal).toMatch(/accent/i);
  expect(normal).toContain('Simplified Chinese');
  expect(less).toMatch(/coachNote.*null.*unless.*unclear/i);
  expect(normal).not.toMatch(/coachNote.*null.*unless.*unclear/i);
});

for (const [name, value] of [
  ['done is missing', { reply: 'Okay.', understood: true, coachNote: null }],
  ['an extra field is present', { ...answer(), score: 80 }],
  ['the coach note is too long', answer({ coachNote: 'x'.repeat(121) })],
  ['the coach note is not text', answer({ coachNote: { tip: 'x' } })],
]) test(`T19A adapter: a reply where ${name} is rejected`, async () => {
  const { respondInScene } = await providers();
  await expect(respondInScene(context(), { enabled: true, apiKey: 'synthetic', fetch: async () => Response.json(completed(value)) })).rejects.toThrow();
});

// ---- HTTP: focus and correction travel through the practice route ----

test('T19A HTTP: the practice route passes focus and correction to the service and still refuses unknown fields', async () => {
  const { handlePracticeTurn } = await import('../../app/api/practice-turn/route.ts');
  const seen = [];
  const send = payload => handlePracticeTurn(new Request('http://localhost/api/practice-turn', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost', cookie: `${GOOGLE_SESSION_COOKIE}=sealed` }, body: JSON.stringify(payload) }), { service: { turn: async input => { seen.push(input); return { kind: 'silence' }; } }, now: 5 });
  const base = { courseId: 'c', revision: 1, turnIndex: 0, language: 'zh-Hans', history: [], mimeType: 'audio/webm', audioBase64: Buffer.from('voice').toString('base64') };
  expect((await send({ ...base, focus: 'refusal', correction: 'less' })).status).toBe(200);
  expect(seen[0]).toMatchObject({ focus: 'refusal', correction: 'less' });
  expect((await send({ ...base, coach: 'off' })).status).toBe(400);
  expect(seen).toHaveLength(1);
});

// ---- T21A: "this feedback is wrong" is stored per owner ----

async function feedbackSetup() {
  const { createPracticeFeedbackStore } = await import('../../lib/practice-feedback.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-c6-feedback-'));
  const a = { cookie: await sealGoogleSession(identity('c6-a'), secret, now), now }, b = { cookie: await sealGoogleSession(identity('c6-b'), secret, now), now };
  const ownerA = await ownerIdFromSessionCookie(a.cookie, secret, now);
  const reads = [];
  const getCourse = async input => {
    reads.push(input);
    if (await ownerIdFromSessionCookie(input.cookie, secret, input.now) !== ownerA || input.id !== 'c6-course' || input.revision !== 2) throw new Error('Course unavailable');
    return { turns: [{ partnerLineId: 'line-0', learnerLineId: 'line-1' }, { partnerLineId: 'line-2', learnerLineId: 'line-3' }] };
  };
  const store = createPracticeFeedbackStore({ directory, sessionSecret: secret, getCourse });
  return { store, a, b, reads, directory, getCourse, create: createPracticeFeedbackStore };
}
const course = { id: 'c6-course', revision: 2, materialsRevision: 3 };

test('T21A / F10.5: marking a coach note as wrong is stored for that owner and that exact course turn', async () => {
  const { store, a, b, reads } = await feedbackSetup();
  const saved = await store.report({ ...a, course, turnIndex: 1, note: '可以说 Friday morning。' });
  expect(saved).toEqual({ turnIndex: 1, note: '可以说 Friday morning。', status: 'received', at: now });
  expect(reads[0]).toMatchObject({ id: 'c6-course', revision: 2, materialsRevision: 3 });
  expect(await store.list({ ...a, ...course })).toEqual([saved]);
  await expect(store.list({ ...b, ...course })).resolves.toEqual([]);
  await expect(store.report({ ...b, course, turnIndex: 1, note: 'x' })).rejects.toThrow();
  await expect(store.list({ ...a, ...course })).resolves.toHaveLength(1);
});

test('T21A: feedback on a turn the course does not have, an empty or overlong note, or without a session is refused', async () => {
  const { store, a } = await feedbackSetup();
  await expect(store.report({ ...a, course, turnIndex: 2, note: 'x' })).rejects.toThrow();
  await expect(store.report({ ...a, course, turnIndex: -1, note: 'x' })).rejects.toThrow();
  await expect(store.report({ ...a, course, turnIndex: 0, note: '   ' })).rejects.toThrow();
  await expect(store.report({ ...a, course, turnIndex: 0, note: 'x'.repeat(201) })).rejects.toThrow();
  await expect(store.report({ cookie: null, now, course, turnIndex: 0, note: 'x' })).rejects.toThrow('Authenticated session required');
  await expect(store.list({ ...a, ...course })).resolves.toEqual([]);
});

test('T21A / F14.4: deleting all my data also deletes my practice feedback and keeps the other owner\'s', async () => {
  const f = await dataFixture();
  const { createPracticeFeedbackStore } = await import('../../lib/practice-feedback.ts');
  const store = createPracticeFeedbackStore({ directory: f.directory, sessionSecret: f.options.sessionSecret, getCourse: async () => ({ turns: [{}] }) });
  await store.report({ ...f.a, course, turnIndex: 0, note: 'A 的反馈' });
  await store.report({ ...f.b, course, turnIndex: 0, note: 'B 的反馈' });
  const { createMyDataStore } = await import('../../lib/my-data.ts');
  await createMyDataStore(f.options).deleteAll(f.a);
  await expect(store.list({ ...f.a, ...course })).resolves.toEqual([]);
  await expect(store.list({ ...f.b, ...course })).resolves.toHaveLength(1);
});

const origin = 'http://localhost:3000';
const post = (body, { headers = { origin }, cookie = 'synthetic-opaque-cookie' } = {}) => new Request(origin + '/api/practice-feedback', {
  method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie: `${GOOGLE_SESSION_COOKIE}=${cookie}` } : {}), ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('T21A HTTP: POST /api/practice-feedback records one report for the cookie owner, privately', async () => {
  const { handlePracticeFeedback } = await import('../../app/api/practice-feedback/route.ts');
  const calls = [];
  const feedback = { report: async input => { calls.push(input); return { turnIndex: input.turnIndex, note: input.note, status: 'received', at: now }; } };
  const response = await handlePracticeFeedback(post({ course, turnIndex: 0, note: '可以说 Friday。' }), { feedback, now });
  expect(response.status).toBe(201);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(await response.json()).toEqual({ report: { turnIndex: 0, note: '可以说 Friday。', status: 'received', at: now } });
  expect(calls).toEqual([{ cookie: 'synthetic-opaque-cookie', now, course, turnIndex: 0, note: '可以说 Friday。' }]);
});

test('T21A HTTP: practice feedback refuses foreign origins, unknown fields, large bodies and maps failures honestly', async () => {
  const { handlePracticeFeedback } = await import('../../app/api/practice-feedback/route.ts');
  let calls = 0;
  const ok = { report: async () => { calls++; return {}; } };
  const body = { course, turnIndex: 0, note: 'x' };
  expect((await handlePracticeFeedback(post(body, { headers: {} }), { feedback: ok, now })).status).toBe(403);
  expect((await handlePracticeFeedback(post(body, { headers: { origin: 'https://foreign.invalid' } }), { feedback: ok, now })).status).toBe(403);
  expect((await handlePracticeFeedback(post({ ...body, owner: 'usr_other' }), { feedback: ok, now })).status).toBe(400);
  expect((await handlePracticeFeedback(post('{'), { feedback: ok, now })).status).toBe(400);
  expect((await handlePracticeFeedback(post({ ...body, note: 'x'.repeat(3000) }), { feedback: ok, now })).status).toBe(413);
  expect(calls).toBe(0);
  const fail = message => ({ report: async () => { throw new Error(message); } });
  expect((await handlePracticeFeedback(post(body), { feedback: fail('Authenticated session required'), now })).status).toBe(401);
  expect((await handlePracticeFeedback(post(body), { feedback: fail('Course unavailable'), now })).status).toBe(404);
  expect((await handlePracticeFeedback(post(body), { feedback: fail('Invalid note'), now })).status).toBe(400);
  const broken = await handlePracticeFeedback(post(body), { feedback: fail('SQLITE_BUSY /private/path'), now });
  expect(broken.status).toBe(503);
  expect(JSON.stringify(await broken.json())).not.toContain('/private');
});

// ---- Five help languages ----

test('C6 copy: every help language has the full practice-quality copy, marked as not native-reviewed', async () => {
  const { practiceQualityCopy, practiceQualityReviewed } = await import('../../app/practice-quality-copy.ts');
  expect(practiceQualityReviewed).toBe(false);
  const languages = ['zh-Hans', 'id', 'ja', 'ko', 'hi'];
  expect(Object.keys(practiceQualityCopy).sort()).toEqual([...languages].sort());
  const keys = Object.keys(practiceQualityCopy['zh-Hans']).sort();
  for (const language of languages) {
    const copy = practiceQualityCopy[language];
    expect(Object.keys(copy).sort()).toEqual(keys);
    for (const key of keys) {
      const value = copy[key];
      const sample = typeof value === 'function' ? value(1, 'Yes.') : value;
      expect(typeof sample === 'string' && sample.trim().length > 0, `${language}.${key}`).toBe(true);
      if (language !== 'zh-Hans' && typeof value === 'string') expect(value, `${language}.${key} copied from Chinese`).not.toBe(practiceQualityCopy['zh-Hans'][key]);
    }
  }
});

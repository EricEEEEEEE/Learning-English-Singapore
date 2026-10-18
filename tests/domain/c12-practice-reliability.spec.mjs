import { test, expect } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sealGoogleSession, GOOGLE_SESSION_COOKIE } from '../../lib/google-auth.ts';
import { courseFixture } from '../fixtures/t60-course.mjs';

// C12 (2026-10-18, research reports 1 and 2): practice that is more reliable, at zero cost.
// C12-1 a turn the server hears as silence does not count against the 20 turns of a course; C12-2 a coach note
// may only quote words the learner actually said; C12-3 each account has a daily and a per-minute turn limit,
// checked before any reservation or provider call; C12-4 the partner's practice reply is spoken as mp3 (course
// audio stays wav) and the server logs stage timings and byte counts only, never what was said.
// Every provider is an in-memory fake or a fetch stub: nothing here calls OpenAI.
const secret = 'c12-practice-reliability-synthetic-secret-32';
// 2031-01-03 08:00 UTC is 16:00 in Singapore; the practice day follows Singapore time.
const now = Date.UTC(2031, 0, 3, 8);
const MINUTE = 60_000;
const identity = s => ({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: s, email: 'synthetic@example.invalid' });
const voice = Buffer.from('synthetic learner speech');
const answer = over => ({ reply: 'Sure, no problem. What time is better for you?', understood: true, done: false, coachNote: null, goalChange: null, ...over });

async function setup({ transcript = 'Can we change to Friday instead?', respond = async () => answer(), limits = {}, maxReservedMicros = 100_000_000, turnMicros = 100_000, log } = {}) {
  const { createPracticeTurnService } = await import('../../lib/practice-turn.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-c12-turn-'));
  const cookie = await sealGoogleSession(identity('c12-owner'), secret, now), other = await sealGoogleSession(identity('c12-other'), secret, now);
  const course = courseFixture();
  const calls = { transcribe: 0, respond: [], speak: [] };
  const state = { transcript };
  const service = createPracticeTurnService({
    directory, sessionSecret: secret, maxReservedMicros, turnMicros, ...limits, ...(log ? { log } : {}),
    getCourse: async () => course,
    transcribe: async () => { calls.transcribe++; return { text: state.transcript }; },
    respond: async input => { calls.respond.push(input); return respond(input); },
    speak: async input => { calls.speak.push(input); return { bytes: Buffer.from('ID3 partner mp3'), mimeType: 'audio/mpeg' }; },
  });
  const turn = (over = {}) => service.turn({ cookie, now: now + 1, courseId: course.id, revision: 1, turnIndex: 0, language: 'zh-Hans', history: [], audio: { bytes: voice, mimeType: 'audio/webm' }, ...over });
  const reservations = () => { const db = new DatabaseSync(join(directory, 'practice.sqlite')); try { return Number(db.prepare('SELECT count(*) AS n FROM practice_turns').get().n); } finally { db.close(); } };
  return { service, turn, calls, state, cookie, other, reservations };
}

// ---- C12-1: silence does not use up a course's turns ----

test('C12-1 / K5.3: after turns the server heard as silence, a course still has 20 spoken turns', async () => {
  const { turn, calls, state } = await setup();
  state.transcript = '';
  for (let i = 0; i < 3; i++) expect(await turn({ now: now + i * MINUTE })).toEqual({ kind: 'silence' });
  state.transcript = 'Can we change to Friday instead?';
  for (let i = 0; i < 20; i++) expect(await turn({ now: now + (3 + i) * MINUTE })).toMatchObject({ kind: 'reply' });
  const before = calls.transcribe;
  await expect(turn({ now: now + 30 * MINUTE })).rejects.toThrow('Practice turn limit');
  expect(calls.transcribe).toBe(before);
});

// ---- C12-2: a coach note only quotes what the learner said ----

const transcriptWords = 'Can we change to Friday instead?';
for (const [name, note, kept] of [
  ['a quote of words the learner did not say', '你说的 “Friday morning” 很清楚。', false],
  ['a plain-quote of a word the learner did not say', 'You said "Tuesday", but the booking is for Friday.', false],
  ['a corner-bracket quote with one invented word', '「change it to Friday」はいいですね。', false],
  ['a curly single quote of an invented word', '‘Saturday’ 不在你的话里。', false],
  ['a correct quote of what the learner said', '“change to Friday” 很清楚。', true],
  ['a correct quote in other letter case', '“friday” 说得很清楚，也可以说 Could we move it to Friday?', true],
  ['a correct corner-bracket quote', '「Can we change」はていねいです。', true],
  ['no quotation marks at all', '可以说 Could we move it to Friday? 也很自然。', true],
  ['quotes around Chinese words only', '“改到星期五” 的意思很清楚。', true],
]) test(`C12-2 / F8.3: ${name} ${kept ? 'keeps' : 'drops'} the coach note; the reply and its voice stay`, async () => {
  const { turn, calls } = await setup({ transcript: transcriptWords, respond: async () => answer({ coachNote: note }) });
  const result = await turn();
  expect(result).toMatchObject({ kind: 'reply', transcript: transcriptWords, coachNote: kept ? note : null, reply: { text: answer().reply, mimeType: 'audio/mpeg' } });
  expect(typeof result.reply.audioBase64).toBe('string');
  expect(calls.speak).toEqual([{ text: answer().reply }]);
});

test('C12-2 / F12.1: the partner prompt asks to quote only the learner\'s own words in a coach note', async () => {
  const { respondInScene } = await import('../../lib/practice-providers.ts'); const bodies = [];
  const responseBody = value => ({ id: 'resp', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
  await respondInScene({ partnerLine: 'Good morning. Are you ready?', expectedLearnerLine: 'Yes. I am ready.', sceneLines: [{ role: 'partner', text: 'Good morning. Are you ready?' }], transcript: 'Yes', history: [], language: 'zh-Hans', focus: 'normal', correction: 'normal', goal: null, safety: null },
    { enabled: true, apiKey: 'synthetic', fetch: async (_u, o) => { bodies.push(JSON.parse(o.body)); return Response.json(responseBody(answer())); } });
  const system = bodies[0].input.find(x => x.role === 'system').content;
  expect(system).toMatch(/quotation marks only around words the learner actually said/i);
});

// ---- C12-3: daily and per-minute limits per account, before any reservation ----

test('C12-3 / F14.1: the seventh turn within one minute is refused before any reservation or provider call', async () => {
  const { turn, calls, reservations } = await setup();
  for (let i = 0; i < 6; i++) expect(await turn({ now: now + i * 1000 })).toMatchObject({ kind: 'reply' });
  await expect(turn({ now: now + 7000 })).rejects.toThrow('Practice rate limit');
  expect(calls.transcribe).toBe(6);
  expect(reservations()).toBe(6);
  expect(await turn({ now: now + MINUTE + 1000 })).toMatchObject({ kind: 'reply' });
});

test('C12-3 / F14.1: past the daily limit nothing is transcribed or reserved; the next Singapore day starts again', async () => {
  const { turn, service, calls, cookie, reservations } = await setup({ limits: { maxTurnsPerDay: 3 } });
  expect(await service.quota({ cookie, now })).toEqual({ remainingToday: 3 });
  for (let i = 0; i < 3; i++) expect(await turn({ now: now + i * MINUTE })).toMatchObject({ kind: 'reply' });
  expect(await service.quota({ cookie, now: now + 3 * MINUTE })).toEqual({ remainingToday: 0 });
  await expect(turn({ now: now + 4 * MINUTE })).rejects.toThrow('Practice daily limit');
  expect(calls.transcribe).toBe(3);
  expect(reservations()).toBe(3);
  // 23:59 in Singapore is still the same day; 00:01 is the next one. Sessions last 8 hours, so sign in again near midnight.
  const sgMidnight = Date.UTC(2031, 0, 3, 16);
  const late = await sealGoogleSession(identity('c12-owner'), secret, sgMidnight - 10 * MINUTE);
  await expect(turn({ cookie: late, now: sgMidnight - MINUTE })).rejects.toThrow('Practice daily limit');
  expect(await turn({ cookie: late, now: sgMidnight + MINUTE })).toMatchObject({ kind: 'reply' });
  expect(await service.quota({ cookie: late, now: sgMidnight + 2 * MINUTE })).toEqual({ remainingToday: 2 });
});

test('C12-3 / F14.1: silence does not use up the day either, and one account\'s limit does not touch another', async () => {
  const { turn, service, state, cookie, other } = await setup({ limits: { maxTurnsPerDay: 2 } });
  state.transcript = '';
  expect(await turn()).toEqual({ kind: 'silence' });
  state.transcript = 'Can we change to Friday instead?';
  expect(await turn({ now: now + MINUTE })).toMatchObject({ kind: 'reply' });
  expect(await service.quota({ cookie, now: now + MINUTE })).toEqual({ remainingToday: 1 });
  expect(await turn({ now: now + 2 * MINUTE })).toMatchObject({ kind: 'reply' });
  await expect(turn({ now: now + 3 * MINUTE })).rejects.toThrow('Practice daily limit');
  expect(await service.quota({ cookie: other, now: now + 3 * MINUTE })).toEqual({ remainingToday: 2 });
  expect(await turn({ cookie: other, now: now + 3 * MINUTE })).toMatchObject({ kind: 'reply' });
});

test('C12-3: the global USD ceiling and the 20 turns of a course still apply under the new limits', async () => {
  const budget = await setup({ maxReservedMicros: 200_000, turnMicros: 100_000 });
  expect(await budget.turn()).toMatchObject({ kind: 'reply' });
  expect(await budget.turn({ now: now + 2 })).toMatchObject({ kind: 'reply' });
  await expect(budget.turn({ now: now + 3 })).rejects.toThrow('Practice budget exceeded');
  const course = await setup({ limits: { maxTurnsPerCourse: 2 } });
  expect(await course.turn()).toMatchObject({ kind: 'reply' });
  expect(await course.turn({ now: now + 2 })).toMatchObject({ kind: 'reply' });
  await expect(course.turn({ now: now + 3 })).rejects.toThrow('Practice turn limit');
});

test('C12-3: a quota needs a signed-in account and the limits must be positive whole numbers', async () => {
  const { service } = await setup();
  await expect(service.quota({ cookie: 'not-a-session', now })).rejects.toThrow('Authenticated session required');
  const { createPracticeTurnService } = await import('../../lib/practice-turn.ts');
  for (const bad of [{ maxTurnsPerDay: 0 }, { maxTurnsPerMinute: -1 }, { maxTurnsPerDay: 1.5 }]) {
    expect(() => createPracticeTurnService({ directory: join(tmpdir(), 'les-c12-bad'), sessionSecret: secret, maxReservedMicros: 1, turnMicros: 1, ...bad, getCourse: async () => courseFixture(), transcribe: async () => ({ text: '' }), respond: async () => answer(), speak: async () => ({ bytes: Buffer.from('x'), mimeType: 'audio/mpeg' }) })).toThrow('Invalid practice configuration');
  }
});

const http = async (service, payload = {}) => {
  const { handlePracticeTurn } = await import('../../app/api/practice-turn/route.ts');
  return handlePracticeTurn(new Request('http://localhost/api/practice-turn', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost', cookie: `${GOOGLE_SESSION_COOKIE}=sealed` },
    body: JSON.stringify({ courseId: 'c', revision: 1, turnIndex: 0, language: 'zh-Hans', history: [], mimeType: 'audio/webm', audioBase64: voice.toString('base64'), ...payload }) }), { service, now: 5 });
};

test('C12-3 HTTP: the daily and per-minute limits answer 429 with their own codes; the USD ceiling keeps "budget"', async () => {
  for (const [message, error] of [['Practice daily limit', 'daily_limit'], ['Practice rate limit', 'rate_limit'], ['Practice budget exceeded', 'budget']]) {
    const response = await http({ turn: async () => { throw new Error(message); } });
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toBe(error);
    expect(JSON.stringify(body)).not.toMatch(/usd|\$|micros/i);
  }
});

test('C12-3 HTTP: a turn tells the page how many turns are left today, never an amount of money', async () => {
  const seen = [];
  const response = await http({ turn: async () => ({ kind: 'silence' }), quota: async input => { seen.push(input); return { remainingToday: 41 }; } });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ kind: 'silence', remainingToday: 41 });
  expect(seen[0]).toMatchObject({ cookie: 'sealed', now: 5 });
});

// ---- C12-4: an mp3 practice reply, wav course audio, and content-free timing logs ----

const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.from([4, 0, 0, 0, 0, 0, 0]), Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(400)]);
const wav = () => { const b = Buffer.alloc(44 + 1600); b.write('RIFF'); b.writeUInt32LE(36 + 1600, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(1600, 40); return b; };

test('C12-4 / F13.4: the practice reply is requested and returned as mp3 (audio/mpeg)', async () => {
  const { speakReply } = await import('../../lib/practice-providers.ts'); const bodies = [];
  const result = await speakReply({ text: 'Please follow me.' }, { enabled: true, apiKey: 'synthetic', fetch: async (_u, o) => { bodies.push(JSON.parse(o.body)); return new Response(mp3); } });
  expect(bodies).toHaveLength(1);
  expect(bodies[0].response_format).toBe('mp3');
  expect(bodies[0].voice).toBe('marin');
  expect(result.mimeType).toBe('audio/mpeg');
  expect(Buffer.from(result.bytes).equals(mp3)).toBe(true);
  // Something that is not mp3 is not passed on as mp3.
  await expect(speakReply({ text: 'Hi.' }, { enabled: true, apiKey: 'synthetic', fetch: async () => new Response(wav()) })).rejects.toThrow();
});

test('C12-4: course line audio stays wav', async () => {
  const { generateLineAudio } = await import('../../lib/generated-audio.ts'); const bodies = [];
  const asset = await generateLineAudio({ id: 'a', role: 'partner', text: 'Good morning.' }, { enabled: true, apiKey: 'synthetic', fetch: async (_u, o) => { bodies.push(JSON.parse(o.body)); return new Response(wav()); } });
  expect(bodies[0].response_format).toBe('wav');
  expect(asset.duration).toBeCloseTo(0.1, 5);
});

const LOG_KEYS = ['event', 'kind', 'stt_ms', 'llm_ms', 'tts_ms', 'total_ms', 'audio_bytes', 'reply_bytes'];
function checkLog(entry) {
  expect(Object.keys(entry).every(key => LOG_KEYS.includes(key))).toBe(true);
  expect(entry.event).toBe('practice_turn');
  for (const [key, value] of Object.entries(entry)) if (key !== 'event' && key !== 'kind') expect(Number.isSafeInteger(value) && value >= 0).toBe(true);
}

test('C12-4 / F7.2: each turn logs stage timings in ms and byte counts only, never the transcript or the reply', async () => {
  const logs = [];
  const { turn, state } = await setup({ log: entry => logs.push(entry), respond: async () => answer({ coachNote: '“change to Friday” 很清楚。' }) });
  await turn();
  state.transcript = '';
  await turn({ now: now + 2 });
  expect(logs).toHaveLength(2);
  logs.forEach(checkLog);
  expect(logs[0]).toMatchObject({ kind: 'reply', audio_bytes: voice.length, reply_bytes: Buffer.from('ID3 partner mp3').length });
  expect(logs[1]).toMatchObject({ kind: 'silence' });
  const text = JSON.stringify(logs);
  for (const secretText of ['Friday', 'change', 'Sure, no problem', 'Good morning', 'Yes. I am ready']) expect(text).not.toContain(secretText);
});

test('C12-4 / F7.2: the live practice service speaks mp3 and logs no content, with every provider call stubbed', async () => {
  const { createLivePracticeService } = await import('../../lib/live-practice.ts');
  const env = { LES_LIVE_PRACTICE: '1', OPENAI_API_KEY: 'synthetic-key-not-real', AUTH_SESSION_SECRET: secret, LES_PRACTICE_MAX_MICROS: '1000000' };
  const urls = [];
  const fetch = async (url, options) => {
    urls.push(url);
    if (url.endsWith('/audio/transcriptions')) return Response.json({ text: 'Yes, I am ready now.' });
    if (url.endsWith('/responses')) return Response.json({ id: 'r', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(answer({ reply: 'Great, please follow me to the room.' })) }] }] });
    if (url.endsWith('/audio/speech')) { expect(JSON.parse(options.body).response_format).toBe('mp3'); return new Response(mp3); }
    throw new Error('unexpected ' + url);
  };
  const printed = [];
  const original = { info: console.info, log: console.log, warn: console.warn, error: console.error };
  for (const name of Object.keys(original)) console[name] = (...args) => printed.push(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));
  try {
    const service = createLivePracticeService(env, await mkdtemp(join(tmpdir(), 'les-c12-live-')), { getCourse: async () => courseFixture(), fetch });
    expect(service).not.toBeNull();
    const cookie = await sealGoogleSession(identity('c12-live'), secret, now);
    const result = await service.turn({ cookie, now: now + 1, courseId: 'synthetic-test-course', revision: 1, turnIndex: 0, language: 'zh-Hans', history: [], audio: { bytes: voice, mimeType: 'audio/webm' } });
    expect(result).toMatchObject({ kind: 'reply', reply: { text: 'Great, please follow me to the room.', mimeType: 'audio/mpeg' } });
    expect(await service.quota({ cookie, now: now + 2 })).toEqual({ remainingToday: 59 });
  } finally { Object.assign(console, original); }
  expect(urls.map(u => new URL(u).pathname)).toEqual(['/v1/audio/transcriptions', '/v1/responses', '/v1/audio/speech']);
  expect(printed.length).toBeGreaterThanOrEqual(1);
  const all = printed.join('\n');
  expect(all).toContain('stt_ms');
  for (const content of ['Yes, I am ready now', 'Great, please follow me', 'synthetic-key-not-real', 'Good morning']) expect(all).not.toContain(content);
});

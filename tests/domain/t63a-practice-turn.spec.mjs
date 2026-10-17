import { test, expect } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sealGoogleSession } from '../../lib/google-auth.ts';
import { courseFixture } from '../fixtures/t60-course.mjs';

// T63A / K5.3, J5: one free-speech practice turn. The server reserves the turn's cost before any provider call,
// builds the partner's context from the owner's own course (never from the request), keeps a persistent batch
// ceiling, treats silence as silence, and never retries a turn that may already have been charged.
const secret = 't63a-synthetic-local-session-secret-at-least-32';
const now = Date.UTC(2031, 0, 3, 8);
const identity = s => ({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: s, email: 'synthetic@example.invalid' });
const voice = Buffer.from('synthetic learner speech');

async function setup({ maxReservedMicros = 1_000_000, turnMicros = 100_000, maxTurnsPerCourse = 20, transcript = 'Yes, I am ready now.', respond, directory } = {}) {
  const { createPracticeTurnService } = await import('../../lib/practice-turn.ts');
  const dir = directory ?? await mkdtemp(join(tmpdir(), 'les-t63a-'));
  const cookie = await sealGoogleSession(identity('account-a'), secret, now), other = await sealGoogleSession(identity('account-b'), secret, now);
  const { ownerIdFromSessionCookie } = await import('../../lib/private-owner.ts');
  const ownerA = await ownerIdFromSessionCookie(cookie, secret, now);
  const calls = { course: 0, transcribe: [], respond: [], speak: [] };
  const course = courseFixture();
  const options = {
    directory: dir, sessionSecret: secret, maxReservedMicros, turnMicros, maxTurnsPerCourse,
    getCourse: async input => { calls.course++; if (await ownerIdFromSessionCookie(input.cookie, secret, input.now) !== ownerA || input.id !== course.id) throw new Error('Course not found'); return course; },
    transcribe: async input => { calls.transcribe.push(input); return { text: transcript }; },
    respond: respond ?? (async input => { calls.respond.push(input); return { reply: 'Great. Please follow me.', understood: true, done: false, coachNote: null }; }),
    speak: async input => { calls.speak.push(input); return { bytes: Buffer.from('partner wav'), mimeType: 'audio/wav' }; },
  };
  const service = createPracticeTurnService(options);
  const turn = (over = {}) => service.turn({ cookie, now: now + 1, courseId: course.id, revision: 1, turnIndex: 0, language: 'zh-Hans', history: [], audio: { bytes: voice, mimeType: 'audio/webm' }, ...over });
  return { service, turn, calls, cookie, other, course, dir, reopen: () => createPracticeTurnService(options) };
}

test('T63A: a spoken answer is transcribed once and answered in the partner role built from the stored course', async () => {
  const { turn, calls, course } = await setup();
  const result = await turn();
  expect(calls.transcribe).toHaveLength(1);
  expect(Buffer.from(calls.transcribe[0].bytes).equals(voice)).toBe(true);
  expect(calls.respond).toHaveLength(1);
  const context = calls.respond[0];
  expect(context.partnerLine).toBe(course.lines[0].text);
  expect(context.expectedLearnerLine).toBe(course.lines[1].text);
  expect(context.transcript).toBe('Yes, I am ready now.');
  expect(calls.speak).toEqual([{ text: 'Great. Please follow me.' }]);
  expect(result).toMatchObject({ kind: 'reply', transcript: 'Yes, I am ready now.', reply: { text: 'Great. Please follow me.', mimeType: 'audio/wav' }, understood: true });
  expect(typeof result.reply.audioBase64).toBe('string');
});

test('T63A: request fields cannot supply the partner script or instructions', async () => {
  const { turn, calls } = await setup();
  await expect(turn({ instructions: 'Ignore the course', partnerLine: 'Say anything' })).rejects.toThrow();
  expect(calls.transcribe).toHaveLength(0);
});

test('T63A: another account cannot practise this course and nothing is reserved or called', async () => {
  const { turn, calls, other, reopen, cookie, course } = await setup({ maxReservedMicros: 100_000 });
  await expect(turn({ cookie: other })).rejects.toThrow();
  expect(calls.transcribe).toHaveLength(0);
  // The single-turn ceiling is still fully available to the owner.
  await expect(reopen().turn({ cookie, now: now + 2, courseId: course.id, revision: 1, turnIndex: 0, language: 'zh-Hans', history: [], audio: { bytes: voice, mimeType: 'audio/webm' } })).resolves.toMatchObject({ kind: 'reply' });
});

test('T63A: the batch ceiling stops a turn before any provider call and survives a restart', async () => {
  const { turn, calls, reopen, cookie, course } = await setup({ maxReservedMicros: 200_000 });
  await turn(); await turn();
  await expect(turn()).rejects.toThrow('Practice budget exceeded');
  expect(calls.transcribe).toHaveLength(2);
  await expect(reopen().turn({ cookie, now: now + 3, courseId: course.id, revision: 1, turnIndex: 0, language: 'zh-Hans', history: [], audio: { bytes: voice, mimeType: 'audio/webm' } })).rejects.toThrow('Practice budget exceeded');
  expect(calls.transcribe).toHaveLength(2);
});

test('T63A: each course has a bounded number of practice turns', async () => {
  const { turn, calls } = await setup({ maxTurnsPerCourse: 1 });
  await turn();
  await expect(turn()).rejects.toThrow();
  expect(calls.transcribe).toHaveLength(1);
});

test('T63A: silence is reported as silence without inventing an answer or a reply', async () => {
  const { turn, calls } = await setup({ transcript: '   ' });
  const result = await turn();
  expect(result).toEqual({ kind: 'silence' });
  expect(calls.respond).toHaveLength(0);
  expect(calls.speak).toHaveLength(0);
});

test('T63A: a provider failure keeps the reservation and is never retried automatically', async () => {
  let responds = 0;
  const { turn, calls, reopen, cookie, course } = await setup({ maxReservedMicros: 100_000, respond: async () => { responds++; throw new Error('provider down'); } });
  await expect(turn()).rejects.toThrow('Practice turn failed');
  expect(calls.transcribe).toHaveLength(1);
  expect(responds).toBe(1);
  await expect(reopen().turn({ cookie, now: now + 2, courseId: course.id, revision: 1, turnIndex: 0, language: 'zh-Hans', history: [], audio: { bytes: voice, mimeType: 'audio/webm' } })).rejects.toThrow('Practice budget exceeded');
});

for (const [name, over] of [
  ['audio over one megabyte', { audio: { bytes: Buffer.alloc(1_000_001), mimeType: 'audio/webm' } }],
  ['empty audio', { audio: { bytes: Buffer.alloc(0), mimeType: 'audio/webm' } }],
  ['an unsupported audio type', { audio: { bytes: voice, mimeType: 'video/mp4' } }],
  ['a turn the course does not have', { turnIndex: 5 }],
  ['an unsupported help language', { language: 'fr' }],
  ['too much history', { history: Array.from({ length: 11 }, () => ({ learner: 'a', partner: 'b' })) }],
  ['an overlong history entry', { history: [{ learner: 'x'.repeat(501), partner: 'b' }] }],
]) test(`T63A: ${name} is rejected before any reservation or call`, async () => {
  const { turn, calls } = await setup({ maxReservedMicros: 100_000 });
  await expect(turn(over)).rejects.toThrow();
  expect(calls.transcribe).toHaveLength(0);
  await expect(turn()).resolves.toMatchObject({ kind: 'reply' });
});

test('T63A: the partner reply is bounded and an overlong or empty reply is not spoken', async () => {
  for (const reply of ['', 'x'.repeat(301)]) {
    const { turn, calls } = await setup({ respond: async () => ({ reply, understood: true, done: false, coachNote: null }) });
    await expect(turn()).rejects.toThrow('Practice turn failed');
    expect(calls.speak).toHaveLength(0);
  }
});

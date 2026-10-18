import { test, expect } from '@playwright/test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sealGoogleSession, GOOGLE_SESSION_COOKIE } from '../../lib/google-auth.ts';
import { ownerIdFromSessionCookie } from '../../lib/private-owner.ts';
import { dataFixture } from '../fixtures/c5-data-store.mjs';
import { scriptOutputs } from '../fixtures/c7-script-outputs.mjs';

// C13 (2026-10-18, research reports 1 and 5): listening again across courses, and local English.
// C13-1 a cross-course "listen to these again today" queue: fixed 1/3/7/14-day steps and three self-ratings, two
// "understood" in a row take a sentence out, at most N a day (5 unless changed) and nothing piles up; C13-2 "continue
// where you stopped" and an only-growing "heard N sentences"; C13-3 optional script fields for local register and
// "you could also say"; C13-4 seed scene cards, a local expression library and a review table (CSV out and back in).
// Time is injected everywhere; every course reader is an in-memory fake and nothing here calls a model.
const languages = ['zh-Hans', 'id', 'ja', 'ko', 'hi'];
const secret = 'c13-review-local-synthetic-secret-at-least-32';
const DAY = 86_400_000, HOUR = 3_600_000;
// 2031-01-03 08:00 UTC is 16:00 in Singapore; review days follow Singapore time (UTC+8).
const now = Date.UTC(2031, 0, 3, 8);
const sgDayStart = t => Math.floor((t + 8 * HOUR) / DAY) * DAY - 8 * HOUR;
const identity = s => ({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: s, email: 'synthetic@example.invalid' });
const tr = text => Object.fromEntries(languages.map(language => [language, `${language}: ${text}`]));
const origin = 'http://127.0.0.1:3210';

function courseOf(id, revision = 1, materialsRevision) {
  const lines = Array.from({ length: 10 }, (_, i) => ({ id: `${id}-l${i}`, role: i % 2 ? 'learner' : 'partner', text: `Synthetic sentence ${i} of ${id}.`, start: i * 2, end: i * 2 + 1.5, revision, translations: tr(`句子 ${i}`) }));
  lines[0].plainAlternative = 'Can I help you?';
  return { id, revision, ...(materialsRevision ? { materialsRevision } : {}), source: 'ai-generated', media: { courseId: id, revision, assetId: 'final', sha256: 'a'.repeat(64), duration: 20 }, lines,
    phrases: [{ id: `${id}-p`, text: 'Synthetic sentence', lineId: `${id}-l0`, translations: tr('合成句子') }],
    turns: [0, 2, 4, 6, 8].map(i => ({ partnerLineId: `${id}-l${i}`, learnerLineId: `${id}-l${i + 1}` })) };
}
const pointerOf = course => ({ id: course.id, revision: course.revision, ...(course.materialsRevision ? { materialsRevision: course.materialsRevision } : {}) });

async function setup({ disabled } = {}) {
  const { createReviewQueueStore } = await import('../../lib/review-queue.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-c13-queue-'));
  // A signed-in session lasts 8 hours, so each call is made with a session signed at that call's own time.
  const a = { subject: 'c13-owner-a' }, b = { subject: 'c13-owner-b' };
  const ownerA = await ownerIdFromSessionCookie(await sealGoogleSession(identity(a.subject), secret, now), secret, now), ownerB = await ownerIdFromSessionCookie(await sealGoogleSession(identity(b.subject), secret, now), secret, now);
  const owned = { [ownerA]: new Map(), [ownerB]: new Map() };
  const reads = [];
  const allow = (owner, course) => owned[owner].set(`${course.id}:${course.revision}:${course.materialsRevision ?? 0}`, course);
  async function getCourse(input) {
    reads.push({ id: input.id, revision: input.revision, materialsRevision: input.materialsRevision });
    const owner = await ownerIdFromSessionCookie(input.cookie, secret, input.now);
    if (!owner) throw new Error('Authenticated session required');
    const course = owned[owner]?.get(`${input.id}:${input.revision}:${input.materialsRevision ?? 0}`);
    if (!course) throw new Error('Course unavailable');
    return structuredClone(course);
  }
  const signed = store => Object.fromEntries(Object.entries(store).map(([name, method]) => [name, async input => {
    if (!input?.subject) return method(input);
    const { subject, ...rest } = input;
    return method({ ...rest, cookie: await sealGoogleSession(identity(subject), secret, rest.now ?? now) });
  }]));
  const open = () => signed(createReviewQueueStore({ directory, sessionSecret: secret, getCourse, ...(disabled ? { disabledLines: disabled } : {}) }));
  return { open, store: open(), a, b, ownerA, ownerB, allow, reads, directory };
}
const at = (session, t) => ({ ...session, now: t });
// The C5 data fixture signs its sessions once; a call days later needs a session signed at that time.
const signedAt = async (f, subject, t) => ({ cookie: await sealGoogleSession(identity(subject), f.options.sessionSecret, t), now: t });

// ---- C13-1: the schedule ----

test('C13-1 / F15.1: a learned sentence comes back the next Singapore day, not earlier, then after 3, 3, 7, 7 and 14 days; two "understood" in a row take it out', async () => {
  const { store, a, ownerA, allow } = await setup();
  const { REVIEW_INTERVAL_DAYS } = await import('../../lib/review-queue.ts');
  expect(REVIEW_INTERVAL_DAYS).toEqual([1, 3, 7, 14]);
  const course = courseOf('c13-hotel'); allow(ownerA, course);
  expect(await store.add({ ...at(a, now), course: pointerOf(course), lineIds: ['c13-hotel-l2'], source: 'learned' })).toEqual({ added: 1 });
  const ids = async t => (await store.today(at(a, t))).items.map(item => item.lineId);
  expect(await ids(now)).toEqual([]);
  // Midnight in Singapore is 16:00 UTC: one minute before it the sentence is not due yet.
  const midnight = sgDayStart(now) + DAY;
  expect(await ids(midnight - 60_000)).toEqual([]);
  expect(await ids(midnight)).toEqual(['c13-hotel-l2']);
  const steps = [];
  let t = midnight + 9 * HOUR;
  for (const rating of ['clear', 'hint', 'clear', 'hint', 'clear']) {
    const result = await store.rate({ ...at(a, t), course: pointerOf(course), lineId: 'c13-hotel-l2', rating });
    expect(result.done).toBe(false);
    steps.push(Math.round((result.dueAt - sgDayStart(t)) / DAY));
    expect(await ids(result.dueAt - 60_000)).toEqual([]);
    expect(await ids(result.dueAt)).toEqual(['c13-hotel-l2']);
    t = result.dueAt + 10 * HOUR;
  }
  expect(steps).toEqual([3, 3, 7, 7, 14]);
  expect(await store.rate({ ...at(a, t), course: pointerOf(course), lineId: 'c13-hotel-l2', rating: 'clear' })).toEqual({ done: true, dueAt: null });
  for (const later of [t + DAY, t + 30 * DAY, t + 400 * DAY]) expect(await ids(later)).toEqual([]);
  // Learning the same sentence again does not bring a finished sentence back.
  await store.add({ ...at(a, t + DAY), course: pointerOf(course), lineIds: ['c13-hotel-l2'], source: 'learned' });
  expect(await ids(t + 40 * DAY)).toEqual([]);
});

test('C13-1 / F10.5: "did not understand" starts again at one day; "understood after help" keeps the step and breaks the run of two', async () => {
  const { store, a, ownerA, allow } = await setup();
  const course = courseOf('c13-clinic'); allow(ownerA, course);
  await store.add({ ...at(a, now), course: pointerOf(course), lineIds: ['c13-clinic-l4'], source: 'learned' });
  let t = sgDayStart(now) + DAY + 2 * HOUR;
  const rate = async rating => { const r = await store.rate({ ...at(a, t), course: pointerOf(course), lineId: 'c13-clinic-l4', rating }); const days = r.dueAt === null ? null : Math.round((r.dueAt - sgDayStart(t)) / DAY); t = (r.dueAt ?? t) + 3 * HOUR; return [r.done, days]; };
  expect(await rate('clear')).toEqual([false, 3]);
  expect(await rate('missed')).toEqual([false, 1]);
  expect(await rate('clear')).toEqual([false, 3]);
  expect(await rate('hint')).toEqual([false, 3]);
  expect(await rate('clear')).toEqual([false, 7]);
  expect(await rate('clear')).toEqual([true, null]);
});

test('C13-1 / F15.1: at most 5 a day by default; days away do not pile up, a rated sentence is not asked again the same day, and the limit can change (1-10)', async () => {
  const { store, a, ownerA, allow } = await setup();
  const { REVIEW_DAILY_DEFAULT } = await import('../../lib/review-queue.ts');
  expect(REVIEW_DAILY_DEFAULT).toBe(5);
  const first = courseOf('c13-many-a'), second = courseOf('c13-many-b'); allow(ownerA, first); allow(ownerA, second);
  await store.add({ ...at(a, now), course: pointerOf(first), lineIds: first.lines.map(line => line.id), source: 'learned' });
  await store.add({ ...at(a, now), course: pointerOf(second), lineIds: second.lines.slice(0, 4).map(line => line.id), source: 'learned' });
  // Fourteen sentences are due and the learner was away for 20 days: today still asks for five, never "overdue".
  const away = now + 20 * DAY;
  const today = await store.today(at(a, away));
  expect(today.limit).toBe(5);
  expect(today.items).toHaveLength(5);
  expect(JSON.stringify(today)).not.toMatch(/overdue|percent|score|streak/i);
  for (const item of today.items) expect(item).toEqual({ course: expect.any(Object), lineId: expect.any(String), text: expect.any(String), translations: expect.any(Object), start: expect.any(Number), end: expect.any(Number), ...(item.plainAlternative ? { plainAlternative: item.plainAlternative } : {}) });
  for (const item of today.items.slice(0, 3)) await store.rate({ ...at(a, away + HOUR), course: item.course, lineId: item.lineId, rating: 'missed' });
  const later = await store.today(at(a, away + 2 * HOUR));
  expect(later.items).toHaveLength(2);
  for (const item of later.items) expect(today.items.slice(0, 3).map(done => done.lineId)).not.toContain(item.lineId);
  for (const item of later.items) await store.rate({ ...at(a, away + 3 * HOUR), course: item.course, lineId: item.lineId, rating: 'hint' });
  expect((await store.today(at(a, away + 4 * HOUR))).items).toEqual([]);
  // A rated sentence cannot be rated again before it is due.
  await expect(store.rate({ ...at(a, away + 5 * HOUR), course: today.items[0].course, lineId: today.items[0].lineId, rating: 'clear' })).rejects.toThrow('Review item unavailable');
  expect((await store.today(at(a, away + DAY))).items).toHaveLength(5);
  expect(await store.setLimit({ ...at(a, away + DAY), limit: 3 })).toEqual({ limit: 3 });
  expect((await store.today(at(a, away + DAY))).items).toHaveLength(3);
  for (const limit of [0, 11, 2.5, '5', null]) await expect(store.setLimit({ ...at(a, away + DAY), limit })).rejects.toThrow('Invalid review limit');
  expect((await store.today(at(a, away + DAY))).limit).toBe(3);
});

test('C13-1 / F14.2: each account sees and rates only its own sentences; another account\'s course is not readable', async () => {
  const { store, a, b, ownerA, ownerB, allow } = await setup();
  const mine = courseOf('c13-mine'), theirs = courseOf('c13-theirs'); allow(ownerA, mine); allow(ownerB, theirs);
  await store.add({ ...at(a, now), course: pointerOf(mine), lineIds: ['c13-mine-l1'], source: 'learned' });
  await expect(store.add({ ...at(a, now), course: pointerOf(theirs), lineIds: ['c13-theirs-l1'], source: 'learned' })).rejects.toThrow('Course unavailable');
  const due = now + 2 * DAY;
  expect((await store.today(at(b, due))).items).toEqual([]);
  await expect(store.rate({ ...at(b, due), course: pointerOf(mine), lineId: 'c13-mine-l1', rating: 'clear' })).rejects.toThrow('Review item unavailable');
  expect((await store.today(at(a, due))).items.map(item => item.lineId)).toEqual(['c13-mine-l1']);
  await expect(store.today({ cookie: 'not-a-session', now: due })).rejects.toThrow('Authenticated session required');
  await expect(store.today({ now: due })).rejects.toThrow('Authenticated session required');
});

test('C13-1: only real lines of the course, at most 20 at a time, from three named sources; ratings are the three self-ratings only', async () => {
  const { store, a, ownerA, allow } = await setup();
  const course = courseOf('c13-check'); allow(ownerA, course);
  const add = over => store.add({ ...at(a, now), course: pointerOf(course), lineIds: ['c13-check-l1'], source: 'learned', ...over });
  for (const source of ['learned', 'review', 'report']) expect((await add({ source })).added).toBeGreaterThanOrEqual(0);
  for (const over of [{ source: 'other' }, { lineIds: ['absent-line'] }, { lineIds: [] }, { lineIds: Array.from({ length: 21 }, (_, i) => `c13-check-l${i % 10}`) }, { lineIds: ['bad id!'] }, { course: { id: 'c13-check' } }])
    await expect(add(over)).rejects.toThrow(/^Invalid |Course unavailable/);
  for (const rating of ['easy', 'good', 'again', 4, null]) await expect(store.rate({ ...at(a, now + 2 * DAY), course: pointerOf(course), lineId: 'c13-check-l1', rating })).rejects.toThrow('Invalid review rating');
  const { reviewRatings, reviewSources } = await import('../../lib/review-queue.ts');
  expect([...reviewRatings]).toEqual(['missed', 'hint', 'clear']);
  expect([...reviewSources]).toEqual(['learned', 'review', 'report']);
});

test('C13-1 / F10.5: from a practice review, turns that needed help, were done after a hint or picked a meaning come back; independent and unobserved ones do not', async () => {
  const { store, a, ownerA, allow } = await setup();
  const { reviewTurnLines } = await import('../../lib/review-queue.ts');
  const course = courseOf('c13-review'); allow(ownerA, course);
  const turns = [{ turnIndex: 0, outcome: 'independent' }, { turnIndex: 1, outcome: 'needs_help' }, { turnIndex: 2, outcome: 'after_hint' }, { turnIndex: 3, outcome: 'chose_meaning' }, { turnIndex: 4, outcome: 'unobserved' }];
  expect(reviewTurnLines(course, turns)).toEqual(['c13-review-l2', 'c13-review-l3', 'c13-review-l4', 'c13-review-l5', 'c13-review-l6', 'c13-review-l7']);
  await store.addReview({ ...at(a, now), course: pointerOf(course), turns });
  expect((await store.today(at(a, now + DAY))).items.map(item => item.lineId)).toEqual(['c13-review-l2', 'c13-review-l3', 'c13-review-l4', 'c13-review-l5', 'c13-review-l6']);
  // A sentence that already left the queue comes back when a new review or a "hard to hear" report asks for it.
  const finish = async (lineId, t) => { for (const step of [0, 1]) { const due = (await store.today(at(a, t))).items.find(item => item.lineId === lineId); expect(due, lineId).toBeTruthy(); const r = await store.rate({ ...at(a, t), course: pointerOf(course), lineId, rating: 'clear' }); t = r.dueAt ?? t; } return t; };
  await store.setLimit({ ...at(a, now), limit: 10 });
  const t = await finish('c13-review-l2', now + DAY);
  expect((await store.today(at(a, t + 30 * DAY))).items.map(item => item.lineId)).not.toContain('c13-review-l2');
  await store.add({ ...at(a, t + 30 * DAY), course: pointerOf(course), lineIds: ['c13-review-l2'], source: 'report' });
  expect((await store.today(at(a, t + 31 * DAY))).items.map(item => item.lineId)).toContain('c13-review-l2');
});

test('C13-1 / F12.5: a sentence whose report is set to "disabled" leaves the queue by itself', async () => {
  const f = await dataFixture();
  const { createSentenceReportStore } = await import('../../lib/sentence-reports.ts');
  const { createReviewQueueStore } = await import('../../lib/review-queue.ts');
  const course = courseOf('c13-disabled', 2, 3);
  const getCourse = async input => { const owner = await ownerIdFromSessionCookie(input.cookie, f.options.sessionSecret, input.now); if (owner !== f.ownerA || input.id !== course.id) throw new Error('Course unavailable'); return structuredClone(course); };
  const reports = createSentenceReportStore({ directory: f.directory, sessionSecret: f.options.sessionSecret, getCourse });
  const disabledLines = async input => new Set((await reports.list(input)).filter(report => report.status === 'disabled').map(report => report.lineId));
  const queue = createReviewQueueStore({ directory: f.directory, sessionSecret: f.options.sessionSecret, getCourse, disabledLines });
  const session = { cookie: f.a.cookie };
  await queue.add({ ...session, now: f.a.now, course: pointerOf(course), lineIds: ['c13-disabled-l1', 'c13-disabled-l3'], source: 'learned' });
  await reports.report({ ...session, now: f.a.now, course: pointerOf(course), lineId: 'c13-disabled-l3', reason: 'not_local' });
  await reports.setStatus({ ...session, now: f.a.now, course: pointerOf(course), lineId: 'c13-disabled-l3', status: 'disabled' });
  const due = f.a.now + 2 * DAY;
  expect((await queue.today(await signedAt(f, 'c5-owner-a', due))).items.map(item => item.lineId)).toEqual(['c13-disabled-l1']);
  // Removed, not just hidden: turning the report back does not restore the old schedule.
  await reports.setStatus({ ...(await signedAt(f, 'c5-owner-a', due)), course: pointerOf(course), lineId: 'c13-disabled-l3', status: 'corrected' });
  expect((await queue.today(await signedAt(f, 'c5-owner-a', due + DAY))).items.map(item => item.lineId)).toEqual(['c13-disabled-l1']);
});

test('C13-1 / F14.5: deleting one scene removes its queue; deleting all removes every queue item and "heard" starts again at 0 with the time it was reset', async () => {
  const f = await dataFixture();
  const { createReviewQueueStore } = await import('../../lib/review-queue.ts');
  const { createMyDataStore } = await import('../../lib/my-data.ts');
  const mine = await f.generated(f.a, '我想在酒店办理入住，确认预订。', 100_000), other = await f.generated(f.a, '我想在诊所改约时间。', 100_000), theirs = await f.generated(f.b, '我想在酒店办理入住，确认预订。', 100_000);
  const courses = new Map([[mine.task.id, courseOf(mine.task.id)], [other.task.id, courseOf(other.task.id)], [theirs.task.id, courseOf(theirs.task.id)]]);
  const ownerOfCourse = new Map([[mine.task.id, f.ownerA], [other.task.id, f.ownerA], [theirs.task.id, f.ownerB]]);
  const getCourse = async input => { const owner = await ownerIdFromSessionCookie(input.cookie, f.options.sessionSecret, input.now); if (ownerOfCourse.get(input.id) !== owner) throw new Error('Course unavailable'); return structuredClone(courses.get(input.id)); };
  const queue = createReviewQueueStore({ directory: f.directory, sessionSecret: f.options.sessionSecret, getCourse });
  for (const [session, task] of [[f.a, mine.task], [f.a, other.task], [f.b, theirs.task]]) {
    const course = courses.get(task.id);
    await queue.listen({ ...session, course: pointerOf(course), heard: course.lines.slice(0, 4).map(line => line.id), learned: [course.lines[1].id] });
  }
  const aLater = await signedAt(f, 'c5-owner-a', f.a.now + 2 * DAY), bLater = await signedAt(f, 'c5-owner-b', f.b.now + 2 * DAY);
  expect((await queue.today(aLater)).heard).toBe(8);
  const data = createMyDataStore(f.options);
  await data.deleteScene({ ...f.a, ...mine.pointer });
  const afterOne = await queue.today(aLater);
  expect(afterOne.items.map(item => item.course.id)).toEqual([other.task.id]);
  // "Heard" only grows: deleting one scene does not take sentences away from it.
  expect(afterOne.heard).toBe(8);
  await data.deleteAll({ ...f.a, now: f.a.now + HOUR });
  const afterAll = await queue.today(aLater);
  expect(afterAll).toEqual({ items: [], limit: 5, heard: 0, resetAt: f.a.now + HOUR });
  const theirsToday = await queue.today(bLater);
  expect(theirsToday.items.map(item => item.course.id)).toEqual([theirs.task.id]);
  expect(theirsToday.heard).toBe(4);
  expect(theirsToday.resetAt).toBeNull();
});

// ---- C13-2: heard N sentences and continue where you stopped ----

test('C13-2 / F15.1: "heard" counts each sentence once, survives a new store and days away, and never goes down when listening stops', async () => {
  const { open, store, a, b, ownerA, allow } = await setup();
  const course = courseOf('c13-heard'); allow(ownerA, course);
  expect(await store.listen({ ...at(a, now), course: pointerOf(course), heard: ['c13-heard-l0', 'c13-heard-l1'], learned: [] })).toEqual({ heard: 2 });
  expect(await store.listen({ ...at(a, now + 1), course: pointerOf(course), heard: ['c13-heard-l1', 'c13-heard-l2'], learned: [] })).toEqual({ heard: 3 });
  // Interrupted for a month, with a new store instance: the number is still there.
  const later = open();
  expect((await later.today(at(a, now + 30 * DAY))).heard).toBe(3);
  expect((await later.today(at(b, now + 30 * DAY))).heard).toBe(0);
  await expect(store.listen({ ...at(a, now), course: pointerOf(course), heard: ['absent'], learned: [] })).rejects.toThrow(/^Invalid /);
  // Listening alone does not add to the queue; "learned" does.
  expect((await later.today(at(a, now + 2 * DAY))).items).toEqual([]);
  await later.listen({ ...at(a, now), course: pointerOf(course), heard: [], learned: ['c13-heard-l5'] });
  const today = await later.today(at(a, now + 2 * DAY));
  expect(today.items.map(item => item.lineId)).toEqual(['c13-heard-l5']);
  expect(today.heard).toBe(4);
});

test('C13-2: the latest learning position across courses becomes "continue": page and sentence or turn number', async () => {
  const f = await dataFixture();
  const { lastPlace } = await import('../../lib/review-queue.ts');
  const course = courseOf('c13-place');
  expect(lastPlace(course, { page: 'sentences', time: 4.2, turnIndex: 0 })).toEqual({ page: 'sentences', index: 3 });
  expect(lastPlace(course, { page: 'sentences', time: 0, turnIndex: 0 })).toEqual({ page: 'sentences', index: 1 });
  expect(lastPlace(course, { page: 'prompt', time: 9, turnIndex: 1 })).toEqual({ page: 'prompt', index: 2 });
  expect(lastPlace(course, { page: 'practice', time: 9, turnIndex: 4 })).toEqual({ page: 'practice', index: 5 });
  for (const page of ['watch', 'role', 'terms']) expect(lastPlace(course, { page, time: 3, turnIndex: 0 })).toEqual({ page, index: null });
  const first = await f.generated(f.a, '我想在酒店办理入住，确认预订。', 100_000);
  const second = await f.generated(f.a, '我想在诊所改约时间。', 100_000);
  await f.progress.save({ ...f.a, now: f.a.now + 1 * HOUR, course: first.course, expectedVersion: 1, position: { page: 'prompt', time: 1, turnIndex: 0 } });
  const latest = await f.progress.mostRecent({ ...f.a, now: f.a.now + 2 * HOUR });
  expect(latest).toMatchObject({ course: { id: first.task.id, revision: first.task.revision }, position: { page: 'prompt', time: 1, turnIndex: 0 } });
  await f.progress.save({ ...f.a, now: f.a.now + 3 * HOUR, course: second.course, expectedVersion: 1, position: { page: 'sentences', time: 2, turnIndex: 0 } });
  expect((await f.progress.mostRecent({ ...f.a, now: f.a.now + 4 * HOUR })).course.id).toBe(second.task.id);
  expect(await f.progress.mostRecent({ ...f.b, now: f.b.now })).toBeNull();
  await f.progress.removeAll(f.a);
  expect(await f.progress.mostRecent({ ...f.a, now: f.a.now + 5 * HOUR })).toBeNull();
});

// ---- C13-1 HTTP ----

const request = (method, body, { headers = { origin }, cookie = 'synthetic-opaque-cookie', path = '/api/review-queue' } = {}) => new Request(origin + path, {
  method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie: `${GOOGLE_SESSION_COOKIE}=${cookie}` } : {}), ...headers }, ...(method === 'GET' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
const fakeQueue = () => {
  const calls = [];
  const record = name => async input => { calls.push({ name, input }); return name === 'today' ? { items: [], limit: 5, heard: 128, resetAt: null } : name === 'listen' ? { heard: 129 } : name === 'rate' ? { done: false, dueAt: now + DAY } : { limit: input.limit }; };
  return { calls, queue: { today: record('today'), listen: record('listen'), rate: record('rate'), setLimit: record('setLimit') } };
};

test('C13-1 HTTP: GET /api/review-queue returns today\'s sentences, the limit, "heard" and "continue" for the cookie owner, privately', async () => {
  const { handleReviewQueue } = await import('../../app/api/review-queue/route.ts');
  const { calls, queue } = fakeQueue();
  const last = { course: { id: 'c13-x', revision: 2, materialsRevision: 3 }, page: 'sentences', index: 3 };
  const response = await handleReviewQueue(request('GET'), { queue, now, last: async () => last });
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(await response.json()).toEqual({ items: [], limit: 5, heard: 128, resetAt: null, last });
  expect(calls).toEqual([{ name: 'today', input: { cookie: 'synthetic-opaque-cookie', now } }]);
  expect((await handleReviewQueue(new Request(origin + '/api/review-queue?owner=other', { headers: { cookie: `${GOOGLE_SESSION_COOKIE}=x` } }), { queue, now })).status).toBe(400);
  // Without a "continue" reader, or when it fails, the queue itself still answers.
  expect((await (await handleReviewQueue(request('GET'), { queue, now })).json()).last).toBeNull();
  expect((await (await handleReviewQueue(request('GET'), { queue, now, last: async () => { throw new Error('SQLITE_BUSY'); } })).json()).last).toBeNull();
});

test('C13-1 HTTP: POST takes listen, rate and limit actions with exact fields, same origin only, at most 2 KB', async () => {
  const { handleReviewQueue } = await import('../../app/api/review-queue/route.ts');
  const course = { id: 'c13-x', revision: 2, materialsRevision: 3 };
  const bodies = { listen: { action: 'listen', course, heard: ['a'], learned: ['b'] }, rate: { action: 'rate', course, lineId: 'a', rating: 'clear' }, limit: { action: 'limit', limit: 3 } };
  const { calls, queue } = fakeQueue();
  expect(await (await handleReviewQueue(request('POST', bodies.listen), { queue, now })).json()).toEqual({ heard: 129 });
  expect(await (await handleReviewQueue(request('POST', bodies.rate), { queue, now })).json()).toEqual({ done: false, dueAt: now + DAY });
  expect(await (await handleReviewQueue(request('POST', bodies.limit), { queue, now })).json()).toEqual({ limit: 3 });
  expect(calls).toEqual([
    { name: 'listen', input: { cookie: 'synthetic-opaque-cookie', now, course, heard: ['a'], learned: ['b'] } },
    { name: 'rate', input: { cookie: 'synthetic-opaque-cookie', now, course, lineId: 'a', rating: 'clear' } },
    { name: 'setLimit', input: { cookie: 'synthetic-opaque-cookie', now, limit: 3 } },
  ]);
  const blocked = fakeQueue();
  expect((await handleReviewQueue(request('POST', bodies.rate, { headers: {} }), { queue: blocked.queue, now })).status).toBe(403);
  expect((await handleReviewQueue(request('POST', bodies.rate, { headers: { origin: 'https://evil.example' } }), { queue: blocked.queue, now })).status).toBe(403);
  expect((await handleReviewQueue(request('POST', { ...bodies.listen, heard: Array.from({ length: 400 }, (_, i) => `line-${i}`) }), { queue: blocked.queue, now })).status).toBe(413);
  for (const body of [{ ...bodies.rate, owner: 'usr_other' }, { action: 'delete', course }, { action: 'rate', course, lineId: 'a' }, '{', [], { ...bodies.limit, overdue: 0 }])
    expect((await handleReviewQueue(request('POST', body), { queue: blocked.queue, now })).status, JSON.stringify(body)).toBe(400);
  expect((await handleReviewQueue(request('PUT', bodies.rate), { queue: blocked.queue, now })).status).toBe(405);
  expect(blocked.calls).toEqual([]);
  const fail = message => ({ ...fakeQueue().queue, rate: async () => { throw new Error(message); } });
  expect((await handleReviewQueue(request('POST', bodies.rate), { queue: fail('Authenticated session required'), now })).status).toBe(401);
  expect((await handleReviewQueue(request('POST', bodies.rate), { queue: fail('Course unavailable'), now })).status).toBe(404);
  expect((await handleReviewQueue(request('POST', bodies.rate), { queue: fail('Review item unavailable'), now })).status).toBe(404);
  expect((await handleReviewQueue(request('POST', bodies.rate), { queue: fail('Invalid review rating'), now })).status).toBe(400);
  const broken = await handleReviewQueue(request('POST', bodies.rate), { queue: fail('SQLITE_BUSY /private/path'), now });
  expect(broken.status).toBe(503);
  expect(JSON.stringify(await broken.json())).not.toContain('/private');
});

test('C13-1 HTTP: saving a practice review and reporting "hard to hear" add sentences to the queue; a queue failure never fails the save', async () => {
  const { handlePracticeReviews } = await import('../../app/api/practice-reviews/route.ts');
  const { handleSentenceReports } = await import('../../app/api/sentence-reports/route.ts');
  const course = { id: 'c13-x', revision: 2, materialsRevision: 3 };
  const added = [];
  const queue = { addReview: async input => { added.push({ kind: 'review', input }); }, add: async input => { added.push({ kind: 'add', input }); } };
  const review = { course, session: 'session-c13-1', turns: [{ turnIndex: 0, outcome: 'needs_help' }], help: { hints: 1, autoHelp: 0, translations: 0, native: 0 } };
  const saved = { review: { ...review, at: now }, previous: null };
  const ok = await handlePracticeReviews(request('POST', review, { path: '/api/practice-reviews' }), { reviews: { save: async () => saved }, now, queue });
  expect(ok.status).toBe(201);
  expect(added).toEqual([{ kind: 'review', input: { cookie: 'synthetic-opaque-cookie', now, course, turns: review.turns } }]);
  const reports = { list: async () => [], report: async input => ({ lineId: input.lineId, reason: input.reason, note: '', status: 'received', at: now }) };
  for (const reason of ['unclear', 'not_local', 'wrong_meaning']) expect((await handleSentenceReports(request('POST', { course, lineId: 'line-1', reason }, { path: '/api/sentence-reports' }), { reports, now, queue })).status).toBe(201);
  expect(added.slice(1)).toEqual([{ kind: 'add', input: { cookie: 'synthetic-opaque-cookie', now, course, lineIds: ['line-1'], source: 'report' } }]);
  const failing = { addReview: async () => { throw new Error('SQLITE_BUSY'); }, add: async () => { throw new Error('SQLITE_BUSY'); } };
  expect((await handlePracticeReviews(request('POST', review, { path: '/api/practice-reviews' }), { reviews: { save: async () => saved }, now, queue: failing })).status).toBe(201);
  expect((await handleSentenceReports(request('POST', { course, lineId: 'line-1', reason: 'unclear' }, { path: '/api/sentence-reports' }), { reports, now, queue: failing })).status).toBe(201);
});

test('C13-1 / K6.2: the queue store uses only the course reader; no network, no generation, no model', async () => {
  const { store, a, ownerA, allow, reads } = await setup();
  const fetches = []; const original = globalThis.fetch; globalThis.fetch = async (...args) => { fetches.push(args); throw new Error('no network in C13'); };
  try {
    const course = courseOf('c13-offline'); allow(ownerA, course);
    await store.listen({ ...at(a, now), course: pointerOf(course), heard: ['c13-offline-l0'], learned: ['c13-offline-l0'] });
    const today = await store.today(at(a, now + 2 * DAY));
    // The sentence comes from the course's own line and timing: its original audio is a slice of the course video.
    expect(today.items).toEqual([{ course: pointerOf(course), lineId: 'c13-offline-l0', text: course.lines[0].text, translations: course.lines[0].translations, start: 0, end: 1.5, plainAlternative: 'Can I help you?' }]);
    await store.rate({ ...at(a, now + 2 * DAY), course: pointerOf(course), lineId: 'c13-offline-l0', rating: 'hint' });
  } finally { globalThis.fetch = original; }
  expect(fetches).toEqual([]);
  expect(reads.every(read => read.id === 'c13-offline')).toBe(true);
});

test('C13-1, C13-2: the new five-language words never say overdue, score, percent, streak or mastered', async () => {
  const { c13Copy } = await import('../../app/c13-copy.ts');
  const banned = /逾期|分数|得分|%|掌握|连续|打卡|streak|overdue|score|terlambat|skor|persen|期限切れ|点数|連続|연체|점수|연속|बकाया|अंक|प्रतिशत|लगातार/i;
  for (const language of languages) {
    const copy = c13Copy[language];
    const text = JSON.stringify(copy, (_key, value) => typeof value === 'function' ? value(3, 'X') : value);
    expect(text, language).not.toMatch(banned);
    expect(copy.heard(128), language).toContain('128');
    expect(copy.reviewEntry(5), language).toContain('5');
    for (const key of ['missed', 'hint', 'clear', 'reviewTitle', 'continueLast', 'heardReset', 'doneTitle', 'guessAsk', 'guessSkip', 'alsoSay', 'plain', 'localNote']) expect(copy[key], `${language} ${key}`).toBeTruthy();
    expect(copy.guessOptions, language).toHaveLength(3);
  }
  // The review page itself (title, ratings, help, done) must not contain the Chinese character for points either.
  const zh = c13Copy['zh-Hans'];
  for (const value of [zh.reviewTitle, zh.missed, zh.hint, zh.clear, zh.doneTitle, zh.doneNote, zh.plain, zh.saveFailed, zh.back, zh.heard(0), zh.heardReset, zh.reviewEntry(5), zh.continueLast]) expect(value).not.toContain('分');
});

// ---- C13-3: local register and "you could also say" in the script contract ----

const annotated = () => structuredClone(scriptOutputs.find(item => item.name === 'valid drink order with local register and "you could also say"').script);

test('C13-3: the c7 regression set now carries an annotated script and the three new counterexamples', () => {
  const names = scriptOutputs.map(item => item.name);
  expect(names).toContain('valid drink order with local register and "you could also say"');
  const issues = new Set(scriptOutputs.filter(item => item.expect === 'reject').map(item => item.issue));
  for (const kind of ['learner-colloquial', 'plain-alternative', 'alternative']) expect(issues.has(kind), kind).toBe(true);
});

test('C13-3 / F4.2: the validator rejects a colloquial learner model line, a colloquial item without a plain alternative, and non-English or untranslated alternatives', async () => {
  const { validateGeneratedScript } = await import('../../lib/generated-script.ts');
  expect(validateGeneratedScript(annotated())).toEqual({ ok: true, value: annotated() });
  const rejects = (edit, issue) => { const value = annotated(); edit(value); const result = validateGeneratedScript(value); expect(result.ok, issue).toBe(false); expect(result.issues, issue).toContain(issue); };
  rejects(value => { const line = value.lines.find(item => item.role === 'learner'); line.text = line.text.replace(/\.$/, ' lah.'); }, 'learner-colloquial');
  rejects(value => { const line = value.lines.find(item => item.role === 'learner'); Object.assign(line, { register: 'sg-colloquial', useAdvice: 'hear-only', plainAlternative: 'Yes, please.' }); }, 'learner-colloquial');
  rejects(value => { const phrase = value.phrases.find(item => item.register === 'sg-colloquial'); phrase.lineId = value.lines.find(item => item.role === 'learner').id; phrase.text = value.lines.find(item => item.id === phrase.lineId).text.split(' ').slice(0, 2).join(' '); }, 'learner-colloquial');
  rejects(value => { delete value.phrases.find(item => item.register === 'sg-colloquial').plainAlternative; }, 'plain-alternative');
  rejects(value => { value.lines.find(item => item.register === 'sg-colloquial').plainAlternative = '  '; }, 'plain-alternative');
  rejects(value => { value.phrases[0].register = 'singlish'; }, 'register');
  rejects(value => { value.phrases[0].useAdvice = 'avoid'; }, 'register');
  rejects(value => { value.turns[0].alternatives[0].text = '一杯咖啡，谢谢。'; }, 'alternative');
  rejects(value => { delete value.turns[0].alternatives[1].translations.hi; }, 'alternative');
  rejects(value => { value.turns[0].alternatives = value.turns[0].alternatives.slice(0, 1); }, 'alternative');
  rejects(value => { value.turns[0].alternatives.push({ text: 'A kopi for me.', translations: tr('a') }, { text: 'Kopi, thanks.', translations: tr('b') }); }, 'alternative');
  rejects(value => { value.turns[1].alternatives[0].text = 'Hot one lah.'; }, 'learner-colloquial');
  // Entry lessons keep local colloquial items rare: at most two.
  rejects(value => {
    const colloquial = (id, text, lineId) => ({ id, text, lineId, translations: tr(text), register: 'sg-colloquial', useAdvice: 'hear-only', plainAlternative: 'Okay.' });
    value.phrases.push(colloquial('ph-extra-1', 'cold drinks', 'p1'), colloquial('ph-extra-2', 'hot kopi', 'p5'), colloquial('ph-extra-3', 'iced today', 'p2'));
  }, 'colloquial-count');
});

test('C13-3: older scripts and courses without the new fields stay valid, and the fields survive the course builder and a materials revision', async () => {
  const { validateGeneratedScript } = await import('../../lib/generated-script.ts');
  const { validateSceneCourse } = await import('../../lib/scene-course.ts');
  for (const item of scriptOutputs.filter(entry => entry.expect === 'accept')) expect(validateGeneratedScript(structuredClone(item.script)).ok, item.name).toBe(true);
  const hotel = JSON.parse(await readFile(new URL('../../public/media/hotel-course.json', import.meta.url), 'utf8'));
  expect(validateSceneCourse(hotel).ok).toBe(true);
  const { buildGeneratedCourse, buildRevisedLearningCourse } = await import('../../lib/generated-course.ts');
  const script = annotated();
  const task = { id: 'c13-task', revision: 1, status: 'video_assembled', simulation: false, script,
    finalVideo: { assetId: 'final', sha256: 'b'.repeat(64), size: 1000, decoded: true, duration: 50, width: 720, height: 1280, fps: 24, videoCodec: 'h264', audioCodec: 'aac' },
    videoTimeline: { duration: 50, lines: script.lines.map((line, i) => ({ lineId: line.id, start: i * 5, end: i * 5 + 4 })) } };
  const course = buildGeneratedCourse(task);
  const colloquial = script.lines.find(line => line.register === 'sg-colloquial');
  expect(course.lines.find(line => line.id === colloquial.id)).toMatchObject({ register: 'sg-colloquial', useAdvice: colloquial.useAdvice, plainAlternative: colloquial.plainAlternative });
  expect(course.phrases).toEqual(script.phrases);
  expect(course.turns).toEqual(script.turns);
  const revised = buildRevisedLearningCourse(task, { courseId: 'c13-task', sourceRevision: 1, mediaSha256: 'b'.repeat(64), materialsRevision: 2, lineTranslations: script.lines.map(line => ({ lineId: line.id, translations: tr(`revised ${line.id}`) })), phrases: script.phrases.map(({ register, useAdvice, plainAlternative, ...phrase }) => phrase) });
  expect(revised.lines.find(line => line.id === colloquial.id)).toMatchObject({ register: 'sg-colloquial', plainAlternative: colloquial.plainAlternative, translations: tr(`revised ${colloquial.id}`) });
  expect(revised.turns[0].alternatives).toEqual(script.turns[0].alternatives);
});

test('C13-3 / F4.2: the script request asks for register, use advice, plain alternatives and 2-3 "you could also say" per turn, colloquial only from the partner', async () => {
  const { generateSceneScript } = await import('../../lib/generated-script.ts');
  let body;
  const response = value => ({ id: 'resp_c13', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
  const result = await generateSceneScript({ goal: 'synthetic kopi order' }, { enabled: true, apiKey: 'synthetic-only', fetch: async (_url, options) => { body = options.body; return Response.json(response(annotated())); } });
  expect(result.script).toEqual(annotated());
  expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(20_000);
  const parsed = JSON.parse(body), system = parsed.input.find(item => item.role === 'system').content, schema = parsed.text.format.schema;
  expect(system).toMatch(/at most (two|2) sg-colloquial/i);
  expect(system).toMatch(/only in partner lines/i);
  expect(system).toMatch(/learner lines? (use|are) (only )?standard or sg-standard/i);
  expect(system).toMatch(/plainAlternative/);
  expect(system).toMatch(/2 to 3 alternatives/i);
  const line = schema.properties.lines.items, phrase = schema.properties.phrases.items, turn = schema.properties.turns.items;
  for (const item of [line, phrase]) {
    expect(item.properties.register.enum).toEqual(['standard', 'sg-standard', 'sg-colloquial']);
    expect(item.properties.useAdvice.enum).toEqual(['say', 'casual-ok', 'hear-only']);
    expect(item.properties.plainAlternative).toBeTruthy();
  }
  expect(turn.properties.alternatives.minItems).toBe(2);
  expect(turn.properties.alternatives.maxItems).toBe(3);
  // A model that writes null for plainAlternative on a standard item is still accepted.
  const withNull = annotated(); for (const item of [...withNull.lines, ...withNull.phrases]) if (item.register !== 'sg-colloquial') item.plainAlternative = null;
  const checked = (await import('../../lib/generated-script.ts')).validateGeneratedScript(withNull);
  expect(checked.ok).toBe(true);
});

test('C13-3 / §6.5: local labels in all five languages never say wrong, incorrect or non-standard', async () => {
  const { c13Copy, localTag } = await import('../../app/c13-copy.ts');
  const banned = /错误|错的|不标准|不正确|不规范|salah|tidak baku|tidak standar|間違|正しくない|標準的でない|틀린|틀렸|비표준|잘못|गलत|ग़लत|अशुद्ध|अमानक/i;
  for (const language of languages) {
    const copy = c13Copy[language];
    const tags = [localTag(language, { register: 'sg-standard', useAdvice: 'say' }), localTag(language, { register: 'sg-colloquial', useAdvice: 'hear-only' }), localTag(language, { register: 'sg-colloquial', useAdvice: 'casual-ok' })];
    for (const text of [...tags, copy.localNote, copy.plain, copy.alsoSay]) { expect(text, language).toBeTruthy(); expect(text, language).not.toMatch(banned); }
    expect(new Set(tags).size, language).toBe(3);
    expect(localTag(language, { register: 'standard', useAdvice: 'say' }), language).toBeNull();
    expect(localTag(language, {}), language).toBeNull();
    expect(copy.localNote, language).not.toMatch(/本地审查过|local-reviewed/);
  }
  expect(localTag('zh-Hans', { register: 'sg-colloquial', useAdvice: 'hear-only' })).toBe('本地口语 · 听懂就好');
  expect(localTag('zh-Hans', { register: 'sg-standard', useAdvice: 'say' })).toBe('新加坡常用词');
  expect(c13Copy['zh-Hans'].localNote).toContain('尚未经本地审核');
});

// ---- C13-4: seed scene cards, the local expression library and the review table ----

const statuses = ['unreviewed', 'ai-checked', 'local-reviewed'];
const english = text => typeof text === 'string' && /[a-z]/i.test(text) && !/[\p{Script=Han}\p{Script=Hangul}\p{Script=Devanagari}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);

test('C13-4 / F4.4: every one of the 36 seeds is a scene card: 3-5 steps, a register, 3-6 key chunks, one small surprise and its own review record', async () => {
  const { sceneSeeds, sceneSeedsReviewed, sceneSeedReview } = await import('../../lib/scene-seeds.ts');
  expect(sceneSeeds).toHaveLength(36);
  for (const seed of sceneSeeds) {
    const card = seed.card;
    expect(card, seed.id).toBeTruthy();
    expect(card.flow.length, seed.id).toBeGreaterThanOrEqual(3); expect(card.flow.length, seed.id).toBeLessThanOrEqual(5);
    for (const step of card.flow) expect(english(step) && step.trim().length > 5, `${seed.id} ${step}`).toBe(true);
    expect(['standard', 'sg-standard', 'sg-colloquial'], seed.id).toContain(card.register);
    expect(card.chunks.length, seed.id).toBeGreaterThanOrEqual(3); expect(card.chunks.length, seed.id).toBeLessThanOrEqual(6);
    for (const chunk of card.chunks) expect(english(chunk), `${seed.id} ${chunk}`).toBe(true);
    expect(new Set(card.chunks.map(chunk => chunk.toLowerCase())).size, seed.id).toBe(card.chunks.length);
    expect(english(card.twist) && card.twist.length > 10, seed.id).toBe(true);
    const review = sceneSeedReview(seed.id);
    expect(statuses, seed.id).toContain(review.status);
    if (review.status === 'local-reviewed') { expect(review.reviewer, seed.id).toBeTruthy(); expect(review.date, seed.id).toMatch(/^\d{4}-\d{2}-\d{2}$/); }
  }
  // The old global flag stays for the C7 tests and is true only when every seed is locally reviewed.
  expect(sceneSeedsReviewed).toBe(sceneSeeds.every(seed => sceneSeedReview(seed.id).status === 'local-reviewed'));
  expect(sceneSeedsReviewed).toBe(false);
});

test('C13-4 / F12.2: the local expression library has about 60 complete entries, each with its own review state; colloquial ones have a plain alternative', async () => {
  const library = JSON.parse(await readFile(new URL('../../content/local-expressions.json', import.meta.url), 'utf8'));
  const entries = library.expressions;
  expect(entries.length).toBeGreaterThanOrEqual(55); expect(entries.length).toBeLessThanOrEqual(80);
  const ids = new Set();
  for (const entry of entries) {
    expect(Object.keys(entry).sort(), entry.id).toEqual(['category', 'id', 'meaning', 'plainAlternative', 'register', 'review', 'situation', 'text', 'useAdvice'].sort());
    expect(entry.id, entry.id).toMatch(/^[a-z0-9-]{2,60}$/); expect(ids.has(entry.id), entry.id).toBe(false); ids.add(entry.id);
    expect(english(entry.text), entry.id).toBe(true);
    for (const language of languages) expect(typeof entry.meaning[language] === 'string' && entry.meaning[language].trim().length > 0, `${entry.id} ${language}`).toBe(true);
    expect(Object.keys(entry.meaning).sort(), entry.id).toEqual([...languages].sort());
    expect(['standard', 'sg-standard', 'sg-colloquial'], entry.id).toContain(entry.register);
    expect(['say', 'casual-ok', 'hear-only'], entry.id).toContain(entry.useAdvice);
    expect(['school', 'work', 'clinic', 'transport', 'home', 'food', 'general'], entry.id).toContain(entry.category);
    expect(typeof entry.situation === 'string' && entry.situation.length > 3, entry.id).toBe(true);
    if (entry.register === 'sg-colloquial') expect(english(entry.plainAlternative), entry.id).toBe(true);
    else expect(entry.plainAlternative === null || english(entry.plainAlternative), entry.id).toBe(true);
    expect(Object.keys(entry.review).sort(), entry.id).toEqual(['date', 'notes', 'reviewer', 'status']);
    expect(statuses, entry.id).toContain(entry.review.status);
    // Written from the research report, not yet seen by a local reviewer.
    expect(entry.review.status, entry.id).not.toBe('local-reviewed');
  }
  for (const category of ['school', 'work', 'clinic', 'transport', 'home', 'food']) expect(entries.filter(entry => entry.category === category).length, category).toBeGreaterThanOrEqual(5);
  expect(entries.filter(entry => entry.register === 'sg-colloquial').length).toBeGreaterThanOrEqual(15);
  // The help-seeking questions are things to say, not only to hear.
  for (const text of ['Sorry, can you say that again slowly?', 'What does ___ mean?', 'Can you show me?']) expect(entries.find(entry => entry.text === text)?.useAdvice, text).toBe('say');
});

test('C13-4 / F12.3: the review table goes out as CSV and comes back in unchanged; a reviewer\'s marks come back into the records', async () => {
  const { exportReviewTable, parseReviewTable, applyReviewTable, reportRows } = await import('../../scripts/review-table.mjs');
  const library = JSON.parse(await readFile(new URL('../../content/local-expressions.json', import.meta.url), 'utf8'));
  const cards = JSON.parse(await readFile(new URL('../../content/scene-seed-cards.json', import.meta.url), 'utf8'));
  const { sceneSeeds } = await import('../../lib/scene-seeds.ts');
  const labels = Object.fromEntries(sceneSeeds.map(seed => [seed.id, Object.fromEntries(languages.map(language => [language, seed.text[language].label]))]));
  const csv = exportReviewTable({ expressions: library.expressions, cards: cards.cards, labels });
  expect(csv.split('\n')[0]).toBe('kind,id,english,zh-Hans,id-ID,ja,ko,hi,register,useAdvice,plainAlternative,status,reviewer,date,notes');
  const rows = parseReviewTable(csv);
  expect(rows).toHaveLength(library.expressions.length + Object.keys(cards.cards).length);
  const back = applyReviewTable({ expressions: library.expressions, cards: cards.cards }, rows);
  expect(back).toEqual({ expressions: library.expressions, cards: cards.cards });
  expect(exportReviewTable({ expressions: back.expressions, cards: back.cards, labels })).toBe(csv);
  // Commas, quotes and line breaks in notes survive; only review fields are taken back from the reviewer.
  const marked = rows.map(row => row.id === library.expressions[0].id ? { ...row, status: 'local-reviewed', reviewer: 'Reviewer A, SG', date: '2026-11-02', notes: 'Fine "as is",\nkeep.', english: 'changed by mistake' } : row);
  const { serializeRows } = await import('../../scripts/review-table.mjs');
  expect(parseReviewTable(serializeRows(marked))).toEqual(marked);
  const applied = applyReviewTable({ expressions: library.expressions, cards: cards.cards }, parseReviewTable(serializeRows(marked)));
  expect(applied.expressions[0].review).toEqual({ status: 'local-reviewed', reviewer: 'Reviewer A, SG', date: '2026-11-02', notes: 'Fine "as is",\nkeep.' });
  expect(applied.expressions[0].text).toBe(library.expressions[0].text);
  // "local-reviewed" needs a reviewer and a date; an unknown status is refused.
  expect(() => applyReviewTable({ expressions: library.expressions, cards: cards.cards }, parseReviewTable(serializeRows(marked.map(row => row.id === library.expressions[0].id ? { ...row, reviewer: '' } : row))))).toThrow(/reviewer/);
  expect(() => applyReviewTable({ expressions: library.expressions, cards: cards.cards }, parseReviewTable(serializeRows(marked.map(row => row.id === library.expressions[0].id ? { ...row, status: 'approved' } : row))))).toThrow(/status/);
  // C9-5 "not local" reports can be added to the table, grouped by sentence, without any account information.
  const extra = reportRows([{ text: 'Can or not?', reason: 'not_local', owner: 'usr_a' }, { text: 'Can or not?', reason: 'not_local', owner: 'usr_b' }, { text: 'Hello.', reason: 'unclear', owner: 'usr_a' }]);
  expect(extra).toEqual([expect.objectContaining({ kind: 'report', english: 'Can or not?', status: 'unreviewed', notes: expect.stringContaining('2') })]);
  expect(JSON.stringify(extra)).not.toContain('usr_');
});

test('C13-4: only local-reviewed records may say "reviewed locally"; the rest keep "not yet locally reviewed"', async () => {
  const { reviewNote } = await import('../../app/c13-copy.ts');
  for (const language of languages) {
    expect(reviewNote(language, 'local-reviewed'), language).not.toBe(reviewNote(language, 'unreviewed'));
    expect(reviewNote(language, 'ai-checked'), language).toBe(reviewNote(language, 'unreviewed'));
  }
  expect(reviewNote('zh-Hans', 'unreviewed')).toContain('尚未经本地审核');
  expect(reviewNote('zh-Hans', 'ai-checked')).toContain('尚未经本地审核');
  expect(reviewNote('zh-Hans', 'local-reviewed')).toBe('本地审查过');
  const { sceneSeedCopy } = await import('../../app/scene-seed-copy.ts');
  expect(sceneSeedCopy['zh-Hans'].note).toContain('尚未经本地审核');
});

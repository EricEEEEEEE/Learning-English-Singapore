import { test, expect } from '@playwright/test';
import { createPrivateSceneStore } from '../../lib/private-scene-store.ts';
import { handlePrivateDemo } from '../../app/api/private-demo/route.ts';
import { sealGoogleSession, GOOGLE_SESSION_COOKIE } from '../../lib/google-auth.ts';

const secret = 'synthetic-t49-session-secret-at-least-32-characters';
const epoch = Date.UTC(2030, 0, 1);
function lesson(suffix = 'a') {
  return {
    schema: 1, source: 'simulation', eligible_for_assessment: false,
    lesson_revision: `lesson-${suffix}`, scenario_version_id: `scenario-${suffix}`, goal_revision: 1,
    user_goal: `Ask for help with task ${suffix}.`, content_band: 'L0', auxiliary_language: 'zh-Hans',
    roles: [{ id: 'helper', label: 'Helper' }, { id: 'learner', label: 'Learner' }],
    sentences: [
      { id: 'one', role_id: 'helper', language: 'en', text: 'How can I help?', action: 'greets', grounding: 'generic', source_refs: ['template:greeting'] },
      { id: 'two', role_id: 'learner', language: 'en', text: 'Please speak slowly.', action: 'asks', grounding: 'generic', source_refs: ['template:repair'] },
    ], unknown_facts: ['Local requirements are unknown.'],
  };
}
async function setup() {
  const store = createPrivateSceneStore({ sessionSecret: secret });
  const signed = subject => sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: subject, email: 'synthetic@example.test' }, secret, epoch);
  const a = await signed('synthetic-a');
  const b = await signed('synthetic-b');
  let clock = epoch + 1;
  const call = (method, cookie, body, query = '') => handlePrivateDemo(new Request(`http://localhost/api/private-demo${query}`, {
    method, headers: { ...(cookie ? { cookie: `${GOOGLE_SESSION_COOKIE}=${cookie}` } : {}), 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), { store, now: clock });
  async function create(cookie = a, suffix = 'a') {
    const response = await call('POST', cookie, { goalRevision: 1, playbackPositionMs: 0, lesson: lesson(suffix), learnerRole: 'learner' });
    expect(response.status).toBe(201);
    const { record } = await response.json();
    expect(record.lesson).toMatchObject({ lesson_revision: `lesson-${suffix}`, source: 'simulation', eligible_for_assessment: false });
    return record;
  }
  return { store, a, b, call, create, expire: () => { clock = epoch + 8 * 60 * 60_000; } };
}

test('T49: two signed synthetic identities restore distinct fixed lessons, listening positions and modes', async () => {
  const { a, b, call, create } = await setup();
  const first = await create(a, 'a');
  const second = await create(b, 'b');
  expect(first.lessonProgress).toEqual({ lesson_revision: 'lesson-a', sentence_id: 'one', mode: 'listen', learner_role_id: 'learner' });
  const update = await call('PATCH', a, { id: first.id, playbackPositionMs: 1234, lessonProgress: { ...first.lessonProgress, sentence_id: 'two', mode: 'practice' } });
  expect(update.status).toBe(200);
  const resumed = await (await call('GET', a, undefined, `?id=${first.id}`)).json();
  expect(resumed.record).toMatchObject({ playbackPositionMs: 1234, lesson: lesson('a'), lessonProgress: { lesson_revision: 'lesson-a', sentence_id: 'two', mode: 'practice' } });
  expect((await (await call('GET', b)).json()).records).toEqual([second]);
  expect((await call('GET', b, undefined, `?id=${first.id}`)).status).toBe(404);
  expect(JSON.stringify(resumed)).not.toMatch(/ownerId|synthetic@example/);
});

test('T49: forged owner and a matching revision never authorize another account to read, update or delete', async () => {
  const { a, b, call, create } = await setup();
  const first = await create();
  const before = await (await call('GET', a, undefined, `?id=${first.id}`)).json();
  for (const method of ['PATCH', 'DELETE']) {
    expect((await call(method, b, { id: first.id, ownerId: 'synthetic-a', lesson_revision: 'lesson-a', lessonProgress: first.lessonProgress, action: 'delete' })).status).toBe(404);
  }
  const forged = await call('POST', b, { ownerId: 'synthetic-a', goalRevision: 1, playbackPositionMs: 0, lesson: lesson('b'), learnerRole: 'learner' });
  expect(forged.status).toBe(201);
  const other = (await forged.json()).record;
  expect((await call('GET', a, undefined, `?id=${other.id}`)).status).toBe(404);
  expect(await (await call('GET', a, undefined, `?id=${first.id}`)).json()).toEqual(before);
});

test('T49: wrong revision, unknown sentence, invalid mode and changed fixed material reject atomically', async () => {
  const { a, call, create } = await setup();
  const first = await create();
  const before = await (await call('GET', a, undefined, `?id=${first.id}`)).json();
  for (const patch of [
    { lessonProgress: { ...first.lessonProgress, lesson_revision: 'lesson-b' } },
    { lessonProgress: { ...first.lessonProgress, sentence_id: 'missing' } },
    { lessonProgress: { ...first.lessonProgress, mode: 'invented' } },
    { lessonProgress: { ...first.lessonProgress, learner_role_id: 'intruder' } },
    { lesson: lesson('b') }, { goalRevision: 2 },
  ]) {
    expect((await call('PATCH', a, { id: first.id, playbackPositionMs: 999, ...patch })).status).toBe(400);
    expect(await (await call('GET', a, undefined, `?id=${first.id}`)).json()).toEqual(before);
  }
});

test('T49: expired, missing and tampered cookies cannot restore or mutate lessons even with a forged old now', async () => {
  const { a, call, create, expire } = await setup();
  const first = await create();
  expire();
  for (const cookie of [a, null, `${a}tampered`]) {
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
      const response = await call(method, cookie, method === 'GET' ? undefined : { id: first.id, now: epoch, ownerId: 'synthetic-a', goalRevision: 1, playbackPositionMs: 0, lesson: lesson(), learnerRole: 'learner' }, `?id=${first.id}&now=${epoch}`);
      expect(response.status).toBe(401);
      expect(JSON.stringify(await response.json())).not.toContain('lesson-a');
    }
  }
});

test('T49: revocation and deletion remove lesson recovery and stale updates cannot recreate it', async () => {
  const { a, call, create } = await setup();
  for (const action of ['revoke', 'delete']) {
    const first = await create(a, action);
    expect((await call('DELETE', a, { id: first.id, action })).status).toBe(204);
    expect((await call('GET', a, undefined, `?id=${first.id}`)).status).toBe(404);
    expect((await call('PATCH', a, { id: first.id, lessonProgress: first.lessonProgress })).status).toBe(404);
    expect((await (await call('GET', a)).json()).records).toEqual([]);
  }
});

test('T49: invalid course contracts, roles and mismatched goal revisions create no partial records', async () => {
  const { a, call } = await setup();
  for (const fields of [
    { lesson: { ...lesson(), source: 'openai' } },
    { lesson: { ...lesson(), sentences: [] } },
    { learnerRole: 'intruder' }, { goalRevision: 2 },
  ]) {
    const response = await call('POST', a, { goalRevision: 1, playbackPositionMs: 0, lesson: lesson(), learnerRole: 'learner', ...fields });
    expect(response.status).toBe(400);
    expect((await (await call('GET', a)).json()).records).toEqual([]);
  }
});

test('T49: nested returned lesson data cannot mutate storage and a restarted store contains no records', async () => {
  const { store, a, create } = await setup();
  const first = await create();
  const lookup = { cookie: a, now: epoch + 1, id: first.id };
  const read = await store.get(lookup);
  read.lesson.sentences[0].text = 'Changed outside store';
  read.lessonProgress.mode = 'practice';
  const listed = await store.list(lookup);
  listed[0].lesson.lesson_revision = 'forged';
  const restored = await store.get(lookup);
  expect(restored.lesson).toEqual(lesson());
  expect(restored.lessonProgress.mode).toBe('listen');
  const restarted = createPrivateSceneStore({ sessionSecret: secret });
  expect(restarted.persistence).toBe('memory-only');
  expect(await restarted.get(lookup)).toBeNull();
});

test('T49: T48 listening and practice states survive private storage and resume the same fixed material', async () => {
  const { createFixedLessonSession, applyFixedLessonEvent, restoreFixedLessonSession } = await import('../../lib/fixed-lesson-practice.ts');
  const { a, call, create } = await setup();
  const record = await create();
  let session = applyFixedLessonEvent(createFixedLessonSession(lesson(), 'learner'), { type: 'start-listening' });
  const original = session.current_playback;
  session = applyFixedLessonEvent(session, {
    type: 'playback-ended', playback_id: original.id, sentence_id: original.sentence_id,
    lesson_revision: session.lesson_revision, lesson_fingerprint: session.lesson_fingerprint,
  });
  expect(session.position).toBe(1);
  for (const state of [session, applyFixedLessonEvent(session, { type: 'enter-practice' })]) {
    const progress = { lesson_revision: state.lesson_revision, sentence_id: state.material.sentences[state.position].id, mode: state.mode, learner_role_id: state.learner_role_id };
    expect((await call('PATCH', a, { id: record.id, lessonProgress: progress })).status).toBe(200);
    const saved = (await (await call('GET', a, undefined, `?id=${record.id}`)).json()).record;
    const resumed = restoreFixedLessonSession(saved.lesson, saved.lessonProgress);
    expect(resumed.material).toEqual(state.material);
    expect(resumed.lesson_fingerprint).toBe(state.lesson_fingerprint);
    expect(resumed.partner_role_id).toBe(state.partner_role_id);
    expect(resumed.position).toBe(state.position);
    expect(resumed.mode).toBe(state.mode);
    expect(resumed.current_playback).toBeNull();
    expect(resumed.session_id).not.toBe(state.session_id);
    const playing = applyFixedLessonEvent(resumed, { type: state.mode === 'listen' ? 'start-listening' : 'enter-practice' });
    expect(playing.current_playback.sentence_id).toBe(state.current_playback.sentence_id);
    expect(playing.current_playback.text).toBe(state.current_playback.text);
    expect(applyFixedLessonEvent(playing, {
      type: 'playback-ended', playback_id: state.current_playback.id,
      sentence_id: state.current_playback.sentence_id, lesson_revision: state.lesson_revision,
      lesson_fingerprint: state.lesson_fingerprint,
    })).toEqual(playing);
    expect(() => restoreFixedLessonSession(saved.lesson, { ...progress, lesson_revision: 'forged' })).toThrow();
  }
});

test('T49: exported HTTP routes restore a synthetic course and use server time despite client now', async () => {
  const { POST, GET, DELETE } = await import('../../app/api/private-demo/route.ts');
  const previous = process.env.AUTH_SESSION_SECRET;
  process.env.AUTH_SESSION_SECRET = secret;
  const current = Date.now();
  const identity = { provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 't49-live-synthetic', email: 'synthetic@example.test' };
  const valid = await sealGoogleSession(identity, secret, current);
  const expired = await sealGoogleSession(identity, secret, current - 9 * 60 * 60_000);
  const req = (method, cookie, body, query = '') => new Request(`http://localhost/api/private-demo${query}`, {
    method, headers: { cookie: `${GOOGLE_SESSION_COOKIE}=${cookie}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  try {
    const response = await POST(req('POST', valid, { goalRevision: 1, playbackPositionMs: 0, lesson: lesson('export'), learnerRole: 'learner' }));
    expect(response.status).toBe(201);
    const { record } = await response.json();
    expect(record.lesson).toEqual(lesson('export'));
    const read = await GET(req('GET', valid, undefined, `?id=${record.id}`));
    expect(read.status).toBe(200);
    expect(read.headers.get('cache-control')).toContain('no-store');
    expect((await read.json()).record.lessonProgress.mode).toBe('listen');
    expect((await GET(req('GET', expired, undefined, `?id=${record.id}&now=${current - 9 * 60 * 60_000}`))).status).toBe(401);
    expect((await DELETE(req('DELETE', valid, { id: record.id }))).status).toBe(204);
  } finally {
    if (previous === undefined) delete process.env.AUTH_SESSION_SECRET;
    else process.env.AUTH_SESSION_SECRET = previous;
  }
});

import { test, expect } from '@playwright/test';
import { serviceFixture, pointer, courseKey, position } from '../fixtures/t70-learning-library.mjs';

test('T70 library: lists actual readable generated courses with their exact saved requirement and no private operational fields', async () => {
  const f = await serviceFixture(), result = await f.library.list(f.session);
  expect(result).toEqual({ scenes: [{ course: pointer(f.course), description: f.snapshot.content.description, duration: f.course.media.duration, requirement: f.snapshot, contextSource: 'requirement' }], unavailable: 0 });
  for (const key of ['ownerId', 'providerJobId', 'reservedMicros', 'cookie', 'providerSubject', 'email']) expect(JSON.stringify(result)).not.toContain(`"${key}"`);
  expect(f.state.events.some(([kind]) => kind === 'course')).toBe(true);
  expect(f.state.events.filter(([kind]) => kind === 'progress-save')).toEqual([]);
});

test('T70 library: pending and simulated tasks never become playable library entries', async () => {
  const f = await serviceFixture();
  f.state.rows.push({ ...f.state.rows[0], id: 'pending', status: 'awaiting_budget' }, { ...f.state.rows[0], id: 'simulation', simulation: true });
  const result = await f.library.list(f.session);
  expect(result.scenes.map(scene => scene.course.id)).toEqual([f.course.id]); expect(result.unavailable).toBe(0);
  expect(f.state.events.filter(([kind]) => kind === 'course').map(([, request]) => request.id)).toEqual([f.course.id]);
});

test('T70 library: unreadable completed courses are reported instead of falling back to a public sample or a fake empty library', async () => {
  const f = await serviceFixture(); f.state.rows.push({ ...f.state.rows[0], id: 'missing-media' });
  const result = await f.library.list(f.session); expect(result.scenes).toHaveLength(1); expect(result.unavailable).toBe(1);
  f.state.readFailure = Error('Course media unavailable');
  expect(await f.library.list(f.session)).toEqual({ scenes: [], unavailable: 2 });
});

for (const message of ['Authenticated session required', 'synthetic database read failure']) test(`T70 library: source list ${message} remains a failure rather than an empty library`, async () => {
  const f = await serviceFixture(); f.state.listFailure = Error(message);
  await expect(f.library.list(f.session)).rejects.toThrow(message);
  expect(f.state.events.map(([kind]) => kind)).toEqual(['list']);
});

test('T70 library: an inaccessible stored material version is not silently replaced by a newer version', async () => {
  const f = await serviceFixture();
  await f.progress.save({ ...f.session, course: f.course, expectedVersion: 0, position });
  f.state.rows[0].materialsRevision = 4;
  f.state.courses[courseKey({ ...f.course, materialsRevision: 4 })] = { ...f.course, materialsRevision: 4 };
  const result = await f.library.list(f.session); expect(result.scenes[0].course.materialsRevision).toBe(3);
  delete f.state.courses[courseKey(f.course)];
  expect(await f.library.list(f.session)).toEqual({ scenes: [], unavailable: 1 });
});

test('T70 library: a changed media hash cannot impersonate the remembered course version', async () => {
  const f = await serviceFixture(); await f.progress.save({ ...f.session, course: f.course, expectedVersion: 0, position });
  f.state.courses[courseKey(f.course)].media.sha256 = 'b'.repeat(64);
  expect(await f.library.list(f.session)).toEqual({ scenes: [], unavailable: 1 });
});

test('T70 library: original courses without a material revision keep their original selector', async () => {
  const f = await serviceFixture(), original = structuredClone(f.course); delete original.materialsRevision;
  delete f.state.rows[0].materialsRevision; f.state.courses[courseKey(original)] = original;
  const result = await f.library.list(f.session); expect(result.scenes[0].course).toEqual(pointer(original));
  expect(result.scenes[0].course).not.toHaveProperty('materialsRevision');
});

test('T70 library: historical copies with no requirement use an explicitly neutral context without guessing roles', async () => {
  const f = await serviceFixture(), copied = structuredClone(f.course); copied.id = 'copy-t70-legacy'; copied.media.courseId = copied.id;
  f.state.rows = [{ id: copied.id, revision: 2, materialsRevision: 3, goal: 'Original saved conversation', status: 'video_assembled', simulation: false }];
  f.state.courses[courseKey(copied)] = copied;
  const result = await f.library.list(f.session), scene = result.scenes[0];
  expect(scene.contextSource).toBe('legacy-neutral'); expect(scene.description).toBe('Original saved conversation');
  expect(scene.requirement.revision).toBe(2); expect(scene.requirement.content.description).toBe(scene.description);
  expect(Object.values(scene.requirement.content.keywords)).toEqual(['', '', '', '', '', '']);
  expect(JSON.stringify(scene)).not.toContain('学生家长'); expect(JSON.stringify(scene)).not.toContain('班主任');
});

test('T70 library: existing generated courses with no recorded requirement use the same explicit neutral compatibility context', async () => {
  const f = await serviceFixture(); delete f.state.rows[0].requirement;
  const result = await f.library.list(f.session), scene = result.scenes[0];
  expect(scene.contextSource).toBe('legacy-neutral'); expect(scene.course).toEqual(pointer(f.course));
  expect(scene.description).toBe(f.state.rows[0].goal); expect(Object.values(scene.requirement.content.keywords)).toEqual(['', '', '', '', '', '']);
});

for (const change of ['wrongId', 'wrongRevision', 'wrongMaterials', 'wrongLineVersion', 'testSource', 'missingTranslation']) test(`T70 library: ${change} actual course data cannot become a playable catalogue entry`, async () => {
  const f = await serviceFixture(), value = f.state.courses[courseKey(f.course)];
  if (change === 'wrongId') value.id = 'other';
  if (change === 'wrongRevision') value.media.revision = 3;
  if (change === 'wrongMaterials') value.materialsRevision = 4;
  if (change === 'wrongLineVersion') value.lines[0].revision = 3;
  if (change === 'testSource') value.source = 'test-fixture';
  if (change === 'missingTranslation') delete value.lines[0].translations.hi;
  expect(await f.library.list(f.session)).toEqual({ scenes: [], unavailable: 1 });
});

test('T70 library: an invalid present requirement cannot be downgraded to an invented neutral context', async () => {
  const f = await serviceFixture(); f.state.rows[0].requirement.revision = 99;
  expect(await f.library.list(f.session)).toEqual({ scenes: [], unavailable: 1 });
});

test('T70 library: session rejection while validating a listed course cannot return a partially private catalogue', async () => {
  const f = await serviceFixture(); f.state.readFailure = Error('Authenticated session required');
  await expect(f.library.list(f.session)).rejects.toThrow('Authenticated session required');
});

test('T70 library: malformed or mismatched source data cannot reach progress reads or writes', async () => {
  for (const change of ['id', 'materials', 'source', 'translation']) {
    const f = await serviceFixture(), data = f.state.courses[courseKey(f.course)];
    if (change === 'id') data.media.courseId = 'another';
    if (change === 'materials') data.materialsRevision = 99;
    if (change === 'source') data.source = 'test-fixture';
    if (change === 'translation') delete data.lines[0].translations.hi;
    const input = { ...f.session, ...pointer(f.course) };
    await expect(f.library.getProgress(input)).rejects.toThrow();
    await expect(f.library.saveProgress({ ...input, expectedVersion: 0, position })).rejects.toThrow();
    expect(f.state.events.filter(([kind]) => kind.startsWith('progress-'))).toEqual([]);
    expect(await f.progress.get({ ...f.session, course: f.course })).toBeNull();
  }
});

test('T70 library: progress reads and writes first authorize the actual private course and pass its server-owned media data', async () => {
  const f = await serviceFixture(), input = { ...f.session, ...pointer(f.course) };
  expect(await f.library.getProgress(input)).toBeNull();
  expect(f.state.events.map(([kind]) => kind)).toEqual(['course', 'progress-get']);
  f.state.events.length = 0;
  const saved = await f.library.saveProgress({ ...input, expectedVersion: 0, position });
  expect(saved.position).toEqual(position); expect(f.state.events.map(([kind]) => kind)).toEqual(['course', 'progress-save']);
  expect(f.state.events[1][1].course).toEqual(f.course);
  expect(await f.library.getProgress(input)).toEqual(saved);
});

test('T70 library: another owner cannot use the internal position store as authority to read or write the course', async () => {
  const f = await serviceFixture(), input = { ...f.other, ...pointer(f.course) };
  expect(await f.library.list(f.other)).toEqual({ scenes: [], unavailable: 0 }); f.state.events.length = 0;
  await expect(f.library.getProgress(input)).rejects.toThrow('Course unavailable');
  await expect(f.library.saveProgress({ ...input, expectedVersion: 0, position })).rejects.toThrow('Course unavailable');
  expect(f.state.events.filter(([kind]) => kind.startsWith('progress-'))).toEqual([]);
  expect(await f.progress.get({ ...f.other, course: f.course })).toBeNull();
});

test('T70 library: failed private course reads never touch existing learning progress', async () => {
  const f = await serviceFixture(), before = await f.progress.save({ ...f.session, course: f.course, expectedVersion: 0, position });
  f.state.readFailure = Error('Course media unavailable');
  const input = { ...f.session, ...pointer(f.course) };
  await expect(f.library.getProgress(input)).rejects.toThrow('Course media unavailable');
  await expect(f.library.saveProgress({ ...input, expectedVersion: 1, position: { ...position, time: 3 } })).rejects.toThrow('Course media unavailable');
  expect(f.state.events.filter(([kind]) => kind.startsWith('progress-'))).toEqual([]);
  expect(await f.progress.get({ ...f.session, course: f.course })).toEqual(before);
});

test('T70 library: unreadable remembered progress is reported as unavailable rather than resetting to the newest material', async () => {
  const f = await serviceFixture(); f.state.latestFailure = Error('Stored progress unavailable');
  expect(await f.library.list(f.session)).toEqual({ scenes: [], unavailable: 1 });
  expect(f.state.events.filter(([kind]) => kind === 'progress-save')).toEqual([]);
});

test('T70 library: lost acknowledgement retry and conflicts retain the exact stored position', async () => {
  const f = await serviceFixture(), input = { ...f.session, ...pointer(f.course), expectedVersion: 0, position };
  const first = await f.library.saveProgress(input); expect(await f.library.saveProgress(input)).toEqual(first);
  const second = await f.library.saveProgress({ ...input, expectedVersion: 1, position: { ...position, time: 3 } });
  await expect(f.library.saveProgress(input)).rejects.toThrow('Progress conflict');
  expect(await f.library.getProgress(input)).toEqual(second);
});

test('T70 library: asynchronous private course reading cannot let caller mutations change the saved pointer or position', async () => {
  const f = await serviceFixture(), read = f.courseStore.getCourse; let release;
  const gate = new Promise(resolve => { release = resolve; });
  f.courseStore.getCourse = async input => { await gate; return read(input); };
  const input = { ...f.session, ...pointer(f.course), expectedVersion: 0, position: { ...position } };
  const pending = f.library.saveProgress(input); input.cookie = f.other.cookie; input.id = 'other'; input.materialsRevision = 99; input.position.time = 1; release();
  const saved = await pending; expect(saved.position).toEqual(position); expect(saved.course.id).toBe(f.course.id); expect(saved.course.materialsRevision).toBe(3);
});

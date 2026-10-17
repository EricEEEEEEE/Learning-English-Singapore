import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sealGoogleSession } from '../../lib/google-auth.ts';
import { ownerIdFromSessionCookie } from '../../lib/private-owner.ts';
import { createGenerationTaskStore } from '../../lib/generation-tasks.ts';
import { createPrivateMediaStore } from '../../lib/private-media-store.ts';
import { createLocalCourseLibrary } from '../../lib/local-course-library.ts';
import { createSceneProgressStore } from '../../lib/scene-progress.ts';
import { createSceneRequirementStore } from '../../lib/scene-requirements.ts';

// C5 synthetic local data: every store lives in a fresh temp directory, sessions are sealed with a test secret,
// and nothing touches tmp/ or outputs/ of the real app. Generated tasks are created with the real store and then
// marked assembled directly in SQLite (no provider is ever configured).
export const now = Date.UTC(2026, 9, 17, 9);
export const secret = 'c5-data-trust-synthetic-secret-at-least-32';
const identity = providerSubject => ({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject, email: 'synthetic@example.invalid' });
const translations = text => ({ 'zh-Hans': text, id: text, ja: text, ko: text, hi: text });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const position = { page: 'sentences', time: 1.5, turnIndex: 0 };

function copyCourse(sha256) {
  return { id: 'c5-source-party', revision: 1, materialsRevision: 1, source: 'ai-generated', media: { courseId: 'c5-source-party', revision: 1, assetId: 'final', sha256, duration: 4 },
    lines: [{ id: 'a', role: 'partner', text: 'Hello.', start: 0, end: 2, revision: 1, translations: translations('你好') },
      { id: 'b', role: 'learner', text: 'Hi.', start: 2, end: 4, revision: 1, translations: translations('你好') }],
    phrases: [{ id: 'p', text: 'Hello', lineId: 'a', translations: translations('你好') }], turns: [{ partnerLineId: 'a', learnerLineId: 'b' }] };
}

export async function dataFixture() {
  const root = await mkdtemp(join(tmpdir(), 'les-c5-data-'));
  const directory = join(root, 'generation-tasks'), requirementsDirectory = join(root, 'scene-requirements');
  const a = { cookie: await sealGoogleSession(identity('c5-owner-a'), secret, now), now };
  const b = { cookie: await sealGoogleSession(identity('c5-owner-b'), secret, now), now };
  const ownerA = await ownerIdFromSessionCookie(a.cookie, secret, now), ownerB = await ownerIdFromSessionCookie(b.cookie, secret, now);
  const mediaStore = createPrivateMediaStore({ directory: join(directory, 'media'), sessionSecret: secret });
  const tasks = createGenerationTaskStore({ directory, sessionSecret: secret, mediaStore });
  const library = createLocalCourseLibrary({ directory, sessionSecret: secret, mediaStore });
  const progress = createSceneProgressStore({ directory, sessionSecret: secret });
  const requirements = createSceneRequirementStore({ directory: requirementsDirectory, sessionSecret: secret });

  async function generated(session, description, reservedMicros, status = 'video_assembled', extra = {}) {
    const latest = await requirements.get(session);
    const requirement = await requirements.save({ ...session, expectedRevision: latest?.revision ?? 0, content: { description, language: 'zh-Hans', keywords: { location: '学校', learnerRole: '家长', partnerRole: '老师', topic: '适应', goal: '确认下一步', special: '' } } });
    const task = await tasks.create({ ...session, goal: description, revision: requirement.revision, requestKey: `c5-${description}`, requirement });
    const bytes = Buffer.from(`synthetic final video for ${description}`), sha256 = sha(bytes);
    const db = new DatabaseSync(join(directory, 'generation.sqlite'));
    try {
      const body = { ...task, status, reservedMicros, providerCalls: 3, finalVideo: { assetId: 'final', sha256, size: bytes.length, duration: 4 }, ...extra };
      db.prepare('UPDATE jobs SET body=? WHERE id=?').run(JSON.stringify(body), task.id);
    } finally { db.close(); }
    await mediaStore.put({ ...session, courseId: task.id, revision: task.revision, assetId: 'final', bytes, sha256 });
    const course = { id: task.id, revision: task.revision, media: { sha256, duration: 4 }, turns: [{}] };
    await progress.save({ ...session, course, expectedVersion: 0, position });
    return { task, requirement, sha256, course, pointer: { id: task.id, revision: task.revision } };
  }
  async function copied(session, owner) {
    const bytes = Buffer.from(`synthetic copied video for ${owner}`), sha256 = sha(bytes), course = copyCourse(sha256);
    const approval = { sourceOwner: 'usr_c5_synthetic_source', targetOwner: owner, courseId: course.id, revision: 1, mediaSha256: sha256, materialsRevision: 1 };
    const saved = await library.importCopy({ ...session, bundle: { approval, course, media: { courseId: course.id, revision: 1, assetId: 'final', sha256, size: bytes.length, bytes } } });
    const progressCourse = { id: saved.id, revision: 1, materialsRevision: 1, media: { sha256, duration: 4 }, turns: [{}] };
    await progress.save({ ...session, course: progressCourse, expectedVersion: 0, position });
    return { course: saved, progressCourse, pointer: { id: saved.id, revision: 1 } };
  }
  // Authorizes like the private course reader: only the owner's own course ids resolve, with their lines.
  const owned = { [ownerA]: new Map(), [ownerB]: new Map() };
  const courseReads = [];
  async function getCourse(input) {
    courseReads.push({ ...input });
    const owner = await ownerIdFromSessionCookie(input.cookie, secret, input.now);
    if (!owner) throw new Error('Authenticated session required');
    const course = owned[owner]?.get(`${input.id}:${input.revision}:${input.materialsRevision ?? 0}`);
    if (!course) throw new Error('Course unavailable');
    return structuredClone(course);
  }
  const sentenceCourse = (id, revision, materialsRevision) => ({ id, revision, ...(materialsRevision ? { materialsRevision } : {}), lines: [{ id: 'line-0', text: 'Do you have a booking?' }, { id: 'line-1', text: 'Yes, under Tan.' }] });
  function allowCourse(owner, id, revision, materialsRevision) { owned[owner].set(`${id}:${revision}:${materialsRevision ?? 0}`, sentenceCourse(id, revision, materialsRevision)); }
  function rawJob(id) {
    const db = new DatabaseSync(join(directory, 'generation.sqlite'));
    try { const row = db.prepare('SELECT body FROM jobs WHERE id=?').get(id); return row ? JSON.parse(String(row.body)) : null; } finally { db.close(); }
  }
  return { root, directory, requirementsDirectory, a, b, ownerA, ownerB, mediaStore, tasks, library, progress, requirements, generated, copied, getCourse, courseReads, allowCourse, rawJob, options: { directory, requirementsDirectory, sessionSecret: secret } };
}

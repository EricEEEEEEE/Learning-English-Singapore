import { test, expect } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const now = Date.UTC(2026, 8, 26);
const secret = 'offline-audio-task-session-secret-at-least-32';
const translations = Object.fromEntries(['zh-Hans', 'id', 'ja', 'ko', 'hi'].map(k => [k, 'synthetic']));
const lines = [{ id: 'a', role: 'partner', text: 'Hello', translations }, { id: 'b', role: 'learner', text: 'Hi', translations }];
function wav() {
  const b = Buffer.alloc(176044); b.write('RIFF'); b.writeUInt32LE(176036, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(176000, 40); return b;
}
async function setup(videoProvider, videoDownload, videoProbe, finalizers = {}) {
  const { createGenerationTaskStore } = await import('../../lib/generation-tasks.ts');
  const { createPrivateMediaStore } = await import('../../lib/private-media-store.ts');
  const { sealGoogleSession } = await import('../../lib/google-auth.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-audio-task-'));
  const mediaStore = createPrivateMediaStore({ directory: join(directory, 'media'), sessionSecret: secret });
  const options = { directory, sessionSecret: secret, simulation: true, mediaStore, videoProvider, videoDownload, videoProbe, ...finalizers,
    scriptProvider: { reservedMicros: 100, generate: async () => ({ requestId: 'script', script: { lines, phrases: [{ id: 'p', text: 'Hello', lineId: 'a', translations }], turns: [{ partnerLineId: 'a', learnerLineId: 'b' }] } }) },
    audioProvider: { reservedMicros: 200, generate: async line => asset(line) } };
  const store = createGenerationTaskStore(options);
  const cookie = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'synthetic-a', email: 'a@example.invalid' }, secret, now);
  const other = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'synthetic-b', email: 'b@example.invalid' }, secret, now);
  const task = await store.create({ cookie, now, goal: 'Party greeting', revision: 1, requestKey: 'one' });
  const input = { cookie, now: now + 1, id: task.id };
  await store.runScript(input);
  return { store, input, other, mediaStore, reopen: () => createGenerationTaskStore(options) };
}
const asset = line => { const bytes = wav(); return { lineId: line.id, role: line.role, duration: 11, bytes, sha256: createHash('sha256').update(bytes).digest('hex') }; };



async function ready(download, probe, finalizers) {
  const url = 'https://media.example.invalid/synthetic.mp4?signature=synthetic-private';
  let submits = 0, queries = 0;
  const provider = { reservedMicros: 90000, audioReviewed: true,
    submit: async () => { submits++; return { status: 'pending', jobId: `synthetic-job-${submits}` }; },
    query: async id => { queries++; return { jobId: id, status: 'completed', videoUrl: url }; } };
  const context = await setup(provider, download, probe, finalizers);
  await context.store.runAudio(context.input); await context.store.runAudio(context.input);
  await context.store.assembleAudio(context.input); await context.store.runVideo(context.input);
  return { ...context, url, counts: () => ({ submits, queries }) };
}



const video = Buffer.from('synthetic per-segment transport bytes');
const hash = createHash('sha256').update(video).digest('hex');
const download = async () => ({ bytes: video, sha256: hash });
const probe = async input => ({ sha256: input.sha256, duration: input.expectedDuration, width: 720, height: 1280, fps: 24, videoCodec: 'h264', audioCodec: 'aac' });

const finalBytes = Buffer.from('synthetic final output');
const finalHash = createHash('sha256').update(finalBytes).digest('hex');
async function prepared(mode = 'success', pauseConcat = async () => {}) {
  let concats = 0, verifies = 0;
  const c = await ready(download, probe, {
    videoConcat: async sources => {
      concats++;
      await pauseConcat();
      expect(sources).toHaveLength(2);
      for (const source of sources) {
        expect(Buffer.from(source.bytes)).toEqual(video);
        expect(source.sha256).toBe(hash);
      }
      return { bytes: finalBytes, sha256: finalHash };
    },
    finalVideoVerify: async input => {
      verifies++;
      expect(Buffer.from(input.bytes)).toEqual(finalBytes);
      expect(input.sha256).toBe(finalHash);
      expect(input.plan).toEqual({ sourceDuration: 22, segmentDurations: [11, 11] });
      if (mode === 'reject') throw new Error('synthetic decode failure');
      return { sha256: mode === 'wrong-hash' ? hash : finalHash, decoded: true, duration: 22,
        width: 720, height: 1280, fps: 24, videoCodec: 'h264', audioCodec: 'aac' };
    },
  });
  await c.store.collectVideo(c.input); await c.store.probeVideo(c.input);
  await c.store.runVideo(c.input); await c.store.collectVideo(c.input);
  return { ...c, finalCounts: () => ({ concats, verifies }) };
}


async function materialContext() {
  const c = await prepared();
  await c.store.probeVideo(c.input); await c.store.assembleVideo(c.input);
  expect(typeof c.store.saveLearningMaterials).toBe('function');
  const request = { ...c.input, revision: 1 };
  const original = await c.store.getCourse(request);
  const revision = { courseId: c.input.id, sourceRevision: 1, mediaSha256: original.media.sha256, materialsRevision: 1,
    lineTranslations: original.lines.map(l => ({ lineId: l.id, translations: { ...l.translations, 'zh-Hans': '修订草稿' } })),
    phrases: structuredClone(original.phrases) };
  return { ...c, request, original, revision };
}

test('T61B saved materials: reopen preserves explicitly selected revision and original, without provider calls', async () => {
  const c = await materialContext(), before = await c.store.get(c.input);
  await c.store.saveLearningMaterials({ ...c.input, materials: c.revision });
  const revised = await c.reopen().getCourse({ ...c.request, materialsRevision: 1 });
  expect(revised.materialsRevision).toBe(1);
  expect(revised.lines[0].translations['zh-Hans']).toBe('修订草稿');
  expect(revised.media).toEqual(c.original.media);
  expect(await c.reopen().getCourse(c.request)).toEqual(c.original);
  expect(await c.store.get(c.input)).toEqual(before);
  expect(c.finalCounts()).toEqual({ concats: 1, verifies: 1 });
});

test('T61B saved materials: same-version retry is idempotent, conflicting overwrite rejected, next revision retains previous', async () => {
  const c = await materialContext();
  const save = materials => c.reopen().saveLearningMaterials({ ...c.input, materials });
  await save(c.revision); await save(structuredClone(c.revision));
  const changed = structuredClone(c.revision);
  changed.lineTranslations[0].translations['zh-Hans'] = '第二稿';
  await expect(save(changed)).rejects.toThrow();
  changed.materialsRevision = 2; await save(changed);
  expect((await c.reopen().getCourse({ ...c.request, materialsRevision: 1 })).lines[0].translations['zh-Hans']).toBe('修订草稿');
  expect((await c.reopen().getCourse({ ...c.request, materialsRevision: 2 })).lines[0].translations['zh-Hans']).toBe('第二稿');
});

test('T61B saved materials: missing, foreign and expired sessions cannot save or read revision', async () => {
  const c = await materialContext();
  await c.store.saveLearningMaterials({ ...c.input, materials: c.revision });
  for (const credentials of [{ cookie: c.other }, { cookie: undefined }, { now: now + 366 * 86400000 }]) {
    await expect(c.reopen().saveLearningMaterials({ ...c.input, ...credentials, materials: { ...c.revision, materialsRevision: 2 } })).rejects.toThrow();
    await expect(c.reopen().getCourse({ ...c.request, ...credentials, materialsRevision: 1 })).rejects.toThrow();
  }
});

test('T61B saved materials: wrong source and invalid content reject without publishing a revision', async () => {
  const c = await materialContext();
  for (const change of [r => { r.mediaSha256 = 'f'.repeat(64); }, r => { r.sourceRevision = 2; }, r => { r.courseId = 'another'; }, r => { r.phrases[0].text = 'invented words'; }]) {
    const bad = structuredClone(c.revision); change(bad);
    await expect(c.store.saveLearningMaterials({ ...c.input, materials: bad })).rejects.toThrow();
  }
  await expect(c.reopen().getCourse({ ...c.request, materialsRevision: 1 })).rejects.toThrow();
  expect(await c.reopen().getCourse(c.request)).toEqual(c.original);
});

test('T61B saved materials: explicit absent or invalid version never silently falls back to original', async () => {
  const c = await materialContext();
  await c.store.saveLearningMaterials({ ...c.input, materials: c.revision });
  for (const materialsRevision of [0, -1, 1.5, 2, '1']) {
    await expect(c.reopen().getCourse({ ...c.request, materialsRevision })).rejects.toThrow();
  }
});

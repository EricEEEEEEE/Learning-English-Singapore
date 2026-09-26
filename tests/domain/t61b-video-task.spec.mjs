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
  const b = Buffer.alloc(16044); b.write('RIFF'); b.writeUInt32LE(16036, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(16000, 40); return b;
}
async function setup(videoProvider, simulation = true) {
  const { createGenerationTaskStore } = await import('../../lib/generation-tasks.ts');
  const { createPrivateMediaStore } = await import('../../lib/private-media-store.ts');
  const { sealGoogleSession } = await import('../../lib/google-auth.ts');
  const directory = await mkdtemp(join(tmpdir(), 'les-audio-task-'));
  const mediaStore = createPrivateMediaStore({ directory: join(directory, 'media'), sessionSecret: secret });
  const options = { directory, sessionSecret: secret, simulation, mediaStore, videoProvider,
    scriptProvider: { reservedMicros: 100, generate: async () => ({ requestId: 'script', script: { lines, phrases: [{ id: 'p', text: 'Hello', lineId: 'a', translations }], turns: [{ partnerLineId: 'a', learnerLineId: 'b' }] } }) },
    audioProvider: { reservedMicros: 200, generate: async line => asset(line) } };
  const store = createGenerationTaskStore(options);
  const cookie = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'synthetic-a', email: 'a@example.invalid' }, secret, now);
  const other = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'synthetic-b', email: 'b@example.invalid' }, secret, now);
  const task = await store.create({ cookie, now, goal: 'Party greeting', revision: 1, requestKey: 'one' });
  const input = { cookie, now: now + 1, id: task.id };
  if (simulation) await store.runScript(input);
  return { store, input, other, mediaStore, reopen: () => createGenerationTaskStore(options) };
}
const asset = line => { const bytes = wav(); return { lineId: line.id, role: line.role, duration: 1, bytes, sha256: createHash('sha256').update(bytes).digest('hex') }; };


test('T61B video task: reserve once and persist job identity; query never resubmits', async () => {
  let submissions = 0, queries = 0;
  const provider = { reservedMicros: 90000, audioReviewed: true,
    submit: async input => {
      submissions++;
      expect(input.duration).toBe(2);
      expect(Buffer.from(input.bytes).readUInt32LE(40)).toBe(32000);
      expect(input.goal).toBe('Party greeting');
      return { status: 'pending', jobId: 'synthetic-video' };
    }, query: async id => { queries++; expect(id).toBe('synthetic-video'); return { jobId: id, status: 'processing' }; } };
  const { store, input, reopen, other } = await setup(provider);
  await store.runAudio(input); await store.runAudio(input); await store.assembleAudio(input);
  await expect(store.runVideo({ ...input, cookie: other })).rejects.toThrow();
  await store.runVideo({ ...input, audioUri: 'https://untrusted.invalid', goal: 'untrusted' });
  expect(await reopen().get(input)).toMatchObject({ status: 'video_pending', providerCalls: 4, reservedMicros: 90500 });
  expect((await reopen().get(input)).videoJobs).toEqual([{ segmentIndex: 0, jobId: 'synthetic-video', status: 'pending' }]);
  await expect(reopen().runVideo(input)).rejects.toThrow();
  await reopen().queryVideo(input);
  expect((await reopen().get(input)).videoJobs[0].status).toBe('processing');
  expect(submissions).toBe(1); expect(queries).toBe(1);
  expect(await reopen().get(input)).toMatchObject({ providerCalls: 4, reservedMicros: 90500 });
});

test('T61B video task: uncertain submission retains budget and blocks replay', async () => {
  let calls = 0;
  const { store, input, reopen } = await setup({ reservedMicros: 90000, audioReviewed: true, submit: async () => { calls++; throw new Error('synthetic timeout'); } });
  await store.runAudio(input); await store.runAudio(input); await store.assembleAudio(input);
  expect(typeof store.runVideo).toBe('function');
  try { await store.runVideo(input); } catch { /* Persisted state is authoritative. */ }
  expect(await reopen().get(input)).toMatchObject({ status: 'submission_unknown', reservedMicros: 90500, providerCalls: 4 });
  await expect(reopen().runVideo(input)).rejects.toThrow();
  expect(calls).toBe(1);
});

for (const live of [false, true]) test(`T61B video task: ${live ? 'live mode' : 'missing listening review'} blocks browser approval`, async () => {
  let calls = 0;
  const { store, input } = await setup({ reservedMicros: 90000, audioReviewed: live, submit: async () => { calls++; return { status: 'pending', jobId: 'bad' }; } }, !live);
  if (!live) { await store.runAudio(input); await store.runAudio(input); await store.assembleAudio(input); }
  await expect(store.runVideo({ ...input, approved: true, audioReviewed: true })).rejects.toThrow();
  expect(calls).toBe(0);
  expect(await store.get(input)).toMatchObject({ providerCalls: live ? 0 : 3, reservedMicros: live ? 0 : 500 });
});

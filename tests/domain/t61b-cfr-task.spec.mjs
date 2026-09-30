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
    videoConcat: async (sources, verifiedDuration) => {
      expect(verifiedDuration).toBe(22);
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


test('T61B CFR task: duration comes from verified segments, never caller override', async () => {
 const c=await prepared(); await c.store.probeVideo(c.input);
 const before=await c.store.get(c.input);
 const result=await c.store.assembleVideo({...c.input, normalizeDuration:1});
 expect(result.status).toBe('video_assembled');
 expect(result.finalVideo.duration).toBe(22);
 expect(result.providerCalls).toBe(before.providerCalls);
 expect(result.reservedMicros).toBe(before.reservedMicros);
 expect(c.finalCounts()).toEqual({concats:1,verifies:1});
});
test('T61B CFR task: strict output rejection retains unpublished task', async () => {
 const c=await prepared('reject'); await c.store.probeVideo(c.input);
 await expect(c.store.assembleVideo(c.input)).rejects.toThrow();
 expect(c.finalCounts()).toEqual({concats:1,verifies:1});
 const task=await c.reopen().get(c.input);
 expect(task.status).toBe('video_pending'); expect(task.finalVideo).toBeUndefined();
});

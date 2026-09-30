import { test, expect } from '@playwright/test';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
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
  const options = { directory, sessionSecret: secret, simulation: false, maxReservedMicros: 1000000, liveBudget: {scope: "cfr-runtime", priorSpentMicros: 0}, mediaStore, encodedVideoProvider: videoProvider, audioEncoder: async input => { const bytes=Buffer.from("synthetic AAC"); return {bytes,sha256:createHash("sha256").update(bytes).digest("hex"),sourceSha256:input.sha256,sourceDuration:11,duration:11,mimeType:"audio/mp4",decoded:true}; }, videoDownload, videoProbe, ...finalizers,
    scriptProvider: { reservedMicros: 100, generate: async () => ({ requestId: 'script', script: { lines, phrases: [{ id: 'p', text: 'Hello', lineId: 'a', translations }], turns: [{ partnerLineId: 'a', learnerLineId: 'b' }] } }) },
    audioProvider: { reservedMicros: 200, generate: async line => asset(line) } };
  const store = createGenerationTaskStore(options);
  const cookie = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'synthetic-a', email: 'a@example.invalid' }, secret, now);
  const other = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'synthetic-b', email: 'b@example.invalid' }, secret, now);
  const task = await store.create({ cookie, now, goal: 'Party greeting', revision: 1, requestKey: 'one' });
  const input = { cookie, now: now + 1, id: task.id };
  await store.runScript(input);
  return { directory, store, input, other, mediaStore, reopen: () => createGenerationTaskStore(options) };
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
  await context.store.assembleAudio(context.input);
  await context.store.encodeAudio(context.input); const encoded=await context.store.encodeAudio(context.input);
  for(const a of encoded.encodedAudio) await context.store.confirmEncodedAudio({...context.input,revision:1,segmentIndex:a.segmentIndex,sha256:a.sha256});
  await context.store.runVideo(context.input);
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


test('T61B CFR runtime: verified task duration reaches native normalizer, failure does not publish', async () => {
 const {createLiveGenerationRuntime}=await import('../../lib/live-generation-runtime.ts');
 const c=await prepared(); await c.store.probeVideo(c.input);
 const before=await c.store.get(c.input), marker=join(c.directory,'concat-args.json'), tool=join(c.directory,'ffmpeg.cjs');
 await writeFile(tool, `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, JSON.stringify(process.argv.slice(2))); process.exit(1);\n`, {mode:0o700});
 let calls=0;
 const live=createLiveGenerationRuntime({enabled:true,directory:c.directory,sessionSecret:secret,openaiKey:'synthetic-only',ltxKey:'synthetic-only',
 budget:{scope:'cfr-runtime',priorSpentMicros:0,maxReservedMicros:1000000,scriptMicros:100,audioMicros:200,videoMicros:90000},
 media:{ffmpeg:tool,ffprobe:'/synthetic/ffprobe',allowedHosts:['media.example.invalid'],maxBytes:1000000},
 fetch:async()=>{calls++;throw new Error('Unexpected network');}});
 await expect(live.assembleVideo({...c.input,normalizeDuration:1})).rejects.toThrow();
 const args=JSON.parse(await readFile(marker,'utf8'));
 expect(args[args.indexOf('-vf')+1]).toBe('fps=24');
 expect(args[args.indexOf('-t')+1]).toBe('22');
 expect(args).not.toContain('copy');
 expect(await live.get(c.input)).toEqual(before);
 expect(calls).toBe(0);
});

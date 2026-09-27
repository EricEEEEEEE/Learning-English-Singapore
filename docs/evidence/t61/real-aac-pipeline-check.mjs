import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const out=path.resolve('outputs/t61-real-aac');fs.mkdirSync(out,{recursive:true});
for(const name of fs.readdirSync('lib').filter(n=>n.endsWith('.ts'))){
 const js=ts.transpileModule(fs.readFileSync('lib/'+name,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/(from\s+['"]\.\/[^'"]+)(['"])/g,'$1.mjs$2');
 fs.writeFileSync(path.join(out,name.replace(/\.ts$/,'.mjs')),js);
}
const {probeVideoBytes}=await import(path.join(out,'probe-video-bytes.mjs'));
const {concatVideoBytes}=await import(path.join(out,'concat-video-bytes.mjs'));
const {verifyFinalVideo}=await import(path.join(out,'verify-final-video.mjs'));
const {encodeVideoAudio}=await import(path.join(out,'encode-video-audio.mjs'));
const {wavDuration}=await import(path.join(out,'generated-audio.mjs'));
const ffmpeg=path.resolve('outputs/t61-native-concat/node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg');
const ffprobe=path.resolve('outputs/t61-native-probe/node_modules/@ffprobe-installer/darwin-arm64/ffprobe');
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const now = Date.UTC(2026, 8, 26);
const secret = 'offline-audio-task-session-secret-at-least-32';
const translations = Object.fromEntries(['zh-Hans', 'id', 'ja', 'ko', 'hi'].map(k => [k, 'synthetic']));
const lines = [{ id: 'a', role: 'partner', text: 'Hello', translations }, { id: 'b', role: 'learner', text: 'Hi', translations }];
// Local fixture adaptation: retain hotel speech, pad its tail to the original 12-second input duration.
const padded=path.join(out,'hotel-padded-12s.wav');
execFileSync(ffmpeg,['-nostdin','-v','error','-y','-i',path.resolve('outputs/t61-http-live/hotel-source.wav'),'-af','apad,atrim=duration=12','-c:a','pcm_s16le',padded],{timeout:60000,maxBuffer:1000000});
function wav() { return fs.readFileSync(padded); }
async function setup(videoProvider, videoDownload, videoProbe) {
  const { createGenerationTaskStore } = await import(path.join(out,'generation-tasks.mjs'));
  const { createPrivateMediaStore } = await import(path.join(out,'private-media-store.mjs'));
  const { sealGoogleSession } = await import(path.join(out,'google-auth.mjs'));
  const directory = await mkdtemp(join(tmpdir(), 'les-audio-task-'));
  const mediaStore = createPrivateMediaStore({ directory: join(directory, 'media'), sessionSecret: secret });
  const options = { directory, sessionSecret: secret, simulation: true, mediaStore, encodedVideoProvider: videoProvider, audioEncoder: input => encodeVideoAudio(input,{ffmpeg,ffprobe}), videoDownload, videoProbe,
    videoConcat: sources => concatVideoBytes(sources,{executable:ffmpeg}), finalVideoVerify: input => verifyFinalVideo(input,{ffmpeg,ffprobe}),
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
const asset = line => { const bytes = wav(); return { lineId: line.id, role: line.role, duration: wavDuration(bytes), bytes, sha256: createHash('sha256').update(bytes).digest('hex') }; };



async function ready(download, probe) {
  const url = 'https://media.example.invalid/synthetic.mp4?signature=synthetic-private';
  let submits = 0, queries = 0;
  const provider = { reservedMicros: 90000,
    submit: async input => { assert.equal(input.reviewedSha256,input.audio.sha256);assert.equal(input.audio.mimeType,'audio/mp4');assert.equal(createHash('sha256').update(input.audio.bytes).digest('hex'),input.audio.sha256); submits++; return { status: 'pending', jobId: `synthetic-job-${submits}` }; },
    query: async id => { queries++; return { jobId: id, status: 'completed', videoUrl: url }; } };
  const context = await setup(provider, download, probe);
  await context.store.runAudio(context.input); await context.store.runAudio(context.input);
  await context.store.assembleAudio(context.input);
  for(let i=0;i<2;i++){
    const encoded=await context.store.encodeAudio(context.input);
    // Synthetic confirmation only: not evidence that a person listened or approved paid generation.
    await context.store.confirmEncodedAudio({...context.input,revision:1,segmentIndex:i,sha256:encoded.encodedAudio[i].sha256});
  }
  await context.store.runVideo(context.input);
  return { ...context, url, counts: () => ({ submits, queries }) };
}



const bytes=fs.readFileSync('public/media/hotel-pov-12s.mp4'); const sha256=createHash('sha256').update(bytes).digest('hex');
const c=await ready(async()=>({bytes,sha256}),input=>probeVideoBytes(input,{executable:path.resolve('outputs/t61-native-probe/node_modules/@ffprobe-installer/darwin-arm64/ffprobe')}));

await c.store.collectVideo(c.input); await c.store.probeVideo(c.input);
await c.reopen().runVideo(c.input); await c.reopen().collectVideo(c.input); await c.reopen().probeVideo(c.input);
const assembled=await c.reopen().assembleVideo(c.input);
assert.equal(assembled.status,'video_assembled');assert.equal(assembled.finalVideo.decoded,true);
const course=await c.reopen().getCourse({...c.input,revision:1});
const final=await c.reopen().getCourseMedia({...c.input,revision:1});
assert.equal(course.media.sha256,createHash('sha256').update(final.bytes).digest('hex'));
assert.equal(course.lines[1].start,12.042);
assert.deepEqual(await c.reopen().assembleVideo(c.input),assembled);
assert.equal(c.counts().submits,2);
await assert.rejects(c.reopen().getCourse({...c.input,cookie:c.other,revision:1}));
const summary={simulation:true,directDatabaseFixture:false,realProbeConcatDecode:true,realAacEncoding:true,syntheticConfirmation:true,sourceFixturePaddedTo12Seconds:true,semanticLessonMatch:false,audioDurations:assembled.encodedAudio.map(a=>({source:a.sourceDuration,encoded:a.duration})),actualPaidCalls:0,status:assembled.status,duration:assembled.finalVideo.duration,sha256:final.sha256,lineTimes:course.lines.map(l=>({id:l.id,start:l.start,end:l.end})),simulatedSubmits:c.counts().submits,reopened:true,otherOwnerRejected:true};
fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary));

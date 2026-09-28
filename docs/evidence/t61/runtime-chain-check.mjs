import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const out=path.resolve('outputs/t61-runtime-chain');fs.mkdirSync(out,{recursive:true});
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
const {prepareLiveGenerationRuntime}=await import(path.join(out,'live-generation-runtime.mjs'));
const {sealGoogleSession}=await import(path.join(out,'google-auth.mjs'));
const directory=await mkdtemp(join(tmpdir(),'les-runtime-chain-'));
const videoBytes=fs.readFileSync('public/media/hotel-pov-12s.mp4');
const script={lines,phrases:[{id:'p',text:'Hello',lineId:'a',translations}],turns:[{partnerLineId:'a',learnerLineId:'b'}]};
const counts={script:0,audio:0,submit:0,query:0,download:0};
const transport=async(url,init)=>{
 assert.equal(init.redirect,'error');
 if(url==='https://api.openai.com/v1/responses'){
  counts.script++;assert.equal(init.headers.Authorization,'Bearer synthetic-openai');
  const body=JSON.parse(init.body);assert.equal(body.input.find(x=>x.role==='user').content,'Party greeting');
  return Response.json({id:'synthetic-script',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(script)}]}]});
 }
 if(url==='https://api.openai.com/v1/audio/speech'){
  counts.audio++;assert.equal(init.headers.Authorization,'Bearer synthetic-openai');
  assert.equal(JSON.parse(init.body).voice,counts.audio===1?'marin':'cedar');
  return new Response(wav());
 }
 if(url==='https://api.ltx.io/v2/audio-to-video'){
  counts.submit++;assert.equal(init.headers.Authorization,'Bearer synthetic-ltx');
  const body=JSON.parse(init.body);assert.equal(body.model,'ltx-2-5-fast');assert.equal(body.resolution,'720x1280');assert.equal(body.fps,24);
  assert.ok(body.audio_uri.startsWith('data:audio/mp4;base64,'));
  return Response.json({id:`synthetic-${counts.submit}`},{status:202});
 }
 if(url.startsWith('https://api.ltx.io/v2/audio-to-video/synthetic-')){
  counts.query++;assert.equal(init.method,'GET');
  return Response.json({id:url.split('/').at(-1),status:'completed',result:{video_url:'https://media.example.invalid/video.mp4'}});
 }
 if(url==='https://media.example.invalid/video.mp4'){
  counts.download++;assert.equal(init.credentials,'omit');assert.equal(init.headers.Authorization,undefined);
  return new Response(videoBytes,{headers:{'Content-Length':String(videoBytes.length)}});
 }
 throw new Error('Unexpected transport destination');
};
const options={enabled:true,directory,sessionSecret:secret,openaiKey:'synthetic-openai',ltxKey:'synthetic-ltx',fetch:transport,
 budget:{scope:'synthetic-runtime-chain',priorSpentMicros:900,maxReservedMicros:181400,scriptMicros:100,audioMicros:200,videoMicros:90000},
 media:{ffmpeg,ffprobe,allowedHosts:['media.example.invalid'],maxBytes:10000000}};
const open=()=>prepareLiveGenerationRuntime(options);
let runtime=await open();
assert.deepEqual(counts,{script:0,audio:0,submit:0,query:0,download:0});
const cookie=await sealGoogleSession({provider:'google',issuer:'https://accounts.google.com',providerSubject:'synthetic-a',email:'a@example.invalid'},secret,now);
const task=await runtime.create({cookie,now,goal:'Party greeting',revision:1,requestKey:'one'});
const input={cookie,now,id:task.id};
await runtime.runScript(input);await runtime.runAudio(input);await runtime.runAudio(input);await runtime.assembleAudio(input);
for(let i=0;i<2;i++)await runtime.encodeAudio(input);
await assert.rejects(runtime.runVideo(input));assert.equal(counts.submit,0);
const prepared=await runtime.get(input);
for(let i=0;i<2;i++)await runtime.confirmEncodedAudio({...input,revision:1,segmentIndex:i,sha256:prepared.encodedAudio[i].sha256});
for(let i=0;i<2;i++){
 runtime=await open();await runtime.runVideo(input);await runtime.queryVideo(input);await runtime.collectVideo(input);await runtime.probeVideo(input);
}
const finalTask=await runtime.assembleVideo(input);
runtime=await open();
assert.deepEqual(await runtime.assembleVideo(input),finalTask);
const course=await runtime.getCourse({...input,revision:1});
const media=await runtime.getCourseMedia({...input,revision:1});
assert.equal(course.lines[1].start,12.042);assert.equal(finalTask.finalVideo.duration,24.084);
assert.equal(createHash('sha256').update(media.bytes).digest('hex'),course.media.sha256);
assert.equal(finalTask.reservedMicros,180500);
assert.deepEqual(counts,{script:1,audio:2,submit:2,query:4,download:2});
const summary={preparedRuntime:true,realLocalTools:true,syntheticTransport:true,syntheticConfirmation:true,actualPaidCalls:0,semanticLessonMatch:false,counts,duration:course.media.duration,secondLineStart:course.lines[1].start,sha256:media.sha256,reopened:true};
fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));

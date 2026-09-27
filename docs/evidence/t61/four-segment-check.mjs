import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
const out=path.resolve('outputs/t61-boundary');
fs.mkdirSync(out,{recursive:true});
for(const name of fs.readdirSync('lib').filter(n=>n.endsWith('.ts'))){
 const js=ts.transpileModule(fs.readFileSync('lib/'+name,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/(from\s+['"]\.\/[^'"]+)(['"])/g,'$1.mjs$2');
 fs.writeFileSync(path.join(out,name.replace(/\.ts$/,'.mjs')),js);
}
const {createGenerationTaskStore}=await import(path.join(out,'generation-tasks.mjs'));
const {createPrivateMediaStore}=await import(path.join(out,'private-media-store.mjs'));
const {sealGoogleSession}=await import(path.join(out,'google-auth.mjs'));
const {validateFinalVideoProbe}=await import(path.join(out,'final-video-probe.mjs'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const translations=Object.fromEntries(['zh-Hans','id','ja','ko','hi'].map(k=>[k,'synthetic']));
const lines=Array.from({length:4},(_,i)=>({id:'line'+i,role:i%2?'learner':'partner',text:i%2?'Hi':'Hello',translations}));
const pcm=Buffer.alloc(240044);pcm.write('RIFF');pcm.writeUInt32LE(240036,4);pcm.write('WAVE',8);pcm.write('fmt ',12);pcm.writeUInt32LE(16,16);pcm.writeUInt16LE(1,20);pcm.writeUInt16LE(1,22);pcm.writeUInt32LE(8000,24);pcm.writeUInt32LE(16000,28);pcm.writeUInt16LE(2,32);pcm.writeUInt16LE(16,34);pcm.write('data',36);pcm.writeUInt32LE(240000,40);
const results=[];
for(const delta of [.04,.08]){
 const directory=await mkdtemp(path.join(tmpdir(),'les-four-segments-'));
 const secret='synthetic-four-segment-boundary-secret';const now=Date.now();
 const cookie=await sealGoogleSession({provider:'google',issuer:'https://accounts.google.com',providerSubject:'synthetic',email:'synthetic@example.invalid'},secret,now);
 const mediaStore=createPrivateMediaStore({directory:path.join(directory,'media'),sessionSecret:secret});
 const bytes=Buffer.from('synthetic video'),hash=sha(bytes),aac=Buffer.from('synthetic AAC');let submits=0;
 const duration=4*(15+2*delta);
 const options={directory,sessionSecret:secret,simulation:true,mediaStore,
 scriptProvider:{reservedMicros:100,generate:async()=>({requestId:'synthetic',script:{lines,phrases:[{id:'phrase',text:'Hello',lineId:'line0',translations}],turns:[{partnerLineId:'line0',learnerLineId:'line1'},{partnerLineId:'line2',learnerLineId:'line3'}]}})},
 audioProvider:{reservedMicros:100,generate:async line=>({lineId:line.id,role:line.role,bytes:pcm,sha256:sha(pcm),duration:15})},
 audioEncoder:async input=>({bytes:aac,sha256:sha(aac),sourceSha256:input.sha256,sourceDuration:15,duration:15+delta,mimeType:'audio/mp4',decoded:true}),
 encodedVideoProvider:{reservedMicros:100,submit:async()=>({status:'pending',jobId:'job'+(++submits)}),query:async id=>({jobId:id,status:'completed',videoUrl:'https://media.example.invalid/sample.mp4'})},
 videoDownload:async()=>({bytes,sha256:hash}),videoProbe:async input=>({sha256:input.sha256,duration:input.expectedDuration+delta,width:720,height:1280,fps:24,videoCodec:'h264',audioCodec:'aac'}),
 videoConcat:async sources=>{assert.equal(sources.length,4);return{bytes,sha256:hash};},
 finalVideoVerify:async input=>({ ...validateFinalVideoProbe({format:{format_name:'mp4',start_time:0,duration},streams:[{codec_type:'video',codec_name:'h264',width:720,height:1280,avg_frame_rate:'24/1',duration,start_time:0,disposition:{attached_pic:0}},{codec_type:'audio',codec_name:'aac',profile:'LC',sample_rate:8000,channels:1,duration,start_time:0}]},input.plan),sha256:hash,decoded:true})};
 const store=createGenerationTaskStore(options);const task=await store.create({cookie,now,goal:'Synthetic four segment greeting',revision:1,requestKey:'one'});const input={cookie,now,id:task.id};
 await store.runScript(input);for(let i=0;i<4;i++)await store.runAudio(input);await store.assembleAudio(input);
 for(let i=0;i<4;i++){await store.encodeAudio(input);await store.confirmEncodedAudio({...input,revision:1,segmentIndex:i,sha256:sha(aac)});}
 for(let i=0;i<4;i++){await store.runVideo(input);await store.collectVideo(input);await store.probeVideo(input);}
 const before=await store.get(input);
 if(delta===.08){await assert.rejects(store.assembleVideo(input));const saved=await createGenerationTaskStore(options).get(input);assert.equal(saved.status,'video_pending');assert.equal(saved.finalVideo,undefined);await assert.rejects(store.getCourse({...input,revision:1}));assert.deepEqual(saved,before);}
 else{await store.assembleVideo(input);const course=await createGenerationTaskStore(options).getCourse({...input,revision:1});assert.equal(course.lines.length,4);course.lines.forEach((l,i)=>assert.ok(Math.abs(l.start-i*(15+2*delta))<1e-6));}
 const after=await store.get(input);assert.equal(after.providerCalls,before.providerCalls);assert.equal(after.reservedMicros,before.reservedMicros);
 results.push({sourceSeconds:60,segments:4,finalSeconds:duration,outcome:delta===.08?'rejected_without_completion':'readable_with_actual_video_offsets',providerSubmissions:submits,realApiCalls:0});
}
fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));

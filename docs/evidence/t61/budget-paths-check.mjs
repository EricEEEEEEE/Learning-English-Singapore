import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
const out=path.resolve('outputs/t61-budget-evidence');fs.mkdirSync(out,{recursive:true});
for(const name of fs.readdirSync('lib').filter(n=>n.endsWith('.ts'))){
 const js=ts.transpileModule(fs.readFileSync('lib/'+name,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/(from\s+['"]\.\/[^'"]+)(['"])/g,'$1.mjs$2');
 fs.writeFileSync(path.join(out,name.replace(/\.ts$/,'.mjs')),js);
}
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
async function setup(audioEncoder, simulation = true, providers = {}) {
  const { createGenerationTaskStore } = await import(path.join(out,'generation-tasks.mjs'));
  const { createPrivateMediaStore } = await import(path.join(out,'private-media-store.mjs'));
  const { sealGoogleSession } = await import(path.join(out,'google-auth.mjs'));
  const directory = await mkdtemp(join(tmpdir(), 'les-audio-task-'));
  const mediaStore = createPrivateMediaStore({ directory: join(directory, 'media'), sessionSecret: secret });
  const options = { directory, sessionSecret: secret, simulation, mediaStore, audioEncoder, ...providers,
    scriptProvider: { reservedMicros: 100, generate: async () => ({ requestId: 'script', script: { lines, phrases: [{ id: 'p', text: 'Hello', lineId: 'a', translations }], turns: [{ partnerLineId: 'a', learnerLineId: 'b' }] } }) },
    audioProvider: { reservedMicros: 200, generate: async line => asset(line) } };
  const store = createGenerationTaskStore(options);
  const cookie = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'synthetic-a', email: 'a@example.invalid' }, secret, now);
  const other = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'synthetic-b', email: 'b@example.invalid' }, secret, now);
  const task = await store.create({ cookie, now, goal: 'Party greeting', revision: 1, requestKey: 'one' });
  const input = { cookie, now: now + 1, id: task.id };
  if (simulation) await store.runScript(input);
  return { store, input, other, mediaStore, reopen: (overrides = {}) => createGenerationTaskStore({ ...options, ...overrides }) };
}
const asset = line => { const bytes = wav(); return { lineId: line.id, role: line.role, duration: 1, bytes, sha256: createHash('sha256').update(bytes).digest('hex') }; };

const encodedBytes = Buffer.from('synthetic AAC');
const encodedHash = createHash('sha256').update(encodedBytes).digest('hex');
const encoded = input => ({ bytes: encodedBytes, sha256: encodedHash, sourceSha256: input.sha256, sourceDuration: 2, duration: 2, mimeType: 'audio/mp4', decoded: true });
async function ready(encoder, providers = {}) {
  const c = await setup(encoder, true, providers);
  await c.store.runAudio(c.input); await c.store.runAudio(c.input); await c.store.assembleAudio(c.input);
  return c;
}


const results=[];
const audio=await setup(async input=>encoded(input),true,{maxReservedMicros:300});
await audio.reopen({maxReservedMicros:undefined}).runAudio(audio.input);
const before=await audio.store.get(audio.input);assert.equal(before.reservedMicros,300);
await assert.rejects(audio.reopen({maxReservedMicros:undefined}).runAudio(audio.input),/limit exceeded/);
await assert.rejects(audio.reopen({maxReservedMicros:1000}).runAudio(audio.input),/configuration conflict/);
assert.deepEqual(await audio.store.get(audio.input),before);
results.push('audio exact boundary; persisted cap reused when omitted; conflict cannot raise cap');
let submits=0;
for(const limit of [90499,90500]){
 const c=await ready(async input=>encoded(input),{maxReservedMicros:limit,encodedVideoProvider:{reservedMicros:90000,submit:async()=>{submits++;return{status:'pending',jobId:'budget-job'};}}});
 await c.store.encodeAudio(c.input);await c.store.confirmEncodedAudio({...c.input,revision:1,segmentIndex:0,sha256:encodedHash});
 const before=await c.store.get(c.input);
 if(limit===90499){await assert.rejects(c.store.runVideo(c.input),/limit exceeded/);assert.deepEqual(await c.store.get(c.input),before);assert.equal(submits,0);}
 else{const done=await c.store.runVideo(c.input);assert.equal(done.reservedMicros,90500);assert.equal(submits,1);}
 results.push('video cap '+limit+' verified');
}
const task=await audio.store.create({...audio.input,goal:'Another synthetic scenario',revision:1,requestKey:'other'});
let simulationCalls=0;
await assert.rejects(audio.store.runSimulation({...audio.input,id:task.id,reservedMicros:1},async()=>{simulationCalls++;return{jobId:'never'};}),/limit exceeded/);
assert.equal(simulationCalls,0);results.push('simulation path blocked before provider');
fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({results,realApiCalls:0},null,2));console.log(JSON.stringify({results,realApiCalls:0}));

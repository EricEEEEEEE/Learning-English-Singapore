// C15-4: small paid video check (user 2026-10-18 11:53 UTC: C15-4 <= USD25 on the C15 books, all of C15 <= USD26.5).
// Drives one lesson through the repo's own live pipeline (script -> voices -> partner-only drive audio -> LTX
// audio-to-video -> full audio restored -> C14 quality gate -> assembly) in its own task directory and budget scope,
// never the C3 one. Every paid request is reserved first on the C15 ledger at its worst case; a failed or unknown
// request keeps its reservation and is never retried; an LTX 402 (insufficient funds) stops the run at once.
// Run: OPENAI_API_KEY="$OPEN_API_KEY" NODE_USE_ENV_PROXY=1 node --experimental-strip-types --no-warnings \
//        --import ./scripts/c15/ts-loader.mjs scripts/c15/video-sample.mjs --scene school|hawker --model ltx-2-3-pro|ltx-2-5-fast
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, chmodSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createLiveGenerationRuntime } from '../../lib/live-generation-runtime.ts';
import { createGenerationRunner } from '../../lib/generation-runner.ts';
import { createMachineAudioReview } from '../../lib/machine-audio-review.ts';
import { createPrivateMediaStore } from '../../lib/private-media-store.ts';
import { LIVE_RESERVATIONS } from '../../lib/live-scene-runner.ts';
import { LTX_MODELS, resolveLtxModel } from '../../lib/generated-video.ts';
import { sealGoogleSession, GOOGLE_SESSION_COOKIE } from '../../lib/google-auth.ts';
import { openLedger, PRICES, LTX_PRICES, CAPS } from './ledger.mjs';

const ITEM = 'C15-4', C15_TOTAL_CAP = 26.5;
const args = process.argv.slice(2);
const arg = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const sceneName = arg('--scene'), model = resolveLtxModel(arg('--model'));
if (!process.env.OPENAI_API_KEY || !process.env.LTX_API_KEY) throw new Error('OPENAI_API_KEY / LTX_API_KEY missing');
if (process.env.NODE_USE_ENV_PROXY !== '1') throw new Error('NODE_USE_ENV_PROXY=1 required');

// The two scenes already used in C3 and the zero-cost previews (requirement revisions 16/17 there).
const SCENES = {
  school: { description: '放学接孩子时，在小学教室门口，班主任主动和你聊孩子这周的适应情况：她问你孩子在家说起学校没有，告诉你孩子交到了朋友、上课能跟上，你回应并礼貌道谢。', keywords: { location: '小学教室门口', learnerRole: '家长', partnerRole: '班主任', topic: '孩子的适应情况', goal: '了解孩子在学校的表现并礼貌道谢', special: '' } },
  hawker: { description: '在小贩中心的鸡饭摊前点餐：摊主在摊位后面问你要什么，你点一份海南鸡饭；摊主问要不要辣椒酱，你问辣不辣、请他少放；摊主问喝什么，你点冰美禄并付款。', keywords: { location: '小贩中心鸡饭摊', learnerRole: '顾客', partnerRole: '摊主', topic: '点餐并问辣度', goal: '顺利点到少辣的鸡饭和饮料', special: '' } },
};
const REVISIONS = { 'school:ltx-2-3-pro': 1, 'hawker:ltx-2-3-pro': 2, 'hawker:ltx-2-5-fast': 3, 'school:ltx-2-5-fast': 4 };
const scene = SCENES[sceneName];
// --attempt N (default 1) gives a fresh requirement revision, e.g. after a task stopped on failed or unknown work.
const attempt = Number(arg('--attempt') ?? '1');
if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > 9) throw new Error('--attempt must be 1-9');
const revision = REVISIONS[`${sceneName}:${model}`] && REVISIONS[`${sceneName}:${model}`] + 10 * (attempt - 1);
if (!scene || !revision) throw new Error('usage: --scene school|hawker --model ltx-2-3-pro|ltx-2-5-fast');

// --fresh-scope NAME (2026-10-23): a new task directory and runtime budget scope whose prior spend is everything already
// booked for C15-4 on the C15 ledger (settled + reserved/unknown), so the runtime's own reservation cap still ends at USD25.
// The old scope keeps every earlier task's whole reservation, which would block a new lesson long before USD25 is spent.
const freshScope = arg('--fresh-scope');
if (freshScope !== undefined && !/^[a-z0-9-]{1,20}$/.test(freshScope)) throw new Error('--fresh-scope must be a short lowercase name');
const directory = resolve(freshScope ? `tmp/c15-4-tasks-${freshScope}` : 'tmp/c15-4-tasks');
const outDir = arg('--out') ?? '/mnt/project-files/les-c15/video';
mkdirSync(directory, { recursive: true, mode: 0o700 }); mkdirSync(outDir, { recursive: true });
// A local random session secret (not a provider key) so later runs can read the same private store.
const secretPath = join(directory, '.session-secret');
if (!existsSync(secretPath)) { writeFileSync(secretPath, randomBytes(32).toString('hex'), { mode: 0o600 }); chmodSync(secretPath, 0o600); }
const sessionSecret = readFileSync(secretPath, 'utf8').trim();
const name = `${sceneName}-${model}${attempt > 1 ? `-a${attempt}` : ''}`;
const httpLog = join(directory, `${name}-http.jsonl`);
const log = (row) => appendFileSync(httpLog, JSON.stringify({ t: new Date().toISOString(), ...row }) + '\n');

const ledger = openLedger();
const c15Total = () => Object.keys(CAPS).filter(item => item.startsWith('C15')).reduce((sum, item) => sum + ledger.total(item), 0);
function reserve(label, usd) {
  if (c15Total() + usd > C15_TOTAL_CAP) throw new Error(`C15 total cap reached: ${c15Total().toFixed(4)} + ${usd} > ${C15_TOTAL_CAP}`);
  return ledger.reserve(ITEM, `${name} ${label}`, usd);
}

// Wraps fetch: every paid POST is reserved on the C15 ledger before it leaves; responses are logged without bodies,
// keys or signed URLs (status, LTX error type, job id, OpenAI usage only).
const ltxJobs = new Map(); // jobId -> ledger handle (settled once the job's audio duration is known)
let insufficientFunds = false;
const realFetch = globalThis.fetch;
async function guardedFetch(url, init = {}) {
  const u = new URL(String(url));
  const method = (init.method ?? 'GET').toUpperCase();
  const paid = method === 'POST' && (u.hostname === 'api.openai.com' || u.hostname === 'api.ltx.io');
  if (!paid) {
    const response = await realFetch(url, init);
    if (u.hostname === 'api.ltx.io') {
      // LTX may accept a job (202) and fail it moments later for funds: the status read carries the error type.
      const body = await response.clone().json().catch(() => null);
      const errorType = body?.status === 'failed' ? (body?.error?.type ?? null) : undefined;
      if (errorType === 'insufficient_funds_error') insufficientFunds = true;
      log({ host: u.hostname, method, path: u.pathname, status: response.status, ...(body?.status ? { jobStatus: body.status } : {}), ...(errorType !== undefined ? { errorType, message: String(body?.error?.message ?? '').slice(0, 120) } : {}) });
    }
    else log({ host: u.hostname, method, status: response.status });
    return response;
  }
  if (insufficientFunds) throw new Error('LTX insufficient funds: run stopped');
  const kind = u.hostname === 'api.ltx.io' ? 'ltx' : u.pathname.endsWith('/responses') ? 'script' : 'tts';
  const worst = kind === 'ltx' ? LTX_MODELS[model].segmentMicros / 1e6 : kind === 'script' ? LIVE_RESERVATIONS.scriptMicros / 1e6 : LIVE_RESERVATIONS.audioMicros / 1e6;
  const handle = reserve(kind, worst);
  let response;
  try { response = await realFetch(url, init); }
  catch (error) { handle.unknown(`network: ${error?.message ?? error}`); log({ host: u.hostname, method, path: u.pathname, error: 'network' }); throw error; }
  const row = { host: u.hostname, method, path: u.pathname, status: response.status, kind };
  try {
    if (kind === 'ltx') {
      const body = await response.clone().json().catch(() => null);
      if (response.status === 202 && typeof body?.id === 'string') { row.jobId = body.id; ltxJobs.set(body.id, handle); }
      else {
        row.errorType = body?.error?.type ?? body?.type ?? null;
        if (response.status === 402 || row.errorType === 'insufficient_funds_error') insufficientFunds = true;
        handle.unknown(`ltx http ${response.status} ${row.errorType ?? ''}`);
      }
    } else if (kind === 'script') {
      const body = await response.clone().json().catch(() => null);
      if (response.ok && body?.usage) {
        row.usage = { input_tokens: body.usage.input_tokens, output_tokens: body.usage.output_tokens };
        handle.settle((body.usage.input_tokens * PRICES['gpt-4.1'].input + body.usage.output_tokens * PRICES['gpt-4.1'].output) / 1e6, row.usage);
      } else handle.unknown(`script http ${response.status}`);
    } else {
      const bytes = response.ok ? (await response.clone().arrayBuffer()).byteLength : 0;
      // 24 kHz mono 16-bit WAV: 48,000 bytes a second; gpt-4o-mini-tts about USD0.015 a minute.
      if (response.ok && bytes > 44) { row.seconds = +((bytes - 44) / 48000).toFixed(3); handle.settle(row.seconds / 60 * PRICES['gpt-4o-mini-tts'].perMinute, { seconds: row.seconds }); }
      else handle.unknown(`tts http ${response.status}`);
    }
  } finally { log(row); }
  return response;
}

const priorSpentMicros = freshScope ? Math.ceil(ledger.total(ITEM) * 1e6) : 0, maxReservedMicros = CAPS[ITEM] * 1e6;
const store = createLiveGenerationRuntime({
  enabled: true, directory, sessionSecret, openaiKey: process.env.OPENAI_API_KEY, ltxKey: process.env.LTX_API_KEY, videoModel: model,
  budget: { scope: freshScope ? `C15-4-${freshScope}` : 'C15-4-20261018', priorSpentMicros, maxReservedMicros, ...LIVE_RESERVATIONS, videoMicros: LTX_MODELS[model].segmentMicros },
  media: { ffmpeg: '/usr/bin/ffmpeg', ffprobe: '/usr/bin/ffprobe', python: '/usr/bin/python3', allowedHosts: ['storage.googleapis.com'], maxBytes: 100_000_000 },
  fetch: guardedFetch,
});
const mediaStore = createPrivateMediaStore({ directory: join(directory, 'media'), sessionSecret });
const runner = createGenerationRunner({ store, audioReview: createMachineAudioReview({ read: input => mediaStore.get(input) }), pollMs: 10_000, maxPolls: 90 });

if (args.includes('--dry')) { console.log(`[c15-4] dry ok: ${name} revision ${revision}, C15 total so far ${c15Total().toFixed(4)}`); process.exit(0); }
const cookie = await sealGoogleSession({ provider: 'google', issuer: 'https://accounts.google.com', providerSubject: 'c15-4-synthetic-learner', email: 'synthetic@example.invalid' }, sessionSecret, Date.now());
const session = () => ({ cookie, now: Date.now() });
const requirement = { revision, content: { description: scene.description, language: 'zh-Hans', keywords: scene.keywords } };
const created = await store.create({ ...session(), goal: scene.description, revision, requestKey: `c15-4-${name}`, requirement });
const id = created.id;
console.log(`[c15-4] ${name} task ${id.slice(0, 8)} status ${created.status}`);

// Stage timeline: sample the stored task every 3 s and log each change.
const timelinePath = join(directory, `${name}-timeline.jsonl`);
let lastKey = '';
const started = Date.now();
const sample = async () => {
  const task = await store.get({ ...session(), id }).catch(() => null);
  if (!task) return;
  const key = JSON.stringify([task.status, task.videoJobs?.map(j => j.status), task.videoAssets?.length ?? 0, task.videoQuality?.length ?? 0, task.videoRedos?.length ?? 0]);
  if (key !== lastKey) { lastKey = key; appendFileSync(timelinePath, JSON.stringify({ t: new Date().toISOString(), s: Math.round((Date.now() - started) / 1000), key: JSON.parse(key) }) + '\n'); }
};
const timer = setInterval(() => { sample().catch(() => {}); }, 3000);

let result;
for (let round = 0; round < 8; round++) {
  result = await runner.advance({ ...session(), id });
  console.log(`[c15-4] round ${round} stopped=${result.stopped} status=${result.status}`);
  if (insufficientFunds || result.stopped !== 'waiting') break;
}
clearInterval(timer); await sample();
const task = await store.get({ ...session(), id });

// Settle LTX jobs: completed ones at their audio duration x price (rounded up to whole seconds); others keep the reservation.
for (const job of task.videoJobs ?? []) {
  const handle = ltxJobs.get(job.jobId);
  if (!handle) continue;
  if (job.status === 'completed' && job.audioDuration > 0) handle.settle(Math.ceil(job.audioDuration) * LTX_PRICES[model], { audioSeconds: job.audioDuration, model });
  else handle.unknown(`ltx job ${job.status}`);
}
for (const [jobId, handle] of ltxJobs) if (!(task.videoJobs ?? []).some(job => job.jobId === jobId)) handle.unknown('ltx job not recorded on task');

const summary = {
  name, model, taskId: id, revision, stopped: result?.stopped, status: task.status, insufficientFunds,
  wallSeconds: Math.round((Date.now() - started) / 1000), runtimeReservedMicros: task.reservedMicros, providerCalls: task.providerCalls,
  scene: task.script?.scene ?? null, lines: task.script?.lines?.map(line => ({ id: line.id, role: line.role, text: line.text })) ?? [],
  timeline: task.videoTimeline ?? null,
  segments: task.audioAssembly?.segments?.map((s, i) => ({ index: i, duration: s.duration })) ?? [],
  videoJobs: task.videoJobs?.map(j => ({ segmentIndex: j.segmentIndex, status: j.status, audioDuration: j.audioDuration, chained: !!j.referenceImageSha256 })) ?? [],
  videoQuality: task.videoQuality ?? [], videoRedos: task.videoRedos ?? [], videoRepairs: task.videoRepairs?.length ?? 0,
  // C15-4f: the lesson's fixed reference frame (or why the last-frame chain was used) and each job's reference image hash.
  anchorFrame: task.anchorFrame ?? null, referenceImages: task.videoJobs?.map(j => ({ segmentIndex: j.segmentIndex, sha256: j.referenceImageSha256 ?? null })) ?? [],
  finalVideo: task.finalVideo ? { duration: task.finalVideo.duration, size: task.finalVideo.size, sha256: task.finalVideo.sha256 } : null,
  ledgerItemTotal: ledger.total(ITEM), c15Total: c15Total(),
};
if (task.finalVideo) {
  const media = await mediaStore.get({ ...session(), courseId: id, revision: task.revision, assetId: task.finalVideo.assetId });
  if (media) { writeFileSync(join(outDir, `${name}.mp4`), media.bytes); summary.exported = join(outDir, `${name}.mp4`); }
}
if (task.anchorFrame?.status === 'selected') {
  const media = await mediaStore.get({ ...session(), courseId: id, revision: task.revision, assetId: task.anchorFrame.assetId }).catch(() => null);
  if (media) { writeFileSync(join(outDir, `${name}-anchor.png`), media.bytes); summary.anchorFile = join(outDir, `${name}-anchor.png`); }
}
// Every segment as delivered (after audio restore), for frame-by-frame review even when the course stopped.
summary.segmentFiles = [];
for (const asset of task.videoAssets ?? []) {
  const media = await mediaStore.get({ ...session(), courseId: id, revision: task.revision, assetId: asset.assetId }).catch(() => null);
  if (media) { const path = join(directory, `${name}-seg${asset.segmentIndex}-${asset.assetId.slice(0, 8)}.mp4`); writeFileSync(path, media.bytes); summary.segmentFiles.push(path); }
}
writeFileSync(join(outDir, `${name}-task.json`), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, lines: summary.lines.length, scene: !!summary.scene, videoQuality: summary.videoQuality.map(q => ({ seg: q.segmentIndex, verdict: q.verdict, checks: q.checks.map(c => `${c.id}:${c.status}:${c.value ?? ''}`) })) }, null, 2));
if (insufficientFunds) { console.log('[c15-4] BLOCKED: LTX insufficient funds'); process.exitCode = 3; }

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { ownerIdFromSessionCookie } from './private-owner';
import { validateGeneratedScript, type GeneratedScript } from './generated-script';
import { buildGeneratedCourse } from './generated-course';

import { wavDuration, planAudioSegments, type AudioAsset } from './generated-audio';
import type { createPrivateMediaStore } from './private-media-store';

import { assembleCourseAudio } from './assemble-course-audio';

import { planVideoTimeline } from './video-timeline';
import type { verifyFinalVideo } from './verify-final-video';
import type { encodeVideoAudio } from './encode-video-audio';
import type { concatVideoBytes } from './concat-video-bytes';

import type { repairAndVerifyVideoTail } from './repair-and-verify-video-tail';
import type { probeVideoBytes } from './probe-video-bytes';

type EncodedAudio = Awaited<ReturnType<typeof encodeVideoAudio>>;
type SavedEncodedAudio = Omit<EncodedAudio, 'bytes'> & { segmentIndex: number; assetId: string; size: number };
type FinalCheck = Awaited<ReturnType<typeof verifyFinalVideo>>;
type VideoCheck = Awaited<ReturnType<typeof probeVideoBytes>>;
type Assembly = ReturnType<typeof assembleCourseAudio>;
type SavedAssembly = Omit<Assembly, 'segments'> & { segments: (Omit<Assembly['segments'][number], 'bytes'> & { assetId: string })[] };
type SavedAudio = Omit<AudioAsset, 'bytes'> & { assetId: string };
type VideoJob = { audioSha256?: string; audioDuration?: number; segmentIndex: number; jobId: string; status: 'pending' | 'processing' | 'failed' | 'completed' };
type VideoProvider = { reservedMicros: number; audioReviewed: boolean; submit: (input: { bytes: Uint8Array; duration: number; goal: string }) => Promise<{ status: string; jobId?: string }>; query?: (id: string) => Promise<{ status: string; jobId: string; videoUrl?: string }> };
type EncodedVideoProvider = { query?: VideoProvider['query']; reservedMicros: number; submit: (input: { audio: EncodedAudio; reviewedSha256: string; goal: string }) => Promise<{ status: string; jobId?: string }> };
type Session = { cookie?: string | null; now?: number };
export type GenerationTask = { id: string; ownerId: string; goal: string; revision: number; status: 'awaiting_budget' | 'submitting' | 'submission_unknown' | 'video_pending' | 'script_ready' | 'audio_ready' | 'audio_assembled' | 'video_assembled'; reservedMicros: number; providerCalls: number; simulation: boolean; providerJobId?: string; pid?: number; script?: GeneratedScript; audioAssets?: SavedAudio[]; audioAssembly?: SavedAssembly; encodedAudio?: SavedEncodedAudio[]; audioReviews?: { revision: number; segmentIndex: number; sha256: string; sourceSha256: string; confirmedAt: number }[]; videoJobs?: VideoJob[]; finalVideo?: FinalCheck & { assetId: string; size: number }; videoTimeline?: ReturnType<typeof planVideoTimeline>; videoRepairs?: { segmentIndex: number; originalAssetId: string; sourceVideoSha256: string; sourceAudioSha256: string; repairedSha256: string }[]; videoChecks?: (VideoCheck & { segmentIndex: number })[]; videoAssets?: { segmentIndex: number; assetId: string; sha256: string; size: number }[] };
type ScriptProvider = { reservedMicros: number; generate: (input: { goal: string }) => Promise<{ requestId: string; script: unknown }> };
export function createGenerationTaskStore({ directory, sessionSecret, simulation = false, maxReservedMicros, liveBudget, scriptProvider, audioProvider, mediaStore, videoProvider, encodedVideoProvider, videoDownload, videoProbe, videoConcat, finalVideoVerify, audioEncoder, videoRepair }: { directory: string; sessionSecret: string; videoRepair?: (input: Parameters<typeof repairAndVerifyVideoTail>[0]) => Promise<Awaited<ReturnType<typeof repairAndVerifyVideoTail>>>; simulation?: boolean; maxReservedMicros?: number; liveBudget?: { scope: string; priorSpentMicros: number }; audioEncoder?: (input: Parameters<typeof encodeVideoAudio>[0]) => Promise<EncodedAudio>; videoConcat?: (inputs: Parameters<typeof concatVideoBytes>[0]) => Promise<Awaited<ReturnType<typeof concatVideoBytes>>>; finalVideoVerify?: (input: Parameters<typeof verifyFinalVideo>[0]) => Promise<FinalCheck>; scriptProvider?: ScriptProvider; videoProvider?: VideoProvider; encodedVideoProvider?: EncodedVideoProvider; videoProbe?: (input: { bytes: Uint8Array; sha256: string; expectedDuration: number }) => Promise<VideoCheck>; videoDownload?: (url: string) => Promise<{ bytes: Uint8Array; sha256: string }>; audioProvider?: { reservedMicros: number; generate: (line: GeneratedScript['lines'][number]) => Promise<AudioAsset> }; mediaStore?: ReturnType<typeof createPrivateMediaStore> }) {
  if (!directory || !sessionSecret) throw new Error('Store configuration required');
  const budget = liveBudget ? { ...liveBudget } : undefined;
  function transact<T>(work: (db: DatabaseSync) => T): T {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const path = join(directory, 'generation.sqlite');
    const db = new DatabaseSync(path, { timeout: 5000 });
    try {
      chmodSync(path, 0o600);
      db.exec('PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, owner TEXT NOT NULL, fingerprint TEXT NOT NULL, body TEXT NOT NULL, UNIQUE(owner,fingerprint)); CREATE TABLE IF NOT EXISTS requests (owner TEXT NOT NULL, key TEXT NOT NULL, fingerprint TEXT NOT NULL, PRIMARY KEY(owner,key)); CREATE TABLE IF NOT EXISTS final_assembly_locks (task TEXT PRIMARY KEY, owner TEXT NOT NULL, token TEXT NOT NULL, pid INTEGER NOT NULL); BEGIN IMMEDIATE;');
      const result = work(db); db.exec('COMMIT'); return result;
    } finally { db.close(); }
  }
  // A local durable reservation ceiling, not a provider billing guarantee.
  // Called only inside the same write transaction that reserves a submission.
  function checkReservation(db: DatabaseSync, additional: number) {
    db.exec('CREATE TABLE IF NOT EXISTS reservation_limit (id INTEGER PRIMARY KEY CHECK(id=1), micros INTEGER NOT NULL)');
    const saved = db.prepare('SELECT micros FROM reservation_limit WHERE id=1').get();
    if (maxReservedMicros !== undefined && (!Number.isSafeInteger(maxReservedMicros) || maxReservedMicros < 0)) throw new Error('Invalid total reservation limit');
    if (saved && maxReservedMicros !== undefined && Number(saved.micros) !== maxReservedMicros) throw new Error('Reservation limit configuration conflict');
    const limit = saved ? Number(saved.micros) : maxReservedMicros;
    if (limit === undefined) {
      if (!simulation) throw new Error('Live budget configuration required');
      return; // Existing offline fixtures may omit a ceiling.
    }
    if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('Invalid stored reservation limit');
    db.exec('CREATE TABLE IF NOT EXISTS live_budget (id INTEGER PRIMARY KEY CHECK(id=1), scope TEXT NOT NULL, prior_spent INTEGER NOT NULL)');
    const storedBudget = db.prepare('SELECT scope, prior_spent FROM live_budget WHERE id=1').get();
    if (storedBudget && simulation) throw new Error('Live budget cannot fund simulation');
    if (!simulation) {
      if (!budget || typeof budget.scope !== 'string' || !budget.scope.trim() || budget.scope.length > 128 || !Number.isSafeInteger(budget.priorSpentMicros) || budget.priorSpentMicros < 0 || maxReservedMicros === undefined) throw new Error('Live budget configuration required');
      if (storedBudget && (storedBudget.scope !== budget.scope || Number(storedBudget.prior_spent) !== budget.priorSpentMicros)) throw new Error('Live budget configuration conflict');
      if (!storedBudget) db.prepare('INSERT INTO live_budget VALUES(1,?,?)').run(budget.scope, budget.priorSpentMicros);
    }
    let total = simulation ? 0 : budget!.priorSpentMicros;
    for (const row of db.prepare('SELECT body FROM jobs').all()) {
      const value = JSON.parse(String(row.body)).reservedMicros;
      if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(total + value)) throw new Error('Invalid reservation ledger');
      total += value;
    }
    if (!Number.isSafeInteger(additional) || additional <= 0 || !Number.isSafeInteger(total + additional) || total + additional > limit) throw new Error('Total reservation limit exceeded');
    if (!saved) db.prepare('INSERT INTO reservation_limit VALUES(1,?)').run(limit);
  }
  async function owner(input: Session) {
    const value = await ownerIdFromSessionCookie(input.cookie, sessionSecret, input.now);
    if (!value) throw new Error('Authenticated session required'); return value;
  }
  const save = (db: DatabaseSync, task: GenerationTask) => db.prepare('UPDATE jobs SET body=? WHERE id=? AND owner=?').run(JSON.stringify(task), task.id, task.ownerId);
  function read(db: DatabaseSync, id: string, ownerId: string): GenerationTask | null {
    const row = db.prepare('SELECT body FROM jobs WHERE id=? AND owner=?').get(id, ownerId);
    if (!row) return null;
    const task = JSON.parse(String(row.body)) as GenerationTask;
    if (task.status === 'submitting') {
      let dead = !task.pid;
      if (task.pid) try { process.kill(task.pid, 0); } catch (error) { dead = (error as NodeJS.ErrnoException).code === 'ESRCH'; }
      if (dead) { task.status = 'submission_unknown'; save(db, task); }
    }
    return task;
  }
  async function readCourse(input: Session & { id: string; revision: number }) {
    const ownerId = await owner(input);
    if (!mediaStore || !Number.isSafeInteger(input.revision) || input.revision < 1) throw new Error('Course unavailable');
    const task = transact(db => read(db, input.id, ownerId));
    if (!task || task.revision !== input.revision) throw new Error('Course unavailable');
    const course = buildGeneratedCourse(task);
    const media = await mediaStore.get({ cookie: input.cookie, now: input.now, courseId: task.id, revision: task.revision, assetId: course.media.assetId });
    if (!media || media.sha256 !== course.media.sha256 || media.size !== task.finalVideo!.size || createHash('sha256').update(media.bytes).digest('hex') !== course.media.sha256) throw new Error('Course media unavailable');
    return { course, media };
  }
  return {
    async getCourse(input: Session & { id: string; revision: number }) { return (await readCourse(input)).course; },
    async getCourseMedia(input: Session & { id: string; revision: number }) { return (await readCourse(input)).media; },
    async create(input: Session & { goal: string; revision: number; requestKey: string }) {
      const ownerId = await owner(input);
      if (typeof input.goal !== 'string' || !input.goal.trim() || input.goal.length > 2000 || !Number.isSafeInteger(input.revision) || input.revision < 1 || typeof input.requestKey !== 'string' || !input.requestKey.trim() || input.requestKey.length > 128) throw new Error('Invalid task');
      const goal = input.goal.trim();
      const fingerprint = createHash('sha256').update(JSON.stringify([goal, input.revision])).digest('hex');
      return transact(db => {
        const previous = db.prepare('SELECT fingerprint FROM requests WHERE owner=? AND key=?').get(ownerId, input.requestKey);
        if (previous && previous.fingerprint !== fingerprint) throw new Error('Request key conflict');
        if (!previous && Number(db.prepare('SELECT count(*) AS n FROM requests WHERE owner=?').get(ownerId)?.n) >= 500) throw new Error('Request limit');
        const existing = db.prepare('SELECT id FROM jobs WHERE owner=? AND fingerprint=?').get(ownerId, fingerprint);
        if (existing) {
          const task = read(db, String(existing.id), ownerId)!;
          if (task.simulation !== simulation) throw new Error('Task execution mode conflict');
          db.prepare('INSERT OR IGNORE INTO requests VALUES(?,?,?)').run(ownerId, input.requestKey, fingerprint);
          return task;
        }
        const count = db.prepare('SELECT count(*) AS n FROM jobs WHERE owner=?').get(ownerId);
        if (Number(count?.n) >= 50) throw new Error('Task limit');
        const task: GenerationTask = { id: randomUUID(), ownerId, goal, revision: input.revision, status: 'awaiting_budget', reservedMicros: 0, providerCalls: 0, simulation };
        db.prepare('INSERT INTO jobs VALUES(?,?,?,?)').run(task.id, ownerId, fingerprint, JSON.stringify(task));
        db.prepare('INSERT INTO requests VALUES(?,?,?)').run(ownerId, input.requestKey, fingerprint); return task;
      });
    },
    async get(input: Session & { id: string }) { const id = await owner(input); return transact(db => read(db, input.id, id)); },
    async list(input: Session) { const id = await owner(input); return transact(db => db.prepare('SELECT id FROM jobs WHERE owner=? ORDER BY rowid DESC').all(id).map(row => read(db, String(row.id), id)!)); },
    async runScript(input: Session & { id: string }) {
      // Real execution is opt-in through server configuration, never request fields.
      if ((!simulation && !budget) || !scriptProvider) throw new Error('Script provider disabled');
      const ownerId = await owner(input);
      const reservedMicros = scriptProvider.reservedMicros;
      if (!Number.isSafeInteger(reservedMicros) || reservedMicros <= 0) throw new Error('Invalid reservation');
      const task = transact(db => {
        const value = read(db, input.id, ownerId);
        if (!value || value.simulation !== simulation || value.status !== 'awaiting_budget') throw new Error('Submission prohibited');
        checkReservation(db, reservedMicros);
        value.status = 'submitting'; value.pid = process.pid; value.reservedMicros = reservedMicros; value.providerCalls = 1;
        save(db, value); return value;
      });
      let result: { requestId: string; script: GeneratedScript } | undefined;
      try {
        const response = await scriptProvider.generate({ goal: task.goal });
        const checked = validateGeneratedScript(response?.script);
        if (typeof response?.requestId === 'string' && response.requestId.trim() && response.requestId.length <= 500 && checked.ok) result = { requestId: response.requestId, script: checked.value };
      } catch { /* Submission may have reached the provider. Preserve reservation; do not retry. */ }
      return transact(db => {
        task.status = result ? 'script_ready' : 'submission_unknown';
        if (result) { task.providerJobId = result.requestId; task.script = result.script; }
        save(db, task); return task;
      });
    },
    async runAudio(input: Session & { id: string }) {
      if ((!simulation && !budget) || !audioProvider || !mediaStore) throw new Error('Audio provider disabled');
      const ownerId = await owner(input);
      const reservation = audioProvider.reservedMicros;
      if (!Number.isSafeInteger(reservation) || reservation <= 0) throw new Error('Invalid reservation');
      const task = transact(db => {
        const value = read(db, input.id, ownerId);
        if (!value || value.simulation !== simulation || value.status !== 'script_ready' || !value.script) throw new Error('Submission prohibited');
        const count = value.audioAssets?.length ?? 0;
        if (count >= value.script.lines.length || !Number.isSafeInteger(value.reservedMicros + reservation)) throw new Error('Submission prohibited');
        checkReservation(db, reservation);
        value.status = 'submitting'; value.pid = process.pid;
        value.reservedMicros += reservation; value.providerCalls++;
        save(db, value); return value;
      });
      const index = task.audioAssets?.length ?? 0;
      const line = task.script!.lines[index];
      let saved: SavedAudio | undefined;
      try {
        const result = await audioProvider.generate(structuredClone(line));
        if (!result || result.lineId !== line.id || result.role !== line.role || !(result.bytes instanceof Uint8Array) || result.bytes.length > 4_000_000) throw new Error('Invalid audio result');
        const duration = wavDuration(result.bytes);
        if (duration !== result.duration || createHash('sha256').update(result.bytes).digest('hex') !== result.sha256) throw new Error('Invalid audio integrity');
        const assetId = `audio-${index}`;
        await mediaStore.put({ cookie: input.cookie, now: input.now, courseId: task.id, revision: task.revision, assetId, bytes: result.bytes, sha256: result.sha256 });
        saved = { lineId: line.id, role: line.role, duration, sha256: result.sha256, assetId };
      } catch { /* Preserve prior assets and reservation. Never repeat an uncertain request. */ }
      return transact(db => {
        task.status = 'submission_unknown';
        if (saved) {
          task.audioAssets = [...(task.audioAssets ?? []), saved];
          // Oversized courses remain blocked before any video request.
          try {
            planAudioSegments(task.audioAssets);
            task.status = task.audioAssets.length === task.script!.lines.length ? 'audio_ready' : 'script_ready';
          } catch { /* Keep all completed media, but prohibit further generation. */ }
        }
        save(db, task); return task;
      });
    },
    async assembleAudio(input: Session & { id: string }) {
      if ((!simulation && !budget) || !mediaStore) throw new Error('Audio assembly disabled');
      const ownerId = await owner(input);
      const task = transact(db => read(db, input.id, ownerId));
      if (!task || task.simulation !== simulation || task.status !== 'audio_ready' || !task.script || !task.audioAssets || task.audioAssets.length !== task.script.lines.length) throw new Error('Assembly prohibited');
      const sources = [];
      for (let i = 0; i < task.audioAssets.length; i++) {
        const asset = task.audioAssets[i], line = task.script.lines[i];
        if (asset.lineId !== line.id || asset.role !== line.role) throw new Error('Audio source mismatch');
        const source = await mediaStore.get({ cookie: input.cookie, now: input.now, courseId: task.id, revision: task.revision, assetId: asset.assetId });
        if (!source || source.sha256 !== asset.sha256) throw new Error('Audio source unavailable');
        sources.push({ lineId: line.id, bytes: source.bytes, sha256: asset.sha256 });
      }
      const assembled = assembleCourseAudio(sources);
      const segments: SavedAssembly['segments'] = [];
      for (let i = 0; i < assembled.segments.length; i++) {
        const segment = assembled.segments[i], assetId = `audio-segment-${i}`;
        await mediaStore.put({ cookie: input.cookie, now: input.now, courseId: task.id, revision: task.revision, assetId, bytes: segment.bytes, sha256: segment.sha256 });
        segments.push({ assetId, lineIds: segment.lineIds, duration: segment.duration, sha256: segment.sha256 });
      }
      // Publish references only after every immutable asset is saved. Concurrent assembly is idempotent.
      return transact(db => {
        const current = read(db, task.id, ownerId);
        if (current?.status === 'audio_assembled') return current;
        if (!current || current.status !== 'audio_ready' || JSON.stringify(current.audioAssets) !== JSON.stringify(task.audioAssets)) throw new Error('Task changed during assembly');
        current.audioAssembly = { duration: assembled.duration, lines: assembled.lines, segments };
        current.status = 'audio_assembled'; save(db, current); return current;
      });
    },
    async encodeAudio(input: Session & { id: string }) {
      if ((!simulation && !budget) || !mediaStore || !audioEncoder) throw new Error('Audio encoding disabled');
      const ownerId = await owner(input);
      const snapshot = transact(db => read(db, input.id, ownerId));
      if (!snapshot || snapshot.simulation !== simulation || snapshot.status !== 'audio_assembled' || !snapshot.audioAssembly) throw new Error('Encoding prohibited');
      const locator = { cookie: input.cookie, now: input.now, courseId: snapshot.id, revision: snapshot.revision };
      const segments = snapshot.audioAssembly.segments;
      const count = snapshot.encodedAudio?.length ?? 0;
      if (count > segments.length) throw new Error('Invalid encoded references');
      for (let i = 0; i < count; i++) {
        const saved = snapshot.encodedAudio![i], source = segments[i];
        if (saved.segmentIndex !== i || saved.sourceSha256 !== source.sha256 || saved.sourceDuration !== source.duration) throw new Error('Encoded source mismatch');
        const stored = await mediaStore.get({ ...locator, assetId: saved.assetId });
        if (!stored || stored.sha256 !== saved.sha256 || stored.size !== saved.size) throw new Error('Encoded media unavailable');
      }
      if (count === segments.length) return snapshot;
      const segment = segments[count];
      const source = await mediaStore.get({ ...locator, assetId: segment.assetId });
      if (!source || source.sha256 !== segment.sha256 || createHash('sha256').update(source.bytes).digest('hex') !== segment.sha256 || wavDuration(source.bytes) !== segment.duration) throw new Error('Audio source unavailable');
      const result = await audioEncoder({ bytes: Buffer.from(source.bytes), sha256: segment.sha256 });
      if (!result || !(result.bytes instanceof Uint8Array) || !result.bytes.length || result.bytes.length >= 10_000_000 || result.sourceSha256 !== segment.sha256 || result.sourceDuration !== segment.duration || result.mimeType !== 'audio/mp4' || result.decoded !== true || !Number.isFinite(result.duration) || result.duration <= 0 || result.duration > 20 || Math.abs(result.duration - segment.duration) > 1024 / 8000 + 0.001001) throw new Error('Invalid encoded audio');
      const bytes = Buffer.from(result.bytes), sha256 = createHash('sha256').update(bytes).digest('hex');
      if (sha256 !== result.sha256) throw new Error('Invalid encoded integrity');
      const assetId = `encoded-${count}-${sha256}`;
      const metadata = await mediaStore.put({ ...locator, assetId, bytes, sha256 });
      const saved: SavedEncodedAudio = { segmentIndex: count, assetId, size: metadata.size, sha256, sourceSha256: segment.sha256, sourceDuration: segment.duration, duration: result.duration, mimeType: 'audio/mp4', decoded: true };
      return transact(db => {
        const current = read(db, snapshot.id, ownerId);
        if (!current || current.status !== 'audio_assembled' || JSON.stringify(current.audioAssembly) !== JSON.stringify(snapshot.audioAssembly)) throw new Error('Task changed during encoding');
        const existing = current.encodedAudio?.[count];
        if (existing && JSON.stringify(existing) === JSON.stringify(saved)) return current;
        if (JSON.stringify(current.encodedAudio) !== JSON.stringify(snapshot.encodedAudio)) throw new Error('Encoded task changed');
        current.encodedAudio = [...(current.encodedAudio ?? []), saved];
        save(db, current); return current;
      });
    },
    async confirmEncodedAudio(input: Session & { id: string; revision: number; segmentIndex: number; sha256: string }) {
      if ((!simulation && !budget) || !mediaStore) throw new Error('Audio confirmation disabled');
      const ownerId = await owner(input);
      if (!Number.isSafeInteger(input.revision) || input.revision < 1 || !Number.isSafeInteger(input.segmentIndex) || input.segmentIndex < 0 || typeof input.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.sha256)) throw new Error('Invalid audio confirmation');
      const snapshot = transact(db => read(db, input.id, ownerId));
      const encoded = snapshot?.encodedAudio?.[input.segmentIndex];
      const source = snapshot?.audioAssembly?.segments[input.segmentIndex];
      if (!snapshot || snapshot.simulation !== simulation || snapshot.status !== 'audio_assembled' || snapshot.revision !== input.revision || !encoded || !source || encoded.segmentIndex !== input.segmentIndex || encoded.sha256 !== input.sha256 || encoded.sourceSha256 !== source.sha256 || encoded.sourceDuration !== source.duration) throw new Error('Audio confirmation prohibited');
      const media = await mediaStore.get({ cookie: input.cookie, now: input.now, courseId: snapshot.id, revision: snapshot.revision, assetId: encoded.assetId });
      if (!media || media.sha256 !== encoded.sha256 || media.size !== encoded.size || createHash('sha256').update(media.bytes).digest('hex') !== encoded.sha256) throw new Error('Audio confirmation media unavailable');
      const confirmedAt = input.now ?? Date.now();
      if (!Number.isSafeInteger(confirmedAt) || confirmedAt < 0) throw new Error('Invalid confirmation time');
      return transact(db => {
        const current = read(db, snapshot.id, ownerId);
        if (!current || current.status !== 'audio_assembled' || current.revision !== input.revision || JSON.stringify(current.encodedAudio?.[input.segmentIndex]) !== JSON.stringify(encoded) || JSON.stringify(current.audioAssembly?.segments[input.segmentIndex]) !== JSON.stringify(source)) throw new Error('Audio changed during confirmation');
        const existing = current.audioReviews?.find(review => review.segmentIndex === input.segmentIndex);
        if (existing?.sha256 === encoded.sha256 && existing.sourceSha256 === source.sha256 && existing.revision === input.revision) return current;
        current.audioReviews = [...(current.audioReviews ?? []).filter(review => review.segmentIndex !== input.segmentIndex), { revision: input.revision, segmentIndex: input.segmentIndex, sha256: encoded.sha256, sourceSha256: source.sha256, confirmedAt }];
        save(db, current); return current;
      });
    },
    async runVideo(input: Session & { id: string }) {
      if ((!simulation && (!budget || !encodedVideoProvider)) || (!encodedVideoProvider && (!videoProvider || videoProvider.audioReviewed !== true)) || !mediaStore) throw new Error('Video submission disabled');
      const ownerId = await owner(input);
      const reservation = (encodedVideoProvider ?? videoProvider!).reservedMicros;
      if (!Number.isSafeInteger(reservation) || reservation <= 0) throw new Error('Invalid reservation');
      const snapshot = transact(db => read(db, input.id, ownerId));
      if (!snapshot || snapshot.simulation !== simulation || !['audio_assembled', 'video_pending'].includes(snapshot.status) || !snapshot.audioAssembly) throw new Error('Submission prohibited');
      const segmentIndex = snapshot.videoJobs?.length ?? 0;
      for (let i = 0; i < segmentIndex; i++) {
        const job = snapshot.videoJobs![i], asset = snapshot.videoAssets?.find(a => a.segmentIndex === i), check = snapshot.videoChecks?.find(c => c.segmentIndex === i);
        if (job.segmentIndex !== i || job.status !== 'completed' || !asset || check?.sha256 !== asset.sha256) throw new Error('Previous segment not verified');
        const stored = await mediaStore.get({ cookie: input.cookie, now: input.now, courseId: snapshot.id, revision: snapshot.revision, assetId: asset.assetId });
        if (!stored || stored.sha256 !== asset.sha256) throw new Error('Previous segment unavailable');
      }
      const segment = snapshot.audioAssembly.segments[segmentIndex];
      if (!segment) throw new Error('Missing segment');
      const media = await mediaStore.get({ cookie: input.cookie, now: input.now, courseId: snapshot.id, revision: snapshot.revision, assetId: segment.assetId });
      if (!media || media.sha256 !== segment.sha256 || wavDuration(media.bytes) !== segment.duration) throw new Error('Invalid segment media');
      let encoded: EncodedAudio | undefined;
      if (encodedVideoProvider) {
        for (const [index, source] of snapshot.audioAssembly.segments.entries()) {
          const saved = snapshot.encodedAudio?.find(audio => audio.segmentIndex === index);
          const review = snapshot.audioReviews?.find(value => value.segmentIndex === index);
          if (!saved || saved.sourceSha256 !== source.sha256 || saved.sourceDuration !== source.duration || !review || review.revision !== snapshot.revision || review.sha256 !== saved.sha256 || review.sourceSha256 !== source.sha256) throw new Error('All encoded audio must be confirmed');
          const stored = await mediaStore.get({ cookie: input.cookie, now: input.now, courseId: snapshot.id, revision: snapshot.revision, assetId: saved.assetId });
          if (!stored || stored.size !== saved.size || stored.sha256 !== saved.sha256 || createHash('sha256').update(stored.bytes).digest('hex') !== saved.sha256) throw new Error('Encoded audio unavailable');
          if (index === segmentIndex) encoded = { bytes: Buffer.from(stored.bytes), sha256: saved.sha256, sourceSha256: saved.sourceSha256, sourceDuration: saved.sourceDuration, duration: saved.duration, mimeType: saved.mimeType, decoded: saved.decoded };
        }
      }
      const task = transact(db => {
        const value = read(db, input.id, ownerId);
        if (!value || value.status !== snapshot.status || JSON.stringify(value.encodedAudio) !== JSON.stringify(snapshot.encodedAudio) || JSON.stringify(value.audioReviews) !== JSON.stringify(snapshot.audioReviews) || JSON.stringify(value.videoJobs) !== JSON.stringify(snapshot.videoJobs) || JSON.stringify(value.videoChecks) !== JSON.stringify(snapshot.videoChecks) || JSON.stringify(value.audioAssembly) !== JSON.stringify(snapshot.audioAssembly) || !Number.isSafeInteger(value.reservedMicros + reservation)) throw new Error('Submission prohibited');
        checkReservation(db, reservation);
        value.status = 'submitting'; value.pid = process.pid; value.reservedMicros += reservation; value.providerCalls++;
        save(db, value); return value;
      });
      let id: string | undefined;
      try {
        const response = encodedVideoProvider && encoded
          ? await encodedVideoProvider.submit({ audio: encoded, reviewedSha256: encoded.sha256, goal: task.goal })
          : await videoProvider!.submit({ bytes: media.bytes, duration: segment.duration, goal: task.goal });
        if (response?.status === 'pending' && typeof response.jobId === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(response.jobId)) id = response.jobId;
      } catch { /* Unknown submission: retain reservation and never resubmit automatically. */ }
      return transact(db => {
        task.status = id ? 'video_pending' : 'submission_unknown';
        if (id) task.videoJobs = [...(task.videoJobs ?? []), { segmentIndex, jobId: id, status: 'pending', ...(encoded ? { audioSha256: encoded.sha256, audioDuration: encoded.duration } : {}) }];
        save(db, task); return task;
      });
    },
    async queryVideo(input: Session & { id: string }) {
      if (!simulation && (!budget || !encodedVideoProvider)) throw new Error('Video query disabled');
      const ownerId = await owner(input);
      const snapshot = transact(db => read(db, input.id, ownerId));
      const job = snapshot?.videoJobs?.at(-1);
      if (!snapshot || snapshot.simulation !== simulation || snapshot.status !== 'video_pending' || !job) throw new Error('Query prohibited');
      const provider = job.audioSha256 !== undefined ? encodedVideoProvider : videoProvider;
      if (!provider?.query) throw new Error('Video query disabled');
      if (job.status === 'completed' || job.status === 'failed') return snapshot;
      let result;
      try { result = await provider.query(job.jobId); } catch { throw new Error('Video status unavailable'); }
      if (!result || result.jobId !== job.jobId || !['pending', 'processing', 'failed', 'completed'].includes(result.status)) throw new Error('Invalid video status');
      return transact(db => {
        const current = read(db, snapshot.id, ownerId), latest = current?.videoJobs?.find(value => value.segmentIndex === job.segmentIndex);
        if (!current || current.status !== 'video_pending' || latest?.jobId !== job.jobId) throw new Error('Task changed during query');
        if (latest.status !== 'completed' && latest.status !== 'failed' && !(latest.status === 'processing' && result.status === 'pending')) latest.status = result.status as VideoJob['status'];
        // Provider completion alone is not validated media or a publishable course.
        save(db, current); return current;
      });
    },
    async collectVideo(input: Session & { id: string }) {
      if ((!simulation && (!budget || !encodedVideoProvider)) || !videoDownload || !mediaStore) throw new Error('Video collection disabled');
      const ownerId = await owner(input);
      const snapshot = transact(db => read(db, input.id, ownerId));
      const job = snapshot?.videoJobs?.at(-1);
      if (!snapshot || snapshot.simulation !== simulation || snapshot.status !== 'video_pending' || !job || job.status === 'failed') throw new Error('Collection prohibited');
      const provider = job.audioSha256 !== undefined ? encodedVideoProvider : videoProvider;
      if (!provider?.query) throw new Error('Video collection disabled');
      if (snapshot.videoAssets?.some(asset => asset.segmentIndex === job.segmentIndex)) return snapshot;
      let metadata;
      try {
        // Query afresh for a temporary URL; never persist the URL or provider error details.
        const result = await provider.query(job.jobId);
        if (result?.jobId !== job.jobId || result.status !== 'completed' || typeof result.videoUrl !== 'string') throw new Error('Video unavailable');
        const url = new URL(result.videoUrl);
        if (result.videoUrl.length > 8192 || url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Invalid media URL');
        // Injected server downloader owns the host allowlist and transfer size limits.
        const downloaded = await videoDownload(result.videoUrl);
        metadata = await mediaStore.put({ cookie: input.cookie, now: input.now, courseId: snapshot.id, revision: snapshot.revision,
          assetId: `video-${job.segmentIndex}`, bytes: downloaded.bytes, sha256: downloaded.sha256 });
      } catch { throw new Error('Video collection failed'); }
      return transact(db => {
        const current = read(db, snapshot.id, ownerId), latest = current?.videoJobs?.find(value => value.segmentIndex === job.segmentIndex);
        if (!current || current.status !== 'video_pending' || latest?.jobId !== job.jobId || latest.status === 'failed') throw new Error('Task changed during collection');
        if (current.videoAssets?.some(asset => asset.segmentIndex === job.segmentIndex)) return current;
        latest.status = 'completed';
        current.videoAssets = [...(current.videoAssets ?? []), { segmentIndex: job.segmentIndex, assetId: metadata.assetId, sha256: metadata.sha256, size: metadata.size }];
        // Stored bytes are not yet a probed, playable video or an accepted course.
        save(db, current); return current;
      });
    },
    async repairVideo(input: Session & { id: string }) {
      if ((!simulation && !budget) || !mediaStore || !videoRepair) throw new Error('Video repair disabled');
      const ownerId = await owner(input);
      const snapshot = transact(db => read(db, input.id, ownerId));
      const job = snapshot?.videoJobs?.at(-1), index = job?.segmentIndex;
      const asset = snapshot?.videoAssets?.find(value => value.segmentIndex === index);
      const segment = index === undefined ? undefined : snapshot?.audioAssembly?.segments[index];
      if (!snapshot || snapshot.simulation !== simulation || snapshot.status !== 'video_pending' || job?.status !== 'completed' || index === undefined || !asset || !segment) throw new Error('Repair prohibited');
      const locator = { cookie: input.cookie, now: input.now, courseId: snapshot.id, revision: snapshot.revision };
      const video = await mediaStore.get({ ...locator, assetId: asset.assetId });
      if (!video || video.sha256 !== asset.sha256 || video.size !== asset.size || createHash('sha256').update(video.bytes).digest('hex') !== asset.sha256) throw new Error('Repair media unavailable');
      const previous = snapshot.videoRepairs?.find(value => value.segmentIndex === index);
      if (previous) {
        if (previous.repairedSha256 !== asset.sha256 || previous.sourceAudioSha256 !== segment.sha256) throw new Error('Repair provenance mismatch');
        return snapshot;
      }
      let result: Awaited<ReturnType<typeof repairAndVerifyVideoTail>>;
      let metadata;
      try {
        const audio = await mediaStore.get({ ...locator, assetId: segment.assetId });
        if (!audio || audio.sha256 !== segment.sha256 || createHash('sha256').update(audio.bytes).digest('hex') !== segment.sha256 || wavDuration(audio.bytes) !== segment.duration) throw new Error('Invalid repair audio');
        result = await videoRepair({ video: { bytes: video.bytes, sha256: asset.sha256 }, audio: { bytes: audio.bytes, sha256: segment.sha256 } });
        if (!result || !(result.bytes instanceof Uint8Array) || !result.bytes.length || result.bytes.length >= 100_000_000 || createHash('sha256').update(result.bytes).digest('hex') !== result.sha256 || result.sourceVideoSha256 !== asset.sha256 || result.sourceAudioSha256 !== segment.sha256 || result.decoded !== true || !Number.isFinite(result.duration) || Math.abs(result.duration - segment.duration) > 1 / 24 + 0.001001 || result.width !== 720 || result.height !== 1280 || result.fps !== 24 || result.videoCodec !== 'h264' || result.audioCodec !== 'aac') throw new Error('Invalid repair result');
        metadata = await mediaStore.put({ ...locator, assetId: `video-repair-${index}-${result.sha256}`, bytes: result.bytes, sha256: result.sha256 });
      } catch { throw new Error('Video repair failed'); }
      return transact(db => {
        const current = read(db, snapshot.id, ownerId);
        const latest = current?.videoAssets?.find(value => value.segmentIndex === index);
        if (!current || current.status !== 'video_pending' || JSON.stringify(latest) !== JSON.stringify(asset) || JSON.stringify(current.videoJobs) !== JSON.stringify(snapshot.videoJobs) || JSON.stringify(current.audioAssembly) !== JSON.stringify(snapshot.audioAssembly)) throw new Error('Task changed during repair');
        current.videoAssets = current.videoAssets!.map(value => value.segmentIndex === index ? { segmentIndex: index, assetId: metadata.assetId, sha256: metadata.sha256, size: metadata.size } : value);
        current.videoChecks = [...(current.videoChecks ?? []).filter(value => value.segmentIndex !== index), { segmentIndex: index, sha256: result.sha256, duration: result.duration, width: result.width, height: result.height, fps: result.fps, videoCodec: result.videoCodec, audioCodec: result.audioCodec }];
        current.videoRepairs = [...(current.videoRepairs ?? []), { segmentIndex: index, originalAssetId: asset.assetId, sourceVideoSha256: asset.sha256, sourceAudioSha256: segment.sha256, repairedSha256: result.sha256 }];
        save(db, current); return current;
      });
    },
    async probeVideo(input: Session & { id: string }) {
      if ((!simulation && !budget) || !mediaStore || !videoProbe) throw new Error('Video probe disabled');
      const ownerId = await owner(input);
      const snapshot = transact(db => read(db, input.id, ownerId));
      const job = snapshot?.videoJobs?.at(-1);
      const segmentIndex = job?.segmentIndex;
      const asset = snapshot?.videoAssets?.find(value => value.segmentIndex === segmentIndex);
      const segment = segmentIndex === undefined ? undefined : snapshot?.audioAssembly?.segments[segmentIndex];
      if (!snapshot || snapshot.simulation !== simulation || snapshot.status !== 'video_pending' || !asset || !segment || segmentIndex === undefined) throw new Error('Probe prohibited');
      const expectedDuration = job?.audioSha256 !== undefined ? job.audioDuration : segment.duration;
      if (typeof expectedDuration !== 'number' || !Number.isFinite(expectedDuration) || expectedDuration <= 0 || expectedDuration > 20) throw new Error('Invalid submitted audio duration');
      let checked: VideoCheck;
      try {
        const media = await mediaStore.get({ cookie: input.cookie, now: input.now, courseId: snapshot.id, revision: snapshot.revision, assetId: asset.assetId });
        if (!media || media.sha256 !== asset.sha256 || media.size !== asset.size || createHash('sha256').update(media.bytes).digest('hex') !== asset.sha256) throw new Error('Invalid media');
        const result = await videoProbe({ bytes: media.bytes, sha256: asset.sha256, expectedDuration });
        if (!result || result.sha256 !== asset.sha256 || !Number.isFinite(result.duration) || result.duration <= 0 || result.duration > 20 || Math.abs(result.duration - expectedDuration) > Math.max(1 / 24, 1024 / 8000) + 0.001002 || result.width !== 720 || result.height !== 1280 || result.fps !== 24 || result.videoCodec !== 'h264' || result.audioCodec !== 'aac') throw new Error('Invalid probe result');
        checked = { sha256: result.sha256, duration: result.duration, width: result.width, height: result.height, fps: result.fps, videoCodec: result.videoCodec, audioCodec: result.audioCodec };
      } catch { throw new Error('Video verification failed'); }
      return transact(db => {
        const current = read(db, snapshot.id, ownerId);
        const latest = current?.videoAssets?.find(value => value.segmentIndex === segmentIndex);
        if (!current || current.status !== 'video_pending' || JSON.stringify(latest) !== JSON.stringify(asset) || JSON.stringify(current.videoJobs?.at(-1)) !== JSON.stringify(job) || JSON.stringify(current.audioAssembly?.segments[segmentIndex]) !== JSON.stringify(segment)) throw new Error('Task changed during probe');
        current.videoChecks = [...(current.videoChecks ?? []).filter(value => value.segmentIndex !== segmentIndex), { segmentIndex, ...checked }];
        // A probe report is evidence, not a complete decode or course acceptance.
        save(db, current); return current;
      });
    },
    async assembleVideo(input: Session & { id: string }) {
      if ((!simulation && !budget) || !mediaStore || !videoConcat || !finalVideoVerify) throw new Error('Video assembly disabled');
      const ownerId = await owner(input);
      const snapshot = transact(db => read(db, input.id, ownerId));
      if (!snapshot || snapshot.simulation !== simulation) throw new Error('Assembly prohibited');
      const locator = { cookie: input.cookie, now: input.now, courseId: snapshot.id, revision: snapshot.revision };
      if (snapshot.status === 'video_assembled') {
        const final = snapshot.finalVideo;
        const stored = final && await mediaStore.get({ ...locator, assetId: final.assetId });
        if (!stored || stored.sha256 !== final!.sha256 || stored.size !== final!.size) throw new Error('Final media unavailable');
        return snapshot;
      }
      const audio = snapshot.audioAssembly;
      if (snapshot.status !== 'video_pending' || !audio || snapshot.videoJobs?.length !== audio.segments.length || snapshot.videoAssets?.length !== audio.segments.length || snapshot.videoChecks?.length !== audio.segments.length) throw new Error('Incomplete video sources');
      const sources = [], segments = [], audioStages = [];
      for (let i = 0; i < audio.segments.length; i++) {
        const job = snapshot.videoJobs[i], asset = snapshot.videoAssets.find(a => a.segmentIndex === i), check = snapshot.videoChecks.find(c => c.segmentIndex === i);
        if (job.segmentIndex !== i || job.status !== 'completed' || !asset || !check || check.sha256 !== asset.sha256) throw new Error('Unverified video source');
        const stored = await mediaStore.get({ ...locator, assetId: asset.assetId });
        if (!stored || stored.sha256 !== asset.sha256 || stored.size !== asset.size || createHash('sha256').update(stored.bytes).digest('hex') !== asset.sha256) throw new Error('Video source unavailable');
        const submittedAudioDuration = job.audioSha256 !== undefined ? job.audioDuration : audio.segments[i].duration;
        if (typeof submittedAudioDuration !== 'number' || !Number.isFinite(submittedAudioDuration)) throw new Error('Missing submitted duration');
        audioStages.push({ sourceDuration: audio.segments[i].duration, submittedDuration: submittedAudioDuration });
        sources.push({ bytes: stored.bytes, sha256: asset.sha256 });
        segments.push({ segmentIndex: i, assetId: asset.assetId, sha256: asset.sha256, duration: check.duration, submittedAudioDuration });
      }
      const timeline = planVideoTimeline({ segments, audioAssembly: audio });
      const token = randomUUID();
      transact(db => {
        const current = read(db, snapshot.id, ownerId);
        if (!current || current.status !== 'video_pending' || JSON.stringify(current) !== JSON.stringify(snapshot)) throw new Error('Task changed before final assembly');
        const lock = db.prepare('SELECT pid FROM final_assembly_locks WHERE task=?').get(snapshot.id);
        if (lock) {
          let dead = false;
          try { process.kill(Number(lock.pid), 0); } catch (error) { dead = (error as NodeJS.ErrnoException).code === 'ESRCH'; }
          if (!dead) throw new Error('Final assembly already running');
          db.prepare('DELETE FROM final_assembly_locks WHERE task=?').run(snapshot.id);
        }
        db.prepare('INSERT INTO final_assembly_locks VALUES(?,?,?,?)').run(snapshot.id, ownerId, token, process.pid);
      });
      try {
        const joined = await videoConcat(sources);
        if (!(joined?.bytes instanceof Uint8Array) || !joined.bytes.length || joined.bytes.length > 100_000_000) throw new Error('Invalid assembled video');
        const bytes = Buffer.from(joined.bytes), sha256 = createHash('sha256').update(bytes).digest('hex');
        if (sha256 !== joined.sha256) throw new Error('Invalid assembled integrity');
        const checked = await finalVideoVerify({ bytes: Buffer.from(bytes), sha256, plan: { sourceDuration: audio.duration, segmentDurations: segments.map(s => s.duration), ...(snapshot.videoJobs.some(job => job.audioSha256 !== undefined) ? { audioStages } : {}) } });
        if (!checked || checked.sha256 !== sha256 || checked.decoded !== true || !Number.isFinite(checked.duration) || Math.abs(checked.duration - timeline.duration) > 0.001001 || checked.width !== 720 || checked.height !== 1280 || !Number.isFinite(checked.fps) || Math.abs(checked.fps - 24) > 0.001 || checked.videoCodec !== 'h264' || checked.audioCodec !== 'aac') throw new Error('Invalid final verification');
        const assetId = `final-${sha256}`;
        const metadata = await mediaStore.put({ ...locator, assetId, bytes, sha256 });
        // Publish only after immutable bytes are saved; never mark a complete course ready here.
        return transact(db => {
          const current = read(db, snapshot.id, ownerId);
          if (current?.status === 'video_assembled' && current.finalVideo?.sha256 === sha256) return current;
          if (!current || current.status !== 'video_pending' || JSON.stringify(current.audioAssembly) !== JSON.stringify(audio) || JSON.stringify(current.videoJobs) !== JSON.stringify(snapshot.videoJobs) || JSON.stringify(current.videoAssets) !== JSON.stringify(snapshot.videoAssets) || JSON.stringify(current.videoChecks) !== JSON.stringify(snapshot.videoChecks)) throw new Error('Task changed during final assembly');
          current.finalVideo = { assetId, size: metadata.size, sha256, decoded: true, duration: checked.duration, width: checked.width, height: checked.height, fps: checked.fps, videoCodec: checked.videoCodec, audioCodec: checked.audioCodec };
          current.videoTimeline = timeline;
          current.status = 'video_assembled';
          buildGeneratedCourse(current);
          save(db, current); return current;
        });
      } finally {
        transact(db => db.prepare('DELETE FROM final_assembly_locks WHERE task=? AND owner=? AND token=?').run(snapshot.id, ownerId, token));
      }
    },
    async runSimulation(input: Session & { id: string; reservedMicros: number }, provider: () => Promise<{ jobId: string }>) {
      if (simulation !== true) throw new Error('Provider calls disabled');
      const ownerId = await owner(input);
      if (!Number.isSafeInteger(input.reservedMicros) || input.reservedMicros <= 0) throw new Error('Invalid reservation');
      const task = transact(db => {
        const value = read(db, input.id, ownerId);
        if (!value || !value.simulation || value.status !== 'awaiting_budget') throw new Error('Submission prohibited');
        checkReservation(db, input.reservedMicros);
        value.status = 'submitting'; value.pid = process.pid; value.reservedMicros = input.reservedMicros; value.providerCalls = 1; save(db, value); return value;
      });
      let jobId: string | undefined;
      try { const result = await provider(); if (typeof result?.jobId === 'string' && result.jobId.trim()) jobId = result.jobId; } catch { /* Unknown submission: retain reservation and prohibit retries. */ }
      return transact(db => { task.status = jobId ? 'video_pending' : 'submission_unknown'; if (jobId) task.providerJobId = jobId; save(db, task); return task; });
    },
  };
}

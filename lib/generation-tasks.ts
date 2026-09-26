import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { ownerIdFromSessionCookie } from './private-owner';
import { validateGeneratedScript, type GeneratedScript } from './generated-script';

import { wavDuration, planAudioSegments, type AudioAsset } from './generated-audio';
import type { createPrivateMediaStore } from './private-media-store';

import { assembleCourseAudio } from './assemble-course-audio';

type Assembly = ReturnType<typeof assembleCourseAudio>;
type SavedAssembly = Omit<Assembly, 'segments'> & { segments: (Omit<Assembly['segments'][number], 'bytes'> & { assetId: string })[] };
type SavedAudio = Omit<AudioAsset, 'bytes'> & { assetId: string };
type VideoJob = { segmentIndex: number; jobId: string; status: 'pending' | 'processing' | 'failed' | 'completed' };
type VideoProvider = { reservedMicros: number; audioReviewed: boolean; submit: (input: { bytes: Uint8Array; duration: number; goal: string }) => Promise<{ status: string; jobId?: string }>; query?: (id: string) => Promise<{ status: string; jobId: string; videoUrl?: string }> };
type Session = { cookie?: string | null; now?: number };
export type GenerationTask = { id: string; ownerId: string; goal: string; revision: number; status: 'awaiting_budget' | 'submitting' | 'submission_unknown' | 'video_pending' | 'script_ready' | 'audio_ready' | 'audio_assembled'; reservedMicros: number; providerCalls: number; simulation: boolean; providerJobId?: string; pid?: number; script?: GeneratedScript; audioAssets?: SavedAudio[]; audioAssembly?: SavedAssembly; videoJobs?: VideoJob[]; videoAssets?: { segmentIndex: number; assetId: string; sha256: string; size: number }[] };
type ScriptProvider = { reservedMicros: number; generate: (input: { goal: string }) => Promise<{ requestId: string; script: unknown }> };
export function createGenerationTaskStore({ directory, sessionSecret, simulation = false, scriptProvider, audioProvider, mediaStore, videoProvider, videoDownload }: { directory: string; sessionSecret: string; simulation?: boolean; scriptProvider?: ScriptProvider; videoProvider?: VideoProvider; videoDownload?: (url: string) => Promise<{ bytes: Uint8Array; sha256: string }>; audioProvider?: { reservedMicros: number; generate: (line: GeneratedScript['lines'][number]) => Promise<AudioAsset> }; mediaStore?: ReturnType<typeof createPrivateMediaStore> }) {
  if (!directory || !sessionSecret) throw new Error('Store configuration required');
  function transact<T>(work: (db: DatabaseSync) => T): T {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const path = join(directory, 'generation.sqlite');
    const db = new DatabaseSync(path, { timeout: 5000 });
    try {
      chmodSync(path, 0o600);
      db.exec('PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, owner TEXT NOT NULL, fingerprint TEXT NOT NULL, body TEXT NOT NULL, UNIQUE(owner,fingerprint)); CREATE TABLE IF NOT EXISTS requests (owner TEXT NOT NULL, key TEXT NOT NULL, fingerprint TEXT NOT NULL, PRIMARY KEY(owner,key)); BEGIN IMMEDIATE;');
      const result = work(db); db.exec('COMMIT'); return result;
    } finally { db.close(); }
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
  return {
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
        if (existing) { db.prepare('INSERT OR IGNORE INTO requests VALUES(?,?,?)').run(ownerId, input.requestKey, fingerprint); return read(db, String(existing.id), ownerId)!; }
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
      // This runner is for offline integration only until the live budget gate is implemented.
      if (simulation !== true || !scriptProvider) throw new Error('Script provider disabled');
      const ownerId = await owner(input);
      const reservedMicros = scriptProvider.reservedMicros;
      if (!Number.isSafeInteger(reservedMicros) || reservedMicros <= 0) throw new Error('Invalid reservation');
      const task = transact(db => {
        const value = read(db, input.id, ownerId);
        if (!value || !value.simulation || value.status !== 'awaiting_budget') throw new Error('Submission prohibited');
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
      if (simulation !== true || !audioProvider || !mediaStore) throw new Error('Audio provider disabled');
      const ownerId = await owner(input);
      const reservation = audioProvider.reservedMicros;
      if (!Number.isSafeInteger(reservation) || reservation <= 0) throw new Error('Invalid reservation');
      const task = transact(db => {
        const value = read(db, input.id, ownerId);
        if (!value || !value.simulation || value.status !== 'script_ready' || !value.script) throw new Error('Submission prohibited');
        const count = value.audioAssets?.length ?? 0;
        if (count >= value.script.lines.length || !Number.isSafeInteger(value.reservedMicros + reservation)) throw new Error('Submission prohibited');
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
      if (simulation !== true || !mediaStore) throw new Error('Audio assembly disabled');
      const ownerId = await owner(input);
      const task = transact(db => read(db, input.id, ownerId));
      if (!task || !task.simulation || task.status !== 'audio_ready' || !task.script || !task.audioAssets || task.audioAssets.length !== task.script.lines.length) throw new Error('Assembly prohibited');
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
    async runVideo(input: Session & { id: string }) {
      if (simulation !== true || !videoProvider || videoProvider.audioReviewed !== true || !mediaStore) throw new Error('Video submission disabled');
      const ownerId = await owner(input);
      const reservation = videoProvider.reservedMicros;
      if (!Number.isSafeInteger(reservation) || reservation <= 0) throw new Error('Invalid reservation');
      const snapshot = transact(db => read(db, input.id, ownerId));
      if (!snapshot || !snapshot.simulation || snapshot.status !== 'audio_assembled' || !snapshot.audioAssembly || snapshot.videoJobs?.length) throw new Error('Submission prohibited');
      // First segment only; later segments require completed-media verification before continuation.
      const segment = snapshot.audioAssembly.segments[0];
      if (!segment) throw new Error('Missing segment');
      const media = await mediaStore.get({ cookie: input.cookie, now: input.now, courseId: snapshot.id, revision: snapshot.revision, assetId: segment.assetId });
      if (!media || media.sha256 !== segment.sha256 || wavDuration(media.bytes) !== segment.duration) throw new Error('Invalid segment media');
      const task = transact(db => {
        const value = read(db, input.id, ownerId);
        if (!value || value.status !== 'audio_assembled' || value.videoJobs?.length || JSON.stringify(value.audioAssembly) !== JSON.stringify(snapshot.audioAssembly) || !Number.isSafeInteger(value.reservedMicros + reservation)) throw new Error('Submission prohibited');
        value.status = 'submitting'; value.pid = process.pid; value.reservedMicros += reservation; value.providerCalls++;
        save(db, value); return value;
      });
      let id: string | undefined;
      try {
        const response = await videoProvider.submit({ bytes: media.bytes, duration: segment.duration, goal: task.goal });
        if (response?.status === 'pending' && typeof response.jobId === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(response.jobId)) id = response.jobId;
      } catch { /* Unknown submission: retain reservation and never resubmit automatically. */ }
      return transact(db => {
        task.status = id ? 'video_pending' : 'submission_unknown';
        if (id) task.videoJobs = [{ segmentIndex: 0, jobId: id, status: 'pending' }];
        save(db, task); return task;
      });
    },
    async queryVideo(input: Session & { id: string }) {
      if (simulation !== true || !videoProvider?.query) throw new Error('Video query disabled');
      const ownerId = await owner(input);
      const snapshot = transact(db => read(db, input.id, ownerId));
      const job = snapshot?.videoJobs?.[0];
      if (!snapshot?.simulation || snapshot.status !== 'video_pending' || !job) throw new Error('Query prohibited');
      if (job.status === 'completed' || job.status === 'failed') return snapshot;
      let result;
      try { result = await videoProvider.query(job.jobId); } catch { throw new Error('Video status unavailable'); }
      if (!result || result.jobId !== job.jobId || !['pending', 'processing', 'failed', 'completed'].includes(result.status)) throw new Error('Invalid video status');
      return transact(db => {
        const current = read(db, snapshot.id, ownerId), latest = current?.videoJobs?.[0];
        if (!current || current.status !== 'video_pending' || latest?.jobId !== job.jobId) throw new Error('Task changed during query');
        if (latest.status !== 'completed' && latest.status !== 'failed' && !(latest.status === 'processing' && result.status === 'pending')) latest.status = result.status as VideoJob['status'];
        // Provider completion alone is not validated media or a publishable course.
        save(db, current); return current;
      });
    },
    async collectVideo(input: Session & { id: string }) {
      if (simulation !== true || !videoProvider?.query || !videoDownload || !mediaStore) throw new Error('Video collection disabled');
      const ownerId = await owner(input);
      const snapshot = transact(db => read(db, input.id, ownerId));
      const job = snapshot?.videoJobs?.[0];
      if (!snapshot?.simulation || snapshot.status !== 'video_pending' || !job || job.status === 'failed') throw new Error('Collection prohibited');
      if (snapshot.videoAssets?.some(asset => asset.segmentIndex === job.segmentIndex)) return snapshot;
      let metadata;
      try {
        // Query afresh for a temporary URL; never persist the URL or provider error details.
        const result = await videoProvider.query(job.jobId);
        if (result?.jobId !== job.jobId || result.status !== 'completed' || typeof result.videoUrl !== 'string') throw new Error('Video unavailable');
        const url = new URL(result.videoUrl);
        if (result.videoUrl.length > 8192 || url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Invalid media URL');
        // Injected server downloader owns the host allowlist and transfer size limits.
        const downloaded = await videoDownload(result.videoUrl);
        metadata = await mediaStore.put({ cookie: input.cookie, now: input.now, courseId: snapshot.id, revision: snapshot.revision,
          assetId: `video-${job.segmentIndex}`, bytes: downloaded.bytes, sha256: downloaded.sha256 });
      } catch { throw new Error('Video collection failed'); }
      return transact(db => {
        const current = read(db, snapshot.id, ownerId), latest = current?.videoJobs?.[0];
        if (!current || current.status !== 'video_pending' || latest?.jobId !== job.jobId || latest.status === 'failed') throw new Error('Task changed during collection');
        if (current.videoAssets?.some(asset => asset.segmentIndex === job.segmentIndex)) return current;
        latest.status = 'completed';
        current.videoAssets = [...(current.videoAssets ?? []), { segmentIndex: job.segmentIndex, assetId: metadata.assetId, sha256: metadata.sha256, size: metadata.size }];
        // Stored bytes are not yet a probed, playable video or an accepted course.
        save(db, current); return current;
      });
    },
    async runSimulation(input: Session & { id: string; reservedMicros: number }, provider: () => Promise<{ jobId: string }>) {
      if (simulation !== true) throw new Error('Provider calls disabled');
      const ownerId = await owner(input);
      if (!Number.isSafeInteger(input.reservedMicros) || input.reservedMicros <= 0) throw new Error('Invalid reservation');
      const task = transact(db => {
        const value = read(db, input.id, ownerId);
        if (!value || !value.simulation || value.status !== 'awaiting_budget') throw new Error('Submission prohibited');
        value.status = 'submitting'; value.pid = process.pid; value.reservedMicros = input.reservedMicros; value.providerCalls = 1; save(db, value); return value;
      });
      let jobId: string | undefined;
      try { const result = await provider(); if (typeof result?.jobId === 'string' && result.jobId.trim()) jobId = result.jobId; } catch { /* Unknown submission: retain reservation and prohibit retries. */ }
      return transact(db => { task.status = jobId ? 'video_pending' : 'submission_unknown'; if (jobId) task.providerJobId = jobId; save(db, task); return task; });
    },
  };
}

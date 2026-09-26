import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { ownerIdFromSessionCookie } from './private-owner';
import { validateGeneratedScript, type GeneratedScript } from './generated-script';

import { wavDuration, planAudioSegments, type AudioAsset } from './generated-audio';
import type { createPrivateMediaStore } from './private-media-store';

type SavedAudio = Omit<AudioAsset, 'bytes'> & { assetId: string };
type Session = { cookie?: string | null; now?: number };
export type GenerationTask = { id: string; ownerId: string; goal: string; revision: number; status: 'awaiting_budget' | 'submitting' | 'submission_unknown' | 'video_pending' | 'script_ready' | 'audio_ready'; reservedMicros: number; providerCalls: number; simulation: boolean; providerJobId?: string; pid?: number; script?: GeneratedScript; audioAssets?: SavedAudio[] };
type ScriptProvider = { reservedMicros: number; generate: (input: { goal: string }) => Promise<{ requestId: string; script: unknown }> };
export function createGenerationTaskStore({ directory, sessionSecret, simulation = false, scriptProvider, audioProvider, mediaStore }: { directory: string; sessionSecret: string; simulation?: boolean; scriptProvider?: ScriptProvider; audioProvider?: { reservedMicros: number; generate: (line: GeneratedScript['lines'][number]) => Promise<AudioAsset> }; mediaStore?: ReturnType<typeof createPrivateMediaStore> }) {
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

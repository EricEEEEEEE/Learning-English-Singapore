import type { createGenerationTaskStore, GenerationTask } from './generation-tasks';

type Store = Pick<ReturnType<typeof createGenerationTaskStore>, 'get' | 'runScript' | 'runAudio' | 'assembleAudio' | 'encodeAudio' | 'confirmEncodedAudio' | 'runVideo' | 'queryVideo' | 'collectVideo' | 'chainReferenceImage' | 'repairVideo' | 'probeVideo' | 'assembleVideo'>;
type Input = { cookie?: string | null; now?: number; id: string };
type Encoded = NonNullable<GenerationTask['encodedAudio']>[number];
type Segment = NonNullable<GenerationTask['audioAssembly']>['segments'][number];
export type AudioReview = (input: Input & { task: GenerationTask; segmentIndex: number; encoded: Encoded; segment: Segment }) => Promise<boolean>;
export type RunStop = 'ready' | 'waiting' | 'unknown' | 'failed' | 'budget' | 'needs_review' | 'review_failed' | 'error';
export type RunResult = { stopped: RunStop; status?: GenerationTask['status'] };

const MAX_STEPS = 500;

// Drives one stored task through the existing guarded store operations. Every provider call still goes through
// the store, so reservations, ownership and "never resubmit unknown work" stay enforced there; the runner only
// decides which operation comes next from persisted state, so a new process resumes where the last one stopped.
export function createGenerationRunner({ store, audioReview, wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)), pollMs = 5000, maxPolls = 120 }: { store: Store; audioReview?: AudioReview; wait?: (ms: number) => Promise<void>; pollMs?: number; maxPolls?: number }) {
  const running = new Map<string, Promise<RunResult>>();

  async function step(input: Input, task: GenerationTask, polls: { count: number }): Promise<RunStop | null> {
    switch (task.status) {
      case 'video_assembled': return 'ready';
      case 'submission_unknown': case 'submitting': return 'unknown';
      case 'awaiting_budget': await store.runScript(input); return null;
      case 'script_ready': await store.runAudio(input); return null;
      case 'audio_ready': await store.assembleAudio(input); return null;
      case 'audio_assembled': {
        const segments = task.audioAssembly?.segments ?? [];
        const encoded = task.encodedAudio ?? [];
        for (const item of encoded) {
          const reviewed = task.audioReviews?.some(review => review.segmentIndex === item.segmentIndex && review.sha256 === item.sha256 && review.revision === task.revision);
          if (reviewed) continue;
          if (!audioReview) return 'needs_review';
          const segment = segments[item.segmentIndex];
          if (!segment || !(await audioReview({ ...input, task, segmentIndex: item.segmentIndex, encoded: item, segment }))) return 'review_failed';
          await store.confirmEncodedAudio({ ...input, revision: task.revision, segmentIndex: item.segmentIndex, sha256: item.sha256 });
          return null;
        }
        if (encoded.length < segments.length) await store.encodeAudio(input);
        else await store.runVideo(input);
        return null;
      }
      case 'video_pending': {
        const jobs = task.videoJobs ?? [];
        const job = jobs.at(-1);
        if (!job) return 'error';
        if (jobs.some(item => item.status === 'failed')) return 'failed';
        if (job.status === 'pending' || job.status === 'processing') {
          if (polls.count > 0) {
            if (polls.count >= maxPolls) return 'waiting';
            await wait(pollMs);
          }
          polls.count++;
          await store.queryVideo(input);
          return null;
        }
        polls.count = 0;
        const asset = task.videoAssets?.find(item => item.segmentIndex === job.segmentIndex);
        if (!asset) { await store.collectVideo(input); return null; }
        const checked = task.videoChecks?.some(item => item.segmentIndex === job.segmentIndex && item.sha256 === asset.sha256);
        // A segment driven by partner-only audio gets the full course audio (learner lines included) put back
        // by the repair step before its probe; the provider's own audio track is never kept.
        const driven = !!(task.audioAssembly?.segments[job.segmentIndex] as { driveSha256?: string } | undefined)?.driveSha256;
        if (driven && !task.videoRepairs?.some(item => item.segmentIndex === job.segmentIndex)) { await store.repairVideo(input); return null; }
        if (!checked) {
          try { await store.probeVideo(input); }
          catch {
            // A short codec tail gets one bounded repair, then the probe must pass on the repaired bytes.
            if (task.videoRepairs?.some(item => item.segmentIndex === job.segmentIndex)) throw new Error('Probe failed after repair');
            await store.repairVideo(input);
          }
          return null;
        }
        const segments = task.audioAssembly?.segments.length ?? 0;
        // A segment after the first continues from the previous one's last frame (scripts with a scene only).
        if (jobs.length < segments && task.script?.scene && !(task.referenceImage?.sourceCourseId === task.id && task.referenceImage.sourceAssetId === asset.assetId)) { await store.chainReferenceImage(input); return null; }
        if (jobs.length < segments) await store.runVideo(input);
        else await store.assembleVideo(input);
        return null;
      }
      default: return 'error';
    }
  }

  async function run(input: Input): Promise<RunResult> {
    const polls = { count: 0 };
    let task: GenerationTask | null = null;
    try {
      for (let i = 0; i < MAX_STEPS; i++) {
        task = await store.get(input);
        if (!task) return { stopped: 'error' };
        const stop = await step(input, task, polls);
        if (stop) return { stopped: stop, status: task.status };
      }
      return { stopped: 'error', status: task?.status };
    } catch (error) {
      const latest = await store.get(input).catch(() => null) ?? task;
      if (error instanceof Error && error.message === 'Total reservation limit exceeded') return { stopped: 'budget', status: latest?.status };
      if (latest?.status === 'submission_unknown') return { stopped: 'unknown', status: latest.status };
      return { stopped: 'error', status: latest?.status };
    }
  }

  return {
    // Overlapping calls for the same task share one run, so a double click or a status poll never doubles work.
    advance(input: Input): Promise<RunResult> {
      const existing = running.get(input.id);
      if (existing) return existing;
      const promise = run(input).finally(() => running.delete(input.id));
      running.set(input.id, promise);
      return promise;
    },
    isRunning: (id: string) => running.has(id),
  };
}

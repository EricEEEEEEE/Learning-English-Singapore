import { createHash } from 'node:crypto';
import { parseSceneRequirement, type SceneRequirement } from './scene-requirement-content';
import type { createSceneRequirementStore } from './scene-requirements';
import type { createGenerationTaskStore, GenerationTask } from './generation-tasks';

export type SceneGenerationPhase = 'not_submitted' | Exclude<GenerationTask['status'], 'deleted'> | 'failed' | 'simulation' | 'media_unavailable' | 'ready';
export type SceneCoursePointer = { id: string; revision: number; materialsRevision?: number };
export type SceneGenerationView = { requirement: SceneRequirement; task: null | Pick<GenerationTask, 'id' | 'revision' | 'status' | 'simulation' | 'providerCalls'> & { requirementRevision: number }; phase: SceneGenerationPhase; course: SceneCoursePointer | null };
type Session = { cookie?: string | null; now?: number };
type Input = Session & { requirementRevision: number };
type Tasks = Pick<ReturnType<typeof createGenerationTaskStore>, 'create' | 'findForRequirement' | 'getCourse'>;

export function createSceneGenerationService({ requirements, tasks }: { requirements: ReturnType<typeof createSceneRequirementStore>; tasks: Tasks }) {
  async function project(input: Input, requirement: SceneRequirement, task: GenerationTask | null): Promise<SceneGenerationView> {
    if (!task) return { requirement, task: null, phase: 'not_submitted', course: null };
    if (!task.requirement || JSON.stringify(parseSceneRequirement(task.requirement)) !== JSON.stringify(requirement) || task.revision !== requirement.revision || task.goal !== requirement.content.description.trim()) throw new Error('Task source mismatch');
    const visible = { id: task.id, revision: task.revision, requirementRevision: requirement.revision, status: task.status, simulation: task.simulation, providerCalls: task.providerCalls };
    const view = (phase: SceneGenerationPhase, course: SceneCoursePointer | null = null): SceneGenerationView => ({ requirement, task: visible, phase, course });
    if (task.simulation) return view('simulation');
    if (task.videoJobs?.some(job => job.status === 'failed')) return view('failed');
    if (task.status !== 'video_assembled') {
      if (!['awaiting_budget', 'submitting', 'submission_unknown', 'script_ready', 'audio_ready', 'audio_assembled', 'video_pending'].includes(task.status)) throw new Error('Invalid task status');
      return view(task.status as Exclude<GenerationTask['status'], 'deleted' | 'video_assembled'>);
    }
    const pointer = { id: task.id, revision: task.revision, ...(task.materialsRevision !== undefined ? { materialsRevision: task.materialsRevision } : {}) };
    try {
      const course = await tasks.getCourse({ cookie: input.cookie, now: input.now, ...pointer });
      if (course.id !== task.id || course.revision !== task.revision || course.media.courseId !== task.id || course.media.revision !== task.revision || course.source !== 'ai-generated' || (pointer.materialsRevision !== undefined && (!('materialsRevision' in course) || course.materialsRevision !== pointer.materialsRevision))) throw new Error('Course source mismatch');
      return view('ready', pointer);
    } catch { return view('media_unavailable'); }
  }
  async function readRequirement(input: Input) {
    if (!Number.isSafeInteger(input.requirementRevision) || input.requirementRevision < 1) throw new Error('Invalid requirement revision');
    const requirement = await requirements.get({ cookie: input.cookie, now: input.now, revision: input.requirementRevision });
    if (!requirement) throw new Error('Requirement not found');
    return requirement;
  }
  return {
    async get(input: Input) {
      const requirement = await readRequirement(input);
      return project(input, requirement, await tasks.findForRequirement({ cookie: input.cookie, now: input.now, requirement }));
    },
    async submit(input: Input) {
      const requirement = await readRequirement(input);
      const requestKey = 'scene-' + createHash('sha256').update(JSON.stringify(requirement)).digest('hex');
      const task = await tasks.create({ cookie: input.cookie, now: input.now, goal: requirement.content.description, revision: requirement.revision, requirement, requestKey });
      // Read again to pin the same latest material revision as subsequent GETs.
      return project(input, requirement, await tasks.findForRequirement({ cookie: input.cookie, now: input.now, requirement }) ?? task);
    },
  };
}

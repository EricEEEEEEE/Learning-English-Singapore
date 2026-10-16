import { createLocalCourseStore } from './local-course-store';
import { createSceneProgressStore } from './scene-progress';
import { validateSceneCourse } from './scene-course';
import { emptySceneKeywords, parseSceneRequirement, type SceneRequirement } from './scene-requirement-content';
import type { SceneCoursePointer } from './scene-generation';

type Session = { cookie?: string | null; now?: number };
type CourseStore = Pick<ReturnType<typeof createLocalCourseStore>, 'list' | 'getCourse'>;
type ProgressStore = Pick<ReturnType<typeof createSceneProgressStore>, 'get' | 'save' | 'latest'>;
type Input = Session & SceneCoursePointer;
export type LearningScene = { course: SceneCoursePointer; description: string; duration: number; requirement: SceneRequirement; contextSource: 'requirement' | 'legacy-neutral' };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

export function parseLearningCoursePointer(input: unknown): SceneCoursePointer {
  if (!object(input) || Object.keys(input).some(key => !['id', 'revision', 'materialsRevision'].includes(key))
    || typeof input.id !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(input.id) || !positive(input.revision)
    || input.materialsRevision !== undefined && !positive(input.materialsRevision)) throw new Error('Invalid course selector');
  return { id: input.id, revision: input.revision, ...(input.materialsRevision === undefined ? {} : { materialsRevision: input.materialsRevision }) };
}
const select = (input: SceneCoursePointer) => parseLearningCoursePointer({ id: input.id, revision: input.revision, ...(input.materialsRevision === undefined ? {} : { materialsRevision: input.materialsRevision }) });

export function createLearningLibrary({ courseStore, progressStore }: { courseStore: CourseStore; progressStore: ProgressStore }) {
  async function readCourse(input: Input) {
    const pointer = select(input);
    // This existing private reader authenticates the cookie and verifies actual
    // media bytes. A remembered progress pointer never grants course access.
    const course = await courseStore.getCourse({ cookie: input.cookie, now: input.now, ...pointer });
    const material = 'materialsRevision' in course ? course.materialsRevision : undefined;
    if (course.id !== pointer.id || course.revision !== pointer.revision || material !== pointer.materialsRevision
      || course.source !== 'ai-generated' || course.media?.courseId !== pointer.id || course.media.revision !== pointer.revision
      || typeof course.media.assetId !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(course.media.assetId)
      || typeof course.media.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(course.media.sha256)
      || !Array.isArray(course.lines) || course.lines.some(line => line.revision !== pointer.revision)) throw new Error('Course unavailable');
    const version = String(pointer.revision);
    if (!validateSceneCourse({ ...course, version, source: 'ai-sample', media: { src: '/media/library-validation.mp4', duration: course.media.duration, version }, lines: course.lines.map(line => ({ ...line, version })) }).ok) throw new Error('Course unavailable');
    return course;
  }
  return {
    async list(input: Session): Promise<{ scenes: LearningScene[]; unavailable: number }> {
      const session = { cookie: input.cookie, now: input.now };
      // Failure of the source list is not an empty catalogue.
      const rows = await courseStore.list(session), scenes: LearningScene[] = [];
      let unavailable = 0;
      for (const row of rows) {
        if (row.status !== 'video_assembled' || row.simulation !== false) continue;
        try {
          const remembered = await progressStore.latest({ ...session, id: row.id, revision: row.revision });
          if (remembered && (remembered.id !== row.id || remembered.revision !== row.revision)) throw new Error('Course unavailable');
          const pointer = select(remembered ?? row), course = await readCourse({ ...session, ...pointer });
          if (remembered && remembered.mediaSha256 !== course.media.sha256) throw new Error('Course unavailable');
          const recorded = 'requirement' in row ? row.requirement : undefined;
          const requirement = recorded === undefined
            ? parseSceneRequirement({ revision: row.revision, content: { description: row.goal, language: 'zh-Hans', keywords: emptySceneKeywords() } })
            : parseSceneRequirement(recorded);
          if (requirement.revision !== row.revision || requirement.content.description.trim() !== row.goal.trim()) throw new Error('Course unavailable');
          scenes.push({ course: pointer, description: requirement.content.description, duration: course.media.duration, requirement, contextSource: recorded === undefined ? 'legacy-neutral' : 'requirement' });
        } catch (error) {
          if (error instanceof Error && error.message === 'Authenticated session required') throw error;
          unavailable++;
        }
      }
      return { scenes, unavailable };
    },
    async getProgress(input: Input) {
      const request = { cookie: input.cookie, now: input.now, ...select(input) };
      const course = await readCourse(request);
      return progressStore.get({ cookie: request.cookie, now: request.now, course });
    },
    async saveProgress(input: Input & { expectedVersion: number; position: unknown }) {
      const request = { cookie: input.cookie, now: input.now, ...select(input), expectedVersion: input.expectedVersion, position: structuredClone(input.position) };
      const course = await readCourse(request);
      return progressStore.save({ cookie: request.cookie, now: request.now, course, expectedVersion: request.expectedVersion, position: request.position });
    },
  };
}

export function createLocalLearningLibrary(directory: string, sessionSecret: string) {
  return createLearningLibrary({ courseStore: createLocalCourseStore(directory, sessionSecret), progressStore: createSceneProgressStore({ directory, sessionSecret }) });
}

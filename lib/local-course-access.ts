import type { createGenerationTaskStore } from './generation-tasks';
import type { createLocalCourseLibrary } from './local-course-library';

type Store = ReturnType<typeof createGenerationTaskStore>;
type Library = ReturnType<typeof createLocalCourseLibrary>;

// Copy identifiers have a separate namespace; failed reads must never fall back.
export function createLocalCourseAccess({ generationStore, library }: {
  generationStore: Pick<Store, 'list' | 'getCourse' | 'getCourseMedia'>;
  library: Pick<Library, 'list' | 'getCourse' | 'getCourseMedia'>;
}) {
  return {
    async list(input: Parameters<Store['list']>[0]) {
      const [generated, copies] = await Promise.all([generationStore.list(input), library.list({ ...input, now: input.now ?? Date.now() })]);
      return [...generated, ...copies.map(course => ({
        id: course.id, revision: course.revision,
        materialsRevision: 'materialsRevision' in course ? course.materialsRevision : undefined,
        status: 'video_assembled' as const, simulation: course.source === 'test-fixture',
      }))];
    },
    async getCourse(input: Parameters<Store['getCourse']>[0]) {
      if (!input.id.startsWith('copy-')) return generationStore.getCourse(input);
      if (input.materialsRevision === undefined) throw new Error('Course unavailable');
      return library.getCourse({ ...input, now: input.now ?? Date.now(), materialsRevision: input.materialsRevision });
    },
    getCourseMedia(input: Parameters<Store['getCourseMedia']>[0]) {
      return input.id.startsWith('copy-') ? library.getCourseMedia({ ...input, now: input.now ?? Date.now() }) : generationStore.getCourseMedia(input);
    },
  };
}

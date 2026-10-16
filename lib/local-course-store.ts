import { join } from 'node:path';
import { createGenerationTaskStore } from './generation-tasks';
import { createPrivateMediaStore } from './private-media-store';
import { createLocalCourseLibrary } from './local-course-library';
import { createLocalCourseAccess } from './local-course-access';

// All local read routes share the same owner-scoped course and media locations.
export function createLocalCourseStore(directory: string, sessionSecret: string) {
  const mediaStore = createPrivateMediaStore({ directory: join(directory, 'media'), sessionSecret });
  const generationStore = createGenerationTaskStore({ directory, sessionSecret, mediaStore });
  const library = createLocalCourseLibrary({ directory, sessionSecret, mediaStore });
  const access = createLocalCourseAccess({ generationStore, library });
  return {
    ...access,
    create: generationStore.create,
    findForRequirement: generationStore.findForRequirement,
    async get(input: Parameters<typeof generationStore.get>[0]) {
      if (!input.id.startsWith('copy-')) return generationStore.get(input);
      return (await access.list(input)).find(course => course.id === input.id);
    },
  };
}

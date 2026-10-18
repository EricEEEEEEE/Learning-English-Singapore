import { createLocalCourseStore } from './local-course-store';
import { createReviewQueueStore } from './review-queue';
import { createSentenceReportStore } from './sentence-reports';

// C13-1: the review queue the local routes use, reading courses through the private course reader and leaving out
// sentences whose own report was set to "disabled" (C9-5).
export function createLocalReviewQueue(directory: string, sessionSecret: string) {
  const courses = createLocalCourseStore(directory, sessionSecret);
  const reports = createSentenceReportStore({ directory, sessionSecret, getCourse: courses.getCourse });
  return createReviewQueueStore({ directory, sessionSecret, getCourse: courses.getCourse,
    disabledLines: async input => new Set((await reports.list(input)).filter(report => report.status === 'disabled').map(report => report.lineId)) });
}

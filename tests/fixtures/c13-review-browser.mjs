import { expect } from '@playwright/test';
import { coursePointer } from './t70-learning-browser.mjs';
import { hotelSample } from './t69-guided-browser.mjs';

// C13 browser fixtures: the review queue route is answered from in-memory state on top of the T70/C5 library page.
// It proves what the page asks for and sends; the schedule itself is covered by tests/domain/c13-review-local.spec.mjs.
export const queueItem = (line, pointer = coursePointer, extra = {}) => ({ course: { ...pointer }, lineId: line.id, text: line.text, translations: structuredClone(line.translations), start: line.start, end: line.end, ...extra });
export const sampleQueue = () => ({
  items: [queueItem(hotelSample.lines[0], coursePointer, { plainAlternative: 'Are you checking in now?' }), queueItem(hotelSample.lines[1])],
  limit: 5, heard: 128, resetAt: null, last: { course: { ...coursePointer }, page: 'sentences', index: 3 },
});

export async function routeQueue(page, baseURL, state, queue = sampleQueue()) {
  const origin = new URL(baseURL).origin;
  Object.assign(state, { queue, queueReads: 0, queuePosts: [], queueStatus: 200, queueForeign: [] });
  await page.route('**/api/review-queue', route => {
    const request = route.request();
    if (request.method() === 'GET') {
      state.queueReads++;
      if (state.queueStatus !== 200) return route.fulfill({ status: state.queueStatus, json: { error: 'temporarily_unavailable' } });
      return route.fulfill({ json: structuredClone(state.queue) });
    }
    expect(request.method()).toBe('POST');
    if (request.headers()['origin'] !== origin) state.queueForeign.push(request.url());
    const body = request.postDataJSON(); state.queuePosts.push(structuredClone(body));
    if (state.queueStatus !== 200) return route.fulfill({ status: state.queueStatus, json: { error: 'temporarily_unavailable' } });
    if (body.action === 'listen') { state.queue.heard += body.heard.length; return route.fulfill({ json: { heard: state.queue.heard } }); }
    if (body.action === 'rate') return route.fulfill({ json: { done: false, dueAt: Date.UTC(2026, 9, 21) } });
    if (body.action === 'limit') { state.queue.limit = body.limit; return route.fulfill({ json: { limit: body.limit } }); }
    return route.fulfill({ status: 400, json: { error: 'invalid' } });
  });
  return state;
}
export const rates = state => state.queuePosts.filter(body => body.action === 'rate');
export const listens = state => state.queuePosts.filter(body => body.action === 'listen');
export const reviewEntry = (main, count) => main.getByRole('button', { name: `今天可以再听这几句（${count} 句）`, exact: true });

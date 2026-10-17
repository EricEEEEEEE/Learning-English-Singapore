import { expect } from '@playwright/test';
export { installMic, routePractice, openPractice, panel, twoTurns, reply, replyWav } from './c4-practice-browser.mjs';
export { guidedId, guidedRevision, guidedMaterials, hotelSample } from './t69-guided-browser.mjs';

// C6 browser helpers on top of the C4 practice page: the practice route and the "this feedback is wrong" route
// are answered in memory. This proves what the page sends and shows; the turn contract, prompt and feedback
// store themselves are covered by tests/domain/c6-practice-quality.spec.mjs. No model call, no real microphone.
export async function routeFeedback(page, baseURL, { status = 201 } = {}) {
  const origin = new URL(baseURL).origin;
  const state = { posts: [], foreign: 0, status };
  await page.route('**/api/practice-feedback*', route => {
    const request = route.request();
    expect(request.method()).toBe('POST');
    if (request.headers()['origin'] !== origin) state.foreign++;
    const body = request.postDataJSON(); state.posts.push(body);
    if (state.status !== 201) return route.fulfill({ status: state.status, json: { error: 'temporarily_unavailable' } });
    return route.fulfill({ status: 201, json: { report: { turnIndex: body.turnIndex, note: body.note, status: 'received', at: 1 } } });
  });
  return state;
}

// Count every API request the page makes from now on, to prove a step sends nothing.
export function countApi(page) {
  const seen = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) seen.push(request.url()); });
  return seen;
}

export async function speak(scope) {
  await scope.getByRole('button', { name: '开始说', exact: true }).click();
  await scope.getByRole('button', { name: '说完了', exact: true }).click();
}

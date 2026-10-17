import { expect } from '@playwright/test';
export { installMic, routePractice, openPractice, openPrompt, openSentences, panel, twoTurns, reply, replyWav } from './c4-practice-browser.mjs';
export { guidedId, guidedRevision, guidedMaterials, hotelSample, setupGuided } from './t69-guided-browser.mjs';

// C9 browser helpers on top of the C4/C6 practice page. The practice turn, the review save and the sentence reports
// are answered in memory: this proves what the page sends, ignores and shows. The turn contract, prompts and stores
// themselves are covered by tests/domain/c9-audit-gaps.spec.mjs. No model call, no real microphone.

// A practice route whose answers can be held until the test releases them, to put a reply "in flight".
export async function routeHeldPractice(page, responses) {
  const state = { bodies: [], gates: {} };
  await page.route('**/api/practice-turn', async route => {
    const index = state.bodies.length;
    state.bodies.push(route.request().postDataJSON());
    if (state.gates[index]) await state.gates[index].promise;
    const next = responses[Math.min(index, responses.length - 1)];
    return route.fulfill({ status: next.status ?? 200, json: next.json });
  });
  state.hold = index => { let release; const promise = new Promise(resolve => { release = resolve; }); state.gates[index] = { promise, release }; return release; };
  return state;
}

// The review save: one POST per ending, answered with the review and an optional previous review of the same course.
export async function routeReviews(page, baseURL, { status = 201, previous = null } = {}) {
  const origin = new URL(baseURL).origin;
  const state = { posts: [], foreign: 0, status, previous };
  await page.route('**/api/practice-reviews*', route => {
    const request = route.request();
    expect(request.method()).toBe('POST');
    if (request.headers()['origin'] !== origin) state.foreign++;
    const body = request.postDataJSON(); state.posts.push(body);
    if (state.status !== 201) return route.fulfill({ status: state.status, json: { error: 'temporarily_unavailable' } });
    return route.fulfill({ status: 201, json: { review: { session: body.session, turns: body.turns, help: body.help, at: 2 }, previous: state.previous } });
  });
  return state;
}

// Sentence reports with handling statuses and "where else" for the guided course.
export async function routeReportStatuses(page, reports, elsewhere = {}) {
  const reads = [];
  await page.route('**/api/sentence-reports*', route => {
    expect(route.request().method()).toBe('GET');
    reads.push(new URL(route.request().url()).search);
    return route.fulfill({ json: { reports, elsewhere } });
  });
  return reads;
}

export async function speak(scope) {
  await scope.getByRole('button', { name: '开始说', exact: true }).click();
  await scope.getByRole('button', { name: '说完了', exact: true }).click();
}

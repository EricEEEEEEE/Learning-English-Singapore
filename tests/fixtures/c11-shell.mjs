import { expect } from '@playwright/test';

// C11 (user 2026-10-18, second round: "still not simple enough"): the learning pages, the entry pages, my scenes and
// the review are simplified further. Controls keep their names and test ids; a few move one tap away. These helpers
// add exactly that one tap so older tests can still reach the control they were written for.
const pageOf = scope => (typeof scope.page === 'function' ? scope.page() : scope);

// Prompt page: "you could say" stays folded until the learner taps it.
export async function revealAnswer(main) {
  const reveal = main.getByTestId('answer-reveal');
  if (await reveal.isVisible()) await reveal.click();
  await expect(main.getByTestId('scene-answer').or(main.getByTestId('scene-answer-disabled'))).toBeVisible();
}

// Keywords page: the last three keywords sit in "add a little more (optional)".
export async function openMoreKeywords(main) {
  const more = main.getByTestId('keywords-more');
  if (await more.count() && !(await more.evaluate(details => details.open))) await more.locator('summary').click();
}

// My scenes: each row keeps "delete" inside its own ⋯ sheet.
export const rowSheet = scope => pageOf(scope).locator('dialog[open][data-testid="scene-row-sheet"]');
export async function openRowMenu(main, description, label = `更多操作：${description}`) {
  await main.getByRole('button', { name: label, exact: true }).click();
  const sheet = rowSheet(main);
  await expect(sheet).toBeVisible();
  return sheet;
}

// The seed browser on the scene input page is a bottom sheet.
export const seedSheet = scope => pageOf(scope).locator('dialog[open][data-testid="seed-sheet"]');

// The bottom bar's buttons, for "one next per page" checks.
export const actionButtons = page => page.getByTestId('action-bar').filter({ visible: true }).getByRole('button');

// Finish watching without waiting 12 seconds: a synthetic end event checks the page's transition only.
export async function finishWatching(main) {
  const video = main.locator('video');
  await expect.poll(() => video.evaluate(v => v.readyState)).toBeGreaterThanOrEqual(2);
  await main.getByTestId('scene-play').click();
  await video.evaluate(v => { v.currentTime = v.duration; v.dispatchEvent(new Event('ended')); });
}

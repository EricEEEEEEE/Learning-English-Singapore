import { expect } from '@playwright/test';

// C10 (user 2026-10-18: "the front end is still not simple enough"): the shared shell moves the interface language,
// display switches and course notes into a "more" sheet, and the practice page keeps help one tap away in a
// "more help" sheet. These helpers only open or close those native <dialog> sheets; the controls inside keep their
// names and test ids, so an older test needs exactly one extra step before it finds them.
const pageOf = scope => (typeof scope.page === 'function' ? scope.page() : scope);

export const moreButton = scope => pageOf(scope).getByTestId('more-open').filter({ visible: true });
export const moreSheet = scope => pageOf(scope).locator('dialog[open][data-testid="more-sheet"]');
export const helpButton = scope => pageOf(scope).getByTestId('help-open').filter({ visible: true });
export const helpSheet = scope => pageOf(scope).locator('dialog[open][data-testid="help-sheet"]');
export const setupSheet = scope => pageOf(scope).locator('dialog[open][data-testid="practice-setup"]');

// Opens the "more" sheet (once) and returns it.
export async function openMore(scope) {
  const sheet = moreSheet(scope);
  if (!(await sheet.count())) await moreButton(scope).click();
  await expect(sheet).toBeVisible();
  return sheet;
}
export async function closeMore(scope) {
  await pageOf(scope).keyboard.press('Escape');
  await expect(moreSheet(scope)).toHaveCount(0);
}

// Opens the practice page's "more help" sheet (once) and returns it.
export async function openHelp(scope) {
  const sheet = helpSheet(scope);
  if (!(await sheet.count())) await helpButton(scope).click();
  await expect(sheet).toBeVisible();
  return sheet;
}
export async function closeHelp(scope) {
  await pageOf(scope).keyboard.press('Escape');
  await expect(helpSheet(scope)).toHaveCount(0);
}

// Before the first turn the practice page asks once how to practise; this starts with whatever is selected there.
export async function startPracticeSetup(scope) {
  const sheet = setupSheet(scope);
  await expect(sheet).toBeVisible();
  await sheet.getByTestId('practice-setup-start').click();
  await expect(setupSheet(scope)).toHaveCount(0);
}

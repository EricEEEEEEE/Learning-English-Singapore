import { test, expect } from '@playwright/test';
import config from '../playwright.config.mjs';

test('T43: the repeatable regression suite uses Playwright-pinned Chromium instead of mutable system Chrome', () => {
  expect(config.use?.browserName).toBe('chromium');
  expect(config.use?.channel).toBeUndefined();
});

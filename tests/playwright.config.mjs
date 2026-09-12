import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  testDir: './e2e',
  outputDir: '../test-results',
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 20_000,
  use: {
    baseURL: 'http://127.0.0.1:3210',
    browserName: 'chromium',
    channel: 'chrome',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'small-phone', use: { viewport: { width: 320, height: 740 }, hasTouch: true } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'npm run start -- --hostname 127.0.0.1 --port 3210',
    cwd: root,
    url: 'http://127.0.0.1:3210',
    reuseExistingServer: false,
    timeout: 30_000,
    env: { NEXT_TELEMETRY_DISABLED: '1', NPM_CONFIG_CACHE: `${root}/tmp/npm-cache` },
  },
});

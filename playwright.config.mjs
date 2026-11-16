import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/browser',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: { baseURL: 'http://127.0.0.1:5173', browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/local.mjs', url: 'http://127.0.0.1:5173', timeout: 90_000, reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 } }
});

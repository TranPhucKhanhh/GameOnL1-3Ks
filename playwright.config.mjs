import { existsSync } from 'node:fs';
import { chromium, defineConfig } from '@playwright/test';

const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH
  || (!process.env.CI && process.platform === 'darwin' && !existsSync(chromium.executablePath()) && existsSync(macChrome) ? macChrome : undefined);

export default defineConfig({
  testDir: './test/browser',
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    browserName: 'chromium',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/local.mjs',
    url: 'http://127.0.0.1:5173',
    timeout: 90_000,
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
  },
});

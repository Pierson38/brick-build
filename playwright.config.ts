import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/** Isolated library folder: the E2E suites never touch ~/Documents/brick-lab-data/library. */
export const E2E_DATA_DIR = path.join(tmpdir(), 'brick-lab-e2e-data');

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: 'npm run dev',
    env: { BRICK_LAB_DATA_DIR: E2E_DATA_DIR },
    url: 'http://127.0.0.1:3000/api/ldraw-status',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

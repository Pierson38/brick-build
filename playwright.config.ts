import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/** Isolated library folder: the E2E suites never touch ~/Documents/brick-lab-data/library. */
export const E2E_DATA_DIR = path.join(tmpdir(), 'brick-lab-e2e-data');
/** Simulated answers of the OMR / Rebrickable (P8): the suites never contact a third-party site. */
export const E2E_NET_FIXTURES = path.join(tmpdir(), 'brick-lab-e2e-net.json');

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    viewport: { width: 1280, height: 800 }, locale: 'fr-FR',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, locale: 'fr-FR' } }],
  webServer: {
    // fresh Turbopack dev cache: a stale .next/dev made the page reload in a loop (HMR hash mismatch)
    command: 'node scripts/run-next.mjs dev --fresh-dev-cache -H 127.0.0.1 -p 3000',
    env: { BRICK_LAB_DATA_DIR: E2E_DATA_DIR, BRICK_LAB_NET_FIXTURES: E2E_NET_FIXTURES, REBRICKABLE_API_KEY: '' },
    url: 'http://127.0.0.1:3000/api/ldraw-status',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

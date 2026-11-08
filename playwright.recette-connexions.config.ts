import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

/**
 * Connections on the owner's REAL 31039 build (opt-in, NOT part of `npm run test:e2e`): the model and
 * the progress of the build are READ from the owner's library store and given to the standalone
 * atelier of a fresh browser context (its own browser save); nothing is written to the library, the
 * server runs on an isolated data folder. Development server: the scripted player needs the test hooks.
 * Run: npx playwright test -c playwright.recette-connexions.config.ts
 */
export const RECETTE_CONNEXIONS_DIR = path.join(tmpdir(), 'brick-lab-recette-connexions');

export default defineConfig({
  testDir: 'tests/recette',
  testMatch: 'connexions-31039.spec.ts',
  timeout: 10 * 60_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3220', viewport: { width: 1280, height: 800 }, launchOptions: { args: ['--enable-gpu', '--ignore-gpu-blocklist'] } },
  webServer: {
    command: 'rm -rf .next/dev && NEXT_TELEMETRY_DISABLED=1 npx next dev -H 127.0.0.1 -p 3220',
    env: { BRICK_LAB_DATA_DIR: RECETTE_CONNEXIONS_DIR, BRICK_LAB_NET_FIXTURES: '', BRICK_LAB_ONLINE: '0' },
    url: 'http://127.0.0.1:3220/api/ldraw-status',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

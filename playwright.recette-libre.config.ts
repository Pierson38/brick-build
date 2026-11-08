import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

/**
 * True free building on the owner's REAL sets 31009 and 31039 (opt-in, NOT part of `npm run test:e2e`),
 * in an ISOLATED data folder: the model and booklet files are copied there from BRICK_LAB_DATA
 * (read only); the owner's library is never opened. Development server: the scripted player needs
 * the test hooks. Part 1 builds freely; restart the server by hand; part 2 checks the restore.
 * Run: npx playwright test -c playwright.recette-libre.config.ts -g "part 1"; restart; then -g "part 2".
 */
export const RECETTE_LIBRE_DIR = path.join(tmpdir(), 'brick-lab-recette-libre');

export default defineConfig({
  testDir: 'tests/recette',
  testMatch: 'libre-reel.spec.ts',
  timeout: 20 * 60_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3210', viewport: { width: 1280, height: 800 }, launchOptions: { args: ['--enable-gpu', '--ignore-gpu-blocklist'] } },
  webServer: {
    command: 'node scripts/run-next.mjs dev --fresh-dev-cache -H 127.0.0.1 -p 3210',
    env: { BRICK_LAB_DATA_DIR: RECETTE_LIBRE_DIR, BRICK_LAB_NET_FIXTURES: '', BRICK_LAB_ONLINE: '0' },
    url: 'http://127.0.0.1:3210/api/ldraw-status',
    // a server restarted by hand between the two parts is reused (restore after a restart)
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

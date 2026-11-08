import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

/**
 * P8 real trial (opt-in, NOT part of `npm run test:e2e`): the full "Ajouter un set" flow in an
 * ISOLATED data folder, with the REAL LDraw OMR (one page and one file per click of the script).
 * Development server: the scripted player needs the test hooks, absent from production builds
 * (search, download and import were also checked on `next start`, see P8_RAPPORT.md).
 * Needs Internet and the local LDraw parts library (.env.local). No simulated network here.
 * Run: npx playwright test -c playwright.recette-p8.config.ts -g "part 1"; restart the server; then -g "part 2".
 */
export const RECETTE_DATA_DIR = path.join(tmpdir(), 'brick-lab-recette-p8');
export const RECETTE_SET = process.env.P8_RECETTE_SET ?? '31045';

export default defineConfig({
  testDir: 'tests/recette',
  testMatch: 'p8-reel.spec.ts',
  timeout: 20 * 60_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3200', viewport: { width: 1280, height: 800 }, launchOptions: { args: ['--enable-gpu', '--ignore-gpu-blocklist'] } },
  webServer: {
    command: 'node scripts/run-next.mjs dev --fresh-dev-cache -H 127.0.0.1 -p 3200',
    env: { BRICK_LAB_DATA_DIR: RECETTE_DATA_DIR, BRICK_LAB_NET_FIXTURES: '' },
    url: 'http://127.0.0.1:3200/api/ldraw-status',
    // a server restarted by hand between the two parts is reused (resume after restart)
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

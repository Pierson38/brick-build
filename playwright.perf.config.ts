import { defineConfig } from '@playwright/test';

// Performance measurement on the PRODUCTION build (next build + next start), real GPU when available.
// Run: npm run perf   (results in $BRICK_LAB_DATA/proofs/p5/perf.json)
export default defineConfig({
  testDir: 'tests/perf',
  timeout: 10 * 60_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3100', viewport: { width: 1280, height: 800 }, launchOptions: { args: ['--enable-gpu', '--ignore-gpu-blocklist'] } },
  webServer: {
    command: 'npm run build && node scripts/run-next.mjs start -H 127.0.0.1 -p 3100',
    url: 'http://127.0.0.1:3100/api/ldraw-status',
    reuseExistingServer: false,
    timeout: 300_000,
  },
});

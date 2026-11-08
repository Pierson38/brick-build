// Starts Next.js the same way on macOS, Linux and Windows (no `VAR=1 cmd` or `rm -rf` in npm scripts):
// telemetry off, and with --fresh-dev-cache, .next/dev removed first (a stale Turbopack dev cache
// made the page reload in a loop: HMR hash mismatch).
// Usage: node scripts/run-next.mjs <dev|build|start> [--fresh-dev-cache] [next options]
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';

const FRESH = '--fresh-dev-cache';
const args = process.argv.slice(2);
if (args.includes(FRESH)) rmSync('.next/dev', { recursive: true, force: true });

const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next');
const child = spawn(process.execPath, [nextBin, ...args.filter((a) => a !== FRESH)], {
  stdio: 'inherit',
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));

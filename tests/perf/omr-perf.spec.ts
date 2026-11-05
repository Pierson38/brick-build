import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { cpus, homedir, release, totalmem } from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// Reproducible performance measurement on real OMR files (kept outside the repo).
const DATA = process.env.BRICK_LAB_DATA ?? path.join(homedir(), 'Documents', 'brick-lab-data');
const SETS = ['31040-1', '31009-1'];
const RUNS = 3;

async function fps(page: Page, ms: number, drag: boolean): Promise<number> {
  const box = (await page.locator('canvas').first().boundingBox())!;
  const counting = page.evaluate((d) => new Promise<number>((resolve) => {
    let frames = 0;
    const start = performance.now();
    const tick = () => { frames++; if (performance.now() - start < d) requestAnimationFrame(tick); else resolve((frames * 1000) / (performance.now() - start)); };
    requestAnimationFrame(tick);
  }), ms);
  if (drag) {
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    const steps = Math.round(ms / 16);
    for (let i = 0; i < steps; i++) await page.mouse.move(cx + Math.sin(i / 10) * 200, cy + Math.cos(i / 15) * 60);
    await page.mouse.up();
  }
  return Math.round(await counting);
}

const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]!;

test('performance on real OMR models (production build)', async ({ page, browser }) => {
  const results: Record<string, unknown>[] = [];
  for (const set of SETS) {
    const file = path.join(DATA, 'models', set, `${set}.mpd`);
    test.skip(!existsSync(file), `modèle absent : ${file}`);
    for (let run = 0; run < RUNS; run++) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const p = await context.newPage();
      let ldrawRequests = 0, notFound = 0;
      p.on('response', (r) => { if (r.url().includes('/api/ldraw/')) { ldrawRequests++; if (r.status() === 404) notFound++; } });
      await p.goto('/atelier');
      const t0 = Date.now();
      await p.locator('input[type=file][accept=".ldr,.mpd"]').first().setInputFiles(file);
      await expect(p.getByTestId('render-status')).toContainText('Géométrie LDraw', { timeout: 120_000 });
      await p.locator('canvas').first().waitFor();
      await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const importToFirstFrameMs = Date.now() - t0;
      const status = (await p.getByTestId('render-status').textContent())!;
      const renderer = await p.evaluate(() => {
        const gl = document.querySelector('canvas')!.getContext('webgl2') as WebGL2RenderingContext | null;
        const ext = gl?.getExtension('WEBGL_debug_renderer_info');
        return ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'inconnu';
      });
      results.push({
        set, run,
        importToFirstFrameMs,
        geometryMs: Number(status.match(/(\d+) ms/)?.[1]),
        fpsIdle: await fps(p, 3000, false),
        fpsOrbit: await fps(p, 3000, true),
        heapMB: await p.evaluate(() => Math.round(((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1e6)),
        ldrawRequests, notFound, renderer,
      });
      await context.close();
    }
  }
  const summary = SETS.map((set) => {
    const r = results.filter((x) => x.set === set);
    const m = (k: string) => median(r.map((x) => x[k] as number));
    return { set, runs: r.length, importToFirstFrameMs: m('importToFirstFrameMs'), geometryMs: m('geometryMs'), fpsIdle: m('fpsIdle'), fpsOrbit: m('fpsOrbit'), heapMB: m('heapMB'), ldrawRequests: m('ldrawRequests'), notFound: m('notFound'), renderer: r[0]?.renderer };
  });
  const machine = { os: `darwin ${release()}`, cpu: cpus()[0]?.model, cores: cpus().length, memGB: Math.round(totalmem() / 1e9), node: process.version, browser: browser.version() };
  mkdirSync(path.join(DATA, 'proofs', 'p5'), { recursive: true });
  writeFileSync(path.join(DATA, 'proofs', 'p5', 'perf.json'), JSON.stringify({ machine, summary, results }, null, 2));
  console.log(JSON.stringify({ machine, summary }, null, 2));
});

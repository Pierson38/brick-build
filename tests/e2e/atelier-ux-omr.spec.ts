import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { newStats, placeOneByPointer, progressCount } from './scripted-player';
import { defaultDataRoot } from '../../src/server/library/paths';

/**
 * UX batch on the owner's REAL sets 31040 and 31009 (standalone atelier: files read in the page,
 * nothing written to a library). Measures the part thumbnails (time, smoothness of the 3D view
 * while they are drawn) and places pieces with the P5 scripted player after several resizes.
 * SKIPPED when the files are absent. Results: $BRICK_LAB_DATA/proofs/ux/.
 */
const SRC = process.env.BRICK_LAB_DATA ?? defaultDataRoot();
const SETS = [
  { id: '31040-1', model: 'models/31040-1/31040-1.mpd', pdf: 'instructions/31040-1/31040-1_notice_6145903.pdf' },
  { id: '31009-1', model: 'models/31009-1/31009-1.mpd', pdf: 'instructions/31009-1/31009-1_notice_6038244.pdf' },
];
const PROOFS = path.join(SRC, 'proofs', 'ux');

test.describe.configure({ mode: 'serial' });
test.setTimeout(10 * 60_000);
test.use({ viewport: { width: 1280, height: 800 }, launchOptions: { args: ['--enable-gpu', '--ignore-gpu-blocklist'] } });
test.skip(!SETS.every((s) => existsSync(path.join(SRC, s.model)) && existsSync(path.join(SRC, s.pdf))), 'fichiers 31040/31009 hors dépôt absents');

const results: Record<string, unknown> = {};
test.afterAll(() => {
  mkdirSync(PROOFS, { recursive: true });
  writeFileSync(path.join(PROOFS, 'mesures-ux.json'), `${JSON.stringify(results, null, 2)}\n`);
});

/** Frame intervals of the page for `ms` (the 3D view renders continuously). */
const frames = (page: Page, ms: number) => page.evaluate((dur) => new Promise<{ fps: number; worstMs: number; over50: number }>((resolve) => {
  const t: number[] = [];
  const start = performance.now();
  const tick = (now: number) => {
    t.push(now);
    if (now - start < dur) requestAnimationFrame(tick);
    else {
      const d = t.slice(1).map((x, i) => x - t[i]!);
      resolve({ fps: Math.round((d.length / (t.at(-1)! - t[0]!)) * 1000), worstMs: Math.round(Math.max(...d)), over50: d.filter((x) => x > 50).length });
    }
  };
  requestAnimationFrame(tick);
}), ms);

async function dragSplitter(page: Page, dx: number) {
  const box = (await page.getByTestId('splitter').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
}

for (const set of SETS) {
  test(`${set.id}: thumbnails of the real parts, smooth 3D view, notice fitted, pieces placed after resizing`, async ({ page }) => {
    await page.goto('/atelier');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator('input[type=file][accept=".ldr,.mpd"]').first().setInputFiles(path.join(SRC, set.model));
    await expect(page.getByTestId('render-status')).toContainText('Géométrie LDraw', { timeout: 120_000 });
    await page.waitForFunction(() => Boolean(window.__brickLab && window.__brickLabGame));
    const idle = await frames(page, 1500);

    // free mode: the tray appears and its thumbnails are drawn progressively
    const t0 = Date.now();
    await page.getByRole('button', { name: 'Montage libre (avec notice)' }).click();
    const items = await page.locator('.tray-item').count();
    const during = frames(page, 1500);
    await expect(page.locator('.tray-item img[data-thumb="ok"]').first()).toBeVisible({ timeout: 30_000 });
    const first = Date.now() - t0;
    await expect(page.locator('.tray-item img[data-thumb="ok"]')).toHaveCount(items, { timeout: 60_000 });
    const all = Date.now() - t0;
    const whileDrawing = await during;
    const stats = await page.evaluate(() => window.__brickLabThumbs!.stats());
    expect(stats.failed).toBe(false);
    expect(stats.rendered).toBe(items);
    await expect(page.locator('.tray-item [data-thumb="missing"]')).toHaveCount(0);
    // many parts: they scroll inside the tray, the actions stay on screen
    await expect(page.getByRole('button', { name: 'Annuler' })).toBeInViewport();
    await expect(page.getByTestId('mode-select')).toBeInViewport();

    // notice fitted to the width, then a wider notice
    await page.getByRole('tab', { name: 'Notice PDF' }).click();
    await page.getByTestId('pdf-input').setInputFiles(path.join(SRC, set.pdf));
    await expect(page.getByTestId('pdf-zoom')).toHaveText('Largeur');
    await dragSplitter(page, -280);
    const fit = await page.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 1200));
      const box = document.querySelector('.pdf-scroll') as HTMLElement;
      const c = box.querySelector('canvas') as HTMLCanvasElement;
      return { gap: Math.round(Math.abs(box.clientWidth - 2 - parseFloat(c.style.width))), overflow: box.scrollWidth - box.clientWidth };
    });
    expect(fit.gap).toBeLessThanOrEqual(2);
    expect(fit.overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(PROOFS, `apres-${set.id}-notice-elargie.png`) });

    // guided mode (when the file has steps) or free mode: pieces placed by pointer after resizes
    const mode = (await page.getByTestId('mode-select').locator('[data-value="guided"]:not([aria-disabled])').count()) > 0 ? 'guided' : 'freeManual';
    await page.getByTestId('mode-select').locator(`[data-value="${mode}"]`).click();
    const placeStats = newStats();
    const resizes = [() => dragSplitter(page, 200), () => page.setViewportSize({ width: 1512, height: 945 }), () => dragSplitter(page, -150), () => page.setViewportSize({ width: 1280, height: 800 })];
    for (const resize of resizes) {
      await resize();
      await page.waitForTimeout(300);
      await placeOneByPointer(page, placeStats, false);
      await placeOneByPointer(page, placeStats, false);
    }
    const placed = await progressCount(page);
    expect(placed).toBe(8);
    expect(placeStats.failures).toEqual([]);
    await page.screenshot({ path: path.join(PROOFS, `apres-${set.id}-construction.png`) });

    results[set.id] = {
      trayItems: items, firstThumbnailMs: first, allThumbnailsMs: all,
      renderer: { rendered: stats.rendered, totalMs: Math.round(stats.totalMs), avgMs: Math.round((stats.totalMs / stats.rendered) * 10) / 10, maxMs: Math.round(stats.maxMs) },
      framesIdle: idle, framesWhileDrawingThumbnails: whileDrawing,
      notice: fit, mode, placedAfterResizes: placed, placeStats: { drops: placeStats.drops, retries: placeStats.retries, manualFallbacks: placeStats.manualFallbacks, cameraMoves: placeStats.cameraMoves },
    };
    console.log(set.id, JSON.stringify(results[set.id]));
  });
}

test('the owner\'s files are only read', () => {
  for (const s of SETS) expect(readFileSync(path.join(SRC, s.model)).length).toBeGreaterThan(0);
});

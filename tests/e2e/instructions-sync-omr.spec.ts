import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { parseMappingText } from '../../src/domain/instructions/mapping';
import { importModel, newStats, placeOneByPointer, progressCount } from './scripted-player';
import { defaultDataRoot } from '../../src/server/library/paths';

/**
 * P6 real trial on 31040-1 (OMR model + official booklet 6145903 + the owner's manual mapping).
 * All three files stay OUTSIDE the repository; the suite is skipped when one is absent:
 *   BRICK_LAB_DATA/models/31040-1/31040-1.mpd
 *   BRICK_LAB_DATA/instructions/31040-1/31040-1_notice_6145903.pdf
 *   BRICK_LAB_DATA/mappings/31040-1.brick-mapping.json
 * Proofs go to BRICK_LAB_DATA/proofs/p6 (never committed).
 */
const DATA = process.env.BRICK_LAB_DATA ?? defaultDataRoot();
const MODEL = path.join(DATA, 'models', '31040-1', '31040-1.mpd');
const PDF = path.join(DATA, 'instructions', '31040-1', '31040-1_notice_6145903.pdf');
const MAPPING = path.join(DATA, 'mappings', '31040-1.brick-mapping.json');
const PROOFS = path.join(DATA, 'proofs', 'p6');

test.describe.configure({ mode: 'serial' });
test.setTimeout(20 * 60_000);
test.use({ launchOptions: { args: ['--enable-gpu', '--ignore-gpu-blocklist'] } });
test.skip(![MODEL, PDF, MAPPING].every(existsSync), 'fichiers 31040 hors dépôt absents (modèle, notice ou correspondances)');

const mapping = () => {
  const r = parseMappingText(readFileSync(MAPPING, 'utf8'));
  if (!r.ok) throw new Error(r.errors.join(' '));
  return r.mapping;
};

async function loadMapping(page: Page) {
  await page.getByRole('tab', { name: 'Correspondances' }).click();
  await page.getByTestId('mapping-import').setInputFiles(MAPPING);
  await expect(page.getByTestId('mapping-status')).toHaveText('Valide : mode synchronisé disponible');
}

async function openBooklet(page: Page) {
  await page.getByTestId('pdf-input').setInputFiles(PDF);
  await expect(page.getByTestId('sync-missing-booklet')).toHaveCount(0, { timeout: 30_000 });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/atelier');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('31040 mapping: 65/65 bricks, 24 booklet entries, editor preview per step', async ({ page }) => {
  const m = mapping();
  await importModel(page, MODEL);
  await loadMapping(page);
  await expect(page.getByTestId('mapping-coverage')).toHaveText('65/65 pièces affectées · 24 étape(s)');
  await page.getByTestId('pdf-input').setInputFiles(PDF);
  // step 13 (p. 8): the 3D preview shows the build up to it, its 4 bricks highlighted
  const idx = m.steps.findIndex((s) => s.printedStep === '13');
  await page.getByTestId('mapping-step-select').selectOption(m.steps[idx]!.id);
  await expect(page.getByTestId('pdf-page')).toHaveText('PDF p. 8 / 32');
  const before = m.steps.slice(0, idx).reduce((n, s) => n + s.occurrenceIds.length, 0);
  await expect.poll(() => page.evaluate(() => window.__brickLab!.sceneSummary())).toMatchObject({ solid: before, selected: 4, ghost: 0 });
  mkdirSync(PROOFS, { recursive: true });
  await page.screenshot({ path: path.join(PROOFS, '31040-1-editor-step13.png') });
});

test('31040 synchronised build to completion: page per step, auto-advance, reload mid-build', async ({ page }) => {
  const m = mapping();
  const expected = m.steps.map((s) => `${s.printedStep}${s.callout ? `·${s.callout}` : ''}@${s.page}`);
  await importModel(page, MODEL);
  await loadMapping(page);
  await page.getByRole('button', { name: 'Terminer l’édition' }).click();
  await page.getByRole('button', { name: 'Commencer — notice synchronisée' }).click();
  await openBooklet(page);

  const stats = newStats();
  const visited: string[] = [];
  const pageMismatches: string[] = [];
  const start = Date.now();
  let reloaded = false;
  for (let i = 0; i < 65; i++) {
    const label = (await page.getByTestId('sync-step').textContent())!;
    const stepPage = Number((await page.getByTestId('sync-page').textContent())!.replace('p. ', ''));
    const key = `${label.match(/Étape (\d+)/)![1]}${label.includes('encadré') ? `·${label.match(/encadré (\d+)/)![1]}` : ''}@${stepPage}`;
    if (visited.at(-1) !== key) {
      visited.push(key);
      // the booklet page follows the step, without any click on the PDF
      // the page follows in the render after the step change: wait for it (a loaded machine delays
      // that render), a page that never comes is still recorded as a mismatch
      const want = `PDF p. ${stepPage} / 32`;
      const shown = await expect(page.getByTestId('pdf-page')).toHaveText(want, { timeout: 3_000 })
        .then(() => want, () => page.getByTestId('pdf-page').textContent());
      if (shown !== want) pageMismatches.push(`${key}: ${shown}`);
      if (key === '8@5') await page.screenshot({ path: path.join(PROOFS, '31040-1-synced-step8.png') });
    }
    // only the bricks of the active booklet step are offered
    const step = m.steps[visited.length - 1]!;
    const offered = await page.evaluate(() => window.__brickLabGame!.candidates().map((c) => c.id));
    expect(offered.every((id) => step.occurrenceIds.includes(id))).toBe(true);
    await placeOneByPointer(page, stats, i % 2 === 0);

    if (!reloaded && (await progressCount(page)) === 30) {
      reloaded = true;
      const notice = await page.getByTestId('notice-step').textContent();
      await page.reload();
      await importModel(page, MODEL);
      await expect(page.getByTestId('message')).toHaveText('Progression restaurée : 30/65 pièces posées.');
      await expect(page.getByTestId('notice-step')).toHaveText(notice!);
      await openBooklet(page);
    }
  }
  await expect(page.getByTestId('progress')).toHaveText('65/65 pièces posées');
  await expect(page.getByTestId('message')).toHaveText('Bravo, modèle terminé !');
  await page.screenshot({ path: path.join(PROOFS, '31040-1-synced-done.png') });
  expect(visited).toEqual(expected);
  expect(pageMismatches).toEqual([]);
  writeFileSync(path.join(PROOFS, '31040-1-synced.json'), JSON.stringify({ ...stats, ms: Date.now() - start, entries: visited.length, pages: [...new Set(m.steps.map((s) => s.page))], reloadedAt: 30 }, null, 2));
});

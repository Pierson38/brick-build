import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { importModel, newStats, placeOneByPointer } from './scripted-player';

/**
 * P5 validation on REAL LDraw OMR files. They are third-party files kept outside the
 * repository: the suite is skipped when they are absent.
 *   BRICK_LAB_DATA (default ~/Documents/brick-lab-data)/models/<set>/<set>.mpd
 *   BRICK_LAB_DATA/instructions/<set>/*.pdf   (official booklets, downloaded manually)
 * Proof screenshots and measurements go to BRICK_LAB_DATA/proofs/p5 (never committed).
 * The main build is done ONLY with the pointer and the keyboard (R, O, PageUp/PageDown):
 * the "Poser à la position cible (aide)" button is never used.
 */
const DATA = process.env.BRICK_LAB_DATA ?? path.join(homedir(), 'Documents', 'brick-lab-data');
const PROOFS = path.join(DATA, 'proofs', 'p5');
const model = (set: string) => path.join(DATA, 'models', set, `${set}.mpd`);
const pdf = (set: string, id: string) => path.join(DATA, 'instructions', set, `${set}_notice_${id}.pdf`);

const SETS = [
  { set: '31040-1', name: 'Desert Racers', occurrences: 65, officialPieces: 65, steps: 11, inventory: 'concordance exacte', pdf: pdf('31040-1', '6145903') },
  { set: '31009-1', name: 'Small Cottage', occurrences: 270, officialPieces: 271, steps: 77, inventory: 'Inventaire indéterminé', pdf: pdf('31009-1', '6038244') },
] as const;

test.describe.configure({ mode: 'serial' });
test.setTimeout(40 * 60_000);
// Real GPU (Metal on Mac) instead of the SwiftShader software renderer of the default config:
// with 270 bricks, software rendering made each pointer drop several times slower.
test.use({ launchOptions: { args: ['--enable-gpu', '--ignore-gpu-blocklist'] } });

function saveProof(name: string, data: unknown) {
  mkdirSync(PROOFS, { recursive: true });
  writeFileSync(path.join(PROOFS, name), JSON.stringify(data, null, 2));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/atelier');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

for (const s of SETS) {
  test.describe(`${s.set} ${s.name}`, () => {
    test.skip(!existsSync(model(s.set)), `modèle OMR absent : ${model(s.set)}`);

    test('import: occurrences, library, steps', async ({ page }) => {
      await importModel(page, model(s.set));
      await expect(page.getByTestId('occurrence-count')).toHaveText(String(s.occurrences));
      await expect(page.getByTestId('render-status')).toContainText('0 référence(s) manquante(s)');
      await expect(page.getByTestId('missing-parts')).toHaveCount(0);
      await expect(page.getByTestId('quality')).toHaveText('Jouable avec étapes 3D');
      await expect(page.getByTestId('step-count')).toContainText(String(s.steps));
      await expect(page.getByTestId('inventory-check')).toContainText(s.inventory);
      const scene = await page.evaluate(() => window.__brickLab!.sceneSummary());
      expect(scene.solid).toBe(s.occurrences);
      mkdirSync(PROOFS, { recursive: true });
      await page.screenshot({ path: path.join(PROOFS, `${s.set}-preview.png`) });
    });

    test('guided build to completion with pointer only, symmetric variants included', async ({ page }) => {
      await importModel(page, model(s.set));
      await page.getByRole('button', { name: 'Commencer — mode guidé' }).click();
      const stats = newStats();
      const stepOrder: number[] = [];
      const start = Date.now();
      for (let i = 0; i < s.occurrences; i++) {
        const step = await page.getByTestId('step-indicator').textContent();
        stepOrder.push(Number(step!.match(/Étape (\d+)/)![1]));
        await placeOneByPointer(page, stats, i % 2 === 0);
        if (i === 9) await page.screenshot({ path: path.join(PROOFS, `${s.set}-guided-10.png`) });
      }
      await expect(page.getByTestId('progress')).toHaveText(`${s.occurrences}/${s.occurrences} pièces posées`);
      await expect(page.getByTestId('message')).toHaveText('Bravo, modèle terminé !');
      expect(stepOrder).toEqual([...stepOrder].sort((a, b) => a - b)); // steps only move forward
      expect(new Set(stepOrder).size).toBe(s.steps);
      await page.screenshot({ path: path.join(PROOFS, `${s.set}-guided-done.png`) });
      saveProof(`${s.set}-guided.json`, { ...stats, ms: Date.now() - start, steps: new Set(stepOrder).size });
    });

    test('progress restored after reload mid-build', async ({ page }) => {
      await importModel(page, model(s.set));
      await page.getByRole('button', { name: 'Commencer — mode guidé' }).click();
      const stats = newStats();
      for (let i = 0; i < 12; i++) await placeOneByPointer(page, stats, false);
      const step = await page.getByTestId('step-indicator').textContent();
      await page.reload();
      await importModel(page, model(s.set));
      await expect(page.getByTestId('message')).toHaveText(`Progression restaurée : 12/${s.occurrences} pièces posées.`);
      await expect(page.getByTestId('step-indicator')).toHaveText(step!);
      expect((await page.evaluate(() => window.__brickLab!.sceneSummary())).solid).toBe(12);
      await placeOneByPointer(page, stats, false);
      await expect(page.getByTestId('progress')).toHaveText(`13/${s.occurrences} pièces posées`);
    });

    test('free mode in natural build order (file order), pointer only', async ({ page }) => {
      await importModel(page, model(s.set));
      await page.getByRole('button', { name: 'Montage libre (avec notice)' }).click();
      const stats = newStats();
      for (let i = 0; i < s.occurrences; i++) await placeOneByPointer(page, stats, i % 2 === 1, 0);
      await expect(page.getByTestId('progress')).toHaveText(`${s.occurrences}/${s.occurrences} pièces posées`);
      saveProof(`${s.set}-free-natural.json`, { ...stats, placed: s.occurrences });
    });

    test('free mode with the official PDF open, any order', async ({ page }) => {
      test.skip(!existsSync(s.pdf), `notice absente : ${s.pdf}`);
      await importModel(page, model(s.set));
      await page.getByRole('button', { name: 'Montage libre (avec notice)' }).click();
      await page.getByRole('tab', { name: 'Notice PDF' }).click();
      await page.getByTestId('pdf-input').setInputFiles(s.pdf);
      await expect(page.getByTestId('pdf-page')).toHaveText(/PDF p\. 1 \/ \d+/, { timeout: 30_000 });
      for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Page suivante' }).click();
      await expect(page.getByTestId('pdf-page')).toHaveText(/PDF p\. 5 \//);
      await expect(page.locator('.pdf-panel [role=alert]')).toHaveCount(0);
      await expect(page.getByTestId('step-indicator')).toHaveCount(0);
      const stats = newStats();
      // free mode: pick from the END of the remaining stock, i.e. not the file order
      const total = s.occurrences;
      for (let i = 0; i < total; i++) await placeOneByPointer(page, stats, i % 2 === 1, 10_000);
      await expect(page.getByTestId('progress')).toHaveText(`${total}/${s.occurrences} pièces posées`);
      await expect(page.getByTestId('pdf-page')).toHaveText(/PDF p\. 5 \//); // the notice did not move
      await page.screenshot({ path: path.join(PROOFS, `${s.set}-free-with-pdf.png`) });
      saveProof(`${s.set}-free.json`, { ...stats, placed: total });
    });
  });
}

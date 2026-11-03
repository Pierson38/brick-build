import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { heldPose } from '../../src/domain/build/engine';
import { rotationAngleDeg } from '../../src/domain/ldraw/matrix';
import { equivalentTargets } from '../../src/domain/ldraw/symmetry';
import type { Matrix4Tuple } from '../../src/domain/ldraw/types';

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

interface Candidate { id: string; partKey: string; colorCode: string; matrix: number[] }
interface Held { bottom: number; previewPose: number[] | null; previewLayerY: number | null; previewSource: string | null; targetId: string | null; layerMode: 'auto' | 'manual'; partKey: string; colorCode: string; quarterTurns: number; layerY: number; orientation: number[]; orientationIndex: number; orientationCount: number; layerIndex: number }

const game = <T,>(page: Page, fn: string, arg?: unknown) =>
  page.evaluate(([f, a]) => (window.__brickLabGame as unknown as Record<string, (x?: unknown) => unknown>)[f as string]!(a) as T, [fn, arg] as const);

async function importModel(page: Page, file: string) {
  await page.locator('input[type=file][accept=".ldr,.mpd"]').first().setInputFiles(file);
  await expect(page.getByTestId('render-status')).toContainText('Géométrie LDraw', { timeout: 120_000 });
  await page.waitForFunction(() => Boolean(window.__brickLab && window.__brickLabGame));
  await page.waitForTimeout(300);
}

const progressCount = async (page: Page) => Number((await page.getByTestId('progress').textContent())!.split('/')[0]);

export interface DropStats {
  drops: number; retries: number; symmetricVariants: number; orientationKeys: number; rotationKeys: number;
  /** placed by pointing: on the supporting surface, at the spot itself (in the air), or after a small move */
  autoFirstHover: number; autoAimSpot: number; autoAfterMove: number;
  /** surface placement failed (e.g. spot hidden behind other bricks): PageUp/PageDown used */
  manualFallbacks: number; layerKeys: number;
  /** camera drags (orbit) done before giving up pointing, like a player looking for a hidden spot */
  cameraMoves: number;
  failures: string[];
}
export const newStats = (): DropStats => ({ drops: 0, retries: 0, symmetricVariants: 0, orientationKeys: 0, rotationKeys: 0, autoFirstHover: 0, autoAimSpot: 0, autoAfterMove: 0, manualFallbacks: 0, layerKeys: 0, cameraMoves: 0, failures: [] });

async function settle(page: Page) {
  // wait until the canvas size used for picking is stable (see report, I4)
  let last = '';
  for (let i = 0; i < 20; i++) {
    const b = JSON.stringify(await page.getByTestId('build-canvas').boundingBox());
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    if (b === last && (await page.evaluate(() => window.__brickLab!.sizeInSync()))) break;
    last = b;
  }
}

async function hover(page: Page, ldraw: [number, number, number]): Promise<Held> {
  await settle(page);
  const p = await page.evaluate((pt) => window.__brickLab!.project(pt), ldraw);
  const box = (await page.getByTestId('build-canvas').boundingBox())!;
  if (p.x < box.x || p.x > box.x + box.width || p.y < box.y || p.y > box.y + box.height) throw new Error(`Cible hors champ : ${ldraw}`);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return (await game<Held>(page, 'held'))!;
}

/**
 * Places the first open candidate like a player: tray, orientation (O), quarter turns (R), then
 * the pointer over the spot. The HEIGHT comes from the surface under the pointer; PageUp/PageDown
 * are only used (and counted) when that fails. The test hooks only tell the "player" where the
 * spot is on screen, they never place anything.
 */
async function placeOneByPointer(page: Page, stats: DropStats, preferSymmetricVariant: boolean, pickIndex = 0): Promise<void> {
  const cands = await game<Candidate[]>(page, 'candidates');
  const target = cands[Math.min(pickIndex, cands.length - 1)]!;
  const before = await progressCount(page);
  await page.getByTestId(`tray-${target.partKey}-${target.colorCode}`).click();
  let held = (await game<Held>(page, 'held'))!;

  const symmetries = await game<number[]>(page, 'symmetries', target.partKey);
  const t = target.matrix as unknown as Matrix4Tuple;
  let choice: { o: number; q: number; variant: boolean } | null = null;
  for (let o = 0; o < held.orientationCount && !choice; o++) {
    while (held.orientationIndex !== o) {
      await page.keyboard.press('o');
      stats.orientationKeys++;
      held = (await game<Held>(page, 'held'))!;
    }
    const options = [0, 1, 2, 3].map((q) => {
      const pose = heldPose(held.orientation as unknown as Matrix4Tuple, q, [t[12], t[13], t[14]]);
      return { q, exact: rotationAngleDeg(pose, t), equivalent: Math.min(...equivalentTargets(t, symmetries).map((e) => rotationAngleDeg(pose, e))) };
    }).filter((x) => x.equivalent <= 5);
    const variant = preferSymmetricVariant ? options.find((x) => x.exact > 5) : undefined;
    const pickQ = variant ?? options.find((x) => x.exact <= 5) ?? options[0];
    if (pickQ) choice = { o, q: pickQ.q, variant: Boolean(variant) };
  }
  if (!choice) throw new Error(`Aucune orientation atteignable pour ${target.id}`);
  while (((held.quarterTurns % 4) + 4) % 4 !== choice.q) {
    await page.keyboard.press('r');
    stats.rotationKeys++;
    held = (await game<Held>(page, 'held'))!;
  }
  if (choice.variant) stats.symmetricVariants++;

  for (let attempt = 0; attempt < 3; attempt++) {
    // 1) hover the spot; 2) move a little around it, as a player would; 3) manual layer keys
    // point at the surface the brick rests on: its own bottom, at the target spot
    const surfaceY = t[13] + held.bottom;
    held = await hover(page, [t[12], surfaceY, t[14]]);
    if (held.targetId) stats.autoFirstHover++;
    else if ((held = await hover(page, [t[12], t[13], t[14]])).targetId) stats.autoAimSpot++;
    else {
      for (const [dx, dz] of [[5, 0], [-5, 0], [0, 5], [0, -5], [10, 10], [-10, -10]] as const) {
        held = await hover(page, [t[12] + dx, surfaceY, t[14] + dz]);
        if (held.targetId) { stats.autoAfterMove++; break; }
      }
    }
    // spot hidden behind placed bricks: orbit the camera with the mouse and look again
    for (let orbit = 0; orbit < 3 && !held.targetId; orbit++) {
      const box = (await page.getByTestId('build-canvas').boundingBox())!;
      const cx = box.x + box.width * 0.5, cy = box.y + box.height * 0.85;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 140, cy - (orbit === 1 ? 60 : 0), { steps: 8 });
      await page.mouse.up();
      stats.cameraMoves++;
      held = await hover(page, [t[12], t[13] + held.bottom, t[14]]);
      if (!held.targetId) held = await hover(page, [t[12], t[13], t[14]]);
    }
    if (!held.targetId) {
      stats.manualFallbacks++;
      const layers = await game<number[]>(page, 'layers');
      const wanted = layers.indexOf(Math.round(t[13]));
      for (let k = 0; k < 200 && (held.layerMode !== 'manual' || held.layerIndex !== wanted); k++) {
        const current = held.layerIndex; // manual starts from the default layer
        await page.keyboard.press(current < wanted ? 'PageUp' : 'PageDown');
        stats.layerKeys++;
        held = (await game<Held>(page, 'held'))!;
      }
      held = await hover(page, [t[12], t[13], t[14]]);
    }
    // click exactly where the pointer already is (no extra move)
    await page.mouse.down();
    await page.mouse.up();
    stats.drops++;
    try {
      await expect.poll(() => progressCount(page), { timeout: 2_000 }).toBe(before + 1);
      return;
    } catch {
      stats.retries++;
      const last = await page.evaluate(() => window.__brickLabLastDrop);
      stats.failures.push(`${target.id}: ${await page.getByTestId('message').textContent()} | cible ${[t[12], t[13], t[14]].map((v) => v.toFixed(0))} | reçu ${last?.pose.slice(12, 15).map((v) => v.toFixed(0))} | source ${held.previewSource} mode ${held.layerMode}`);
    }
  }
  throw new Error(`Pose refusée 3 fois : ${stats.failures.at(-1)}`);
}

function saveProof(name: string, data: unknown) {
  mkdirSync(PROOFS, { recursive: true });
  writeFileSync(path.join(PROOFS, name), JSON.stringify(data, null, 2));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
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

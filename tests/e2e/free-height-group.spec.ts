import { fileURLToPath } from 'node:url';
import { expect, test, webkit, type Page } from '@playwright/test';

/** Captures of ORIGINAL synthetic models only (no third-party file): kept in the repository. */
const PROOF = (name: string) => fileURLToPath(new URL(`../../docs/implementation/preuves/libre/${name}`, import.meta.url));

/**
 * Owner's recette of the free building (06/11/2026): (1) the height of a held piece is set by hand,
 * independently of the model levels, in plate steps (8 LDU) or 1 LDU, with visible buttons; (2)
 * several placed pieces are selected (click, Shift+click) and moved as one rigid group (turn, height),
 * undone in one action, saved with their poses. ORIGINAL synthetic models, standalone atelier.
 */

// like the owner's 31039 assembly: white 2×8 plate, orange 1×2 plates, green brackets, the grey
// 30157 (plate with wheel holders hanging below it), a long 1×8 plate, a pin (side axle), a 1×1
// plate and a Technic brick with side holes
const HEIGHTS = [
  '0 FILE heights.ldr', '0 Name: heights.ldr',
  '1 15 0 0 0 1 0 0 0 1 0 0 0 1 3034.dat',
  '1 25 -10 -8 0 1 0 0 0 1 0 0 0 1 3023.dat',
  '1 2 30 -8 0 1 0 0 0 1 0 0 0 1 99780.dat',
  '1 71 0 -16 0 1 0 0 0 1 0 0 0 1 30157.dat',
  '1 71 0 -40 0 1 0 0 0 1 0 0 0 1 3460.dat',
  '1 0 60 -48 0 1 0 0 0 1 0 0 0 1 2780.dat',
  '1 4 -60 -48 0 1 0 0 0 1 0 0 0 1 3024.dat',
  '1 14 0 -72 0 1 0 0 0 1 0 0 0 1 3700.dat',
].join('\n');
// five identical red bricks: three are built into a small assembly, two stay in the stock
const FIVE = ['0 FILE five.ldr', ...[0, 80, 160, 240, 320].map((x) => `1 4 ${x} 0 0 1 0 0 0 1 0 0 0 1 3001.dat`)].join('\n');

type Free = { id: string; partKey: string; colorCode: string; pose: number[] };
type Held = { previewPose: number[] | null; layerMode: string; layerY: number; bottom: number };
const freePieces = (page: Page) => page.evaluate(() => window.__brickLabGame!.freePieces()) as Promise<Free[]>;
const heldState = (page: Page) => page.evaluate(() => window.__brickLabGame!.held()) as Promise<Held | null>;
const frame = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const xyz = (m: number[]) => [m[12]!, m[13]!, m[14]!].map((v) => Math.round(v * 100) / 100);
const dist = (a: number[], b: number[]) => Math.hypot(a[12]! - b[12]!, a[13]! - b[13]!, a[14]! - b[14]!);
/** trace(Ra^T Rb): equal traces = same relative rotation */
const relTrace = (a: number[], b: number[]) => [0, 1, 2].reduce((t, c) => t + [0, 1, 2].reduce((u, r) => u + a[c * 4 + r]! * b[c * 4 + r]!, 0), 0);

async function open(page: Page, name: string, text: string) {
  await page.goto('/atelier');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await importText(page, name, text);
  await page.getByRole('button', { name: 'Montage libre (avec notice)' }).click();
}
async function importText(page: Page, name: string, text: string) {
  await page.locator('input[type=file][accept=".ldr,.mpd"]').first().setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });
  await expect(page.getByTestId('render-status')).toContainText('Géométrie LDraw', { timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.__brickLab && window.__brickLabGame));
  await page.waitForTimeout(200);
}
async function point(page: Page, at: [number, number, number]) {
  await frame(page);
  const p = await page.evaluate((pt) => window.__brickLab!.project(pt), at);
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await frame(page);
  return p;
}
async function clickAt(page: Page, at: [number, number, number], modifiers: ('Shift')[] = []) {
  const p = await point(page, at);
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.click(p.x, p.y);
  for (const m of modifiers) await page.keyboard.up(m);
}
const ground = (page: Page) => page.evaluate(() => window.__brickLabGame!.ground());
/** Previewed pose of the held piece (or the group pivot). */
const shown = async (page: Page) => {
  await frame(page); // the preview follows the height on the next render
  return (await heldState(page))!.previewPose!;
};
/** Drop where the preview is: point at the previewed origin (same height), click. */
async function dropHere(page: Page) {
  const p = await shown(page);
  await clickAt(page, [p[12]!, p[13]!, p[14]!]);
}

test('free height: a piece lowered by hand where the automatic placement cannot go, 8 then 1 LDU, kept while moving, restored after a reload', async ({ page }) => {
  await open(page, 'heights.ldr', HEIGHTS);
  const g = await ground(page);
  // a small assembly like the owner's: white plate on the ground, orange plate on it
  await page.getByTestId('tray-3034.dat-15').click();
  await clickAt(page, [200, g, 0]);
  await page.getByTestId('tray-3023.dat-25').click();
  await clickAt(page, [200, g - 8, 0]);
  const orange = (await freePieces(page)).at(-1)!;
  expect(xyz(orange.pose)).toEqual([200, g - 16, 0]);

  // the grey 30157 pointed on top of the orange plate: auto puts its LOWEST point on the plate
  await page.getByTestId('tray-30157.dat-71').click();
  await point(page, [200, g - 16, 0]);
  const held = (await heldState(page))!;
  const auto = held.previewPose![13]!;
  expect(auto + held.bottom).toBeCloseTo(g - 16, 1); // its wheel holders rest on the orange plate
  await expect(page.getByTestId('held-info')).toContainText('Niveau auto (surface)');

  // down two plates: lower than auto can ever put it on this assembly (its lowest point inside the plate)
  await page.getByTestId('step-8').click();
  await page.getByTestId('lift-down').click();
  await page.getByTestId('lift-down').click();
  await expect(page.getByTestId('held-info')).toContainText('Hauteur manuelle');
  expect((await shown(page))[13]).toBeCloseTo(auto + 16, 2);
  // then 1 LDU up, three times: the preview shows exactly the chosen height
  await page.getByTestId('step-1').click();
  for (let i = 0; i < 3; i++) await page.getByTestId('lift-up').click();
  const chosen = auto + 13;
  expect((await shown(page))[13]).toBeCloseTo(chosen, 2);
  await page.screenshot({ path: PROOF('hauteur-manuelle-en-main.png') });
  expect(chosen + held.bottom).toBeGreaterThan(g - 16); // below the top of the orange plate: auto cannot

  // the height is kept while the piece moves horizontally (over the plate, over the ground)
  for (const at of [[260, g, 60], [120, g - 16, -40]] as [number, number, number][]) {
    await point(page, at);
    expect((await shown(page))[13]).toBeCloseTo(chosen, 2);
  }
  // keyboard too: PageDown = the selected step (a plate), Shift+PageUp = 1 LDU
  await page.getByTestId('step-8').click();
  await page.keyboard.press('PageDown');
  await page.keyboard.press('Shift+PageUp');
  expect((await shown(page))[13]).toBeCloseTo(chosen + 7, 2);
  await page.keyboard.press('PageUp');
  await page.keyboard.press('Shift+PageDown');
  expect((await shown(page))[13]).toBeCloseTo(chosen, 2);

  // back to automatic, then manual again and placed
  await page.getByTestId('height-auto').click();
  await point(page, [200, g - 16, 0]);
  expect((await shown(page))[13]).toBeCloseTo(auto, 2);
  await page.getByTestId('step-1').click();
  for (let i = 0; i < 13; i++) await page.getByTestId('lift-down').click();
  const preview = await shown(page);
  await dropHere(page);
  await expect(page.getByTestId('message')).toContainText('Pièce posée librement');
  const grey = (await freePieces(page)).at(-1)!;
  expect(grey.partKey).toBe('30157.dat');
  expect(xyz(grey.pose)).toEqual(xyz(preview)); // placed exactly where previewed
  expect(grey.pose[13]).toBeCloseTo(chosen, 2);

  // reload: same coordinates
  const before = await freePieces(page);
  await page.reload();
  await importText(page, 'heights.ldr', HEIGHTS);
  expect(await freePieces(page)).toEqual(before);
  await page.screenshot({ path: PROOF('hauteur-manuelle-posee-apres-rechargement.png') });
});

test('free height on long pieces, side axles and small pieces: 8 LDU down then 1 LDU up, previewed = placed', async ({ page }) => {
  await open(page, 'heights.ldr', HEIGHTS);
  const g = await ground(page);
  const spots: [string, [number, number, number]][] = [['tray-3460.dat-71', [-160, g, 80]], ['tray-2780.dat-0', [-60, g, -100]], ['tray-3024.dat-4', [80, g, 120]], ['tray-3700.dat-14', [200, g, -100]], ['tray-99780.dat-2', [-200, g, -60]]];
  for (const [key, at] of spots) {
    await page.getByTestId(key).click();
    await point(page, at);
    const auto = (await shown(page))[13]!;
    await page.getByTestId('step-8').click();
    await page.getByTestId('lift-down').click();
    await page.getByTestId('step-1').click();
    for (let i = 0; i < 3; i++) await page.getByTestId('lift-up').click();
    const preview = await shown(page);
    expect(preview[13]).toBeCloseTo(auto + 5, 2);
    await dropHere(page);
    const placed = (await freePieces(page)).at(-1)!;
    expect(`${placed.partKey}-${placed.colorCode}`).toBe(key.replace('tray-', ''));
    expect(xyz(placed.pose)).toEqual(xyz(preview));
    await page.keyboard.press('Escape');
  }
  expect(await freePieces(page)).toHaveLength(spots.length);
});

test('group: three bricks selected (click, Shift+click) and moved, turned and raised together; stock unchanged; one undo restores all; saved', async ({ page }) => {
  await open(page, 'five.ldr', FIVE);
  const g = await ground(page);
  await page.getByTestId('tray-3001.dat-4').click();
  await clickAt(page, [-160, g, 80]);
  await clickAt(page, [-80, g, 80]);
  await clickAt(page, [-80, g - 24, 80]); // stacked on the second one
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tray-3001.dat-4').locator('.count')).toHaveText('×2');
  const before = await freePieces(page);
  expect(before.map((f) => xyz(f.pose))).toEqual([[-160, g - 24, 80], [-80, g - 24, 80], [-80, g - 48, 80]]);

  // select: click, then Shift+click; the camera does not move
  const cam = await page.evaluate(() => window.__brickLab!.project([0, 0, 0]));
  await clickAt(page, [-160, g - 24, 80]);
  await clickAt(page, [-80, g - 48, 80], ['Shift']);
  await clickAt(page, [-80, g - 12, 60], ['Shift']); // front face of the lower brick
  await expect(page.getByTestId('selection-info')).toHaveText('3 pièce(s) sélectionnée(s)');
  expect((await page.evaluate(() => window.__brickLab!.sceneSummary())).selected).toBe(3);
  expect(await page.evaluate(() => window.__brickLab!.project([0, 0, 0]))).toEqual(cam);
  await page.screenshot({ path: PROOF('groupe-selection.png') });
  // Shift+click again removes one, Shift+click adds it back
  await clickAt(page, [-160, g - 24, 80], ['Shift']);
  await expect(page.getByTestId('selection-info')).toHaveText('2 pièce(s) sélectionnée(s)');
  await clickAt(page, [-160, g - 24, 80], ['Shift']);
  await expect(page.getByTestId('selection-info')).toHaveText('3 pièce(s) sélectionnée(s)');

  // move the selection: one object, previewed before the click, turned a quarter, one plate up
  await page.getByTestId('move-selection').click();
  await expect(page.getByTestId('held-info')).toContainText('Groupe de 3 pièces');
  await point(page, [160, g, -60]);
  expect((await page.evaluate(() => window.__brickLab!.sceneSummary())).held).toBe(3);
  await page.keyboard.press('r');
  await page.getByTestId('step-8').click();
  await page.getByTestId('lift-up').click();
  await shown(page);
  await page.screenshot({ path: PROOF('groupe-en-main-tourne-monte.png') });
  await dropHere(page);
  await expect(page.getByTestId('message')).toContainText('Groupe de 3 pièces déplacé');
  await page.screenshot({ path: PROOF('groupe-pose.png') });
  const after = await freePieces(page);
  expect(after.map((f) => f.id)).toEqual(before.map((f) => f.id)); // stable identifiers
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      expect(dist(after[i]!.pose, after[j]!.pose)).toBeCloseTo(dist(before[i]!.pose, before[j]!.pose), 6);
      expect(relTrace(after[i]!.pose, after[j]!.pose)).toBeCloseTo(relTrace(before[i]!.pose, before[j]!.pose), 6);
    }
    expect(Math.round(after[i]!.pose[0]!)).toBe(0); // turned 90°
  }
  expect(Math.max(...after.map((f) => f.pose[13]!))).toBeCloseTo(g - 24 - 8, 2); // the group rests one plate above the ground
  await expect(page.getByTestId('tray-3001.dat-4').locator('.count')).toHaveText('×2'); // stock unchanged
  await expect(page.getByTestId('progress')).toHaveText('3/5 pièces posées');
  await expect(page.getByTestId('selection-info')).toHaveText('3 pièce(s) sélectionnée(s)'); // still selected

  // one undo: every piece back at its former pose
  await page.getByRole('button', { name: 'Annuler' }).click();
  expect(await freePieces(page)).toEqual(before);

  // again, then reload: the moved group is restored
  await page.getByTestId('move-selection').click();
  await point(page, [120, g, 100]);
  await dropHere(page);
  const moved = await freePieces(page);
  expect(moved).not.toEqual(before);
  await page.reload();
  await importText(page, 'five.ldr', FIVE);
  expect(await freePieces(page)).toEqual(moved);

  // click on empty ground deselects; Escape too
  await clickAt(page, [moved[0]!.pose[12]!, moved[0]!.pose[13]!, moved[0]!.pose[14]!]);
  await expect(page.getByTestId('selection-info')).toHaveText('1 pièce(s) sélectionnée(s)');
  await clickAt(page, [-300, g, -200]);
  await expect(page.getByTestId('manip-bar')).toHaveCount(0);
});

test('guided mode unchanged: no free height bar, PageUp/PageDown still the model levels, a placed brick is not selectable', async ({ page }) => {
  await page.goto('/atelier');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await importText(page, 'five.ldr', FIVE.replace('0 FILE five.ldr', '0 FILE five.ldr\n0 STEP').replace(/(3001\.dat)$/m, '$1\n0 STEP'));
  await page.getByRole('button', { name: 'Commencer — mode guidé' }).click();
  await page.getByTestId('tray-3001.dat-4').click();
  await expect(page.getByTestId('manip-bar')).toHaveCount(0);
  await page.keyboard.press('PageDown');
  await expect(page.getByTestId('held-info')).toContainText('Niveau manuel 1/1');
  await page.keyboard.press('a');
  await point(page, [0, 24, 0]);
  await expect(page.getByTestId('target-found')).toBeVisible();
  await clickAt(page, [0, 24, 0]);
  await expect(page.getByTestId('progress')).toHaveText('1/5 pièces posées');
  await page.keyboard.press('Escape');
  await clickAt(page, [0, 0, 0]);
  await expect(page.getByTestId('manip-bar')).toHaveCount(0);
});

test('WebKit (Safari engine): height buttons, Shift+click selection, group move', async () => {
  const safari = await webkit.launch().catch(() => null);
  test.skip(!safari, 'WebKit de Playwright indisponible');
  const page = await safari!.newPage({ viewport: { width: 1280, height: 800 }, baseURL: 'http://127.0.0.1:3000' });
  try {
    await open(page, 'five.ldr', FIVE);
    const g = await ground(page);
    await page.getByTestId('tray-3001.dat-4').click();
    await point(page, [-120, g, 60]);
    const auto = (await shown(page))[13]!;
    await page.getByTestId('lift-up').click();
    await page.getByTestId('step-1').click();
    await page.getByTestId('lift-down').click();
    expect((await shown(page))[13]).toBeCloseTo(auto - 7, 2);
    await dropHere(page);
    await page.getByTestId('height-auto').click();
    await clickAt(page, [-40, g, 60]);
    await page.keyboard.press('Escape');
    const before = await freePieces(page);
    await clickAt(page, [before[0]!.pose[12]!, before[0]!.pose[13]!, before[0]!.pose[14]!]);
    await clickAt(page, [before[1]!.pose[12]!, before[1]!.pose[13]!, before[1]!.pose[14]!], ['Shift']);
    await expect(page.getByTestId('selection-info')).toHaveText('2 pièce(s) sélectionnée(s)');
    await page.getByTestId('move-selection').click();
    await point(page, [100, g, -80]);
    await dropHere(page);
    const after = await freePieces(page);
    expect(dist(after[0]!.pose, after[1]!.pose)).toBeCloseTo(dist(before[0]!.pose, before[1]!.pose), 6);
    expect(after[0]!.pose[13]! - after[1]!.pose[13]!).toBeCloseTo(before[0]!.pose[13]! - before[1]!.pose[13]!, 6);
  } finally {
    await safari!.close();
  }
});

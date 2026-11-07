import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { expect, test, webkit, type Page } from '@playwright/test';

/**
 * Owner's recette on 31039 (07/11/2026): (A) rotations on X / Y / Z, (B) direct manipulation by
 * dragging, (C) selection of a connected assembly, (D) snapping between pieces. ORIGINAL synthetic
 * model with the parts and poses of the owner's 31039 assembly (white 3034, orange 3023, green
 * 99780, grey 30157) and the red 32062 axle; standalone atelier (browser save).
 */
export const MODEL = ['0 FILE assemblage.ldr', '0 Name: assemblage.ldr',
  '1 15 0 33.41 0 1 0 0 0 1 0 0 0 1 3034.dat', '1 25 0 25.41 0 1 0 0 0 1 0 0 0 1 3023.dat', '1 25 40 25.41 0 1 0 0 0 1 0 0 0 1 3023.dat',
  '1 2 -40 25.41 0 1 0 0 0 1 0 0 0 1 99780.dat', '1 2 80 25.41 0 1 0 0 0 1 0 0 0 1 99780.dat', '1 71 0 17.41 0 1 0 0 0 1 0 0 0 1 30157.dat',
  '1 71 0 9.41 0 1 0 0 0 1 0 0 0 1 30157.dat', '1 4 200 35.41 0 0 0 -1 0 1 0 1 0 0 32062.dat', '1 4 300 25.41 0 1 0 0 0 1 0 0 0 1 3001.dat',
  '1 4 300 1.41 0 1 0 0 0 1 0 0 0 1 3001.dat', '1 4 300 -22.59 0 1 0 0 0 1 0 0 0 1 3001.dat'].join('\n');
const SHA = createHash('sha256').update(MODEL).digest('hex');
type F = { id: string; partKey: string; colorCode: string; pose: number[] };
const P = (id: string, partKey: string, colorCode: string, pose: number[]) => ({ id, partKey, colorCode, pose });
/** The owner's assembly, as saved in his 31039 build (grey plates 2 LDU too high and half a stud off). */
export const OWNER = [
  P('f6', '3034.dat', '15', [70, 33.41, -10, 0, 0, -1, 0, 1, 0, 1, 0, 0]), P('f7', '99780.dat', '2', [70, 25.41, -80, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
  P('f8', '99780.dat', '2', [70, 25.41, 60, -1, 0, 0, 0, 1, 0, 0, 0, -1]), P('f9', '3023.dat', '25', [70, 25.41, -60, -1, 0, 0, 0, 1, 0, 0, 0, -1]),
  P('f10', '3023.dat', '25', [70, 25.41, 40, -1, 0, 0, 0, 1, 0, 0, 0, -1]), P('f11', '30157.dat', '71', [70, 15.41, -70, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
  P('f12', '30157.dat', '71', [70, 15.41, 50, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
];
// long scenarios on software WebGL (many renders per step)
test.setTimeout(150_000);
const PROOF = (n: string) => fileURLToPath(new URL(`../../docs/implementation/preuves/libre/${n}`, import.meta.url));

export const freePieces = (page: Page) => page.evaluate(() => window.__brickLabGame!.freePieces()) as Promise<F[]>;
export const frame = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
export const held = async (page: Page) => {
  await frame(page);
  return page.evaluate(() => window.__brickLabGame!.held()) as Promise<{ previewPose: number[]; orientation: number[]; bottom: number } | null>;
};
export async function point(page: Page, at: [number, number, number]) {
  await frame(page);
  const p = await page.evaluate((pt) => window.__brickLab!.project(pt), at);
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await frame(page);
  return p;
}
export async function clickAt(page: Page, at: [number, number, number], shift = false) {
  const p = await point(page, at);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(p.x, p.y);
  if (shift) await page.keyboard.up('Shift');
}
export async function dropHere(page: Page) {
  const p = (await held(page))!.previewPose;
  await clickAt(page, [p[12]!, p[13]!, p[14]!]);
}
/** Opens the synthetic model in free mode, optionally with a browser save of free pieces. */
export async function open(page: Page, pieces: F[] = []) {
  await page.goto('/atelier');
  await page.evaluate(([k, v]) => { localStorage.clear(); if (v) localStorage.setItem(k, v); }, [`brick-lab:progress:${SHA}`,
    pieces.length ? JSON.stringify({ schemaVersion: 3, modelContentHash: SHA, displayName: 'assemblage.ldr', buildMode: 'freeManual', placedOccurrenceIds: [], totalOccurrences: 11, freePieces: pieces, updatedAtIso: '2026-11-06T23:27:31.000Z' }) : ''] as const);
  await page.reload();
  await importModel(page);
  if (!pieces.length) await page.getByRole('button', { name: 'Montage libre (avec notice)' }).click();
}
export async function importModel(page: Page) {
  await page.locator('input[type=file][accept=".ldr,.mpd"]').first().setInputFiles({ name: 'assemblage.ldr', mimeType: 'text/plain', buffer: Buffer.from(MODEL) });
  await expect(page.getByTestId('render-status')).toContainText('Géométrie LDraw', { timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.__brickLab && window.__brickLabGame));
  await page.waitForTimeout(300);
}
const ground = (page: Page) => page.evaluate(() => window.__brickLabGame!.ground());

test('A — the red axle put upright (X +90°), placed, restored with exactly that orientation; a placed piece turned in place, undone at once', async ({ page }) => {
  await open(page);
  const g = await ground(page);
  await page.getByTestId('tray-32062.dat-4').click();
  await point(page, [-120, g, 80]);
  let h = (await held(page))!;
  expect(h.orientation.slice(0, 3)).toEqual([0, 0, 1]); // lying: the only orientation of the model
  await page.getByTestId('rot-x-plus').click();
  h = (await held(page))!;
  expect(h.orientation.slice(0, 3)).toEqual([0, -1, 0]); // upright
  await expect(page.getByTestId('orientation-info')).toBeVisible();
  await page.screenshot({ path: PROOF('apres-axe-rouge-vertical.png') });
  await dropHere(page);
  const axle = (await freePieces(page)).at(-1)!;
  expect(axle.partKey).toBe('32062.dat');
  expect(axle.pose.slice(0, 3)).toEqual([0, -1, 0]);
  expect(axle.pose[13]! + h.bottom).toBeCloseTo(g, 1); // standing on the ground by its real lowest point
  // reload: exactly the same pose
  await page.reload();
  await importModel(page);
  expect((await freePieces(page)).at(-1)).toEqual(axle);

  // a placed piece turned in place (Z), lowest point kept; one undo
  await clickAt(page, [axle.pose[12]!, axle.pose[13]! - 10, axle.pose[14]!]);
  await expect(page.getByTestId('selection-info')).toHaveText('1 pièce(s) sélectionnée(s)');
  await page.getByTestId('rot-z-plus').click();
  await expect(page.getByTestId('message')).toContainText('Pièce tournée sur place (Z +90°)');
  const turned = (await freePieces(page)).at(-1)!;
  expect(turned.id).toBe(axle.id);
  expect(Math.abs(turned.pose[1]!)).toBe(0); // lying again
  await page.getByRole('button', { name: 'Annuler' }).click();
  expect((await freePieces(page)).at(-1)).toEqual(axle);
  // keyboard: X / Shift+X on the selection
  await page.keyboard.press('x');
  await page.keyboard.press('Shift+X');
  expect((await freePieces(page)).at(-1)!.pose.slice(0, 11)).toEqual(axle.pose.slice(0, 11));
});

/** Presses on `from`, drags through `to` in small steps, optionally presses Escape before releasing. */
async function drag(page: Page, from: [number, number, number], to: [number, number, number], { escape = false } = {}) {
  const a = await point(page, from);
  await page.mouse.down();
  const b = await page.evaluate((pt) => window.__brickLab!.project(pt), to);
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await frame(page);
  if (escape) await page.keyboard.press('Escape');
  await page.mouse.up();
  await frame(page);
  return a;
}
const camera = (page: Page) => page.evaluate(() => window.__brickLab!.project([0, 0, 0]));

test('B — a placed piece dragged directly (no M), a click does not move it, empty space still turns the camera, Escape cancels, a selection moves together', async ({ page }) => {
  await open(page);
  const g = await ground(page);
  await page.getByTestId('tray-3001.dat-4').click();
  for (const at of [[-100, g, 60], [0, g, 60], [100, g, 60]] as [number, number, number][]) await clickAt(page, at);
  await page.keyboard.press('Escape');
  const before = await freePieces(page);
  const cam = await camera(page);

  // a click with a 2 px slip: selected, not moved
  const p = await point(page, [-100, g - 24, 60]);
  await page.mouse.down();
  await page.mouse.move(p.x + 2, p.y + 1);
  await page.mouse.up();
  await expect(page.getByTestId('selection-info')).toHaveText('1 pièce(s) sélectionnée(s)');
  expect(await freePieces(page)).toEqual(before);

  // drag: moved where released, in one action, camera untouched, stock unchanged
  await drag(page, [-100, g - 24, 60], [-100, g, -80]);
  await expect(page.getByTestId('message')).toContainText('Pièce déplacée');
  let now = await freePieces(page);
  expect(now[0]!.id).toBe(before[0]!.id);
  expect(now[0]!.pose.slice(12, 15)).toEqual([-100, Math.round((g - 24) * 100) / 100, -80]);
  expect(now.slice(1)).toEqual(before.slice(1));
  expect(await camera(page)).toEqual(cam);
  await expect(page.getByTestId('progress')).toHaveText('3/11 pièces posées');
  await page.getByRole('button', { name: 'Annuler' }).click();
  expect(await freePieces(page)).toEqual(before);

  // Escape during the drag: nothing moves
  await drag(page, [0, g - 24, 60], [0, g, -100], { escape: true });
  expect(await freePieces(page)).toEqual(before);
  expect(await camera(page)).toEqual(cam);

  // empty space: the camera turns, no piece moves
  await drag(page, [-260, g, -200], [-160, g, -200]);
  expect(await camera(page)).not.toEqual(cam);
  expect(await freePieces(page)).toEqual(before);
  await page.getByRole('button', { name: 'Centrer' }).click();
  await frame(page);

  // a selection (click, Shift+click) dragged by one of its pieces moves together, one undo
  await clickAt(page, [-100, g - 24, 60]);
  await clickAt(page, [100, g - 24, 60], true);
  await drag(page, [100, g - 24, 60], [100, g, -60]);
  await expect(page.getByTestId('message')).toContainText('Groupe de 2 pièces déplacé');
  now = await freePieces(page);
  expect(now[0]!.pose[14]! - before[0]!.pose[14]!).toBeCloseTo(now[2]!.pose[14]! - before[2]!.pose[14]!, 6);
  expect(now[0]!.pose[12]! - now[2]!.pose[12]!).toBeCloseTo(before[0]!.pose[12]! - before[2]!.pose[12]!, 6);
  expect(now[1]).toEqual(before[1]);
  await page.getByRole('button', { name: 'Annuler' }).click();
  expect(await freePieces(page)).toEqual(before);
  // M is still a shortcut
  await clickAt(page, [0, g - 24, 60]);
  await page.keyboard.press('m');
  await expect(page.getByTestId('held-info')).toContainText('Pièce reprise');
});

const snapNow = (page: Page) => page.evaluate(() => window.__brickLabGame!.snap()) as Promise<{ delta: number[]; pairs: number; targets: string[] } | null>;
const selected = (page: Page) => page.evaluate(() => window.__brickLabGame!.selection()) as Promise<{ kind: string; id: string }[]>;
/** Presses on a placed piece and moves the pointer to `to`, button still down (the release is left to the test). */
async function grab(page: Page, from: [number, number, number], to: [number, number, number], via?: [number, number, number]) {
  await point(page, from);
  await page.mouse.down();
  for (const at of via ? [via, to] : [to]) {
    const b = await page.evaluate((pt) => window.__brickLab!.project(pt), at);
    await page.mouse.move(b.x, b.y, { steps: 10 });
  }
  await frame(page);
}

test('D — the owner’s grey plates snap onto the orange and green studs (exact pose), ⌥ ignores the magnet, an unrecognised axle does not snap', async ({ page }) => {
  await open(page, [...OWNER, P('f14', '32062.dat', '4', [280, 35.41, -160, 0, 0, -1, 0, 1, 0, 1, 0, 0])]);
  await expect(page.getByTestId('progress')).toHaveText('8/11 pièces posées');
  await page.waitForFunction(() => (window.__brickLabGame!.connectors('30157.dat') ?? []).length > 0, null, { timeout: 30_000 });
  // the plate as built by the owner: 2 LDU above the studs, not connected
  expect(OWNER[5]!.pose.slice(0, 3)).toEqual([70, 15.41, -70]);

  // grab it and move it a little: the magnet proposes 2 orange + 2 green studs, then the release places it there
  await grab(page, [70, 15.41, -70], [72, 15.41, -66]);
  let s = (await snapNow(page))!;
  expect(s.pairs).toBe(4);
  expect(s.targets).toEqual(['f:f7', 'f:f9']);
  await expect(page.getByTestId('snap-info')).toContainText('aimant : 4 tenon(s) emboîté(s) sur 2 pièce(s)');
  await page.screenshot({ path: PROOF('apres-aimant-plaque-grise-apercu.png') });
  await page.mouse.up();
  await expect(page.getByTestId('message')).toContainText('Pièce déplacée');
  let grey = (await freePieces(page)).find((f) => f.id === 'f11')!;
  expect(grey.pose.slice(12, 15)).toEqual([70, 17.41, -70]); // bottom on the stud bases (25.41 - 8)

  // ⌥ held while moving: no magnet, the free pose
  await grab(page, [70, 17.41, 50], [72, 17.41, 54]);
  await page.keyboard.down('Alt');
  await page.mouse.move(...Object.values(await page.evaluate(() => window.__brickLab!.project([73, 17.41, 54]))) as [number, number], { steps: 3 });
  await frame(page);
  expect(await snapNow(page)).toBeNull();
  await page.keyboard.up('Alt');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  // without ⌥: the second grey plate snaps too
  // away beyond the drag threshold (a 3 px move is a click), then over the visible top of the orange
  // plate: the plate rests on it, the magnet finds the place where it takes 2 orange + 2 green studs
  await grab(page, [70, 15.41, 50], [70, 25.41, 40], [70, 15.41, 90]);
  s = (await snapNow(page))!;
  expect(s).toMatchObject({ pairs: 4, targets: ['f:f10', 'f:f8'] });
  await page.mouse.up();
  grey = (await freePieces(page)).find((f) => f.id === 'f12')!;
  expect(grey.pose.slice(12, 15)).toEqual([70, 17.41, 50]);
  await page.screenshot({ path: PROOF('apres-assemblage-aligne.png') });

  // the red axle: no recognised connector, no proposal
  await grab(page, [280, 30, -160], [90, 10, -70]);
  expect(await snapNow(page)).toBeNull();
  await page.keyboard.press('Escape');
  await page.mouse.up();
});

test('C — the whole connected assembly selected from one piece (button, double-click), dragged as one object, one undo; a loose piece is not taken', async ({ page }) => {
  // the owner's assembly with both grey plates already aligned (as after the magnet), plus a brick lying against it
  const aligned = OWNER.map((f) => (f.partKey === '30157.dat' ? { ...f, pose: [f.pose[0]!, 17.41, ...f.pose.slice(2)] } : f));
  await open(page, [...aligned, P('f20', '3001.dat', '4', [130, 9.41, -10, 1, 0, 0, 0, 1, 0, 0, 0, 1])]);
  await page.waitForFunction(() => (window.__brickLabGame!.connectors('3034.dat') ?? []).length > 0, null, { timeout: 30_000 });
  const before = await freePieces(page);

  // one piece, then "Sélectionner l'assemblage": the 7 connected pieces, not the brick that only touches them
  await clickAt(page, [70, 25.41, 40]); // an orange plate
  await page.getByTestId('select-assembly').click();
  await expect(page.getByTestId('selection-info')).toHaveText('7 pièce(s) sélectionnée(s)');
  expect((await selected(page)).map((r) => r.id).sort()).toEqual(['f10', 'f11', 'f12', 'f6', 'f7', 'f8', 'f9']);
  await page.screenshot({ path: PROOF('apres-assemblage-selectionne.png') });
  // double-click: the same
  await page.getByTestId('clear-selection').click();
  const q = await point(page, [70, 17.41, -70]); // top of a grey plate (visible from the camera)
  await page.mouse.dblclick(q.x, q.y);
  await expect(page.getByTestId('selection-info')).toHaveText('7 pièce(s) sélectionnée(s)');

  // dragged as one object (by a grey plate, visible on top), turned on the way with Y, relative geometry exact
  await grab(page, [70, 17.41, -70], [-80, 33.41, 0]);
  await page.keyboard.press('y');
  await frame(page);
  await page.screenshot({ path: PROOF('apres-assemblage-deplace.png') });
  await page.mouse.up();
  await expect(page.getByTestId('message')).toContainText('Groupe de 7 pièces déplacé');
  const after = await freePieces(page);
  const ids = ['f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12'];
  const pose = (list: typeof after, id: string) => list.find((f) => f.id === id)!.pose;
  for (const a of ids) {
    for (const b of ids) {
      if (a >= b) continue;
      const d = (l: typeof after) => Math.hypot(...[12, 13, 14].map((k) => pose(l, a)[k]! - pose(l, b)[k]!));
      expect(d(after)).toBeCloseTo(d(before), 6);
    }
  }
  expect(pose(after, 'f20')).toEqual(pose(before, 'f20')); // the loose brick stayed
  await expect(page.getByTestId('progress')).toHaveText('8/11 pièces posées');
  // still connected after the move
  await page.getByTestId('clear-selection').click();
  await clickAt(page, [pose(after, 'f9')[12]!, pose(after, 'f9')[13]!, pose(after, 'f9')[14]!]);
  await page.getByTestId('select-assembly').click();
  await expect(page.getByTestId('selection-info')).toHaveText('7 pièce(s) sélectionnée(s)');
  // one undo
  await page.getByRole('button', { name: 'Annuler' }).click();
  expect(await freePieces(page)).toEqual(before);
  // a lone piece: told to use Shift+click
  await page.getByTestId('clear-selection').click();
  await clickAt(page, [130, 9.41, -10]);
  await page.getByTestId('select-assembly').click();
  await expect(page.getByTestId('message')).toContainText('Aucune autre pièce reliée');
});

test('WebKit (Safari engine): rotation X, direct drag with the magnet, assembly selection', async () => {
  const safari = await webkit.launch().catch(() => null);
  test.skip(!safari, 'WebKit de Playwright indisponible');
  const page = await safari!.newPage({ viewport: { width: 1280, height: 800 }, baseURL: 'http://127.0.0.1:3000' });
  try {
    await open(page, OWNER);
    await page.waitForFunction(() => (window.__brickLabGame!.connectors('30157.dat') ?? []).length > 0, null, { timeout: 30_000 });
    // drag the grey plate: it snaps onto the studs
    await grab(page, [70, 15.41, -70], [72, 15.41, -66]);
    expect((await snapNow(page))?.pairs).toBe(4);
    await page.mouse.up();
    expect((await freePieces(page)).find((f) => f.id === 'f11')!.pose.slice(12, 15)).toEqual([70, 17.41, -70]);
    // its assembly: white plate, oranges, greens and this grey plate (the other grey one is still 2 LDU too high)
    await clickAt(page, [70, 17.41, -70]);
    await page.getByTestId('select-assembly').click();
    await expect(page.getByTestId('selection-info')).toHaveText('6 pièce(s) sélectionnée(s)');
    // turned in place on X, one undo
    const before = await freePieces(page);
    await page.getByTestId('rot-x-plus').click();
    await expect(page.getByTestId('message')).toContainText('6 pièces tournées sur place');
    await page.getByRole('button', { name: 'Annuler' }).click();
    expect(await freePieces(page)).toEqual(before);
  } finally {
    await safari!.close();
  }
});

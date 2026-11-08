import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { clickAt, frame, freePieces, point, type F } from './free-helpers';

/**
 * Owner's request (08/11/2026): one click on one orange piece, « Sélectionner l'assemblage », and the
 * whole mechanism held by a black axle running INSIDE the pieces is selected, hidden pieces included,
 * whatever the camera. Original fixture tests/fixtures/mecanisme-axe.ldr, real LDraw references
 * (3706 Technic Axle 6, 6536 cross blocks, 32123a half bushes, 2780 pins, 6541 bricks with hole), all
 * placed as free pieces (a browser save, nothing in a library).
 */
const PROOF = (n: string) => fileURLToPath(new URL(`../../docs/implementation/preuves/connexions/${n}`, import.meta.url));
const MODEL = readFileSync(fileURLToPath(new URL('../fixtures/mecanisme-axe.ldr', import.meta.url)), 'utf8');
const SHA = createHash('sha256').update(MODEL).digest('hex');
// every part line of the fixture becomes a free piece f1…f16, at its pose (x y z a…i)
const PIECES: F[] = MODEL.split('\n').filter((l) => l.startsWith('1 ')).map((l, i) => {
  const t = l.trim().split(/\s+/);
  return { id: `f${i + 1}`, partKey: t[14]!, colorCode: t[1]!, pose: t.slice(2, 14).map(Number) };
});
// the axle, the 3 orange cross blocks, the 2 bushes, the 2 pins, the 2 orange bricks, the plate on one of them
const MECHANISM = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11'];
// the cross block beyond the axle tip, the brick lined up without a pin, the axle in a brick without a hole, that brick, the hiding plate
const LOOSE = ['f12', 'f13', 'f14', 'f15', 'f16'];

const selected = async (page: Page) => ((await page.evaluate(() => window.__brickLabGame!.selection())) as { id: string }[]).map((r) => r.id).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
const scene = (page: Page) => page.evaluate(() => window.__brickLab!.sceneSummary());

async function openMechanism(page: Page, reload = true) {
  if (reload) {
    await page.goto('/atelier');
    await page.evaluate(([k, v]) => { localStorage.clear(); localStorage.setItem(k!, v!); }, [`brick-lab:progress:${SHA}`,
      JSON.stringify({ schemaVersion: 3, modelContentHash: SHA, displayName: 'mecanisme-axe.ldr', buildMode: 'freeManual', placedOccurrenceIds: [], totalOccurrences: PIECES.length, freePieces: PIECES, updatedAtIso: '2026-11-08T17:00:00.000Z' })] as const);
  }
  await page.reload();
  await page.locator('input[type=file][accept=".ldr,.mpd"]').first().setInputFiles({ name: 'mecanisme-axe.ldr', mimeType: 'text/plain', buffer: Buffer.from(MODEL) });
  await expect(page.getByTestId('render-status')).toContainText('Géométrie LDraw', { timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.__brickLab && window.__brickLabGame));
  await page.waitForFunction(() => (window.__brickLabGame!.connectors('3706.dat') ?? []).length > 0 && (window.__brickLabGame!.connectors('6536.dat') ?? []).length > 0, null, { timeout: 30_000 });
  await page.waitForTimeout(300);
}

/** Turns the camera: a drag on the empty background (not a click: nothing is selected or cleared). */
async function orbit(page: Page, dx: number, dy: number) {
  const box = (await page.getByTestId('build-canvas').boundingBox())!;
  const x = box.x + 40, y = box.y + box.height - 40;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
  await frame(page);
}

test('one orange cross block → the whole mechanism, the hidden axle included, the same from every camera angle', async ({ page }) => {
  await openMechanism(page);
  await expect(page.getByTestId('progress')).toHaveText(`${PIECES.length}/${PIECES.length} pièces posées`);
  // the axle is inside the cross blocks: invisible; the graph does not care
  const graph = (await page.evaluate(() => window.__brickLabGame!.graph())) as Record<string, string[]>;
  expect(graph['f:f1']).toEqual(['f:f2', 'f:f3', 'f:f4', 'f:f5', 'f:f6'].sort());
  for (const id of LOOSE) expect(graph[`f:${id}`]).toBeUndefined();

  // one click on the orange cross block at x = 40 (its +X face), then « Assemblage »
  await clickAt(page, [50, 15, 5]);
  expect(await selected(page)).toEqual(['f4']);
  await page.getByTestId('select-assembly').click();
  await expect(page.getByTestId('selection-info')).toHaveText(`${MECHANISM.length} pièce(s) sélectionnée(s)`);
  expect(await selected(page)).toEqual(MECHANISM);
  await expect(page.getByTestId('message')).toContainText('visibles ou cachées');
  await page.screenshot({ path: PROOF('assemblage-cache-selection.png') });

  // « Voir les connexions »: the 5 other pieces seen through, the 11 selected drawn as selected
  await page.getByTestId('xray').click();
  await frame(page);
  expect(await scene(page)).toMatchObject({ selected: MECHANISM.length, xray: LOOSE.length, solid: 0 });
  await page.screenshot({ path: PROOF('assemblage-cache-voir-connexions.png') });
  await page.getByTestId('xray').click();
  await frame(page);
  expect(await scene(page)).toMatchObject({ selected: MECHANISM.length, xray: 0, solid: LOOSE.length });

  // the camera turned three ways: the cross block picked, the view turned, the same assembly
  for (const [i, [dx, dy]] of ([[120, 0], [-220, 0], [80, -160]] as const).entries()) {
    await page.getByTestId('clear-selection').click();
    await page.getByRole('button', { name: 'Centrer', exact: true }).click();
    await frame(page);
    await clickAt(page, [50, 15, 5]);
    expect(await selected(page)).toEqual(['f4']);
    await orbit(page, dx, dy);
    await page.getByTestId('select-assembly').click();
    expect(await selected(page)).toEqual(MECHANISM);
    if (i === 1) await page.screenshot({ path: PROOF('assemblage-cache-autre-angle.png') });
  }
  // from an angle where the plate hides the cross block, a click reaches the plate: it is not
  // connected, its assembly is itself alone
  await page.getByTestId('clear-selection').click();
  await page.getByRole('button', { name: 'Centrer', exact: true }).click();
  await orbit(page, 120, 0);
  await clickAt(page, [50, 15, 5]);
  expect(await selected(page)).toEqual(['f16']);
  await page.getByTestId('select-assembly').click();
  expect(await selected(page)).toEqual(['f16']);
});

test('the mechanism moved and turned as one group: relative poses kept, one undo, saved and reloaded', async ({ page }) => {
  await openMechanism(page);
  await clickAt(page, [50, 15, 5]);
  await page.getByTestId('select-assembly').click();
  expect(await selected(page)).toEqual(MECHANISM);
  const before = await freePieces(page);
  const posesOf = (list: F[], ids: string[]) => ids.map((id) => list.find((f) => f.id === id)!.pose);

  // in hand as one group, a quarter turn, put down elsewhere
  await page.keyboard.press('m');
  await expect(page.getByTestId('held-info')).toContainText(`Groupe de ${MECHANISM.length} pièces`);
  await page.keyboard.press('r');
  await point(page, [0, 40, -90]);
  await point(page, [10, 40, -100]);
  const p = (await page.evaluate(() => window.__brickLabGame!.held()))!.previewPose!;
  await clickAt(page, [p[12]!, p[13]!, p[14]!]);
  await expect(page.getByTestId('message')).toContainText(`Groupe de ${MECHANISM.length} pièces déplacé`);
  const after = await freePieces(page);
  // the loose pieces did not move
  expect(posesOf(after, LOOSE)).toEqual(posesOf(before, LOOSE));
  // rigid: the distances between every two pieces of the mechanism are unchanged
  const d = (a: number[], b: number[]) => Math.hypot(a[12]! - b[12]!, a[13]! - b[13]!, a[14]! - b[14]!);
  const pb = posesOf(before, MECHANISM), pa = posesOf(after, MECHANISM);
  for (let i = 0; i < pb.length; i++) for (let j = i + 1; j < pb.length; j++) expect(d(pa[i]!, pa[j]!)).toBeCloseTo(d(pb[i]!, pb[j]!), 1);
  expect(pa[0]).not.toEqual(pb[0]);
  // still one mechanism: the same assembly from one piece
  const g = (await page.evaluate(() => window.__brickLabGame!.graph())) as Record<string, string[]>;
  expect(g['f:f1']).toEqual(['f:f2', 'f:f3', 'f:f4', 'f:f5', 'f:f6'].sort());

  // saved: after a reload, the moved mechanism is there and still one assembly
  await page.waitForTimeout(600); // the browser save is debounced
  await openMechanism(page, false);
  expect(posesOf(await freePieces(page), MECHANISM)).toEqual(pa);
  const g2 = (await page.evaluate(() => window.__brickLabGame!.graph())) as Record<string, string[]>;
  expect(g2['f:f1']).toEqual(g['f:f1']);
});

test('one undo puts the whole mechanism back', async ({ page }) => {
  await openMechanism(page);
  await clickAt(page, [50, 15, 5]);
  await page.getByTestId('select-assembly').click();
  const before = await freePieces(page);
  await page.keyboard.press('m');
  await point(page, [0, 40, -90]);
  const p = (await page.evaluate(() => window.__brickLabGame!.held()))!.previewPose!;
  await clickAt(page, [p[12]!, p[13]!, p[14]!]);
  await expect(page.getByTestId('message')).toContainText('déplacé');
  expect(await freePieces(page)).not.toEqual(before);
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  expect(await freePieces(page)).toEqual(before);
});

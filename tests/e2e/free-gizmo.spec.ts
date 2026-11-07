import { fileURLToPath } from 'node:url';
import { expect, test, webkit, type Page } from '@playwright/test';
import { clickAt, dragHandle, frame, freePieces, ground, handle, open, OWNER, P, point, type F } from './free-helpers';

/**
 * Transform gizmo of the free mode (07/11/2026): on a click, three arrows appear on the piece (X red,
 * Y green, Z blue); dragging one moves the piece along that axis only, by steps counted from the
 * start of the drag; rings turn it; global / local axes; coordinates shown and typed; groups.
 * The pointer goes to the handles computed from the gizmo itself (TransformControls geometry).
 */
test.setTimeout(150_000);
const PROOF = (n: string) => fileURLToPath(new URL(`../../docs/implementation/preuves/libre/${n}`, import.meta.url));
const ALIGNED = OWNER.map((f) => (f.partKey === '30157.dat' ? { ...f, pose: [f.pose[0]!, 17.41, ...f.pose.slice(2)] } : f));
const xyz = (f: F) => f.pose.slice(12, 15);
const piece = async (page: Page, id: string) => (await freePieces(page)).find((f) => f.id === id)!;
const selected = (page: Page) => page.evaluate(() => window.__brickLabGame!.selection().map((r) => (r as { id?: string }).id));

test('the arrows appear on a click (no M); X, Y and Z move the piece along one axis only, by grid steps from where it was; 1 LDU; ⌥ free; one undo each', async ({ page }) => {
  await open(page, ALIGNED);
  const g = await ground(page);
  const others = (await freePieces(page)).filter((f) => f.id !== 'f11');
  // a click on the grey plate: the gizmo is there at once, with the coordinates
  await clickAt(page, [70, 17.41, -70]);
  await expect(page.getByTestId('gizmo-coords')).toHaveText(`X 70 · Y ${Math.round((g - 17.41) * 100) / 100} (hauteur) · Z 70 LDU`);
  expect(await page.evaluate(() => window.__brickLabGizmo?.controls()?.mode)).toBe('translate');
  await page.screenshot({ path: PROOF('gizmo-fleches.png') });
  const start = xyz(await piece(page, 'f11'));

  // X +40: only x changes, by exactly 40 (steps of a half stud from the start)
  await dragHandle(page, 'translate', 'X', 42);
  expect(xyz(await piece(page, 'f11'))).toEqual([start[0]! + 40, start[1], start[2]]);
  // Y (green, up) one plate: LDraw y −8, nothing else — never rounded to an absolute value (17.41 → 9.41)
  await dragHandle(page, 'translate', 'Y', 9);
  expect(xyz(await piece(page, 'f11'))).toEqual([start[0]! + 40, 9.41, start[2]]);
  // Z (blue) +20: LDraw z −20
  await dragHandle(page, 'translate', 'Z', 21);
  expect(xyz(await piece(page, 'f11'))).toEqual([start[0]! + 40, 9.41, start[2]! - 20]);
  await expect(page.getByTestId('message')).toContainText('Pièce : déplacée');
  // fine steps: 1 LDU
  await page.getByTestId('gizmo-step').selectOption('1');
  await dragHandle(page, 'translate', 'Y', -3.2);
  expect(xyz(await piece(page, 'f11'))[1]).toBeCloseTo(12.41, 6);
  // ⌥ held: no step at all (not a whole number of LDU in general)
  await page.getByTestId('gizmo-step').selectOption('10');
  const before = xyz(await piece(page, 'f11'));
  await dragHandle(page, 'translate', 'X', 13.7, { alt: true });
  const freeX = xyz(await piece(page, 'f11'))[0]!;
  expect(Math.abs(freeX - before[0]! - 13.7)).toBeLessThan(2.5);
  expect(xyz(await piece(page, 'f11')).slice(1)).toEqual(before.slice(1));
  // each drag is one action
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Annuler' }).click();
  expect(xyz(await piece(page, 'f11'))).toEqual(start);
  // the other pieces never moved
  expect((await freePieces(page)).filter((f) => f.id !== 'f11')).toEqual(others);
});

test('rings turn the piece (red axle upright by the mouse), local axes follow it, typed coordinates, all restored after a reload', async ({ page }) => {
  await open(page, [...ALIGNED, P('f14', '32062.dat', '4', [200, 37.41, 100, 0, 0, -1, 0, 1, 0, 1, 0, 0])]);
  await clickAt(page, [200, 33.41, 100]);
  await expect(page.getByTestId('selection-info')).toHaveText('1 pièce(s) sélectionnée(s)');
  // rings (E): a quarter turn around X by the mouse (90° steps)
  await page.keyboard.press('e');
  expect(await page.evaluate(() => window.__brickLabGizmo!.controls()!.mode)).toBe('rotate');
  const h = await handle(page, 'rotate', 'X', 100); // a little more than a quarter turn: 90° steps
  await page.mouse.move(h.from.x, h.from.y, { steps: 3 });
  await frame(page);
  expect(await page.evaluate(() => window.__brickLabGizmo!.controls()!.axis)).toBe('X');
  await page.mouse.down();
  await page.mouse.move(h.to.x, h.to.y, { steps: 16 });
  await frame(page);
  await page.screenshot({ path: PROOF('gizmo-anneaux.png') });
  await page.mouse.up();
  await frame(page);
  let axle = await piece(page, 'f14');
  expect(Math.abs(axle.pose[1]!)).toBe(1); // its length (local X) is now vertical
  expect(axle.pose.slice(12, 15)).toEqual([200, 37.41, 100]); // turned about its own origin
  // local axes: the red arrow now follows the axle (vertical): x stays, the height changes
  await page.keyboard.press('w');
  await page.keyboard.press('q');
  expect(await page.evaluate(() => window.__brickLabGizmo!.controls()!.space)).toBe('local');
  const yBefore = axle.pose[13]!;
  await dragHandle(page, 'translate', 'X', 9);
  axle = await piece(page, 'f14');
  expect(axle.pose[12]).toBe(200);
  expect(Math.abs(axle.pose[13]! - yBefore)).toBeCloseTo(8, 6); // one plate along the axle's own X (vertical)
  // typed coordinates (X, Y = height, Z)
  await page.getByTestId('gizmo-x').fill('150');
  await page.getByTestId('gizmo-z').fill('-40');
  await page.getByTestId('gizmo-apply').click();
  axle = await piece(page, 'f14');
  expect([axle.pose[12], axle.pose[14]]).toEqual([150, 40]);
  // reload: exactly the same
  const all = await freePieces(page);
  await page.reload();
  await page.locator('input[type=file][accept=".ldr,.mpd"]').first().setInputFiles({ name: 'assemblage.ldr', mimeType: 'text/plain', buffer: Buffer.from((await import('./free-helpers')).MODEL) });
  await expect(page.getByTestId('render-status')).toContainText('Géométrie LDraw', { timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.__brickLabGame));
  expect(await freePieces(page)).toEqual(all);
});

test('a connected assembly: the gizmo on its pivot moves and turns it as one object, relative positions exact, stock unchanged, one undo', async ({ page }) => {
  await open(page, ALIGNED);
  await page.waitForFunction(() => (window.__brickLabGame!.connectors('3034.dat') ?? []).length > 0, null, { timeout: 30_000 });
  await clickAt(page, [70, 17.41, -70]);
  await page.getByTestId('select-assembly').click();
  await expect(page.getByTestId('selection-info')).toHaveText('7 pièce(s) sélectionnée(s)');
  const before = await freePieces(page);
  // the gizmo at the pivot of the group: up one plate (Y), then a quarter turn (ring Y)
  await dragHandle(page, 'translate', 'Y', 9);
  let after = await freePieces(page);
  for (const f of after) expect(xyz(f)).toEqual([xyz(before.find((b) => b.id === f.id)!)[0], Math.round((xyz(before.find((b) => b.id === f.id)!)[1]! - 8) * 100) / 100, xyz(before.find((b) => b.id === f.id)!)[2]]);
  await page.getByTestId('gizmo-rotate').click();
  const h = await handle(page, 'rotate', 'Y', 100);
  await page.mouse.move(h.from.x, h.from.y, { steps: 3 });
  await frame(page);
  expect(await page.evaluate(() => window.__brickLabGizmo!.controls()!.axis)).toBe('Y');
  await page.mouse.down();
  await page.mouse.move(h.to.x, h.to.y, { steps: 16 });
  await page.mouse.up();
  await frame(page);
  after = await freePieces(page);
  const d = (l: F[], a: string, b: string) => Math.hypot(...[12, 13, 14].map((k) => l.find((f) => f.id === a)!.pose[k]! - l.find((f) => f.id === b)!.pose[k]!));
  for (const [a, b] of [['f6', 'f11'], ['f9', 'f12'], ['f7', 'f8']]) expect(d(after, a!, b!)).toBeCloseTo(d(before, a!, b!), 6);
  expect(after.find((f) => f.id === 'f6')!.pose.slice(0, 11)).not.toEqual(before.find((f) => f.id === 'f6')!.pose.slice(0, 11));
  expect((await selected(page)).length).toBe(7);
  await expect(page.getByTestId('progress')).toHaveText('7/11 pièces posées');
  await page.screenshot({ path: PROOF('gizmo-assemblage.png') });
  // the two transforms, undone one at a time
  await page.getByRole('button', { name: 'Annuler' }).click();
  await page.getByRole('button', { name: 'Annuler' }).click();
  expect(await freePieces(page)).toEqual(before);
});

test('Escape cancels a gizmo drag; a press on the piece itself is still the direct drag with the magnet; no selection, no gizmo', async ({ page }) => {
  await open(page, OWNER);
  await page.waitForFunction(() => (window.__brickLabGame!.connectors('30157.dat') ?? []).length > 0, null, { timeout: 30_000 });
  await clickAt(page, [70, 15.41, -70]);
  const start = xyz(await piece(page, 'f11'));
  // Escape during an arrow drag: back where it was, still selected
  const h = await handle(page, 'translate', 'X', 40);
  await page.mouse.move(h.from.x, h.from.y, { steps: 3 });
  await frame(page);
  await page.mouse.down();
  await page.mouse.move(h.to.x, h.to.y, { steps: 10 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await frame(page);
  expect(xyz(await piece(page, 'f11'))).toEqual(start);
  expect(await selected(page)).toEqual(['f11']);
  // the plate itself (not an arrow): the direct drag, which snaps onto the studs (4)
  await point(page, [70, 15.41, -70]);
  await page.mouse.down();
  const b = await page.evaluate(() => window.__brickLab!.project([72, 15.41, -66]));
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await frame(page);
  expect((await page.evaluate(() => window.__brickLabGame!.snap()))?.pairs).toBe(4);
  await page.mouse.up();
  expect(xyz(await piece(page, 'f11'))).toEqual([70, 17.41, -70]);
  // no selection: no gizmo (guided mode never has one: free-height-group « guided mode unchanged »)
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('manip-bar')).toHaveCount(0);
  await frame(page);
  expect(await page.evaluate(() => Boolean(window.__brickLabGizmo))).toBe(false);
});

test('WebKit (Safari engine): arrows on a click, Y drag by one plate', async () => {
  const safari = await webkit.launch().catch(() => null);
  test.skip(!safari, 'WebKit de Playwright indisponible');
  const page = await safari!.newPage({ viewport: { width: 1280, height: 800 }, baseURL: 'http://127.0.0.1:3000' });
  try {
    await open(page, ALIGNED);
    await clickAt(page, [70, 17.41, -70]);
    await expect(page.getByTestId('gizmo-coords')).toBeVisible();
    await dragHandle(page, 'translate', 'Y', 9);
    expect(xyz(await piece(page, 'f11'))).toEqual([70, 9.41, -70]);
  } finally {
    await safari!.close();
  }
});

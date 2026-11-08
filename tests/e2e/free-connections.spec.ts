import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { clickAt, frame, freePieces, held, importModel, open, OWNER, point } from './free-helpers';

/**
 * Free building, connections (fix/free-building-connections): a piece taken from the TRAY snaps
 * exactly like the same piece taken again after being placed — same pointer, same orientation, same
 * proposal, markers shown before the first click, and the pose saved is the pose shown.
 * Bug found by the owner on 31039 (08/11/2026): from the tray, no green marker, no snap.
 */
const PROOF = (n: string) => fileURLToPath(new URL(`../../docs/implementation/preuves/connexions/${n}`, import.meta.url));
type Snap = { delta: number[]; pairs: number; targets: string[]; points: number[][] } | null;
const snapNow = (page: Page) => page.evaluate(() => window.__brickLabGame!.snap()) as Promise<Snap>;
const markers = (page: Page) => page.evaluate(() => window.__brickLab!.snapMarkers()) as Promise<number[][]>;
// the owner's assembly without the first grey plate: one 30157 left in the stock
const WITHOUT_GREY = OWNER.filter((f) => f.id !== 'f11');
const AIM: [number, number, number] = [72, 25.41, -66]; // on the orange plate f9, near the green bracket f7

test('A/B — from the tray and after taking it again: same snap, markers before the first click, pose saved = pose shown', async ({ page }) => {
  await open(page, WITHOUT_GREY);
  await page.waitForFunction(() => (window.__brickLabGame!.connectors('30157.dat') ?? []).length > 0, null, { timeout: 30_000 });

  // A — straight from the tray: the hand was empty before
  await page.getByTestId('tray-30157.dat-71').click();
  await point(page, [AIM[0] + 4, AIM[1], AIM[2] + 4]);
  await point(page, AIM);
  const a = await snapNow(page);
  expect(a).toMatchObject({ pairs: 4, targets: ['f:f7', 'f:f9'] });
  await expect(page.getByTestId('snap-info')).toContainText('aimant : 4 tenon(s) emboîté(s) sur 2 pièce(s)');
  expect(await markers(page)).toEqual(a!.points);
  const shownA = (await held(page))!.previewPose;
  await page.screenshot({ path: PROOF('apres-bac-apercu.png') });
  await page.mouse.click(...(Object.values(await page.evaluate((pt) => window.__brickLab!.project(pt), AIM)) as [number, number]));
  await expect(page.getByTestId('message')).toContainText('Pièce posée');
  const placed = (await freePieces(page)).find((f) => f.partKey === '30157.dat' && f.id !== 'f12')!;
  expect(placed.pose).toEqual(shownA);
  expect(placed.pose.slice(12, 15)).toEqual([70, 17.41, -70]);

  // B — the same piece taken again, moved away, then brought back under the same pointer
  await page.keyboard.press('Escape');
  await clickAt(page, [70, 17.41, -70]);
  await page.keyboard.press('m');
  await point(page, [70, 25.41, 60]);
  await point(page, [AIM[0] + 4, AIM[1], AIM[2] + 4]);
  await point(page, AIM);
  const b = await snapNow(page);
  expect(b).toEqual(a);
  expect((await held(page))!.previewPose).toEqual(shownA);
});

test('the pieces magnet off (checkbox) or bypassed (⌥): no proposal from the tray either', async ({ page }) => {
  await open(page, WITHOUT_GREY);
  await page.waitForFunction(() => (window.__brickLabGame!.connectors('30157.dat') ?? []).length > 0, null, { timeout: 30_000 });
  await page.getByTestId('tray-30157.dat-71').click();
  await point(page, AIM);
  expect(await snapNow(page)).not.toBeNull();
  await page.keyboard.down('Alt');
  await point(page, [AIM[0] + 1, AIM[1], AIM[2]]);
  expect(await snapNow(page)).toBeNull();
  expect(await markers(page)).toEqual([]);
  await page.keyboard.up('Alt');
  await page.getByTestId('snap-pieces').uncheck();
  await point(page, AIM);
  expect(await snapNow(page)).toBeNull();
  await frame(page);
});

const MODEL_SPOT: [number, number, number] = [0, 17.41, 0]; // the official place of a grey plate in the synthetic model

test('9. model magnet and pieces magnet: separately, then together (the official spot wins only where it is)', async ({ page }) => {
  await open(page, WITHOUT_GREY);
  await page.waitForFunction(() => (window.__brickLabGame!.connectors('30157.dat') ?? []).length > 0, null, { timeout: 30_000 });
  await page.getByTestId('tray-30157.dat-71').click();
  const at = async (p: [number, number, number]) => {
    await point(page, [p[0] + 3, p[1], p[2] + 3]);
    await point(page, p);
    return page.evaluate(() => ({ held: window.__brickLabGame!.held(), snap: window.__brickLabGame!.snap(), engaged: window.__brickLabGame!.engaged() }));
  };
  // both on: at the official spot, the model magnet; on the assembly, the pieces magnet
  let r = await at(MODEL_SPOT);
  expect(r.held!.targetId).not.toBeNull();
  expect(r.snap).toBeNull();
  await expect(page.getByTestId('target-found')).toBeVisible();
  r = await at(AIM);
  expect(r.snap).toMatchObject({ pairs: 4, targets: ['f:f7', 'f:f9'] });
  // model magnet only: no pieces proposal; the markers are only what the pose shown really engages
  await page.getByTestId('snap-pieces').uncheck();
  r = await at(AIM);
  expect(r.snap).toBeNull();
  expect(await markers(page)).toEqual(r.engaged!.points);
  r = await at(MODEL_SPOT);
  expect(r.held!.targetId).not.toBeNull();
  // pieces magnet only: the official spot is no longer a magnet
  await page.getByTestId('snap-pieces').check();
  await page.getByTestId('snap-model').uncheck();
  r = await at(MODEL_SPOT);
  expect(r.held!.targetId).toBeNull();
  r = await at(AIM);
  expect(r.snap).toMatchObject({ pairs: 4, targets: ['f:f7', 'f:f9'] });
  // both off: a free pose, no proposal
  await page.getByTestId('snap-pieces').uncheck();
  r = await at(AIM);
  expect(r.snap).toBeNull();
  expect(r.held!.targetId).toBeNull();
});

test('8. turned so that the axes do not match: the engine says so (no proposal, no marker); turned back: it snaps again', async ({ page }) => {
  await open(page, WITHOUT_GREY);
  await page.waitForFunction(() => (window.__brickLabGame!.connectors('30157.dat') ?? []).length > 0, null, { timeout: 30_000 });
  await page.getByTestId('tray-30157.dat-71').click();
  await page.keyboard.press('x'); // a quarter turn around X: the receptors look sideways
  await point(page, AIM);
  await point(page, [AIM[0] + 2, AIM[1], AIM[2]]);
  expect(await snapNow(page)).toBeNull();
  expect(await page.evaluate(() => window.__brickLabGame!.snapMiss())).toBe('AXES');
  await expect(page.getByTestId('snap-miss')).toContainText('axes non alignés');
  expect(await markers(page)).toEqual([]);
  await page.screenshot({ path: PROOF('axes-non-alignes.png') });
  for (let i = 0; i < 3; i++) await page.keyboard.press('x');
  await point(page, AIM);
  expect(await snapNow(page)).toMatchObject({ pairs: 4 });
  await expect(page.getByTestId('snap-miss')).toHaveCount(0);
});

test('11/12. snapped from the tray: the assembly includes it at once; one undo removes it; saved and reloaded at the same pose', async ({ page }) => {
  await open(page, WITHOUT_GREY);
  await page.waitForFunction(() => (window.__brickLabGame!.connectors('30157.dat') ?? []).length > 0, null, { timeout: 30_000 });
  const before = await freePieces(page);
  await page.getByTestId('tray-30157.dat-71').click();
  await point(page, AIM);
  const shown = (await held(page))!.previewPose;
  await page.mouse.click(...(Object.values(await page.evaluate((pt) => window.__brickLab!.project(pt), AIM)) as [number, number]));
  await expect(page.getByTestId('message')).toContainText('Pièce posée');
  const placed = (await freePieces(page)).find((f) => !before.some((b) => b.id === f.id))!;
  expect(placed.pose).toEqual(shown);
  // its assembly: the new plate with the orange plate and the green bracket it holds, and through them the rest
  await clickAt(page, [70, 17.41, -70]);
  expect((await page.evaluate(() => window.__brickLabGame!.selection())).map((r) => (r.kind === 'free' ? r.id : r.occurrenceId))).toEqual([placed.id]);
  await page.getByTestId('select-assembly').click();
  const ids = (await page.evaluate(() => window.__brickLabGame!.selection())).map((r) => (r.kind === 'free' ? r.id : r.occurrenceId));
  expect(ids).toEqual(expect.arrayContaining([placed.id, 'f6', 'f7', 'f9']));
  expect(ids).not.toContain('f12'); // the other grey plate, 2 LDU too high: not connected
  // one undo: back to before
  await page.getByTestId('clear-selection').click();
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  expect(await freePieces(page)).toEqual(before);
  // again, then a reload: the same pose
  await page.getByTestId('tray-30157.dat-71').click();
  await point(page, [AIM[0] + 3, AIM[1], AIM[2] + 3]);
  await point(page, AIM);
  await page.mouse.click(...(Object.values(await page.evaluate((pt) => window.__brickLab!.project(pt), AIM)) as [number, number]));
  await expect(page.getByTestId('message')).toContainText('Pièce posée');
  const saved = await freePieces(page);
  await page.waitForTimeout(600);
  await page.reload();
  await importModel(page);
  expect(await freePieces(page)).toEqual(saved);
  expect(saved.find((f) => !before.some((b) => b.id === f.id))!.pose).toEqual(shown);
});

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, webkit, type Page } from '@playwright/test';
import { freePieces, held, point, type F } from './free-helpers';

/**
 * Owner's 31039 (08/11/2026): the tan brick with a hole 6541 and the dark grey corner plate 2639 over
 * it did not fit. The curved inverted slope 41763 and the inverted slope 4287 under the plate draw some
 * hollow studs longer than a stud (sunk into the part) and 41763's tubes stop 0.4 LDU above its rim: the
 * magnet put 41763 0.4 LDU too low and 4287 into the curve, and every piece above them followed, so the
 * plate could not take the slope and the block at once. Original fixture
 * tests/fixtures/pente-inversee-bloc.ldr; every piece taken from the TRAY in the owner's order, away
 * from the model's places (the pieces magnet, not the model magnet).
 */
const PROOF = (n: string) => fileURLToPath(new URL(`../../docs/implementation/preuves/connexions/${n}`, import.meta.url));
const MODEL = readFileSync(fileURLToPath(new URL('../fixtures/pente-inversee-bloc.ldr', import.meta.url)), 'utf8');
const SHA = createHash('sha256').update(MODEL).digest('hex');
const SHIFT = 120; // the build stands 120 LDU beside the model's places
const PLACE = Object.fromEntries(MODEL.split('\n').filter((l) => l.startsWith('1 ')).map((l) => {
  const t = l.trim().split(/\s+/).map((v, i) => (i >= 2 && i <= 13 ? Number(v) : v));
  return [t[14] as string, { colorCode: t[1] as string, pose: [(t[2] as number) + SHIFT, ...(t.slice(3, 14) as number[])] }];
}));
const BASE: F[] = [
  { id: 'f1', partKey: '3001.dat', ...PLACE['3001.dat']! },
  { id: 'f2', partKey: '3005.dat', ...PLACE['3005.dat']! },
];
type Snap = { delta: number[]; pairs: number; targets: string[]; points: number[][]; kinds: string[] } | null;
const snapNow = (page: Page) => page.evaluate(() => window.__brickLabGame!.snap()) as Promise<Snap>;
const markers = (page: Page) => page.evaluate(() => window.__brickLab!.snapMarkers()) as Promise<number[][]>;

async function openBase(page: Page) {
  await page.goto('/atelier');
  await page.evaluate(([k, v]) => { localStorage.clear(); localStorage.setItem(k!, v!); }, [`brick-lab:progress:${SHA}`,
    JSON.stringify({ schemaVersion: 3, modelContentHash: SHA, displayName: 'pente-inversee-bloc.ldr', buildMode: 'freeManual', placedOccurrenceIds: [], totalOccurrences: 6, freePieces: BASE, updatedAtIso: '2026-11-08T21:00:00.000Z' })] as const);
  await page.reload();
  await page.locator('input[type=file][accept=".ldr,.mpd"]').first().setInputFiles({ name: 'pente-inversee-bloc.ldr', mimeType: 'text/plain', buffer: Buffer.from(MODEL) });
  await expect(page.getByTestId('render-status')).toContainText('Géométrie LDraw', { timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.__brickLab && window.__brickLabGame));
  await page.waitForFunction(() => ['3001.dat', '3005.dat', '41763.dat', '4287.dat', '6541.dat', '2639.dat'].every((k) => (window.__brickLabGame!.connectors(k) ?? []).length > 0), null, { timeout: 30_000 });
  await page.waitForTimeout(300);
}

/**
 * Takes a piece from the tray and brings it near its place, a few LDU off: the pointer on the surface
 * it rests on (`height` = its height), or with a manual `height` of null at the level of its place,
 * chosen over `over` (the top of a placed piece) — for a piece bridging two others with nothing under
 * its origin. The proposal and its markers before the click.
 */
async function fromTray(page: Page, partKey: string, height: number | null, over?: [number, number, number]) {
  const { colorCode, pose } = PLACE[partKey]!;
  await page.getByTestId(`tray-${partKey}-${colorCode}`).click();
  if (height === null) {
    // resting on the top of `over`, then the same height kept by hand (PageUp, PageDown)
    await point(page, over!);
    await page.keyboard.press('PageUp');
    await page.keyboard.press('PageDown');
    expect((await held(page))!.previewPose[13]).toBe(pose[1]);
  }
  const aim: [number, number, number] = [pose[0]! + 3, pose[1]! + (height ?? 0), pose[2]! + 4];
  await point(page, [aim[0] + 6, aim[1], aim[2] + 6]);
  await point(page, aim);
  const snap = await snapNow(page);
  const shown = (await held(page))!.previewPose;
  expect.soft(await markers(page)).toEqual(snap?.points ?? []);
  return { snap, shown, aim };
}
async function drop(page: Page, aim: [number, number, number]) {
  const before = (await freePieces(page)).length;
  const p = await point(page, aim);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('message')).toContainText(/Pièce posée|Toutes les pièces du set sont posées/);
  const after = await freePieces(page);
  expect(after.length).toBe(before + 1);
  return after.at(-1)!;
}
const at = (pose: number[]) => pose.slice(12, 15);
/** A capture framed on the build (the same framing before and after the fix). */
async function shot(page: Page, name: string) {
  const corners = await page.evaluate((pts) => pts.map((q) => window.__brickLab!.project(q as [number, number, number])),
    [[SHIFT - 50, -60, -130], [SHIFT + 50, -60, -130], [SHIFT - 50, 24, 30], [SHIFT + 50, 24, 30], [SHIFT - 50, -60, 30], [SHIFT + 50, 24, -130]]);
  const xs = corners.map((c) => c.x), ys = corners.map((c) => c.y);
  const x = Math.max(0, Math.min(...xs) - 30), y = Math.max(0, Math.min(...ys) - 30);
  await page.screenshot({ path: PROOF(name), clip: { x, y, width: Math.max(...xs) - x + 30, height: Math.max(...ys) - y + 30 } });
}
const expected = (partKey: string) => PLACE[partKey]!.pose.slice(0, 3);

/** The owner's order, every piece from the tray; `proof`: the capture of the grey plate's preview. */
async function fuselage(page: Page, proof?: string) {
  await openBase(page);

  const curve = await fromTray(page, '41763.dat', 24);
  expect.soft(curve.snap).toMatchObject({ targets: ['f:f1'], kinds: ['stud'] });
  expect.soft(at(curve.shown)).toEqual(expected('41763.dat')); // on the brick, not 0.4 LDU into it
  const c = await drop(page, curve.aim);
  expect.soft(c.pose).toEqual(curve.shown);
  await page.keyboard.press('Escape');

  const slope = await fromTray(page, '4287.dat', 24);
  expect.soft(slope.snap).toMatchObject({ pairs: 1, targets: [`f:${c.id}`] });
  expect.soft(at(slope.shown)).toEqual(expected('4287.dat')); // on the top of the curve, not into it
  const s = await drop(page, slope.aim);
  expect.soft(s.pose).toEqual(slope.shown);
  await page.keyboard.press('Escape');

  const block = await fromTray(page, '6541.dat', 24);
  expect.soft(block.snap).toMatchObject({ pairs: 1, targets: ['f:f2'] });
  expect.soft(at(block.shown)).toEqual(expected('6541.dat'));
  const b = await drop(page, block.aim);
  expect.soft(b.pose).toEqual(block.shown);
  await page.keyboard.press('Escape');

  // the grey plate bridges the slope and the block, nothing under its origin: held at the height of their tops
  const plate = await fromTray(page, '2639.dat', null, [b.pose[12]!, b.pose[13]!, b.pose[14]!]);
  if (proof) await shot(page, proof);
  // the grey plate takes the slope AND the tan block: two studs, two pieces, exactly in place
  expect.soft(plate.snap).toMatchObject({ pairs: 2, targets: [`f:${b.id}`, `f:${s.id}`].sort(), kinds: ['stud'] });
  expect.soft(at(plate.shown)).toEqual(expected('2639.dat'));
  await expect(page.getByTestId('snap-info')).toContainText('aimant : 2 tenon(s) emboîté(s) sur 2 pièce(s)');
  const p = await drop(page, plate.aim);
  expect.soft(p.pose).toEqual(plate.shown);
  await page.keyboard.press('Escape');

  // placed: the connections are recognised, the block and the plate are one assembly with the rest
  const graph = (await page.evaluate(() => window.__brickLabGame!.graph())) as Record<string, string[]>;
  expect(graph[`f:${b.id}`]).toEqual(['f:f2', `f:${p.id}`].sort());
  expect(graph[`f:${p.id}`]).toEqual([`f:${b.id}`, `f:${s.id}`].sort());
  expect(graph[`f:${s.id}`]).toEqual([`f:${c.id}`, `f:${p.id}`].sort());
  // nothing else moved
  expect((await freePieces(page)).slice(0, 2).map((f) => at(f.pose))).toEqual(BASE.map((f) => f.pose.slice(0, 3)));
}

test('31039 fuselage: 41763 → 4287 → the tan block 6541 → the grey plate 2639, all from the tray, fit exactly; pose = preview; one assembly', async ({ page }) => {
  // "avant": the same run on the code before the fix (committed proof)
  await fuselage(page, 'bloc-6541-plaque-apres.png');
});

test('WebKit (Safari engine): the same pieces from the tray, the same exact fits', async ({ baseURL }) => {
  const safari = await webkit.launch().catch(() => null);
  test.skip(!safari, 'WebKit de Playwright indisponible');
  const page = await safari!.newPage({ viewport: { width: 1280, height: 800 }, baseURL: baseURL! });
  try {
    await fuselage(page);
  } finally {
    await safari!.close();
  }
});

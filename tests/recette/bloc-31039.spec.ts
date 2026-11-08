import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { defaultDataRoot } from '../../src/server/library/paths';

/**
 * The tan block of the owner's REAL 31039 (fix/31039-block-snapping): the model and the build's
 * progress are READ from the owner's library store (or from a frozen copy: BRICK_LAB_DATA) and given,
 * changed IN MEMORY only, to the standalone atelier of a fresh browser context — the library is never
 * written. Two pieces are taken from the tray to their places in the owner's build:
 * - the tan Technic brick with a hole 6541 (f239 and the slope group over it removed from the copy): on the plate 3020 f161, the
 *   pin 2780 f236 in its hole — exactly at the owner's pose;
 * - the inverted slope 4287 (its group of 13 pieces removed from the copy) on the owner's curved
 *   inverted slope 41763 f54: flush on its top. Before the fix the magnet put it 1.41 LDU into the
 *   curve: y −4.78, the very pose of the owner's save.
 * Captures and log in the owner's proofs folder only (a third-party set: not in the repository).
 * SKIPPED without the owner's files.
 */
const SRC = process.env.BRICK_LAB_DATA ?? defaultDataRoot();
const PROOFS = path.join(SRC, 'proofs', 'connexions-bloc');
const TAG = process.env.BRICK_LAB_PROOF_TAG ?? 'apres';

function owner(): { model: Buffer; payload: Record<string, unknown> } | null {
  try {
    const lib = JSON.parse(readFileSync(path.join(SRC, 'library', 'library.json'), 'utf8')) as {
      sets: { id: string; setNumber: string }[]; builds: { id: string; setId: string; modelFileId: string }[];
      files: Record<string, { location: { type: string; path: string } }>;
    };
    const set = lib.sets.find((s) => s.setNumber === '31039-1');
    const build = set && lib.builds.find((b) => b.setId === set.id);
    const loc = build && lib.files[build.modelFileId]?.location;
    if (!build || loc?.type !== 'blob') return null;
    const record = JSON.parse(readFileSync(path.join(SRC, 'library', 'builds', build.id, 'progress.json'), 'utf8')) as { payload: Record<string, unknown> };
    return { model: readFileSync(path.join(SRC, 'library', loc.path)), payload: record.payload };
  } catch {
    return null;
  }
}
const OWNER = owner();
test.skip(!OWNER, 'construction 31039 du propriétaire absente');

type Free = { id: string; partKey: string; colorCode: string; pose: number[] };
const PIECES = (OWNER?.payload.freePieces ?? []) as Free[];
const piece = (id: string) => PIECES.find((f) => f.id === id);
// the owner's inverted slope 4287 f157 and what was built on it, 1.81 LDU too low (13 pieces)
const SLOPE_GROUP = ['f157', 'f165', 'f210', 'f213', 'f214', 'f218', 'f219', 'f221', 'f223', 'f224', 'f226', 'f242', 'f245'];
const game = <T,>(page: Page, fn: string) => page.evaluate((f) => (window.__brickLabGame as unknown as Record<string, () => unknown>)[f]!() as T, fn);
const frame = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const log: Record<string, unknown> = { tag: TAG };

async function point(page: Page, at: readonly [number, number, number]) {
  await frame(page);
  const p = await page.evaluate((pt) => {
    const q = window.__brickLab!.project(pt);
    return document.elementFromPoint(q.x, q.y)?.tagName === 'CANVAS' ? q : null;
  }, at as [number, number, number]);
  if (!p) throw new Error(`hors champ : ${at}`);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await frame(page);
  return p;
}
/** A capture framed on a point of the build (the same framing before and after the fix). */
async function shot(page: Page, name: string, at: readonly [number, number, number], half = 70) {
  const c = await page.evaluate(([x, y, z, h]) => [[x! - h!, y! - h!, z! - h!], [x! + h!, y! + h!, z! + h!], [x! - h!, y! + h!, z! + h!], [x! + h!, y! - h!, z! - h!]]
    .map((q) => window.__brickLab!.project(q as [number, number, number])), [...at, half]);
  const xs = c.map((p) => p.x), ys = c.map((p) => p.y);
  const x = Math.max(0, Math.min(...xs)), y = Math.max(0, Math.min(...ys));
  await page.screenshot({ path: path.join(PROOFS, name), clip: { x, y, width: Math.min(1280, Math.max(...xs)) - x, height: Math.min(800, Math.max(...ys)) - y } });
}

/** Closer view: the camera dollies toward the model's centre (wheel), then looks more from above (drag on the background). */
async function closer(page: Page, ticks: number, tilt = 250) {
  const box = (await page.getByTestId('build-canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < ticks; i++) await page.mouse.wheel(0, -200);
  const x = box.x + 30, y = box.y + box.height - 30;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + tilt, { steps: 10 });
  await page.mouse.up();
  await frame(page);
}

async function openCopy(page: Page, without: readonly string[], zoom: number) {
  const sha = createHash('sha256').update(OWNER!.model).digest('hex');
  expect(sha).toBe(OWNER!.payload.modelContentHash);
  const payload = { ...OWNER!.payload, freePieces: PIECES.filter((f) => !without.includes(f.id)) };
  await page.goto('/atelier');
  await page.evaluate(([k, v]) => { localStorage.clear(); localStorage.setItem(k!, v!); }, [`brick-lab:progress:${sha}`, JSON.stringify(payload)] as const);
  await page.reload();
  await page.locator('input[type=file][accept=".ldr,.mpd"]').first().setInputFiles({ name: '31039-1.mpd', mimeType: 'text/plain', buffer: OWNER!.model });
  await expect(page.getByTestId('render-status')).toContainText('Géométrie LDraw', { timeout: 180_000 });
  await page.waitForFunction(() => Boolean(window.__brickLab && window.__brickLabGame));
  await page.waitForFunction(() => ['3020.dat', '41763.dat', '4287.dat', '6541.dat', '2780.dat'].every((k) => (window.__brickLabGame!.connectors(k) ?? []).length > 0), null, { timeout: 60_000 });
  await page.waitForTimeout(500);
  await closer(page, zoom);
  return payload.freePieces;
}

type Snap = { delta: number[]; pairs: number; targets: string[]; points: number[][]; kinds: string[] } | null;
/** From the tray, `turns` quarter turns (R), the pointer a few LDU off its place, on the surface it rests on (height `surface`). */
async function fromTray(page: Page, tray: string, turns: number, place: number[], surface: number) {
  await page.getByTestId(tray).click();
  for (let i = 0; i < turns; i++) await page.keyboard.press('r');
  const aim = [place[0]! + 3, surface, place[2]! + 4] as const;
  await point(page, [aim[0] + 6, aim[1], aim[2] + 6]);
  await point(page, aim);
  const snap = await game<Snap>(page, 'snap');
  const shown = (await game<{ previewPose: number[] }>(page, 'held')).previewPose;
  const markers = await page.evaluate(() => window.__brickLab!.snapMarkers());
  return { snap, shown, markers, aim };
}
async function drop(page: Page, aim: readonly [number, number, number], before: Free[]) {
  const p = await point(page, aim);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('message')).toContainText('Pièce posée');
  const after = await game<Free[]>(page, 'freePieces');
  const placed = after.find((f) => !before.some((b) => b.id === f.id))!;
  // the owner's pieces did not move
  expect(after.filter((f) => f.id !== placed.id).map((f) => f.pose)).toEqual(before.map((f) => f.pose));
  return placed;
}

test.beforeAll(() => mkdirSync(PROOFS, { recursive: true }));
test.afterAll(() => writeFileSync(path.join(PROOFS, `recette-bloc-${TAG}.json`), `${JSON.stringify(log, null, 2)}\n`));

test('owner’s 31039: the tan block 6541 from the tray → on its plate, its pin in its hole, exactly at the owner’s pose', async ({ page }) => {
  const own = piece('f239')!;
  expect(own.partKey).toBe('6541.dat');
  // the state before the owner built the slope stack (its plate went over this block, 1.81 LDU too low)
  await openCopy(page, ['f239', ...SLOPE_GROUP], 40);
  const before = await game<Free[]>(page, 'freePieces');
  const r = await fromTray(page, 'tray-6541.dat-19', 0, own.pose, own.pose[1]! + 24);
  log.block = { snap: r.snap, pose: r.shown.slice(12, 15) };
  await shot(page, `bloc-6541-${TAG}.png`, [own.pose[0]!, own.pose[1]!, own.pose[2]!]);
  expect(r.snap).toMatchObject({ targets: ['f:f161', 'f:f236'], kinds: ['pin', 'stud'] });
  expect(r.markers).toEqual(r.snap!.points);
  expect(r.shown.slice(12, 15)).toEqual(own.pose.slice(0, 3));
  const placed = await drop(page, r.aim, before);
  expect(placed.pose).toEqual(r.shown);
  await page.keyboard.press('Escape');
  const graph = await game<Record<string, string[]>>(page, 'graph');
  expect(graph[`f:${placed.id}`]).toEqual(expect.arrayContaining(['f:f161', 'f:f236']));
});

test('owner’s 31039: an inverted slope 4287 from the tray → flush on the owner’s curve 41763, not into it', async ({ page }) => {
  const own = piece('f157')!, curve = piece('f54')!;
  expect([own.partKey, curve.partKey]).toEqual(['4287.dat', '41763.dat']);
  await openCopy(page, SLOPE_GROUP, 25);
  const before = await game<Free[]>(page, 'freePieces');
  // the tray gives it the model's orientation (half a turn), the owner's; the pointer on the curve's top
  const r = await fromTray(page, 'tray-4287.dat-15', 0, own.pose, curve.pose[1]!);
  const [a, b, c, d, e, f, g, h, i] = own.pose.slice(3);
  expect(r.shown.slice(0, 11)).toEqual([a, d, g, 0, b, e, h, 0, c, f, i]);
  log.slope = { snap: r.snap, pose: r.shown.slice(12, 15), owners: own.pose.slice(0, 3), curve: curve.pose.slice(0, 3) };
  await shot(page, `pente-4287-${TAG}.png`, [own.pose[0]!, own.pose[1]! + 12, own.pose[2]!], 50);
  expect(r.snap).toMatchObject({ pairs: 1, targets: ['f:f54'], kinds: ['stud'] });
  expect(r.markers).toEqual(r.snap!.points);
  // flush on the top of the owner's curve (the curve itself stays where the owner put it)
  expect(r.shown.slice(12, 15)).toEqual([own.pose[0], Math.round((curve.pose[1]! - 24) * 100) / 100, own.pose[2]]);
  const placed = await drop(page, r.aim, before);
  expect(placed.pose).toEqual(r.shown);
});

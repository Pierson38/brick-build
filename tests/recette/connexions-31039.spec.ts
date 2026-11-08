import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { defaultDataRoot } from '../../src/server/library/paths';

/**
 * Connections on the owner's REAL 31039 build (fix/free-building-connections): the model and the
 * build's progress (its 101 free pieces) are READ from the owner's library store and given to the
 * standalone atelier of a fresh browser context — the library is never written. Checks, on the real
 * assembly: a piece taken from the tray snaps with the green markers before the click and lands at
 * the pose shown; the same piece taken again snaps the same way; its assembly is selected; pointer
 * smoothness with a piece in hand. Captures and log in the owner's proofs folder only (a third-party
 * set: not in the repository). SKIPPED without the owner's files.
 */
const SRC = process.env.BRICK_LAB_DATA ?? defaultDataRoot();
const PROOFS = path.join(SRC, 'proofs', 'connexions');

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
const game = <T,>(page: Page, fn: string, arg?: unknown) =>
  page.evaluate(([f, a]) => (window.__brickLabGame as unknown as Record<string, (x?: unknown) => unknown>)[f as string]!(a) as T, [fn, arg] as const);
const frame = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const log: Record<string, unknown> = {};

async function onCanvas(page: Page, at: readonly [number, number, number]) {
  await frame(page);
  return page.evaluate((pt) => {
    const p = window.__brickLab!.project(pt);
    const el = document.elementFromPoint(p.x, p.y);
    return el?.tagName === 'CANVAS' ? p : null;
  }, at as [number, number, number]);
}
async function point(page: Page, at: readonly [number, number, number]) {
  const p = await onCanvas(page, at);
  if (!p) throw new Error(`hors champ : ${at}`);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await frame(page);
  return p;
}

async function openOwnerBuild(page: Page) {
  const sha = createHash('sha256').update(OWNER!.model).digest('hex');
  expect(sha).toBe(OWNER!.payload.modelContentHash);
  await page.goto('/atelier');
  await page.evaluate(([k, v]) => { localStorage.clear(); localStorage.setItem(k!, v!); }, [`brick-lab:progress:${sha}`, JSON.stringify(OWNER!.payload)] as const);
  await page.reload();
  await page.locator('input[type=file][accept=".ldr,.mpd"]').first().setInputFiles({ name: '31039-1.mpd', mimeType: 'text/plain', buffer: OWNER!.model });
  await expect(page.getByTestId('render-status')).toContainText('Géométrie LDraw', { timeout: 180_000 });
  await page.waitForFunction(() => Boolean(window.__brickLab && window.__brickLabGame));
  await page.waitForFunction(() => (window.__brickLabGame!.connectors('3020.dat') ?? []).length > 0, null, { timeout: 60_000 });
  await page.waitForTimeout(500);
}

test('owner’s 31039: from the tray, markers before the click, pose = preview; taken again: the same; assembly; smoothness', async ({ page }) => {
  mkdirSync(PROOFS, { recursive: true });
  await openOwnerBuild(page);
  const before = await game<Free[]>(page, 'freePieces');
  expect(before.length).toBe((OWNER!.payload.freePieces as unknown[]).length);
  log.pieces = before.length;
  // the owner's assembly is never touched by opening it
  expect(before).toEqual((OWNER!.payload.freePieces as Free[]).map((f) => ({ id: f.id, partKey: f.partKey, colorCode: f.colorCode, pose: expect.any(Array) as unknown as number[] })));

  // an orange 1 × 2 plate from the tray, over the white 2 × 4 plate f101 of the owner's build
  const target = before.find((f) => f.id === 'f101')!;
  const top: [number, number, number] = [target.pose[12]! + 3, target.pose[13]!, target.pose[14]! + 7];
  await page.getByTestId('tray-3023.dat-25').click();
  await point(page, [top[0] + 6, top[1], top[2] + 4]);
  await point(page, top);
  const snap = await game<{ pairs: number; targets: string[]; points: number[][] } | null>(page, 'snap');
  expect(snap?.targets).toContain('f:f101');
  const markers = await page.evaluate(() => window.__brickLab!.snapMarkers());
  expect(markers).toEqual(snap!.points);
  await expect(page.getByTestId('snap-info')).toBeVisible();
  const shown = (await game<{ previewPose: number[] }>(page, 'held')).previewPose;
  await page.screenshot({ path: path.join(PROOFS, 'reel-31039-bac-apercu.png') });
  log.fromTray = { pairs: snap!.pairs, targets: snap!.targets, pose: shown.slice(12, 15) };
  const p = (await onCanvas(page, top))!;
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('message')).toContainText('Pièce posée');
  const after = await game<Free[]>(page, 'freePieces');
  const placed = after.find((f) => !before.some((b) => b.id === f.id))!;
  expect(placed.pose).toEqual(shown);
  // the owner's pieces did not move
  expect(after.filter((f) => f.id !== placed.id)).toEqual(before);
  await page.keyboard.press('Escape');

  // the same piece taken again and brought back under the same pointer: the same proposal
  await point(page, [placed.pose[12]!, placed.pose[13]!, placed.pose[14]!]);
  await page.mouse.click((await onCanvas(page, [placed.pose[12]!, placed.pose[13]!, placed.pose[14]!]))!.x, (await onCanvas(page, [placed.pose[12]!, placed.pose[13]!, placed.pose[14]!]))!.y);
  await page.keyboard.press('m');
  await point(page, [top[0] + 6, top[1], top[2] + 4]);
  await point(page, top);
  const again = await game<{ pairs: number; targets: string[] } | null>(page, 'snap');
  expect(again).toEqual(snap);
  expect((await game<{ previewPose: number[] }>(page, 'held')).previewPose).toEqual(shown);
  await page.keyboard.press('Escape');

  // its connected assembly
  await page.getByTestId('clear-selection').click().catch(() => undefined);
  const q = (await onCanvas(page, [placed.pose[12]!, placed.pose[13]!, placed.pose[14]!]))!;
  await page.mouse.click(q.x, q.y);
  await page.getByTestId('select-assembly').click();
  const assembly = await game<{ id: string }[]>(page, 'selection');
  expect(assembly.map((r) => r.id)).toEqual(expect.arrayContaining([placed.id, 'f101']));
  log.assembly = assembly.length;
  await page.screenshot({ path: path.join(PROOFS, 'reel-31039-assemblage.png') });
  await page.getByTestId('clear-selection').click();

  // smoothness: a piece in hand swept over the assembly (every move recomputes the snap)
  await page.getByTestId('tray-3023.dat-25').click();
  const xs = before.map((f) => f.pose[12]!), zs = before.map((f) => f.pose[14]!);
  const [cx, cz] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
  const durations: number[] = [];
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * 2 * Math.PI;
    const s = await onCanvas(page, [cx + 40 * Math.cos(a), 9.41, cz + 200 * Math.sin(a)]);
    if (!s) continue;
    const t0 = Date.now();
    await page.mouse.move(s.x, s.y);
    await frame(page);
    durations.push(Date.now() - t0);
  }
  durations.sort((a, b) => a - b);
  log.pointer = { moves: durations.length, p50Ms: durations[Math.floor(durations.length / 2)], p95Ms: durations[Math.floor(durations.length * 0.95)], maxMs: durations.at(-1) };
  expect(durations[Math.floor(durations.length * 0.95)]!).toBeLessThan(250);
  writeFileSync(path.join(PROOFS, 'recette-connexions.json'), `${JSON.stringify(log, null, 2)}\n`);
});

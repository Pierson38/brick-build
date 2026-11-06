import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { expect, test, webkit, type APIRequestContext, type Page } from '@playwright/test';

/**
 * True free building (06/11/2026) on ORIGINAL fixtures: a piece of the stock goes where the player
 * points, a placed piece can be taken again (move, turn, remove), quantities are those of the set,
 * the build is saved with the real poses and restored after a reload (browser and library), an older
 * free build is restored on its historical positions, and leaving the free mode is explicit.
 * mini-4-pieces: 3001 red (4) at 0,0,0, blue (1) at 80,0,0, green (2) at 0,-24,0, yellow (14) at
 * 80,-24,0 — ground at y = 24 (bottom of the bricks).
 */
const fixture = (rel: string) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));
const MINI = fixture('fixtures/mini-4-pieces.mpd');
const MINI_BYTES = readFileSync(MINI);
const SAME = ['0 FILE same.ldr', '1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat', '1 4 80 0 0 1 0 0 0 1 0 0 0 1 3001.dat', '1 4 0 -24 0 1 0 0 0 1 0 0 0 1 3001.dat'].join('\n');
const W = { origin: 'http://127.0.0.1:3000', 'x-brick-lab': '1' };

type Free = { id: string; partKey: string; colorCode: string; pose: number[] };
const freePieces = (page: Page) => page.evaluate(() => window.__brickLabGame!.freePieces()) as Promise<Free[]>;
const position = (f: Free) => f.pose.slice(12, 15).map((v) => Math.round(v));
const frame = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

async function importModel(page: Page, file: string | { name: string; text: string }) {
  const input = page.locator('input[type=file][accept=".ldr,.mpd"]').first();
  if (typeof file === 'string') await input.setInputFiles(file);
  else await input.setInputFiles({ name: file.name, mimeType: 'text/plain', buffer: Buffer.from(file.text) });
  await waitAtelier(page);
}

async function waitAtelier(page: Page) {
  await expect(page.getByTestId('render-status')).toContainText('Géométrie LDraw', { timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.__brickLab && window.__brickLabGame));
  await page.waitForTimeout(200);
}

async function point(page: Page, ldraw: [number, number, number]) {
  await frame(page);
  const p = await page.evaluate((pt) => window.__brickLab!.project(pt), ldraw);
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await frame(page);
  return p;
}

/** Points at `at` and clicks there (no other key, no helper button). */
async function clickAt(page: Page, at: [number, number, number]) {
  const p = await point(page, at);
  await page.mouse.click(p.x, p.y);
}

async function standalone(page: Page) {
  await page.goto('/atelier');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

test('a piece goes where it is pointed; a placed piece is taken again to move, turn or remove it; undo restores', async ({ page }) => {
  await standalone(page);
  await importModel(page, MINI);
  await page.getByRole('button', { name: 'Montage libre (avec notice)' }).click();
  await page.getByTestId('tray-3001.dat-4').click();
  await clickAt(page, [140, 24, 60]); // nowhere near a red spot
  await expect(page.getByTestId('progress')).toHaveText('1/4 pièces posées');
  expect((await freePieces(page)).map(position)).toEqual([[140, 0, 60]]);
  await expect(page.getByTestId('tray-3001.dat-4')).toHaveCount(0); // its only red brick is used
  await page.keyboard.press('Escape');

  // take it again, Escape: it stays where it was
  await clickAt(page, [140, 0, 60]);
  await expect(page.getByTestId('held-info')).toContainText('Pièce reprise');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('message')).toHaveText('Pièce laissée où elle était.');
  expect((await freePieces(page)).map(position)).toEqual([[140, 0, 60]]);

  // take it, turn it a quarter, put it elsewhere
  await clickAt(page, [140, 0, 60]);
  await page.keyboard.press('r');
  await clickAt(page, [-100, 24, 40]);
  await expect(page.getByTestId('message')).toHaveText('Pièce déplacée librement.');
  let pieces = await freePieces(page);
  expect(pieces.map(position)).toEqual([[-100, 0, 40]]);
  expect(Math.round(pieces[0]!.pose[0]!)).toBe(0); // turned 90° around Y
  await expect(page.getByTestId('progress')).toHaveText('1/4 pièces posées');

  // undo the move: back at its former place and orientation
  await page.getByRole('button', { name: 'Annuler' }).click();
  pieces = await freePieces(page);
  expect(pieces.map(position)).toEqual([[140, 0, 60]]);
  expect(Math.round(pieces[0]!.pose[0]!)).toBe(1);

  // take it and put it back into the stock; ⌘Z brings it back
  await clickAt(page, [140, 0, 60]);
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('message')).toHaveText('Pièce remise dans le stock.');
  await expect(page.getByTestId('progress')).toHaveText('0/4 pièces posées');
  await expect(page.getByTestId('tray-3001.dat-4')).toContainText('×1');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByTestId('progress')).toHaveText('1/4 pièces posées');
  expect((await freePieces(page)).map(position)).toEqual([[140, 0, 60]]);
  expect((await page.evaluate(() => window.__brickLab!.sceneSummary())).solid).toBe(1);
});

test('identical bricks and exact quantities; the end message does not call it the official model; restored after a reload', async ({ page }) => {
  await standalone(page);
  await importModel(page, { name: 'same.mpd', text: SAME });
  await page.getByRole('button', { name: 'Montage libre (avec notice)' }).click();
  await expect(page.getByTestId('tray-3001.dat-4')).toContainText('×3');
  await page.getByTestId('tray-3001.dat-4').click();
  for (const [n, at] of [[1, [-120, 24, 80]], [2, [-60, 24, 80]], [3, [-60, 0, 80]]] as const) {
    await clickAt(page, [...at]);
    await expect(page.getByTestId('progress')).toHaveText(`${n}/3 pièces posées`);
  }
  await expect(page.getByTestId('tray-3001.dat-4')).toHaveCount(0);
  await expect(page.getByTestId('free-done')).toContainText('Toutes les pièces du set sont posées (3/3). Montage libre : ta construction n’est pas comparée au modèle officiel — 0 pièce(s) à leur place dans le modèle.');
  const before = await freePieces(page);
  expect(before.map(position)).toEqual([[-120, 0, 80], [-60, 0, 80], [-60, -24, 80]]); // the third one stacked on the second
  expect(new Set(before.map((f) => f.id)).size).toBe(3);

  // reload: same pieces, same poses (this browser's save)
  await page.reload();
  await importModel(page, { name: 'same.mpd', text: SAME });
  await expect(page.getByTestId('message')).toHaveText('Progression restaurée : 3/3 pièces posées, dont 3 posée(s) librement.');
  expect(await freePieces(page)).toEqual(before);
  expect((await page.evaluate(() => window.__brickLab!.sceneSummary())).solid).toBe(3);
  // undo after a reload: the last piece goes back to the stock
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByTestId('progress')).toHaveText('2/3 pièces posées');
  await expect(page.getByTestId('tray-3001.dat-4')).toContainText('×1');
});

test('leaving the free mode: pieces at their model place are kept, others only removed after an explicit choice; guided stays strict', async ({ page }) => {
  await standalone(page);
  await importModel(page, MINI);
  await page.getByRole('button', { name: 'Montage libre (avec notice)' }).click();
  await page.getByTestId('tray-3001.dat-4').click();
  await point(page, [0, 24, 0]);
  await expect(page.getByTestId('target-found')).toContainText('à sa place dans le modèle');
  await clickAt(page, [0, 24, 0]);
  await page.getByTestId('tray-3001.dat-1').click();
  await clickAt(page, [200, 24, 100]);
  await expect(page.getByTestId('free-info')).toHaveText('2 posée(s) librement · 1 à leur place dans le modèle');

  await page.getByTestId('mode-select').selectOption('guided');
  const confirm = page.getByTestId('mode-switch-confirm');
  await expect(confirm).toContainText('1 pièce(s) posée(s) hors du modèle officiel');
  await expect(confirm).toContainText('(1 reconnue(s) à leur place, gardée(s))');
  await confirm.getByRole('button', { name: 'Rester en montage libre' }).click();
  await expect(page.getByTestId('mode-select')).toHaveValue('freeManual');
  await expect(page.getByTestId('progress')).toHaveText('2/4 pièces posées');

  await page.getByTestId('mode-select').selectOption('guided');
  await page.getByTestId('mode-switch-confirm').getByRole('button', { name: 'Retirer et changer de mode' }).click();
  await expect(page.getByTestId('mode-select')).toHaveValue('guided');
  await expect(page.getByTestId('progress')).toHaveText('1/4 pièces posées');
  await expect(page.getByTestId('step-indicator')).toHaveText('Étape 1 / 2');
  // guided: a placed brick cannot be taken; a far drop is refused
  await clickAt(page, [0, 0, 0]);
  await expect(page.getByTestId('held-info')).toHaveCount(0);
  await page.getByTestId('tray-3001.dat-1').click();
  await clickAt(page, [200, 24, 100]);
  await expect(page.getByTestId('message')).toContainText('Trop loin');

  // back to free, the blue brick at its place: the switch needs no question
  await page.keyboard.press('Escape');
  await page.getByTestId('mode-select').selectOption('freeManual');
  await page.getByTestId('tray-3001.dat-1').click();
  await clickAt(page, [80, 24, 0]);
  await page.getByTestId('mode-select').selectOption('guided');
  await expect(page.getByTestId('mode-switch-confirm')).toHaveCount(0);
  await expect(page.getByTestId('message')).toContainText('1 pièce(s) posée(s) librement reconnue(s) à leur place dans le modèle');
  await expect(page.getByTestId('step-indicator')).toHaveText('Étape 2 / 2');
});

// ---- library (isolated E2E data folder) ----

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
async function miniSet(request: APIRequestContext, setNumber: string, tag: string) {
  const bytes = Buffer.from(MINI_BYTES.toString('utf8').replace('0 Name: mini-4-pieces.mpd', `0 Name: mini-4-pieces.mpd\n0 // ${tag}`));
  const up = await request.post(`/api/library/files?kind=model&name=mini-4-pieces.mpd`, { data: bytes, headers: { ...W, 'content-type': 'application/octet-stream' } });
  expect(up.ok(), await up.text()).toBe(true);
  const modelSha = sha(bytes);
  const r = await request.post('/api/library/sets', { data: { setNumber, name: tag, builds: [{ label: 'Principal', modelFileId: modelSha }] }, headers: W });
  expect(r.status(), await r.text()).toBe(201);
  const created = (await r.json()) as { set: { id: string }; builds: { id: string }[] };
  return { modelSha, setId: created.set.id, buildId: created.builds[0]!.id };
}
const libraryProgress = async (request: APIRequestContext, buildId: string) =>
  ((await (await request.get(`/api/library/builds/${buildId}/progress`)).json()) as { revision: number; progress: { schemaVersion: number; placedOccurrenceIds: string[]; freePieces?: { id: string; pose: number[] }[] } }).progress;

test('library: free poses saved and restored after a reload; the collection does not call a used-up stock finished', async ({ page, request }) => {
  const { setId, buildId } = await miniSet(request, `90110-${Date.now().toString(36)}`, 'libre');
  await page.goto(`/atelier/${buildId}`);
  await waitAtelier(page);
  await page.getByRole('button', { name: 'Montage libre (avec notice)' }).click();
  await page.getByTestId('tray-3001.dat-4').click();
  await page.keyboard.press('r');
  await clickAt(page, [150, 24, -60]);
  await page.getByTestId('tray-3001.dat-1').click();
  await clickAt(page, [80, 24, 0]);
  await expect.poll(async () => (await libraryProgress(request, buildId)).freePieces?.length ?? 0).toBe(2);
  const saved = await libraryProgress(request, buildId);
  expect(saved.schemaVersion).toBe(3);
  expect(saved.placedOccurrenceIds).toEqual([]);
  expect(saved.freePieces!.map((f) => f.pose.slice(0, 3))).toEqual([[150, 0, -60], [80, 0, 0]]);
  const before = await freePieces(page);

  await page.reload();
  await waitAtelier(page);
  await expect(page.getByTestId('progress')).toHaveText('2/4 pièces posées');
  expect(await freePieces(page)).toEqual(before);
  await expect(page.getByTestId('free-info')).toHaveText('2 posée(s) librement · 1 à leur place dans le modèle');

  // use up the stock away from the model
  for (const [colour, at] of [['2', [-140, 24, 60]], ['14', [-140, 0, 60]]] as const) {
    await page.getByTestId(`tray-3001.dat-${colour}`).click();
    await clickAt(page, [...at]);
  }
  await expect(page.getByTestId('free-done')).toContainText('1 pièce(s) à leur place dans le modèle');
  await expect.poll(async () => (await libraryProgress(request, buildId)).freePieces?.length ?? 0).toBe(4);
  const lib = (await (await request.get('/api/library')).json()) as { sets: { id: string; builds: { status: string; progress: { placed: number; free: number; atModel: number } }[] }[] };
  expect(lib.sets.find((s) => s.id === setId)!.builds[0]).toMatchObject({ status: 'IN_PROGRESS', progress: { placed: 4, free: 4, atModel: 1 } });
  await page.goto(`/sets/${setId}`);
  await expect(page.getByTestId('detail-progress')).toHaveText('4/4 pièces posées');
  await expect(page.getByTestId('detail-free')).toContainText('4 posée(s) librement, 1/4 à leur place dans le modèle');
});

test('library: an older free build (identifiers only) is restored on its historical positions; a piece moved from there becomes free', async ({ page, request }) => {
  const { modelSha, buildId } = await miniSet(request, `90111-${Date.now().toString(36)}`, 'ancienne');
  const old = { schemaVersion: 2, modelContentHash: modelSha, displayName: 'mini-4-pieces.mpd', buildMode: 'freeManual', placedOccurrenceIds: ['mini-4-pieces.mpd#0', 'mini-4-pieces.mpd#3'], totalOccurrences: 4, updatedAtIso: '2026-11-01T10:00:00.000Z' };
  const put = await request.put(`/api/library/builds/${buildId}/progress`, { data: { baseRevision: null, progress: old }, headers: W });
  expect(put.ok(), await put.text()).toBe(true);
  await page.goto(`/atelier/${buildId}`);
  await waitAtelier(page);
  await expect(page.getByTestId('message')).toHaveText('Progression restaurée : 2/4 pièces posées.');
  expect(await freePieces(page)).toEqual([]);
  expect((await page.evaluate(() => window.__brickLab!.sceneSummary())).solid).toBe(2);
  // nothing rewritten just by opening it
  expect(await libraryProgress(request, buildId)).toEqual(old);

  // the yellow brick (on its historical spot, 80,-24,0) is taken and put on the ground elsewhere
  await clickAt(page, [80, -24, 0]);
  await expect(page.getByTestId('held-info')).toContainText('Pièce reprise');
  await clickAt(page, [-120, 24, -40]);
  await expect(page.getByTestId('progress')).toHaveText('2/4 pièces posées');
  await expect.poll(async () => (await libraryProgress(request, buildId)).freePieces?.length ?? 0).toBe(1);
  const now = await libraryProgress(request, buildId);
  expect(now.placedOccurrenceIds).toEqual(['mini-4-pieces.mpd#0']);
  expect(now.freePieces!.map((f) => f.pose.slice(0, 3))).toEqual([[-120, 0, -40]]);
});

test('WebKit (Safari engine): free placement, take again, move, remove', async () => {
  const safari = await webkit.launch().catch(() => null);
  test.skip(!safari, 'WebKit de Playwright indisponible');
  const page = await safari!.newPage({ viewport: { width: 1280, height: 800 }, baseURL: 'http://127.0.0.1:3000' });
  try {
    await standalone(page);
    await importModel(page, MINI);
    await page.getByRole('button', { name: 'Montage libre (avec notice)' }).click();
    await page.getByTestId('tray-3001.dat-14').click();
    await clickAt(page, [160, 24, -40]);
    await expect(page.getByTestId('progress')).toHaveText('1/4 pièces posées');
    await clickAt(page, [160, 0, -40]);
    await expect(page.getByTestId('held-info')).toContainText('Pièce reprise');
    await clickAt(page, [-80, 24, 60]);
    expect((await freePieces(page)).map(position)).toEqual([[-80, 0, 60]]);
    await clickAt(page, [-80, 0, 60]);
    await page.getByTestId('remove-piece').click();
    await expect(page.getByTestId('progress')).toHaveText('0/4 pièces posées');
  } finally {
    await safari!.close();
  }
});

import { createHash } from 'node:crypto';
import { existsSync, promises as fs, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { RECETTE_LIBRE_DIR } from '../../playwright.recette-libre.config';

/**
 * True free building on the owner's REAL sets 31009 (Small Cottage) and 31039 (Blue Power Jet, 609
 * pieces), in an isolated data folder. The files are COPIED from BRICK_LAB_DATA (read only): 31009
 * from models/ and instructions/, 31039 from the owner's library store (OMR model and booklet added
 * by the owner in P8). Part 1: pieces placed away from the model, identical bricks, stacking, move,
 * turn, remove, undo, smoothness, explicit mode switch. Part 2 (`-g "part 2"`, after restarting the
 * server by hand): the same assembly restored, guided mode still strict. SKIPPED without the files.
 */
const SRC = process.env.BRICK_LAB_DATA ?? path.join(homedir(), 'Documents', 'brick-lab-data');
const PROOFS = path.join(SRC, 'proofs', 'libre');
const LOG = path.join(PROOFS, 'recette-libre.json');

function ownerFile(setNumber: string, kind: 'model' | 'pdf'): string | null {
  if (setNumber === '31009-1') return path.join(SRC, kind === 'model' ? 'models/31009-1/31009-1.mpd' : 'instructions/31009-1/31009-1_notice_6038244.pdf');
  // 31039: in the owner's library store (read only)
  try {
    const lib = JSON.parse(readFileSync(path.join(SRC, 'library', 'library.json'), 'utf8')) as {
      sets: { id: string; setNumber: string }[]; builds: { setId: string; modelFileId: string; bookletFileIds: string[] }[];
      files: Record<string, { location: { type: string; path: string } }>;
    };
    const set = lib.sets.find((s) => s.setNumber === setNumber);
    const build = set && lib.builds.find((b) => b.setId === set.id);
    const id = kind === 'model' ? build?.modelFileId : build?.bookletFileIds[0];
    const loc = id ? lib.files[id]?.location : undefined;
    return loc?.type === 'blob' ? path.join(SRC, 'library', loc.path) : null;
  } catch {
    return null;
  }
}
const SETS = [
  { number: '31009-1', name: 'Small Cottage', model: ownerFile('31009-1', 'model'), pdf: ownerFile('31009-1', 'pdf'), pdfName: '31009-1_notice_6038244.pdf' },
  { number: '31039-1', name: 'Blue Power Jet', model: ownerFile('31039-1', 'model'), pdf: ownerFile('31039-1', 'pdf'), pdfName: '6127618.pdf' },
];

interface Lib { dataDir: string; sets: { id: string; setNumber: string; builds: { id: string; status: string; progress: { placed: number; free: number; atModel: number } | null }[] }[] }
type Free = { id: string; partKey: string; colorCode: string; pose: number[] };
type Cand = { id: string; partKey: string; colorCode: string; matrix: number[] };
const library = async (r: APIRequestContext) => (await (await r.get('/api/library')).json()) as Lib;
const game = <T,>(page: Page, fn: string, arg?: unknown) =>
  page.evaluate(([f, a]) => (window.__brickLabGame as unknown as Record<string, (x?: unknown) => unknown>)[f as string]!(a) as T, [fn, arg] as const);
const frame = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const progressCount = async (page: Page) => Number((await page.getByTestId('progress').textContent())!.split('/')[0]);
const log: Record<string, Record<string, unknown>> = {};
const save = () => writeFileSync(LOG, `${JSON.stringify(log, null, 2)}\n`);

test.describe.configure({ mode: 'serial' });
test.skip(!SETS.every((s) => s.model && s.pdf && existsSync(s.model) && existsSync(s.pdf)), 'fichiers 31009/31039 du propriétaire absents');

test.beforeAll(async ({ request }) => {
  const lib = await library(request);
  if (path.resolve(lib.dataDir) !== path.resolve(RECETTE_LIBRE_DIR)) throw new Error(`Serveur sur ${lib.dataDir}, attendu ${RECETTE_LIBRE_DIR} : jamais la bibliothèque réelle.`);
  mkdirSync(PROOFS, { recursive: true });
  if (existsSync(LOG)) Object.assign(log, JSON.parse(readFileSync(LOG, 'utf8')));
});

async function waitAtelier(page: Page) {
  await expect(page.getByTestId('render-status')).toContainText('Géométrie LDraw', { timeout: 180_000 });
  await page.waitForFunction(() => Boolean(window.__brickLab && window.__brickLabGame));
  await page.waitForTimeout(500);
}

/** Frame intervals of the page for `ms` (the 3D view renders continuously). */
const frames = (page: Page, ms: number) => page.evaluate((dur) => new Promise<{ fps: number; worstMs: number; over50: number }>((resolve) => {
  const t: number[] = [];
  const start = performance.now();
  const tick = (now: number) => {
    t.push(now);
    if (now - start < dur) requestAnimationFrame(tick);
    else {
      const d = t.slice(1).map((x, i) => x - t[i]!);
      resolve({ fps: Math.round((d.length / (t.at(-1)! - t[0]!)) * 1000), worstMs: Math.round(Math.max(...d)), over50: d.filter((x) => x > 50).length });
    }
  };
  requestAnimationFrame(tick);
}), ms);

/** Screen point of an LDraw point, only if the canvas itself is under it (not the toast or a panel). */
async function onCanvas(page: Page, at: [number, number, number]) {
  await frame(page);
  return page.evaluate((pt) => {
    const p = window.__brickLab!.project(pt);
    const el = document.elementFromPoint(p.x, p.y);
    return el?.tagName === 'CANVAS' ? p : null;
  }, at);
}

/** Free spots on the ground around the model, visible and away from it. */
async function groundSpots(page: Page, count: number): Promise<[number, number, number][]> {
  const cands = await game<Cand[]>(page, 'candidates');
  const ground = await game<number>(page, 'ground');
  const xs = cands.map((c) => c.matrix[12]!), zs = cands.map((c) => c.matrix[14]!);
  const [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const out: [number, number, number][] = [];
  for (let ring = 0; ring < 6 && out.length < count; ring++) {
    const r = Math.max(maxX - minX, maxZ - minZ) / 2 + 60 + ring * 40;
    for (let k = 0; k < 16 && out.length < count; k++) {
      const a = (k / 16) * 2 * Math.PI;
      const spot: [number, number, number] = [Math.round((cx + r * Math.cos(a)) / 20) * 20, ground, Math.round((cz + r * Math.sin(a)) / 20) * 20];
      if (out.some((o) => Math.hypot(o[0] - spot[0], o[2] - spot[2]) < 60)) continue;
      if (await onCanvas(page, spot)) out.push(spot);
    }
  }
  return out;
}

async function clickAt(page: Page, at: [number, number, number]) {
  const p = await onCanvas(page, at);
  if (!p) throw new Error(`hors champ : ${at}`);
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await frame(page);
  await page.mouse.click(p.x, p.y);
}

const nearestSameTarget = (cands: Cand[], f: Free) =>
  Math.min(...cands.filter((c) => c.partKey === f.partKey && c.colorCode === f.colorCode).map((c) => Math.hypot(c.matrix[12]! - f.pose[12]!, c.matrix[13]! - f.pose[13]!, c.matrix[14]! - f.pose[14]!)));

test('part 1: add 31009 and 31039 (copies), build freely away from the model, identical bricks, stack, move, turn, remove, undo', async ({ page, request }) => {
  await fs.rm(RECETTE_LIBRE_DIR, { recursive: true, force: true });
  for (const s of SETS) {
    for (const [from, rel] of [[s.model!, `models/${s.number}/${s.number}.mpd`], [s.pdf!, `instructions/${s.number}/${s.pdfName}`]] as const) {
      await fs.mkdir(path.dirname(path.join(RECETTE_LIBRE_DIR, rel)), { recursive: true });
      await fs.copyFile(from, path.join(RECETTE_LIBRE_DIR, rel));
    }
  }
  await page.goto('/');
  await page.getByTestId('discovery').getByRole('button').first().click();
  for (const s of SETS) {
    const d = page.getByTestId(`discovered-${s.number}`);
    await d.getByTestId('discovered-name').fill(s.name);
    await d.getByTestId('discovered-add').click();
    await expect(page.getByTestId(`set-card-${s.number}`)).toBeVisible({ timeout: 60_000 });
  }

  for (const s of SETS) {
    const entry: Record<string, unknown> = {};
    log[s.number] = entry;
    const buildId = (await library(request)).sets.find((x) => x.setNumber === s.number)!.builds[0]!.id;
    entry.buildId = buildId;
    const t0 = Date.now();
    await page.goto(`/atelier/${buildId}`);
    await waitAtelier(page);
    entry.openMs = Date.now() - t0;
    await page.getByRole('button', { name: 'Montage libre (avec notice)' }).click();
    const all = await game<Cand[]>(page, 'candidates');
    entry.occurrences = all.length;
    entry.trayItems = await page.locator('.tray-item').count();
    entry.framesIdle = await frames(page, 1500);

    // 1) six different pieces, each put on the ground around the model, far from any of its places
    const keys = await page.locator('.tray-item').evaluateAll((els) => els.slice(0, 6).map((e) => e.getAttribute('data-testid')!));
    const spots = await groundSpots(page, 14);
    expect(spots.length).toBeGreaterThanOrEqual(12);
    for (const [i, key] of keys.entries()) {
      await page.getByTestId(key).click();
      await clickAt(page, spots[i]!);
      await expect.poll(() => progressCount(page)).toBe(i + 1);
      expect((await page.evaluate(() => window.__brickLabLastDrop))!.targetId).toBeNull();
      await page.keyboard.press('Escape');
    }
    let free = await game<Free[]>(page, 'freePieces');
    const distances = free.map((f) => Math.round(nearestSameTarget(all, f)));
    entry.farFromModel = distances;
    expect(Math.min(...distances)).toBeGreaterThan(20);

    // 2) identical bricks: three of one reference + colour, each its own piece; the stock follows
    const multi = await page.locator('.tray-item').evaluateAll((els) => els.map((e) => ({ id: e.getAttribute('data-testid')!, n: Number(/(\d+)/.exec(e.querySelector('.count')?.textContent ?? '')?.[1] ?? 0) })).find((x) => x.n >= 4)!);
    const [, partKey, colorCode] = /^tray-(.+)-([^-]+)$/.exec(multi.id)!;
    const sameBefore = free.filter((f) => f.partKey === partKey && f.colorCode === colorCode).length;
    await page.getByTestId(multi.id).click();
    for (const spot of spots.slice(6, 9)) await clickAt(page, spot);
    await expect.poll(() => progressCount(page)).toBe(9);
    await expect(page.getByTestId(multi.id).locator('.count')).toHaveText(`×${multi.n - 3}`);
    free = await game<Free[]>(page, 'freePieces');
    expect(free.filter((f) => f.partKey === partKey && f.colorCode === colorCode)).toHaveLength(sameBefore + 3);
    entry.identical = { key: `${partKey}|${colorCode}`, stockBefore: multi.n, stockAfter: multi.n - 3, placedOfThisKey: sameBefore + 3 };

    // 3) stacked: one more of them on top of the last one
    const below = free.at(-1)!;
    await clickAt(page, [below.pose[12]!, below.pose[13]!, below.pose[14]!]);
    await expect.poll(() => progressCount(page)).toBe(10);
    const top = (await game<Free[]>(page, 'freePieces')).at(-1)!;
    entry.stacked = { below: below.pose.slice(12, 15), top: top.pose.slice(12, 15) };
    expect(top.pose[13]!).toBeLessThan(below.pose[13]! - 1); // higher (LDraw -Y up)
    expect(Math.hypot(top.pose[12]! - below.pose[12]!, top.pose[14]! - below.pose[14]!)).toBeLessThanOrEqual(10);
    await page.keyboard.press('Escape');

    // 4) move and turn the second piece
    const second = free[1]!;
    await clickAt(page, [second.pose[12]!, second.pose[13]!, second.pose[14]!]);
    await page.keyboard.press('m');
    await expect(page.getByTestId('held-info')).toContainText('Pièce reprise');
    await page.keyboard.press('r');
    await clickAt(page, spots[10]!);
    const moved = (await game<Free[]>(page, 'freePieces')).find((f) => f.id === second.id)!;
    entry.moved = { from: second.pose.slice(12, 15), to: moved.pose.slice(12, 15), rotationChanged: moved.pose.slice(0, 11).join() !== second.pose.slice(0, 11).join() };
    expect(entry.moved).toMatchObject({ rotationChanged: true });
    expect(Math.hypot(moved.pose[12]! - second.pose[12]!, moved.pose[14]! - second.pose[14]!)).toBeGreaterThan(40);

    // 5) remove the third piece, then undo
    const third = free[2]!;
    await clickAt(page, [third.pose[12]!, third.pose[13]!, third.pose[14]!]);
    await page.keyboard.press('Delete');
    await expect.poll(() => progressCount(page)).toBe(9);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => progressCount(page)).toBe(10);
    expect((await game<Free[]>(page, 'freePieces')).some((f) => f.id === third.id)).toBe(true);

    // 6) free height on a real piece: auto on top of the stack, then down a plate and up 3 × 1 LDU,
    //    placed exactly where previewed (a height the automatic placement cannot give there)
    const heldNow = async () => {
      await frame(page);
      return page.evaluate(() => window.__brickLabGame!.held()) as Promise<{ previewPose: number[]; bottom: number; partKey: string }>;
    };
    const stackTop = (await game<Free[]>(page, 'freePieces')).at(-1)!;
    const longKey = await page.locator('.tray-item').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!).find((id) => /tray-(3460|3034|32018|3008|3009|3666|3710)\.dat-/.test(id)) ?? els[0]!.getAttribute('data-testid')!);
    await page.getByTestId(longKey).click();
    const sp = await onCanvas(page, [stackTop.pose[12]!, stackTop.pose[13]!, stackTop.pose[14]!]);
    await page.mouse.move(sp!.x, sp!.y, { steps: 4 });
    const autoHeld = await heldNow();
    await page.getByTestId('step-8').click();
    await page.getByTestId('lift-down').click();
    await page.getByTestId('step-1').click();
    for (let i = 0; i < 3; i++) await page.getByTestId('lift-up').click();
    const manualHeld = await heldNow();
    expect(manualHeld.previewPose[13]! - autoHeld.previewPose[13]!).toBeCloseTo(5, 2);
    await page.screenshot({ path: path.join(PROOFS, `libre-${s.number}-hauteur-manuelle.png`) });
    const dropAt = await onCanvas(page, [manualHeld.previewPose[12]!, manualHeld.previewPose[13]!, manualHeld.previewPose[14]!]);
    await page.mouse.move(dropAt!.x, dropAt!.y, { steps: 2 });
    await page.mouse.click(dropAt!.x, dropAt!.y);
    await expect.poll(() => progressCount(page)).toBe(11);
    const lowered = (await game<Free[]>(page, 'freePieces')).at(-1)!;
    expect(lowered.pose.slice(12, 15)).toEqual(manualHeld.previewPose.slice(12, 15).map((v) => Math.round(v * 100) / 100));
    entry.manualHeight = { part: longKey.replace('tray-', ''), auto: autoHeld.previewPose[13], placed: lowered.pose[13], loweredBy: lowered.pose[13]! - autoHeld.previewPose[13]! };
    await page.keyboard.press('Escape');

    // 7) a group of three pieces on the ground (click, Shift+click), moved, turned and raised as one
    const ground3 = (await game<Free[]>(page, 'freePieces')).filter((f) => ['f1', 'f4', 'f5'].includes(f.id));
    for (const [i, f] of ground3.entries()) {
      const q = await onCanvas(page, [f.pose[12]!, f.pose[13]!, f.pose[14]!]);
      await page.mouse.move(q!.x, q!.y, { steps: 2 });
      if (i > 0) await page.keyboard.down('Shift');
      await page.mouse.click(q!.x, q!.y);
      if (i > 0) await page.keyboard.up('Shift');
    }
    await expect(page.getByTestId('selection-info')).toHaveText('3 pièce(s) sélectionnée(s)');
    const trayBefore = await page.locator('.tray-item .count').allTextContents();
    await page.screenshot({ path: path.join(PROOFS, `libre-${s.number}-groupe-selection.png`) });
    await page.getByTestId('move-selection').click();
    const target = (await groundSpots(page, 16)).at(-1)!;
    const tq = await onCanvas(page, target);
    await page.mouse.move(tq!.x, tq!.y, { steps: 4 });
    await page.keyboard.press('r');
    await page.getByTestId('step-8').click();
    await page.getByTestId('lift-up').click();
    const pivot = (await heldNow()).previewPose;
    await page.screenshot({ path: path.join(PROOFS, `libre-${s.number}-groupe-en-main.png`) });
    const pq = await onCanvas(page, [pivot[12]!, pivot[13]!, pivot[14]!]);
    await page.mouse.move(pq!.x, pq!.y, { steps: 2 });
    await page.mouse.click(pq!.x, pq!.y);
    await expect(page.getByTestId('message')).toContainText('Groupe de 3 pièces déplacé');
    const movedGroup = (await game<Free[]>(page, 'freePieces')).filter((f) => ['f1', 'f4', 'f5'].includes(f.id));
    const d = (a: Free, b: Free) => Math.hypot(a.pose[12]! - b.pose[12]!, a.pose[13]! - b.pose[13]!, a.pose[14]! - b.pose[14]!);
    for (const [i, j] of [[0, 1], [0, 2], [1, 2]] as const) expect(d(movedGroup[i]!, movedGroup[j]!)).toBeCloseTo(d(ground3[i]!, ground3[j]!), 6);
    expect(await page.locator('.tray-item .count').allTextContents()).toEqual(trayBefore);
    await expect.poll(() => progressCount(page)).toBe(11);
    entry.group = { ids: movedGroup.map((f) => f.id), before: ground3.map((f) => f.pose.slice(12, 15)), after: movedGroup.map((f) => f.pose.slice(12, 15)), distancesKept: true, stockUnchanged: true };
    // one undo restores the three poses; the move is done again for the restart check
    await page.getByRole('button', { name: 'Annuler' }).click();
    expect((await game<Free[]>(page, 'freePieces')).filter((f) => ['f1', 'f4', 'f5'].includes(f.id))).toEqual(ground3);
    await page.getByTestId('move-selection').click();
    await page.mouse.move(tq!.x, tq!.y, { steps: 4 });
    await page.keyboard.press('r');
    await page.getByTestId('lift-up').click();
    const pivot2 = (await heldNow()).previewPose;
    const pq2 = await onCanvas(page, [pivot2[12]!, pivot2[13]!, pivot2[14]!]);
    await page.mouse.move(pq2!.x, pq2!.y, { steps: 2 });
    await page.mouse.click(pq2!.x, pq2!.y);
    await expect(page.getByTestId('message')).toContainText('Groupe de 3 pièces déplacé');
    await page.screenshot({ path: path.join(PROOFS, `libre-${s.number}-groupe-pose.png`) });
    await page.keyboard.press('Escape');

    // 8) smoothness: orbit the camera with the mouse while measuring frames
    const box = (await page.getByTestId('build-canvas').boundingBox())!;
    const during = frames(page, 1500);
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.4, { steps: 40 });
    await page.mouse.up();
    entry.framesOrbit = await during;
    await page.getByRole('button', { name: 'Centrer' }).click();

    // 9) leaving the free mode is explicit when pieces are off the model
    if ((await page.getByTestId('mode-select').locator('option[value="guided"]').count()) > 0) {
      await page.getByTestId('mode-select').selectOption('guided');
      await expect(page.getByTestId('mode-switch-confirm')).toContainText('hors du modèle officiel');
      entry.modeSwitch = await page.getByTestId('mode-switch-confirm').textContent();
      await page.getByRole('button', { name: 'Rester en montage libre' }).click();
      await expect(page.getByTestId('mode-select')).toHaveValue('freeManual');
    }

    // saved in the (isolated) library with the real poses
    const hook = await game<Free[]>(page, 'freePieces');
    await expect.poll(async () => ((await (await request.get(`/api/library/builds/${buildId}/progress`)).json()) as { progress: { freePieces?: unknown[] } }).progress.freePieces?.length ?? 0).toBe(hook.length);
    const rec = (await (await request.get(`/api/library/builds/${buildId}/progress`)).json()) as { revision: number; progress: Record<string, unknown> };
    entry.saved = { revision: rec.revision, schemaVersion: rec.progress.schemaVersion, freePieces: hook.length, payloadSha256: sha(JSON.stringify(rec.progress.freePieces)) };
    entry.freePieces = hook;
    entry.progressText = await page.getByTestId('progress').textContent();
    entry.freeInfo = await page.getByTestId('free-info').textContent();
    await page.screenshot({ path: path.join(PROOFS, `libre-${s.number}-partie1.png`) });
    save();
  }
});

test('part 2: after a server restart, the same assembly is restored; guided mode stays strict', async ({ page, request }) => {
  for (const s of SETS) {
    const entry = log[s.number]!;
    const buildId = entry.buildId as string;
    await page.goto(`/atelier/${buildId}`);
    await waitAtelier(page);
    await expect(page.getByTestId('progress')).toHaveText(entry.progressText as string);
    const free = await game<Free[]>(page, 'freePieces');
    expect(free).toEqual(entry.freePieces);
    expect((await page.evaluate(() => window.__brickLab!.sceneSummary())).solid).toBe(free.length);
    const rec = (await (await request.get(`/api/library/builds/${buildId}/progress`)).json()) as { revision: number; progress: Record<string, unknown> };
    expect(sha(JSON.stringify(rec.progress.freePieces))).toBe((entry.saved as { payloadSha256: string }).payloadSha256);
    const restored: Record<string, unknown> = { progressText: await page.getByTestId('progress').textContent(), freePieces: free.length, message: await page.getByTestId('message').textContent() };
    entry.afterRestart = restored;
    await page.screenshot({ path: path.join(PROOFS, `libre-${s.number}-apres-redemarrage.png`) });

    // undo after a reload: the last piece goes back to the stock
    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect.poll(() => progressCount(page)).toBe(free.length - 1);
    restored.undoAfterReload = (await game<Free[]>(page, 'freePieces')).length;

    // guided mode (when the file has steps): the free pieces off the model go only by choice, then a far drop is refused
    if ((await page.getByTestId('mode-select').locator('option[value="guided"]').count()) > 0) {
      const spots = await groundSpots(page, 16); // around the whole model (free mode: every target counts)
      await page.getByTestId('mode-select').selectOption('guided');
      await page.getByTestId('mode-switch-confirm').getByRole('button', { name: 'Retirer et changer de mode' }).click();
      await expect(page.getByTestId('mode-select')).toHaveValue('guided');
      await expect(page.getByTestId('progress')).toHaveText(`0/${entry.occurrences}`.concat(' pièces posées'));
      await page.locator('.tray-item').first().click();
      // a spot where the guided mode finds no target of the step (the pointer ray crosses none)
      let refused = false;
      for (const spot of spots) {
        const p = await onCanvas(page, spot);
        if (!p) continue;
        await page.mouse.move(p.x, p.y, { steps: 4 });
        await frame(page);
        if ((await game<{ targetId: string | null }>(page, 'held'))?.targetId) continue;
        await page.mouse.click(p.x, p.y);
        await expect(page.getByTestId('message')).toContainText(/Trop loin|orientation/);
        await expect(page.getByTestId('progress')).toHaveText(`0/${entry.occurrences}`.concat(' pièces posées'));
        restored.guidedRefusal = await page.getByTestId('message').textContent();
        refused = true;
        break;
      }
      expect(refused).toBe(true);
    }
    save();
  }
});

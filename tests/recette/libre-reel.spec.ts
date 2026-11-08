import { createHash } from 'node:crypto';
import { existsSync, promises as fs, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { RECETTE_LIBRE_DIR } from '../../playwright.recette-libre.config';
import { dragHandle } from '../e2e/free-helpers';
import { defaultDataRoot } from '../../src/server/library/paths';

/**
 * True free building on the owner's REAL sets 31009 (Small Cottage) and 31039 (Blue Power Jet, 609
 * pieces), in an isolated data folder. The files are COPIED from BRICK_LAB_DATA (read only): 31009
 * from models/ and instructions/, 31039 from the owner's library store (OMR model and booklet added
 * by the owner in P8). Part 1: pieces placed away from the model, identical bricks, stacking, move,
 * turn, remove, undo, smoothness, explicit mode switch. Part 2 (`-g "part 2"`, after restarting the
 * server by hand): the same assembly restored, guided mode still strict. SKIPPED without the files.
 */
const SRC = process.env.BRICK_LAB_DATA ?? defaultDataRoot();
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

    // 10) A–D of the owner's second recette, on real parts: a stud piece on the ground, a receptor
    //     piece snapped onto it (magnet), their assembly selected and dragged as one, turned on X in place
    const conn = (k: string) => page.evaluate((x) => window.__brickLabGame!.connectors(x), k) as Promise<{ kind: string; pos: number[] }[] | null>;
    const trayKeys = await page.locator('.tray-item').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!));
    let studKey = '', recKey = '';
    for (const id of trayKeys) {
      const partKey = /^tray-(.+)-[^-]+$/.exec(id)![1]!;
      const c = (await conn(partKey)) ?? [];
      const up = c.filter((x) => x.kind === 'stud').length, under = c.filter((x) => x.kind === 'antistud').length;
      if (!studKey && up >= 2 && under >= 2) studKey = id;
      else if (studKey && !recKey && under >= 2 && id !== studKey) recKey = id;
      if (studKey && recKey) break;
    }
    expect(studKey && recKey).toBeTruthy();
    const base = spots[11]!;
    await page.getByTestId(studKey).click();
    await clickAt(page, base);
    await page.keyboard.press('Escape');
    const baseP = (await game<Free[]>(page, 'freePieces')).at(-1)!;
    await page.getByTestId(recKey).click();
    // over the top of the base piece, a little off: the magnet aligns the receptors on its studs
    const over = await onCanvas(page, [baseP.pose[12]! + 4, baseP.pose[13]!, baseP.pose[14]! + 3]);
    await page.mouse.move(over!.x, over!.y, { steps: 4 });
    await frame(page);
    const snap = await page.evaluate(() => window.__brickLabGame!.snap()) as { pairs: number; targets: string[] } | null;
    expect(snap?.pairs ?? 0).toBeGreaterThanOrEqual(2);
    expect(snap!.targets).toEqual([`f:${baseP.id}`]);
    await page.screenshot({ path: path.join(PROOFS, `libre-${s.number}-aimant-reel.png`) });
    const dropP = (await page.evaluate(() => window.__brickLabGame!.held()))!.previewPose!;
    const dq = await onCanvas(page, [dropP[12]!, dropP[13]!, dropP[14]!]);
    await page.mouse.click(dq!.x, dq!.y);
    await page.keyboard.press('Escape');
    const topP = (await game<Free[]>(page, 'freePieces')).at(-1)!;
    const graph = await page.evaluate(() => window.__brickLabGame!.graph()) as Record<string, string[]>;
    expect(graph[`f:${topP.id}`]).toContain(`f:${baseP.id}`);
    // its assembly, dragged by the top piece to another free spot, as one object
    const tp = await onCanvas(page, [topP.pose[12]!, topP.pose[13]!, topP.pose[14]!]);
    await page.mouse.click(tp!.x, tp!.y);
    await page.getByTestId('select-assembly').click();
    await expect(page.getByTestId('selection-info')).toHaveText('2 pièce(s) sélectionnée(s)');
    const dest = (await groundSpots(page, 16)).find((sp) => Math.hypot(sp[0] - baseP.pose[12]!, sp[2] - baseP.pose[14]!) > 80)!;
    const tq2 = await onCanvas(page, [topP.pose[12]!, topP.pose[13]!, topP.pose[14]!]);
    await page.mouse.move(tq2!.x, tq2!.y);
    await page.mouse.down();
    const dd = await onCanvas(page, dest);
    await page.mouse.move(dd!.x, dd!.y, { steps: 12 });
    await frame(page);
    await page.mouse.up();
    await expect(page.getByTestId('message')).toContainText('Groupe de 2 pièces déplacé');
    const moved2 = (await game<Free[]>(page, 'freePieces')).filter((f) => f.id === baseP.id || f.id === topP.id);
    const rel = (a: Free, b: Free) => [12, 13, 14].map((k) => Math.round((a.pose[k]! - b.pose[k]!) * 100) / 100);
    expect(rel(moved2[1]!, moved2[0]!)).toEqual(rel(topP, baseP));
    // turned on X in place (the selection stays on the moved assembly), kept for the restart check
    await page.getByTestId('rot-x-plus').click();
    await expect(page.getByTestId('message')).toContainText('2 pièces tournées sur place (X +90°)');
    await page.getByTestId('clear-selection').click();
    entry.d3 = { studPiece: studKey.replace('tray-', ''), receptorPiece: recKey.replace('tray-', ''), snapPairs: snap!.pairs, connected: true, assemblyMoved: true, turnedX: true };

    // saved in the (isolated) library with the real poses
    const hook = await game<Free[]>(page, 'freePieces');
    // saved = what the screen shows (positions and rotations), not only the same number of pieces
    const shownPoses = JSON.stringify(hook.map((f) => [f.id, ...[12, 13, 14, 0, 4, 8, 1, 5, 9, 2, 6, 10].map((k) => Math.round(f.pose[k]! * 100) / 100)]));
    await expect.poll(async () => JSON.stringify((((await (await request.get(`/api/library/builds/${buildId}/progress`)).json()) as { progress: { freePieces?: { id: string; pose: number[] }[] } }).progress.freePieces ?? []).map((f) => [f.id, ...f.pose.map((v) => Math.round(v * 100) / 100)])), { timeout: 15_000 }).toBe(shownPoses);
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

test('part 3: 31039 with its 609 pieces placed — opening, connection graph, assembly, dragging with the magnet', async ({ page, request }) => {
  const s = SETS.find((x) => x.number === '31039-1')!;
  const entry = log[s.number]!;
  const buildId = entry.buildId as string;
  await page.goto(`/atelier/${buildId}`);
  await waitAtelier(page);
  // the build of parts 1–2 goes to the history (Abandonner), then every occurrence of the model is
  // placed freely at its model pose (a finished 31039), written through the library API. Mirrored
  // parts of the OMR file (non-rigid poses) cannot be free pieces: they are left out and counted.
  await page.getByRole('button', { name: 'Abandonner' }).click();
  await page.getByTestId('confirm-restart').getByRole('button', { name: 'Confirmer l’abandon' }).click();
  await page.getByRole('button', { name: 'Montage libre (avec notice)' }).click();
  const all = await game<Cand[]>(page, 'candidates');
  const rigid = (m: number[]) => {
    const det = m[0]! * (m[5]! * m[10]! - m[9]! * m[6]!) - m[4]! * (m[1]! * m[10]! - m[9]! * m[2]!) + m[8]! * (m[1]! * m[6]! - m[5]! * m[2]!);
    return Math.abs(det - 1) < 1e-3;
  };
  const usable = all.filter((c) => rigid(c.matrix));
  const lib = (await (await request.get(`/api/library/builds/${buildId}`)).json()) as { build: { model: { sha256: string } } };
  const progress = {
    schemaVersion: 3, modelContentHash: lib.build.model.sha256, displayName: '31039-1.mpd', buildMode: 'freeManual', placedOccurrenceIds: [], totalOccurrences: all.length,
    freePieces: usable.map((c, i) => ({ id: `f${i + 1}`, partKey: c.partKey, colorCode: c.colorCode, pose: [c.matrix[12], c.matrix[13], c.matrix[14], c.matrix[0], c.matrix[4], c.matrix[8], c.matrix[1], c.matrix[5], c.matrix[9], c.matrix[2], c.matrix[6], c.matrix[10]].map((v) => Math.round((v ?? 0) * 1e6) / 1e6) })),
    updatedAtIso: new Date().toISOString(),
  };
  await expect.poll(async () => ((await (await request.get(`/api/library/builds/${buildId}/progress`)).json()) as { revision: number | null }).revision !== undefined).toBe(true);
  const rec = (await (await request.get(`/api/library/builds/${buildId}/progress`)).json()) as { revision: number | null };
  const put = await request.put(`/api/library/builds/${buildId}/progress`, { data: { baseRevision: rec.revision, progress }, headers: { origin: 'http://127.0.0.1:3210', 'x-brick-lab': '1' } });
  expect(put.ok(), await put.text()).toBe(true);
  const placedCount = usable.length;
  const t0 = Date.now();
  await page.reload();
  await waitAtelier(page);
  await expect(page.getByTestId('progress')).toHaveText(`${placedCount}/609 pièces posées`, { timeout: 60_000 });
  const perf: Record<string, unknown> = { openMs: Date.now() - t0, placed: placedCount, mirroredLeftOut: all.length - placedCount };
  await page.waitForFunction(() => Object.keys(window.__brickLabGame!.graph()).length > 0, null, { timeout: 60_000 });
  perf.graph = await page.evaluate(() => { const t = performance.now(); const g = window.__brickLabGame!.graph(); return { ms: Math.round(performance.now() - t), connectedPieces: Object.keys(g).length, links: Object.values(g).reduce((n, v) => n + v.length, 0) / 2 }; });
  perf.framesIdle = await frames(page, 1500);
  // the assembly of one piece of the jet
  const one = (await game<Free[]>(page, 'freePieces'))[0]!;
  const q = await onCanvas(page, [one.pose[12]!, one.pose[13]!, one.pose[14]!]);
  if (q) {
    await page.mouse.click(q.x, q.y);
    const t1 = Date.now();
    await page.getByTestId('select-assembly').click();
    await expect(page.getByTestId('selection-info')).not.toHaveText('1 pièce(s) sélectionnée(s)', { timeout: 30_000 });
    perf.assembly = { ms: Date.now() - t1, pieces: (await page.evaluate(() => window.__brickLabGame!.selection())).length };
    // the gizmo on that assembly: one plate up by the green arrow, frames measured during the drag
    const beforeG = await game<Free[]>(page, 'freePieces');
    const duringG = frames(page, 1500);
    await dragHandle(page, 'translate', 'Y', 9);
    perf.framesWhileGizmoDragAssembly = await duringG;
    const afterG = await game<Free[]>(page, 'freePieces');
    const movedIds = new Set(await page.evaluate(() => window.__brickLabGame!.selection().map((r) => (r as { id: string }).id)));
    perf.gizmoAssembly = {
      moved: afterG.filter((f) => movedIds.has(f.id)).every((f) => Math.abs(f.pose[13]! - (beforeG.find((b) => b.id === f.id)!.pose[13]! - 8)) < 0.011),
      othersUnchanged: afterG.filter((f) => !movedIds.has(f.id)).every((f) => JSON.stringify(f.pose) === JSON.stringify(beforeG.find((b) => b.id === f.id)!.pose)),
    };
    expect(perf.gizmoAssembly).toEqual({ moved: true, othersUnchanged: true });
    await page.getByRole('button', { name: 'Annuler' }).click();
    await page.getByTestId('clear-selection').click();
  }
  // a piece dragged over the jet for 1.5 s: the magnet is computed on every move
  await page.getByRole('button', { name: 'Centrer' }).click();
  if (q) {
    const q2 = await onCanvas(page, [one.pose[12]!, one.pose[13]!, one.pose[14]!]);
    await page.mouse.move(q2!.x, q2!.y);
    await page.mouse.down();
    const during = frames(page, 1500);
    for (let i = 0; i < 30; i++) await page.mouse.move(q2!.x + Math.sin(i / 3) * 120, q2!.y + Math.cos(i / 4) * 60, { steps: 2 });
    perf.framesWhileDraggingWithMagnet = await during;
    await page.keyboard.press('Escape');
    await page.mouse.up();
  }
  perf.framesOrbit = await (async () => {
    const box = (await page.getByTestId('build-canvas').boundingBox())!;
    const during = frames(page, 1500);
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.8);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.7, { steps: 40 });
    await page.mouse.up();
    return during;
  })();
  await page.screenshot({ path: path.join(PROOFS, 'libre-31039-1-609-pieces.png') });
  entry.perf609 = perf;
  save();
  console.log('PERF', JSON.stringify(perf));
});

test('part 4: the owner’s own 31039 build (copied, read only) — the gizmo on their assembly, their axles and their wheel', async ({ page, request }) => {
  const s = SETS.find((x) => x.number === '31039-1')!;
  const buildId = log[s.number]!.buildId as string;
  // the owner's current 31039 progress, read from their library (never written), put into the isolated build
  const own = JSON.parse(readFileSync(path.join(SRC, 'library', 'builds', ownerBuildOf('31039-1')!, 'progress.json'), 'utf8')) as { payload: { freePieces: { id: string; pose: number[] }[] } };
  const rec = (await (await request.get(`/api/library/builds/${buildId}/progress`)).json()) as { revision: number | null };
  const put = await request.put(`/api/library/builds/${buildId}/progress`, { data: { baseRevision: rec.revision, progress: own.payload }, headers: { origin: 'http://127.0.0.1:3210', 'x-brick-lab': '1' } });
  expect(put.ok(), await put.text()).toBe(true);
  await page.goto(`/atelier/${buildId}`);
  await waitAtelier(page);
  const n = own.payload.freePieces.length;
  await expect(page.getByTestId('progress')).toHaveText(`${n}/609 pièces posées`);
  const start = await game<Free[]>(page, 'freePieces');
  const byId = (l: Free[], id: string) => l.find((f) => f.id === id)!;
  const res: Record<string, unknown> = { pieces: n };
  await page.waitForFunction(() => (window.__brickLabGame!.connectors('30157.dat') ?? []).length > 0, null, { timeout: 60_000 });

  // a grey plate: the arrows on a click, one plate up (Y), exactly, nothing else moved
  const grey = byId(start, 'f11');
  const gp = await onCanvas(page, [grey.pose[12]!, grey.pose[13]!, grey.pose[14]!]);
  await page.mouse.click(gp!.x, gp!.y);
  await expect(page.getByTestId('gizmo-coords')).toBeVisible();
  await dragHandle(page, 'translate', 'Y', 9);
  let now = await game<Free[]>(page, 'freePieces');
  expect(byId(now, 'f11').pose.slice(12, 15)).toEqual([grey.pose[12], Math.round((grey.pose[13]! - 8) * 100) / 100, grey.pose[14]]);
  expect(now.filter((f) => f.id !== 'f11')).toEqual(start.filter((f) => f.id !== 'f11'));
  await page.getByRole('button', { name: 'Annuler' }).click();
  res.greyPlateUpOnePlate = true;

  // their connected assembly (grey, orange, green on the white plate): moved and turned with the gizmo
  await page.mouse.click(gp!.x, gp!.y);
  await page.getByTestId('select-assembly').click();
  const assembly = (await page.evaluate(() => window.__brickLabGame!.selection().map((r) => (r as { id: string }).id))).sort();
  res.assembly = assembly;
  expect(assembly.length).toBeGreaterThanOrEqual(7);
  await page.screenshot({ path: path.join(PROOFS, 'libre-31039-1-gizmo-assemblage-proprietaire.png') });
  await dragHandle(page, 'translate', 'X', 41);
  await page.getByTestId('gizmo-rotate').click();
  await dragHandle(page, 'rotate', 'Y', 100);
  now = await game<Free[]>(page, 'freePieces');
  const dist = (l: Free[], a: string, b: string) => Math.hypot(...[12, 13, 14].map((k) => byId(l, a).pose[k]! - byId(l, b).pose[k]!));
  for (let i = 1; i < assembly.length; i++) expect(dist(now, assembly[0]!, assembly[i]!)).toBeCloseTo(dist(start, assembly[0]!, assembly[i]!), 6);
  expect(now.filter((f) => !assembly.includes(f.id))).toEqual(start.filter((f) => !assembly.includes(f.id)));
  res.assemblyMovedAndTurned = true;
  await page.getByRole('button', { name: 'Annuler' }).click();
  await page.getByRole('button', { name: 'Annuler' }).click();
  expect(await game<Free[]>(page, 'freePieces')).toEqual(start);

  // one of their upright red axles: local axes follow it
  await page.getByTestId('gizmo-translate').click();
  const axle = byId(start, 'f16');
  const ap = await onCanvas(page, [axle.pose[12]!, axle.pose[13]!, axle.pose[14]!]);
  if (ap) {
    await page.mouse.click(ap.x, ap.y);
    const sel = await page.evaluate(() => window.__brickLabGame!.selection().map((r) => (r as { id: string }).id));
    res.axleSelected = sel;
  }
  // their wheel, placed by typed coordinates
  await page.keyboard.press('Escape');
  const wheel = byId(start, 'f20');
  const wq = await onCanvas(page, [wheel.pose[12]!, wheel.pose[13]!, wheel.pose[14]!]);
  if (wq) {
    await page.mouse.click(wq.x, wq.y);
    const sel = await page.evaluate(() => window.__brickLabGame!.selection().map((r) => (r as { id: string }).id));
    if (sel.length === 1) {
      await page.getByTestId('gizmo-x').fill('360');
      await page.getByTestId('gizmo-apply').click();
      now = await game<Free[]>(page, 'freePieces');
      res.typedX = { piece: sel[0], x: byId(now, sel[0]!).pose[12] };
      expect(byId(now, sel[0]!).pose[12]).toBe(360);
    }
  }
  // reload: the same poses
  const kept = await game<Free[]>(page, 'freePieces');
  await page.reload();
  await waitAtelier(page);
  expect(await game<Free[]>(page, 'freePieces')).toEqual(kept);
  res.reloadIdentical = true;
  log[s.number]!.ownerGizmo = res;
  save();
  console.log('OWNER', JSON.stringify(res));
});

/** Build id of a set in the OWNER's library (read only). */
function ownerBuildOf(setNumber: string): string | null {
  const lib = JSON.parse(readFileSync(path.join(SRC, 'library', 'library.json'), 'utf8')) as { sets: { id: string; setNumber: string }[]; builds: { id: string; setId: string }[] };
  const set = lib.sets.find((x) => x.setNumber === setNumber);
  return set ? lib.builds.find((b) => b.setId === set.id)?.id ?? null : null;
}

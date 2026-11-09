import { createHash } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

/**
 * Shared by the free-mode specs (free-3d, free-gizmo): an ORIGINAL synthetic model with the parts and
 * poses of the owner's 31039 assembly (white 3034, orange 3023, green 99780, grey 30157) and the red
 * 32062 axle, and the pointer helpers of the standalone atelier (browser save, nothing in a library).
 */
export const MODEL = ['0 FILE assemblage.ldr', '0 Name: assemblage.ldr',
  '1 15 0 33.41 0 1 0 0 0 1 0 0 0 1 3034.dat', '1 25 0 25.41 0 1 0 0 0 1 0 0 0 1 3023.dat', '1 25 40 25.41 0 1 0 0 0 1 0 0 0 1 3023.dat',
  '1 2 -40 25.41 0 1 0 0 0 1 0 0 0 1 99780.dat', '1 2 80 25.41 0 1 0 0 0 1 0 0 0 1 99780.dat', '1 71 0 17.41 0 1 0 0 0 1 0 0 0 1 30157.dat',
  '1 71 0 9.41 0 1 0 0 0 1 0 0 0 1 30157.dat', '1 4 200 35.41 0 0 0 -1 0 1 0 1 0 0 32062.dat', '1 4 300 25.41 0 1 0 0 0 1 0 0 0 1 3001.dat',
  '1 4 300 1.41 0 1 0 0 0 1 0 0 0 1 3001.dat', '1 4 300 -22.59 0 1 0 0 0 1 0 0 0 1 3001.dat'].join('\n');
export const SHA = createHash('sha256').update(MODEL).digest('hex');
export type F = { id: string; partKey: string; colorCode: string; pose: number[] };
export const P = (id: string, partKey: string, colorCode: string, pose: number[]) => ({ id, partKey, colorCode, pose });
/** The owner’s assembly, as saved in the 31039 build (grey plates 2 LDU too high: not connected). */
export const OWNER = [
  P('f6', '3034.dat', '15', [70, 33.41, -10, 0, 0, -1, 0, 1, 0, 1, 0, 0]), P('f7', '99780.dat', '2', [70, 25.41, -80, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
  P('f8', '99780.dat', '2', [70, 25.41, 60, -1, 0, 0, 0, 1, 0, 0, 0, -1]), P('f9', '3023.dat', '25', [70, 25.41, -60, -1, 0, 0, 0, 1, 0, 0, 0, -1]),
  P('f10', '3023.dat', '25', [70, 25.41, 40, -1, 0, 0, 0, 1, 0, 0, 0, -1]), P('f11', '30157.dat', '71', [70, 15.41, -70, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
  P('f12', '30157.dat', '71', [70, 15.41, 50, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
];
export const ground = (page: Page) => page.evaluate(() => window.__brickLabGame!.ground());

export const freePieces = (page: Page) => page.evaluate(() => window.__brickLabGame!.freePieces()) as Promise<F[]>;
/** The step, angle and typed coordinates of the selection are in the « Réglages » popover of the bottom bar. */
export async function manipSettings(page: Page) {
  const button = page.getByTestId('manip-settings');
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
}
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

export type Kind = 'translate' | 'rotate';
/**
 * Screen point of a gizmo handle and of the same point moved by `distance` LDU along that axis
 * (TransformControls: arrow picker from 0.1 to 1.1 × scale, ring of radius 1 × scale).
 */
export async function handle(page: Page, kind: Kind, axis: 'X' | 'Y' | 'Z', distance = 0) {
  await frame(page);
  return page.evaluate(([k, a, d]) => {
    const g = window.__brickLabGizmo!;
    const c = g.controls()!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proxy = g.proxy() as any;
    const V = proxy.position.constructor;
    const Q = proxy.quaternion.constructor;
    const wp = proxy.getWorldPosition(new V());
    const factor = wp.distanceTo(c.camera.position) * Math.min((1.9 * Math.tan((Math.PI * c.camera.fov) / 360)) / c.camera.zoom, 7);
    const scale = (factor * c.size) / 7;
    const unit = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[a as 'X']!;
    const ring = { X: [0, 0.7071, 0.7071], Y: [0.7071, 0, 0.7071], Z: [0.7071, 0.7071, 0] }[a as 'X']!;
    const local = c.space === 'local';
    const q = proxy.getWorldQuaternion(new Q());
    const dir = (v: number[]) => { const r = new V(v[0], v[1], v[2]); return local ? r.applyQuaternion(q) : r; };
    const p0 = wp.clone().add(dir(k === 'translate' ? unit : ring).multiplyScalar(k === 'translate' ? 0.6 * scale : scale));
    let p1;
    if (k === 'translate') p1 = p0.clone().add(dir(unit).multiplyScalar(d as number));
    else {
      // rotation: TransformControls turns by (move along the tangent) × 20 / distance to the camera
      const eye = c.camera.position.clone().sub(wp).normalize();
      const tangent = dir(unit).cross(eye).normalize();
      const speed = 20 / wp.distanceTo(c.camera.position);
      p1 = p0.clone().add(tangent.multiplyScalar(((d as number) * Math.PI) / 180 / speed));
    }
    const toScreen = (w: { x: number; y: number; z: number }) => window.__brickLab!.project([w.x, -w.y, -w.z]);
    return { from: toScreen(p0), to: toScreen(p1), scale };
  }, [kind, axis, distance] as const);
}
/** Drags a gizmo handle by `distance` LDU along its axis (or, for a ring, along `screen`). */
export async function dragHandle(page: Page, kind: Kind, axis: 'X' | 'Y' | 'Z', distance: number, opts: { alt?: boolean; screen?: [number, number] } = {}) {
  const h = await handle(page, kind, axis, distance);
  await page.mouse.move(h.from.x, h.from.y, { steps: 3 });
  await frame(page);
  expect(await page.evaluate(() => window.__brickLabGizmo!.controls()!.axis)).toBe(axis);
  await page.mouse.down();
  if (opts.alt) await page.keyboard.down('Alt');
  const end = opts.screen ? { x: h.from.x + opts.screen[0], y: h.from.y + opts.screen[1] } : h.to;
  await page.mouse.move(end.x, end.y, { steps: 16 });
  await frame(page);
  await page.mouse.up();
  if (opts.alt) await page.keyboard.up('Alt');
  await frame(page);
}

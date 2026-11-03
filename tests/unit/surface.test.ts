import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createSession, placeExact, type BuildContext } from '@/domain/build/engine';
import { bottomExtent, candidateLayers, intersectLayer, layerFromSurface, resolveHover, type HeldState, type Ray } from '@/domain/build/surface';
import { analyzeModel } from '@/domain/import/analyze';
import { inventoryCheck } from '@/domain/import/known-validations';
import { IDENTITY } from '@/domain/ldraw/matrix';

const fixture = (name: string) => readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8');
// 2×4 brick body: y from 0 (top) to 24 (bottom), studs up to -4
const brickVertices = [-40, 0, -20, 40, 0, 20, -40, 24, -20, 40, 24, 20, 10, -4, 10];

/** Ray looking straight down at (x, z) from above. */
const down = (x: number, z: number): Ray => ({ origin: [x, -1000, z], direction: [0, 1, 0] });
/** Oblique ray through (x, y, z), like a camera above and in front. */
const oblique = (x: number, y: number, z: number): Ray => {
  const d = [0.4, 0.8, 0.45];
  const n = Math.hypot(...d);
  const dir = d.map((v) => v / n) as [number, number, number];
  return { origin: [x - dir[0] * 500, y - dir[1] * 500, z - dir[2] * 500], direction: dir };
};

describe('surface helpers', () => {
  it('bottom extent comes from the real geometry and the orientation', () => {
    expect(bottomExtent(brickVertices, IDENTITY)).toBe(24);
    const upsideDown = [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1] as const;
    expect(bottomExtent(brickVertices, upsideDown)).toBe(4); // studs now point down
  });

  it('a brick resting on a surface takes the nearest target layer; stud tops do not shift it', () => {
    expect(layerFromSurface(24, 24, [0, -24])).toEqual({ layerY: 0, matched: true }); // on the ground (y=24)
    expect(layerFromSurface(0, 24, [0, -24])).toEqual({ layerY: -24, matched: true }); // on top of a brick
    expect(layerFromSurface(-4, 24, [0, -24])).toEqual({ layerY: -24, matched: true }); // hit a stud top
    // plates (8 LDU): a stud hit exactly between two layers goes to the lower one
    expect(layerFromSurface(-4, 8, [0, -8, -16])).toEqual({ layerY: -8, matched: true });
    // nothing compatible near: keep the physical height, the drop will be refused normally
    expect(layerFromSurface(-200, 24, [0, -24])).toEqual({ layerY: -224, matched: false });
  });

  it('manual mode: xz is where the ray crosses the chosen layer', () => {
    expect(intersectLayer(down(83, -12), -24)).toEqual([85, -10]);
    const r = oblique(80, -24, 0);
    expect(intersectLayer(r, -24)).toEqual([80, 0]);
  });
});

describe('resolveHover on mini-4-pieces (2 levels)', () => {
  const a = analyzeModel(fixture('mini-4-pieces.mpd'), 'mini-4-pieces.mpd');
  const ctx: BuildContext = { occurrences: a.model.occurrences, plan: a.plan, symmetries: new Map([['3001.dat', [0, 2]]]) };
  const held = (colorCode: string, layerMode: HeldState['layerMode'] = 'auto', layerY = 0): HeldState =>
    ({ partKey: '3001.dat', colorCode, orientation: IDENTITY, quarterTurns: 0, layerY, layerMode });
  let free = createSession('freeManual');
  for (const id of ['mini-4-pieces.mpd#0', 'mini-4-pieces.mpd#1']) {
    const r = placeExact(ctx, free, id);
    if (r.ok) free = r.session;
  }

  it('upper brick: pointing at the top of a placed brick puts it on top, no key needed', () => {
    // pointer on the top of the red brick (0,0,0)
    const r = resolveHover(ctx, free, held('2'), oblique(0, 0, 0), { kind: 'solid', x: 2, y: -4, z: -1 }, 24)!;
    expect(r.layerY).toBe(-24);
    expect(r.source).toBe('surface');
    expect(r.targetId).toBe('mini-4-pieces.mpd#2');
    expect(r.previewPose.slice(12, 15)).toEqual([0, -24, 0]);
  });

  it('identical bricks: the target under the pointer is chosen among several', () => {
    const text = ['1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat', '1 4 80 0 0 1 0 0 0 1 0 0 0 1 3001.dat', '1 4 0 -24 0 1 0 0 0 1 0 0 0 1 3001.dat', '1 4 80 -24 0 1 0 0 0 1 0 0 0 1 3001.dat'].join('\n');
    const m = analyzeModel(text, 'same.ldr');
    const c: BuildContext = { occurrences: m.model.occurrences, plan: m.plan };
    let s = createSession('freeManual');
    for (const id of ['same.ldr#0', 'same.ldr#1']) { const r = placeExact(c, s, id); if (r.ok) s = r.session; }
    expect(resolveHover(c, s, held('4'), oblique(80, 0, 0), { kind: 'solid', x: 80, y: 0, z: 0 }, 24)!.targetId).toBe('same.ldr#3');
    expect(resolveHover(c, s, held('4'), oblique(0, 0, 0), { kind: 'solid', x: 0, y: 0, z: 0 }, 24)!.targetId).toBe('same.ldr#2');
  });

  it('far from any target: shown where the pointer is, never snapped to a distant target', () => {
    const r = resolveHover(ctx, free, held('2'), oblique(300, 24, 200), { kind: 'ground', x: 300, y: 24, z: 200 }, 24)!;
    expect(r.targetId).toBeNull();
    expect(r.previewPose).toEqual(r.pose);
    expect(r.previewPose.slice(12, 15)).toEqual([300, 0, 200]); // resting on the ground at the pointed spot
  });

  it('a placed target is never offered again', () => {
    // red #0 is already placed: hovering its spot with a red brick finds nothing
    const r = resolveHover(ctx, free, held('4'), oblique(0, 24, 0), { kind: 'ground', x: 0, y: 24, z: 0 }, 24)!;
    expect(r.targetId).toBeNull();
  });

  it('wrong orientation is not hidden by the magnet', () => {
    const r = resolveHover(ctx, free, { ...held('2'), quarterTurns: 1 }, oblique(0, 0, 0), { kind: 'solid', x: 0, y: 0, z: 0 }, 24)!;
    expect(r.targetId).toBeNull();
  });

  it('symmetric rotation is accepted and shown at the target position with the player rotation', () => {
    const r = resolveHover(ctx, free, { ...held('2'), quarterTurns: 2 }, oblique(0, 0, 0), { kind: 'solid', x: 0, y: 0, z: 0 }, 24)!;
    expect(r.targetId).toBe('mini-4-pieces.mpd#2');
    expect(r.previewPose.slice(12, 15)).toEqual([0, -24, 0]);
    expect(r.previewPose[0]).toBeCloseTo(-1);
  });

  it('ghost magnet: hovering a compatible ghost puts the brick on it', () => {
    const r = resolveHover(ctx, free, held('14'), oblique(60, -30, 10), { kind: 'ghost', x: 60, y: -24, z: 10, occurrenceId: 'mini-4-pieces.mpd#3' }, 24)!;
    expect(r.source).toBe('ghost');
    expect(r.targetId).toBe('mini-4-pieces.mpd#3');
  });

  it('manual mode keeps the chosen layer whatever the surface (PageUp/PageDown fallback)', () => {
    const r = resolveHover(ctx, free, held('2', 'manual', 0), oblique(0, 0, 0), { kind: 'solid', x: 0, y: 0, z: 0 }, 24)!;
    expect(r.layerY).toBe(0);
    expect(r.source).toBe('manual');
    expect(r.targetId).toBeNull();
  });

  it('nothing below yet (top brick first): pointing at its spot in the air finds it along the ray', () => {
    const empty = createSession('freeManual');
    // pointer aimed at the upper spot (0,-24,0); the ray goes on and hits the ground further away
    const r = resolveHover(ctx, empty, held('2'), oblique(0, -24, 0), { kind: 'ground', x: 30, y: 24, z: 34, distance: 600 }, 24)!;
    expect(r.source).toBe('ray');
    expect(r.targetId).toBe('mini-4-pieces.mpd#2');
  });

  it('a target hidden behind a visible brick is not picked along the ray', () => {
    const empty = createSession('freeManual');
    // the ray hits a solid surface at distance 400, the target lies ~500 along the ray
    const r = resolveHover(ctx, empty, held('2'), oblique(0, -24, 0), { kind: 'solid', x: -30, y: -60, z: -40, distance: 400 }, 24)!;
    expect(r.targetId).toBeNull();
  });

  it('candidate layers only list open targets of the held part+colour', () => {
    expect(candidateLayers(ctx, free, { partKey: '3001.dat', colorCode: '2' })).toEqual([-24]);
    expect(candidateLayers(ctx, free, { partKey: '3001.dat', colorCode: '4' })).toEqual([]);
  });
});

describe('inventory check', () => {
  it('only the exact validated files carry a verdict; anything else is not verified', () => {
    expect(inventoryCheck('2036218e4555345763b151695a6f0d114fc7ae554f0906993e22b4df0204c8a2').verdict).toBe('COHERENT');
    expect(inventoryCheck('97b83517b0e843f8071ea3e4e80fbe0c7897685a7f476d3ba83161bb1185333d').verdict).toBe('INDETERMINATE');
    expect(inventoryCheck('0'.repeat(64)).verdict).toBe('NOT_VERIFIED');
  });
});

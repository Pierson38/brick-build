import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { activeStepIndex, createSession, heldPose, switchMode, tray, tryPlace, type BuildContext, type BuildSession } from '@/domain/build/engine';
import {
  FREE_TARGET_MAGNET, atModelCount, groupPoses, isRigidPose, isStockExhausted, liftedY, makeGroup, matchToModel, moveGroup, movePiece, occupiedView,
  placeFree, poseFromLDraw, poseToLDraw, removeLast, removePiece, removePieces, resolveFreeHover, stockLeft, toStepped, usedCount,
} from '@/domain/build/free';
import { restoreProgress, serializeProgress } from '@/domain/build/progress';
import type { HeldState, HoverHit, Ray } from '@/domain/build/surface';
import { analyzeModel } from '@/domain/import/analyze';
import { compareSaves, saveSignature, summarise } from '@/domain/library/save-compare';
import { buildStatus } from '@/domain/library/types';
import { IDENTITY, rotationAngleDeg, rotationY, withTranslation } from '@/domain/ldraw/matrix';
import type { Matrix4Tuple } from '@/domain/ldraw/types';

const fixture = (name: string) => readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8');
const ctxOfText = (text: string, name: string): BuildContext => {
  const a = analyzeModel(text, name);
  return { occurrences: a.model.occurrences, plan: a.plan };
};
// mini-4-pieces: 3001 red (4) at 0,0,0 and blue (1) at 80,0,0 (step 1); green (2) at 0,-24,0 and yellow (14) at 80,-24,0 (step 2)
const mini = ctxOfText(fixture('mini-4-pieces.mpd'), 'mini-4-pieces.mpd');
const SAME = ['0 FILE same.ldr', '1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat', '1 4 80 0 0 1 0 0 0 1 0 0 0 1 3001.dat', '1 4 0 -24 0 1 0 0 0 1 0 0 0 1 3001.dat'].join('\n');
const same = ctxOfText(SAME, 'same.ldr');
const at = (x: number, y: number, z: number, q = 0): Matrix4Tuple => withTranslation(rotationY(q), [x, y, z]);
const brick = (colorCode: string) => ({ partKey: '3001.dat', colorCode });
const free = (): BuildSession => createSession('freeManual');
const placed = (ctx: BuildContext, s: BuildSession, c: string, pose: Matrix4Tuple) => {
  const r = placeFree(ctx, s, brick(c), pose);
  if (!r.ok) throw new Error(r.reason);
  return r.session;
};
const HASH = 'a'.repeat(64);

describe('free placement: the pose chosen by the player, not the model target', () => {
  it('a piece placed far from its official position is accepted in free mode, the same pose is refused in guided mode', () => {
    const far = at(400, 0, -260, 1);
    const r = placeFree(mini, free(), brick('4'), far);
    expect(r).toMatchObject({ ok: true, pieceId: 'f1' });
    if (!r.ok) return;
    expect(r.session.free![0]!.pose).toEqual(far);
    expect(r.session.placed).toEqual([]);
    expect(usedCount(r.session)).toBe(1);
    // guided mode: unchanged validation against the targets
    expect(tryPlace(mini, createSession('guided'), brick('4'), far)).toMatchObject({ ok: false, reason: 'TOO_FAR' });
    expect(placeFree(mini, createSession('guided'), brick('4'), far)).toEqual({ ok: false, reason: 'NOT_FREE_MODE' });
  });

  it('respects the exact quantities and colours of the set', () => {
    let s = free();
    s = placed(mini, s, '4', at(300, 0, 0));
    expect(stockLeft(mini, s, '3001.dat', '4')).toBe(0);
    expect(placeFree(mini, s, brick('4'), at(500, 0, 0))).toEqual({ ok: false, reason: 'NO_STOCK' });
    // a colour that is not in the set has no stock
    expect(placeFree(mini, s, brick('15'), at(500, 0, 0))).toEqual({ ok: false, reason: 'NO_STOCK' });
    expect(placeFree(mini, s, { partKey: '3003.dat', colorCode: '4' }, at(500, 0, 0))).toEqual({ ok: false, reason: 'NO_STOCK' });
    expect(tray(mini, s).map((t) => t.colorCode)).toEqual(['1', '2', '14']);
  });

  it('several identical bricks: each one is its own piece, the stock stops at the model quantity', () => {
    let s = free();
    for (const x of [500, 520, 540]) s = placed(same, s, '4', at(x, 0, 0));
    expect(s.free!.map((f) => f.id)).toEqual(['f1', 'f2', 'f3']);
    expect(placeFree(same, s, brick('4'), at(560, 0, 0))).toEqual({ ok: false, reason: 'NO_STOCK' });
    expect(isStockExhausted(same, s)).toBe(true);
    expect(atModelCount(s, matchToModel(same, s))).toBe(0); // stock used up, nothing where the model puts it
  });

  it('moves and turns a placed piece; a piece taken off its model target becomes free', () => {
    let s = placed(mini, free(), '1', at(200, 0, 40));
    let r = movePiece(mini, s, { kind: 'free', id: 'f1' }, at(-60, 0, 100, 1));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.session;
    expect(s.free![0]!.pose).toEqual(at(-60, 0, 100, 1));
    // an old anchored piece (restored from an older save)
    const legacy: BuildSession = { mode: 'freeManual', placed: ['mini-4-pieces.mpd#0'], free: s.free! };
    r = movePiece(mini, legacy, { kind: 'anchored', occurrenceId: 'mini-4-pieces.mpd#0' }, at(0, 0, 200));
    expect(r).toMatchObject({ ok: true, pieceId: 'f2' });
    if (!r.ok) return;
    expect(r.session.placed).toEqual([]);
    expect(usedCount(r.session)).toBe(2);
    expect(movePiece(mini, s, { kind: 'free', id: 'f9' }, at(0, 0, 0))).toEqual({ ok: false, reason: 'UNKNOWN_PIECE' });
  });

  it('removes a placed piece back to the stock; undo after a reload takes the last piece', () => {
    let s = placed(mini, free(), '4', at(200, 0, 0));
    s = placed(mini, s, '1', at(240, 0, 0));
    expect(stockLeft(mini, removePiece(s, { kind: 'free', id: 'f1' }), '3001.dat', '4')).toBe(1);
    expect(removeLast(s).free!.map((f) => f.id)).toEqual(['f1']);
    expect(removeLast({ mode: 'freeManual', placed: ['mini-4-pieces.mpd#0'] }).placed).toEqual([]);
  });

  it('refuses a pose that is not rigid (scaled, mirrored, unbounded)', () => {
    const scaled = [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as unknown as Matrix4Tuple;
    const mirrored = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as unknown as Matrix4Tuple;
    expect(isRigidPose(at(10, 20, 30, 3))).toBe(true);
    expect(isRigidPose(scaled)).toBe(false);
    expect(isRigidPose(mirrored)).toBe(false);
    expect(isRigidPose(at(1e6, 0, 0))).toBe(false);
    expect(placeFree(mini, free(), brick('4'), scaled)).toEqual({ ok: false, reason: 'INVALID_POSE' });
  });
});

describe('the model only as information', () => {
  it('recognises a free piece at its place in the model (guided tolerances, part symmetries), never twice', () => {
    let s = placed(same, free(), '4', at(3, 0, -2)); // near target #0
    s = placed(same, s, '4', at(1, 0, 0)); // also near #0: #0 is taken once
    s = placed(same, s, '4', at(80, 0, 0, 2)); // half turn at #1: same place only if the part is symmetric
    const m = matchToModel(same, s);
    expect([...m.byPiece.entries()]).toEqual([['f2', 'same.ldr#0']]);
    const sym = { ...same, symmetries: new Map([['3001.dat', [0, 2]]]) };
    expect([...matchToModel(sym, s).byPiece.entries()].sort()).toEqual([['f2', 'same.ldr#0'], ['f3', 'same.ldr#1']]);
    expect(occupiedView(s, m).placed).toEqual(['same.ldr#0']);
  });

  it('free → guided: recognised pieces kept on their target, others only removed on an explicit choice', () => {
    let s = placed(mini, free(), '4', at(0, 0, 0));
    s = placed(mini, s, '1', at(80, 0, 0));
    expect(toStepped(mini, s, 'guided')).toMatchObject({ ok: true, recognised: 2, dropped: 0, session: { mode: 'guided', placed: ['mini-4-pieces.mpd#0', 'mini-4-pieces.mpd#1'] } });
    const off = placed(mini, s, '2', at(300, 0, 300));
    expect(toStepped(mini, off, 'guided')).toEqual({ ok: false, reason: 'UNMATCHED', recognised: 2, unmatched: 1 });
    const r = toStepped(mini, off, 'guided', true);
    expect(r).toMatchObject({ ok: true, recognised: 2, dropped: 1 });
    if (r.ok) {
      expect(r.session.free).toBeUndefined();
      expect(activeStepIndex(mini, r.session)).toBe(1); // step 1 done, step 2 active
    }
    expect(() => switchMode(off, 'guided')).toThrow(); // never a silent switch
    expect(switchMode(createSession('guided'), 'freeManual').mode).toBe('freeManual');
  });

  it('library status: a stock used up in free mode is not a finished model', () => {
    expect(buildStatus(4, 4)).toBe('DONE');
    expect(buildStatus(4, 4, 1)).toBe('IN_PROGRESS');
    expect(buildStatus(4, 4, 4)).toBe('DONE');
    expect(buildStatus(0, 4, 0)).toBe('NOT_STARTED');
  });
});

describe('saves: v3 only with free pieces, older saves restored as they were', () => {
  it('without free piece the save stays v2, identical to before', () => {
    const now = new Date('2026-11-06T20:00:00Z');
    const s: BuildSession = { mode: 'freeManual', placed: ['mini-4-pieces.mpd#1'] };
    const v = serializeProgress(HASH, 'mini.mpd', s, 4, { page: 3 }, undefined, now);
    expect(v).toEqual({ schemaVersion: 2, modelContentHash: HASH, displayName: 'mini.mpd', buildMode: 'freeManual', placedOccurrenceIds: ['mini-4-pieces.mpd#1'], totalOccurrences: 4, lastPdfPage: 3, updatedAtIso: now.toISOString() });
    expect(serializeProgress(HASH, 'mini.mpd', { ...s, free: [] }, 4, { page: 3 }, undefined, now)).toEqual(v);
  });

  it('free pieces round-trip with their real position and rotation', () => {
    let s = placed(mini, free(), '4', at(412.5, -8, -260.25, 1));
    s = placed(mini, s, '14', at(-30, 16, 70, 3));
    const saved = JSON.parse(JSON.stringify(serializeProgress(HASH, 'mini.mpd', s, 4)));
    expect(saved.schemaVersion).toBe(3);
    expect(saved.freePieces[0]).toEqual({ id: 'f1', partKey: '3001.dat', colorCode: '4', pose: [412.5, -8, -260.25, 0, 0, 1, 0, 1, 0, -1, 0, 0] });
    const back = restoreProgress(saved, HASH, mini.occurrences);
    expect(back.ok && back.session).toEqual(s);
  });

  it('an older free build (identifiers only) is restored on its historical positions, no free position invented', () => {
    for (const schemaVersion of [1, 2]) {
      const old = { schemaVersion, modelContentHash: HASH, displayName: 'mini.mpd', buildMode: 'freeManual', placedOccurrenceIds: ['mini-4-pieces.mpd#3', 'mini-4-pieces.mpd#0'], totalOccurrences: 4, updatedAtIso: '2026-11-01T10:00:00.000Z' };
      const r = restoreProgress(old, HASH, mini.occurrences);
      expect(r.ok && r.session).toEqual({ mode: 'freeManual', placed: ['mini-4-pieces.mpd#3', 'mini-4-pieces.mpd#0'] });
    }
  });

  it('refuses untrusted free pieces: wrong mode or version, stock exceeded, bad pose, duplicate or unknown', () => {
    const base = JSON.parse(JSON.stringify(serializeProgress(HASH, 'mini.mpd', placed(mini, free(), '4', at(200, 0, 0)), 4)));
    const ok = restoreProgress(base, HASH, mini.occurrences);
    expect(ok.ok).toBe(true);
    const piece = base.freePieces[0];
    const bad = (patch: Record<string, unknown>) => restoreProgress({ ...base, ...patch }, HASH, mini.occurrences);
    expect(bad({ buildMode: 'guided' })).toEqual({ ok: false, reason: 'MALFORMED' });
    expect(bad({ schemaVersion: 2 })).toEqual({ ok: false, reason: 'MALFORMED' });
    expect(bad({ placedOccurrenceIds: ['mini-4-pieces.mpd#0'] })).toEqual({ ok: false, reason: 'MALFORMED' }); // red brick used twice
    expect(bad({ freePieces: [piece, { ...piece, id: 'f2' }] })).toEqual({ ok: false, reason: 'MALFORMED' });
    expect(bad({ freePieces: [piece, piece] })).toEqual({ ok: false, reason: 'MALFORMED' });
    expect(bad({ freePieces: [{ ...piece, colorCode: '15' }] })).toEqual({ ok: false, reason: 'MALFORMED' });
    expect(bad({ freePieces: [{ ...piece, id: '../x' }] })).toEqual({ ok: false, reason: 'MALFORMED' });
    expect(bad({ freePieces: [{ ...piece, pose: [0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 1] }] })).toEqual({ ok: false, reason: 'MALFORMED' });
    expect(bad({ freePieces: [{ ...piece, pose: [1e9, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] }] })).toEqual({ ok: false, reason: 'MALFORMED' });
    expect(bad({ freePieces: [{ ...piece, pose: [0, 0, 0] }] })).toEqual({ ok: false, reason: 'MALFORMED' });
    expect(bad({ freePieces: 'x' })).toEqual({ ok: false, reason: 'MALFORMED' });
    expect(bad({ freePieces: new Array(5).fill(piece) })).toEqual({ ok: false, reason: 'MALFORMED' });
  });

  it('library ↔ browser comparison sees a difference of free pieces', () => {
    const a = placed(mini, free(), '4', at(200, 0, 0));
    const b = placed(mini, free(), '4', at(220, 0, 0));
    const sa = summarise(serializeProgress(HASH, 'm', a, 4), HASH, mini.occurrences)!;
    const sb = summarise(serializeProgress(HASH, 'm', b, 4), HASH, mini.occurrences)!;
    expect(compareSaves(sa, sb).keys).toEqual(['free']);
    expect(saveSignature(sa)).not.toBe(saveSignature(sb));
    expect(compareSaves(sa, sa).keys).toEqual([]);
  });

  it('stored poses are the 12 numbers of an LDraw line', () => {
    expect(poseToLDraw(at(1.234, -2, 3, 1))).toEqual([1.23, -2, 3, 0, 0, 1, 0, 1, 0, -1, 0, 0]);
    expect(poseFromLDraw([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1])).toEqual(IDENTITY);
    expect(poseFromLDraw([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])).toBeNull();
  });
});

describe('free hover: surface, grid and magnet', () => {
  const held = (over: Partial<HeldState> = {}): HeldState => ({ partKey: '3001.dat', colorCode: '4', orientation: IDENTITY, quarterTurns: 0, layerY: 0, layerMode: 'auto', ...over });
  // the pointer ray, straight down through the hovered point
  const down = (hit: HoverHit): Ray => ({ origin: [hit.x, -1000, hit.z], direction: [0, 1, 0] });
  const BOTTOM = 24; // a 2×4 brick: its bottom is 24 LDU under its origin
  const opts = (s: BuildSession, over: Partial<{ grid: boolean; magnet: boolean }> = {}) => ({ groundY: 24, grid: true, magnet: true, occupied: occupiedView(s, matchToModel(mini, s)), ...over });

  it('on the ground far from any target: placed there, on the half-stud grid, nothing refused', () => {
    const hit: HoverHit = { kind: 'ground', x: 313, y: 24, z: -147 };
    const r = resolveFreeHover(mini, held(), down(hit), hit, BOTTOM, opts(free()))!;
    expect(r).toMatchObject({ source: 'free', targetId: null });
    expect([r.pose[12], r.pose[13], r.pose[14]]).toEqual([310, 0, -150]);
  });

  it('on top of a placed piece: stands on its body (studs ignored), aligned on its grid', () => {
    const s = placed(mini, free(), '4', at(205, 0, 15));
    for (const y of [0, -4]) { // body top, stud top
      const hit: HoverHit = { kind: 'solid', x: 214, y, z: 22, anchor: [205, 0, 15], up: true };
      const r = resolveFreeHover(mini, held({ colorCode: '1' }), down(hit), hit, BOTTOM, opts(s))!;
      expect([r.pose[12], r.pose[13], r.pose[14]]).toEqual([215, -24, 25]);
    }
  });

  it('pointing at the centre of a piece through its studs: the ray at the top of the body decides, not the stud', () => {
    const s = placed(mini, free(), '4', at(-60, 0, 80));
    // oblique ray aimed at the body top centre (-60, 0, 80), grazing a stud side on the way
    const ray: Ray = { origin: [-60 + 300, -300, 80 - 300], direction: [-1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)] };
    const hit: HoverHit = { kind: 'solid', x: -52.5, y: -2.5, z: 72.5, anchor: [-60, 0, 80], up: false };
    const r = resolveFreeHover(mini, held({ colorCode: '1' }), ray, hit, BOTTOM, opts(s))!;
    expect([r.pose[12], r.pose[13], r.pose[14]]).toEqual([-60, -24, 80]);
  });

  it('the model magnet snaps only very close to a free target, and can be turned off', () => {
    // the pointer is first snapped to the 5 LDU move grid (P5), then must be ≤ 6 LDU from the target
    const near: HoverHit = { kind: 'ground', x: 4, y: 24, z: 1 };
    const r = resolveFreeHover(mini, held(), down(near), near, BOTTOM, opts(free()))!;
    expect(r.targetId).toBe('mini-4-pieces.mpd#0');
    expect(resolveFreeHover(mini, held(), down(near), near, BOTTOM, opts(free(), { magnet: false }))!.targetId).toBeNull();
    // one grid step (half a stud) away: free, the magnet does not take it
    const step: HoverHit = { kind: 'ground', x: 10, y: 24, z: 0 };
    expect(FREE_TARGET_MAGNET.maxDistanceLdu).toBeLessThan(10);
    expect(resolveFreeHover(mini, held(), down(step), step, BOTTOM, opts(free()))).toMatchObject({ targetId: null });
    // a target already occupied by a free piece is not offered again
    const taken = placed(mini, free(), '4', at(0, 0, 0));
    expect(resolveFreeHover(mini, held(), down(near), near, BOTTOM, opts(taken))!.targetId).toBeNull();
  });

  it('without grid: 1 LDU and the exact surface height', () => {
    const hit: HoverHit = { kind: 'ground', x: 313.4, y: 24, z: -147.6 };
    const r = resolveFreeHover(mini, held(), down(hit), hit, BOTTOM, opts(free(), { grid: false }))!;
    expect([r.pose[12], r.pose[13], r.pose[14]]).toEqual([313, 0, -148]);
  });

  it('keeps the held orientation and quarter turns', () => {
    const hit: HoverHit = { kind: 'ground', x: 300, y: 24, z: 0 };
    const r = resolveFreeHover(mini, held({ quarterTurns: 1 }), down(hit), hit, BOTTOM, opts(free()))!;
    expect(r.pose).toEqual(heldPose(IDENTITY, 1, [300, 0, 0]));
  });
});

describe('free height, independent of the model levels', () => {
  const held = (over: Partial<HeldState> = {}): HeldState => ({ partKey: '3001.dat', colorCode: '4', orientation: IDENTITY, quarterTurns: 0, layerY: 0, layerMode: 'auto', ...over });
  const down = (x: number, z: number): Ray => ({ origin: [x, -1000, z], direction: [0, 1, 0] });
  const opts = (s: BuildSession, over: Record<string, unknown> = {}) => ({ groundY: 24, grid: true, magnet: true, occupied: occupiedView(s, matchToModel(mini, s)), ...over });

  it('steps of a plate (8 LDU) and of 1 LDU, up or down (LDraw -Y is up)', () => {
    expect(liftedY(-24, 1)).toBe(-32);
    expect(liftedY(-24, -1)).toBe(-16);
    expect(liftedY(-24, 1, 1)).toBe(-25);
    expect(liftedY(17.41, -2, 1)).toBe(19.41);
  });

  it('a manual height that is no model level is kept while the piece follows the pointer', () => {
    // model levels of mini-4-pieces: y = 0 and y = -24; chosen: 11 (a piece 13 LDU into the ground)
    for (const [x, z] of [[300, 0], [-200, 140]] as const) {
      const r = resolveFreeHover(mini, held({ layerMode: 'manual', layerY: 11 }), down(x, z), { kind: 'ground', x, y: 24, z }, 24, opts(free()))!;
      expect([r.pose[12], r.pose[13], r.pose[14]]).toEqual([x, 11, z]);
      expect(r.source).toBe('manual');
    }
  });

  it('lower than the automatic placement can go: on top of a piece auto stops at its top, manual goes below', () => {
    const s = placed(mini, free(), '4', at(200, 0, 0));
    const onTop: HoverHit = { kind: 'solid', x: 200, y: 0, z: 0, anchor: [200, 0, 0], up: true };
    const auto = resolveFreeHover(mini, held({ colorCode: '1' }), down(200, 0), onTop, 24, opts(s))!;
    expect(auto.pose[13]).toBe(-24); // resting on the red brick
    const manual = resolveFreeHover(mini, held({ colorCode: '1', layerMode: 'manual', layerY: liftedY(-24, -3, 1) }), down(200, 0), onTop, 24, opts(s))!;
    expect(manual.pose[13]).toBe(-21); // 3 LDU lower: overlapping the brick below, impossible in auto
  });

  it('after a height change the piece goes straight up or down (fixed position until the pointer moves)', () => {
    const r = resolveFreeHover(mini, held({ layerMode: 'manual', layerY: -40 }), down(999, 999), null, 24, opts(free(), { fixedXZ: [130, -70] }))!;
    expect([r.pose[12], r.pose[13], r.pose[14]]).toEqual([130, -40, -70]);
  });

  it('the model magnet never changes a manual height: it only snaps on a spot at that height', () => {
    const near: HoverHit = { kind: 'ground', x: 4, y: 24, z: 1 };
    expect(resolveFreeHover(mini, held({ layerMode: 'manual', layerY: 0 }), down(4, 1), near, 24, opts(free()))!.targetId).toBe('mini-4-pieces.mpd#0');
    const r = resolveFreeHover(mini, held({ layerMode: 'manual', layerY: 3 }), down(4, 1), near, 24, opts(free()))!;
    expect(r.targetId).toBeNull();
    expect(r.pose[13]).toBe(3);
  });
});

describe('groups: several pieces moved as one rigid object', () => {
  const three = () => {
    let s = placed(same, free(), '4', at(200, 0, 0));
    s = placed(same, s, '4', at(260, 0, 0, 1));
    s = placed(same, s, '4', at(200, -24, 20));
    return s;
  };
  const membersOf = (s: BuildSession) => s.free!.map((f) => ({ ref: { kind: 'free' as const, id: f.id }, partKey: f.partKey, colorCode: f.colorCode, pose: f.pose, bottom: 24 }));
  const dist = (a: Matrix4Tuple, b: Matrix4Tuple) => Math.hypot(a[12] - b[12], a[13] - b[13], a[14] - b[14]);
  const relRot = (a: Matrix4Tuple, b: Matrix4Tuple) => rotationAngleDeg(a, b);

  it('pivot: centre of the pieces on the grid, at the lowest point; at home the poses are unchanged', () => {
    const s = three();
    const g = makeGroup(membersOf(s));
    expect(g.pivot).toEqual([230, 24, 10]);
    expect(groupPoses(g, 0, g.pivot)).toEqual(s.free!.map((f) => f.pose));
  });

  it('three bricks moved together keep their relative positions; ids and stock unchanged; one action', () => {
    const s = three();
    const g = makeGroup(membersOf(s));
    const poses = groupPoses(g, 0, [g.pivot[0] - 400, g.pivot[1] - 8, g.pivot[2] + 100]);
    const r = moveGroup(same, s, g.members.map((m, i) => ({ ref: m.ref, pose: poses[i]! })));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.session.free!.map((f) => f.id)).toEqual(['f1', 'f2', 'f3']);
    expect(r.session.free!.map((f) => [f.pose[12], f.pose[13], f.pose[14]])).toEqual([[-200, -8, 100], [-140, -8, 100], [-200, -32, 120]]);
    expect(stockLeft(same, r.session, '3001.dat', '4')).toBe(stockLeft(same, s, '3001.dat', '4'));
    expect(usedCount(r.session)).toBe(3);
  });

  it('a group turned a quarter keeps every distance and relative orientation', () => {
    const s = three();
    const g = makeGroup(membersOf(s));
    const poses = groupPoses(g, 1, [0, 24, 0]);
    const before = s.free!.map((f) => f.pose);
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        expect(dist(poses[i]!, poses[j]!)).toBeCloseTo(dist(before[i]!, before[j]!), 9);
        expect(relRot(poses[i]!, poses[j]!)).toBeCloseTo(relRot(before[i]!, before[j]!), 6);
      }
    }
    expect(poses.every((p) => isRigidPose(p))).toBe(true);
    expect(rotationAngleDeg(poses[0]!, before[0]!)).toBeCloseTo(90, 6);
  });

  it('all or nothing: one bad pose or one unknown piece and nothing moves', () => {
    const s = three();
    const g = makeGroup(membersOf(s));
    const poses = groupPoses(g, 0, [0, 24, 0]);
    const scaled = [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as unknown as Matrix4Tuple;
    const moves = g.members.map((m, i) => ({ ref: m.ref, pose: i === 2 ? scaled : poses[i]! }));
    expect(moveGroup(same, s, moves)).toEqual({ ok: false, reason: 'INVALID_POSE' });
    expect(moveGroup(same, s, [...g.members.map((m, i) => ({ ref: m.ref, pose: poses[i]! })), { ref: { kind: 'free', id: 'f9' }, pose: poses[0]! }])).toEqual({ ok: false, reason: 'UNKNOWN_PIECE' });
    expect(moveGroup(same, s, [{ ref: g.members[0]!.ref, pose: poses[0]! }, { ref: g.members[0]!.ref, pose: poses[1]! }])).toEqual({ ok: false, reason: 'UNKNOWN_PIECE' });
    expect(moveGroup(same, { ...s, mode: 'guided' }, [])).toEqual({ ok: false, reason: 'NOT_FREE_MODE' });
  });

  it('a group with a piece of an older build: that piece becomes free, the others keep their id', () => {
    const s: BuildSession = { mode: 'freeManual', placed: ['same.ldr#0'], free: [{ id: 'f4', partKey: '3001.dat', colorCode: '4', pose: at(300, 0, 0) }] };
    const g = makeGroup([
      { ref: { kind: 'anchored', occurrenceId: 'same.ldr#0' }, partKey: '3001.dat', colorCode: '4', pose: same.occurrences[0]!.targetMatrix, bottom: 24 },
      { ref: { kind: 'free', id: 'f4' }, partKey: '3001.dat', colorCode: '4', pose: at(300, 0, 0), bottom: 24 },
    ]);
    const poses = groupPoses(g, 0, [g.pivot[0], g.pivot[1], g.pivot[2] + 200]);
    const r = moveGroup(same, s, g.members.map((m, i) => ({ ref: m.ref, pose: poses[i]! })));
    expect(r.ok && r.refs).toEqual([{ kind: 'free', id: 'f5' }, { kind: 'free', id: 'f4' }]);
    expect(r.ok && r.session.placed).toEqual([]);
    expect(r.ok && usedCount(r.session)).toBe(2);
  });

  it('a moved group is saved in the current format and restored with the same poses', () => {
    const s = three();
    const g = makeGroup(membersOf(s));
    const poses = groupPoses(g, 3, [-60, 16, 90]);
    const r = moveGroup(same, s, g.members.map((m, i) => ({ ref: m.ref, pose: poses[i]! })));
    if (!r.ok) throw new Error(r.reason);
    const saved = JSON.parse(JSON.stringify(serializeProgress(HASH, 'same.ldr', r.session, 3)));
    expect(saved.schemaVersion).toBe(3);
    const back = restoreProgress(saved, HASH, same.occurrences);
    expect(back.ok && back.session).toEqual(r.session);
    expect(removePieces(r.session, r.refs).free).toEqual([]);
  });
});

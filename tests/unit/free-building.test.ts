import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { activeStepIndex, createSession, heldPose, switchMode, tray, tryPlace, type BuildContext, type BuildSession } from '@/domain/build/engine';
import {
  FREE_TARGET_MAGNET, atModelCount, groupPoses, isRigidPose, isStockExhausted, liftedY, makeGroup, matchToModel, moveGroup, movePiece, occupiedView,
  addToSelection, placeFree, poseFromLDraw, poseToLDraw, removeLast, removePiece, removePieces, resolveFreeHover, stockLeft, toStepped, usedCount,
  groupBottom, orientationLabel, quarterTurn, rotateOrientation, rotatedInPlace, snapAlong, applyDelta, shownCoords, deltaTo,
  axisTurn, cleanPose, isRotationStep, ROTATION_STEPS_DEG,
} from '@/domain/build/free';
import { restoreProgress, serializeProgress } from '@/domain/build/progress';
import { bottomExtent, type HeldState, type HoverHit, type Ray } from '@/domain/build/surface';
import { analyzeModel } from '@/domain/import/analyze';
import { compareSaves, saveSignature, summarise } from '@/domain/library/save-compare';
import { buildStatus } from '@/domain/library/types';
import { IDENTITY, multiply, rotationAngleDeg, rotationY, withTranslation } from '@/domain/ldraw/matrix';
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

describe('A — rotations on X, Y and Z (free mode)', () => {
  // the owner's red 32062 axle as placed in 31039: lying, its length (local X) along world Z
  const LYING: Matrix4Tuple = poseFromLDraw([280, 35.41, -160, 0, 0, -1, 0, 1, 0, 1, 0, 0])!;
  const lengthAxis = (m: Matrix4Tuple) => [m[0], m[1], m[2]];

  it('a quarter turn around X puts the lying axle upright; the rotation is exact and stored exactly', () => {
    const up = rotateOrientation(LYING, 'x', 1);
    expect(lengthAxis(up)).toEqual([0, -1, 0]); // vertical (LDraw -Y is up)
    const pose = withTranslation(up, [280, 20, -160]);
    expect(isRigidPose(pose)).toBe(true);
    expect(poseFromLDraw(poseToLDraw(pose))).toEqual(pose);
    expect(lengthAxis(rotateOrientation(LYING, 'x', -1))).toEqual([0, 1, 0]);
  });

  it('X, Y and Z each turn a quarter; four turns come back; no drift after 1 000 random turns', () => {
    for (const axis of ['x', 'y', 'z'] as const) {
      let m: Matrix4Tuple = IDENTITY;
      for (let i = 0; i < 4; i++) m = rotateOrientation(m, axis, 1);
      expect(m).toEqual(IDENTITY);
      expect(rotateOrientation(rotateOrientation(IDENTITY, axis, 1), axis, -1)).toEqual(IDENTITY);
    }
    let m: Matrix4Tuple = IDENTITY;
    let seed = 7;
    for (let i = 0; i < 1000; i++) {
      seed = (seed * 48271) % 2147483647;
      m = rotateOrientation(m, (['x', 'y', 'z'] as const)[seed % 3]!, seed % 2 ? 1 : -1);
    }
    expect([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]].every((v) => v === 0 || v === 1 || v === -1)).toBe(true);
    expect(isRigidPose(m)).toBe(true);
  });

  it('the orientation in words: where the top and the front of the piece point', () => {
    expect(orientationLabel(IDENTITY)).toEqual({ top: 'haut', front: '−Z' });
    expect(orientationLabel(rotateOrientation(IDENTITY, 'x', 1))).toEqual({ top: '−Z', front: 'bas' }); // right-hand rule
    expect(orientationLabel(rotateOrientation(IDENTITY, 'z', 1)).top).toBe('+X');
    expect(orientationLabel(rotateOrientation(IDENTITY, 'x', 2)).top).toBe('bas');
  });

  it('a group turned around X keeps every distance and relative orientation, and rests by its new lowest point', () => {
    let s = placed(same, free(), '4', at(200, 0, 0));
    s = placed(same, s, '4', at(200, -24, 0));
    s = placed(same, s, '4', at(260, 0, 0, 1));
    const members = s.free!.map((f) => ({ ref: { kind: 'free' as const, id: f.id }, partKey: f.partKey, colorCode: f.colorCode, pose: f.pose, bottom: 24 }));
    const g = makeGroup(members);
    // a 2 × 4 brick: its lowest point under its origin for a rotation (vertices of its box)
    const box = [-40, -4, -20, 40, -4, -20, -40, 24, 20, 40, 24, 20, -40, 24, -20, 40, -4, 20];
    const bottomFn = (_m: unknown, r: Matrix4Tuple) => bottomExtent(box, r);
    const turn = quarterTurn('x', 1);
    const poses = rotatedInPlace(g, turn, bottomFn);
    const before = s.free!.map((f) => f.pose);
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        expect(Math.hypot(poses[i]![12] - poses[j]![12], poses[i]![13] - poses[j]![13], poses[i]![14] - poses[j]![14]))
          .toBeCloseTo(Math.hypot(before[i]![12] - before[j]![12], before[i]![13] - before[j]![13], before[i]![14] - before[j]![14]), 9);
        expect(rotationAngleDeg(poses[i]!, poses[j]!)).toBeCloseTo(rotationAngleDeg(before[i]!, before[j]!), 6);
      }
    }
    // lowest point kept (in place)
    const low = (ps: Matrix4Tuple[]) => Math.max(...ps.map((p) => p[13] + bottomExtent(box, p)));
    expect(low(poses)).toBeCloseTo(low(before), 6);
    expect(groupBottom(g, IDENTITY, bottomFn)).toBeCloseTo(0, 9);
    // atomic, stock unchanged
    const r = moveGroup(same, s, g.members.map((m, i) => ({ ref: m.ref, pose: poses[i]! })));
    expect(r.ok && usedCount(r.session)).toBe(3);
  });
});

describe('rotation to the degree (free mode)', () => {
  const rot = (m: Matrix4Tuple) => [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  const orthoError = (m: Matrix4Tuple) => {
    const c = (i: number) => [m[i * 4]!, m[i * 4 + 1]!, m[i * 4 + 2]!];
    const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
    return Math.max(...[0, 1, 2].map((i) => Math.abs(dot(c(i), c(i)) - 1)), Math.abs(dot(c(0), c(1))), Math.abs(dot(c(1), c(2))), Math.abs(dot(c(0), c(2))));
  };

  it('the steps offered go from the quarter turn down to one degree; anything else is refused', () => {
    expect([...ROTATION_STEPS_DEG]).toEqual([90, 45, 15, 5, 1]);
    expect(isRotationStep(1)).toBe(true);
    expect(isRotationStep(7)).toBe(false);
    expect(isRotationStep(Number.NaN)).toBe(false);
  });

  it('a multiple of 90° is the exact quarter turn; any other angle turns by exactly that angle, in the same sense', () => {
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(axisTurn(axis, 90)).toEqual(quarterTurn(axis, 1));
      expect(axisTurn(axis, -270)).toEqual(quarterTurn(axis, 1));
      expect(rotationAngleDeg(IDENTITY, axisTurn(axis, 1))).toBeCloseTo(1, 9);
      expect(rotationAngleDeg(IDENTITY, axisTurn(axis, 37))).toBeCloseTo(37, 9);
      // three times 30° = the quarter turn (same sense as the ± buttons had)
      const thrice = multiply(axisTurn(axis, 30), multiply(axisTurn(axis, 30), axisTurn(axis, 30)));
      rot(thrice).forEach((v, i) => expect(v).toBeCloseTo(rot(quarterTurn(axis, 1))[i]!, 12));
    }
    expect(() => axisTurn('y', Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('turning 1° at a time: 37 steps = 37°, 360 steps come back to the start exactly', () => {
    for (const axis of ['x', 'y', 'z'] as const) {
      let m: Matrix4Tuple = IDENTITY;
      for (let i = 0; i < 37; i++) m = rotateOrientation(m, axis, 1, 1);
      expect(rotationAngleDeg(IDENTITY, m)).toBeCloseTo(37, 6);
      for (let i = 37; i < 360; i++) m = rotateOrientation(m, axis, 1, 1);
      expect(m).toEqual(IDENTITY);
      expect(rotateOrientation(rotateOrientation(IDENTITY, axis, 1, 5), axis, -1, 5)).toEqual(IDENTITY);
    }
  });

  it('no drift: 3 600 random 1° turns, each stored and read back, stay a rigid pose', () => {
    let pose = at(100, -24, 40);
    let seed = 11;
    for (let i = 0; i < 3600; i++) {
      seed = (seed * 48271) % 2147483647;
      const turned = rotateOrientation(pose, (['x', 'y', 'z'] as const)[seed % 3]!, seed % 2 ? 1 : -1, 1);
      const back = poseFromLDraw(poseToLDraw(withTranslation(turned, [100, -24, 40])));
      expect(back).not.toBeNull();
      pose = back!;
    }
    expect(isRigidPose(pose)).toBe(true);
    expect(orthoError(pose)).toBeLessThan(1e-5);
  });

  it('cleaning a pose never turns a mirror into a rotation nor touches a scaled part of a model', () => {
    const mirror: Matrix4Tuple = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1];
    expect(cleanPose(mirror)).toEqual(mirror);
    const scaled: Matrix4Tuple = [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1];
    expect(cleanPose(scaled)).toEqual(scaled);
    // a slightly noisy rotation comes out orthonormal
    const n: number[] = [...axisTurn('y', 1)];
    n[0] = n[0]! + 1e-5;
    const noisy = n as unknown as Matrix4Tuple;
    expect(orthoError(cleanPose(noisy))).toBeLessThan(1e-12);
  });

  it('a group turned 1° in place keeps every distance and rests by its lowest point; the move is accepted', () => {
    let s = placed(same, free(), '4', at(200, 0, 0));
    s = placed(same, s, '4', at(260, 0, 0, 1));
    const members = s.free!.map((f) => ({ ref: { kind: 'free' as const, id: f.id }, partKey: f.partKey, colorCode: f.colorCode, pose: f.pose, bottom: 24 }));
    const g = makeGroup(members);
    const box = [-40, -4, -20, 40, -4, -20, -40, 24, 20, 40, 24, 20, -40, 24, -20, 40, -4, 20];
    const bottomFn = (_m: unknown, r: Matrix4Tuple) => bottomExtent(box, r);
    const poses = rotatedInPlace(g, axisTurn('y', 1), bottomFn);
    const d = (a: Matrix4Tuple, b: Matrix4Tuple) => Math.hypot(a[12] - b[12], a[13] - b[13], a[14] - b[14]);
    expect(d(poses[0]!, poses[1]!)).toBeCloseTo(d(s.free![0]!.pose, s.free![1]!.pose), 9);
    expect(rotationAngleDeg(s.free![0]!.pose, poses[0]!)).toBeCloseTo(1, 6);
    const r = moveGroup(same, s, g.members.map((m, i) => ({ ref: m.ref, pose: poses[i]! })));
    expect(r.ok).toBe(true);
    // stored (coefficients at 1e-6): the yaw read back by atan2 is still 1° (acos is too blunt near 0°)
    const yaw = (m: Matrix4Tuple) => (Math.atan2(m[8], m[0]) * 180) / Math.PI;
    if (r.ok) expect(yaw(r.session.free![0]!.pose) - yaw(s.free![0]!.pose)).toBeCloseTo(1, 4);
  });
});

describe('selection: one more assembly (Shift + double-click)', () => {
  const f = (id: string) => ({ kind: 'free' as const, id });
  const a = (occurrenceId: string) => ({ kind: 'anchored' as const, occurrenceId });
  it('keeps the current selection, in order, and adds only the pieces it does not hold', () => {
    expect(addToSelection([f('f1'), a('o2')], [a('o2'), f('f3'), f('f1'), a('o4')])).toEqual([f('f1'), a('o2'), f('f3'), a('o4')]);
    expect(addToSelection([], [f('f3')])).toEqual([f('f3')]);
    expect(addToSelection([f('f1')], [])).toEqual([f('f1')]);
    // a free piece and an anchored occurrence with the same name are different pieces
    expect(addToSelection([f('x')], [a('x')])).toEqual([f('x'), a('x')]);
  });
});

describe('transform gizmo: constrained moves, relative steps, shown coordinates', () => {
  it('a move along X is cut into steps FROM THE START; the other coordinates never change', () => {
    expect(snapAlong([70, 17.41, -70], [113.6, 17.41, -70], [[1, 0, 0]], () => 10)).toEqual([110, 17.41, -70]);
    // Y (LDraw -Y up) by one plate from 17.41: 9.41, never an absolute rounding
    expect(snapAlong([70, 17.41, -70], [70, 8.2, -70], [[0, -1, 0]], (a) => (Math.abs(a[1]) > 0.9 ? 8 : 10))).toEqual([70, 9.41, -70]);
    // a drift off the dragged axis (rounding of the gizmo) is not taken
    expect(snapAlong([70, 17.41, -70], [113.6, 17.6, -69.7], [[1, 0, 0]], () => 10)).toEqual([110, 17.41, -70]);
    // free (⌥): the exact projection
    expect(snapAlong([0, 0, 0], [13.73, 0, 0], [[1, 0, 0]], () => null)).toEqual([13.73, 0, 0]);
    // along a local axis (a piece turned 90° around Y): its X is the world -Z
    expect(snapAlong([0, 0, 0], [0, 0, -18], [[0, 0, -1]], () => 10)).toEqual([0, 0, -20]);
  });

  it('a group transform keeps every relative pose exactly; rotations are cleaned', () => {
    const poses = [at(70, 17.41, -70), at(70, 25.41, -60, 2), at(70, 33.41, -10, 1)];
    const turn = withTranslation(quarterTurn('y', 1), [0, 0, 0]);
    // pivot at (70, 33.41, -10): delta = T(p) · R · T(-p)
    const delta = multiply(withTranslation(IDENTITY, [70, 33.41, -10]), multiply(turn, withTranslation(IDENTITY, [-70, -33.41, 10])));
    const out = applyDelta(delta, poses);
    expect(out.every((m) => isRigidPose(m) && [0, 1, 2, 4, 5, 6, 8, 9, 10].every((i) => Number.isInteger(m[i])))).toBe(true);
    const d = (a: Matrix4Tuple, b: Matrix4Tuple) => Math.hypot(a[12] - b[12], a[13] - b[13], a[14] - b[14]);
    expect(d(out[0]!, out[1]!)).toBeCloseTo(d(poses[0]!, poses[1]!), 9);
    expect(rotationAngleDeg(out[0]!, out[2]!)).toBeCloseTo(rotationAngleDeg(poses[0]!, poses[2]!), 6);
    expect(out[2]!.slice(12, 15)).toEqual([70, 33.41, -10]); // the pivot itself does not move
  });

  it('shown coordinates match the arrows (Y = height above the ground, Z = -LDraw z); typed ones go back exactly', () => {
    const pivot = at(70, 17.41, -70);
    expect(shownCoords(pivot, 41.41)).toEqual([70, 24, 70]);
    const delta = deltaTo(pivot, [100, 32, -40], 41.41);
    expect(applyDelta(delta, [pivot])[0]!.slice(12, 15)).toEqual([100, 9.41, 40]);
    expect(shownCoords(applyDelta(delta, [pivot])[0]!, 41.41)).toEqual([100, 32, -40]);
  });
});

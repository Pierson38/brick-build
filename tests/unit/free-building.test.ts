import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { activeStepIndex, createSession, heldPose, switchMode, tray, tryPlace, type BuildContext, type BuildSession } from '@/domain/build/engine';
import {
  FREE_TARGET_MAGNET, atModelCount, isRigidPose, isStockExhausted, matchToModel, movePiece, occupiedView, placeFree, poseFromLDraw, poseToLDraw,
  removeLast, removePiece, resolveFreeHover, stockLeft, toStepped, usedCount,
} from '@/domain/build/free';
import { restoreProgress, serializeProgress } from '@/domain/build/progress';
import type { HeldState, HoverHit, Ray } from '@/domain/build/surface';
import { analyzeModel } from '@/domain/import/analyze';
import { compareSaves, saveSignature, summarise } from '@/domain/library/save-compare';
import { buildStatus } from '@/domain/library/types';
import { IDENTITY, rotationY, withTranslation } from '@/domain/ldraw/matrix';
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

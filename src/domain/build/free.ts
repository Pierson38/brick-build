import { determinant3, distance, fromLDraw, IDENTITY, multiply, rotationAngleDeg, rotationY, withTranslation } from '../ldraw/matrix';
import { equivalentTargets } from '../ldraw/symmetry';
import type { BrickOccurrence, Matrix4Tuple } from '../ldraw/types';
import {
  DEFAULT_TOLERANCES, heldPose, trayKey, tryPlace, undo, type BuildContext, type BuildMode, type BuildSession, type FreePiece, type SnapTolerances,
} from './engine';
import { resolveHover, type HeldState, type HoverHit, type HoverResolution, type Ray } from './surface';

/**
 * True free building (owner's decision, 06/11/2026): in the free mode a piece taken from the set's
 * stock is placed where the player points, at its real pose, with no mandatory comparison with the
 * model targets. The target of the model (`targetMatrix`) and the pose chosen by the player are two
 * different things: the guided and synchronised modes keep validating against the targets
 * (engine.ts, unchanged); here the targets only serve as an optional magnet and as information.
 * Pure functions, LDraw coordinates (-Y up). No physics: no collision, no stud fitting check.
 */

/**
 * Magnet onto a free model target: strictly below the grid step (10), so a piece can always be put
 * half a stud away from its model place. Found by the P5 surface suite: a ray grazing a stud lands
 * the pointer 7 LDU from the spot, hence not lower.
 */
export const FREE_TARGET_MAGNET: SnapTolerances = { maxDistanceLdu: 9.5, maxAngleDeg: 10, ambiguityLdu: 1 };
/** Horizontal grid of the free mode: half a stud. */
export const FREE_GRID_LDU = 10;
/** Vertical levels above the ground: one plate. */
export const PLATE_LDU = 8;
/** A stud stands 4 LDU above the top of a body: pointing at it means "on top of this piece". */
const STUD_LDU = 4;
/** Bound on stored coordinates (untrusted saves). */
export const MAX_COORD_LDU = 100_000;
/** Manual height of the held piece: one plate, or 1 LDU for fine adjustment. */
export const HEIGHT_STEP_LDU = 8;
export const FINE_HEIGHT_STEP_LDU = 1;
/** In manual height, the model magnet only snaps horizontally, on a spot at the chosen height. */
const SAME_HEIGHT_LDU = 0.5;

export type PieceRef =
  | { readonly kind: 'anchored'; readonly occurrenceId: string }
  | { readonly kind: 'free'; readonly id: string };

export const freePiecesOf = (session: BuildSession): readonly FreePiece[] => session.free ?? [];

/** Pieces taken from the stock: on a model target or free. */
export const usedCount = (session: BuildSession): number => session.placed.length + freePiecesOf(session).length;

/** Pieces of a reference + colour still in the stock. */
export function stockLeft(ctx: BuildContext, session: BuildSession, partKey: string, colorCode: string): number {
  const key = trayKey(partKey, colorCode);
  const anchored = new Set(session.placed);
  let left = 0;
  for (const o of ctx.occurrences) if (trayKey(o.partKey, o.colorCode) === key && !anchored.has(o.occurrenceId)) left += 1;
  for (const f of freePiecesOf(session)) if (trayKey(f.partKey, f.colorCode) === key) left -= 1;
  return left;
}

export const isStockExhausted = (ctx: BuildContext, session: BuildSession): boolean => usedCount(session) >= ctx.occurrences.length;

/** A rigid pose: finite, bounded, orthonormal rotation without mirror. */
export function isRigidPose(m: readonly number[]): boolean {
  if (m.length !== 16 || !m.every(Number.isFinite)) return false;
  if (m[3] !== 0 || m[7] !== 0 || m[11] !== 0 || m[15] !== 1) return false;
  if ([m[12]!, m[13]!, m[14]!].some((v) => Math.abs(v) > MAX_COORD_LDU)) return false;
  const col = (c: number) => [m[c * 4]!, m[c * 4 + 1]!, m[c * 4 + 2]!];
  const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const [x, y, z] = [col(0), col(1), col(2)];
  const tol = 1e-3;
  if ([x, y, z].some((v) => Math.abs(dot(v, v) - 1) > tol)) return false;
  if (Math.abs(dot(x, y)) > tol || Math.abs(dot(y, z)) > tol || Math.abs(dot(x, z)) > tol) return false;
  return determinant3(m as unknown as Matrix4Tuple) > 0;
}

const round = (v: number, step: number) => {
  const r = Math.round(v / step) * step;
  return Object.is(r, -0) ? 0 : Number(r.toFixed(step < 1 ? Math.round(-Math.log10(step)) : 0));
};

/** Stored form of a pose: the 12 numbers of an LDraw type-1 line (x y z a b c d e f g h i). */
export function poseToLDraw(m: Matrix4Tuple): number[] {
  const t = (v: number) => round(v, 0.01);
  const r = (v: number) => round(v, 1e-6);
  return [t(m[12]), t(m[13]), t(m[14]), r(m[0]), r(m[4]), r(m[8]), r(m[1]), r(m[5]), r(m[9]), r(m[2]), r(m[6]), r(m[10])];
}

export function poseFromLDraw(values: readonly number[]): Matrix4Tuple | null {
  if (values.length !== 12 || !values.every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  const m = fromLDraw(values);
  return isRigidPose(m) ? m : null;
}

function nextFreeId(session: BuildSession): string {
  let max = 0;
  for (const f of freePiecesOf(session)) max = Math.max(max, Number(/^f(\d+)$/.exec(f.id)?.[1] ?? 0));
  return `f${max + 1}`;
}

export type FreeFailure = 'NOT_FREE_MODE' | 'NO_STOCK' | 'UNKNOWN_PIECE' | 'INVALID_POSE';
export type FreeResult =
  | { readonly ok: true; readonly session: BuildSession; readonly pieceId: string }
  | { readonly ok: false; readonly reason: FreeFailure };

const stored = (pose: Matrix4Tuple): Matrix4Tuple => fromLDraw(poseToLDraw(pose));

/** Places a piece of the stock at `pose`, wherever it is. Refused only without stock (or out of the free mode). */
export function placeFree(ctx: BuildContext, session: BuildSession, held: { readonly partKey: string; readonly colorCode: string }, pose: Matrix4Tuple): FreeResult {
  if (session.mode !== 'freeManual') return { ok: false, reason: 'NOT_FREE_MODE' };
  if (!isRigidPose(pose)) return { ok: false, reason: 'INVALID_POSE' };
  if (stockLeft(ctx, session, held.partKey, held.colorCode) <= 0) return { ok: false, reason: 'NO_STOCK' };
  const piece: FreePiece = { id: nextFreeId(session), partKey: held.partKey, colorCode: held.colorCode, pose: stored(pose) };
  return { ok: true, pieceId: piece.id, session: { ...session, free: [...freePiecesOf(session), piece] } };
}

/** Current pose of a placed piece (an anchored one is at its target). */
export function poseOf(ctx: BuildContext, session: BuildSession, ref: PieceRef): Matrix4Tuple | null {
  if (ref.kind === 'free') return freePiecesOf(session).find((f) => f.id === ref.id)?.pose ?? null;
  if (!session.placed.includes(ref.occurrenceId)) return null;
  return ctx.occurrences.find((o) => o.occurrenceId === ref.occurrenceId)?.targetMatrix ?? null;
}

/** Reference + colour of a placed piece. */
export function pieceKind(ctx: BuildContext, session: BuildSession, ref: PieceRef): { partKey: string; colorCode: string } | null {
  const p = ref.kind === 'free' ? freePiecesOf(session).find((f) => f.id === ref.id) : ctx.occurrences.find((o) => o.occurrenceId === ref.occurrenceId);
  return p ? { partKey: p.partKey, colorCode: p.colorCode } : null;
}

/**
 * Moves (or turns) a placed piece to `pose`. A piece that was on its model target becomes a free
 * piece: it is no longer where the model puts it. The stock is unchanged.
 */
export function movePiece(ctx: BuildContext, session: BuildSession, ref: PieceRef, pose: Matrix4Tuple): FreeResult {
  if (session.mode !== 'freeManual') return { ok: false, reason: 'NOT_FREE_MODE' };
  if (!isRigidPose(pose)) return { ok: false, reason: 'INVALID_POSE' };
  if (ref.kind === 'free') {
    const free = freePiecesOf(session);
    if (!free.some((f) => f.id === ref.id)) return { ok: false, reason: 'UNKNOWN_PIECE' };
    return { ok: true, pieceId: ref.id, session: { ...session, free: free.map((f) => (f.id === ref.id ? { ...f, pose: stored(pose) } : f)) } };
  }
  const o = ctx.occurrences.find((x) => x.occurrenceId === ref.occurrenceId);
  if (!o || !session.placed.includes(o.occurrenceId)) return { ok: false, reason: 'UNKNOWN_PIECE' };
  const without = { ...session, placed: session.placed.filter((id) => id !== o.occurrenceId) };
  return placeFree(ctx, without, o, pose);
}

/** Puts a placed piece back into the stock. */
export function removePiece(session: BuildSession, ref: PieceRef): BuildSession {
  if (ref.kind === 'free') return { ...session, free: freePiecesOf(session).filter((f) => f.id !== ref.id) };
  return { ...session, placed: session.placed.filter((id) => id !== ref.occurrenceId) };
}

/** Undo without an action history (after a reload): the last free piece, else the last anchored one. */
export function removeLast(session: BuildSession): BuildSession {
  const free = freePiecesOf(session);
  return free.length > 0 ? { ...session, free: free.slice(0, -1) } : undo(session);
}

export interface ModelMatch {
  /** Free piece id → occurrence whose target it occupies (within the guided tolerances). */
  readonly byPiece: ReadonlyMap<string, string>;
  readonly unmatched: readonly FreePiece[];
}

/**
 * Which free pieces stand where the model puts a piece of the same reference + colour (same rule as
 * tryPlace: ≤ 10 LDU, ≤ 10°, symmetries of the part). Each occurrence is taken once, nearest first.
 * Computed on demand, never stored: it is information, not a constraint.
 */
export function matchToModel(ctx: Pick<BuildContext, 'occurrences' | 'symmetries'>, session: BuildSession, tolerances: SnapTolerances = DEFAULT_TOLERANCES): ModelMatch {
  const free = freePiecesOf(session);
  if (free.length === 0) return { byPiece: new Map(), unmatched: [] };
  const anchored = new Set(session.placed);
  const open = new Map<string, BrickOccurrence[]>();
  for (const o of ctx.occurrences) {
    if (anchored.has(o.occurrenceId)) continue;
    const key = trayKey(o.partKey, o.colorCode);
    open.set(key, [...(open.get(key) ?? []), o]);
  }
  const pairs: { piece: string; occurrence: string; d: number; order: number }[] = [];
  free.forEach((f, order) => {
    const symmetries = ctx.symmetries?.get(f.partKey) ?? [0];
    for (const o of open.get(trayKey(f.partKey, f.colorCode)) ?? []) {
      const d = distance(f.pose, o.targetMatrix);
      if (d > tolerances.maxDistanceLdu) continue;
      const a = Math.min(...equivalentTargets(o.targetMatrix, symmetries).map((t) => rotationAngleDeg(f.pose, t)));
      if (a <= tolerances.maxAngleDeg) pairs.push({ piece: f.id, occurrence: o.occurrenceId, d, order });
    }
  });
  pairs.sort((a, b) => a.d - b.d || a.order - b.order);
  const byPiece = new Map<string, string>();
  const taken = new Set<string>();
  for (const p of pairs) {
    if (byPiece.has(p.piece) || taken.has(p.occurrence)) continue;
    byPiece.set(p.piece, p.occurrence);
    taken.add(p.occurrence);
  }
  return { byPiece, unmatched: free.filter((f) => !byPiece.has(f.id)) };
}

/** Pieces standing at their place in the model: anchored ones plus recognised free ones. */
export const atModelCount = (session: BuildSession, match: ModelMatch): number => session.placed.length + match.byPiece.size;

/** View of the build where the model targets already occupied by a free piece count as placed (magnet, ghosts). */
export function occupiedView(session: BuildSession, match: ModelMatch): BuildSession {
  return { mode: session.mode, placed: [...session.placed, ...match.byPiece.values()] };
}

export type SteppedSwitch =
  | { readonly ok: true; readonly session: BuildSession; readonly recognised: number; readonly dropped: number }
  | { readonly ok: false; readonly reason: 'UNMATCHED'; readonly recognised: number; readonly unmatched: number };

/**
 * Leaving the free mode for a stepped one: free pieces at their place in the model become pieces on
 * their target; the others make the switch explicit — refused unless `dropUnmatched` (they go back
 * to the stock), never removed silently.
 */
export function toStepped(ctx: BuildContext, session: BuildSession, mode: Exclude<BuildMode, 'freeManual'>, dropUnmatched = false): SteppedSwitch {
  const match = matchToModel(ctx, session);
  if (match.unmatched.length > 0 && !dropUnmatched) {
    return { ok: false, reason: 'UNMATCHED', recognised: match.byPiece.size, unmatched: match.unmatched.length };
  }
  const recognised = freePiecesOf(session).flatMap((f) => (match.byPiece.has(f.id) ? [match.byPiece.get(f.id)!] : []));
  return { ok: true, session: { mode, placed: [...session.placed, ...recognised] }, recognised: recognised.length, dropped: match.unmatched.length };
}

export interface FreeHoverOptions {
  /** Manual height: horizontal position kept after a height change, until the pointer moves. */
  readonly fixedXZ?: readonly [number, number] | null;
  /** Lowest point of the finished model: the ground the free pieces stand on. */
  readonly groundY: number;
  /** Half-stud grid and plate levels (otherwise 1 LDU and the exact surface height). */
  readonly grid: boolean;
  /** Snap onto a free target of the model when the pose is within FREE_TARGET_MAGNET. */
  readonly magnet: boolean;
  /** `occupiedView()`: targets taken by a free piece are not offered by the magnet. */
  readonly occupied: BuildSession;
}

const snapAround = (v: number, base: number, grid: boolean) => (grid ? base + Math.round((v - base) / FREE_GRID_LDU) * FREE_GRID_LDU : Math.round(v));

/**
 * Free mode: turns a pointer hover into the pose of the held piece. The model target magnet
 * (resolveHover, unchanged) wins when it finds a spot; otherwise the piece rests on the pointed
 * surface — on top of the body of the pointed piece, its studs ignored, aligned on its grid — or on
 * a plate level above the ground. Nothing is refused here: any pose shown can be placed.
 */
export function resolveFreeHover(
  ctx: BuildContext, held: HeldState, ray: Ray, hit: HoverHit | null, bottom: number, options: FreeHoverOptions,
): HoverResolution | null {
  const free = freePose(held, ray, hit, bottom, options);
  const manual = held.layerMode === 'manual';
  // a height chosen by hand is never changed by the magnet: it may only snap on a spot at that height
  const sameHeight = (y: number) => !manual || Math.abs(y - held.layerY) <= SAME_HEIGHT_LDU;
  if (options.magnet) {
    // the free pose itself on a model spot, else the P5 search (surface layers, spot in the air, ghost)
    const own = free ? tryPlace(ctx, options.occupied, held, free.pose, FREE_TARGET_MAGNET) : null;
    const target = own?.ok ? ctx.occurrences.find((o) => o.occurrenceId === own.occurrenceId)! : null;
    if (free && target && sameHeight(target.targetMatrix[13])) {
      // on the spot; an equivalent rotation of a symmetric part is kept as the player turned it
      const t = target.targetMatrix;
      const previewPose = rotationAngleDeg(free.pose, t) <= FREE_TARGET_MAGNET.maxAngleDeg ? t : withTranslation(free.pose, [t[12], t[13], t[14]]);
      return { ...free, previewPose, layerY: t[13], targetId: target.occurrenceId };
    }
    if (!options.fixedXZ) {
      const r = resolveHover(ctx, options.occupied, held, ray, hit, bottom, FREE_TARGET_MAGNET);
      if (r?.targetId && sameHeight(r.previewPose[13])) return r;
    }
  }
  return free;
}

/** Manual height after `steps` × `step` LDU up (positive) or down; LDraw -Y is up. */
export function liftedY(y: number, steps: number, step: number = HEIGHT_STEP_LDU): number {
  return round(y - steps * step, 0.01);
}

function freePose(held: HeldState, ray: Ray, hit: HoverHit | null, bottom: number, options: FreeHoverOptions): HoverResolution | null {
  const { grid, groundY } = options;
  let x: number, y: number, z: number;
  let source: HoverResolution['source'] = 'free';
  if (held.layerMode === 'manual' && options.fixedXZ) {
    // the height was just changed by hand: straight up or down, the piece does not slide
    [x, y, z] = [options.fixedXZ[0], held.layerY, options.fixedXZ[1]];
    source = 'manual';
  } else if (held.layerMode === 'manual' || !hit) {
    // a horizontal plane at the chosen height (manual height, or nothing under the pointer): the
    // height is kept while the piece follows the pointer, whatever the model levels
    const dy = ray.direction[1];
    if (Math.abs(dy) < 1e-9) return null;
    const t = (held.layerY - ray.origin[1]) / dy;
    if (t < 0) return null;
    y = held.layerY;
    x = snapAround(ray.origin[0] + t * ray.direction[0], 0, grid);
    z = snapAround(ray.origin[2] + t * ray.direction[2], 0, grid);
    if (held.layerMode === 'manual') source = 'manual';
  } else {
    let rest = hit.y;
    let base: readonly [number, number] = [0, 0];
    let hx = hit.x;
    let hz = hit.z;
    const anchor = hit.anchor;
    // a face looking up, or anything above the body (the side of a stud)
    if (anchor && hit.y <= anchor[1] + 0.5 && hit.y >= anchor[1] - STUD_LDU - 0.5 && (hit.up !== false || hit.y < anchor[1] - 0.5)) {
      // top of an upright piece (or its studs): stand on its body, aligned on its own grid, where the
      // pointer ray crosses the top of the body (a stud grazed on the way does not shift the piece)
      rest = anchor[1];
      base = [anchor[0], anchor[2]];
      const t = Math.abs(ray.direction[1]) > 1e-9 ? (rest - ray.origin[1]) / ray.direction[1] : -1;
      if (t > 0) {
        hx = ray.origin[0] + t * ray.direction[0];
        hz = ray.origin[2] + t * ray.direction[2];
      }
    } else if (grid) {
      // ground, slope, side face: the plate level under the pointed point
      rest = groundY - PLATE_LDU * Math.floor((groundY - hit.y) / PLATE_LDU + 1e-6);
    }
    y = rest - bottom;
    x = snapAround(hx, base[0], grid);
    z = snapAround(hz, base[1], grid);
  }
  const pose = heldPose(held.orientation, held.quarterTurns, [round(x, 0.01), round(y, 0.01), round(z, 0.01)]);
  return { pose, previewPose: pose, layerY: pose[13], source, targetId: null };
}

// ---------------------------------------------------------------------------------------------
// Groups: several placed pieces moved as one rigid object (explicit selection, no physics)
// ---------------------------------------------------------------------------------------------

export interface GroupMember {
  readonly ref: PieceRef;
  readonly partKey: string;
  readonly colorCode: string;
  /** Pose relative to the group pivot (translation only: the pivot frame is not rotated). */
  readonly rel: Matrix4Tuple;
}

export interface PieceGroup {
  readonly members: readonly GroupMember[];
  /** Pivot where the group was taken: horizontal centre (on the grid), lowest point of the group. */
  readonly pivot: readonly [number, number, number];
}

/**
 * Group of placed pieces around a coherent pivot: the centre of their origins (on the half-stud
 * grid, so that a moved group stays on the grid) at the height of the lowest point of the group,
 * so that the group rests on a surface like a single piece whose bottom is the pivot.
 * `bottom` of each member: lowest point under its origin for its pose (see surface.ts bottomExtent).
 */
export function makeGroup(members: readonly { ref: PieceRef; partKey: string; colorCode: string; pose: Matrix4Tuple; bottom: number }[]): PieceGroup {
  const xs = members.map((m) => m.pose[12]), zs = members.map((m) => m.pose[14]);
  const cx = Math.round(((Math.min(...xs) + Math.max(...xs)) / 2) / FREE_GRID_LDU) * FREE_GRID_LDU;
  const cz = Math.round(((Math.min(...zs) + Math.max(...zs)) / 2) / FREE_GRID_LDU) * FREE_GRID_LDU;
  const low = Math.max(...members.map((m) => m.pose[13] + m.bottom));
  const pivot = [cx, low, cz] as const;
  return {
    pivot,
    members: members.map((m) => ({ ref: m.ref, partKey: m.partKey, colorCode: m.colorCode, rel: withTranslation(m.pose, [m.pose[12] - cx, m.pose[13] - low, m.pose[14] - cz]) })),
  };
}

/** Poses of the members for the pivot at `at`, turned `quarterTurns` × 90° around the vertical axis. */
/**
 * Poses of the members for the pivot at `at`, the group frame turned by `rotation` (a rotation
 * matrix, or a number of quarter turns around the vertical axis).
 */
export function groupPoses(group: PieceGroup, rotation: Matrix4Tuple | number, at: readonly [number, number, number]): Matrix4Tuple[] {
  const frame = withTranslation(typeof rotation === 'number' ? rotationY(rotation) : rotation, at);
  return group.members.map((m) => cleanPose(multiply(frame, m.rel)));
}

/** The pivot pose of a group that has not moved (identity rotation at its pivot). */
export const groupHome = (group: PieceGroup): Matrix4Tuple => withTranslation(IDENTITY, group.pivot);

export type GroupResult =
  | { readonly ok: true; readonly session: BuildSession; readonly refs: readonly PieceRef[] }
  | { readonly ok: false; readonly reason: FreeFailure };

/**
 * Moves several placed pieces at once — all or nothing: one invalid pose or unknown piece and the
 * build is unchanged. Free pieces keep their id; a piece that was on its model target becomes a free
 * piece (new id). The stock is unchanged. `refs` = the moved pieces, in the same order, after the move.
 */
export function moveGroup(ctx: BuildContext, session: BuildSession, moves: readonly { ref: PieceRef; pose: Matrix4Tuple }[]): GroupResult {
  if (session.mode !== 'freeManual') return { ok: false, reason: 'NOT_FREE_MODE' };
  const keys = moves.map((m) => (m.ref.kind === 'free' ? `f:${m.ref.id}` : `a:${m.ref.occurrenceId}`));
  if (new Set(keys).size !== keys.length) return { ok: false, reason: 'UNKNOWN_PIECE' };
  if (!moves.every((m) => isRigidPose(m.pose))) return { ok: false, reason: 'INVALID_POSE' };
  if (!moves.every((m) => poseOf(ctx, session, m.ref) !== null)) return { ok: false, reason: 'UNKNOWN_PIECE' };
  let next = session;
  const refs: PieceRef[] = [];
  for (const m of moves) {
    const r = movePiece(ctx, next, m.ref, m.pose);
    if (!r.ok) return { ok: false, reason: r.reason }; // not reached after the checks above; nothing is returned half-done
    next = r.session;
    refs.push({ kind: 'free', id: r.pieceId });
  }
  return { ok: true, session: next, refs };
}

/** Puts several placed pieces back into the stock at once. */
export function removePieces(session: BuildSession, refs: readonly PieceRef[]): BuildSession {
  return refs.reduce((s, r) => removePiece(s, r), session);
}

export const sameRef = (a: PieceRef, b: PieceRef): boolean =>
  a.kind === b.kind && (a.kind === 'free' ? a.id === (b as { id: string }).id : a.occurrenceId === (b as { occurrenceId: string }).occurrenceId);

// ---------------------------------------------------------------------------------------------
// Rotations on the three axes (free mode): exact quarter turns, composed by matrix products
// ---------------------------------------------------------------------------------------------

export type Axis = 'x' | 'y' | 'z';

/** Exact −1 / 0 / 1 when within 1e-9: quarter-turn compositions never drift. */
const exact = (v: number) => (Math.abs(v) < 1e-9 ? 0 : Math.abs(v - 1) < 1e-9 ? 1 : Math.abs(v + 1) < 1e-9 ? -1 : v);

/** A pose whose rotation coefficients are cleaned (translation untouched). */
export function cleanPose(m: Matrix4Tuple): Matrix4Tuple {
  const out = [...m];
  for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) out[i] = exact(out[i]!);
  return out as unknown as Matrix4Tuple;
}

/** `steps` × 90° around the LDraw axis (Y is vertical, pointing down). Same sense as rotationY. */
export function quarterTurn(axis: Axis, steps: number): Matrix4Tuple {
  const q = ((steps % 4) + 4) % 4;
  const c = [1, 0, -1, 0][q]!, s = [0, 1, 0, -1][q]!;
  if (axis === 'y') return rotationY(q);
  if (axis === 'x') return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** Orientation turned around a world axis through the piece origin (no translation). */
export function rotateOrientation(orientation: Matrix4Tuple, axis: Axis, steps: number): Matrix4Tuple {
  return cleanPose(withTranslation(multiply(quarterTurn(axis, steps), orientation), [0, 0, 0]));
}

const DIRECTIONS: [string, readonly [number, number, number]][] = [['haut', [0, -1, 0]], ['bas', [0, 1, 0]], ['+X', [1, 0, 0]], ['−X', [-1, 0, 0]], ['+Z', [0, 0, 1]], ['−Z', [0, 0, -1]]];
const nameOf = (v: readonly number[]) => DIRECTIONS.find(([, d]) => d[0] * v[0]! + d[1] * v[1]! + d[2] * v[2]! > 0.9)?.[0] ?? 'incliné';

/** Where the top (local −Y) and the front (local −Z) of a piece point, in words. */
export function orientationLabel(orientation: Matrix4Tuple): { top: string; front: string } {
  const top = [-orientation[4], -orientation[5], -orientation[6]];
  const front = [-orientation[8], -orientation[9], -orientation[10]];
  return { top: nameOf(top), front: nameOf(front) };
}

/**
 * Lowest point under the pivot of a group turned by `rotation` (LDU, LDraw y): the pivot then rests
 * on a surface like a single piece. `bottomOf(member, rotation)` = lowest point under a member origin.
 */
export function groupBottom(group: PieceGroup, rotation: Matrix4Tuple, bottomOf: (m: GroupMember, rotation: Matrix4Tuple) => number): number {
  let low = -Infinity;
  for (const m of group.members) {
    const pose = multiply(withTranslation(rotation, [0, 0, 0]), m.rel);
    low = Math.max(low, pose[13] + bottomOf(m, withTranslation(pose, [0, 0, 0])));
  }
  return Number.isFinite(low) ? low : 0;
}

/**
 * Selection turned in place: around the vertical line through the centre of the pieces, the lowest
 * point kept at the same height. Returns the new poses (same order), for one atomic moveGroup.
 */
export function rotatedInPlace(group: PieceGroup, rotation: Matrix4Tuple, bottomOf: (m: GroupMember, rotation: Matrix4Tuple) => number): Matrix4Tuple[] {
  const b = groupBottom(group, rotation, bottomOf);
  return groupPoses(group, rotation, [group.pivot[0], round(group.pivot[1] - b, 0.01), group.pivot[2]]);
}

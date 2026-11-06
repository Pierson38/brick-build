import { determinant3, distance, fromLDraw, rotationAngleDeg, withTranslation } from '../ldraw/matrix';
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
  if (options.magnet) {
    // the free pose itself on a model spot, else the P5 search (surface layers, spot in the air, ghost)
    const own = free ? tryPlace(ctx, options.occupied, held, free.pose, FREE_TARGET_MAGNET) : null;
    if (free && own?.ok) {
      const target = ctx.occurrences.find((o) => o.occurrenceId === own.occurrenceId)!;
      // on the spot; an equivalent rotation of a symmetric part is kept as the player turned it
      const t = target.targetMatrix;
      const previewPose = rotationAngleDeg(free.pose, t) <= FREE_TARGET_MAGNET.maxAngleDeg ? t : withTranslation(free.pose, [t[12], t[13], t[14]]);
      return { ...free, previewPose, layerY: t[13], targetId: target.occurrenceId };
    }
    const r = resolveHover(ctx, options.occupied, held, ray, hit, bottom, FREE_TARGET_MAGNET);
    if (r?.targetId) return r;
  }
  return free;
}

function freePose(held: HeldState, ray: Ray, hit: HoverHit | null, bottom: number, options: FreeHoverOptions): HoverResolution | null {
  const { grid, groundY } = options;
  let x: number, y: number, z: number;
  let source: HoverResolution['source'] = 'free';
  if (held.layerMode === 'manual' || !hit) {
    // a horizontal plane at the current level (manual layers, or nothing under the pointer)
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

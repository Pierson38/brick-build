import { rotationAngleDeg, withTranslation } from '../ldraw/matrix';
import type { Matrix4Tuple } from '../ldraw/types';
import { candidates, heldPose, MOVE_GRID_LDU, tryPlace, type BuildContext, type BuildSession, type SnapTolerances, DEFAULT_TOLERANCES } from './engine';

/**
 * Surface-assisted placement: the height of the held brick comes from the surface under
 * the pointer (raycast) instead of manual layer keys. Pure functions, LDraw coordinates
 * (-Y up, a brick's origin is the top of its body, its bottom has the largest y).
 * The engine rules are unchanged: a drop is still validated by tryPlace().
 */

/** Max gap between the height implied by a surface and a target layer to adopt that layer. */
export const SURFACE_LAYER_WINDOW_LDU = 6;

export type LayerMode = 'auto' | 'manual';

export interface HeldState {
  readonly partKey: string;
  readonly colorCode: string;
  readonly orientation: Matrix4Tuple;
  readonly quarterTurns: number;
  /** Current layer (manual mode, or last auto layer). */
  readonly layerY: number;
  readonly layerMode: LayerMode;
}

export interface Ray {
  readonly origin: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
}

/** Nearest relevant object under the pointer. */
export interface HoverHit {
  readonly kind: 'solid' | 'ghost' | 'ground';
  /** LDraw coordinates of the hit point. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Distance from the ray origin to the hit (same unit as the ray direction, LDU when normalised). */
  readonly distance?: number;
  /** Occurrence of a hovered ghost. */
  readonly occurrenceId?: string;
  /** Hovered placed piece standing upright: its origin (LDraw), i.e. the top of its body (free mode). */
  readonly anchor?: readonly [number, number, number];
  /** The hit face looks up (LDraw -Y): something can rest on it (free mode). */
  readonly up?: boolean;
}

export interface HoverResolution {
  /** Pose used to validate the drop (what the pointer designates). */
  readonly pose: Matrix4Tuple;
  /** Pose shown for the held brick: the target itself when the drop would be accepted. */
  readonly previewPose: Matrix4Tuple;
  readonly layerY: number;
  readonly source: 'ghost' | 'surface' | 'ground' | 'ray' | 'manual' | 'none' | 'free';
  /** Occurrence that a click would place right now, if any. */
  readonly targetId: string | null;
}

/** Lowest point of a part (largest LDraw y) once rotated by `orientation`. */
export function bottomExtent(vertices: ArrayLike<number>, orientation: Matrix4Tuple): number {
  let max = -Infinity;
  for (let i = 0; i + 2 < vertices.length; i += 3) {
    const y = orientation[1] * vertices[i]! + orientation[5] * vertices[i + 1]! + orientation[9] * vertices[i + 2]!;
    if (y > max) max = y;
  }
  return Number.isFinite(max) ? max : 0;
}

/**
 * Layer for a brick resting on a surface at `surfaceY`. Prefers a layer that still has a
 * compatible target; ties go to the lower layer (a stud top makes the surface look 4 LDU higher).
 */
export function layerFromSurface(
  surfaceY: number,
  bottom: number,
  candidateLayers: readonly number[],
  window = SURFACE_LAYER_WINDOW_LDU,
): { layerY: number; matched: boolean } {
  const expected = surfaceY - bottom;
  let best: number | null = null;
  for (const layer of candidateLayers) {
    const d = Math.abs(layer - expected);
    if (d > window) continue;
    if (best === null || d < Math.abs(best - expected) - 1e-6 || (Math.abs(d - Math.abs(best - expected)) <= 1e-6 && layer > best)) best = layer;
  }
  return best === null ? { layerY: Math.round(expected), matched: false } : { layerY: best, matched: true };
}

const snap = (v: number) => Math.round(v / MOVE_GRID_LDU) * MOVE_GRID_LDU;

/** Where the pointer ray crosses the horizontal plane y = layerY, snapped to the move grid (manual mode). */
export function intersectLayer(ray: Ray, layerY: number): [number, number] | null {
  const dy = ray.direction[1];
  if (Math.abs(dy) < 1e-9) return null;
  const t = (layerY - ray.origin[1]) / dy;
  if (t < 0) return null;
  return [snap(ray.origin[0] + t * ray.direction[0]), snap(ray.origin[2] + t * ray.direction[2])];
}

/** Distinct layers (rounded y) of the open targets of the held part+colour. */
export function candidateLayers(ctx: BuildContext, session: BuildSession, held: Pick<HeldState, 'partKey' | 'colorCode'>): number[] {
  const ys = candidates(ctx, session).filter((o) => o.partKey === held.partKey && o.colorCode === held.colorCode).map((o) => Math.round(o.targetMatrix[13]));
  return [...new Set(ys)].sort((a, b) => b - a);
}

/** Distance between a point and a ray (direction assumed normalised); t = position along the ray. */
function rayDistance(ray: Ray, p: readonly [number, number, number]): { d: number; t: number } {
  const [ox, oy, oz] = ray.origin, [dx, dy, dz] = ray.direction;
  const vx = p[0] - ox, vy = p[1] - oy, vz = p[2] - oz;
  const t = vx * dx + vy * dy + vz * dz;
  return { d: Math.hypot(vx - t * dx, vy - t * dy, vz - t * dz), t };
}

/**
 * Open compatible targets crossed by the pointer ray (within the snap distance), nearest to the
 * ray first. Targets hidden well behind the first visible surface are ignored.
 */
export function targetsAlongRay(
  ctx: BuildContext, session: BuildSession, held: Pick<HeldState, 'partKey' | 'colorCode'>, ray: Ray, hit: HoverHit | null,
  maxDistance = DEFAULT_TOLERANCES.maxDistanceLdu,
) {
  const hidden = hit?.kind === 'solid' && hit.distance !== undefined ? hit.distance + 24 : Infinity;
  return candidates(ctx, session)
    .filter((o) => o.partKey === held.partKey && o.colorCode === held.colorCode)
    .map((o) => ({ o, ...rayDistance(ray, [o.targetMatrix[12], o.targetMatrix[13], o.targetMatrix[14]]) }))
    .filter((x) => x.t > 0 && x.d <= maxDistance && x.t <= hidden)
    .sort((a, b) => a.d - b.d || a.t - b.t);
}

/** Turns a pointer hover into the held brick pose, without placing anything. */
export function resolveHover(
  ctx: BuildContext,
  session: BuildSession,
  held: HeldState,
  ray: Ray,
  hit: HoverHit | null,
  bottom: number,
  tolerances: SnapTolerances = DEFAULT_TOLERANCES,
): HoverResolution | null {
  const open = candidates(ctx, session);
  let layerY = held.layerY;
  let source: HoverResolution['source'] = held.layerMode === 'manual' ? 'manual' : 'none';
  let xz: [number, number] | null = null;

  const ghost = hit?.kind === 'ghost' ? open.find((o) => o.occurrenceId === hit.occurrenceId) : undefined;
  if (held.layerMode === 'auto' && ghost && ghost.partKey === held.partKey && ghost.colorCode === held.colorCode) {
    // Magnet on the hovered ghost: position only, the orientation is still checked.
    layerY = ghost.targetMatrix[13];
    xz = [ghost.targetMatrix[12], ghost.targetMatrix[14]];
    source = 'ghost';
  } else if (held.layerMode === 'auto' && hit) {
    // the brick sits ON the pointed surface, at the pointed spot
    layerY = layerFromSurface(hit.y, bottom, candidateLayers(ctx, session, held)).layerY;
    xz = [snap(hit.x), snap(hit.z)];
    source = hit.kind === 'ground' ? 'ground' : 'surface';
  }
  xz ??= intersectLayer(ray, layerY);
  if (!xz) return null;

  let pose = heldPose(held.orientation, held.quarterTurns, [xz[0], layerY, xz[1]]);
  let result = tryPlace(ctx, session, held, pose, tolerances);
  if (!result.ok && held.layerMode === 'auto') {
    // The surface gave no spot (overhang, side mount, nothing below yet): try the spot the pointer
    // designates in the air, i.e. a compatible target crossed by the ray.
    for (const { o } of targetsAlongRay(ctx, session, held, ray, hit, tolerances.maxDistanceLdu)) {
      const y = o.targetMatrix[13];
      const at = intersectLayer(ray, y);
      if (!at) continue;
      const candidatePose = heldPose(held.orientation, held.quarterTurns, [at[0], y, at[1]]);
      const r = tryPlace(ctx, session, held, candidatePose, tolerances);
      if (r.ok) { pose = candidatePose; result = r; layerY = y; source = 'ray'; break; }
    }
  }
  if (!result.ok) return { pose, previewPose: pose, layerY, source, targetId: null };
  const target = ctx.occurrences.find((o) => o.occurrenceId === result.occurrenceId)!;
  // Show the brick exactly on its target, keeping the player's (equivalent) rotation visible.
  const previewPose = rotationAngleDeg(pose, target.targetMatrix) <= tolerances.maxAngleDeg
    ? target.targetMatrix
    : withTranslation(pose, [target.targetMatrix[12], target.targetMatrix[13], target.targetMatrix[14]]);
  return { pose, previewPose, layerY, source, targetId: target.occurrenceId };
}

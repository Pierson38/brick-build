import { distance, IDENTITY, multiply, rotationAngleDeg, rotationY, withTranslation } from '../ldraw/matrix';
import { equivalentTargets } from '../ldraw/symmetry';
import type { BrickOccurrence, Matrix4Tuple } from '../ldraw/types';
import type { StepPlan } from './build-plan';

export type BuildMode = 'guided' | 'freeManual';

/**
 * Initial tolerances, calibrated on the 2×4 brick fixtures: half a stud (10 LDU)
 * and well under a quarter turn. Not "physical" values.
 */
export interface SnapTolerances {
  readonly maxDistanceLdu: number;
  readonly maxAngleDeg: number;
  /** Two targets closer than this to each other's distance make a drop ambiguous. */
  readonly ambiguityLdu: number;
}

/**
 * Grid used to move the held brick, in LDU. 5 LDU (a quarter stud): measured on 5 real
 * OMR sets, targets lie at most 3.4 LDU from this grid, vs 6.8 LDU (often on a cell
 * boundary) with a 10 LDU grid.
 */
export const MOVE_GRID_LDU = 5;

export const DEFAULT_TOLERANCES: SnapTolerances = { maxDistanceLdu: 10, maxAngleDeg: 10, ambiguityLdu: 1 };

export interface BuildSession {
  readonly mode: BuildMode;
  /** Placed occurrence ids, in placement order (for undo). */
  readonly placed: readonly string[];
}

export interface BuildContext {
  readonly occurrences: readonly BrickOccurrence[];
  readonly plan: StepPlan;
  /**
   * Y quarter-turn symmetries per part key, measured on the real geometry
   * (see ldraw/symmetry.ts). Missing entry = no symmetry assumed.
   */
  readonly symmetries?: ReadonlyMap<string, readonly number[]>;
}

export interface TrayItem {
  readonly key: string;
  readonly partKey: string;
  readonly partRef: string;
  readonly colorCode: string;
  readonly remaining: number;
  readonly total: number;
}

export type PlaceFailure =
  | { readonly reason: 'COMPLETE' }
  | { readonly reason: 'NO_COMPATIBLE_TARGET' }
  | { readonly reason: 'TOO_FAR'; readonly distanceLdu: number }
  | { readonly reason: 'WRONG_ROTATION'; readonly angleDeg: number }
  | { readonly reason: 'AMBIGUOUS'; readonly candidates: readonly string[] }
  | { readonly reason: 'NOT_A_CANDIDATE' };

export type PlaceResult =
  | { readonly ok: true; readonly occurrenceId: string; readonly session: BuildSession }
  | ({ readonly ok: false } & PlaceFailure);

export function trayKey(partKey: string, colorCode: string): string {
  return `${partKey}|${colorCode}`;
}

export function createSession(mode: BuildMode): BuildSession {
  return { mode, placed: [] };
}

/** Guided mode only makes sense when real steps exist. */
export function availableModes(plan: StepPlan): BuildMode[] {
  return plan.kind === 'NO_STEPS' ? ['freeManual'] : ['guided', 'freeManual'];
}

/** Index of the first step that still has unplaced bricks; -1 when complete or not guided. */
export function activeStepIndex(ctx: BuildContext, session: BuildSession): number {
  if (session.mode !== 'guided') return -1;
  const placed = new Set(session.placed);
  return ctx.plan.steps.findIndex((s) => s.occurrenceIds.some((id) => !placed.has(id)));
}

export function isComplete(ctx: BuildContext, session: BuildSession): boolean {
  return session.placed.length === ctx.occurrences.length;
}

/** Occurrences the player may place right now. */
export function candidates(ctx: BuildContext, session: BuildSession): BrickOccurrence[] {
  const placed = new Set(session.placed);
  if (session.mode === 'guided') {
    const step = ctx.plan.steps[activeStepIndex(ctx, session)];
    if (!step) return [];
    const ids = new Set(step.occurrenceIds);
    return ctx.occurrences.filter((o) => ids.has(o.occurrenceId) && !placed.has(o.occurrenceId));
  }
  return ctx.occurrences.filter((o) => !placed.has(o.occurrenceId));
}

/** Remaining stock grouped by reference + colour (candidates only). */
export function tray(ctx: BuildContext, session: BuildSession): TrayItem[] {
  const open = candidates(ctx, session);
  const items = new Map<string, { partKey: string; partRef: string; colorCode: string; remaining: number; total: number }>();
  for (const o of ctx.occurrences) {
    const key = trayKey(o.partKey, o.colorCode);
    const item = items.get(key) ?? { partKey: o.partKey, partRef: o.partRef, colorCode: o.colorCode, remaining: 0, total: 0 };
    item.total += 1;
    items.set(key, item);
  }
  for (const o of open) items.get(trayKey(o.partKey, o.colorCode))!.remaining += 1;
  return [...items.entries()].filter(([, v]) => v.remaining > 0).map(([key, v]) => ({ key, ...v }));
}

/**
 * Tries to drop a held brick (reference + colour) at `pose` (global LDraw transform).
 * Only unplaced compatible candidates are considered; the nearest one within tolerances wins.
 */
export function tryPlace(
  ctx: BuildContext,
  session: BuildSession,
  held: { readonly partKey: string; readonly colorCode: string },
  pose: Matrix4Tuple,
  tolerances: SnapTolerances = DEFAULT_TOLERANCES,
): PlaceResult {
  if (isComplete(ctx, session)) return { ok: false, reason: 'COMPLETE' };
  const compatible = candidates(ctx, session).filter((o) => o.partKey === held.partKey && o.colorCode === held.colorCode);
  if (compatible.length === 0) return { ok: false, reason: 'NO_COMPATIBLE_TARGET' };

  const symmetries = ctx.symmetries?.get(held.partKey) ?? [0];
  const scored = compatible
    .map((o) => ({
      o,
      d: distance(pose, o.targetMatrix),
      a: Math.min(...equivalentTargets(o.targetMatrix, symmetries).map((t) => rotationAngleDeg(pose, t))),
    }))
    .sort((x, y) => x.d - y.d);
  const valid = scored.filter((s) => s.d <= tolerances.maxDistanceLdu && s.a <= tolerances.maxAngleDeg);
  const best = valid[0];
  if (!best) {
    const nearest = scored[0]!;
    if (nearest.d <= tolerances.maxDistanceLdu) return { ok: false, reason: 'WRONG_ROTATION', angleDeg: nearest.a };
    return { ok: false, reason: 'TOO_FAR', distanceLdu: nearest.d };
  }
  const rivals = valid.filter((s) => s !== best && s.d - best.d < tolerances.ambiguityLdu);
  if (rivals.length > 0) {
    return { ok: false, reason: 'AMBIGUOUS', candidates: [best.o.occurrenceId, ...rivals.map((r) => r.o.occurrenceId)] };
  }
  return { ok: true, occurrenceId: best.o.occurrenceId, session: { ...session, placed: [...session.placed, best.o.occurrenceId] } };
}

/**
 * Distinct target orientations of a part+colour in the model, without translation.
 * Two orientations are the same choice when they differ only by a world Y quarter turn
 * (the R key) or by a symmetry of the part. The pointer pose is `rotationY(q) * choice`.
 * Upright orientations come first.
 */
export function orientationChoices(ctx: BuildContext, partKey: string, colorCode: string): Matrix4Tuple[] {
  const symmetries = ctx.symmetries?.get(partKey) ?? [0];
  const choices: Matrix4Tuple[] = [];
  const same = (a: Matrix4Tuple, b: Matrix4Tuple) =>
    [0, 1, 2, 3].some((q) => equivalentTargets(multiply(rotationY(q), b), symmetries).some((t) => rotationAngleDeg(a, t) < 1));
  for (const o of ctx.occurrences) {
    if (o.partKey !== partKey || o.colorCode !== colorCode || !o.rigid) continue;
    const r = withTranslation(o.targetMatrix, [0, 0, 0]);
    if (!choices.some((c) => same(r, c))) choices.push(r);
  }
  const upright = choices.findIndex((c) => same(IDENTITY, c));
  if (upright > 0) choices.unshift(...choices.splice(upright, 1));
  if (upright < 0) choices.unshift(IDENTITY);
  return choices;
}

/** Pose of the held brick: orientation choice, then `quarterTurns` × 90° around world Y, at `position`. */
export function heldPose(orientation: Matrix4Tuple, quarterTurns: number, position: readonly [number, number, number]): Matrix4Tuple {
  return withTranslation(multiply(rotationY(quarterTurns), orientation), position);
}

/** Accessibility / debug path: place one specific candidate at its exact target. */
export function placeExact(ctx: BuildContext, session: BuildSession, occurrenceId: string): PlaceResult {
  if (isComplete(ctx, session)) return { ok: false, reason: 'COMPLETE' };
  if (!candidates(ctx, session).some((o) => o.occurrenceId === occurrenceId)) return { ok: false, reason: 'NOT_A_CANDIDATE' };
  return { ok: true, occurrenceId, session: { ...session, placed: [...session.placed, occurrenceId] } };
}

export function undo(session: BuildSession): BuildSession {
  return { ...session, placed: session.placed.slice(0, -1) };
}

/** Guided mode: removes the bricks already placed in the active step. */
export function resetActiveStep(ctx: BuildContext, session: BuildSession): BuildSession {
  const step = ctx.plan.steps[activeStepIndex(ctx, session)];
  if (!step) return session;
  const inStep = new Set(step.occurrenceIds);
  return { ...session, placed: session.placed.filter((id) => !inStep.has(id)) };
}

export function describeFailure(f: PlaceFailure): string {
  switch (f.reason) {
    case 'COMPLETE': return 'Le modèle est déjà terminé.';
    case 'NO_COMPATIBLE_TARGET': return 'Aucun emplacement restant pour cette pièce (référence/couleur) dans l’étape en cours.';
    case 'TOO_FAR': return `Trop loin de l’emplacement le plus proche (${Math.round(f.distanceLdu)} LDU).`;
    case 'WRONG_ROTATION': return `Bonne position mais mauvaise orientation (écart ${Math.round(f.angleDeg)}°). Tourne la pièce avec R.`;
    case 'AMBIGUOUS': return 'Plusieurs emplacements possibles à égale distance : rapproche la pièce de l’un d’eux.';
    case 'NOT_A_CANDIDATE': return 'Cette pièce n’est pas disponible maintenant.';
  }
}

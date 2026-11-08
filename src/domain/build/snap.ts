import type { Connector, Vec3 } from '../ldraw/connectors';
import { diagnoseSnap, engagedAt, proposeSnap, type ConnectorIndex, type Engagement, type SnapMiss, type SnapProposal } from './connections';

/**
 * The connections part of a free-mode hover, the same for a piece taken from the tray, a placed
 * piece taken again and a group (fix/free-building-connections): `held` = the connectors of the
 * piece(s) in hand where the pointer (and the model magnet) put them.
 *
 * - `pieces` (pieces magnet on, ⌥ not held, no official spot found by the model magnet): the
 *   nearest compatible connection is proposed (connections.ts proposeSnap), or the reason why not.
 * - `engaged`: the connections verified by the engine at the exact pose that will be shown and
 *   saved — the proposal itself when there is one, else what the pose shown really engages (a model
 *   spot, a free pose on studs). The green markers are these, never a guess.
 */
export interface SnapHoverOptions {
  readonly pieces: boolean;
  readonly keepHeight: boolean;
  /** Placed pieces in hand (excluded: they are where the pointer is, not where they were). */
  readonly exclude: ReadonlySet<string>;
  /** Translation back to the previous proposal (see SnapOptions.stick). */
  readonly stick: Vec3 | null;
}

export interface SnapHover {
  readonly proposal: SnapProposal | null;
  readonly engaged: Engagement;
  readonly miss: SnapMiss | null;
}

export function snapHover(held: readonly Connector[], index: ConnectorIndex, options: SnapHoverOptions): SnapHover {
  const opts = { keepHeight: options.keepHeight, exclude: options.exclude, stick: options.stick };
  const proposal = options.pieces ? proposeSnap(held, index, opts) : null;
  const miss = options.pieces && !proposal ? diagnoseSnap(held, index, opts) : null;
  return { proposal, engaged: proposal ?? engagedAt(held, index, options.exclude), miss };
}

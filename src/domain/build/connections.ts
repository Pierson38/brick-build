import { fits, isMale, mateOf, placeConnector, type Connector, type PartConnectors, type Vec3 } from '../ldraw/connectors';
import type { Matrix4Tuple } from '../ldraw/types';

/**
 * Connections between placed pieces (free mode), from the connection interfaces recognised in the
 * LDraw parts (../ldraw/connectors.ts): a graph of the pieces that are really connected (a stud in
 * a receptor, a pin in a pin hole — touching or overlapping volumes are NOT a connection), and the
 * snapping proposals that align the connectors of the piece in hand with free connectors nearby.
 * World = LDraw coordinates; a connector of a placed piece = its pose × the part-local connector.
 * See docs/implementation/MONTAGE_LIBRE_CONNEXIONS.md.
 */

/** A placed piece for this module: an id (`f:` free piece, `a:` piece on a model target), part and pose. */
export interface PlacedPiece {
  readonly key: string;
  readonly partKey: string;
  readonly pose: Matrix4Tuple;
}

export interface WorldConnector extends Connector {
  readonly piece: string;
}

const CELL = 20;
const cellOf = (p: Vec3) => [Math.floor(p[0] / CELL), Math.floor(p[1] / CELL), Math.floor(p[2] / CELL)] as const;
const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`;

/** Connectors of placed pieces in world coordinates, by 20 LDU cells. */
export class ConnectorIndex {
  private readonly cells = new Map<string, WorldConnector[]>();
  readonly all: readonly WorldConnector[];
  /** Connectors already joined to another placed piece (a stud holds one receptor at most). */
  private occupiedSet: Set<WorldConnector> | null = null;

  constructor(pieces: readonly PlacedPiece[], connectorsOf: (partKey: string) => PartConnectors | undefined) {
    const all: WorldConnector[] = [];
    for (const p of pieces) {
      for (const c of connectorsOf(p.partKey)?.connectors ?? []) {
        const w: WorldConnector = { ...placeConnector(c, p.pose), piece: p.key };
        all.push(w);
        const [x, y, z] = cellOf(w.pos);
        const k = cellKey(x, y, z);
        const list = this.cells.get(k);
        if (list) list.push(w);
        else this.cells.set(k, [w]);
      }
    }
    this.all = all;
  }

  /** Whether a placed connector is already joined to another placed piece. */
  occupied(c: WorldConnector): boolean {
    if (!this.occupiedSet) {
      this.occupiedSet = new Set();
      for (const m of this.all) {
        if (!isMale(m.kind)) continue;
        for (const o of this.near(m.pos, m.kind === 'pin' ? 30 : 1)) {
          if (o.piece !== m.piece && joined(m, o)) {
            this.occupiedSet.add(m);
            this.occupiedSet.add(o);
          }
        }
      }
    }
    return this.occupiedSet.has(c);
  }

  /** Connectors within `radius` of `pos`, in a stable order (piece, kind, position). */
  near(pos: Vec3, radius: number): WorldConnector[] {
    const r = Math.ceil(radius / CELL);
    const [cx, cy, cz] = cellOf(pos);
    const out: WorldConnector[] = [];
    for (let x = cx - r; x <= cx + r; x++) {
      for (let y = cy - r; y <= cy + r; y++) {
        for (let z = cz - r; z <= cz + r; z++) {
          for (const c of this.cells.get(cellKey(x, y, z)) ?? []) {
            if (Math.hypot(c.pos[0] - pos[0], c.pos[1] - pos[1], c.pos[2] - pos[2]) <= radius) out.push(c);
          }
        }
      }
    }
    return out;
  }
}

/** Whether a connector of one piece and a connector of another fit together (either way round). */
export function joined(a: Connector, b: Connector): boolean {
  if (isMale(a.kind) && b.kind === mateOf(a.kind)) return fits(a, b);
  if (isMale(b.kind) && a.kind === mateOf(b.kind)) return fits(b, a);
  return false;
}

/** Graph of the placed pieces really connected by recognised connectors: piece key → neighbours. */
export function connectionGraph(index: ConnectorIndex): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  for (const c of index.all) {
    if (!isMale(c.kind)) continue;
    // a pin reaches up to 20 LDU from its midpoint into a hole: look a little further
    for (const o of index.near(c.pos, c.kind === 'pin' ? 30 : 1)) {
      if (o.piece === c.piece || !joined(c, o)) continue;
      if (!graph.has(c.piece)) graph.set(c.piece, new Set());
      if (!graph.has(o.piece)) graph.set(o.piece, new Set());
      graph.get(c.piece)!.add(o.piece);
      graph.get(o.piece)!.add(c.piece);
    }
  }
  return graph;
}

/** The pieces connected to `start`, directly or through others (`start` included), sorted. */
export function connectedAssembly(graph: Map<string, Set<string>>, start: readonly string[]): string[] {
  const seen = new Set<string>(start);
  const queue = [...start];
  while (queue.length > 0) {
    for (const n of graph.get(queue.shift()!) ?? []) {
      if (seen.has(n)) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  return [...seen].sort();
}

export interface SnapProposal {
  /** Translation to apply to the piece(s) in hand. */
  readonly delta: Vec3;
  /** Number of connector pairs that fit after the translation. */
  readonly pairs: number;
  /** Placed pieces the proposal connects to (sorted). */
  readonly targets: readonly string[];
  /** World positions of the connectors that fit (markers of the preview). */
  readonly points: readonly Vec3[];
  /** Kinds of the connections ('stud' for stud ↔ receptor, 'pin' for pin ↔ hole). */
  readonly kinds: readonly ('stud' | 'pin')[];
}

export interface SnapOptions {
  /** Distance (LDU) within which a connector of the piece in hand looks for a mate. */
  readonly radius?: number;
  /** Manual height: only proposals that keep this height (the translation has no vertical part). */
  readonly keepHeight?: boolean;
  /** A proposal whose piece(s) would go through a placed piece other than its targets: rejected. */
  readonly collides?: (delta: Vec3, targets: readonly string[]) => boolean;
}

export const SNAP_RADIUS_LDU = 24;
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Snapping between pieces: translations that make a connector of the piece(s) in hand coincide with a
 * compatible free connector of a placed piece (the rotation stays the one chosen by the player: the
 * axes must already match). Best = most fitting pairs, then the smallest move, then a fixed order:
 * deterministic. `held` = connectors of the piece(s) in hand at the position shown, in world coordinates.
 */
export function proposeSnap(held: readonly Connector[], index: ConnectorIndex, options: SnapOptions = {}): SnapProposal | null {
  const radius = options.radius ?? SNAP_RADIUS_LDU;
  const deltas = new Map<string, Vec3>();
  for (const h of held) {
    for (const t of index.near(h.pos, radius)) {
      if (t.kind !== mateOf(h.kind)) continue;
      const dot = h.axis[0] * t.axis[0] + h.axis[1] * t.axis[1] + h.axis[2] * t.axis[2];
      if (h.kind === 'stud' || h.kind === 'antistud' ? dot < 0.99 : Math.abs(dot) < 0.99) continue;
      const d: Vec3 = [round2(t.pos[0] - h.pos[0]), round2(t.pos[1] - h.pos[1]), round2(t.pos[2] - h.pos[2])];
      if (options.keepHeight && Math.abs(d[1]) > 0.5) continue;
      deltas.set(d.join(','), d);
    }
  }
  const scored: (SnapProposal & { len: number; key: string })[] = [];
  for (const [key, d] of deltas) {
    const targets = new Set<string>();
    const points: Vec3[] = [];
    const kinds = new Set<'stud' | 'pin'>();
    let pairs = 0;
    let impossible = false;
    for (const h of held) {
      const moved: Connector = { ...h, pos: [h.pos[0] + d[0], h.pos[1] + d[1], h.pos[2] + d[2]] };
      const around = index.near(moved.pos, h.kind === 'pin' || h.kind === 'pinhole' ? 30 : 1);
      // two studs (or two receptors) at the same point: two pieces in the same place — impossible
      if (around.some((t) => t.kind === h.kind && (h.kind === 'stud' || h.kind === 'antistud')
        && Math.hypot(t.pos[0] - moved.pos[0], t.pos[1] - moved.pos[1], t.pos[2] - moved.pos[2]) <= 0.6
        && t.axis[0] * moved.axis[0] + t.axis[1] * moved.axis[1] + t.axis[2] * moved.axis[2] > 0.99)) {
        impossible = true;
        break;
      }
      // a connector already joined to another piece is not free
      const mate = around.find((t) => joined(moved, t) && !index.occupied(t));
      if (!mate) continue;
      pairs += 1;
      targets.add(mate.piece);
      points.push(isMale(h.kind) ? mate.pos : moved.pos);
      kinds.add(h.kind === 'stud' || h.kind === 'antistud' ? 'stud' : 'pin');
    }
    if (impossible || pairs === 0) continue;
    points.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
    scored.push({ delta: d, pairs, targets: [...targets].sort(), points, kinds: [...kinds].sort(), len: Math.hypot(...d), key });
  }
  scored.sort((a, b) => b.pairs - a.pairs || a.len - b.len || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (const s of scored) {
    if (options.collides?.(s.delta, s.targets)) continue;
    return { delta: s.delta, pairs: s.pairs, targets: s.targets, points: s.points, kinds: s.kinds };
  }
  return null;
}

/** World connectors of pieces in hand (a single piece or a group) at the poses shown. */
export function heldConnectors(pieces: readonly { partKey: string; pose: Matrix4Tuple }[], connectorsOf: (partKey: string) => PartConnectors | undefined): Connector[] {
  return pieces.flatMap((p) => (connectorsOf(p.partKey)?.connectors ?? []).map((c) => placeConnector(c, p.pose)));
}

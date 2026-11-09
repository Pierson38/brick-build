import { fits, isMale, isSegment, jointOf, placeConnector, type Connector, type JointKind, type PartConnectors, type Vec3 } from '../ldraw/connectors';
import type { Matrix4Tuple } from '../ldraw/types';

/**
 * Connections between placed pieces (free mode), from the connection interfaces recognised in the
 * LDraw parts (../ldraw/connectors.ts). ONE detector for everything: the joints of the placed pieces
 * (a stud in a receptor, a pin or an axle in a hole — touching, overlapping or merely lined-up
 * volumes are NOT a connection), the graph and the connected assemblies built from them, and the
 * snapping proposals that make the connectors of the piece(s) in hand fit free connectors nearby.
 * Pure 3D geometry: nothing depends on what the camera sees. World = LDraw coordinates; a connector
 * of a placed piece = its pose × the part-local connector.
 * See docs/implementation/CONNEXIONS_FIABILISEES.md.
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

/** Two connectors of two placed pieces that really fit together. */
export interface Joint {
  readonly male: WorldConnector;
  readonly female: WorldConnector;
  readonly kind: JointKind;
}

const CELL = 20;
const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`;
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const NONE: ReadonlySet<string> = new Set();

/** Axis-aligned box of a connector (a segment spans its length), grown by `pad`. */
function boxOf(c: Connector, pad: number): [Vec3, Vec3] {
  const h = c.half ?? 0;
  const lo: [number, number, number] = [0, 0, 0], hi: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const e = Math.abs(c.axis[i]!) * h;
    lo[i] = c.pos[i]! - e - pad;
    hi[i] = c.pos[i]! + e + pad;
  }
  return [lo, hi];
}

/** Connectors of placed pieces in world coordinates, by 20 LDU cells (a segment in every cell it crosses). */
export class ConnectorIndex {
  private readonly cells = new Map<string, WorldConnector[]>();
  readonly all: readonly WorldConnector[];
  private jointList: Joint[] | null = null;
  /** Pieces joined to each connector. */
  private holders: Map<WorldConnector, Set<string>> | null = null;

  constructor(pieces: readonly PlacedPiece[], connectorsOf: (partKey: string) => PartConnectors | undefined) {
    const all: WorldConnector[] = [];
    for (const p of pieces) {
      for (const c of connectorsOf(p.partKey)?.connectors ?? []) {
        const w: WorldConnector = { ...placeConnector(c, p.pose), piece: p.key };
        all.push(w);
        this.forCells(boxOf(w, 0), (k) => {
          const list = this.cells.get(k);
          if (list) list.push(w);
          else this.cells.set(k, [w]);
        });
      }
    }
    this.all = all;
  }

  private forCells([lo, hi]: [Vec3, Vec3], f: (key: string) => void) {
    const [x0, y0, z0] = lo.map((v) => Math.floor(v / CELL));
    const [x1, y1, z1] = hi.map((v) => Math.floor(v / CELL));
    for (let x = x0!; x <= x1!; x++) for (let y = y0!; y <= y1!; y++) for (let z = z0!; z <= z1!; z++) f(cellKey(x, y, z));
  }

  /** Connectors whose box comes within `pad` of the box of `c` (candidates; `fits` decides), stable order. */
  around(c: Connector, pad: number, exclude: ReadonlySet<string> = NONE): WorldConnector[] {
    const seen = new Set<WorldConnector>();
    const out: WorldConnector[] = [];
    this.forCells(boxOf(c, pad), (k) => {
      for (const w of this.cells.get(k) ?? []) {
        if (seen.has(w) || exclude.has(w.piece)) continue;
        seen.add(w);
        out.push(w);
      }
    });
    return out;
  }

  /** Connectors within `radius` of `pos` (segments: within `radius` of their line piece). */
  near(pos: Vec3, radius: number, exclude: ReadonlySet<string> = NONE): WorldConnector[] {
    return this.around({ kind: 'stud', pos, axis: [0, -1, 0] }, radius, exclude).filter((w) => segmentDistance(w, pos) <= radius);
  }

  /** Every pair of connectors of two different placed pieces that fit (computed once). */
  joints(): readonly Joint[] {
    if (!this.jointList) {
      const list: Joint[] = [];
      for (const m of this.all) {
        if (!isMale(m.kind)) continue;
        for (const o of this.around(m, 1)) {
          if (o.piece === m.piece || !jointOf(m.kind, o.kind) || !fits(m, o)) continue;
          list.push({ male: m, female: o, kind: jointOf(m.kind, o.kind)! });
        }
      }
      this.jointList = list;
    }
    return this.jointList;
  }

  /**
   * Whether a placed connector is already joined to a placed piece outside `exclude` (pieces in hand).
   * A stud, a receptor or a hole takes one mate; an axle or a long pin goes on through several holes
   * (two holes in the same place are refused by the clash rule of the snapping, not here).
   */
  occupied(c: WorldConnector, exclude: ReadonlySet<string> = NONE): boolean {
    if (c.kind === 'axle' || c.kind === 'pin') return false;
    if (!this.holders) {
      this.holders = new Map();
      for (const j of this.joints()) {
        for (const [a, b] of [[j.male, j.female], [j.female, j.male]] as const) {
          let s = this.holders.get(a);
          if (!s) this.holders.set(a, (s = new Set()));
          s.add(b.piece);
        }
      }
    }
    for (const p of this.holders.get(c) ?? []) if (!exclude.has(p)) return true;
    return false;
  }
}

/** Distance from a point to a connector (its segment for pins, axles and holes). */
function segmentDistance(c: Connector, p: Vec3): number {
  if (!isSegment(c.kind)) return dist(c.pos, p);
  const v = [p[0] - c.pos[0], p[1] - c.pos[1], p[2] - c.pos[2]] as const;
  const t = Math.max(-(c.half ?? 0), Math.min(c.half ?? 0, v[0] * c.axis[0] + v[1] * c.axis[1] + v[2] * c.axis[2]));
  return dist(p, [c.pos[0] + c.axis[0] * t, c.pos[1] + c.axis[1] * t, c.pos[2] + c.axis[2] * t]);
}

/** Whether a connector of one piece and a connector of another fit together (either way round). */
export function joined(a: Connector, b: Connector): boolean {
  if (jointOf(a.kind, b.kind)) return fits(a, b);
  if (jointOf(b.kind, a.kind)) return fits(b, a);
  return false;
}

/** Graph of the placed pieces really connected by recognised connectors: piece key → neighbours. */
export function connectionGraph(index: ConnectorIndex): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  for (const j of index.joints()) {
    for (const [a, b] of [[j.male.piece, j.female.piece], [j.female.piece, j.male.piece]] as const) {
      let s = graph.get(a);
      if (!s) graph.set(a, (s = new Set()));
      s.add(b);
    }
  }
  return graph;
}

/** Kinds of the joints between two pieces (for the inventory and the explanations). */
export function jointsBetween(index: ConnectorIndex, a: string, b: string): JointKind[] {
  return [...new Set(index.joints().filter((j) => (j.male.piece === a && j.female.piece === b) || (j.male.piece === b && j.female.piece === a)).map((j) => j.kind))].sort();
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

export type SnapKind = 'stud' | 'pin' | 'axle';

export interface Engagement {
  /** Number of connector pairs that fit. */
  readonly pairs: number;
  /** Placed pieces they connect to (sorted). */
  readonly targets: readonly string[];
  /** World positions of the connectors that fit (markers of the preview). */
  readonly points: readonly Vec3[];
  /** Kinds of the connections ('stud' stud ↔ receptor, 'pin' pin ↔ hole, 'axle' axle ↔ hole). */
  readonly kinds: readonly SnapKind[];
}

export interface SnapProposal extends Engagement {
  /** Translation to apply to the piece(s) in hand. */
  readonly delta: Vec3;
}

export interface SnapOptions {
  /** Distance (LDU) within which a connector of the piece in hand looks for a mate. */
  readonly radius?: number;
  /** Manual height: only proposals that keep this height (the translation has no vertical part). */
  readonly keepHeight?: boolean;
  /** Placed pieces to ignore: the piece(s) in hand, still in the index at their former pose. */
  readonly exclude?: ReadonlySet<string>;
  /**
   * The translation that would bring the piece(s) back to the previous proposal: kept while it stays
   * valid and nearly as good, so that small pointer moves do not make the proposal jump.
   */
  readonly stick?: Vec3 | null;
  /** A proposal whose piece(s) would go through a placed piece other than its targets: rejected. */
  readonly collides?: (delta: Vec3, targets: readonly string[]) => boolean;
}

export const SNAP_RADIUS_LDU = 24;
/** Among the proposals at most this much farther than the nearest one, the most engaged wins. */
export const SNAP_NEAR_BAND_LDU = 10;
/** The previous proposal stays while the best new one is not this much nearer (and not more engaged). */
export const SNAP_STICKY_LDU = 8;
const round2 = (v: number) => Math.round(v * 100) / 100;
const kindOf = (male: Connector['kind']): SnapKind => (male === 'stud' ? 'stud' : male === 'pin' ? 'pin' : 'axle');
const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Male / female in either order, or null when the two kinds never fit. */
function pairOf(h: Connector, t: Connector): { male: Connector; female: Connector } | null {
  if (jointOf(h.kind, t.kind)) return { male: h, female: t };
  if (jointOf(t.kind, h.kind)) return { male: t, female: h };
  return null;
}

/** Axes compatible for a fit: same direction for studs, parallel for segments. */
const aligned = (h: Connector, t: Connector) => (isSegment(h.kind) ? Math.abs(dot3(h.axis, t.axis)) >= 0.99 : dot3(h.axis, t.axis) >= 0.99);

/**
 * Translation that makes `h` (in hand) fit `t` (placed): the same point for studs; for segments,
 * onto the same line, sliding along it by half-stud steps and only as far as a full engagement.
 */
function deltaFor(h: Connector, t: Connector): Vec3 {
  if (!isSegment(h.kind)) return [round2(t.pos[0] - h.pos[0]), round2(t.pos[1] - h.pos[1]), round2(t.pos[2] - h.pos[2])];
  const a = t.axis;
  const v = [h.pos[0] - t.pos[0], h.pos[1] - t.pos[1], h.pos[2] - t.pos[2]] as const;
  // half-stud steps counted from the faces (an end of the male segment in line with a face of the
  // hole, or 10, 20… LDU from it), not from the centres: a 6L axle in a ½ bush stays on its grid
  const room = Math.abs((t.half ?? 0) - (h.half ?? 0));
  const along = Math.max(-room, Math.min(room, Math.round((dot3(v, a) - room) / 10) * 10 + room));
  return [round2(t.pos[0] + a[0] * along - h.pos[0]), round2(t.pos[1] + a[1] * along - h.pos[1]), round2(t.pos[2] + a[2] * along - h.pos[2])];
}

/** Two connectors of the same kind in the same place, same axis. */
const twin = (moved: Connector, t: Connector) => t.kind === moved.kind && dist(t.pos, moved.pos) <= 0.6 && dot3(t.axis, moved.axis) > 0.99;

/**
 * Two studs (read from the primitives) or two segments in the same place: two pieces in the same
 * place — impossible. Two receptors (deduced, see connectors.ts) in the same place only mean that
 * one of them is not real near a slanted edge (two wing plates side by side in 31039): no veto, that
 * receptor just engages nothing.
 */
function clash(moved: Connector, t: Connector): boolean {
  if (t.kind !== moved.kind || moved.kind === 'antistud') return false;
  if (!isSegment(moved.kind)) return twin(moved, t);
  // two axles, pins or holes on the same line, overlapping by more than a sliver
  if (Math.abs(dot3(t.axis, moved.axis)) < 0.99) return false;
  const v = [moved.pos[0] - t.pos[0], moved.pos[1] - t.pos[1], moved.pos[2] - t.pos[2]] as const;
  const along = dot3(v, t.axis);
  const off = Math.hypot(v[0] - along * t.axis[0], v[1] - along * t.axis[1], v[2] - along * t.axis[2]);
  const overlap = Math.min(along + (moved.half ?? 0), t.half ?? 0) - Math.max(along - (moved.half ?? 0), -(t.half ?? 0));
  return off <= 0.6 && overlap > 2;
}

/** What the connectors of the piece(s) in hand engage, moved by `delta` (null when impossible). */
function evaluate(held: readonly Connector[], index: ConnectorIndex, delta: Vec3, exclude: ReadonlySet<string>): Engagement | null {
  const targets = new Set<string>();
  const points: Vec3[] = [];
  const kinds = new Set<SnapKind>();
  let pairs = 0;
  for (const h of held) {
    // rounded like the placed connectors: the marker of a receptor in hand is this point, shown and saved as is
    const moved: Connector = { ...h, pos: [round2(h.pos[0] + delta[0]), round2(h.pos[1] + delta[1]), round2(h.pos[2] + delta[2])] };
    const around = index.around(moved, 1, exclude);
    if (around.some((t) => clash(moved, t))) return null;
    if (moved.kind === 'antistud' && around.some((t) => twin(moved, t))) continue;
    // a connector already joined to another placed piece is not free
    const mate = around.find((t) => joined(moved, t) && !index.occupied(t, exclude));
    if (!mate) continue;
    pairs += 1;
    targets.add(mate.piece);
    const p = pairOf(moved, mate)!;
    points.push(isSegment(h.kind) ? segmentMarker(p.male, p.female) : isMale(h.kind) ? mate.pos : moved.pos);
    kinds.add(kindOf(p.male.kind));
  }
  points.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
  return { pairs, targets: [...targets].sort(), points, kinds: [...kinds].sort() };
}

/** Marker of a segment joint: the middle of the part of the hole that the male segment fills. */
function segmentMarker(male: Connector, female: Connector): Vec3 {
  const a = female.axis;
  const along = dot3([male.pos[0] - female.pos[0], male.pos[1] - female.pos[1], male.pos[2] - female.pos[2]], a);
  const lo = Math.max(along - (male.half ?? 0), -(female.half ?? 0)), hi = Math.min(along + (male.half ?? 0), female.half ?? 0);
  const m = (lo + hi) / 2;
  return [round2(female.pos[0] + a[0] * m), round2(female.pos[1] + a[1] * m), round2(female.pos[2] + a[2] * m)];
}

/** The connections really made by the piece(s) in hand exactly where they are shown (no move). */
export function engagedAt(held: readonly Connector[], index: ConnectorIndex, exclude: ReadonlySet<string> = NONE): Engagement {
  return evaluate(held, index, [0, 0, 0], exclude) ?? { pairs: 0, targets: [], points: [], kinds: [] };
}

/**
 * Snapping between pieces: translations that make a connector of the piece(s) in hand fit a
 * compatible free connector of a placed piece (the rotation stays the one chosen by the player: the
 * axes must already match — see diagnoseSnap). Choice, deterministic: the nearest proposals first
 * (within SNAP_NEAR_BAND_LDU of the nearest), among them the most connector pairs engaged at once,
 * then the smallest move, then a fixed order; the previous proposal is kept while it stays valid and
 * the best new one is neither more engaged nor SNAP_STICKY_LDU nearer.
 * `held` = connectors of the piece(s) in hand at the position shown, in world coordinates.
 */
export function proposeSnap(held: readonly Connector[], index: ConnectorIndex, options: SnapOptions = {}): SnapProposal | null {
  const radius = options.radius ?? SNAP_RADIUS_LDU;
  const exclude = options.exclude ?? NONE;
  const deltas = new Map<string, Vec3>();
  for (const h of held) {
    for (const t of index.around(h, radius, exclude)) {
      if (!pairOf(h, t) || !aligned(h, t)) continue;
      const d = deltaFor(h, t);
      if (Math.hypot(...d) > radius) continue;
      if (options.keepHeight && Math.abs(d[1]) > 0.5) continue;
      deltas.set(d.join(','), d);
    }
  }
  // nearest first: once a valid proposal is found, only the near band (and the previous proposal) can win
  const stickKey = options.stick ? options.stick.map(round2).join(',') : null;
  const candidates = [...deltas].map(([key, d]) => ({ key, d, len: Math.hypot(...d) })).sort((a, b) => a.len - b.len || (a.key < b.key ? -1 : 1));
  const valid: (SnapProposal & { len: number; key: string })[] = [];
  let nearest = Infinity;
  for (const { key, d, len } of candidates) {
    if (len > nearest + SNAP_NEAR_BAND_LDU && key !== stickKey) continue;
    const e = evaluate(held, index, d, exclude);
    if (!e || e.pairs === 0 || options.collides?.(d, e.targets)) continue;
    valid.push({ ...e, delta: d, len, key });
    nearest = Math.min(nearest, len);
  }
  if (valid.length === 0) return null;
  const order = (a: (typeof valid)[number], b: (typeof valid)[number]) => b.pairs - a.pairs || a.len - b.len || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  let best = valid.filter((s) => s.len <= nearest + SNAP_NEAR_BAND_LDU).sort(order)[0]!;
  const stick = options.stick;
  if (stick) {
    const previous = valid.find((s) => Math.abs(s.delta[0] - stick[0]) < 0.01 && Math.abs(s.delta[1] - stick[1]) < 0.01 && Math.abs(s.delta[2] - stick[2]) < 0.01);
    if (previous && previous.pairs >= best.pairs && previous.len <= best.len + SNAP_STICKY_LDU) best = previous;
  }
  return { delta: best.delta, pairs: best.pairs, targets: best.targets, points: best.points, kinds: best.kinds };
}

export type SnapMiss = 'NO_CONNECTOR' | 'AXES' | 'OCCUPIED' | 'NONE_NEAR';

/**
 * Why no proposal: the piece has no recognised connector; compatible connectors are near but their
 * axes do not match (turn the piece); the aligned ones are taken or would put two pieces in the same
 * place; or nothing compatible is near. Never a false success: the engine only states what it checked.
 */
export function diagnoseSnap(held: readonly Connector[], index: ConnectorIndex, options: SnapOptions = {}): SnapMiss {
  if (held.length === 0) return 'NO_CONNECTOR';
  const radius = options.radius ?? SNAP_RADIUS_LDU;
  const exclude = options.exclude ?? NONE;
  let compatible = false, axes = false;
  for (const h of held) {
    for (const t of index.around(h, radius, exclude)) {
      if (!pairOf(h, t) || segmentDistance(t, h.pos) > radius + (h.half ?? 0)) continue;
      compatible = true;
      if (aligned(h, t)) axes = true;
    }
  }
  return !compatible ? 'NONE_NEAR' : !axes ? 'AXES' : 'OCCUPIED';
}

/** World connectors of pieces in hand (a single piece or a group) at the poses shown. */
export function heldConnectors(pieces: readonly { partKey: string; pose: Matrix4Tuple }[], connectorsOf: (partKey: string) => PartConnectors | undefined): Connector[] {
  return pieces.flatMap((p) => (connectorsOf(p.partKey)?.connectors ?? []).map((c) => placeConnector(c, p.pose)));
}

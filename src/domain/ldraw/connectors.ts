import { fromLDraw, multiply } from './matrix';
import type { Matrix4Tuple } from './types';

/**
 * Connection interfaces of an LDraw part, read from the primitives its file references — the LDraw
 * library describes GEOMETRY, not connections: there is no official connection metadata. What can be
 * deduced reliably is deliberately limited (see docs/implementation/MONTAGE_LIBRE_CONNEXIONS.md):
 *
 * - `stud`: a male stud primitive (stud.dat, stud2.dat "Open", logo variants…): its base centre and
 *   its axis (part-local -Y of the primitive = the direction the stud points to).
 * - `antistud`: a place under the part where a stud fits. LDraw has no primitive for it: deduced for
 *   parts whose underside has stud tubes (stud3* / stud4*) or, without tubes, studs on top (1×1
 *   parts): grid points (20 LDU, aligned on the studs or on the tubes) inside the footprint of the
 *   bottom face (the tube base plane), axis pointing up into the part. Tiles have neither tubes nor
 *   studs in their files: for them only, the standard title "Tile W x L" gives the receptor grid.
 * - `pin`: one half of a Technic pin (connect*, confric*): a 20 LDU segment.
 * - `pinhole`: a Technic pin hole, between two collinear peg hole ends (peghole.dat) of the part.
 *
 * Not recognised (reported, never invented): axles and axle holes (both are drawn with the same
 * axlehol* primitives, a male axle cannot be told from a hole), beam holes without peg hole ends,
 * clips, bars, hinges, ball joints, Duplo, Scala. Pure functions; the file reader is injected.
 */

export type Vec3 = readonly [number, number, number];
export type ConnectorKind = 'stud' | 'antistud' | 'pin' | 'pinhole';

export interface Connector {
  readonly kind: ConnectorKind;
  /** stud / antistud: base centre; pin / pinhole: segment midpoint. */
  readonly pos: Vec3;
  /** Unit axis. stud / antistud: from the base towards the stud tip; pin / pinhole: segment direction. */
  readonly axis: Vec3;
  /** pin / pinhole: half length of the segment along the axis. */
  readonly half?: number;
}

export interface PartConnectors {
  readonly connectors: readonly Connector[];
  /** Technic axle primitives were seen: axle connections of this part are NOT recognised. */
  readonly axleUnrecognised: boolean;
}

export type ReadFile = (name: string) => Promise<string | null>;

const MALE_STUD = /^(stud|stud2|stud2a|stud6|stud6a|stud10|stud13|stud15|stud17|stud17a|stud26|stud-logo\d*|stud2-logo\d*)\.dat$/;
const TUBE_SMALL = /^stud3a?\.dat$/; // 1-wide parts: between two receptors
const TUBE_OPEN = /^stud4(a|f\d[nsw]|h|o|od|oda|s|s2)?\.dat$/; // 2-wide parts: between four receptors
const PEG_HOLE_END = /^peghole\.dat$/;
const PIN_HALF = /^(connect|connect2|confric|confric2|confric5|confric6)\.dat$/;
const AXLE = /^(axle|axleend\d*|axlehol\d*|axlehole)\.dat$/;
/** Plain geometry primitives: never recursed (no connector inside). */
const GEOMETRY = /^(\d+-\d+[a-z]+\d*|box\w*|rect\w*|tri\w*|edge\w*|cyl\w*|con\d\w*|ndis\w*|disc\w*|ring\w*|chrd\w*|bump\w*|filstud\w*|t\d\d\w*|\d+-\d+\w*)\.dat$/;

const GRID = 20;
const MAX_DEPTH = 16;
const EPS = 0.6;

interface Raw {
  studs: Matrix4Tuple[];
  tubesSmall: Matrix4Tuple[];
  tubesOpen: Matrix4Tuple[];
  pegEnds: Matrix4Tuple[];
  pins: Matrix4Tuple[];
  axle: boolean;
  /** Vertices of the faces (x, y, z flattened), for the bottom footprint. */
  vertices: number[];
}

const empty = (): Raw => ({ studs: [], tubesSmall: [], tubesOpen: [], pegEnds: [], pins: [], axle: false, vertices: [] });
const baseName = (ref: string) => ref.replace(/\\/g, '/').split('/').pop()!.toLowerCase();
const apply = (m: Matrix4Tuple, p: Vec3): [number, number, number] => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];
const dir = (m: Matrix4Tuple, d: Vec3): [number, number, number] => {
  const v: [number, number, number] = [m[0] * d[0] + m[4] * d[1] + m[8] * d[2], m[1] * d[0] + m[5] * d[1] + m[9] * d[2], m[2] * d[0] + m[6] * d[1] + m[10] * d[2]];
  const n = Math.hypot(...v) || 1;
  return [clean(v[0] / n), clean(v[1] / n), clean(v[2] / n)];
};
/** Exact -1 / 0 / 1 when within 1e-9: quarter-turn compositions never drift. */
const clean = (v: number) => (Math.abs(v) < 1e-9 ? 0 : Math.abs(v - 1) < 1e-9 ? 1 : Math.abs(v + 1) < 1e-9 ? -1 : v);
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Reads a part file and its sub-files once each (cache by file name), collecting primitives in part-local coordinates. */
async function collect(name: string, read: ReadFile, cache: Map<string, Promise<Raw | null>>, depth: number): Promise<Raw | null> {
  const key = name.replace(/\\/g, '/').toLowerCase();
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const text = await read(key);
      if (text === null) return null;
      const raw = empty();
      for (const line of text.split(/\r?\n/)) {
        const t = line.trim().split(/\s+/);
        if (t[0] === '3' || t[0] === '4') {
          for (let i = 2; i + 2 < t.length; i += 3) raw.vertices.push(Number(t[i]), Number(t[i + 1]), Number(t[i + 2]));
          continue;
        }
        if (t[0] !== '1' || t.length < 15) continue;
        const m = fromLDraw(t.slice(2, 14).map(Number));
        const ref = t.slice(14).join(' ');
        const base = baseName(ref);
        if (MALE_STUD.test(base)) raw.studs.push(m);
        else if (TUBE_SMALL.test(base)) raw.tubesSmall.push(m);
        else if (TUBE_OPEN.test(base)) raw.tubesOpen.push(m);
        else if (PEG_HOLE_END.test(base)) raw.pegEnds.push(m);
        else if (PIN_HALF.test(base)) raw.pins.push(m);
        else if (AXLE.test(base)) raw.axle = true;
        else if (depth < MAX_DEPTH) {
          const sub = await collect(ref, read, cache, depth + 1);
          if (!sub) continue;
          const tr = (list: Matrix4Tuple[]) => list.map((x) => multiply(m, x));
          raw.studs.push(...tr(sub.studs));
          raw.tubesSmall.push(...tr(sub.tubesSmall));
          raw.tubesOpen.push(...tr(sub.tubesOpen));
          raw.pegEnds.push(...tr(sub.pegEnds));
          raw.pins.push(...tr(sub.pins));
          raw.axle ||= sub.axle;
          if (!GEOMETRY.test(base) || sub.vertices.length < 3000) {
            for (let i = 0; i + 2 < sub.vertices.length; i += 3) raw.vertices.push(...apply(m, [sub.vertices[i]!, sub.vertices[i + 1]!, sub.vertices[i + 2]!]));
          }
        }
      }
      return raw;
    })();
    cache.set(key, p);
  }
  return p;
}

/** Turns the collected primitives into connectors (part-local LDraw coordinates). */
export function connectorsOf(raw: { studs: readonly Matrix4Tuple[]; tubesSmall: readonly Matrix4Tuple[]; tubesOpen: readonly Matrix4Tuple[]; pegEnds: readonly Matrix4Tuple[]; pins: readonly Matrix4Tuple[]; axle: boolean; vertices: readonly number[] }, title = ''): PartConnectors {
  const out: Connector[] = [];
  const studs = raw.studs.map((m) => ({ pos: apply(m, [0, 0, 0]).map(round2) as unknown as Vec3, axis: dir(m, [0, -1, 0]) }));
  for (const s of studs) out.push({ kind: 'stud', pos: s.pos, axis: s.axis });

  // receptors under the part: only for parts standing upright in their own frame (tubes along -Y)
  const tubes = [...raw.tubesSmall.map((m) => ({ m, open: false })), ...raw.tubesOpen.map((m) => ({ m, open: true }))]
    .filter(({ m }) => Math.abs(dir(m, [0, -1, 0])[1]) > 0.99);
  const tubeEnds = tubes.map(({ m, open }) => {
    const a = apply(m, [0, 0, 0]), b = apply(m, [0, -4, 0]);
    return { x: round2(a[0]), z: round2(a[2]), bottom: round2(Math.max(a[1], b[1])), open };
  });
  const upStuds = studs.filter((s) => s.axis[1] < -0.99);
  let bottom: number | null = null;
  const tile = /^~?Tile\s+\d+(\.\d+)?\s*x\s*\d+/i.test(title);
  if (tubeEnds.length > 0) bottom = Math.max(...tubeEnds.map((t) => t.bottom));
  else if ((upStuds.length > 0 || tile) && raw.vertices.length > 0) {
    // no tube (1 × 1 parts, tiles): the lowest face
    let max = -Infinity;
    for (let i = 1; i < raw.vertices.length; i += 3) max = Math.max(max, raw.vertices[i]!);
    bottom = round2(max);
  }
  if (bottom !== null) {
    let [minX, maxX, minZ, maxZ] = [Infinity, -Infinity, Infinity, -Infinity];
    // tiles (no studs, no tubes): the bottom rim is inset, the whole outline gives the grid
    const tileOnly = tile && tubeEnds.length === 0 && upStuds.length === 0;
    for (let i = 0; i + 2 < raw.vertices.length; i += 3) {
      if (!tileOnly && Math.abs(raw.vertices[i + 1]! - bottom) > EPS) continue;
      minX = Math.min(minX, raw.vertices[i]!); maxX = Math.max(maxX, raw.vertices[i]!);
      minZ = Math.min(minZ, raw.vertices[i + 2]!); maxZ = Math.max(maxZ, raw.vertices[i + 2]!);
    }
    // grid phase: the studs on top, else the receptors around a tube
    // an open tube (2-wide) sits between four receptors, a small tube (1-wide) between two along the length
    const t0 = tubeEnds.find((t) => t.open) ?? tubeEnds[0];
    const alongX = maxX - minX >= maxZ - minZ;
    const fromTube = t0 ? (t0.open ? [t0.x + GRID / 2, 0, t0.z + GRID / 2] : alongX ? [t0.x + GRID / 2, 0, t0.z] : [t0.x, 0, t0.z + GRID / 2]) : null;
    const ref = upStuds[0]?.pos ?? fromTube ?? (tile && Number.isFinite(minX) ? [minX + GRID / 2, 0, minZ + GRID / 2] : null);
    if (ref && Number.isFinite(minX)) {
      const phase = (v: number) => ((v % GRID) + GRID) % GRID;
      const px = phase(ref[0]), pz = phase(ref[2]);
      const seen = new Set<string>();
      // the bottom rim of tiles and some plates is inset by 1 LDU: a receptor within 1.6 LDU of the edge counts
      const F = 1.6;
      for (let x = Math.ceil((minX + GRID / 2 - F - px) / GRID) * GRID + px; x <= maxX - GRID / 2 + F; x += GRID) {
        for (let z = Math.ceil((minZ + GRID / 2 - F - pz) / GRID) * GRID + pz; z <= maxZ - GRID / 2 + F; z += GRID) {
          const k = `${round2(x)},${round2(z)}`;
          if (seen.has(k)) continue;
          seen.add(k);
          out.push({ kind: 'antistud', pos: [round2(x), bottom, round2(z)], axis: [0, -1, 0] });
        }
      }
    }
  }

  // Technic pins: each half is a 20 LDU segment from the collar outwards
  for (const m of raw.pins) {
    const a = apply(m, [0, 0, 0]), b = apply(m, [0, -20, 0]);
    out.push({ kind: 'pin', pos: [round2((a[0] + b[0]) / 2), round2((a[1] + b[1]) / 2), round2((a[2] + b[2]) / 2)], axis: dir(m, [0, -1, 0]), half: 10 });
  }
  // Technic pin holes: two collinear peg hole ends of the part, 10 to 40 LDU apart
  const ends = raw.pegEnds.map((m) => ({ p: apply(m, [0, 0, 0]), a: dir(m, [0, -1, 0]) }));
  const used = new Set<number>();
  for (let i = 0; i < ends.length; i++) {
    if (used.has(i)) continue;
    let best = -1, bestD = Infinity;
    for (let j = 0; j < ends.length; j++) {
      if (j === i || used.has(j)) continue;
      const d = [ends[j]!.p[0] - ends[i]!.p[0], ends[j]!.p[1] - ends[i]!.p[1], ends[j]!.p[2] - ends[i]!.p[2]];
      const len = Math.hypot(...d);
      if (len < 9.5 || len > 40.5) continue;
      const a = ends[i]!.a;
      const cross = Math.hypot(d[1]! * a[2] - d[2]! * a[1], d[2]! * a[0] - d[0]! * a[2], d[0]! * a[1] - d[1]! * a[0]);
      if (cross > EPS) continue;
      if (len < bestD) { best = j; bestD = len; }
    }
    if (best < 0) continue;
    used.add(i).add(best);
    const p = ends[i]!.p, q = ends[best]!.p;
    out.push({ kind: 'pinhole', pos: [round2((p[0] + q[0]) / 2), round2((p[1] + q[1]) / 2), round2((p[2] + q[2]) / 2)], axis: ends[i]!.a, half: round2(bestD / 2) });
  }
  return { connectors: out, axleUnrecognised: raw.axle };
}

/** Connection interfaces of a part (part-local), its sub-files read once each through `cache`. */
export async function scanPartConnectors(partRef: string, read: ReadFile, cache = new Map<string, Promise<Raw | null>>()): Promise<PartConnectors> {
  const raw = await collect(partRef, read, cache, 0);
  const title = ((await read(partRef.replace(/\\/g, '/').toLowerCase())) ?? '').split(/\r?\n/, 1)[0]?.replace(/^0\s+/, '').trim() ?? '';
  return raw ? connectorsOf(raw, title) : { connectors: [], axleUnrecognised: false };
}

/** A connector of a placed piece in world (LDraw) coordinates. */
export function placeConnector(c: Connector, pose: Matrix4Tuple): Connector {
  return { kind: c.kind, pos: apply(pose, c.pos).map(round2) as unknown as Vec3, axis: dir(pose, c.axis), ...(c.half !== undefined ? { half: c.half } : {}) };
}

/** Male / female pairs that fit: stud ↔ antistud (same point, same axis), pin ↔ pinhole (collinear, overlapping). */
export function fits(male: Connector, female: Connector, eps = EPS): boolean {
  const dot = male.axis[0] * female.axis[0] + male.axis[1] * female.axis[1] + male.axis[2] * female.axis[2];
  if (male.kind === 'stud' && female.kind === 'antistud') {
    return dot > 0.99 && Math.hypot(male.pos[0] - female.pos[0], male.pos[1] - female.pos[1], male.pos[2] - female.pos[2]) <= eps;
  }
  if (male.kind === 'pin' && female.kind === 'pinhole') {
    if (Math.abs(dot) < 0.99) return false;
    const d = [male.pos[0] - female.pos[0], male.pos[1] - female.pos[1], male.pos[2] - female.pos[2]] as const;
    const along = d[0] * female.axis[0] + d[1] * female.axis[1] + d[2] * female.axis[2];
    const off = Math.hypot(d[0] - along * female.axis[0], d[1] - along * female.axis[1], d[2] - along * female.axis[2]);
    const overlap = Math.min(along + (male.half ?? 0), female.half ?? 0) - Math.max(along - (male.half ?? 0), -(female.half ?? 0));
    return off <= eps && overlap >= 8;
  }
  return false;
}

export const isMale = (k: ConnectorKind) => k === 'stud' || k === 'pin';
export const mateOf = (k: ConnectorKind): ConnectorKind => (k === 'stud' ? 'antistud' : k === 'antistud' ? 'stud' : k === 'pin' ? 'pinhole' : 'pin');

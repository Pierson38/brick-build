import { CONNECTOR_METADATA } from './connector-metadata';
import { fromLDraw, multiply } from './matrix';
import type { Matrix4Tuple } from './types';

/**
 * Connection interfaces of an LDraw part, read from the primitives its file references — the LDraw
 * library describes GEOMETRY, not connections: there is no official connection metadata. What can be
 * deduced reliably is deliberately limited (see docs/implementation/MONTAGE_LIBRE_CONNEXIONS.md and
 * CONNEXIONS_FIABILISEES.md):
 *
 * - `stud`: a male stud primitive (stud.dat, stud2.dat "Open", logo variants…): its base centre and
 *   its axis (part-local -Y of the primitive = the direction the stud points to).
 * - `antistud`: a place under the part where a stud fits. LDraw has no primitive for it: deduced for
 *   parts whose underside has stud tubes (stud3* / stud4*) or, without tubes, studs on top (1×1
 *   parts): grid points (20 LDU, aligned on the tubes or on the studs) inside the footprint of the
 *   bottom face (the tube base plane), axis pointing up into the part — and only where something
 *   real vouches for it: a stud right above, or a tube right beside (a corner cut off a wedge plate
 *   has neither, it gets no receptor). Tiles have neither tubes nor studs in their files: for them
 *   only, the standard title "Tile W x L" gives the receptor grid.
 * - `pin`: a Technic pin segment (connect*, confric* "Technic Pin 1.0 / 0.5 / Middle"): from the
 *   collar outwards, its length read from the primitive's standard title (20 LDU, 10 for "0.5").
 * - `pinhole`: a Technic pin hole, between two collinear peg hole ends (peghole.dat) of the part
 *   (beam holes and connector holes are drawn with them).
 * - `axle`: a male Technic axle, between two collinear axle end primitives facing each other
 *   (axleend*.dat "Technic Axle End …", only drawn at the tips of real axles), or the 20 LDU axle of
 *   an axle pin (axleend20.dat "Technic Axle End 20 LDU").
 * - `axlehole`: a cross-shaped hole (axlehole / axl2hole / axl3hole / axl4hole / axlehol4 / axlehol5
 *   "Technic Axle Hole …"), its depth = the primitive's Y scale; collinear pieces are merged.
 *
 * Not recognised (reported, never invented): `axlehol8` "Axle Perimeter" and the other axle edge
 * primitives alone (shared by axles and holes), an axle end without its opposite end, clips, bars,
 * hinges, ball joints, Duplo, Scala. Pure functions; the file reader is injected.
 */

export type Vec3 = readonly [number, number, number];
export type ConnectorKind = 'stud' | 'antistud' | 'pin' | 'pinhole' | 'axle' | 'axlehole';

export interface Connector {
  readonly kind: ConnectorKind;
  /** stud / antistud: base centre; segments (pin, pinhole, axle, axlehole): segment midpoint. */
  readonly pos: Vec3;
  /** Unit axis. stud / antistud: from the base towards the stud tip; segments: segment direction. */
  readonly axis: Vec3;
  /** Segments: half length along the axis. */
  readonly half?: number;
}

export interface PartConnectors {
  readonly connectors: readonly Connector[];
  /** Technic axle primitives were seen that gave no recognised axle or axle hole (uncertain). */
  readonly axleUnrecognised: boolean;
}

export type ReadFile = (name: string) => Promise<string | null>;

const MALE_STUD = /^(stud|stud2|stud2a|stud6|stud6a|stud10|stud13|stud15|stud17|stud17a|stud26|stud-logo\d*|stud2-logo\d*)\.dat$/;
const TUBE_SMALL = /^stud3a?\.dat$/; // 1-wide parts: between two receptors
const TUBE_OPEN = /^stud4(a|f\d[nsw]|h|o|od|oda|s|s2)?\.dat$/; // 2-wide parts: between four receptors
const PEG_HOLE_END = /^peghole\.dat$/;
/** Technic pin primitives (standard titles "Technic [Friction] Pin 1.0 / 0.5 / 2.0 / Middle …"): length in LDU along -Y. */
const PIN_LENGTH: Readonly<Record<string, number>> = {
  'connect.dat': 20, 'connect2.dat': 20, 'connect5.dat': 20, 'connect6.dat': 20, 'connect7.dat': 20, 'connect8.dat': 20, 'connect10.dat': 20,
  'connect3.dat': 10, 'connect4.dat': 10,
  'confric.dat': 20, 'confric2.dat': 20, 'confric4.dat': 20, 'confric5.dat': 20, 'confric6.dat': 20, 'confric8.dat': 20, 'confric9.dat': 20,
  'confric10.dat': 20, 'confric11.dat': 20, 'confric12.dat': 20, 'confric3.dat': 40,
};
/** Tip of a real axle: the axle body goes along the primitive's +Y. */
const AXLE_END = /^(axleend|axleend2|axleend2hole)\.dat$/;
/** 20 LDU of axle ending in a tip, along the primitive's -Y (axle pins). */
const AXLE_HALF = /^axleend20\.dat$/;
/** Cross-shaped hole, local y from 0 to 1 (scaled by the part). */
const AXLE_HOLE = /^(axlehole|axl2hole|axl3hole|axl4hole|axlehol4|axlehol5)\.dat$/;
/** Other axle geometry (perimeter, edges, end surfaces of holes…): shared by axles and holes, not a connector by itself. */
const AXLE_OTHER = /^(axle|axl)\w*\.dat$/;
/** Plain geometry primitives: never recursed (no connector inside). */
const GEOMETRY = /^(\d+-\d+[a-z]+\d*|box\w*|rect\w*|tri\w*|edge\w*|cyl\w*|con\d\w*|ndis\w*|disc\w*|ring\w*|chrd\w*|bump\w*|filstud\w*|t\d\d\w*|\d+-\d+\w*)\.dat$/;

const GRID = 20;
const MAX_DEPTH = 16;
const EPS = 0.6;
/** An axle end and its opposite end: at most this far apart (the longest axle, 32, is 640 LDU). */
const MAX_AXLE_LDU = 660;

interface Raw {
  studs: Matrix4Tuple[];
  tubesSmall: Matrix4Tuple[];
  tubesOpen: Matrix4Tuple[];
  pegEnds: Matrix4Tuple[];
  pins: { m: Matrix4Tuple; length: number }[];
  axleEnds: Matrix4Tuple[];
  axleHalves: Matrix4Tuple[];
  axleHoles: Matrix4Tuple[];
  /** Axle geometry that is not a connector by itself was seen. */
  axleOther: boolean;
  /** Vertices of the faces (x, y, z flattened), for the bottom footprint. */
  vertices: number[];
}
export type RawPrimitives = Readonly<{ [K in keyof Raw]: Raw[K] extends unknown[] ? readonly Raw[K][number][] : Raw[K] }>;

const empty = (): Raw => ({ studs: [], tubesSmall: [], tubesOpen: [], pegEnds: [], pins: [], axleEnds: [], axleHalves: [], axleHoles: [], axleOther: false, vertices: [] });
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
const r3 = (p: readonly number[]): Vec3 => [round2(p[0]!), round2(p[1]!), round2(p[2]!)];
const sub = (a: Vec3, b: Vec3): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** Distance of `d` (a vector) from the line of unit direction `a`. */
const offLine = (d: Vec3, a: Vec3) => Math.hypot(d[1] * a[2] - d[2] * a[1], d[2] * a[0] - d[0] * a[2], d[0] * a[1] - d[1] * a[0]);
/** One direction per line (the first non-zero coordinate positive): segments of a part compare the same way. */
const canonical = (a: Vec3): Vec3 => {
  const s = Math.abs(a[0]) > 1e-9 ? Math.sign(a[0]) : Math.abs(a[1]) > 1e-9 ? Math.sign(a[1]) : Math.sign(a[2]) || 1;
  return [clean(a[0] * s), clean(a[1] * s), clean(a[2] * s)];
};

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
        else if (PIN_LENGTH[base] !== undefined) raw.pins.push({ m, length: PIN_LENGTH[base]! });
        else if (AXLE_END.test(base)) raw.axleEnds.push(m);
        else if (AXLE_HALF.test(base)) raw.axleHalves.push(m);
        else if (AXLE_HOLE.test(base)) raw.axleHoles.push(m);
        else if (AXLE_OTHER.test(base)) raw.axleOther = true;
        else if (depth < MAX_DEPTH) {
          const sub = await collect(ref, read, cache, depth + 1);
          if (!sub) continue;
          const tr = (list: Matrix4Tuple[]) => list.map((x) => multiply(m, x));
          raw.studs.push(...tr(sub.studs));
          raw.tubesSmall.push(...tr(sub.tubesSmall));
          raw.tubesOpen.push(...tr(sub.tubesOpen));
          raw.pegEnds.push(...tr(sub.pegEnds));
          raw.pins.push(...sub.pins.map((x) => ({ m: multiply(m, x.m), length: x.length })));
          raw.axleEnds.push(...tr(sub.axleEnds));
          raw.axleHalves.push(...tr(sub.axleHalves));
          raw.axleHoles.push(...tr(sub.axleHoles));
          raw.axleOther ||= sub.axleOther;
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

/** Receptors under an upright part (see the header): grid points vouched for by a stud above or a tube beside. */
function antistuds(raw: RawPrimitives, upStuds: readonly { pos: Vec3 }[], title: string): Connector[] {
  const tubes = [...raw.tubesSmall.map((m) => ({ m, open: false })), ...raw.tubesOpen.map((m) => ({ m, open: true }))]
    .filter(({ m }) => Math.abs(dir(m, [0, -1, 0])[1]) > 0.99);
  const tubeEnds = tubes.map(({ m, open }) => {
    const a = apply(m, [0, 0, 0]), b = apply(m, [0, -4, 0]);
    return { x: round2(a[0]), z: round2(a[2]), bottom: round2(Math.max(a[1], b[1])), open };
  });
  const tile = /^~?Tile\s+\d+(\.\d+)?\s*x\s*\d+/i.test(title);
  let bottom: number | null = null;
  if (tubeEnds.length > 0) bottom = Math.max(...tubeEnds.map((t) => t.bottom));
  else if ((upStuds.length > 0 || tile) && raw.vertices.length > 0) {
    // no tube (1 × 1 parts, tiles): the lowest face
    let max = -Infinity;
    for (let i = 1; i < raw.vertices.length; i += 3) max = Math.max(max, raw.vertices[i]!);
    bottom = round2(max);
  }
  if (bottom === null) return [];
  let [minX, maxX, minZ, maxZ] = [Infinity, -Infinity, Infinity, -Infinity];
  // tiles (no studs, no tubes): the bottom rim is inset, the whole outline gives the grid
  const tileOnly = tile && tubeEnds.length === 0 && upStuds.length === 0;
  for (let i = 0; i + 2 < raw.vertices.length; i += 3) {
    if (!tileOnly && Math.abs(raw.vertices[i + 1]! - bottom) > EPS) continue;
    minX = Math.min(minX, raw.vertices[i]!); maxX = Math.max(maxX, raw.vertices[i]!);
    minZ = Math.min(minZ, raw.vertices[i + 2]!); maxZ = Math.max(maxZ, raw.vertices[i + 2]!);
  }
  if (!Number.isFinite(minX)) return [];
  // a 1 × 1 footprint (round tiles and plates): the stud goes INSIDE the tube, at its centre
  const single = maxX - minX <= GRID + 1.6 && maxZ - minZ <= GRID + 1.6;
  const phase = (v: number) => ((v % GRID) + GRID) % GRID;
  const halfStud = (v: number) => Math.round(v / (GRID / 2)) * (GRID / 2);
  // an outline side whose length is a whole number of studs (no rail, handle or hinge sticking out)
  const wholeStuds = (lo: number, hi: number) => Math.abs((hi - lo) / GRID - Math.round((hi - lo) / GRID)) * GRID <= 2.2;
  const outline = [halfStud(minX + GRID / 2), halfStud(minZ + GRID / 2)] as const;
  // grid phase: the studs on top, else the tubes (an open tube sits between four receptors; a small
  // tube between two, along the side that keeps them inside the outline), else the outline (tiles)
  const t0 = tubeEnds.find((t) => t.open) ?? tubeEnds[0];
  const fromTube = !t0 ? null : single ? [t0.x, t0.z]
    : t0.open ? [t0.x + GRID / 2, t0.z + GRID / 2]
      : maxX - minX >= maxZ - minZ ? [t0.x + GRID / 2, t0.z] : [t0.x, t0.z + GRID / 2];
  // studs half a stud off a clean outline: a jumper plate — its tube tells the receptors, without
  // a tube they cannot be told (rather none than invented ones)
  const off = (a: number, b: number) => Math.min(Math.abs(phase(a) - phase(b)), GRID - Math.abs(phase(a) - phase(b))) > 2;
  const jumper = upStuds.length > 0 && ((wholeStuds(minX, maxX) && off(upStuds[0]!.pos[0], outline[0])) || (wholeStuds(minZ, maxZ) && off(upStuds[0]!.pos[2], outline[1])));
  const ref = upStuds[0] && !jumper ? [upStuds[0].pos[0], upStuds[0].pos[2]] : fromTube ?? (tile ? outline : null);
  if (!ref) return [];
  const px = phase(ref[0]!), pz = phase(ref[1]!);
  // a 1-wide part with a clean outline: one channel under it, a stud fits under each grid point
  const channel = wholeStuds(minX, maxX) && wholeStuds(minZ, maxZ) && Math.min(maxX - minX, maxZ - minZ) <= GRID + 2.2;
  const near = (a: number, b: number) => Math.abs(a - b) <= 1.5;
  const vouched = (x: number, z: number) => tileOnly || (channel && !jumper)
    || (!jumper && upStuds.some((s) => near(s.pos[0], x) && near(s.pos[2], z)))
    || (single && tubeEnds.some((t) => near(t.x, x) && near(t.z, z)))
    || tubeEnds.some((t) => (t.open
      ? near(Math.abs(t.x - x), GRID / 2) && near(Math.abs(t.z - z), GRID / 2)
      : (near(Math.abs(t.x - x), GRID / 2) && near(t.z, z)) || (near(Math.abs(t.z - z), GRID / 2) && near(t.x, x))));
  const out: Connector[] = [];
  const seen = new Set<string>();
  // the bottom rim of tiles and some plates is inset by 1 LDU: a receptor within 1.6 LDU of the edge counts
  const F = 1.6;
  for (let x = Math.ceil((minX + GRID / 2 - F - px) / GRID) * GRID + px; x <= maxX - GRID / 2 + F; x += GRID) {
    for (let z = Math.ceil((minZ + GRID / 2 - F - pz) / GRID) * GRID + pz; z <= maxZ - GRID / 2 + F; z += GRID) {
      const k = `${round2(x)},${round2(z)}`;
      if (seen.has(k) || !vouched(x, z)) continue;
      seen.add(k);
      out.push({ kind: 'antistud', pos: [round2(x), bottom, round2(z)], axis: [0, -1, 0] });
    }
  }
  return out;
}

/** Collinear segments of one kind that touch or overlap: one segment (a long hole drawn in pieces). */
function mergeSegments(list: Connector[]): Connector[] {
  const out: Connector[] = [];
  const used = new Set<number>();
  for (let i = 0; i < list.length; i++) {
    if (used.has(i)) continue;
    const a = list[i]!;
    let lo = -a.half!, hi = a.half!;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j]!;
      if (used.has(j) || Math.abs(Math.abs(dot(a.axis, b.axis)) - 1) > 1e-6) continue;
      const d = sub(b.pos, a.pos);
      if (offLine(d, a.axis) > EPS) continue;
      const at = dot(d, a.axis);
      if (at - b.half! > hi + EPS || at + b.half! < lo - EPS) continue;
      lo = Math.min(lo, at - b.half!);
      hi = Math.max(hi, at + b.half!);
      used.add(j);
      j = i; // the segment grew: look again
    }
    const mid = (lo + hi) / 2;
    out.push({ kind: a.kind, pos: r3([a.pos[0] + a.axis[0] * mid, a.pos[1] + a.axis[1] * mid, a.pos[2] + a.axis[2] * mid]), axis: a.axis, half: round2((hi - lo) / 2) });
  }
  return out;
}

/** Turns the collected primitives into connectors (part-local LDraw coordinates). */
export function connectorsOf(raw: RawPrimitives, title = ''): PartConnectors {
  const out: Connector[] = [];
  const studs = raw.studs.map((m) => ({ pos: r3(apply(m, [0, 0, 0])), axis: dir(m, [0, -1, 0]) }));
  for (const s of studs) out.push({ kind: 'stud', pos: s.pos, axis: s.axis });

  // receptors under the part: only for parts standing upright in their own frame (tubes along -Y)
  out.push(...antistuds(raw, studs.filter((s) => s.axis[1] < -0.99), title));

  // Technic pins: each segment goes from the collar outwards (part-local -Y of the primitive)
  for (const { m, length } of raw.pins) {
    const a = apply(m, [0, 0, 0]), b = apply(m, [0, -length, 0]);
    out.push({ kind: 'pin', pos: r3([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]), axis: dir(m, [0, -1, 0]), half: length / 2 });
  }
  // Technic pin holes: two collinear peg hole ends of the part, 10 to 40 LDU apart
  const ends = raw.pegEnds.map((m) => ({ p: apply(m, [0, 0, 0]), a: dir(m, [0, -1, 0]) }));
  const used = new Set<number>();
  for (let i = 0; i < ends.length; i++) {
    if (used.has(i)) continue;
    let best = -1, bestD = Infinity;
    for (let j = 0; j < ends.length; j++) {
      if (j === i || used.has(j)) continue;
      const d = sub(ends[j]!.p, ends[i]!.p);
      const len = Math.hypot(...d);
      if (len < 9.5 || len > 40.5 || offLine(d, ends[i]!.a) > EPS) continue;
      if (len < bestD) { best = j; bestD = len; }
    }
    if (best < 0) continue;
    used.add(i).add(best);
    const p = ends[i]!.p, q = ends[best]!.p;
    out.push({ kind: 'pinhole', pos: r3([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2]), axis: ends[i]!.a, half: round2(bestD / 2) });
  }

  // Technic axles: an axle tip and the opposite tip facing it on the same line (the body between them)
  const axles: Connector[] = [];
  const tips = raw.axleEnds.map((m) => ({ p: apply(m, [0, 0, 0]) as Vec3, inward: dir(m, [0, 1, 0]) as Vec3 }));
  const paired = new Set<number>();
  for (let i = 0; i < tips.length; i++) {
    if (paired.has(i)) continue;
    let best = -1, bestD = Infinity;
    for (let j = 0; j < tips.length; j++) {
      if (j === i || paired.has(j) || dot(tips[i]!.inward, tips[j]!.inward) > -0.999) continue;
      const d = sub(tips[j]!.p, tips[i]!.p);
      const along = dot(d, tips[i]!.inward);
      if (along < 4 || along > MAX_AXLE_LDU || offLine(d, tips[i]!.inward) > EPS) continue;
      if (along < bestD) { best = j; bestD = along; }
    }
    if (best < 0) continue;
    paired.add(i).add(best);
    const p = tips[i]!.p, q = tips[best]!.p;
    axles.push({ kind: 'axle', pos: r3([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2]), axis: canonical(tips[i]!.inward), half: round2(bestD / 2) });
  }
  for (const m of raw.axleHalves) axles.push({ kind: 'axle', pos: r3(apply(m, [0, -10, 0])), axis: canonical(dir(m, [0, -1, 0])), half: 10 });
  out.push(...mergeSegments(axles));
  // axle holes: the primitive spans local y 0..1, scaled by the part
  const holes = raw.axleHoles.flatMap((m) => {
    const a = apply(m, [0, 0, 0]), b = apply(m, [0, 1, 0]);
    const len = Math.hypot(...sub(b, a));
    return len < 1 ? [] : [{ kind: 'axlehole' as const, pos: r3([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]), axis: canonical(dir(m, [0, 1, 0])), half: round2(len / 2) }];
  });
  out.push(...mergeSegments(holes));

  const unpairedTips = tips.length - paired.size;
  const axleUnrecognised = unpairedTips > 0 || (raw.axleOther && axles.length === 0 && holes.length === 0);
  return { connectors: out, axleUnrecognised };
}

/** Connection interfaces of a part (part-local), its sub-files read once each through `cache`. */
export async function scanPartConnectors(partRef: string, read: ReadFile, cache = new Map<string, Promise<Raw | null>>()): Promise<PartConnectors> {
  const raw = await collect(partRef, read, cache, 0);
  const title = ((await read(partRef.replace(/\\/g, '/').toLowerCase())) ?? '').split(/\r?\n/, 1)[0]?.replace(/^0\s+/, '').trim() ?? '';
  if (!raw) return { connectors: [], axleUnrecognised: false };
  const found = connectorsOf(raw, title);
  // controlled metadata (connector-metadata.ts) only adds what the primitives cannot tell
  const extra = CONNECTOR_METADATA[baseName(partRef)];
  return extra ? { ...found, connectors: [...found.connectors, ...extra.connectors] } : found;
}

/** A connector of a placed piece in world (LDraw) coordinates. */
export function placeConnector(c: Connector, pose: Matrix4Tuple): Connector {
  return { kind: c.kind, pos: r3(apply(pose, c.pos)), axis: dir(pose, c.axis), ...(c.half !== undefined ? { half: c.half } : {}) };
}

export const isSegment = (k: ConnectorKind) => k === 'pin' || k === 'pinhole' || k === 'axle' || k === 'axlehole';
export const isMale = (k: ConnectorKind) => k === 'stud' || k === 'pin' || k === 'axle';
/** Female kinds a male kind goes into: an axle also turns in a round pin hole. */
export const matesOf = (k: ConnectorKind): readonly ConnectorKind[] => ({
  stud: ['antistud'], antistud: ['stud'], pin: ['pinhole'], pinhole: ['pin', 'axle'], axle: ['axlehole', 'pinhole'], axlehole: ['axle'],
} as const)[k];

/** How two fitting connectors hold: a stud in a receptor or an axle in an axle hole is rigid; a round hole turns. */
export type JointKind = 'stud' | 'pin' | 'axle' | 'axle-turning';
export function jointOf(male: ConnectorKind, female: ConnectorKind): JointKind | null {
  if (male === 'stud' && female === 'antistud') return 'stud';
  if (male === 'pin' && female === 'pinhole') return 'pin';
  if (male === 'axle' && female === 'axlehole') return 'axle';
  if (male === 'axle' && female === 'pinhole') return 'axle-turning';
  return null;
}

/** Overlap needed for a segment in a hole: 8 LDU, or nearly the whole hole when it is shorter (half bush, 10 LDU). */
const engagedLength = (female: Connector) => Math.min(8, 2 * (female.half ?? 0) - 1);

/**
 * Male / female pairs that fit: stud ↔ antistud (same point, same axis); pin ↔ pinhole, axle ↔
 * axlehole, axle ↔ pinhole (parallel, on the same line within 0.6 LDU, overlapping): the male part
 * really inside the hole, not merely lined up beside it.
 */
export function fits(male: Connector, female: Connector, eps = EPS): boolean {
  if (!jointOf(male.kind, female.kind)) return false;
  const d = dot(male.axis, female.axis);
  if (male.kind === 'stud') {
    return d > 0.99 && Math.hypot(...sub(male.pos, female.pos)) <= eps;
  }
  if (Math.abs(d) < 0.99) return false;
  const v = sub(male.pos, female.pos);
  const along = dot(v, female.axis);
  if (offLine(v, female.axis) > eps) return false;
  const mh = male.half ?? 0, fh = female.half ?? 0;
  const overlap = Math.min(along + mh, fh) - Math.max(along - mh, -fh);
  return overlap >= engagedLength(female) - 1e-6;
}

/** The primitives read from a part (part-local), for diagnostics and the connection inventory. */
export async function scanPrimitives(partRef: string, read: ReadFile, cache = new Map<string, Promise<Raw | null>>()): Promise<RawPrimitives | null> {
  return collect(partRef, read, cache, 0);
}

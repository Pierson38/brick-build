// Connection inventory and performance of the connection engine on a real LDraw model, offline,
// from the local library (fix/free-building-connections). It reads; it changes nothing.
// Usage: npx tsx scripts/connections-report.ts <model.mpd> [--root "<main model>"] [--progress <progress.json>] [--json <out.json>]
//   --progress: a COPY of a build's progress (library record or browser save): its free pieces are
//   analysed too (connected assemblies of the real build). Never point it at the live library file.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { connectedAssembly, connectionGraph, ConnectorIndex, heldConnectors, proposeSnap, type PlacedPiece } from '../src/domain/build/connections';
import { analyzeModel } from '../src/domain/import/analyze';
import { CONNECTOR_METADATA } from '../src/domain/ldraw/connector-metadata';
import { scanPartConnectors, type PartConnectors } from '../src/domain/ldraw/connectors';
import { fromLDraw, withTranslation } from '../src/domain/ldraw/matrix';

function libraryDir(): string {
  let dir = process.env.LDRAW_LIBRARY_DIR;
  if (!dir && existsSync('.env.local')) dir = readFileSync('.env.local', 'utf8').split('\n').find((l) => l.startsWith('LDRAW_LIBRARY_DIR='))?.slice(18).trim();
  if (!dir) throw new Error('LDRAW_LIBRARY_DIR absent');
  return dir;
}
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const LIB = libraryDir();
const modelPath = process.argv[2];
if (!modelPath || modelPath.startsWith('--')) throw new Error('usage: connections-report <model.mpd> [--root name] [--progress file] [--json out]');
const text = readFileSync(modelPath, 'utf8');
const root = arg('--root');
const analysis = analyzeModel(text, path.basename(modelPath), root ? { rootName: root } : {});
const embedded = new Map(analysis.embeddedParts.map((p) => [p.name.toLowerCase(), p.text]));
const read = async (name: string) => {
  const n = name.replace(/\\/g, '/').toLowerCase();
  if (embedded.has(n)) return embedded.get(n)!;
  for (const c of [`parts/${n}`, `p/${n}`]) {
    const f = path.join(LIB, c);
    if (existsSync(f)) return readFileSync(f, 'utf8');
  }
  return null;
};
const title = async (p: string) => ((await read(p)) ?? '').split(/\r?\n/, 1)[0]!.replace(/^0\s+/, '').trim();

// ---- scan ----
const occ = analysis.model.occurrences;
const keys = [...new Set(occ.map((o) => o.partKey))].sort();
const cache = new Map();
const parts = new Map<string, PartConnectors>();
let t0 = performance.now();
for (const k of keys) parts.set(k, await scanPartConnectors(k, read, cache));
const scanMs = performance.now() - t0;

type Row = { part: string; title: string; occurrences: number; kinds: Record<string, number>; status: 'recognised' | 'uncertain' | 'none'; metadata: boolean };
const rows: Row[] = [];
for (const k of keys) {
  const r = parts.get(k)!;
  const kinds: Record<string, number> = {};
  for (const c of r.connectors) kinds[c.kind] = (kinds[c.kind] ?? 0) + 1;
  const status = r.connectors.length === 0 ? 'none' : r.axleUnrecognised ? 'uncertain' : 'recognised';
  rows.push({ part: k, title: await title(k), occurrences: occ.filter((o) => o.partKey === k).length, kinds, status, metadata: Boolean(CONNECTOR_METADATA[k]) });
}

// ---- the finished model: every piece at its place ----
const lib = (k: string) => parts.get(k);
const placed: PlacedPiece[] = occ.map((o) => ({ key: `a:${o.occurrenceId}`, partKey: o.partKey, pose: o.targetMatrix }));
t0 = performance.now();
const index = new ConnectorIndex(placed, lib);
const indexMs = performance.now() - t0;
t0 = performance.now();
const joints = index.joints();
const graph = connectionGraph(index);
const graphMs = performance.now() - t0;
t0 = performance.now();
const components: string[][] = [];
const seen = new Set<string>();
for (const p of placed) {
  if (seen.has(p.key)) continue;
  const c = connectedAssembly(graph, [p.key]);
  for (const k of c) seen.add(k);
  components.push(c);
}
const assemblyMs = performance.now() - t0;
const jointKinds: Record<string, number> = {};
for (const j of joints) jointKinds[j.kind] = (jointKinds[j.kind] ?? 0) + 1;

// ---- snapping: each piece taken again 3 LDU off its place, the others placed (the same work as one pointer move) ----
const times: number[] = [];
let found = 0, back = 0;
// a first pass warms the JIT up (the first pointer moves of a session); the second one is measured
for (const p of placed) proposeSnap(heldConnectors([{ partKey: p.partKey, pose: withTranslation(p.pose, [p.pose[12] + 3, p.pose[13] - 2, p.pose[14] + 2]) }], lib), index, { exclude: new Set([p.key]) });
for (const p of placed) {
  const pose = withTranslation(p.pose, [p.pose[12] + 3, p.pose[13] - 2, p.pose[14] + 2]);
  const s0 = performance.now();
  const s = proposeSnap(heldConnectors([{ partKey: p.partKey, pose }], lib), index, { exclude: new Set([p.key]) });
  times.push(performance.now() - s0);
  if (s) {
    found += 1;
    // back to its place (within 0.05 LDU: rotated sub-models round to 0.01 LDU per connector)
    if (Math.abs(s.delta[0] + 3) < 0.05 && Math.abs(s.delta[1] - 2) < 0.05 && Math.abs(s.delta[2] + 2) < 0.05) back += 1;
  }
}
times.sort((a, b) => a - b);
const pct = (q: number) => times[Math.min(times.length - 1, Math.floor(q * times.length))]!;

// ---- a real build (copy of a progress file): its free pieces ----
let build: Record<string, unknown> | null = null;
const progressPath = arg('--progress');
if (progressPath) {
  const raw = JSON.parse(readFileSync(progressPath, 'utf8')) as { payload?: unknown };
  const pr = (raw.payload ?? raw) as { freePieces?: { id: string; partKey: string; pose: number[] }[]; placedOccurrenceIds?: string[] };
  const free: PlacedPiece[] = (pr.freePieces ?? []).map((f) => ({ key: `f:${f.id}`, partKey: f.partKey, pose: fromLDraw(f.pose) }));
  for (const f of free) if (!parts.has(f.partKey)) parts.set(f.partKey, await scanPartConnectors(f.partKey, read, cache));
  const byId = new Map(occ.map((o) => [o.occurrenceId, o]));
  const anchored: PlacedPiece[] = (pr.placedOccurrenceIds ?? []).flatMap((id) => (byId.get(id) ? [{ key: `a:${id}`, partKey: byId.get(id)!.partKey, pose: byId.get(id)!.targetMatrix }] : []));
  const all = [...anchored, ...free];
  const s0 = performance.now();
  const g = connectionGraph(new ConnectorIndex(all, lib));
  const comps: string[][] = [];
  const done = new Set<string>();
  for (const p of all) {
    if (done.has(p.key)) continue;
    const c = connectedAssembly(g, [p.key]);
    for (const k of c) done.add(k);
    comps.push(c);
  }
  build = { pieces: all.length, graphMs: +(performance.now() - s0).toFixed(1), assemblies: comps.sort((a, b) => b.length - a.length).map((c) => c.length), largest: comps[0] ?? [] };
}

const report = {
  model: path.basename(modelPath), root: root ?? null, occurrences: occ.length, references: keys.length,
  coverage: {
    recognised: rows.filter((r) => r.status === 'recognised').length,
    uncertain: rows.filter((r) => r.status === 'uncertain').map((r) => `${r.part} ${r.title}`),
    none: rows.filter((r) => r.status === 'none').map((r) => `${r.part} ${r.title}`),
    metadata: rows.filter((r) => r.metadata).map((r) => r.part),
  },
  finishedModel: { joints: joints.length, jointKinds, assemblies: components.length, largestAssembly: Math.max(...components.map((c) => c.length)) },
  snapping: { pieces: placed.length, proposals: found, backToItsPlace: back },
  timingsMs: {
    scan: +scanMs.toFixed(1), index: +indexMs.toFixed(1), jointsAndGraph: +graphMs.toFixed(1), allAssemblies: +assemblyMs.toFixed(1),
    snapP50: +pct(0.5).toFixed(2), snapP95: +pct(0.95).toFixed(2), snapP99: +pct(0.99).toFixed(2), snapMax: +times.at(-1)!.toFixed(2),
  },
  build,
  parts: rows,
};
const out = arg('--json');
if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
const { parts: _rows, ...summary } = report;
console.log(JSON.stringify(summary, null, 2));

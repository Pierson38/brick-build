// P5 compatibility report for a real LDraw model, computed offline from the local library.
// Usage: npx tsx scripts/compat-report.ts <model.mpd> [--json out.json]
// Measures what the current import does; it does not change the model.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { analyzeModel } from '../src/domain/import/analyze';
import { DEFAULT_TOLERANCES } from '../src/domain/build/engine';
import { distance, fromLDraw, rotationAngleDeg } from '../src/domain/ldraw/matrix';
import { classifyRotation, yQuarterTurnSymmetries } from '../src/domain/ldraw/symmetry';

function libraryDir(): string {
  let dir = process.env.LDRAW_LIBRARY_DIR;
  if (!dir && existsSync('.env.local')) {
    dir = readFileSync('.env.local', 'utf8').split('\n').find((l) => l.startsWith('LDRAW_LIBRARY_DIR='))?.slice(18).trim();
  }
  if (!dir) throw new Error('LDRAW_LIBRARY_DIR absent');
  return dir;
}

const LIB = libraryDir();
const [modelPath, ...rest] = process.argv.slice(2);
if (!modelPath) throw new Error('usage: compat-report <model.mpd> [--json out.json]');
const jsonOut = rest[0] === '--json' ? rest[1] : undefined;

const text = readFileSync(modelPath, 'utf8');
const fileName = path.basename(modelPath);

// ---- raw scan of the MPD sections (independent from the parser, to measure it) ----
interface RawSection { name: string; ldrawOrg: string | null; geometryLines: number; type1: number; steps: number }
const rawSections: RawSection[] = [];
const metaCounts = new Map<string, number>();
{
  let cur: RawSection | null = null;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    const m = /^0\s+FILE\s+(.+)$/.exec(t);
    if (m) { cur = { name: m[1]!.trim(), ldrawOrg: null, geometryLines: 0, type1: 0, steps: 0 }; rawSections.push(cur); continue; }
    const meta = /^0\s+(!?[A-Z_]{3,})/.exec(t);
    if (meta) metaCounts.set(meta[1]!, (metaCounts.get(meta[1]!) ?? 0) + 1);
    if (!cur) continue;
    const org = /^0\s+!LDRAW_ORG\s+(\S+)/.exec(t);
    if (org) cur.ldrawOrg = org[1]!;
    if (/^[2-5]\s/.test(t)) cur.geometryLines++;
    if (/^1\s/.test(t)) cur.type1++;
    if (/^0\s+(STEP|ROTSTEP)\b/.test(t)) cur.steps++;
  }
}
const embedded = new Map(rawSections.map((s) => [s.name.toLowerCase().replace(/\\/g, '/'), s] as const));
const isPartSection = (s: RawSection) => /part|subpart|primitive|shortcut/i.test(s.ldrawOrg ?? '') || s.geometryLines > 0;

// ---- library resolution (same search order as LDrawLoader) ----
const fileCache = new Map<string, string | null>();
function readLibrary(ref: string): { text: string; where: string } | null {
  const name = ref.replace(/\\/g, '/');
  const lower = name.toLowerCase();
  const sec = embedded.get(lower);
  if (sec) return { text: sectionText(sec.name), where: 'embedded' };
  const candidates = [name, lower].flatMap((n) => {
    const fixed = n.startsWith('s/') ? `parts/${n}` : n.startsWith('48/') ? `p/${n}` : n;
    return [`parts/${fixed}`, `p/${fixed}`, `models/${fixed}`, fixed].map((c) => c.replace('parts/parts/', 'parts/').replace('p/p/', 'p/'));
  });
  for (const c of candidates) {
    if (!fileCache.has(c)) fileCache.set(c, existsSync(path.join(LIB, c)) ? readFileSync(path.join(LIB, c), 'utf8') : null);
    const t = fileCache.get(c);
    if (t) return { text: t, where: c };
  }
  return null;
}
function sectionText(name: string): string {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === `0 FILE ${name}`);
  const end = lines.findIndex((l, i) => i > start && /^0\s+(FILE|NOFILE)\b/.test(l.trim()));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n');
}

interface PartInfo { title: string; org: string; missing: string[]; vertices: number[]; source: string }
const partCache = new Map<string, PartInfo | null>();
function partInfo(ref: string, depth = 0): PartInfo | null {
  const k = ref.toLowerCase();
  if (partCache.has(k)) return partCache.get(k)!;
  const file = readLibrary(ref);
  if (!file || depth > 30) { partCache.set(k, null); return null; }
  const info: PartInfo = { title: '', org: '', missing: [], vertices: [], source: file.where };
  partCache.set(k, info);
  for (const line of file.text.split(/\r?\n/)) {
    const t = line.trim();
    if (!info.title && /^0\s+\S/.test(t) && !/^0\s+(Name:|Author:|!|BFC)/.test(t)) info.title = t.slice(2).trim();
    const org = /^0\s+!LDRAW_ORG\s+(.+)$/.exec(t);
    if (org) info.org = org[1]!.trim();
    const tok = t.split(/\s+/);
    if (tok[0] === '3' || tok[0] === '4') {
      const n = tok[0] === '3' ? 3 : 4;
      for (let v = 0; v < n; v++) info.vertices.push(Number(tok[2 + v * 3]), Number(tok[3 + v * 3]), Number(tok[4 + v * 3]));
    } else if (tok[0] === '1' && tok.length >= 15) {
      const sub = tok.slice(14).join(' ');
      const child = partInfo(sub, depth + 1);
      if (!child) { info.missing.push(sub); continue; }
      info.missing.push(...child.missing);
      const m = fromLDraw(tok.slice(2, 14).map(Number));
      for (let i = 0; i < child.vertices.length; i += 3) {
        const [x, y, z] = [child.vertices[i]!, child.vertices[i + 1]!, child.vertices[i + 2]!];
        info.vertices.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
      }
    }
  }
  return info;
}

// ---- current import ----
const t0 = performance.now();
const a = analyzeModel(text, fileName);
const parseMs = performance.now() - t0;
const occ = a.model.occurrences;
const partSectionKeys = new Set(rawSections.filter(isPartSection).map((s) => s.name.toLowerCase()));
const instanceSection = new Map(a.model.submodelInstances.map((i) => [i.instanceId, i.sectionKey] as const));
const occFromPartSections = occ.filter((o) => o.ancestorSubmodels.some((id) => partSectionKeys.has(instanceSection.get(id) ?? '')));

const byPart = new Map<string, number>();
for (const o of occ) byPart.set(o.partKey, (byPart.get(o.partKey) ?? 0) + 1);
const parts = [...byPart.keys()].map((k) => ({ key: k, count: byPart.get(k)!, info: partInfo(occ.find((o) => o.partKey === k)!.partRef) }));
const missingParts = parts.filter((p) => !p.info).map((p) => p.key);
const missingSubfiles = [...new Set(parts.flatMap((p) => p.info?.missing ?? []))];
const moved = parts.filter((p) => /^~?moved to/i.test(p.info?.title ?? '') || /alias/i.test(p.info?.org ?? '')).map((p) => `${p.key} (${p.info!.title})`);
const unofficial = parts.filter((p) => /unofficial/i.test(p.info?.org ?? '')).map((p) => p.key);
const symmetries = new Map(parts.map((p) => [p.key, p.info ? yQuarterTurnSymmetries(p.info.vertices) : [0]] as const));

const rotationClasses = { Y_QUARTER_TURN: 0, AXIS_ALIGNED_OTHER: 0, ARBITRARY: 0 };
for (const o of occ) rotationClasses[classifyRotation(o.targetMatrix)]++;

// ambiguity: same part+colour, targets closer than the snap tolerance
let ambiguousPairs = 0;
for (let i = 0; i < occ.length; i++) {
  for (let j = i + 1; j < occ.length; j++) {
    const x = occ[i]!, y = occ[j]!;
    if (x.partKey === y.partKey && x.colorCode === y.colorCode && distance(x.targetMatrix, y.targetMatrix) < DEFAULT_TOLERANCES.maxDistanceLdu && rotationAngleDeg(x.targetMatrix, y.targetMatrix) < DEFAULT_TOLERANCES.maxAngleDeg) ambiguousPairs++;
  }
}
// equivalent rotations a player may choose that the engine refuses today
const symmetricOccurrences = occ.filter((o) => (symmetries.get(o.partKey) ?? [0]).length > 1).length;

const stepSizes = a.plan.steps.map((s) => s.occurrenceIds.length);
const sorted = [...stepSizes].sort((x, y) => x - y);
const layers = new Set(occ.map((o) => Math.round(o.targetMatrix[13]))).size;
const offGrid = occ.filter((o) => [o.targetMatrix[12], o.targetMatrix[14]].some((v) => Math.abs(v / 10 - Math.round(v / 10)) > 1e-6)).length;

const report = {
  file: fileName,
  sha256: createHash('sha256').update(readFileSync(modelPath)).digest('hex'),
  bytes: Buffer.byteLength(text),
  license: a.document.sections[0]?.meta.license ?? null,
  author: a.document.sections[0]?.meta.author ?? null,
  rootName: a.model.rootName,
  parseMs: Math.round(parseMs * 10) / 10,
  sections: rawSections.map((s) => ({ ...s, kind: isPartSection(s) ? 'PART' : 'MODEL' })),
  occurrences: occ.length,
  occurrencesFromEmbeddedPartSections: occFromPartSections.length,
  uniqueParts: parts.length,
  colours: a.colours,
  submodelInstances: a.model.submodelInstances.length,
  nonRigid: occ.filter((o) => !o.rigid).length,
  rotationClasses,
  offTenLduGrid: offGrid,
  layers,
  ambiguousPairs,
  symmetricOccurrences,
  symmetricParts: parts.filter((p) => (symmetries.get(p.key) ?? [0]).length > 1).map((p) => `${p.key}:${symmetries.get(p.key)!.join('/')}`),
  library: { missingParts, missingSubfiles, moved, unofficial, embeddedParts: parts.filter((p) => p.info?.source === 'embedded').map((p) => p.key) },
  steps: { kind: a.plan.kind, count: stepSizes.length, min: sorted[0] ?? 0, median: sorted[Math.floor(sorted.length / 2)] ?? 0, max: sorted.at(-1) ?? 0 },
  diagnostics: Object.fromEntries([...a.diagnostics.reduce((m, d) => m.set(`${d.severity}:${d.code}`, (m.get(`${d.severity}:${d.code}`) ?? 0) + 1), new Map<string, number>())]),
  metaCommands: Object.fromEntries([...metaCounts].sort((x, y) => y[1] - x[1])),
  partCounts: Object.fromEntries([...byPart].sort((x, y) => y[1] - x[1])),
};
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 2));
const { partCounts: _p, sections, ...summary } = report;
console.log(JSON.stringify({ ...summary, sections: sections.map((s) => `${s.kind} ${s.name} [org=${s.ldrawOrg} t1=${s.type1} geom=${s.geometryLines} steps=${s.steps}]`) }, null, 1));

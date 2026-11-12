import { promises as fs } from 'node:fs';
import path from 'node:path';
import { analyzeModel, type ModelAnalysis } from '@/domain/import/analyze';
import { inventoryCheck } from '@/domain/import/known-validations';
import { parseMappingText, validateMapping, type InstructionMapping } from '@/domain/instructions/mapping';
import type {
  ExistingSet, FileProvenance, FileRef, LocalLookup, MappingMatch, PreparedImport, PreparedMapping, PreparedModel, PreparedPdf, PreparedRoot,
} from '@/domain/library/import-types';
import { parseSetNumber, sameSetNumber, setNumberInName, type SetNumber } from '@/domain/library/set-number';
import type { FileKind, LibraryIndex } from '@/domain/library/types';
import { msgs } from '@/i18n/runtime';
import { onlineEnabled } from '../net/safe-fetch';
import { rebrickableKey, sourceLinks } from '../online/sources';
import { discover } from './discovery';
import { missingPartRefs, partsLibraryConfigured } from './parts-check';
import { safeSegments } from './paths';
import { pdfPageCount } from './pdf-info';
import { LibraryError, MAX_BYTES, sha256, type LibraryStore, type ResolvedFile } from './store';

// Server-only. P8 "Ajouter un set": local search by set number, then measurement of the files the
// user selected (parser, local parts library, PDF pages, mappings). Read-only: nothing is added to
// the collection here; the confirmation (LibraryStore.importSet) checks everything again.

const MAX_FILES = 40;
const MAX_UNREFERENCED_ROOTS = 5;
const MAX_MAPPING_FILES = 50;

// ---------------------------------------------------------------------------------------------
// Local search
// ---------------------------------------------------------------------------------------------

export async function existingSets(store: LibraryStore, index: LibraryIndex, sn: SetNumber): Promise<ExistingSet[]> {
  const out: ExistingSet[] = [];
  for (const s of index.sets.filter((x) => sameSetNumber(x.setNumber, sn.canonical))) {
    const builds = [];
    for (const b of index.builds.filter((x) => x.setId === s.id)) {
      const mapping = await store.readRecord(b.id, 'mapping').catch(() => null);
      const progress = await store.readRecord(b.id, 'progress').catch(() => null);
      const payload = progress && typeof progress.payload === 'object' && progress.payload !== null ? progress.payload as { placedOccurrenceIds?: unknown; freePieces?: unknown } : {};
      // pieces on a model target + free pieces (free mode)
      const placed = (Array.isArray(payload.placedOccurrenceIds) ? payload.placedOccurrenceIds.length : 0) + (Array.isArray(payload.freePieces) ? payload.freePieces.length : 0);
      builds.push({ id: b.id, label: b.label, modelSha256: b.modelFileId, rootName: b.rootName, hasMapping: mapping !== null, placed });
    }
    out.push({ id: s.id, setNumber: s.setNumber, name: s.name, builds });
  }
  return out;
}

/** Files of the data folder for this set number (models/<n>/, instructions/<n>/, matching mappings), and the collection's sets with this number. */
export async function localLookup(store: LibraryStore, number: unknown): Promise<LocalLookup> {
  const parsed = parseSetNumber(number);
  if (!parsed.ok) throw new LibraryError('INVALID', parsed.error);
  const sn = parsed.value;
  const index = await store.readIndex();
  const found = await discover(store);
  const refs: FileRef[] = [];
  const matches = (name: string) => sameSetNumber(name, sn.canonical) || setNumberInName(name)?.canonical === sn.canonical;
  for (const set of found.sets) {
    const folderMatches = matches(set.folder);
    for (const m of set.models) if (folderMatches || matches(m.name)) refs.push({ origin: 'discovered', rel: m.rel, sha256: m.sha256 });
    for (const p of set.pdfs) if (folderMatches || matches(p.name)) refs.push({ origin: 'discovered', rel: p.rel, sha256: p.sha256 });
  }
  // PDFs stored under instructions/<n>/ even when no model folder exists for this number
  for (const rel of await listFolder(store.dataDir, 'instructions', /\.pdf$/i)) {
    const folder = rel.split('/')[1]!;
    if (!matches(folder) || refs.some((r) => r.origin === 'discovered' && r.rel === rel)) continue;
    const bytes = await readSmall(store.dataDir, rel, MAX_BYTES.pdf);
    if (bytes && bytes.subarray(0, 1024).indexOf('%PDF-') >= 0) refs.push({ origin: 'discovered', rel, sha256: sha256(bytes) });
  }
  return {
    setNumber: sn,
    existingSets: await existingSets(store, index, sn),
    refs,
    links: sourceLinks(sn),
    online: { omr: onlineEnabled() && sn.numeric, rebrickable: onlineEnabled() && rebrickableKey() !== null },
  };
}

/** Plain files (no link, no hidden name) of `<data>/<top>/<sub>/` or `<data>/<top>/`, bounded. */
async function listFolder(dataDir: string, top: string, ext: RegExp, depth = 2): Promise<string[]> {
  const out: string[] = [];
  const walk = async (rel: string, level: number) => {
    const entries = await fs.readdir(path.join(dataDir, ...rel.split('/')), { withFileTypes: true }).catch(() => []);
    for (const e of entries.slice(0, 200)) {
      if (e.isSymbolicLink() || e.name.startsWith('.') || safeSegments(`${rel}/${e.name}`) === null) continue;
      if (e.isDirectory() && level < depth) await walk(`${rel}/${e.name}`, level + 1);
      else if (e.isFile() && ext.test(e.name) && level === depth) out.push(`${rel}/${e.name}`);
    }
  };
  await walk(top, 1);
  return out;
}

async function readSmall(dataDir: string, rel: string, max: number): Promise<Buffer | null> {
  const abs = path.join(dataDir, ...rel.split('/'));
  const stat = await fs.lstat(abs).catch(() => null);
  if (!stat || !stat.isFile() || stat.size > max) return null;
  return fs.readFile(abs).catch(() => null);
}

// ---------------------------------------------------------------------------------------------
// Preparation of the selected files
// ---------------------------------------------------------------------------------------------

export interface PrepareInput {
  readonly setNumber?: unknown;
  readonly files: readonly { readonly kind: FileKind; readonly ref: FileRef }[];
  /** Main models asked for explicitly (advanced choice), by model SHA-256. */
  readonly extraRoots?: readonly { readonly sha256: string; readonly rootName: string }[];
}

const KINDS: readonly FileKind[] = ['model', 'pdf', 'mapping'];

function provenanceOf(f: ResolvedFile, header?: { author?: string; license?: string }): FileProvenance {
  const base: FileProvenance = f.provenance ?? { source: f.origin === 'discovered' ? 'discovery' : 'upload' };
  return { ...base, ...(header?.author && !base.author ? { author: header.author } : {}), ...(header?.license && !base.license ? { license: header.license } : {}) };
}

/** Models no other section of the file uses: possible alternative builds kept in the same MPD. */
function unreferencedRoots(a: ModelAnalysis): string[] {
  const used = new Set(a.document.sections.flatMap((s) => s.refs.map((r) => r.fileKey)));
  return a.document.sections
    .filter((s) => !s.isPartDefinition && s.refs.length > 0 && s.name !== a.model.rootName && !used.has(s.key))
    .map((s) => s.name)
    .slice(0, MAX_UNREFERENCED_ROOTS);
}

export async function prepareImport(store: LibraryStore, input: PrepareInput): Promise<PreparedImport> {
  const files = Array.isArray(input?.files) ? input.files : [];
  if (files.length > MAX_FILES) throw new LibraryError('INVALID', msgs().server.prepare.tooManyFiles(MAX_FILES));
  const parsedNumber = input.setNumber === undefined || input.setNumber === '' ? null : parseSetNumber(input.setNumber);
  if (parsedNumber && !parsedNumber.ok) throw new LibraryError('INVALID', parsedNumber.error);
  const sn = parsedNumber?.ok ? parsedNumber.value : null;
  const index = await store.readIndex();
  const rejected: { name: string; reason: string }[] = [];
  const resolved: { kind: FileKind; f: ResolvedFile }[] = [];
  for (const item of files) {
    if (!item || !KINDS.includes(item.kind)) throw new LibraryError('INVALID', msgs().server.prepare.unknownFileType);
    try {
      const f = await store.readRef(item.ref, item.kind, index);
      if (!resolved.some((r) => r.f.sha256 === f.sha256)) resolved.push({ kind: item.kind, f });
    } catch (e) {
      const ref = item.ref as Partial<{ rel: string; sha256: string }>;
      rejected.push({ name: ref.rel ?? `${String(ref.sha256).slice(0, 12)}…`, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  // --- models
  const analyses = new Map<string, { a: ModelAnalysis; text: string; name: string }>();
  const models: (PreparedModel & { roots: PreparedRoot[] })[] = [];
  const rootOf = async (sha: string, rootName: string, role: PreparedRoot['role']): Promise<PreparedRoot | null> => {
    const base = analyses.get(sha)!;
    if (rootName !== base.a.model.rootName && !base.a.rootCandidates.includes(rootName)) return null;
    const a = rootName === base.a.model.rootName ? base.a : analyzeModel(base.text, base.name, { rootName });
    const embedded = new Set(a.embeddedParts.map((p) => p.name.trim().replace(/\\/g, '/').toLowerCase()));
    const refs = a.model.occurrences.map((o) => o.partRef.trim().replace(/\\/g, '/').toLowerCase()).filter((r) => !embedded.has(r));
    const missing = await missingPartRefs(refs);
    const existing = index.builds.find((b) => b.modelFileId === sha && b.rootName === rootName);
    const set = existing ? index.sets.find((s) => s.id === existing.setId) : undefined;
    const issues = a.diagnostics.filter((d) => d.severity !== 'info');
    return {
      rootName, role,
      occurrenceCount: a.model.occurrences.length,
      uniqueParts: a.uniqueParts.length,
      colours: new Set(a.model.occurrences.map((o) => `${o.partKey}|${o.colorCode}`)).size,
      submodels: a.model.submodelInstances.length,
      planKind: a.plan.kind,
      stepCount: a.plan.steps.length,
      errors: issues.filter((d) => d.severity === 'error').length,
      warnings: issues.filter((d) => d.severity === 'warning').length,
      diagnostics: issues.slice(0, 8).map((d) => d.message.slice(0, 300)),
      missingParts: missing === null ? { checked: false, refs: [], occurrences: 0 } : { checked: true, refs: [...missing].sort(), occurrences: refs.filter((r) => missing.has(r)).length },
      inventory: role === 'main' ? inventoryCheck(sha) : { verdict: 'NOT_VERIFIED', message: msgs().domain.inventory.notVerifiedShort },
      existingBuild: existing && set ? { setId: set.id, buildId: existing.id, label: existing.label, setNumber: set.setNumber, setName: set.name } : null,
    };
  };
  for (const { kind, f } of resolved) {
    if (kind !== 'model') continue;
    const text = new TextDecoder('utf-8').decode(f.bytes);
    const a = analyzeModel(text, f.name);
    if (a.model.occurrences.length === 0) {
      rejected.push({ name: f.name, reason: msgs().server.prepare.unusableModel });
      continue;
    }
    analyses.set(f.sha256, { a, text, name: f.name });
    const meta = a.document.sections.find((s) => s.name === a.model.rootName)?.meta ?? a.document.sections[0]?.meta;
    const header = { ...(meta?.author ? { author: meta.author } : {}), ...(meta?.license ? { license: meta.license } : {}) };
    const roots: PreparedRoot[] = [(await rootOf(f.sha256, a.model.rootName, 'main'))!];
    for (const r of unreferencedRoots(a)) {
      const root = await rootOf(f.sha256, r, 'unreferenced');
      if (root) roots.push(root);
    }
    for (const extra of (input.extraRoots ?? []).filter((x) => x?.sha256 === f.sha256 && typeof x.rootName === 'string')) {
      if (roots.some((r) => r.rootName === extra.rootName)) continue;
      const root = await rootOf(f.sha256, extra.rootName, 'chosen');
      if (root) roots.push(root);
    }
    models.push({
      ref: refOf(f), sha256: f.sha256, name: f.name, size: f.size, inLibrary: Boolean(f.known), provenance: provenanceOf(f, header),
      title: (meta?.title ?? '').slice(0, 200), rootCandidates: a.rootCandidates.slice(0, 200), roots, setNumberInName: setNumberInName(f.name)?.canonical ?? null,
    });
  }

  // --- PDFs
  const pdfs: PreparedPdf[] = [];
  for (const { kind, f } of resolved) {
    if (kind !== 'pdf') continue;
    const info = await pdfPageCount(f.bytes);
    pdfs.push({ ref: refOf(f), sha256: f.sha256, name: f.name, size: f.size, inLibrary: Boolean(f.known), provenance: provenanceOf(f), pages: info.pages, problem: info.problem });
  }

  // --- mappings: the ones chosen, the ones already in the library, the ones of mappings/
  const candidates: { ref: FileRef; f: { sha256: string; name: string; size: number; inLibrary: boolean; provenance: FileProvenance }; m: InstructionMapping; chosen: boolean }[] = [];
  const addCandidate = (ref: FileRef, f: (typeof candidates)[number]['f'], text: string, chosen: boolean) => {
    if (candidates.some((c) => c.f.sha256 === f.sha256)) return;
    const parsed = parseMappingText(text);
    if (!parsed.ok) {
      if (chosen) rejected.push({ name: f.name, reason: msgs().server.prepare.mappingsRefused(parsed.errors.join(' ')) });
      return;
    }
    if (!analyses.has(parsed.mapping.model.sha256)) {
      const m = parsed.mapping.model;
      if (chosen) rejected.push({ name: f.name, reason: msgs().server.prepare.mappingsOtherModel(m.fileName, m.sha256.slice(0, 12), m.rootName) });
      return;
    }
    candidates.push({ ref, f, m: parsed.mapping, chosen });
  };
  for (const { kind, f } of resolved) {
    if (kind === 'mapping') addCandidate(refOf(f), { sha256: f.sha256, name: f.name, size: f.size, inLibrary: Boolean(f.known), provenance: provenanceOf(f) }, f.bytes.toString('utf8'), true);
  }
  if (analyses.size > 0) {
    for (const file of Object.values(index.files).filter((x) => x.kind === 'mapping').slice(0, MAX_MAPPING_FILES)) {
      const r = await store.readRef({ origin: 'library', sha256: file.sha256 }, 'mapping', index).catch(() => null);
      if (r) addCandidate({ origin: 'library', sha256: r.sha256 }, { sha256: r.sha256, name: r.name, size: r.size, inLibrary: true, provenance: provenanceOf(r) }, r.bytes.toString('utf8'), false);
    }
    for (const rel of (await listFolder(store.dataDir, 'mappings', /\.json$/i, 1)).slice(0, MAX_MAPPING_FILES)) {
      const bytes = await readSmall(store.dataDir, rel, MAX_BYTES.mapping);
      if (!bytes) continue;
      const sha = sha256(bytes);
      addCandidate({ origin: 'discovered', rel, sha256: sha }, { sha256: sha, name: rel.split('/').pop()!, size: bytes.length, inLibrary: Boolean(index.files[sha]), provenance: { source: 'discovery' } }, bytes.toString('utf8'), false);
    }
  }
  const mappings: PreparedMapping[] = [];
  const mappingMatches: MappingMatch[] = [];
  for (const c of candidates) {
    const model = models.find((m) => m.sha256 === c.m.model.sha256)!;
    let root = model.roots.find((r) => r.rootName === c.m.model.rootName);
    if (!root) {
      const added = await rootOf(model.sha256, c.m.model.rootName, 'chosen');
      if (!added) {
        if (c.chosen) rejected.push({ name: c.f.name, reason: msgs().server.prepare.mappingsRootAbsent(c.m.model.rootName, model.name) });
        continue;
      }
      model.roots.push(added);
      root = added;
    }
    const base = analyses.get(model.sha256)!;
    const a = root.rootName === base.a.model.rootName ? base.a : analyzeModel(base.text, base.name, { rootName: root.rootName });
    const report = validateMapping(c.m, { sha256: model.sha256, fileName: model.name, rootName: root.rootName, occurrences: a.model.occurrences });
    if (report.issues.some((i) => i.code === 'MODEL_MISMATCH')) {
      if (c.chosen) rejected.push({ name: c.f.name, reason: msgs().server.prepare.mappingsIncompatible(report.issues.find((i) => i.code === 'MODEL_MISMATCH')!.message) });
      continue;
    }
    mappings.push({
      ref: c.ref, ...c.f,
      modelSha256: c.m.model.sha256, modelFileName: c.m.model.fileName, rootName: c.m.model.rootName, occurrenceCount: c.m.model.occurrenceCount,
      steps: c.m.steps.length, verified: c.m.steps.filter((s) => s.provenance === 'verified').length,
      bookletSha256s: c.m.booklets.map((b) => b.sha256).filter((s): s is string => s !== null), bookletCount: c.m.booklets.length,
    });
    mappingMatches.push({
      mappingSha256: c.f.sha256, modelSha256: model.sha256, rootName: root.rootName, structuralOk: report.ok,
      firstError: report.issues.find((i) => i.severity === 'error')?.message ?? null, assigned: report.assigned, total: report.total,
    });
  }

  return {
    setNumber: sn,
    existingSets: sn ? await existingSets(store, index, sn) : [],
    models, pdfs, mappings, mappingMatches, rejected,
    partsLibraryConfigured: partsLibraryConfigured(),
  };
}

const refOf = (f: ResolvedFile): FileRef => (f.origin === 'discovered' ? { origin: 'discovered', rel: f.rel!, sha256: f.sha256 } : { origin: f.origin, sha256: f.sha256 });

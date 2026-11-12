import type { StepPlanKind } from '@/domain/build/build-plan';
import {
  ID_RE, LIBRARY_FORMAT, LIBRARY_SCHEMA_VERSION, MAX_NAME, SET_NUMBER_RE, SHA256_RE,
  type FileKind, type LibraryBuild, type LibraryFile, type LibraryIndex, type LibrarySet, type ModelSnapshot,
} from '@/domain/library/types';
import type { FileProvenance, ProvenanceSource } from '@/domain/library/import-types';
import { msgs } from '@/i18n/runtime';
import { safeSegments } from './paths';

// Server-only. The index is read back from disk at every operation and treated as untrusted:
// a hand-edited or damaged file is refused as a whole (never "repaired" by overwriting it).

export const MAX_INDEX_BYTES = 16 * 1024 * 1024;
const MAX_SETS = 2_000;
const MAX_BUILDS = 5_000;
const MAX_FILES = 20_000;
const MAX_BOOKLETS_PER_BUILD = 20;
const MAX_DIAGNOSTICS = 50;
const KINDS: readonly FileKind[] = ['model', 'pdf', 'mapping'];
const PLAN_KINDS: readonly StepPlanKind[] = ['ROOT_STEPS', 'FLATTENED_STEPS', 'NO_STEPS', 'INSTRUCTION_STEPS'];

export const emptyIndex = (now = new Date()): LibraryIndex => ({
  format: LIBRARY_FORMAT, schemaVersion: LIBRARY_SCHEMA_VERSION, revision: 0, updatedAtIso: now.toISOString(), files: {}, sets: [], builds: [],
});

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = MAX_NAME): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const iso = (v: unknown): v is string => str(v, 40) && !Number.isNaN(Date.parse(v));
const count = (v: unknown, max = 10_000_000): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;

class SchemaError extends Error {}
const need = (ok: boolean, what: string) => {
  if (!ok) throw new SchemaError(what);
};

function parseFile(key: string, f: unknown): LibraryFile {
  need(SHA256_RE.test(key) && isRecord(f), msgs().server.schema.file(key.slice(0, 12)));
  const r = f as Record<string, unknown>;
  need(r.sha256 === key && KINDS.includes(r.kind as FileKind) && count(r.size, 1024 ** 3) && str(r.originalName, 200) && iso(r.addedAtIso), msgs().server.schema.file(key.slice(0, 12)));
  const loc = r.location;
  need(isRecord(loc) && (loc.type === 'blob' || loc.type === 'external') && typeof loc.path === 'string' && safeSegments(loc.path) !== null, msgs().server.schema.fileLocation(key.slice(0, 12)));
  const l = loc as { type: 'blob' | 'external'; path: string };
  const provenance = r.provenance === undefined ? undefined : parseProvenance(r.provenance);
  need(r.provenance === undefined || provenance !== null, msgs().server.schema.fileProvenance(key.slice(0, 12)));
  return {
    sha256: key, kind: r.kind as FileKind, size: r.size as number, originalName: r.originalName as string, location: { type: l.type, path: l.path }, addedAtIso: r.addedAtIso as string,
    ...(provenance ? { provenance } : {}),
  };
}

const SOURCES: readonly ProvenanceSource[] = ['upload', 'discovery', 'omr'];
const httpsUrl = (v: unknown) => typeof v === 'string' && v.length <= 1000 && /^https:\/\/[^\s]+$/.test(v);

/** Provenance of a file (P8). Optional fields are dropped when absent; anything malformed → null. */
export function parseProvenance(v: unknown): FileProvenance | null {
  if (!isRecord(v) || !SOURCES.includes(v.source as ProvenanceSource)) return null;
  const out: { -readonly [K in keyof FileProvenance]: FileProvenance[K] } = { source: v.source as ProvenanceSource };
  for (const k of ['url', 'pageUrl'] as const) {
    if (v[k] === undefined) continue;
    if (!httpsUrl(v[k])) return null;
    out[k] = v[k] as string;
  }
  for (const k of ['license', 'author'] as const) {
    if (v[k] === undefined) continue;
    if (typeof v[k] !== 'string' || (v[k] as string).length > 300) return null;
    out[k] = v[k] as string;
  }
  if (v.retrievedAtIso !== undefined) {
    if (!iso(v.retrievedAtIso)) return null;
    out.retrievedAtIso = v.retrievedAtIso as string;
  }
  return out;
}

function parseSet(s: unknown): LibrarySet {
  need(isRecord(s), 'set');
  const r = s as Record<string, unknown>;
  need(str(r.id, 64) && ID_RE.test(r.id as string) && str(r.setNumber, 32) && SET_NUMBER_RE.test(r.setNumber as string) && str(r.name) && iso(r.createdAtIso) && iso(r.updatedAtIso), msgs().server.schema.set(String(r.id).slice(0, 64)));
  return { id: r.id as string, setNumber: r.setNumber as string, name: r.name as string, createdAtIso: r.createdAtIso as string, updatedAtIso: r.updatedAtIso as string };
}

export function parseSnapshot(s: unknown): ModelSnapshot {
  need(isRecord(s), msgs().server.schema.modelAnalysis);
  const r = s as Record<string, unknown>;
  need(typeof r.title === 'string' && r.title.length <= 512 && count(r.occurrenceCount) && count(r.uniqueParts) && count(r.colours)
    && PLAN_KINDS.includes(r.planKind as StepPlanKind) && count(r.stepCount) && count(r.errors) && count(r.warnings), msgs().server.schema.modelAnalysis);
  need(Array.isArray(r.rootCandidates) && r.rootCandidates.length <= 2_000 && r.rootCandidates.every((x) => str(x, 512)), msgs().server.schema.rootModels);
  need(Array.isArray(r.diagnostics) && r.diagnostics.length <= MAX_DIAGNOSTICS, 'diagnostics');
  const diagnostics = (r.diagnostics as unknown[]).map((d) => {
    need(isRecord(d) && str(d.severity, 16) && str(d.code, 64) && typeof d.message === 'string' && d.message.length <= 1000 && (d.line === undefined || count(d.line)), msgs().server.schema.diagnostic);
    const x = d as Record<string, unknown>;
    return { severity: x.severity as string, code: x.code as string, message: x.message as string, ...(x.line !== undefined ? { line: x.line as number } : {}) };
  });
  return {
    title: r.title as string, occurrenceCount: r.occurrenceCount as number, uniqueParts: r.uniqueParts as number, colours: r.colours as number,
    planKind: r.planKind as StepPlanKind, stepCount: r.stepCount as number, rootCandidates: [...(r.rootCandidates as string[])],
    errors: r.errors as number, warnings: r.warnings as number, diagnostics,
  };
}

function parseBuild(b: unknown): LibraryBuild {
  need(isRecord(b), msgs().server.schema.build);
  const r = b as Record<string, unknown>;
  const where = msgs().server.schema.buildWhere(String(r.id).slice(0, 64));
  need(str(r.id, 64) && ID_RE.test(r.id as string) && str(r.setId, 64) && ID_RE.test(r.setId as string) && str(r.label) && str(r.modelFileId, 64) && SHA256_RE.test(r.modelFileId as string)
    && str(r.rootName, 512) && iso(r.createdAtIso) && iso(r.updatedAtIso), where);
  need(Array.isArray(r.bookletFileIds) && r.bookletFileIds.length <= MAX_BOOKLETS_PER_BUILD && r.bookletFileIds.every((x) => typeof x === 'string' && SHA256_RE.test(x))
    && new Set(r.bookletFileIds).size === r.bookletFileIds.length, msgs().server.schema.booklets(where));
  return {
    id: r.id as string, setId: r.setId as string, label: r.label as string, modelFileId: r.modelFileId as string, rootName: r.rootName as string,
    bookletFileIds: [...(r.bookletFileIds as string[])], snapshot: parseSnapshot(r.snapshot), createdAtIso: r.createdAtIso as string, updatedAtIso: r.updatedAtIso as string,
  };
}

export type ParseIndexResult = { ok: true; index: LibraryIndex } | { ok: false; error: string };

export function parseIndex(raw: unknown): ParseIndexResult {
  try {
    need(isRecord(raw), msgs().server.schema.jsonObjectExpected);
    const r = raw as Record<string, unknown>;
    need(r.format === LIBRARY_FORMAT, msgs().server.schema.unknownFormat);
    need(r.schemaVersion === LIBRARY_SCHEMA_VERSION, msgs().server.schema.unsupportedSchema(String(r.schemaVersion)));
    need(count(r.revision) && iso(r.updatedAtIso), msgs().server.schema.revision);
    need(isRecord(r.files) && Object.keys(r.files).length <= MAX_FILES, msgs().server.schema.fileList);
    need(Array.isArray(r.sets) && r.sets.length <= MAX_SETS, msgs().server.schema.setList);
    need(Array.isArray(r.builds) && r.builds.length <= MAX_BUILDS, msgs().server.schema.buildList);
    const files: Record<string, LibraryFile> = Object.create(null) as Record<string, LibraryFile>;
    for (const [k, v] of Object.entries(r.files as Record<string, unknown>)) files[k] = parseFile(k, v);
    const sets = (r.sets as unknown[]).map(parseSet);
    const builds = (r.builds as unknown[]).map(parseBuild);
    // referential integrity: every reference must resolve, ids must be unique
    const setIds = new Set(sets.map((s) => s.id));
    need(setIds.size === sets.length, msgs().server.schema.duplicateSetIds);
    need(new Set(builds.map((b) => b.id)).size === builds.length, msgs().server.schema.duplicateBuildIds);
    for (const b of builds) {
      need(setIds.has(b.setId), msgs().server.schema.buildUnknownSet(b.id));
      need(files[b.modelFileId]?.kind === 'model', msgs().server.schema.buildUnknownModel(b.id));
      need(b.bookletFileIds.every((id) => files[id]?.kind === 'pdf'), msgs().server.schema.buildUnknownBooklet(b.id));
    }
    return { ok: true, index: { format: LIBRARY_FORMAT, schemaVersion: LIBRARY_SCHEMA_VERSION, revision: r.revision as number, updatedAtIso: r.updatedAtIso as string, files, sets, builds } };
  } catch (e) {
    if (e instanceof SchemaError) return { ok: false, error: msgs().server.schema.invalidIndex(e.message) };
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------
// Per-build records (progress, mapping): a revision for optimistic concurrency, then the payload.
// ---------------------------------------------------------------------------------------------

export const RECORD_FORMAT = 'brick-lab-library-record';

export interface StoredRecord {
  readonly format: typeof RECORD_FORMAT;
  readonly revision: number;
  readonly savedAtIso: string;
  readonly source: string;
  readonly payload: unknown;
}

export function parseRecord(raw: unknown): StoredRecord | null {
  if (!isRecord(raw) || raw.format !== RECORD_FORMAT || !count(raw.revision) || !iso(raw.savedAtIso) || !str(raw.source, 32) || !('payload' in raw)) return null;
  return { format: RECORD_FORMAT, revision: raw.revision as number, savedAtIso: raw.savedAtIso as string, source: raw.source as string, payload: raw.payload };
}

import type { BuildMode } from '../build/engine';
import type { StepPlanKind } from '../build/build-plan';
import type { FileProvenance } from './import-types';

/**
 * Personal library (P7): sets owned by the user, the files they imported or that were found in
 * the configured data folder, and one or several builds per set (alternative models of a 3-in-1,
 * or another main model of the same file). A build is identified by its own id, never by the set
 * number: (model SHA-256, main model) is what its progress and mapping are checked against.
 * Architecture: docs/implementation/P7_ARCHITECTURE_BIBLIOTHEQUE.md.
 */

export const LIBRARY_FORMAT = 'brick-lab-library';
export const LIBRARY_SCHEMA_VERSION = 1;

export type FileKind = 'model' | 'pdf' | 'mapping';

/** `blob`: copied into the library store. `external`: left in place in the data folder (discovered). */
export type FileLocation = { readonly type: 'blob' | 'external'; readonly path: string };

export interface LibraryFile {
  readonly sha256: string;
  readonly kind: FileKind;
  readonly size: number;
  readonly originalName: string;
  readonly location: FileLocation;
  readonly addedAtIso: string;
  /** Source, licence and author known when the file was added (P8; absent for P7 files). */
  readonly provenance?: FileProvenance;
}

export interface LibrarySet {
  readonly id: string;
  /** As printed on the box, e.g. "31040-1". Not unique, not an identity. */
  readonly setNumber: string;
  readonly name: string;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
}

/** Compatibility diagnostics measured when the model was added (parser only, no geometry). */
export interface ModelSnapshot {
  readonly title: string;
  readonly occurrenceCount: number;
  readonly uniqueParts: number;
  readonly colours: number;
  readonly planKind: StepPlanKind;
  readonly stepCount: number;
  readonly rootCandidates: readonly string[];
  readonly errors: number;
  readonly warnings: number;
  readonly diagnostics: readonly { readonly severity: string; readonly code: string; readonly message: string; readonly line?: number }[];
}

export interface LibraryBuild {
  readonly id: string;
  readonly setId: string;
  /** "Modèle principal", "Modèle B"… */
  readonly label: string;
  readonly modelFileId: string;
  readonly rootName: string;
  /** Booklets associated with this build, in reading order (SHA-256 of library files). */
  readonly bookletFileIds: readonly string[];
  readonly snapshot: ModelSnapshot;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
}

export interface LibraryIndex {
  readonly format: typeof LIBRARY_FORMAT;
  readonly schemaVersion: typeof LIBRARY_SCHEMA_VERSION;
  /** Incremented by every write: a write based on an older revision is refused. */
  readonly revision: number;
  readonly updatedAtIso: string;
  readonly files: Readonly<Record<string, LibraryFile>>;
  readonly sets: readonly LibrarySet[];
  readonly builds: readonly LibraryBuild[];
}

export type BuildStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE';

export type FileState = 'OK' | 'MISSING' | 'SIZE_CHANGED' | 'HASH_MISMATCH' | 'UNREADABLE';

export interface FileView {
  readonly sha256: string;
  readonly kind: FileKind;
  readonly originalName: string;
  readonly size: number;
  readonly location: FileLocation['type'];
  /** Quick check (exists, same size) in listings; full SHA-256 check on open and in /check. */
  readonly state: FileState;
}

export interface MappingView {
  readonly revision: number;
  readonly steps: number;
  readonly verified: number;
  readonly assigned: number;
  readonly total: number;
  readonly valid: boolean;
  readonly firstError: string | null;
  /** Booklets the mapping needs, and whether this build has them. */
  readonly booklets: readonly { readonly label: string; readonly sha256: string | null; readonly associated: boolean }[];
}

export interface ProgressView {
  readonly revision: number;
  readonly placed: number;
  readonly total: number;
  readonly mode: BuildMode;
  readonly lastPdfPage: number | null;
  readonly updatedAtIso: string;
}

export interface BuildView {
  readonly id: string;
  readonly setId: string;
  readonly label: string;
  readonly rootName: string;
  readonly snapshot: ModelSnapshot;
  readonly model: FileView;
  readonly booklets: readonly FileView[];
  readonly mapping: MappingView | null;
  readonly progress: ProgressView | null;
  readonly status: BuildStatus;
  readonly modes: readonly BuildMode[];
  /** Why the synchronised mode is not offered (null when it is). */
  readonly syncBlocker: string | null;
  readonly hasThumbnail: boolean;
  readonly problems: readonly string[];
  readonly updatedAtIso: string;
}

export interface SetView {
  readonly id: string;
  readonly setNumber: string;
  readonly name: string;
  readonly builds: readonly BuildView[];
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
}

export interface LibraryView {
  readonly revision: number;
  readonly dataDir: string;
  readonly sets: readonly SetView[];
}

// ---------------------------------------------------------------------------------------------
// Small pure helpers shared by the server and the UI.
// ---------------------------------------------------------------------------------------------

export const SHA256_RE = /^[0-9a-f]{64}$/;
export const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** "31040", "31040-1", "10497-1". Letters allowed for custom builds ("moc-1"). */
export const SET_NUMBER_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/;
export const MAX_NAME = 120;

export function buildStatus(placed: number, total: number): BuildStatus {
  if (placed <= 0 || total <= 0) return 'NOT_STARTED';
  return placed >= total ? 'DONE' : 'IN_PROGRESS';
}

/** Status of a set: the most advanced build wins over "not started", "in progress" over "done". */
export function setStatus(builds: readonly Pick<BuildView, 'status'>[]): BuildStatus {
  if (builds.some((b) => b.status === 'IN_PROGRESS')) return 'IN_PROGRESS';
  if (builds.length > 0 && builds.every((b) => b.status === 'DONE')) return 'DONE';
  if (builds.some((b) => b.status === 'DONE')) return 'IN_PROGRESS';
  return 'NOT_STARTED';
}

export type StatusFilter = 'ALL' | BuildStatus;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filterSets<T extends Pick<SetView, 'setNumber' | 'name' | 'builds'>>(sets: readonly T[], query: string, status: StatusFilter): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return sets.filter((s) => {
    if (status !== 'ALL' && setStatus(s.builds) !== status) return false;
    const hay = fold(`${s.setNumber} ${s.name} ${s.builds.map((b) => b.label).join(' ')}`);
    return words.every((w) => hay.includes(w));
  });
}

export function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > 0 && s.length <= MAX_NAME ? s : null;
}

// ---------------------------------------------------------------------------------------------
// Discovery of files already present in the data folder (read-only, bounded to that folder).
// ---------------------------------------------------------------------------------------------

export interface DiscoveredFile {
  /** Relative to the data folder, e.g. "models/31040-1/31040-1.mpd". */
  readonly rel: string;
  readonly name: string;
  readonly size: number;
  readonly sha256: string;
  readonly inLibrary: boolean;
}

export interface DiscoveredModel extends DiscoveredFile {
  readonly title: string;
  readonly rootName: string;
  readonly rootCandidates: readonly string[];
  readonly occurrenceCount: number;
  readonly planKind: StepPlanKind;
  readonly stepCount: number;
  /** Build already made from this file and main model. */
  readonly existingBuild: { readonly setId: string; readonly buildId: string; readonly label: string } | null;
}

export interface DiscoveredMapping extends DiscoveredFile {
  readonly modelSha256: string;
  readonly rootName: string;
  readonly steps: number;
  readonly verified: number;
  readonly bookletSha256s: readonly string[];
}

export interface DiscoveredSet {
  readonly folder: string;
  /** Folder name when it looks like a set number. */
  readonly setNumber: string | null;
  readonly models: readonly DiscoveredModel[];
  readonly pdfs: readonly DiscoveredFile[];
  /** Mappings whose model fingerprint is one of `models`. */
  readonly mappings: readonly DiscoveredMapping[];
}

export interface DiscoveryResult {
  readonly dataDir: string;
  readonly sets: readonly DiscoveredSet[];
  readonly skipped: readonly string[];
  readonly durationMs: number;
}

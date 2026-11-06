import type { StepPlanKind } from '../build/build-plan';
import type { InventoryVerdict } from '../import/known-validations';
import type { SetNumber } from './set-number';

/**
 * P8 simplified import: what the server found and measured for the files the user chose, before
 * anything is added to the collection. Nothing here is a promise: modes are computed from these
 * measurements by `compatibility.ts`, and the server checks everything again at confirmation.
 * Architecture: docs/implementation/P8_ARCHITECTURE_IMPORT.md.
 */

/**
 * Where a file comes from. The browser never sends a path outside these three cases:
 * - `library`: already in the collection index (by SHA-256);
 * - `staged`: dropped, chosen or downloaded during this import, kept in `library/staging/`
 *   until confirmation (not in the index);
 * - `discovered`: left in place in the data folder (models/, instructions/, mappings/).
 */
export type FileRef =
  | { readonly origin: 'library'; readonly sha256: string }
  | { readonly origin: 'staged'; readonly sha256: string }
  | { readonly origin: 'discovered'; readonly rel: string; readonly sha256: string };

export type ProvenanceSource = 'upload' | 'discovery' | 'omr';

/** Kept with every file added by P8 (optional in the index: P7 files have none). */
export interface FileProvenance {
  readonly source: ProvenanceSource;
  /** Download URL (OMR) — never a local path. */
  readonly url?: string;
  /** Page the file was found on (OMR set page). */
  readonly pageUrl?: string;
  /** `0 !LICENSE` line of an LDraw file, or the licence shown by the source. Absent = unknown. */
  readonly license?: string;
  /** `0 Author:` line of an LDraw file. */
  readonly author?: string;
  readonly retrievedAtIso?: string;
}

export interface PreparedFileBase {
  readonly ref: FileRef;
  readonly sha256: string;
  readonly name: string;
  readonly size: number;
  /** Already in the collection index (no new copy will be made). */
  readonly inLibrary: boolean;
  readonly provenance: FileProvenance;
}

export interface MissingParts {
  /** False when no local LDraw parts library is configured: nothing was checked. */
  readonly checked: boolean;
  /** Part files (first level) absent from the local library and not embedded in the file. */
  readonly refs: readonly string[];
  readonly occurrences: number;
}

/** One buildable model of a file: its main model, or another top-level model of the same MPD. */
export interface PreparedRoot {
  readonly rootName: string;
  /** `main`: the file's main model (first section). `unreferenced`: a model no other one uses (possible alternative build). `chosen`: picked by the user. */
  readonly role: 'main' | 'unreferenced' | 'chosen';
  readonly occurrenceCount: number;
  readonly uniqueParts: number;
  readonly colours: number;
  readonly submodels: number;
  readonly planKind: StepPlanKind;
  readonly stepCount: number;
  readonly errors: number;
  readonly warnings: number;
  /** First messages of the parser (errors and warnings), for the advanced section. */
  readonly diagnostics: readonly string[];
  readonly missingParts: MissingParts;
  readonly inventory: { readonly verdict: InventoryVerdict; readonly message: string };
  /** Build of the collection made from this exact file and main model. */
  readonly existingBuild: { readonly setId: string; readonly buildId: string; readonly label: string; readonly setNumber: string; readonly setName: string } | null;
}

export interface PreparedModel extends PreparedFileBase {
  readonly title: string;
  /** Every non-empty model of the file (what can be chosen as main model). */
  readonly rootCandidates: readonly string[];
  /** Main model first, then unreferenced models and the ones the user asked for. */
  readonly roots: readonly PreparedRoot[];
  /** Set number written at the start of the file name, when there is one. */
  readonly setNumberInName: string | null;
}

export interface PreparedPdf extends PreparedFileBase {
  /** Null when the page count could not be read (the PDF is still usable by the viewer). */
  readonly pages: number | null;
  readonly problem: string | null;
}

export interface PreparedMapping extends PreparedFileBase {
  readonly modelSha256: string;
  readonly modelFileName: string;
  readonly rootName: string;
  readonly occurrenceCount: number;
  readonly steps: number;
  readonly verified: number;
  readonly bookletSha256s: readonly string[];
  readonly bookletCount: number;
}

/**
 * A mapping whose model fingerprint and main model are those of a prepared model. `structuralOk`
 * is validateMapping() against that model (every brick assigned once, pages in range…); whether
 * its booklets are selected is decided with the user's selection (compatibility.ts).
 */
export interface MappingMatch {
  readonly mappingSha256: string;
  readonly modelSha256: string;
  readonly rootName: string;
  readonly structuralOk: boolean;
  readonly firstError: string | null;
  readonly assigned: number;
  readonly total: number;
}

export interface ExistingSet {
  readonly id: string;
  readonly setNumber: string;
  readonly name: string;
  readonly builds: readonly { readonly id: string; readonly label: string; readonly modelSha256: string; readonly rootName: string; readonly hasMapping: boolean; readonly placed: number }[];
}

export interface PreparedImport {
  readonly setNumber: SetNumber | null;
  /** Sets of the collection with the same number and variant. */
  readonly existingSets: readonly ExistingSet[];
  readonly models: readonly PreparedModel[];
  readonly pdfs: readonly PreparedPdf[];
  readonly mappings: readonly PreparedMapping[];
  readonly mappingMatches: readonly MappingMatch[];
  /** Files that cannot be used, with the reason (another model's mapping, unreadable file…). */
  readonly rejected: readonly { readonly name: string; readonly reason: string }[];
  readonly partsLibraryConfigured: boolean;
}

/** Local search by set number (data folder + collection), before any online source. */
export interface LocalLookup {
  readonly setNumber: SetNumber;
  readonly existingSets: readonly ExistingSet[];
  readonly refs: readonly FileRef[];
  readonly links: SourceLinks;
  readonly online: { readonly omr: boolean; readonly rebrickable: boolean };
}

/** Official pages for this number, opened by the user in their browser. */
export interface SourceLinks {
  readonly omrSearch: string;
  readonly legoInstructions: string;
  readonly rebrickable: string;
}

// ---------------------------------------------------------------------------------------------
// Online lookup (only on an explicit click; the server is the only one to contact the sources).
// ---------------------------------------------------------------------------------------------

export type SourceStatus = 'ok' | 'not_found' | 'unavailable' | 'not_configured' | 'unsupported';

export interface OmrModelCandidate {
  /** Absolute https URL on an allowed host; the server re-validates it before any download. */
  readonly fileUrl: string;
  readonly fileName: string;
  readonly title: string;
  /** "Main model", "Alternate model", as written by the OMR; null when not stated. */
  readonly kind: string | null;
  readonly alternate: boolean;
  readonly author: string | null;
  readonly license: string | null;
}

export interface OnlineLookup {
  readonly setNumber: SetNumber;
  readonly omr: { readonly status: SourceStatus; readonly message: string; readonly pageUrl: string | null; readonly setName: string | null; readonly models: readonly OmrModelCandidate[] };
  readonly rebrickable: {
    readonly status: SourceStatus;
    readonly message: string;
    readonly set: { readonly setNum: string; readonly name: string; readonly year: number | null; readonly numParts: number | null; readonly url: string | null } | null;
  };
  readonly lego: { readonly status: 'manual'; readonly message: string; readonly pageUrl: string };
}

// ---------------------------------------------------------------------------------------------
// Confirmation
// ---------------------------------------------------------------------------------------------

export interface ImportBuildInput {
  readonly label: string;
  readonly model: FileRef;
  readonly rootName: string;
  readonly booklets: readonly FileRef[];
  readonly mapping: FileRef | null;
}

export interface ImportInput {
  /** New set (number + name), or builds added to a set of the collection. */
  readonly target: { readonly type: 'new'; readonly setNumber: string; readonly name: string; readonly allowSameNumber?: boolean } | { readonly type: 'existing'; readonly setId: string };
  readonly builds: readonly ImportBuildInput[];
  /** Mappings validated by the browser against this selection; the server checks them again. */
}

export interface ImportResult {
  readonly setId: string;
  readonly created: readonly { readonly id: string; readonly label: string }[];
  /** Builds of this request that were already in the set (retry after an interruption): nothing duplicated. */
  readonly alreadyPresent: readonly { readonly id: string; readonly label: string }[];
  /** Mappings not attached because the build already has one (never replaced silently). */
  readonly mappingsKept: readonly string[];
  readonly filesAdded: number;
  readonly filesReused: number;
}

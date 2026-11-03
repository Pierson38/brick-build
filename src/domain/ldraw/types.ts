/**
 * Structural LDraw model types. Nothing here depends on Three.js.
 *
 * Matrix convention: `Matrix4Tuple` is COLUMN-MAJOR (same order as
 * `THREE.Matrix4.elements`), expressed in LDraw coordinates (LDU, -Y is up).
 * An LDraw type-1 line `1 c x y z a b c d e f g h i file` maps to
 *   [a, d, g, 0,  b, e, h, 0,  c, f, i, 0,  x, y, z, 1].
 * Composition is `M_global = M_parent * M_local`.
 */

export type Matrix4Tuple = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export type DiagnosticCode =
  | 'EMPTY_FILE'
  | 'FILE_TOO_LARGE'
  | 'TOO_MANY_LINES'
  | 'TOO_MANY_SECTIONS'
  | 'TOO_MANY_OCCURRENCES'
  | 'MALFORMED_LINE'
  | 'NON_FINITE_NUMBER'
  | 'INVALID_COLOUR'
  | 'UNSAFE_REFERENCE'
  | 'UNKNOWN_LINE_TYPE'
  | 'DUPLICATE_SECTION'
  | 'CONTENT_OUTSIDE_SECTION'
  | 'DIRECT_GEOMETRY_IGNORED'
  | 'SINGULAR_MATRIX'
  | 'MIRRORED_MATRIX'
  | 'SCALED_MATRIX'
  | 'CYCLE'
  | 'MAX_DEPTH'
  | 'MISSING_SUBMODEL'
  | 'ROOT_NOT_FOUND'
  | 'ALTERNATIVE_ROOT_CANDIDATE'
  | 'META_IGNORED'
  | 'NO_OCCURRENCES';

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly section?: string;
  readonly line?: number;
}

/** One type-1 line inside a section, before any expansion. */
export interface SectionReference {
  /** 0-based index among the valid type-1 lines of the section. */
  readonly refIndex: number;
  /** 1-based line number in the imported text. */
  readonly line: number;
  readonly colorCode: string;
  readonly localMatrix: Matrix4Tuple;
  /** File name as written (backslashes normalised to `/`), may contain spaces. */
  readonly fileName: string;
  /** Case-insensitive lookup key. */
  readonly fileKey: string;
  /** 0-based step index inside this section (STEP ends a step). */
  readonly stepIndex: number;
}

export interface SectionMeta {
  readonly title?: string;
  /** Value of `0 !LDRAW_ORG` (e.g. `Model`, `Unofficial_Part`). */
  readonly ldrawOrg?: string;
  readonly name?: string;
  readonly author?: string;
  readonly license?: string;
}

export interface LDrawSection {
  readonly name: string;
  readonly key: string;
  readonly firstLine: number;
  /** Last line (1-based) belonging to the section. */
  readonly lastLine: number;
  readonly refs: readonly SectionReference[];
  /** True when at least one `0 STEP` / `0 ROTSTEP` was seen in the section. */
  readonly hasStepMarkers: boolean;
  readonly meta: SectionMeta;
  /** Number of geometry lines (types 2–5). */
  readonly directGeometryLines: number;
  /**
   * True for a part definition embedded in an MPD (e.g. an unofficial part): it is a
   * single brick, never expanded as a submodel.
   */
  readonly isPartDefinition: boolean;
}

export interface LDrawDocument {
  readonly fileName: string;
  readonly isMpd: boolean;
  /** Sections in file order; the first one is the MPD main model by convention. */
  readonly sections: readonly LDrawSection[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface BrickOccurrence {
  /** Deterministic path, e.g. `nested.mpd#0/sub.ldr#1`. Unique per import. */
  readonly occurrenceId: string;
  readonly partRef: string;
  readonly partKey: string;
  /** Resolved colour (16 replaced by the inherited colour when known). */
  readonly colorCode: string;
  /** Global target transform, LDraw coordinates, column-major. */
  readonly targetMatrix: Matrix4Tuple;
  /** `section:Lline` of the type-1 line that produced this occurrence. */
  readonly sourcePath: string;
  /** Occurrence ids of the submodel instances containing this brick (outermost first). */
  readonly ancestorSubmodels: readonly string[];
  /** Step index at each level, outermost first (root step, then nested steps). */
  readonly stepPath: readonly number[];
  /** False when the matrix is mirrored, scaled or singular: snapping on rotation is not meaningful. */
  readonly rigid: boolean;
}

export interface SubmodelInstance {
  readonly instanceId: string;
  readonly sectionKey: string;
  readonly sectionName: string;
  readonly parentInstanceId: string | null;
  readonly stepIndexInParent: number;
}

export interface ExpandedModel {
  readonly rootName: string;
  readonly occurrences: readonly BrickOccurrence[];
  readonly submodelInstances: readonly SubmodelInstance[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface ParseLimits {
  readonly maxBytes: number;
  readonly maxLines: number;
  readonly maxSections: number;
  readonly maxOccurrences: number;
  readonly maxDepth: number;
}

export const DEFAULT_LIMITS: ParseLimits = {
  maxBytes: 8 * 1024 * 1024,
  maxLines: 400_000,
  maxSections: 2_000,
  maxOccurrences: 20_000,
  maxDepth: 16,
};

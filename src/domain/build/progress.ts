import type { BrickOccurrence } from '../ldraw/types';
import type { BuildMode, BuildSession } from './engine';

/** v2 (P6): `synced` mode, booklet and mapping fingerprint. v1 (P5) progress is still restored. */
export const PROGRESS_SCHEMA_VERSION = 2;
const READABLE_VERSIONS = new Set([1, 2]);

export interface LocalBuildProgress {
  readonly schemaVersion: number;
  readonly modelContentHash: string;
  readonly displayName: string;
  readonly buildMode: BuildMode;
  readonly placedOccurrenceIds: readonly string[];
  readonly totalOccurrences: number;
  readonly lastPdfPage?: number;
  /** SHA-256 of the booklet shown last (the PDF itself is never stored). */
  readonly lastBookletSha256?: string;
  /** `mappingDigest` of the mapping a synced build was played with. */
  readonly mappingDigest?: string;
  readonly updatedAtIso: string;
}

export interface PdfPosition {
  readonly page?: number;
  readonly bookletSha256?: string;
}

export type RestoreResult =
  | { readonly ok: true; readonly session: BuildSession; readonly lastPdfPage?: number; readonly lastBookletSha256?: string; readonly mappingDigest?: string }
  | { readonly ok: false; readonly reason: 'MALFORMED' | 'SCHEMA' | 'HASH_MISMATCH' | 'UNKNOWN_OCCURRENCE' };

export function serializeProgress(
  hash: string,
  displayName: string,
  session: BuildSession,
  totalOccurrences: number,
  /** A number is the page alone (P5 signature). */
  pdfPosition: PdfPosition | number = {},
  mappingDigest?: string,
  now: Date = new Date(),
): LocalBuildProgress {
  const pdf: PdfPosition = typeof pdfPosition === 'number' ? { page: pdfPosition } : pdfPosition;
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    modelContentHash: hash,
    displayName,
    buildMode: session.mode,
    placedOccurrenceIds: [...session.placed],
    totalOccurrences,
    ...(pdf.page !== undefined ? { lastPdfPage: pdf.page } : {}),
    ...(pdf.bookletSha256 !== undefined ? { lastBookletSha256: pdf.bookletSha256 } : {}),
    ...(session.mode === 'synced' && mappingDigest !== undefined ? { mappingDigest } : {}),
    updatedAtIso: now.toISOString(),
  };
}

const MODES: readonly BuildMode[] = ['guided', 'freeManual', 'synced'];

/** Validates untrusted stored data against the exact model it claims to belong to. */
export function restoreProgress(raw: unknown, hash: string, occurrences: readonly BrickOccurrence[]): RestoreResult {
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'MALFORMED' };
  const p = raw as Record<string, unknown>;
  if (typeof p.schemaVersion !== 'number' || !READABLE_VERSIONS.has(p.schemaVersion)) return { ok: false, reason: 'SCHEMA' };
  if (p.modelContentHash !== hash) return { ok: false, reason: 'HASH_MISMATCH' };
  const mode = p.buildMode as BuildMode;
  if (!MODES.includes(mode) || (mode === 'synced' && p.schemaVersion < 2)) return { ok: false, reason: 'MALFORMED' };
  const ids = p.placedOccurrenceIds;
  if (!Array.isArray(ids) || !ids.every((id): id is string => typeof id === 'string')) return { ok: false, reason: 'MALFORMED' };
  if (new Set(ids).size !== ids.length) return { ok: false, reason: 'MALFORMED' };
  const known = new Set(occurrences.map((o) => o.occurrenceId));
  if (!ids.every((id) => known.has(id))) return { ok: false, reason: 'UNKNOWN_OCCURRENCE' };
  const page = typeof p.lastPdfPage === 'number' && Number.isInteger(p.lastPdfPage) && p.lastPdfPage > 0 ? p.lastPdfPage : undefined;
  const booklet = typeof p.lastBookletSha256 === 'string' && /^[0-9a-f]{64}$/.test(p.lastBookletSha256) ? p.lastBookletSha256 : undefined;
  const digest = typeof p.mappingDigest === 'string' && /^[0-9a-f]{8}$/.test(p.mappingDigest) ? p.mappingDigest : undefined;
  return {
    ok: true,
    session: { mode, placed: ids },
    ...(page !== undefined ? { lastPdfPage: page } : {}),
    ...(booklet !== undefined ? { lastBookletSha256: booklet } : {}),
    ...(digest !== undefined ? { mappingDigest: digest } : {}),
  };
}

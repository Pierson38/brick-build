import type { BrickOccurrence } from '../ldraw/types';
import type { BuildMode, BuildSession } from './engine';

export const PROGRESS_SCHEMA_VERSION = 1;

export interface LocalBuildProgress {
  readonly schemaVersion: number;
  readonly modelContentHash: string;
  readonly displayName: string;
  readonly buildMode: BuildMode;
  readonly placedOccurrenceIds: readonly string[];
  readonly totalOccurrences: number;
  readonly lastPdfPage?: number;
  readonly updatedAtIso: string;
}

export type RestoreResult =
  | { readonly ok: true; readonly session: BuildSession; readonly lastPdfPage?: number }
  | { readonly ok: false; readonly reason: 'MALFORMED' | 'SCHEMA' | 'HASH_MISMATCH' | 'UNKNOWN_OCCURRENCE' };

export function serializeProgress(
  hash: string,
  displayName: string,
  session: BuildSession,
  totalOccurrences: number,
  lastPdfPage?: number,
  now: Date = new Date(),
): LocalBuildProgress {
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    modelContentHash: hash,
    displayName,
    buildMode: session.mode,
    placedOccurrenceIds: [...session.placed],
    totalOccurrences,
    ...(lastPdfPage !== undefined ? { lastPdfPage } : {}),
    updatedAtIso: now.toISOString(),
  };
}

/** Validates untrusted stored data against the exact model it claims to belong to. */
export function restoreProgress(raw: unknown, hash: string, occurrences: readonly BrickOccurrence[]): RestoreResult {
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'MALFORMED' };
  const p = raw as Record<string, unknown>;
  if (p.schemaVersion !== PROGRESS_SCHEMA_VERSION) return { ok: false, reason: 'SCHEMA' };
  if (p.modelContentHash !== hash) return { ok: false, reason: 'HASH_MISMATCH' };
  if (p.buildMode !== 'guided' && p.buildMode !== 'freeManual') return { ok: false, reason: 'MALFORMED' };
  const ids = p.placedOccurrenceIds;
  if (!Array.isArray(ids) || !ids.every((id): id is string => typeof id === 'string')) return { ok: false, reason: 'MALFORMED' };
  if (new Set(ids).size !== ids.length) return { ok: false, reason: 'MALFORMED' };
  const known = new Set(occurrences.map((o) => o.occurrenceId));
  if (!ids.every((id) => known.has(id))) return { ok: false, reason: 'UNKNOWN_OCCURRENCE' };
  const page = typeof p.lastPdfPage === 'number' && Number.isInteger(p.lastPdfPage) && p.lastPdfPage > 0 ? p.lastPdfPage : undefined;
  return { ok: true, session: { mode: p.buildMode, placed: ids }, ...(page !== undefined ? { lastPdfPage: page } : {}) };
}

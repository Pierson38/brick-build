import type { BrickOccurrence } from '../ldraw/types';
import { trayKey, type BuildMode, type BuildSession, type FreePiece } from './engine';
import { poseFromLDraw, poseToLDraw } from './free';

/**
 * v2 (P6): `synced` mode, booklet and mapping fingerprint. v1 (P5) progress is still restored.
 * v3 (true free building): `freePieces`, written ONLY when the build has free pieces — every other
 * save stays v2, byte for byte, so the guided / synchronised / older free builds keep their format.
 */
export const PROGRESS_SCHEMA_VERSION = 2;
export const FREE_PROGRESS_SCHEMA_VERSION = 3;
const READABLE_VERSIONS = new Set([1, 2, 3]);

/** Stored free piece: `pose` = the 12 numbers of an LDraw type-1 line (x y z a b c d e f g h i). */
export interface StoredFreePiece {
  readonly id: string;
  readonly partKey: string;
  readonly colorCode: string;
  readonly pose: readonly number[];
}

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
  /** v3, free mode only: pieces placed at a pose chosen by the player. */
  readonly freePieces?: readonly StoredFreePiece[];
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
  const free = session.mode === 'freeManual' ? session.free ?? [] : [];
  return {
    schemaVersion: free.length > 0 ? FREE_PROGRESS_SCHEMA_VERSION : PROGRESS_SCHEMA_VERSION,
    modelContentHash: hash,
    displayName,
    buildMode: session.mode,
    placedOccurrenceIds: [...session.placed],
    totalOccurrences,
    ...(pdf.page !== undefined ? { lastPdfPage: pdf.page } : {}),
    ...(pdf.bookletSha256 !== undefined ? { lastBookletSha256: pdf.bookletSha256 } : {}),
    ...(session.mode === 'synced' && mappingDigest !== undefined ? { mappingDigest } : {}),
    ...(free.length > 0 ? { freePieces: free.map((f) => ({ id: f.id, partKey: f.partKey, colorCode: f.colorCode, pose: poseToLDraw(f.pose) })) } : {}),
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
  const free = restoreFreePieces(p, mode, ids, occurrences);
  if (free === null) return { ok: false, reason: 'MALFORMED' };
  const page = typeof p.lastPdfPage === 'number' && Number.isInteger(p.lastPdfPage) && p.lastPdfPage > 0 ? p.lastPdfPage : undefined;
  const booklet = typeof p.lastBookletSha256 === 'string' && /^[0-9a-f]{64}$/.test(p.lastBookletSha256) ? p.lastBookletSha256 : undefined;
  const digest = typeof p.mappingDigest === 'string' && /^[0-9a-f]{8}$/.test(p.mappingDigest) ? p.mappingDigest : undefined;
  return {
    ok: true,
    session: free.length > 0 ? { mode, placed: ids, free } : { mode, placed: ids },
    ...(page !== undefined ? { lastPdfPage: page } : {}),
    ...(booklet !== undefined ? { lastBookletSha256: booklet } : {}),
    ...(digest !== undefined ? { mappingDigest: digest } : {}),
  };
}

/**
 * Free pieces of an untrusted save (null = malformed). Only in v3 and in the free mode; the stock of
 * the model is never exceeded; every pose is rigid and bounded. Older saves (v1/v2) have none: their
 * pieces stay on the targets where they were placed, no free position is invented for them.
 */
function restoreFreePieces(p: Record<string, unknown>, mode: BuildMode, placed: readonly string[], occurrences: readonly BrickOccurrence[]): FreePiece[] | null {
  if (p.freePieces === undefined) return [];
  if (p.schemaVersion !== FREE_PROGRESS_SCHEMA_VERSION || mode !== 'freeManual' || !Array.isArray(p.freePieces)) return null;
  if (p.freePieces.length > occurrences.length) return null;
  const stock = new Map<string, number>();
  for (const o of occurrences) stock.set(trayKey(o.partKey, o.colorCode), (stock.get(trayKey(o.partKey, o.colorCode)) ?? 0) + 1);
  const byId = new Map(occurrences.map((o) => [o.occurrenceId, o] as const));
  for (const id of placed) {
    const o = byId.get(id)!;
    stock.set(trayKey(o.partKey, o.colorCode), stock.get(trayKey(o.partKey, o.colorCode))! - 1);
  }
  const ids = new Set<string>();
  const out: FreePiece[] = [];
  for (const raw of p.freePieces as unknown[]) {
    if (typeof raw !== 'object' || raw === null) return null;
    const f = raw as Record<string, unknown>;
    if (typeof f.id !== 'string' || !/^f[1-9]\d{0,6}$/.test(f.id) || ids.has(f.id)) return null;
    if (typeof f.partKey !== 'string' || typeof f.colorCode !== 'string') return null;
    const key = trayKey(f.partKey, f.colorCode);
    const left = stock.get(key);
    if (left === undefined || left <= 0) return null;
    const pose = Array.isArray(f.pose) ? poseFromLDraw(f.pose as number[]) : null;
    if (!pose) return null;
    stock.set(key, left - 1);
    ids.add(f.id);
    out.push({ id: f.id, partKey: f.partKey, colorCode: f.colorCode, pose });
  }
  return out;
}

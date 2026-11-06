import type { BuildMode, FreePiece } from '../build/engine';
import { poseToLDraw } from '../build/free';
import { restoreProgress, type LocalBuildProgress } from '../build/progress';
import type { BrickOccurrence } from '../ldraw/types';

/**
 * Comparison of the two saves a build can have: the library's (shared by every browser) and the
 * one this browser kept in localStorage (P5/P6). The choice never depends on dates alone: any
 * relevant difference is shown and the user decides; nothing is overwritten without that choice.
 */

export interface SaveSummary {
  readonly mode: BuildMode;
  readonly placed: readonly string[];
  /** Free mode: pieces placed at a pose chosen by the player. */
  readonly free: readonly FreePiece[];
  readonly page: number | null;
  readonly bookletSha256: string | null;
  readonly mappingDigest: string | null;
  readonly updatedAtIso: string;
}

export type DiffKey = 'mode' | 'placed' | 'free' | 'page' | 'booklet' | 'mapping';

export interface SaveDiff {
  readonly keys: readonly DiffKey[];
  readonly onlyInLibrary: readonly string[];
  readonly onlyInBrowser: readonly string[];
  readonly library: SaveSummary;
  readonly browser: SaveSummary;
  /** Informative only: which one was saved last. */
  readonly newer: 'library' | 'browser' | 'same';
}

/** A stored save validated against the exact model (null when it does not fit it). */
export function summarise(raw: unknown, modelSha: string, occurrences: readonly BrickOccurrence[]): SaveSummary | null {
  const r = restoreProgress(raw, modelSha, occurrences);
  if (!r.ok) return null;
  const p = raw as Partial<LocalBuildProgress>;
  return {
    mode: r.session.mode,
    placed: r.session.placed,
    free: r.session.free ?? [],
    page: r.lastPdfPage ?? null,
    bookletSha256: r.lastBookletSha256 ?? null,
    mappingDigest: r.mappingDigest ?? null,
    updatedAtIso: typeof p.updatedAtIso === 'string' ? p.updatedAtIso : '',
  };
}

export function compareSaves(library: SaveSummary, browser: SaveSummary): SaveDiff {
  const lib = new Set(library.placed);
  const nav = new Set(browser.placed);
  const onlyInLibrary = library.placed.filter((id) => !nav.has(id));
  const onlyInBrowser = browser.placed.filter((id) => !lib.has(id));
  const keys: DiffKey[] = [];
  if (library.mode !== browser.mode) keys.push('mode');
  if (onlyInLibrary.length > 0 || onlyInBrowser.length > 0) keys.push('placed');
  if (freeSignature(library.free) !== freeSignature(browser.free)) keys.push('free');
  if (library.page !== browser.page) keys.push('page');
  if (library.bookletSha256 !== browser.bookletSha256) keys.push('booklet');
  if (library.mappingDigest !== browser.mappingDigest) keys.push('mapping');
  const newer = library.updatedAtIso === browser.updatedAtIso ? 'same' : library.updatedAtIso > browser.updatedAtIso ? 'library' : 'browser';
  return { keys, onlyInLibrary, onlyInBrowser, library, browser, newer };
}

/** Identity of a browser save, to remember that the user chose to keep the library's. */
export const saveSignature = (s: SaveSummary) =>
  JSON.stringify([s.mode, [...s.placed].sort(), s.page, s.bookletSha256, s.mappingDigest, ...(s.free.length > 0 ? [freeSignature(s.free)] : [])]);

/** Free pieces compared by identity, reference, colour and stored pose. */
function freeSignature(free: readonly FreePiece[]): string {
  return JSON.stringify([...free].map((f) => [f.id, f.partKey, f.colorCode, poseToLDraw(f.pose)]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

export type OpenDecision =
  | { readonly kind: 'none' }
  /** The library has nothing: the browser save is taken over (nothing to overwrite). */
  | { readonly kind: 'migrate'; readonly browser: SaveSummary }
  | { readonly kind: 'same' }
  /** Both differ: the user chooses, whatever their dates. */
  | { readonly kind: 'ask'; readonly diff: SaveDiff }
  /** Already answered "keep the library" for this exact browser save: still recoverable from the set page. */
  | { readonly kind: 'kept'; readonly diff: SaveDiff }
  /** The library holds a save that no longer fits the model: never replaced without asking. */
  | { readonly kind: 'ask-invalid'; readonly browser: SaveSummary };

/** `library`: 'absent' (no record), 'invalid' (a record that does not fit the model) or its summary. */
export function decideOnOpen(library: SaveSummary | 'absent' | 'invalid', browser: SaveSummary | null, keptSignature: string | null): OpenDecision {
  if (!browser) return { kind: 'none' };
  if (library === 'absent') return { kind: 'migrate', browser };
  if (library === 'invalid') return { kind: 'ask-invalid', browser };
  const diff = compareSaves(library, browser);
  if (diff.keys.length === 0) return { kind: 'same' };
  return keptSignature === saveSignature(browser) ? { kind: 'kept', diff } : { kind: 'ask', diff };
}

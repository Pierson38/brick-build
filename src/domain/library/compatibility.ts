import { msgs } from '../../i18n/runtime';
import type { BuildMode } from '../build/engine';
import type { MappingMatch, PreparedMapping, PreparedRoot } from './import-types';

/**
 * Compatibility sheet shown before confirming an import: which build modes the selected files
 * REALLY allow, and why the others are not offered. Pure function of measurements made by the
 * server (parser, local parts library, mapping validation) and of the user's selection.
 * Same rules as the collection (store.buildView): a PDF never implies a mapping, a mapping is
 * offered only when it is valid for this exact model AND its booklets are selected.
 */

export type MappingState = 'valid' | 'incomplete' | 'absent';

export interface SheetLine {
  readonly level: 'ok' | 'info' | 'warn' | 'error';
  readonly text: string;
}

export interface CompatibilitySheet {
  readonly modes: readonly BuildMode[];
  readonly mapping: MappingState;
  readonly headline: string;
  readonly lines: readonly SheetLine[];
}

export interface BuildSelection {
  readonly root: PreparedRoot;
  /** SHA-256 of the booklets selected for this build. */
  readonly bookletSha256s: readonly string[];
  readonly mapping: { readonly file: PreparedMapping; readonly match: MappingMatch | null } | null;
}

/** State of a mapping for this selection. `reason` explains an incomplete one. */
export function mappingState(sel: BuildSelection): { state: MappingState; reason: string | null } {
  if (!sel.mapping) return { state: 'absent', reason: null };
  const t = msgs().domain.compatibility;
  const { file, match } = sel.mapping;
  if (!match || match.rootName !== sel.root.rootName) return { state: 'absent', reason: t.otherModel };
  if (!match.structuralOk) return { state: 'incomplete', reason: match.firstError ?? t.incompleteMapping };
  if (file.bookletSha256s.length < file.bookletCount) return { state: 'incomplete', reason: t.bookletUnbound };
  const missing = file.bookletSha256s.filter((s) => !sel.bookletSha256s.includes(s)).length;
  if (missing > 0) return { state: 'incomplete', reason: t.bookletsNotSelected(missing) };
  return { state: 'valid', reason: null };
}

export function compatibility(sel: BuildSelection): CompatibilitySheet {
  const t = msgs().domain.compatibility;
  const { root } = sel;
  const lines: SheetLine[] = [];
  const hasSteps = root.planKind !== 'NO_STEPS' && root.stepCount > 0;
  const pdfs = sel.bookletSha256s.length;
  const map = mappingState(sel);
  const modes: BuildMode[] = [...(map.state === 'valid' ? ['synced' as const] : []), ...(hasSteps ? ['guided' as const] : []), 'freeManual'];

  if (root.occurrenceCount === 0) {
    return { modes: [], mapping: map.state, headline: t.unusableHeadline, lines: [{ level: 'error', text: t.noPieces }] };
  }

  if (map.state === 'valid') {
    lines.push({ level: 'ok', text: t.syncedAvailable(sel.mapping!.file.verified, sel.mapping!.file.steps) });
  } else if (pdfs > 0) {
    lines.push({ level: 'info', text: map.state === 'incomplete' ? t.syncedUnavailableIncomplete(map.reason) : t.syncedUnavailableNone });
  }
  if (hasSteps) {
    lines.push({ level: 'ok', text: t.guidedReady(root.stepCount, root.planKind === 'FLATTENED_STEPS') });
  } else {
    lines.push({ level: 'info', text: t.noSteps });
  }
  lines.push(pdfs > 0
    ? { level: 'ok', text: t.freeWithBooklets(pdfs) }
    : { level: 'info', text: t.freeWithoutBooklet });

  if (root.missingParts.checked && root.missingParts.refs.length > 0) {
    lines.push({ level: 'warn', text: t.missingParts(root.missingParts.refs.length, root.missingParts.occurrences, `${root.missingParts.refs.slice(0, 5).join(', ')}${root.missingParts.refs.length > 5 ? '…' : ''}`) });
  } else if (root.missingParts.checked) {
    lines.push({ level: 'ok', text: t.partsVerified(root.uniqueParts) });
  } else {
    lines.push({ level: 'warn', text: t.partsNotVerified });
  }
  if (root.errors > 0) lines.push({ level: 'warn', text: t.readErrors(root.errors) });
  lines.push({
    level: root.inventory.verdict === 'COHERENT' ? 'ok' : 'info',
    text: root.inventory.verdict === 'NOT_VERIFIED' ? t.inventoryNotVerified : root.inventory.message,
  });

  const headline = map.state === 'valid' ? t.headlineSynced
    : hasSteps ? t.headlineGuided
      : pdfs > 0 ? t.headlineFreeWithBooklet : t.headlineFree;
  return { modes, mapping: map.state, headline, lines };
}

/** Booklets of the set with no 3D model: they can be kept, but nothing can be built from them. */
export const noticeWithoutModel = (): string => msgs().domain.compatibility.noticeWithoutModel;

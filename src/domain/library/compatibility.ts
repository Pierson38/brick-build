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
  const { file, match } = sel.mapping;
  if (!match || match.rootName !== sel.root.rootName) return { state: 'absent', reason: 'ces correspondances concernent un autre modèle.' };
  if (!match.structuralOk) return { state: 'incomplete', reason: match.firstError ?? 'correspondances incomplètes.' };
  if (file.bookletSha256s.length < file.bookletCount) return { state: 'incomplete', reason: 'un livret des correspondances n’est lié à aucun PDF.' };
  const missing = file.bookletSha256s.filter((s) => !sel.bookletSha256s.includes(s)).length;
  if (missing > 0) return { state: 'incomplete', reason: `${missing} notice(s) attendue(s) par les correspondances non sélectionnée(s) pour cette construction.` };
  return { state: 'valid', reason: null };
}

export function compatibility(sel: BuildSelection): CompatibilitySheet {
  const { root } = sel;
  const lines: SheetLine[] = [];
  const hasSteps = root.planKind !== 'NO_STEPS' && root.stepCount > 0;
  const pdfs = sel.bookletSha256s.length;
  const map = mappingState(sel);
  const modes: BuildMode[] = [...(map.state === 'valid' ? ['synced' as const] : []), ...(hasSteps ? ['guided' as const] : []), 'freeManual'];

  if (root.occurrenceCount === 0) {
    return { modes: [], mapping: map.state, headline: 'Modèle inutilisable : aucune pièce lue.', lines: [{ level: 'error', text: 'Aucune pièce à construire dans ce modèle.' }] };
  }

  if (map.state === 'valid') {
    lines.push({ level: 'ok', text: `Notice synchronisée disponible : correspondances valides (${sel.mapping!.file.verified}/${sel.mapping!.file.steps} étape(s) vérifiée(s) visuellement).` });
  } else if (pdfs > 0) {
    lines.push({ level: 'info', text: `Notice synchronisée indisponible : ${map.state === 'incomplete' ? `correspondances incomplètes (${map.reason})` : 'aucune correspondance validée.'}` });
  }
  if (hasSteps) {
    lines.push({ level: 'ok', text: `Modèle prêt pour le montage guidé : ${root.stepCount} étape(s) LDraw${root.planKind === 'FLATTENED_STEPS' ? ' (sous-modèles construits à part, ordre différent de la notice officielle)' : ''}.` });
  } else {
    lines.push({ level: 'info', text: 'Pas d’étapes LDraw dans ce fichier : montage libre uniquement (toute pièce à toute position compatible).' });
  }
  lines.push(pdfs > 0
    ? { level: 'ok', text: `Montage libre avec notice : ${pdfs} livret(s) PDF affiché(s) à côté du modèle.` }
    : { level: 'info', text: 'Pas de notice PDF associée : montage libre sans notice.' });

  if (root.missingParts.checked && root.missingParts.refs.length > 0) {
    lines.push({ level: 'warn', text: `Modèle incomplet à l’écran : ${root.missingParts.refs.length} référence(s) de pièce absente(s) de ta bibliothèque LDraw (${root.missingParts.occurrences} pièce(s)) : ${root.missingParts.refs.slice(0, 5).join(', ')}${root.missingParts.refs.length > 5 ? '…' : ''}.` });
  } else if (!root.missingParts.checked) {
    lines.push({ level: 'warn', text: 'Pièces non vérifiées : bibliothèque LDraw locale non configurée (LDRAW_LIBRARY_DIR).' });
  }
  if (root.errors > 0) lines.push({ level: 'warn', text: `${root.errors} erreur(s) de lecture : certaines lignes ou branches du fichier sont ignorées.` });
  lines.push({
    level: root.inventory.verdict === 'COHERENT' ? 'ok' : 'info',
    text: root.inventory.verdict === 'NOT_VERIFIED' ? 'Inventaire indéterminé : non comparé à l’inventaire officiel, le nombre de pièces n’est pas garanti.' : root.inventory.message,
  });

  const headline = map.state === 'valid' ? 'Notice synchronisée disponible.'
    : hasSteps ? 'Modèle prêt pour le montage guidé.'
      : pdfs > 0 ? 'Montage libre avec notice.' : 'Montage libre disponible.';
  return { modes, mapping: map.state, headline, lines };
}

/** Booklets of the set with no 3D model: they can be kept, but nothing can be built from them. */
export const NOTICE_WITHOUT_MODEL = 'Notice trouvée sans modèle 3D : pas de construction interactive disponible. Une notice PDF seule ne permet pas de reconstituer le modèle assemblé.';

'use client';

import { useEffect, useMemo, useState } from 'react';
import type { LocalBuildProgress } from '@/domain/build/progress';
import { mappingDigest, parseMapping, serializeMapping, validateMapping, type InstructionMapping, type MappingTarget } from '@/domain/instructions/mapping';
import { compareSaves, summarise, type SaveDiff, type SaveSummary } from '@/domain/library/save-compare';
import type { BrickOccurrence } from '@/domain/ldraw/types';
import { libraryApi } from '@/infra/library/api';
import { loadStoredMapping } from '@/infra/persistence/local-mapping';
import { loadStoredProgress } from '@/infra/persistence/local-progress';
import { formatDate, MODE_SHORT } from './labels';

/** The P5/P6 save this browser keeps for a model (localStorage, by model SHA-256), if it fits the model. */
export function readBrowserSave(modelSha: string, occurrences: readonly BrickOccurrence[]): { raw: LocalBuildProgress; summary: SaveSummary } | null {
  const raw = loadStoredProgress(modelSha);
  const summary = summarise(raw, modelSha, occurrences);
  return summary ? { raw: raw as LocalBuildProgress, summary } : null;
}

/** This browser's mapping for the model, if valid for it (never another model's). */
export function readBrowserMapping(target: MappingTarget): InstructionMapping | null {
  const stored = loadStoredMapping(target.sha256);
  if (!stored?.ok) return null;
  return validateMapping(stored.mapping, target).issues.some((i) => i.code === 'MODEL_MISMATCH') ? null : stored.mapping;
}

// "Keep the library" is remembered per build and per exact browser save, in this browser only.
const KEPT = 'brick-lab:library-kept:';
export const keptSignatureOf = (buildId: string): string | null => {
  try {
    return window.localStorage.getItem(KEPT + buildId);
  } catch {
    return null;
  }
};
export const rememberKept = (buildId: string, signature: string) => {
  try {
    window.localStorage.setItem(KEPT + buildId, signature);
  } catch {
    // storage unavailable: the question will simply be asked again
  }
};

/**
 * Puts this browser's save into the library, explicitly chosen by the user. The library's current
 * version (and mapping) goes to the build's history, never lost; a newer library save made in the
 * meantime is refused (revision), not overwritten.
 */
export async function recoverBrowserSave(buildId: string, progressRevision: number | null, raw: LocalBuildProgress, mapping?: { revision: number | null; value: InstructionMapping }) {
  const p = await libraryApi.putProgress(buildId, progressRevision, raw, false, 'browser');
  const m = mapping ? await libraryApi.putMapping(buildId, mapping.revision, serializeMapping(mapping.value), 'browser') : null;
  return { progressRevision: p.revision, mappingRevision: m?.revision ?? null };
}

export const mappingsDiffer = (library: InstructionMapping | null, browser: InstructionMapping | null) =>
  browser !== null && (library === null || mappingDigest(library) !== mappingDigest(browser));

const pageText = (s: SaveSummary) => (s.page === null ? '—' : `p. ${s.page}`);
const bookletText = (s: SaveSummary, other: SaveSummary) =>
  s.bookletSha256 === null ? 'aucun' : s.bookletSha256 === other.bookletSha256 ? 'même livret' : `livret ${s.bookletSha256.slice(0, 8)}…`;
const mappingText = (s: SaveSummary) => (s.mappingDigest === null ? '—' : `empreinte ${s.mappingDigest}`);

/** Side-by-side view of the relevant differences; differing rows are marked. */
export function SaveDiffView({ diff, total }: { diff: SaveDiff; total: number }) {
  const { library: l, browser: b } = diff;
  const rows: [string, string, string, boolean][] = [
    ['Pièces posées', `${l.placed.length + l.free.length}/${total}`, `${b.placed.length + b.free.length}/${total}`, diff.keys.includes('placed') || diff.keys.includes('free')],
    ...(l.free.length > 0 || b.free.length > 0 ? [['Dont posées librement', String(l.free.length), String(b.free.length), diff.keys.includes('free')] as [string, string, string, boolean]] : []),
    ['Mode', MODE_SHORT[l.mode], MODE_SHORT[b.mode], diff.keys.includes('mode')],
    ['Page de la notice', pageText(l), pageText(b), diff.keys.includes('page')],
    ['Livret affiché', bookletText(l, b), bookletText(b, l), diff.keys.includes('booklet')],
    ['Correspondances jouées', mappingText(l), mappingText(b), diff.keys.includes('mapping')],
    ['Enregistrée le', formatDate(l.updatedAtIso) || '—', formatDate(b.updatedAtIso) || '—', false],
  ];
  return (
    <table className="diff small" data-testid="save-diff">
      <thead><tr><th /><th>Bibliothèque</th><th>Ce navigateur</th></tr></thead>
      <tbody>
        {rows.map(([label, lib, nav, differs]) => (
          <tr key={label} className={differs ? 'differs' : undefined} data-testid={`diff-${label}`}>
            <th scope="row">{label}</th><td>{lib}</td><td>{nav}</td>
          </tr>
        ))}
        {diff.keys.includes('placed') && (
          <tr><th scope="row">Détail</th><td>{diff.onlyInLibrary.length} pièce(s) posée(s) seulement ici</td><td>{diff.onlyInBrowser.length} pièce(s) posée(s) seulement ici</td></tr>
        )}
      </tbody>
    </table>
  );
}

/**
 * Set detail: this browser's P5/P6 save for the build, when it differs from the library's, with an
 * explicit "take it" action — available whatever its date, as long as it fits the model.
 */
export function BrowserSavePanel({ buildId, modelSha, rootName, fileName, occurrences, libraryRevision, onDone, notify }: {
  buildId: string; modelSha: string; rootName: string; fileName: string; occurrences: readonly BrickOccurrence[];
  /** Changes when the library progress changes (reloads the comparison). */
  libraryRevision: number | null;
  onDone: () => void;
  notify: (kind: 'ok' | 'error', text: string) => void;
}) {
  const [state, setState] = useState<{ rev: number | null; lib: SaveSummary | 'absent' | 'invalid'; mapping: { revision: number | null; value: InstructionMapping | null } } | null>(null);
  const [asking, setAsking] = useState(false);
  const [withMapping, setWithMapping] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([libraryApi.progress(buildId), libraryApi.mapping(buildId)]).then(([p, m]) => {
      if (cancelled) return;
      const parsed = m.mapping ? parseMapping(m.mapping) : null;
      setState({
        rev: p.revision,
        lib: p.progress === null ? 'absent' : summarise(p.progress, modelSha, occurrences) ?? 'invalid',
        mapping: { revision: m.revision, value: parsed?.ok ? parsed.mapping : null },
      });
    }, () => undefined);
    return () => {
      cancelled = true;
    };
  }, [buildId, modelSha, occurrences, libraryRevision]);
  const local = useMemo(() => readBrowserSave(modelSha, occurrences), [modelSha, occurrences, state]); // eslint-disable-line react-hooks/exhaustive-deps
  const localMapping = useMemo(() => readBrowserMapping({ sha256: modelSha, fileName, rootName, occurrences }), [modelSha, fileName, rootName, occurrences, state]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!state || !local) return null;
  const diff = state.lib === 'absent' || state.lib === 'invalid' ? null : compareSaves(state.lib, local.summary);
  const mappingDiffers = mappingsDiffer(state.mapping.value, localMapping);
  if (diff && diff.keys.length === 0 && !mappingDiffers) return null;
  const total = occurrences.length;
  const take = async () => {
    try {
      await recoverBrowserSave(buildId, state.rev, local.raw, withMapping && localMapping ? { revision: state.mapping.revision, value: localMapping } : undefined);
      notify('ok', `Sauvegarde de ce navigateur reprise (${local.summary.placed.length}/${total} pièces). La version précédente de la bibliothèque est dans son historique.`);
      setAsking(false);
      onDone();
    } catch (e) {
      notify('error', e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="browser-save small" data-testid="browser-save">
      <h3>Sauvegarde de ce navigateur</h3>
      {diff
        ? (diff.keys.length > 0 ? <SaveDiffView diff={diff} total={total} /> : <p>Progression identique ; seules les correspondances diffèrent.</p>)
        : <p>{state.lib === 'absent' ? 'La bibliothèque n’a pas encore de progression pour cette construction.' : 'La progression de la bibliothèque ne correspond plus au modèle (conservée).'} Ce navigateur : {local.summary.placed.length}/{total} pièces, {formatDate(local.summary.updatedAtIso)}.</p>}
      {mappingDiffers && <label className="block"><input type="checkbox" checked={withMapping} onChange={(e) => setWithMapping(e.target.checked)} data-testid="browser-save-with-mapping" /> Reprendre aussi les correspondances de ce navigateur</label>}
      {!asking
        ? <button type="button" className="small" onClick={() => setAsking(true)} data-testid="browser-save-take">Reprendre la sauvegarde de ce navigateur</button>
        : (
          <span className="confirm">
            La progression actuelle de la bibliothèque sera remplacée et gardée dans son historique.{' '}
            <button type="button" className="danger small" onClick={() => void take()} data-testid="browser-save-confirm">Confirmer</button>
            {' '}<button type="button" className="small" onClick={() => setAsking(false)}>Annuler</button>
          </span>
        )}
    </div>
  );
}

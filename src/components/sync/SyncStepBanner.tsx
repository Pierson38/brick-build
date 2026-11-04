'use client';

import type { BuildStep } from '@/domain/build/build-plan';
import type { Booklet } from '@/domain/instructions/mapping';
import type { PdfView } from '../pdf/useNotice';

interface Props {
  readonly steps: readonly BuildStep[];
  readonly activeIdx: number;
  /** Step shown: the active one, or a past one being consulted. */
  readonly shownIdx: number;
  readonly placed: ReadonlySet<string>;
  readonly booklet: Booklet | null;
  readonly bookletOpen: boolean;
  readonly view: PdfView | null;
  readonly onConsult: (stepIdx: number | null) => void;
  readonly onRewind: (stepIdx: number) => void;
  readonly onShowStepPage: () => void;
}

/** Booklet step of the synchronised mode, above the PDF page. */
export function SyncStepBanner({ steps, activeIdx, shownIdx, placed, booklet, bookletOpen, view, onConsult, onRewind, onShowStepPage }: Props) {
  const step = steps[shownIdx];
  if (!step?.instruction) return null;
  const ref = step.instruction;
  const consulting = shownIdx !== activeIdx;
  const done = step.occurrenceIds.filter((id) => placed.has(id)).length;
  const onStepPage = Boolean(booklet?.sha256 && view && view.sha256 === booklet.sha256 && view.page === ref.page);
  return (
    <div className={consulting ? 'sync-banner consulting' : 'sync-banner'} data-testid="sync-banner">
      <div>
        <strong data-testid="sync-step">{ref.label}</strong>
        {' — '}{booklet?.label ?? 'livret ?'}, <span data-testid="sync-page">p. {ref.page}</span>
        {ref.stepsOnPage > 1 && <span className="muted"> ({ref.positionOnPage}<sup>{ref.positionOnPage === 1 ? 're' : 'e'}</sup> étape imprimée sur {ref.stepsOnPage} de la page)</span>}
        <span className="muted small"> · {consulting ? 'étape déjà faite, consultation' : `${done}/${step.occurrenceIds.length} pièce(s) de l’étape`}</span>
      </div>
      {!bookletOpen && booklet && (
        <p className="small warn" data-testid="sync-missing-booklet">
          Livret non ouvert : importe « {booklet.fileName} » ({booklet.pageCount} p.) pour voir la page {ref.page}. Un autre PDF ne sera pas utilisé à sa place.
        </p>
      )}
      {bookletOpen && !onStepPage && (
        <p className="small warn" data-testid="sync-off-page">
          Page affichée ≠ page de l’étape.{' '}
          <button type="button" className="small" onClick={onShowStepPage}>Revenir à la p. {ref.page}</button>
        </p>
      )}
      <div className="sync-actions">
        <button type="button" className="small" disabled={shownIdx <= 0} onClick={() => onConsult(shownIdx - 1)}>◀ Étape précédente</button>
        {consulting && <button type="button" className="small" onClick={() => onConsult(shownIdx + 1 >= activeIdx ? null : shownIdx + 1)}>Étape suivante ▶</button>}
        {consulting && <button type="button" className="small primary-text" onClick={() => onConsult(null)}>Revenir à l’étape en cours</button>}
        {consulting && <button type="button" className="small" data-testid="sync-rewind" onClick={() => onRewind(shownIdx)}>Reprendre depuis cette étape</button>}
      </div>
    </div>
  );
}

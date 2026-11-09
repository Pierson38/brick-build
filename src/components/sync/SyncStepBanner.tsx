'use client';

import { ChevronLeft, ChevronRight, History, RotateCcw, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { BuildStep } from '@/domain/build/build-plan';
import type { Booklet } from '@/domain/instructions/mapping';
import { ProgressBar } from '../library/labels';
import type { PdfView } from '../pdf/useNotice';
import { ConfirmDialog } from '../ui/Dialog';

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

/**
 * Booklet step of the synchronised mode, above the PDF page: the step, its page and progress, the
 * past steps to consult (amber) and « Reprendre depuis cette étape », confirmed first: it removes
 * placed bricks that « Annuler » cannot bring back.
 */
export function SyncStepBanner({ steps, activeIdx, shownIdx, placed, booklet, bookletOpen, view, onConsult, onRewind, onShowStepPage }: Props) {
  const [confirmRewind, setConfirmRewind] = useState(false);
  const step = steps[shownIdx];
  if (!step?.instruction) return null;
  const ref = step.instruction;
  const consulting = shownIdx !== activeIdx;
  const done = step.occurrenceIds.filter((id) => placed.has(id)).length;
  const onStepPage = Boolean(booklet?.sha256 && view && view.sha256 === booklet.sha256 && view.page === ref.page);
  const removed = steps.slice(shownIdx).flatMap((s) => s.occurrenceIds).filter((id) => placed.has(id)).length;
  return (
    <div className={consulting ? 'sync-banner consulting' : 'sync-banner'} data-testid="sync-banner">
      {consulting && <p className="sync-kicker"><History size={14} aria-hidden /> Consultation d’une étape déjà faite</p>}
      <div className="sync-head">
        <strong className="sync-label" data-testid="sync-step">{ref.label}</strong>
        <span className="sync-where">{booklet?.label ?? 'livret ?'}, <span data-testid="sync-page">p. {ref.page}</span></span>
      </div>
      {(ref.stepsOnPage > 1 || !consulting) && (
        <p className="sync-detail small muted">
          {ref.stepsOnPage > 1 && <>({ref.positionOnPage}<sup>{ref.positionOnPage === 1 ? 're' : 'e'}</sup> étape imprimée sur {ref.stepsOnPage} de la page){!consulting && ' · '}</>}
          {!consulting && `${done}/${step.occurrenceIds.length} pièce(s) de l’étape`}
        </p>
      )}
      {!consulting && <ProgressBar placed={done} total={step.occurrenceIds.length} label="Pièces posées de l’étape" />}
      {!bookletOpen && booklet && (
        <p className="sync-warn small" data-testid="sync-missing-booklet">
          <TriangleAlert size={14} aria-hidden />
          <span>Livret non ouvert : importe « {booklet.fileName} » ({booklet.pageCount} p.) pour voir la page {ref.page}. Un autre PDF ne sera pas utilisé à sa place.</span>
        </p>
      )}
      {bookletOpen && !onStepPage && (
        <p className="sync-warn small" data-testid="sync-off-page">
          <TriangleAlert size={14} aria-hidden />
          <span>Page affichée ≠ page de l’étape.{' '}
            <button type="button" className="link" onClick={onShowStepPage}>Revenir à la p. {ref.page}</button></span>
        </p>
      )}
      <div className="sync-actions">
        <button type="button" className="ghost small" disabled={shownIdx <= 0} onClick={() => onConsult(shownIdx - 1)}><ChevronLeft size={14} aria-hidden /> Étape précédente</button>
        {consulting && <button type="button" className="ghost small" onClick={() => onConsult(shownIdx + 1 >= activeIdx ? null : shownIdx + 1)}>Étape suivante <ChevronRight size={14} aria-hidden /></button>}
        {consulting && <button type="button" className="secondary small" onClick={() => onConsult(null)}>Revenir à l’étape en cours</button>}
        {consulting && <button type="button" className="ghost small danger-text" data-testid="sync-rewind" onClick={() => setConfirmRewind(true)}><RotateCcw size={14} aria-hidden /> Reprendre depuis cette étape</button>}
      </div>
      <ConfirmDialog open={confirmRewind} testId="confirm-rewind" title={`Reprendre depuis ${ref.label} ?`} confirmLabel="Reprendre depuis cette étape"
        onCancel={() => setConfirmRewind(false)} onConfirm={() => { setConfirmRewind(false); onRewind(shownIdx); }}>
        <p>
          {removed > 0
            ? `${removed} pièce(s) posée(s) à cette étape et aux suivantes seront retirées ; « Annuler » ne pourra pas les remettre.`
            : 'Aucune pièce n’est posée à cette étape ni aux suivantes : rien ne sera retiré.'}
        </p>
      </ConfirmDialog>
    </div>
  );
}

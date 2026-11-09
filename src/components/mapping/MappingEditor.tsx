'use client';

import { Check, ChevronLeft, ChevronRight, Download, MousePointerClick, Plus, Trash2, Upload } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { trayKey } from '@/domain/build/engine';
import type { StepPlan } from '@/domain/build/build-plan';
import {
  addBooklet, addStep, assignToStep, assignmentIndex, bindBooklet, moveStep, removeBooklet, removeStep, renameBooklet,
  resolveDuplicatesKeepFirst, stepLabel, unassignFromStep, updateStep, type InstructionMapping, type MappingReport, type StepPatch,
} from '@/domain/instructions/mapping';
import type { BrickOccurrence } from '@/domain/ldraw/types';
import type { NoticeState } from '../pdf/useNotice';
import { ConfirmDialog } from '../ui/Dialog';
import { Note } from '../ui/feedback';

interface Props {
  readonly mapping: InstructionMapping;
  readonly report: MappingReport;
  readonly occurrences: readonly BrickOccurrence[];
  /** LDraw steps of the file, offered as an input aid only. */
  readonly ldrawPlan: StepPlan;
  readonly notice: NoticeState;
  readonly currentStepId: string | null;
  readonly onSelectStep: (stepId: string | null) => void;
  readonly onChange: (next: InstructionMapping, message?: string) => void;
  readonly onExport: () => void;
  readonly onImportFile: (file: File) => void;
  readonly onClear: () => void;
  readonly onClose: () => void;
  readonly showLater: boolean;
  readonly onShowLater: (value: boolean) => void;
  readonly colourOf: (code: string) => string | null;
}

interface Group { key: string; partRef: string; colorCode: string; ids: string[] }

function groupByPart(ids: readonly string[], byId: ReadonlyMap<string, BrickOccurrence>): Group[] {
  const groups = new Map<string, Group>();
  for (const id of ids) {
    const o = byId.get(id);
    if (!o) continue;
    const key = trayKey(o.partKey, o.colorCode);
    const g = groups.get(key) ?? { key, partRef: o.partRef.replace(/\.dat$/i, ''), colorCode: o.colorCode, ids: [] };
    g.ids.push(id);
    groups.set(key, g);
  }
  return [...groups.values()];
}

/**
 * Manual booklet ↔ 3D mapping editor. Every assignment is an explicit user action (3D click or
 * a button); nothing is read from the PDF. The 3D view (outside this panel) shows the build up to
 * the current step, its bricks highlighted, unassigned bricks as ghosts.
 */
export function MappingEditor(props: Props) {
  const { mapping, report, occurrences, ldrawPlan, notice, currentStepId, onSelectStep, onChange, colourOf } = props;
  const byId = useMemo(() => new Map(occurrences.map((o) => [o.occurrenceId, o] as const)), [occurrences]);
  const index = useMemo(() => assignmentIndex(mapping), [mapping]);
  const [confirmClear, setConfirmClear] = useState(false);
  const formId = useId();
  const stepIdx = mapping.steps.findIndex((s) => s.id === currentStepId);
  const step = stepIdx >= 0 ? mapping.steps[stepIdx]! : null;
  const shownBooklet = notice.view ? mapping.booklets.find((b) => b.sha256 === notice.view!.sha256) ?? null : null;
  const unboundActive = notice.active && !shownBooklet ? notice.active : null;

  const patch = (p: StepPatch) => step && onChange(updateStep(mapping, step.id, p));
  const newStep = () => {
    if (mapping.booklets.length === 0) return onChange(mapping, 'Ajoute d’abord un livret (le PDF affiché).');
    const init = shownBooklet && notice.view ? { bookletId: shownBooklet.id, page: notice.view.page } : {};
    const r = addStep(mapping, step?.id ?? null, init);
    onChange(r.mapping);
    onSelectStep(r.stepId);
  };
  const assign = (ids: readonly string[]) => {
    if (!step) return;
    const r = assignToStep(mapping, step.id, ids);
    onChange(r.mapping, r.alreadyElsewhere.length > 0 ? `${r.alreadyElsewhere.length} pièce(s) déjà dans une autre étape, laissée(s) en place.` : undefined);
  };

  const unassignedGroups = groupByPart(report.unassigned, byId);
  const stepGroups = step ? groupByPart(step.occurrenceIds, byId) : [];
  const ldrawOptions = ldrawPlan.steps.map((s, i) => ({ i, free: s.occurrenceIds.filter((id) => !index.has(id)) })).filter((s) => s.free.length > 0);
  const [ldrawChoice, setLdrawChoice] = useState<number | null>(null);
  const ldrawSelected = ldrawOptions.find((o) => o.i === ldrawChoice) ?? ldrawOptions[0];
  const errors = report.issues.filter((i) => i.severity === 'error');

  const field = (name: string) => `${formId}-${name}`;

  return (
    <section className="mapping-editor" aria-label="Correspondances notice ↔ 3D">
      <div className="editor-head">
        <div className="editor-title">
          <strong>Correspondances notice ↔ 3D</strong>
          <span className={report.ok ? 'badge q-GUIDED_PLAYABLE' : 'badge q-ANALYSABLE'} data-testid="mapping-status">
            {report.ok ? 'Valide : mode synchronisé disponible' : `Brouillon : ${errors.length} problème(s) bloquant(s)`}
          </span>
          <span className="small muted num" data-testid="mapping-coverage">{report.assigned}/{report.total} pièces affectées · {mapping.steps.length} étape(s)</span>
        </div>
        <button type="button" className="primary small" onClick={props.onClose}><Check size={14} aria-hidden /> Terminer l’édition</button>
      </div>

      <details className="editor-section" open={mapping.booklets.length === 0 || unboundActive !== null}>
        <summary>Livrets ({mapping.booklets.length})</summary>
        <ul className="plain booklets">
          {mapping.booklets.map((b) => {
            const open = notice.booklets.some((x) => x.sha256 === b.sha256);
            return (
              <li key={b.id} className="booklet-row">
                <input aria-label={`Nom du livret ${b.id}`} value={b.label} onChange={(e) => onChange(renameBooklet(mapping, b.id, e.target.value))} />
                <span className="small muted">
                  {b.sha256 ? <>{b.fileName}, {b.pageCount} p., empreinte <span className="mono">{b.sha256.slice(0, 10)}…</span></> : 'non lié à un PDF'}
                  {' · '}{open ? <span className="ok">ouvert</span> : <span>à réimporter pour voir ses pages</span>}
                </span>
                <span className="booklet-actions">
                  {unboundActive && <button type="button" className="secondary small" onClick={() => onChange(bindBooklet(mapping, b.id, { fileName: unboundActive.fileName, sha256: unboundActive.sha256, pageCount: unboundActive.pageCount }), `Livret « ${b.label} » lié à ${unboundActive.fileName}.`)}>Lier au PDF affiché</button>}
                  <button type="button" className="ghost small" onClick={() => { const next = removeBooklet(mapping, b.id); onChange(next ?? mapping, next ? undefined : 'Ce livret est utilisé par des étapes : impossible de le retirer.'); }}>Retirer</button>
                </span>
              </li>
            );
          })}
        </ul>
        {unboundActive ? (
          <button type="button" className="secondary small" data-testid="add-booklet" onClick={() => {
            const label = `Livret ${mapping.booklets.length + 1}`;
            onChange(addBooklet(mapping, { label, fileName: unboundActive.fileName, sha256: unboundActive.sha256, pageCount: unboundActive.pageCount }).mapping, `${unboundActive.fileName} ajouté comme « ${label} ».`);
          }}><Plus size={14} aria-hidden /> Ajouter le PDF affiché comme livret</button>
        ) : !notice.active && <p className="small muted">Importe la notice ci-dessus (un PDF par livret) pour la lier.</p>}
      </details>

      <div className="editor-nav">
        <button type="button" className="ghost icon small" aria-label="Étape de notice précédente" disabled={stepIdx <= 0} onClick={() => onSelectStep(mapping.steps[stepIdx - 1]!.id)}><ChevronLeft size={16} aria-hidden /></button>
        <select aria-label="Étape de notice" data-testid="mapping-step-select" value={step?.id ?? ''} onChange={(e) => onSelectStep(e.target.value || null)}>
          {mapping.steps.length === 0 && <option value="">Aucune étape</option>}
          {mapping.steps.map((s, i) => (
            <option key={s.id} value={s.id}>
              {i + 1}. {stepLabel(s)} — {mapping.booklets.find((b) => b.id === s.bookletId)?.label ?? '?'} p. {s.page} ({s.occurrenceIds.length}){s.provenance === 'verified' ? ' ✓' : ''}
            </option>
          ))}
        </select>
        <button type="button" className="ghost icon small" aria-label="Étape de notice suivante" disabled={stepIdx < 0 || stepIdx >= mapping.steps.length - 1} onClick={() => onSelectStep(mapping.steps[stepIdx + 1]!.id)}><ChevronRight size={16} aria-hidden /></button>
        <button type="button" className="secondary small" data-testid="mapping-new-step" onClick={newStep}><Plus size={14} aria-hidden /> Nouvelle étape</button>
      </div>

      {step && (
        <div className="editor-step" data-testid="mapping-step">
          <div className="editor-form">
            <label htmlFor={field('booklet')}>Livret</label>
            <select id={field('booklet')} value={step.bookletId} onChange={(e) => patch({ bookletId: e.target.value })}>
              {mapping.booklets.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
            <label htmlFor={field('page')}>Page PDF</label>
            <span className="editor-inline">
              <input id={field('page')} type="number" min={1} data-testid="mapping-page" value={step.page} onChange={(e) => { const v = Number(e.target.value); if (Number.isInteger(v) && v >= 1) patch({ page: v }); }} />
              {shownBooklet && notice.view && (shownBooklet.id !== step.bookletId || notice.view.page !== step.page) && (
                <button type="button" className="ghost small" onClick={() => patch({ bookletId: shownBooklet.id, page: notice.view!.page })}>= page affichée ({notice.view.page})</button>
              )}
            </span>
            <label htmlFor={field('printed')}>N° imprimé</label>
            <input id={field('printed')} data-testid="mapping-printed" size={4} value={step.printedStep} onChange={(e) => e.target.value.trim() && patch({ printedStep: e.target.value.trim() })} />
            <label htmlFor={field('callout')}>Encadré</label>
            <input id={field('callout')} data-testid="mapping-callout" size={3} value={step.callout ?? ''} placeholder="—" onChange={(e) => patch({ callout: e.target.value.trim() })} />
            <label htmlFor={field('repeat')}>Multiplicateur ×</label>
            <input id={field('repeat')} type="number" min={1} max={99} data-testid="mapping-repeat" value={step.repeat ?? 1} onChange={(e) => patch({ repeat: Number(e.target.value) })} />
            <span aria-hidden />
            <label className="check"><input type="checkbox" data-testid="mapping-verified" checked={step.provenance === 'verified'}
              onChange={(e) => patch({ provenance: e.target.checked ? 'verified' : 'manual' })} /> Vérifiée contre la page</label>
            <label htmlFor={field('note')}>Note</label>
            <input id={field('note')} placeholder="ex. pièce de la notice absente du fichier" value={step.note ?? ''} onChange={(e) => patch({ note: e.target.value })} />
          </div>
          <div className="editor-actions">
            <button type="button" className="ghost small" disabled={stepIdx === 0} onClick={() => onChange(moveStep(mapping, step.id, -1))}>↑ Monter</button>
            <button type="button" className="ghost small" disabled={stepIdx === mapping.steps.length - 1} onClick={() => onChange(moveStep(mapping, step.id, 1))}>↓ Descendre</button>
            <span className="spacer" />
            <button type="button" className="ghost small danger-text" onClick={() => {
              onSelectStep(mapping.steps[stepIdx + 1]?.id ?? mapping.steps[stepIdx - 1]?.id ?? null);
              onChange(removeStep(mapping, step.id), `${stepLabel(step)} supprimée ; ses pièces redeviennent non affectées.`);
            }}><Trash2 size={14} aria-hidden /> Supprimer l’étape</button>
          </div>

          <p className="editor-hint small muted"><MousePointerClick size={14} aria-hidden /> <span>Clic en 3D : affecter une pièce fantôme à cette étape, ou retirer une pièce surlignée. ⌥-clic : déplacer ici une pièce d’une autre étape.</span></p>
          <h4>Pièces de cette étape <span className="muted num">({step.occurrenceIds.length})</span></h4>
          {stepGroups.length === 0 ? <p className="small muted">Aucune pièce.</p> : (
            <ul className="chips">
              {stepGroups.map((g) => (
                <li key={g.key}>
                  <span className="swatch" style={{ background: colourOf(g.colorCode) ?? '#999' }} />
                  <span className="mono">{g.partRef}</span> <span className="muted">c{g.colorCode}</span> ×{g.ids.length}
                  <button type="button" className="small" aria-label={`Retirer une pièce ${g.partRef} couleur ${g.colorCode}`} data-testid={`step-remove-${g.key}`}
                    onClick={() => onChange(unassignFromStep(mapping, step.id, [g.ids.at(-1)!]))}>−1</button>
                </li>
              ))}
            </ul>
          )}

          <h4>Pièces non affectées <span className="muted num">({report.unassigned.length})</span></h4>
          {unassignedGroups.length === 0 ? <p className="small ok">Toutes les pièces sont affectées.</p> : (
            <ul className="chips">
              {unassignedGroups.map((g) => (
                <li key={g.key}>
                  <span className="swatch" style={{ background: colourOf(g.colorCode) ?? '#999' }} />
                  <span className="mono">{g.partRef}</span> <span className="muted">c{g.colorCode}</span> ×{g.ids.length}
                  <button type="button" className="small" aria-label={`+1 : ajouter une pièce ${g.partRef} couleur ${g.colorCode} à l’étape`} data-tip="Ajoute la première pièce libre dans l’ordre du fichier : vérifie sa position en 3D" data-testid={`unassigned-add-${g.key}`} onClick={() => assign([g.ids[0]!])}>+1</button>
                  {g.ids.length > 1 && <button type="button" className="small" aria-label={`+${g.ids.length} : ajouter les ${g.ids.length} pièces ${g.partRef} couleur ${g.colorCode} à l’étape`} onClick={() => assign(g.ids)}>+{g.ids.length}</button>}
                </li>
              ))}
            </ul>
          )}
          {ldrawOptions.length > 0 && ldrawSelected && (
            <div className="editor-aid small">
              <span className="aid-row">
                <span>Aide :</span>
                <select aria-label="Étape LDraw" value={ldrawSelected.i} onChange={(e) => setLdrawChoice(Number(e.target.value))}>
                  {ldrawOptions.map((o) => <option key={o.i} value={o.i}>étape LDraw {o.i + 1} ({o.free.length} libre(s))</option>)}
                </select>
                <button type="button" className="secondary small" data-testid="assign-ldraw-step" onClick={() => assign(ldrawSelected.free)}>Ajouter ses pièces libres</button>
              </span>
              <span className="muted">Le découpage LDraw diffère de la notice : retire ensuite ce qui appartient à l’étape suivante.</span>
            </div>
          )}
        </div>
      )}

      {report.duplicates.size > 0 && (
        <Note tone="error" testId="mapping-duplicates">
          {report.duplicates.size} pièce(s) en double.{' '}
          <button type="button" className="link" onClick={() => onChange(resolveDuplicatesKeepFirst(mapping), 'Doublons retirés : chaque pièce reste dans sa première étape.')}>Garder la première étape</button>
        </Note>
      )}

      <details className="editor-section" open={!report.ok && mapping.steps.length > 0}>
        <summary>Validation ({report.issues.length} remarque(s))</summary>
        <ul className="plain small" data-testid="mapping-issues">
          {report.issues.map((issue, i) => (
            <li key={i} className={issue.severity}>
              <span className={`issue-tag ${issue.severity}`}>{issue.severity === 'error' ? 'bloquant' : issue.severity === 'warning' ? 'attention' : 'info'}</span> {issue.message}
              {issue.stepId && issue.stepId !== currentStepId && <> <button type="button" className="link" onClick={() => onSelectStep(issue.stepId!)}>voir</button></>}
            </li>
          ))}
        </ul>
      </details>

      <label className="check small"><input type="checkbox" checked={props.showLater} onChange={(e) => props.onShowLater(e.target.checked)} /> Montrer en fantôme les pièces des étapes suivantes</label>
      <div className="editor-actions editor-tools">
        <button type="button" className="secondary small" data-testid="mapping-export" onClick={props.onExport}><Download size={14} aria-hidden /> Exporter (.json)</button>
        <label className="button secondary small">
          <Upload size={14} aria-hidden /> Importer un fichier de correspondances
          <input type="file" accept="application/json,.json" className="visually-hidden" data-testid="mapping-import" onChange={(e) => { const f = e.target.files?.[0]; if (f) props.onImportFile(f); e.target.value = ''; }} />
        </label>
        <span className="spacer" />
        <button type="button" className="ghost small danger-text" onClick={() => setConfirmClear(true)}><Trash2 size={14} aria-hidden /> Tout effacer</button>
      </div>
      <p className="small muted">Sauvegarde locale automatique. Le fichier ne contient que des identifiants de pièces, des numéros de pages/étapes et des empreintes : aucun contenu de la notice.</p>
      <ConfirmDialog open={confirmClear} testId="confirm-clear" title="Effacer toutes les correspondances ?" confirmLabel="Confirmer l’effacement"
        onCancel={() => setConfirmClear(false)} onConfirm={() => { setConfirmClear(false); props.onClear(); }}>
        <p>Les {mapping.steps.length} étape(s) et leurs {report.assigned} pièce(s) affectée(s) seront vidées. Tu pourras les restaurer juste après avec « Les restaurer ».</p>
      </ConfirmDialog>
    </section>
  );
}

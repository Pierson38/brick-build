'use client';

import type { ModelAnalysis, QualityReport } from '@/domain/import/analyze';
import type { InventoryCheck } from '@/domain/import/known-validations';

const QUALITY_LABEL: Record<QualityReport['quality'], string> = {
  INVALID: 'Invalide',
  ANALYSABLE: 'Analysable (rendu incomplet ou non vérifié)',
  RENDERABLE: 'Affichable',
  MANUAL_ONLY: 'Montage libre uniquement (pas d’étapes)',
  GUIDED_PLAYABLE: 'Jouable avec étapes 3D',
};

const PLAN_LABEL = { ROOT_STEPS: 'étapes du modèle principal', FLATTENED_STEPS: 'étapes aplaties des sous-modèles', NO_STEPS: 'aucune étape', INSTRUCTION_STEPS: 'étapes de la notice' } as const;

interface Props {
  readonly fileName: string;
  readonly analysis: ModelAnalysis;
  readonly quality: QualityReport;
  readonly renderStatus: string;
  readonly missingParts: readonly string[];
  readonly inventory: InventoryCheck;
  /** Absent for a library build: its main model is part of its identity. */
  readonly onChooseRoot?: (name: string) => void;
}

export function ModelSummary({ fileName, analysis, quality, renderStatus, missingParts, inventory, onChooseRoot }: Props) {
  const { model, plan } = analysis;
  const meta = analysis.document.sections.find((s) => s.name === model.rootName)?.meta;
  const issues = analysis.diagnostics.filter((d) => d.severity !== 'info');
  const infos = analysis.diagnostics.filter((d) => d.severity === 'info');
  return (
    <section className="summary" aria-label="Résumé du modèle">
      <h2>{meta?.title || fileName}</h2>
      <p className={`badge q-${quality.quality}`} data-testid="quality">{QUALITY_LABEL[quality.quality]}</p>
      <dl>
        <dt>Pièces</dt><dd data-testid="occurrence-count">{model.occurrences.length}</dd>
        <dt>Références</dt><dd>{analysis.uniqueParts.length}</dd>
        <dt>Couleurs</dt><dd>{analysis.colours.length}</dd>
        <dt>Sous-modèles</dt><dd>{model.submodelInstances.length}</dd>
        <dt>Étapes</dt><dd data-testid="step-count">{plan.steps.length} ({PLAN_LABEL[plan.kind]})</dd>
        {meta?.author && (<><dt>Auteur</dt><dd>{meta.author}</dd></>)}
        {meta?.license && (<><dt>Licence</dt><dd>{meta.license}</dd></>)}
      </dl>
      {analysis.rootCandidates.length > 1 && !onChooseRoot && <p className="small muted">Modèle principal : {model.rootName}</p>}
      {analysis.rootCandidates.length > 1 && onChooseRoot && (
        <label className="small">
          Modèle principal :{' '}
          <select value={model.rootName} onChange={(e) => onChooseRoot(e.target.value)}>
            {analysis.rootCandidates.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      )}
      <p className="small" data-testid="render-status">{renderStatus}</p>
      {missingParts.length > 0 && (
        <p className="error small" data-testid="missing-parts">Pièces absentes de la bibliothèque locale : {missingParts.join(', ')}</p>
      )}
      <p className={`small inventory-${inventory.verdict}`} data-testid="inventory-check" role={inventory.verdict === 'COHERENT' ? undefined : 'note'}>
        {inventory.verdict === 'COHERENT' ? '✓ ' : '⚠ '}{inventory.message}
      </p>
      <ul className="reasons small">{quality.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      {(issues.length > 0 || infos.length > 0) && (
        <details className="small">
          <summary>Diagnostics ({issues.length} problème(s), {infos.length} info(s))</summary>
          <ul>
            {[...issues, ...infos].slice(0, 200).map((d, i) => (
              <li key={i} className={d.severity}>
                [{d.severity}] {d.message}{d.line ? ` (ligne ${d.line})` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

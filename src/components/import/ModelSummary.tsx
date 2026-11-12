'use client';

import type { ModelAnalysis, QualityReport } from '@/domain/import/analyze';
import type { InventoryCheck } from '@/domain/import/known-validations';
import { useT } from '@/i18n/I18nProvider';

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
  const tr = useT().workshop.summary;
  const { model, plan } = analysis;
  const meta = analysis.document.sections.find((s) => s.name === model.rootName)?.meta;
  const issues = analysis.diagnostics.filter((d) => d.severity !== 'info');
  const infos = analysis.diagnostics.filter((d) => d.severity === 'info');
  return (
    <section className="summary" aria-label={tr.label}>
      <h2>{meta?.title || fileName}</h2>
      <p className={`badge q-${quality.quality}`} data-testid="quality">{tr.quality[quality.quality]}</p>
      <dl>
        <dt>{tr.pieces}</dt><dd data-testid="occurrence-count">{model.occurrences.length}</dd>
        <dt>{tr.references}</dt><dd>{analysis.uniqueParts.length}</dd>
        <dt>{tr.colours}</dt><dd>{analysis.colours.length}</dd>
        <dt>{tr.submodels}</dt><dd>{model.submodelInstances.length}</dd>
        <dt>{tr.steps}</dt><dd data-testid="step-count">{plan.steps.length} ({tr.plan[plan.kind]})</dd>
        {meta?.author && (<><dt>{tr.author}</dt><dd>{meta.author}</dd></>)}
        {meta?.license && (<><dt>{tr.licence}</dt><dd>{meta.license}</dd></>)}
      </dl>
      {analysis.rootCandidates.length > 1 && !onChooseRoot && <p className="small muted">{tr.rootModel(model.rootName)}</p>}
      {analysis.rootCandidates.length > 1 && onChooseRoot && (
        <label className="small">
          {tr.rootModelLabel}{' '}
          <select value={model.rootName} onChange={(e) => onChooseRoot(e.target.value)}>
            {analysis.rootCandidates.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      )}
      <p className="small" data-testid="render-status">{renderStatus}</p>
      {missingParts.length > 0 && (
        <p className="error small" data-testid="missing-parts">{tr.missingParts(missingParts.join(', '))}</p>
      )}
      <p className={`small inventory-${inventory.verdict}`} data-testid="inventory-check" role={inventory.verdict === 'COHERENT' ? undefined : 'note'}>
        {inventory.verdict === 'COHERENT' ? '✓ ' : '⚠ '}{inventory.message}
      </p>
      <ul className="reasons small">{quality.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      {(issues.length > 0 || infos.length > 0) && (
        <details className="small">
          <summary>{tr.diagnostics(issues.length, infos.length)}</summary>
          <ul>
            {[...issues, ...infos].slice(0, 200).map((d, i) => (
              <li key={i} className={d.severity}>
                [{d.severity}] {d.message}{d.line ? tr.line(d.line) : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

'use client';

import Link from 'next/link';
import { FileBox, FileText, Link2, X } from 'lucide-react';
import type { PreparedImport } from '@/domain/library/import-types';
import { useT } from '@/i18n/I18nProvider';
import { formatBytes } from '../labels';
import { buildRows, type BuildChoice, type Selection } from './selection';


/** Explicit choice of the builds, booklets and mappings to use (nothing is added before confirmation). */
export function ResourcesPanel({ prepared, selection, onChange, onRemove, onExtraRoot }: {
  prepared: PreparedImport;
  selection: Selection;
  onChange: (key: string, patch: Partial<BuildChoice>) => void;
  onRemove: (sha256: string) => void;
  onExtraRoot: (sha256: string, rootName: string) => void;
}) {
  const t = useT();
  const rs = t.library.resources;
  const lb = t.library.labels;
  const SOURCE: Record<string, string> = rs.source;
  const MAPPING_STATE: Record<string, string> = rs.mappingState;
  const rows = buildRows(prepared, selection);
  const checked = rows.filter((r) => selection.builds[r.key]?.checked);
  return (
    <section className="resources" data-testid="resources">
      <h3>{rs.title}</h3>
      {prepared.models.length === 0 && (
        <p className="warn" data-testid="no-model">{rs.noModel}{prepared.pdfs.length > 0 ? ` ${rs.noModelWithPdf}` : ''}</p>
      )}
      {prepared.models.map((model) => (
        <div key={model.sha256} className="file-card" data-testid="model-card">
          <div className="file-card-head">
            <strong className="file-name"><FileBox size={16} aria-hidden /> {model.name}</strong>
            <span className="small muted">{formatBytes(model.size, t)} · {SOURCE[model.provenance.source]}{model.inLibrary ? ` · ${rs.inLibraryNoCopy}` : ''}</span>
            <button type="button" className="small ghost" onClick={() => onRemove(model.sha256)}><X size={14} aria-hidden /> {t.common.remove}</button>
          </div>
          <p className="small muted">{model.provenance.author ? rs.author(model.provenance.author) : ''}{rs.license(model.provenance.license ?? rs.licenseUnknown)}{model.provenance.url ? <> {rs.sourceLabel} <a href={model.provenance.url} target="_blank" rel="noreferrer noopener">{new URL(model.provenance.url).hostname}</a></> : null}</p>
          {model.roots.map((root) => {
            const key = `${model.sha256}|${root.rootName}`;
            const c = selection.builds[key];
            if (!c) return null;
            return (
              <div key={key} className="build-choice" data-testid="build-choice">
                <label className="model-row">
                  <input type="checkbox" checked={c.checked} disabled={root.existingBuild !== null} onChange={(e) => onChange(key, { checked: e.target.checked })} data-testid="build-check" />
                  <input aria-label={lb.buildName} value={c.label} maxLength={120} onChange={(e) => onChange(key, { label: e.target.value })} data-testid="build-label" />
                  <span className="small">{lb.pieces(root.occurrenceCount)} · {root.stepCount > 0 ? lb.ldrawSteps(root.stepCount) : lb.noSteps}{root.submodels > 0 ? ` · ${rs.submodels(root.submodels)}` : ''}</span>
                </label>
                {root.role === 'unreferenced' && <p className="small muted">{rs.unreferenced(root.rootName)}</p>}
                {root.existingBuild && (
                  <p className="small warn" data-testid="already-in-collection">{rs.alreadyInCollection(root.existingBuild.setNumber, root.existingBuild.setName, root.existingBuild.label)} <Link href={`/sets/${root.existingBuild.setId}`}>{rs.open}</Link></p>
                )}
                {root.missingParts.checked && root.missingParts.refs.length > 0 && <p className="small warn">{rs.missingRefs(root.missingParts.refs.length, root.missingParts.refs.slice(0, 6).join(', ') + (root.missingParts.refs.length > 6 ? '…' : ''))}</p>}
              </div>
            );
          })}
          <details className="small">
            <summary>{rs.advanced}</summary>
            <ul className="plain">
              <li>{rs.shaLabel} <code>{model.sha256}</code></li>
              {model.roots.map((r) => <li key={r.rootName}>{rs.rootDetail(r.rootName, r.uniqueParts, r.colours, r.errors, r.warnings)}{r.diagnostics.length > 0 ? ` — ${r.diagnostics.slice(0, 3).join(rs.diagnosticsSeparator)}` : ''}</li>)}
            </ul>
            {model.rootCandidates.length > 1 && (
              <label>{rs.otherRoot}{' '}
                <select value="" onChange={(e) => e.target.value && onExtraRoot(model.sha256, e.target.value)} data-testid="extra-root">
                  <option value="">—</option>
                  {model.rootCandidates.filter((r) => !model.roots.some((x) => x.rootName === r)).map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
            )}
          </details>
        </div>
      ))}

      {prepared.pdfs.length > 0 && (
        <div className="file-card" data-testid="pdf-card">
          <strong className="file-name"><FileText size={16} aria-hidden /> {rs.pdfTitle}</strong>
          {checked.length > 1 && <p className="small muted">{rs.severalBuilds}</p>}
          {prepared.pdfs.map((pdf) => (
            <div key={pdf.sha256} className="pdf-row" data-testid="pdf-row">
              <span>{pdf.name} <span className="small muted">· {pdf.pages !== null ? rs.pages(pdf.pages) : rs.pagesUnknown} · {formatBytes(pdf.size, t)} · {SOURCE[pdf.provenance.source]}{pdf.inLibrary ? ` · ${rs.inLibrary}` : ''}</span></span>
              {pdf.problem && <span className="small warn">{pdf.problem}</span>}
              <span className="small">
                {checked.map((r) => {
                  const c = selection.builds[r.key]!;
                  const linked = r.mappings.some((m) => m.file.sha256 === c.mapping && m.file.bookletSha256s.includes(pdf.sha256));
                  return (
                    <label key={r.key} className="assoc">
                      <input type="checkbox" checked={c.booklets.includes(pdf.sha256)} onChange={(e) => onChange(r.key, { booklets: e.target.checked ? [...c.booklets, pdf.sha256] : c.booklets.filter((s) => s !== pdf.sha256) })} data-testid="pdf-assoc" />
                      {' '}{c.label}{c.booklets.includes(pdf.sha256) ? ` (${linked ? rs.linkedByMapping : rs.proposed})` : ''}
                    </label>
                  );
                })}
              </span>
              <button type="button" className="small ghost" onClick={() => onRemove(pdf.sha256)}><X size={14} aria-hidden /> {t.common.remove}</button>
            </div>
          ))}
        </div>
      )}

      {checked.some((r) => r.mappings.length > 0) && (
        <div className="file-card" data-testid="mapping-card">
          <strong className="file-name"><Link2 size={16} aria-hidden /> {lb.mappingsTitle}</strong> <span className="small muted">{rs.mappingsHint}</span>
          {checked.filter((r) => r.mappings.length > 0).map((r) => {
            const c = selection.builds[r.key]!;
            return (
              <fieldset key={r.key} className="small">
                <legend>{c.label}</legend>
                <label className="block"><input type="radio" name={`map-${r.key}`} checked={c.mapping === null} onChange={() => onChange(r.key, { mapping: null })} /> {lb.none}</label>
                {r.mappings.map((m) => (
                  <label key={m.file.sha256} className="block">
                    <input type="radio" name={`map-${r.key}`} checked={c.mapping === m.file.sha256} onChange={() => onChange(r.key, { mapping: m.file.sha256 })} data-testid={`mapping-${m.file.name}`} />
                    {' '}{m.file.name} · {lb.stepsCount(m.file.steps)}, {lb.verifiedOf(m.file.verified, m.file.steps)} · <span className={m.state.state === 'valid' ? 'ok' : 'warn'}>{MAPPING_STATE[m.state.state]}{m.state.reason ? ` (${m.state.reason})` : ''}</span>
                    <span className="muted"> · {SOURCE[m.file.provenance.source] ?? ''}{m.file.inLibrary ? `, ${rs.inLibrary}` : ''}</span>
                  </label>
                ))}
              </fieldset>
            );
          })}
        </div>
      )}

      {prepared.rejected.length > 0 && (
        <ul className="plain small" data-testid="rejected">
          {prepared.rejected.map((r, i) => <li key={`${r.name}-${i}`} className="error">{lb.namedProblem(r.name, r.reason)}</li>)}
        </ul>
      )}
    </section>
  );
}

'use client';

import Link from 'next/link';
import { FileBox, FileText, Link2, X } from 'lucide-react';
import type { PreparedImport } from '@/domain/library/import-types';
import { formatBytes } from '../labels';
import { buildRows, type BuildChoice, type Selection } from './selection';

const SOURCE: Record<string, string> = { upload: 'fichier ajouté', discovery: 'dossier de données', omr: 'téléchargé depuis l’OMR' };
const MAPPING_STATE: Record<string, string> = { valid: 'valide', incomplete: 'incomplète', absent: 'non applicable' };

/** Explicit choice of the builds, booklets and mappings to use (nothing is added before confirmation). */
export function ResourcesPanel({ prepared, selection, onChange, onRemove, onExtraRoot }: {
  prepared: PreparedImport;
  selection: Selection;
  onChange: (key: string, patch: Partial<BuildChoice>) => void;
  onRemove: (sha256: string) => void;
  onExtraRoot: (sha256: string, rootName: string) => void;
}) {
  const rows = buildRows(prepared, selection);
  const checked = rows.filter((r) => selection.builds[r.key]?.checked);
  return (
    <section className="resources" data-testid="resources">
      <h3>Fichiers retenus</h3>
      {prepared.models.length === 0 && (
        <p className="warn" data-testid="no-model">Aucun modèle 3D trouvé pour ce set.{prepared.pdfs.length > 0 ? ' Notice trouvée sans modèle 3D : pas de construction interactive disponible.' : ''}</p>
      )}
      {prepared.models.map((model) => (
        <div key={model.sha256} className="file-card" data-testid="model-card">
          <div className="file-card-head">
            <strong className="file-name"><FileBox size={16} aria-hidden /> {model.name}</strong>
            <span className="small muted">{formatBytes(model.size)} · {SOURCE[model.provenance.source]}{model.inLibrary ? ' · déjà dans la bibliothèque (pas de nouvelle copie)' : ''}</span>
            <button type="button" className="small ghost" onClick={() => onRemove(model.sha256)}><X size={14} aria-hidden /> Retirer</button>
          </div>
          <p className="small muted">{model.provenance.author ? `Auteur : ${model.provenance.author}. ` : ''}Licence : {model.provenance.license ?? 'non indiquée dans le fichier'}.{model.provenance.url ? <> Source : <a href={model.provenance.url} target="_blank" rel="noreferrer noopener">{new URL(model.provenance.url).hostname}</a></> : null}</p>
          {model.roots.map((root) => {
            const key = `${model.sha256}|${root.rootName}`;
            const c = selection.builds[key];
            if (!c) return null;
            return (
              <div key={key} className="build-choice" data-testid="build-choice">
                <label className="model-row">
                  <input type="checkbox" checked={c.checked} disabled={root.existingBuild !== null} onChange={(e) => onChange(key, { checked: e.target.checked })} data-testid="build-check" />
                  <input aria-label="Nom de la construction" value={c.label} maxLength={120} onChange={(e) => onChange(key, { label: e.target.value })} data-testid="build-label" />
                  <span className="small">{root.occurrenceCount} pièces · {root.stepCount > 0 ? `${root.stepCount} étapes LDraw` : 'sans étapes'}{root.submodels > 0 ? ` · ${root.submodels} sous-modèle(s)` : ''}</span>
                </label>
                {root.role === 'unreferenced' && <p className="small muted">Modèle du fichier non utilisé par le modèle principal (« {root.rootName} ») : construction alternative possible.</p>}
                {root.existingBuild && (
                  <p className="small warn" data-testid="already-in-collection">Ce modèle existe déjà dans ta collection : {root.existingBuild.setNumber} {root.existingBuild.setName} — « {root.existingBuild.label} ». <Link href={`/sets/${root.existingBuild.setId}`}>Ouvrir</Link></p>
                )}
                {root.missingParts.checked && root.missingParts.refs.length > 0 && <p className="small warn">{root.missingParts.refs.length} référence(s) absente(s) de ta bibliothèque LDraw : {root.missingParts.refs.slice(0, 6).join(', ')}{root.missingParts.refs.length > 6 ? '…' : ''}</p>}
              </div>
            );
          })}
          <details className="small">
            <summary>Détails avancés</summary>
            <ul className="plain">
              <li>SHA-256 : <code>{model.sha256}</code></li>
              {model.roots.map((r) => <li key={r.rootName}>« {r.rootName} » : {r.uniqueParts} références, {r.colours} combinaisons pièce/couleur, {r.errors} erreur(s), {r.warnings} avertissement(s){r.diagnostics.length > 0 ? ` — ${r.diagnostics.slice(0, 3).join(' ; ')}` : ''}</li>)}
            </ul>
            {model.rootCandidates.length > 1 && (
              <label>Construire un autre modèle du fichier :{' '}
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
          <strong className="file-name"><FileText size={16} aria-hidden /> Notices PDF</strong>
          {checked.length > 1 && <p className="small muted">Plusieurs constructions : coche pour chaque notice la ou les constructions qu’elle accompagne. Aucune association n’est déduite du contenu du PDF.</p>}
          {prepared.pdfs.map((pdf) => (
            <div key={pdf.sha256} className="pdf-row" data-testid="pdf-row">
              <span>{pdf.name} <span className="small muted">· {pdf.pages !== null ? `${pdf.pages} pages` : 'pages non lues'} · {formatBytes(pdf.size)} · {SOURCE[pdf.provenance.source]}{pdf.inLibrary ? ' · déjà dans la bibliothèque' : ''}</span></span>
              {pdf.problem && <span className="small warn">{pdf.problem}</span>}
              <span className="small">
                {checked.map((r) => {
                  const c = selection.builds[r.key]!;
                  const linked = r.mappings.some((m) => m.file.sha256 === c.mapping && m.file.bookletSha256s.includes(pdf.sha256));
                  return (
                    <label key={r.key} className="assoc">
                      <input type="checkbox" checked={c.booklets.includes(pdf.sha256)} onChange={(e) => onChange(r.key, { booklets: e.target.checked ? [...c.booklets, pdf.sha256] : c.booklets.filter((s) => s !== pdf.sha256) })} data-testid="pdf-assoc" />
                      {' '}{c.label}{c.booklets.includes(pdf.sha256) ? (linked ? ' (liée par les correspondances)' : ' (association proposée, non vérifiée)') : ''}
                    </label>
                  );
                })}
              </span>
              <button type="button" className="small ghost" onClick={() => onRemove(pdf.sha256)}><X size={14} aria-hidden /> Retirer</button>
            </div>
          ))}
        </div>
      )}

      {checked.some((r) => r.mappings.length > 0) && (
        <div className="file-card" data-testid="mapping-card">
          <strong className="file-name"><Link2 size={16} aria-hidden /> Correspondances notice ↔ 3D</strong> <span className="small muted">(reconnues par l’empreinte exacte du modèle, jamais par leur nom)</span>
          {checked.filter((r) => r.mappings.length > 0).map((r) => {
            const c = selection.builds[r.key]!;
            return (
              <fieldset key={r.key} className="small">
                <legend>{c.label}</legend>
                <label className="block"><input type="radio" name={`map-${r.key}`} checked={c.mapping === null} onChange={() => onChange(r.key, { mapping: null })} /> Aucune</label>
                {r.mappings.map((m) => (
                  <label key={m.file.sha256} className="block">
                    <input type="radio" name={`map-${r.key}`} checked={c.mapping === m.file.sha256} onChange={() => onChange(r.key, { mapping: m.file.sha256 })} data-testid={`mapping-${m.file.name}`} />
                    {' '}{m.file.name} · {m.file.steps} étapes, {m.file.verified}/{m.file.steps} vérifiées · <span className={m.state.state === 'valid' ? 'ok' : 'warn'}>{MAPPING_STATE[m.state.state]}{m.state.reason ? ` (${m.state.reason})` : ''}</span>
                    <span className="muted"> · {SOURCE[m.file.provenance.source] ?? ''}{m.file.inLibrary ? ', déjà dans la bibliothèque' : ''}</span>
                  </label>
                ))}
              </fieldset>
            );
          })}
        </div>
      )}

      {prepared.rejected.length > 0 && (
        <ul className="plain small" data-testid="rejected">
          {prepared.rejected.map((r, i) => <li key={`${r.name}-${i}`} className="error">{r.name} : {r.reason}</li>)}
        </ul>
      )}
    </section>
  );
}

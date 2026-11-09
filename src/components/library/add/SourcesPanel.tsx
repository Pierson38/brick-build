'use client';

import { Download, Folder, Globe, Library, WifiOff } from 'lucide-react';
import type { LocalLookup, OnlineLookup, SourceStatus } from '@/domain/library/import-types';

const STATUS_CLASS: Record<SourceStatus, string> = { ok: 'ok', not_found: 'muted', unavailable: 'error', not_configured: 'muted', unsupported: 'muted' };

/** Where files can come from for this number: data folder, OMR (on click), LEGO.com (manual), Rebrickable (optional). */
export function SourcesPanel({ local, online, onlineBusy, downloading, downloaded, onSearchOnline, onDownload }: {
  local: LocalLookup;
  online: OnlineLookup | null;
  onlineBusy: boolean;
  downloading: string | null;
  downloaded: readonly string[];
  onSearchOnline: () => void;
  onDownload: (url: string, pageUrl: string | null) => void;
}) {
  const localModels = local.refs.filter((r) => r.origin === 'discovered' && r.rel.startsWith('models/')).length;
  const localPdfs = local.refs.filter((r) => r.origin === 'discovered' && r.rel.startsWith('instructions/')).length;
  return (
    <section className="sources-panel" data-testid="sources">
      <h3>Ressources pour {local.setNumber.canonical}</h3>
      <ul className="plain sources">
        <li data-testid="source-local">
          <strong className="source-name"><Folder size={16} aria-hidden /> Dossier de données</strong>{' '}
          {localModels + localPdfs > 0
            ? <span className="ok">{localModels} modèle(s) 3D et {localPdfs} notice(s) trouvés pour {local.setNumber.canonical} (laissés en place, ajoutés à la sélection).</span>
            : <span className="muted">rien pour ce numéro dans models/ ni instructions/.</span>}
        </li>
        <li data-testid="source-omr">
          <strong className="source-name"><Globe size={16} aria-hidden /> LDraw OMR</strong> <span className="muted small">(modèles 3D communautaires, licence indiquée dans chaque fichier)</span>
          <div className="source-body">
            {!online && local.online.omr && (
              <span className="network-action">
                <button type="button" className="button secondary small" onClick={onSearchOnline} disabled={onlineBusy} data-testid="search-online">
                  <Globe size={14} aria-hidden /> {onlineBusy ? 'Recherche en ligne…' : 'Chercher en ligne (OMR' + (local.online.rebrickable ? ', Rebrickable' : '') + ')'}
                </button>
                <span className="small muted">contacte Internet, seulement sur ce clic</span>
              </span>
            )}
            {!local.online.omr && (
              <span className="muted small offline" data-testid="offline-note">
                {local.setNumber.numeric ? <><WifiOff size={14} aria-hidden /> Accès Internet désactivé. Recherche en ligne et téléchargements coupés (<code>BRICK_LAB_ONLINE=0</code>) ; l’import local reste complet.</> : 'Numéro non LEGO : pas de recherche OMR.'}{' '}
              </span>
            )}
            {online && <span className={`small ${STATUS_CLASS[online.omr.status]}`} data-testid="omr-status">{online.omr.message}</span>}
            {online?.omr.models.length ? (
              <ul className="plain omr-models">
                {online.omr.models.map((m) => (
                  <li key={m.fileUrl} className="model-row">
                    <span><strong>{m.title}</strong> <span className="small muted">{m.alternate ? 'modèle alternatif' : 'modèle principal'} · {m.fileName}{m.author ? ` · ${m.author}` : ''}</span></span>
                    {downloaded.includes(m.fileUrl)
                      ? <span className="small ok">téléchargé ✓</span>
                      : (
                        <button type="button" className="button secondary small" disabled={downloading !== null} onClick={() => onDownload(m.fileUrl, online.omr.pageUrl)} data-testid={`omr-download-${m.fileName}`} data-tip="Télécharge depuis l’OMR (Internet)">
                          <Download size={14} aria-hidden /> {downloading === m.fileUrl ? 'Téléchargement…' : 'Télécharger'}
                        </button>
                      )}
                  </li>
                ))}
              </ul>
            ) : null}
            <a href={online?.omr.pageUrl ?? local.links.omrSearch} target="_blank" rel="noreferrer noopener" className="small">Ouvrir la page de l’OMR ↗</a>
          </div>
        </li>
        <li data-testid="source-lego">
          <strong className="source-name"><Library size={16} aria-hidden /> Notices LEGO</strong>{' '}
          <span className="small">Notice disponible sur LEGO.com, mais téléchargement manuel nécessaire : ouvre la page officielle, télécharge le ou les PDF, puis dépose-les dans l’import rapide ci-dessus.</span>{' '}
          <a href={local.links.legoInstructions} target="_blank" rel="noreferrer noopener" className="small" data-testid="lego-link">Ouvrir la page LEGO ↗</a>
        </li>
        {online && (
          <li data-testid="source-rebrickable">
            <strong className="source-name"><Globe size={16} aria-hidden /> Rebrickable</strong>{' '}
            {online.rebrickable.set
              ? <span className="small">« {online.rebrickable.set.name} »{online.rebrickable.set.year ? `, ${online.rebrickable.set.year}` : ''}{online.rebrickable.set.numParts !== null ? `, ${online.rebrickable.set.numParts} pièces annoncées` : ''} <span className="muted">(indicatif, non comparé au modèle)</span></span>
              : <span className={`small ${STATUS_CLASS[online.rebrickable.status]}`}>{online.rebrickable.message}</span>}
          </li>
        )}
      </ul>
    </section>
  );
}

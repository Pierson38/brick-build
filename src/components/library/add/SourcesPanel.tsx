'use client';

import { Download, Folder, Globe, Library, WifiOff } from 'lucide-react';
import type { LocalLookup, OnlineLookup, SourceStatus } from '@/domain/library/import-types';
import { useT } from '@/i18n/I18nProvider';

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
  const t = useT();
  const x = t.library.sources;
  const localModels = local.refs.filter((r) => r.origin === 'discovered' && r.rel.startsWith('models/')).length;
  const localPdfs = local.refs.filter((r) => r.origin === 'discovered' && r.rel.startsWith('instructions/')).length;
  return (
    <section className="sources-panel" data-testid="sources">
      <h3>{x.title(local.setNumber.canonical)}</h3>
      <ul className="plain sources">
        <li data-testid="source-local">
          <strong className="source-name"><Folder size={16} aria-hidden /> {x.dataFolder}</strong>{' '}
          {localModels + localPdfs > 0
            ? <span className="ok">{x.localFound(localModels, localPdfs, local.setNumber.canonical)}</span>
            : <span className="muted">{x.localNone}</span>}
        </li>
        <li data-testid="source-omr">
          <strong className="source-name"><Globe size={16} aria-hidden /> LDraw OMR</strong> <span className="muted small">{x.omrHint}</span>
          <div className="source-body">
            {!online && local.online.omr && (
              <span className="network-action">
                <button type="button" className="button secondary small" onClick={onSearchOnline} disabled={onlineBusy} data-testid="search-online">
                  <Globe size={14} aria-hidden /> {onlineBusy ? x.searchingOnline : x.searchOnline(local.online.rebrickable)}
                </button>
                <span className="small muted">{x.networkHint}</span>
              </span>
            )}
            {!local.online.omr && (
              <span className="muted small offline" data-testid="offline-note">
                {local.setNumber.numeric ? <><WifiOff size={14} aria-hidden /> {x.offline}<code>BRICK_LAB_ONLINE=0</code>{x.offlineRest}</> : x.nonLego}{' '}
              </span>
            )}
            {online && <span className={`small ${STATUS_CLASS[online.omr.status]}`} data-testid="omr-status">{online.omr.message}</span>}
            {online?.omr.models.length ? (
              <ul className="plain omr-models">
                {online.omr.models.map((m) => (
                  <li key={m.fileUrl} className="model-row">
                    <span><strong>{m.title}</strong> <span className="small muted">{m.alternate ? x.alternate : x.main} · {m.fileName}{m.author ? ` · ${m.author}` : ''}</span></span>
                    {downloaded.includes(m.fileUrl)
                      ? <span className="small ok">{x.downloaded}</span>
                      : (
                        <button type="button" className="button secondary small" disabled={downloading !== null} onClick={() => onDownload(m.fileUrl, online.omr.pageUrl)} data-testid={`omr-download-${m.fileName}`} data-tip={x.downloadTip}>
                          <Download size={14} aria-hidden /> {downloading === m.fileUrl ? x.downloading : x.download}
                        </button>
                      )}
                  </li>
                ))}
              </ul>
            ) : null}
            <a href={online?.omr.pageUrl ?? local.links.omrSearch} target="_blank" rel="noreferrer noopener" className="small">{x.openOmr}</a>
          </div>
        </li>
        <li data-testid="source-lego">
          <strong className="source-name"><Library size={16} aria-hidden /> {x.legoTitle}</strong>{' '}
          <span className="small">{x.legoText}</span>{' '}
          <a href={local.links.legoInstructions} target="_blank" rel="noreferrer noopener" className="small" data-testid="lego-link">{x.openLego}</a>
        </li>
        {online && (
          <li data-testid="source-rebrickable">
            <strong className="source-name"><Globe size={16} aria-hidden /> Rebrickable</strong>{' '}
            {online.rebrickable.set
              ? <span className="small">{t.library.labels.quoted(online.rebrickable.set.name)}{online.rebrickable.set.year ? `, ${online.rebrickable.set.year}` : ''}{online.rebrickable.set.numParts !== null ? `, ${x.announced(online.rebrickable.set.numParts)}` : ''} <span className="muted">{x.indicative}</span></span>
              : <span className={`small ${STATUS_CLASS[online.rebrickable.status]}`}>{online.rebrickable.message}</span>}
          </li>
        )}
      </ul>
    </section>
  );
}

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { filterSets, setStatus, type BuildView, type LibraryView, type SetView, type StatusFilter } from '@/domain/library/types';
import { libraryApi } from '@/infra/library/api';
import { listRecentSessions, type RecentSession } from '@/infra/persistence/local-progress';
import { AddSetDialog } from './AddSetDialog';
import { DiscoveryPanel } from './DiscoveryPanel';
import { actionLabel, ModeChips, ProgressBar, StatusBadge } from './labels';
import { ModelPreview, useLibraryModel } from './ModelPreview';

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'Tous' },
  { value: 'IN_PROGRESS', label: 'En cours' },
  { value: 'DONE', label: 'Terminés' },
  { value: 'NOT_STARTED', label: 'Non commencés' },
];

/** Build shown on the card: the one in progress most recently, else the first. */
export function primaryBuild(set: SetView): BuildView | undefined {
  const sorted = [...set.builds].sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
  return sorted.find((b) => b.status === 'IN_PROGRESS') ?? set.builds[0];
}

export function Thumbnail({ build, version }: { build: BuildView | undefined; version: number }) {
  const [failed, setFailed] = useState(false);
  if (!build || !build.hasThumbnail || failed) {
    return <div className="thumb placeholder" aria-hidden><span>{build ? `${build.snapshot.occurrenceCount} pièces` : '—'}</span></div>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="thumb" src={`${libraryApi.thumbnailUrl(build)}?v=${version}`} alt="" onError={() => setFailed(true)} />;
}

function SetCard({ set, version }: { set: SetView; version: number }) {
  const main = primaryBuild(set);
  const pieces = set.builds.map((b) => b.snapshot.occurrenceCount);
  const booklets = new Set(set.builds.flatMap((b) => b.booklets.map((x) => x.sha256))).size;
  const mapped = set.builds.filter((b) => b.mapping?.valid).length;
  const problems = set.builds.flatMap((b) => b.problems);
  return (
    <article className="set-card" data-testid={`set-card-${set.setNumber}`}>
      <Link href={`/sets/${set.id}`} className="thumb-link" aria-label={`Détail de ${set.setNumber} ${set.name}`}>
        <Thumbnail build={main} version={version} />
      </Link>
      <div className="set-body">
        <div className="set-title">
          <span className="setno">{set.setNumber}</span>
          <h3><Link href={`/sets/${set.id}`}>{set.name}</Link></h3>
        </div>
        <p className="small muted">
          {pieces.length === 1 ? `${pieces[0]} pièces` : `${set.builds.length} constructions (${pieces.join(' / ')} pièces)`}
        </p>
        <ul className="files small" aria-label="Fichiers">
          <li className={set.builds.every((b) => b.model.state === 'OK') ? 'ok' : 'error'}>Modèle 3D {set.builds.every((b) => b.model.state === 'OK') ? '✓' : '⚠'}</li>
          <li className={booklets > 0 ? 'ok' : 'muted'}>{booklets > 0 ? `${booklets} notice${booklets > 1 ? 's' : ''}` : 'Pas de notice'}</li>
          <li className={mapped > 0 ? 'ok' : 'muted'}>{mapped > 0 ? 'Correspondances ✓' : set.builds.some((b) => b.mapping) ? 'Correspondances (brouillon)' : 'Pas de correspondances'}</li>
        </ul>
        {main && <ModeChips modes={main.modes} />}
        {main && (
          <div className="progress-line">
            <ProgressBar placed={main.progress?.placed ?? 0} total={main.snapshot.occurrenceCount} />
            <span className="small" data-testid="card-progress">{main.progress?.placed ?? 0}/{main.snapshot.occurrenceCount} pièces posées</span>
            <StatusBadge status={setStatus(set.builds)} />
          </div>
        )}
        {problems.length > 0 && <p className="small error" role="note">⚠ {problems[0]}{problems.length > 1 ? ` (+${problems.length - 1})` : ''}</p>}
        <div className="card-actions">
          {main && main.modes.length > 0 && (
            <Link className="button primary" href={`/atelier/${main.id}`} data-testid="card-build">
              {actionLabel(main)}{set.builds.length > 1 ? ` « ${main.label} »` : ''}
            </Link>
          )}
          <Link className="button secondary" href={`/sets/${set.id}`}>Détails</Link>
        </div>
      </div>
    </article>
  );
}

/** Off-screen renderer for missing thumbnails, one build at a time (local WebGL rendering). */
function ThumbnailMaker({ build, onDone }: { build: BuildView; onDone: (ok: boolean) => void }) {
  const { model, error } = useLibraryModel(build);
  const done = useRef(false);
  const finish = useCallback((ok: boolean) => {
    if (done.current) return;
    done.current = true;
    onDone(ok);
  }, [onDone]);
  useEffect(() => {
    if (error || (model && (!model.geometry || model.geometry.templates.size === 0))) finish(false);
  }, [error, model, finish]);
  if (!model) return null;
  return (
    <div className="offscreen" aria-hidden>
      <ModelPreview model={model} className="thumb-render" onThumbnail={(png) => void libraryApi.putThumbnail(build.id, png).then(() => finish(true), () => finish(false))} />
    </div>
  );
}

export default function CollectionView() {
  const [view, setView] = useState<LibraryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [adding, setAdding] = useState(false);
  const [version, setVersion] = useState(0);
  const [tried, setTried] = useState<ReadonlySet<string>>(new Set());
  const [legacy, setLegacy] = useState<RecentSession[]>([]);

  const refresh = useCallback(async () => {
    try {
      setView(await libraryApi.view());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void refresh();
    setLegacy(listRecentSessions(50));
  }, [refresh]);

  const sets = useMemo(() => (view ? filterSets(view.sets, query, filter) : []), [view, query, filter]);
  const pendingThumb = view?.sets.flatMap((s) => s.builds).find((b) => !b.hasThumbnail && b.model.state === 'OK' && !tried.has(b.id));
  const thumbDone = useCallback((ok: boolean) => {
    if (!pendingThumb) return;
    setTried((t) => new Set([...t, pendingThumb.id]));
    if (ok) {
      setVersion((v) => v + 1);
      void refresh();
    }
  }, [pendingThumb, refresh]);

  const builds = view?.sets.flatMap((s) => s.builds) ?? [];
  const legacyMatched = legacy.filter((l) => builds.some((b) => b.model.sha256 === l.hash && !b.progress));
  // a build that already has library progress: the browser save may differ (compared in the set page)
  const legacyToCompare = legacy.flatMap((l) => {
    const b = builds.find((x) => x.model.sha256 === l.hash && x.progress && x.progress.updatedAtIso !== l.updatedAtIso);
    const set = b && view?.sets.find((s) => s.id === b.setId);
    return b && set ? [{ l, set }] : [];
  });
  const legacyOrphans = legacy.filter((l) => !builds.some((b) => b.model.sha256 === l.hash));

  return (
    <div className="collection">
      <header className="topbar">
        <strong>Brick Lab Local</strong>
        <span className="muted">Ma collection</span>
        <span className="spacer" />
        <Link href="/atelier" className="small">Atelier sans collection</Link>
        <button type="button" className="button primary" onClick={() => setAdding(true)} data-testid="add-set">Ajouter un set</button>
      </header>
      <main className="collection-main">
        <div className="collection-head">
          <h1>Ma collection</h1>
          <input type="search" placeholder="Rechercher un numéro ou un nom…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher un set" data-testid="search" />
          <div className="filters" role="radiogroup" aria-label="Filtrer par état">
            {FILTERS.map((f) => (
              <button key={f.value} type="button" role="radio" aria-checked={filter === f.value} className={filter === f.value ? 'chip active' : 'chip'} onClick={() => setFilter(f.value)}>{f.label}</button>
            ))}
          </div>
        </div>
        {error && <p className="banner error" role="alert" data-testid="library-error">{error}</p>}
        {view && view.sets.length === 0 && !error && (
          <div className="empty-state">
            <p>Ta collection est vide. Ajoute un set (modèle LDraw, notices PDF, correspondances), ou reprends les fichiers déjà rangés dans ton dossier de données.</p>
          </div>
        )}
        <DiscoveryPanel onAdded={() => void refresh()} />
        {view && view.sets.length > 0 && sets.length === 0 && <p className="muted" data-testid="no-result">Aucun set ne correspond à cette recherche.</p>}
        <section className="grid" aria-label="Sets">
          {sets.map((s) => <SetCard key={s.id} set={s} version={version} />)}
        </section>
        {(legacyMatched.length > 0 || legacyOrphans.length > 0 || legacyToCompare.length > 0) && (
          <section className="legacy small" data-testid="legacy-saves">
            <h3>Parties enregistrées dans ce navigateur (versions précédentes)</h3>
            <p className="muted">Elles ne sont ni modifiées ni effacées.</p>
            <ul>
              {legacyMatched.map((l) => <li key={l.hash}>{l.displayName} — {l.placed}/{l.total} pièces : reprise automatiquement à l’ouverture du set correspondant.</li>)}
              {legacyToCompare.map(({ l, set }) => (
                <li key={`cmp-${l.hash}`}>{l.displayName} — {l.placed}/{l.total} pièces : la bibliothèque a sa propre progression ; <Link href={`/sets/${set.id}`}>comparer et récupérer dans le détail de {set.setNumber}</Link>.</li>
              ))}
              {legacyOrphans.map((l) => <li key={l.hash}>{l.displayName} — {l.placed}/{l.total} pièces : ajoute ce modèle à ta collection pour la reprendre ici.</li>)}
            </ul>
          </section>
        )}
        {view && <p className="small muted footer-note">Données : <code>{view.dataDir}</code> · tout reste sur ce Mac · application non affiliée à LEGO.</p>}
      </main>
      {adding && view && <AddSetDialog view={view} onClose={() => setAdding(false)} onCreated={() => { setAdding(false); void refresh(); }} />}
      {pendingThumb && <ThumbnailMaker key={pendingThumb.id} build={pendingThumb} onDone={thumbDone} />}
    </div>
  );
}

'use client';

import Link from 'next/link';
import { BookOpen, Box, FlaskConical, Link2, Play, Plus, Search, TriangleAlert, Wrench } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { filterSets, setStatus, type BuildView, type LibraryView, type SetView, type StatusFilter } from '@/domain/library/types';
import { libraryApi } from '@/infra/library/api';
import { listRecentSessions, type RecentSession } from '@/infra/persistence/local-progress';
import { DEMO_ID } from '../demo/demo-model';
import { AppBar } from '../ui/AppBar';
import { EmptyState, Note } from '../ui/feedback';
import { LdrawSetup, useLdrawProblem } from '../ui/LdrawSetup';
import { DiscoveryPanel } from './DiscoveryPanel';
import { actionLabel, formatDate, MODE_SHORT, ModeChips, ProgressBar, StatusBadge } from './labels';
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

/** The build in progress saved last, in the whole collection (the « Reprendre » banner). */
function lastInProgress(sets: readonly SetView[]): { set: SetView; build: BuildView } | null {
  const all = sets.flatMap((set) => set.builds.filter((b) => b.status === 'IN_PROGRESS' && b.modes.length > 0).map((build) => ({ set, build })));
  const at = (b: BuildView) => b.progress?.updatedAtIso ?? b.updatedAtIso;
  return all.sort((a, b) => at(b.build).localeCompare(at(a.build)))[0] ?? null;
}

export function Thumbnail({ build, version, className = 'thumb' }: { build: BuildView | undefined; version: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!build || !build.hasThumbnail || failed) {
    return <div className={`${className} placeholder`} aria-hidden><span>{build ? `${build.snapshot.occurrenceCount} pièces` : '—'}</span></div>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={`${libraryApi.thumbnailUrl(build)}?v=${version}`} alt="" onError={() => setFailed(true)} />;
}

function SetCard({ set, version }: { set: SetView; version: number }) {
  const main = primaryBuild(set);
  const pieces = set.builds.map((b) => b.snapshot.occurrenceCount);
  const booklets = new Set(set.builds.flatMap((b) => b.booklets.map((x) => x.sha256))).size;
  const mapped = set.builds.filter((b) => b.mapping?.valid).length;
  const problems = set.builds.flatMap((b) => b.problems);
  const modelOk = set.builds.every((b) => b.model.state === 'OK');
  const placed = main?.progress?.placed ?? 0;
  const total = main?.snapshot.occurrenceCount ?? 0;
  const status = setStatus(set.builds);
  return (
    <article className="set-card" data-testid={`set-card-${set.setNumber}`}>
      <Link href={`/sets/${set.id}`} className="thumb-link" aria-label={`Détail de ${set.setNumber} ${set.name}`}>
        <Thumbnail build={main} version={version} />
        <span className="thumb-status"><StatusBadge status={status} /></span>
        {main && total > 0 && <span className="thumb-progress" aria-hidden><span style={{ width: `${Math.round((100 * placed) / total)}%` }} /></span>}
      </Link>
      <div className="set-body">
        <div className="set-title">
          <span className="setno">{set.setNumber}</span>
          <h3><Link href={`/sets/${set.id}`}>{set.name}</Link></h3>
        </div>
        <ul className="files small" aria-label="Fichiers">
          <li className="muted"><Box size={14} aria-hidden /> {pieces.length === 1 ? `${pieces[0]} pièces` : `${set.builds.length} constructions (${pieces.join(' / ')} pièces)`}</li>
          <li className={modelOk ? 'ok' : 'error'}>Modèle 3D {modelOk ? '✓' : '⚠'}</li>
          <li className={booklets > 0 ? 'ok' : 'muted'}><BookOpen size={14} aria-hidden /> {booklets > 0 ? `${booklets} notice${booklets > 1 ? 's' : ''}` : 'Pas de notice'}</li>
          <li className={mapped > 0 ? 'ok' : 'muted'}><Link2 size={14} aria-hidden /> {mapped > 0 ? 'Correspondances ✓' : set.builds.some((b) => b.mapping) ? 'Correspondances (brouillon)' : 'Pas de correspondances'}</li>
        </ul>
        {main && <ModeChips modes={main.modes} />}
        {main && (
          <div className="progress-line">
            <ProgressBar placed={placed} total={total} />
            <span className="small num" data-testid="card-progress">{placed}/{total} pièces posées{main.progress && main.progress.free > 0 ? ' (montage libre)' : ''}</span>
          </div>
        )}
        {problems.length > 0 && <p className="small error card-problem" role="note"><TriangleAlert size={14} aria-hidden /> {problems[0]}{problems.length > 1 ? ` (+${problems.length - 1})` : ''}</p>}
        <div className="card-actions">
          {main && main.modes.length > 0 ? (
            <Link className="button primary" href={`/atelier/${main.id}`} data-testid="card-build">
              {actionLabel(main)}{set.builds.length > 1 ? ` « ${main.label} »` : ''}
            </Link>
          ) : (
            <Link className="button primary" href={`/sets/${set.id}`} data-testid="card-repair"><Wrench size={16} aria-hidden /> Réparer</Link>
          )}
          <Link className="button ghost" href={`/sets/${set.id}`}>Détails</Link>
        </div>
      </div>
    </article>
  );
}

function ResumeBanner({ set, build, version }: { set: SetView; build: BuildView; version: number }) {
  const placed = build.progress?.placed ?? 0;
  const total = build.snapshot.occurrenceCount;
  return (
    <section className="resume" data-testid="resume-banner" aria-label="Reprendre la dernière construction">
      <Thumbnail build={build} version={version} className="resume-thumb" />
      <div className="resume-body">
        <p className="section-title">Reprendre là où tu t’es arrêté</p>
        <h2><span className="setno">{set.setNumber}</span> {set.name}{set.builds.length > 1 ? ` · ${build.label}` : ''}</h2>
        <p className="small muted">
          {build.progress ? `${MODE_SHORT[build.progress.mode]} · ` : ''}{placed}/{total} pièces posées{build.progress ? ` · ${formatDate(build.progress.updatedAtIso)}` : ''}
        </p>
        <ProgressBar placed={placed} total={total} />
      </div>
      <Link className="button primary lg" href={`/atelier/${build.id}`} data-testid="resume-build"><Play size={16} aria-hidden /> Reprendre</Link>
    </section>
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

/** Status filter: a radio group (←/→ move the choice, as in a native radio group). */
function Filters({ value, onChange }: { value: StatusFilter; onChange: (v: StatusFilter) => void }) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = FILTERS.findIndex((f) => f.value === value);
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = FILTERS[(i + d + FILTERS.length) % FILTERS.length]!;
    onChange(next.value);
    (e.currentTarget.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null)?.focus();
  };
  return (
    <div className="segmented filters" role="radiogroup" aria-label="Filtrer par état" onKeyDown={onKey}>
      {FILTERS.map((f) => (
        <button key={f.value} type="button" role="radio" data-value={f.value} aria-checked={value === f.value} tabIndex={value === f.value ? 0 : -1} onClick={() => onChange(f.value)}>{f.label}</button>
      ))}
    </div>
  );
}

function FirstLaunch({ ldraw }: { ldraw: ReturnType<typeof useLdrawProblem> }) {
  return (
    <div className="first-launch">
      <EmptyState
        icon={<Box size={20} />}
        title="Ta collection est vide"
        actions={(
          <>
            <Link href="/ajouter" className="button primary lg"><Plus size={16} aria-hidden /> Ajouter mon premier set</Link>
            <Link href={`/atelier?demo=${DEMO_ID}`} className="button lg" data-testid="try-demo"><FlaskConical size={16} aria-hidden /> Essayer la démo</Link>
          </>
        )}
      >
        <Link href="/ajouter">Ajoute un set</Link> par son numéro ou en déposant ses fichiers (modèle LDraw, notices PDF, correspondances), ou reprends les fichiers déjà rangés dans ton dossier de données.
        {' '}La démo ouvre un petit modèle de 4 briques fourni avec l’application, sans rien ajouter à ta collection.
      </EmptyState>
      {ldraw.problem && <LdrawSetup reason={ldraw.problem} onRetry={ldraw.retry} />}
    </div>
  );
}

export default function CollectionView() {
  const [view, setView] = useState<LibraryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [version, setVersion] = useState(0);
  const [tried, setTried] = useState<ReadonlySet<string>>(new Set());
  const [legacy, setLegacy] = useState<RecentSession[]>([]);
  const ldraw = useLdrawProblem();

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
  const resume = useMemo(() => (view ? lastInProgress(view.sets) : null), [view]);
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
  const empty = view !== null && view.sets.length === 0 && !error;

  return (
    <div className="collection">
      <AppBar crumbs={[{ label: 'Ma collection' }]}>
        <Link href="/atelier" className="button ghost small" data-tip="Essayer un fichier sans l’ajouter à la collection" data-tip-side="bottom">Atelier sans collection</Link>
        <Link href="/ajouter" className="button primary" data-testid="add-set"><Plus size={16} aria-hidden /> Ajouter un set</Link>
      </AppBar>
      <main className="collection-main" id="contenu">
        {error && (
          <div className="banner error" role="alert" data-testid="library-error">
            <span>{error}</span>
            <button type="button" className="small" onClick={() => void refresh()}>Réessayer</button>
          </div>
        )}
        {view && view.sets.length > 0 && ldraw.problem && <LdrawSetup reason={ldraw.problem} onRetry={ldraw.retry} compact />}
        {resume && filter === 'ALL' && !query && <ResumeBanner set={resume.set} build={resume.build} version={version} />}
        {!empty && (
          <div className="collection-head">
            <h1>Ma collection</h1>
            {view && <span className="muted small num">{view.sets.length} set{view.sets.length > 1 ? 's' : ''}</span>}
            <span className="spacer" />
            <label className="search-field">
              <Search size={16} aria-hidden />
              <input type="search" placeholder="Rechercher un numéro ou un nom…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher un set" data-testid="search" />
            </label>
            <Filters value={filter} onChange={setFilter} />
          </div>
        )}
        {empty && <FirstLaunch ldraw={ldraw} />}
        {!view && !error && (
          <section className="grid" aria-label="Chargement de la collection" aria-busy="true">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton card-skeleton" />)}
          </section>
        )}
        {view && view.sets.length > 0 && sets.length === 0 && (
          <Note tone="info" testId="no-result">Aucun set ne correspond à cette recherche.</Note>
        )}
        {sets.length > 0 && (
          <section className="grid" aria-label="Sets">
            {sets.map((s) => <SetCard key={s.id} set={s} version={version} />)}
          </section>
        )}
        <DiscoveryPanel onAdded={() => void refresh()} />
        {(legacyMatched.length > 0 || legacyOrphans.length > 0 || legacyToCompare.length > 0) && (
          <details className="legacy small" data-testid="legacy-saves">
            <summary>Parties enregistrées dans ce navigateur (versions précédentes) · {legacyMatched.length + legacyOrphans.length + legacyToCompare.length}</summary>
            <p className="muted">Elles ne sont ni modifiées ni effacées.</p>
            <ul>
              {legacyMatched.map((l) => <li key={l.hash}>{l.displayName} — {l.placed}/{l.total} pièces : reprise automatiquement à l’ouverture du set correspondant.</li>)}
              {legacyToCompare.map(({ l, set }) => (
                <li key={`cmp-${l.hash}`}>{l.displayName} — {l.placed}/{l.total} pièces : la bibliothèque a sa propre progression ; <Link href={`/sets/${set.id}`}>comparer et récupérer dans le détail de {set.setNumber}</Link>.</li>
              ))}
              {legacyOrphans.map((l) => <li key={l.hash}>{l.displayName} — {l.placed}/{l.total} pièces : ajoute ce modèle à ta collection pour la reprendre ici.</li>)}
            </ul>
          </details>
        )}
        {view && <p className="small footer-note">Données : <code>{view.dataDir}</code> · tout reste sur ce Mac · application non affiliée à LEGO.</p>}
      </main>
      {pendingThumb && <ThumbnailMaker key={pendingThumb.id} build={pendingThumb} onDone={thumbDone} />}
    </div>
  );
}

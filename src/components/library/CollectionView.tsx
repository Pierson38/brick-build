'use client';

import Link from 'next/link';
import { BookOpen, Box, FlaskConical, Link2, Play, Plus, Search, TriangleAlert, Wrench } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { filterSets, setStatus, type BuildView, type LibraryView, type SetView, type StatusFilter } from '@/domain/library/types';
import { libraryApi } from '@/infra/library/api';
import { listRecentSessions, type RecentSession } from '@/infra/persistence/local-progress';
import { useLocale, useT } from '@/i18n/I18nProvider';
import { DEMO_ID } from '../demo/demo-model';
import { AppBar } from '../ui/AppBar';
import { EmptyState, Note } from '../ui/feedback';
import { LdrawSetup, useLdrawProblem } from '../ui/LdrawSetup';
import { DiscoveryPanel } from './DiscoveryPanel';
import { actionLabel, formatDate, ModeChips, ProgressBar, StatusBadge } from './labels';
import { ModelPreview, useLibraryModel } from './ModelPreview';

const FILTERS: { value: StatusFilter }[] = [
  { value: 'ALL' },
  { value: 'IN_PROGRESS' },
  { value: 'DONE' },
  { value: 'NOT_STARTED' },
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
  const t = useT();
  const [failed, setFailed] = useState(false);
  if (!build || !build.hasThumbnail || failed) {
    return <div className={`${className} placeholder`} aria-hidden><span>{build ? t.library.labels.pieces(build.snapshot.occurrenceCount) : '—'}</span></div>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={`${libraryApi.thumbnailUrl(build)}?v=${version}`} alt="" onError={() => setFailed(true)} />;
}

function SetCard({ set, version }: { set: SetView; version: number }) {
  const t = useT();
  const c = t.library.collection;
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
      <Link href={`/sets/${set.id}`} className="thumb-link" aria-label={c.setDetailsAria(set.setNumber, set.name)}>
        <Thumbnail build={main} version={version} />
        <span className="thumb-status"><StatusBadge status={status} /></span>
        {main && total > 0 && <span className="thumb-progress" aria-hidden><span style={{ width: `${Math.round((100 * placed) / total)}%` }} /></span>}
      </Link>
      <div className="set-body">
        <div className="set-title">
          <span className="setno">{set.setNumber}</span>
          <h3><Link href={`/sets/${set.id}`}>{set.name}</Link></h3>
        </div>
        <ul className="files small" aria-label={c.filesAria}>
          <li className="muted"><Box size={14} aria-hidden /> {pieces.length === 1 ? t.library.labels.pieces(pieces[0]!) : c.buildsPieces(set.builds.length, pieces.join(' / '))}</li>
          <li className={modelOk ? 'ok' : 'error'}>{c.model3d} {modelOk ? '✓' : '⚠'}</li>
          <li className={booklets > 0 ? 'ok' : 'muted'}><BookOpen size={14} aria-hidden /> {booklets > 0 ? c.booklets(booklets) : c.noBooklet}</li>
          <li className={mapped > 0 ? 'ok' : 'muted'}><Link2 size={14} aria-hidden /> {mapped > 0 ? c.mappingsOk : set.builds.some((b) => b.mapping) ? c.mappingsDraft : c.noMappings}</li>
        </ul>
        {main && <ModeChips modes={main.modes} />}
        {main && (
          <div className="progress-line">
            <ProgressBar placed={placed} total={total} />
            <span className="small num" data-testid="card-progress">{c.cardProgress(placed, total, Boolean(main.progress && main.progress.free > 0))}</span>
          </div>
        )}
        {problems.length > 0 && <p className="small error card-problem" role="note"><TriangleAlert size={14} aria-hidden /> {problems[0]}{problems.length > 1 ? ` (+${problems.length - 1})` : ''}</p>}
        <div className="card-actions">
          {main && main.modes.length > 0 ? (
            <Link className="button primary" href={`/atelier/${main.id}`} data-testid="card-build">
              {actionLabel(main, t)}{set.builds.length > 1 ? ` ${t.library.labels.quoted(main.label)}` : ''}
            </Link>
          ) : (
            <Link className="button primary" href={`/sets/${set.id}`} data-testid="card-repair"><Wrench size={16} aria-hidden /> {c.repair}</Link>
          )}
          <Link className="button ghost" href={`/sets/${set.id}`}>{c.details}</Link>
        </div>
      </div>
    </article>
  );
}

function ResumeBanner({ set, build, version }: { set: SetView; build: BuildView; version: number }) {
  const t = useT();
  const locale = useLocale();
  const placed = build.progress?.placed ?? 0;
  const total = build.snapshot.occurrenceCount;
  return (
    <section className="resume" data-testid="resume-banner" aria-label={t.library.collection.resumeAria}>
      <Thumbnail build={build} version={version} className="resume-thumb" />
      <div className="resume-body">
        <p className="section-title">{t.library.collection.resumeTitle}</p>
        <h2><span className="setno">{set.setNumber}</span> {set.name}{set.builds.length > 1 ? ` · ${build.label}` : ''}</h2>
        <p className="small muted">
          {build.progress ? `${t.library.labels.modeShort[build.progress.mode]} · ` : ''}{t.library.labels.placed(placed, total)}{build.progress ? ` · ${formatDate(build.progress.updatedAtIso, locale)}` : ''}
        </p>
        <ProgressBar placed={placed} total={total} />
      </div>
      <Link className="button primary lg" href={`/atelier/${build.id}`} data-testid="resume-build"><Play size={16} aria-hidden /> {t.library.labels.action.resume}</Link>
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
  const t = useT();
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
    <div className="segmented filters" role="radiogroup" aria-label={t.library.collection.filterAria} onKeyDown={onKey}>
      {FILTERS.map((f) => (
        <button key={f.value} type="button" role="radio" data-value={f.value} aria-checked={value === f.value} tabIndex={value === f.value ? 0 : -1} onClick={() => onChange(f.value)}>{t.library.collection.filters[f.value]}</button>
      ))}
    </div>
  );
}

function FirstLaunch({ ldraw }: { ldraw: ReturnType<typeof useLdrawProblem> }) {
  const f = useT().library.collection.firstLaunch;
  return (
    <div className="first-launch">
      <EmptyState
        icon={<Box size={20} />}
        title={f.title}
        actions={(
          <>
            <Link href="/ajouter" className="button primary lg"><Plus size={16} aria-hidden /> {f.addFirst}</Link>
            <Link href={`/atelier?demo=${DEMO_ID}`} className="button lg" data-testid="try-demo"><FlaskConical size={16} aria-hidden /> {f.tryDemo}</Link>
          </>
        )}
      >
        <Link href="/ajouter">{f.addLink}</Link>{f.afterLink}
        {' '}{f.demoNote}
      </EmptyState>
      {ldraw.problem && <LdrawSetup reason={ldraw.problem} onRetry={ldraw.retry} />}
    </div>
  );
}

export default function CollectionView() {
  const t = useT();
  const c = t.library.collection;
  // server texts (problems, errors) are produced in the language of the request: fetched again on a switch
  const locale = useLocale();
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
  }, [refresh, locale]);

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
      <AppBar crumbs={[{ label: t.common.myCollection }]}>
        <Link href="/atelier" className="button ghost small" data-tip={c.standaloneAtelierTip} data-tip-side="bottom">{c.standaloneAtelier}</Link>
        <Link href="/ajouter" className="button primary" data-testid="add-set"><Plus size={16} aria-hidden /> {c.addSet}</Link>
      </AppBar>
      <main className="collection-main" id="contenu">
        {error && (
          <div className="banner error" role="alert" data-testid="library-error">
            <span>{error}</span>
            <button type="button" className="small" onClick={() => void refresh()}>{t.common.retry}</button>
          </div>
        )}
        {view && view.sets.length > 0 && ldraw.problem && <LdrawSetup reason={ldraw.problem} onRetry={ldraw.retry} compact />}
        {resume && filter === 'ALL' && !query && <ResumeBanner set={resume.set} build={resume.build} version={version} />}
        {!empty && (
          <div className="collection-head">
            <h1>{t.common.myCollection}</h1>
            {view && <span className="muted small num">{c.setCount(view.sets.length)}</span>}
            <span className="spacer" />
            <label className="search-field">
              <Search size={16} aria-hidden />
              <input type="search" placeholder={c.searchPlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={c.searchAria} data-testid="search" />
            </label>
            <Filters value={filter} onChange={setFilter} />
          </div>
        )}
        {empty && <FirstLaunch ldraw={ldraw} />}
        {!view && !error && (
          <section className="grid" aria-label={c.loadingAria} aria-busy="true">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton card-skeleton" />)}
          </section>
        )}
        {view && view.sets.length > 0 && sets.length === 0 && (
          <Note tone="info" testId="no-result">{c.noResult}</Note>
        )}
        {sets.length > 0 && (
          <section className="grid" aria-label={c.setsAria}>
            {sets.map((s) => <SetCard key={s.id} set={s} version={version} />)}
          </section>
        )}
        <DiscoveryPanel onAdded={() => void refresh()} />
        {(legacyMatched.length > 0 || legacyOrphans.length > 0 || legacyToCompare.length > 0) && (
          <details className="legacy small" data-testid="legacy-saves">
            <summary>{c.legacy.summary(legacyMatched.length + legacyOrphans.length + legacyToCompare.length)}</summary>
            <p className="muted">{c.legacy.untouched}</p>
            <ul>
              {legacyMatched.map((l) => <li key={l.hash}>{c.legacy.matched(l.displayName, l.placed, l.total)}</li>)}
              {legacyToCompare.map(({ l, set }) => (
                <li key={`cmp-${l.hash}`}>{c.legacy.toCompare(l.displayName, l.placed, l.total)}<Link href={`/sets/${set.id}`}>{c.legacy.compareLink(set.setNumber)}</Link>.</li>
              ))}
              {legacyOrphans.map((l) => <li key={l.hash}>{c.legacy.orphan(l.displayName, l.placed, l.total)}</li>)}
            </ul>
          </details>
        )}
        {view && <p className="small footer-note">{c.dataLabel} <code>{view.dataDir}</code>{c.footerRest}</p>}
      </main>
      {pendingThumb && <ThumbnailMaker key={pendingThumb.id} build={pendingThumb} onDone={thumbDone} />}
    </div>
  );
}

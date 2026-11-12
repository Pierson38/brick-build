'use client';

import { BookOpen, Box, Download, FileBox, FileText, Link2, Pencil, Plus, RefreshCw, SearchX, ShieldCheck, Stethoscope, Trash2, Upload, Wrench } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { analyzeModel, sha256Hex } from '@/domain/import/analyze';
import { inventoryCheck } from '@/domain/import/known-validations';
import { parseMapping, parseMappingText } from '@/domain/instructions/mapping';
import type { BuildView, FileView, LibraryView, SetView } from '@/domain/library/types';
import { libraryApi } from '@/infra/library/api';
import { downloadMapping } from '@/infra/persistence/local-mapping';
import { useLocale, useT } from '@/i18n/I18nProvider';
import { actionLabel, formatBytes, formatDate, ProgressBar, StatusBadge } from './labels';
import { BrowserSavePanel } from './BrowserSave';
import { ModelPreview, useLibraryModel } from './ModelPreview';
import { AppBar } from '../ui/AppBar';
import { ConfirmDialog } from '../ui/Dialog';
import { EmptyState, Loading, Note, Toast } from '../ui/feedback';

type Notify = (kind: 'ok' | 'error', text: string) => void;

/** Two clicks: the action runs only after an explicit confirmation. */
function ConfirmButton({ label, confirm, onConfirm, testId }: { label: string; confirm: string; onConfirm: () => void; testId?: string }) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className="ghost small danger-text" onClick={() => setAsking(true)} data-testid={testId}>{label}</button>;
  return (
    <span className="confirm small">
      {confirm}{' '}
      <button type="button" className="danger solid small" onClick={() => { setAsking(false); onConfirm(); }} data-testid={testId ? `${testId}-confirm` : undefined}>{t.common.confirm}</button>
      {' '}<button type="button" className="small" onClick={() => setAsking(false)}>{t.common.cancel}</button>
    </span>
  );
}

/** Picks a file and accepts it only if its SHA-256 is the expected one (repair, never substitution). */
function RepairInput({ file, accept, onRepaired, notify }: { file: FileView; accept: string; onRepaired: () => void; notify: Notify }) {
  const t = useT();
  const repair = async (f: File) => {
    const sha = await sha256Hex(await f.arrayBuffer());
    if (sha !== file.sha256) return notify('error', t.library.setDetail.wrongFile(f.name, sha.slice(0, 12), file.sha256.slice(0, 12)));
    try {
      await libraryApi.upload(file.kind, f);
      notify('ok', t.library.setDetail.repaired(file.originalName));
      onRepaired();
    } catch (e) {
      notify('error', e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <label className="button primary small">
      <Wrench size={14} aria-hidden /> {t.library.setDetail.repairButton}
      <input type="file" accept={accept} className="visually-hidden" data-testid={`repair-${file.sha256.slice(0, 8)}`} onChange={(e) => { const f = e.target.files?.[0]; if (f) void repair(f); e.target.value = ''; }} />
    </label>
  );
}

function FileLine({ file, children }: { file: FileView; children?: React.ReactNode }) {
  const t = useT();
  return (
    <li className={`file-line state-${file.state}`} data-testid={`file-${file.kind}`}>
      <span className="file-name">{file.kind === 'pdf' ? <FileText size={16} aria-hidden /> : <FileBox size={16} aria-hidden />}{file.originalName}</span>
      <span className="small muted">{formatBytes(file.size, t)} · {file.location === 'external' ? t.library.setDetail.external : t.library.setDetail.libraryCopy} · <span className={file.state === 'OK' ? 'ok' : 'error'} data-testid="file-state">{t.library.labels.fileState[file.state]}</span></span>
      {children}
    </li>
  );
}

function BuildPanel({ set, build, revision, refresh, notify }: { set: SetView; build: BuildView; revision: number; refresh: () => Promise<void>; notify: Notify }) {
  const router = useRouter();
  const t = useT();
  const d = t.library.setDetail;
  const locale = useLocale();
  const { model, error, loading } = useLibraryModel(build, build.model.state === 'OK');
  const [label, setLabel] = useState(build.label);
  const [checking, setChecking] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // full SHA-256 states (the collection only checks existence and size)
  const [hashed, setHashed] = useState<ReadonlyMap<string, FileView['state']>>(new Map());
  useEffect(() => setLabel(build.label), [build.label]);
  const fileKey = [build.model.sha256, ...build.booklets.map((b) => `${b.sha256}:${b.state}`)].join(',');
  useEffect(() => {
    let cancelled = false;
    libraryApi.check(build.id).then((r) => {
      if (!cancelled) setHashed(new Map(r.files.map((f) => [f.sha256, f.state as FileView['state']])));
    }, () => undefined);
    return () => {
      cancelled = true;
    };
  }, [build.id, fileKey, build.model.state]);
  const withHash = (f: FileView): FileView => ({ ...f, state: hashed.get(f.sha256) ?? f.state });
  const modelFile = withHash(build.model);
  const booklets = build.booklets.map(withHash);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) notify('ok', ok);
    } catch (e) {
      notify('error', e instanceof Error ? e.message : String(e));
    }
    await refresh();
  };
  const setBooklets = (ids: string[], ok: string) => run(() => libraryApi.updateBuild(build.id, revision, { bookletFileIds: ids }), ok);
  const addBooklets = async (files: File[]) => {
    const ids = [...build.booklets.map((b) => b.sha256)];
    try {
      for (const f of files) {
        const { file } = await libraryApi.upload('pdf', f);
        if (!ids.includes(file.sha256)) ids.push(file.sha256);
      }
    } catch (e) {
      return notify('error', e instanceof Error ? e.message : String(e));
    }
    await setBooklets(ids, d.bookletsAssociated(files.length));
  };
  const replaceBooklet = async (old: string, f: File) => {
    try {
      const { file } = await libraryApi.upload('pdf', f);
      await setBooklets(build.booklets.map((b) => (b.sha256 === old ? file.sha256 : b.sha256)).filter((x, i, a) => a.indexOf(x) === i), d.bookletReplaced(file.originalName));
    } catch (e) {
      notify('error', e instanceof Error ? e.message : String(e));
    }
  };
  const importMapping = async (f: File) => {
    const parsed = parseMappingText(await f.text());
    if (!parsed.ok) return notify('error', d.importRefused(parsed.errors.join(' ')));
    const m = parsed.mapping.model;
    if (m.sha256 !== build.model.sha256 || m.rootName !== build.rootName || m.occurrenceCount !== build.snapshot.occurrenceCount) {
      return notify('error', d.importOtherModel(m.fileName, m.sha256.slice(0, 12), m.occurrenceCount));
    }
    await run(() => libraryApi.putMapping(build.id, build.mapping?.revision ?? null, JSON.stringify(parsed.mapping), 'import'),
      d.mappingImported(parsed.mapping.steps.length, Boolean(build.mapping)));
  };
  const exportMapping = async () => {
    const r = await libraryApi.mapping(build.id);
    const parsed = r.mapping ? parseMapping(r.mapping) : null;
    if (parsed?.ok) downloadMapping(parsed.mapping);
  };
  const check = async () => {
    setChecking(d.checking);
    const r = await libraryApi.check(build.id).catch((e: unknown) => ({ files: [], error: String(e) }));
    const bad = r.files.filter((f) => f.state !== 'OK');
    setChecking(bad.length === 0 ? d.checkOk(r.files.length) : bad.map((f) => f.message).join(' '));
    await refresh();
  };
  const inventory = inventoryCheck(build.model.sha256);
  const missing = model?.geometry ? [...model.geometry.missingParts] : [];

  const removeLabel = set.builds.length > 1 ? d.removeBuild : d.removeSet;
  const remove = async () => {
    try {
      if (set.builds.length > 1) await libraryApi.removeBuild(build.id, revision);
      else await libraryApi.removeSet(set.id, revision);
      if (set.builds.length > 1) await refresh();
      else router.push('/');
    } catch (e) {
      notify('error', e instanceof Error ? e.message : String(e));
    }
  };
  const compatProblem = missing.length > 0 || build.snapshot.errors > 0;

  return (
    <section className="build-panel" data-testid={`build-${build.id}`} aria-label={build.label}>
      <div className="build-preview">
        {model ? (
          <ModelPreview model={model} {...(!build.hasThumbnail ? { onThumbnail: (png: Blob) => void libraryApi.putThumbnail(build.id, png).then(refresh, () => undefined) } : {})} />
        ) : (
          <div className="preview3d empty">
            {loading ? <Loading>{t.library.preview.loading}</Loading> : <p className="small muted"><Box size={20} aria-hidden /><br />{error ?? t.library.preview.unavailable}</p>}
          </div>
        )}
      </div>
      <div className="build-info">
        <div className="build-head">
          <span className="inline-edit-wrap">
            <input className="inline-edit" aria-label={t.library.labels.buildName} value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && label.trim() && label.trim() !== build.label) void run(() => libraryApi.updateBuild(build.id, revision, { label }), d.renamed);
                if (e.key === 'Escape') setLabel(build.label);
              }} />
            <Pencil size={14} aria-hidden className="edit-hint" />
          </span>
          {label.trim() !== build.label && <button type="button" className="primary small" onClick={() => void run(() => libraryApi.updateBuild(build.id, revision, { label }), d.renamed)}>{t.common.save}</button>}
          <StatusBadge status={build.status} />
        </div>

        {build.problems.length > 0 && (
          <div className="note error">
            <ul className="plain small" role="alert" data-testid="detail-problems">{build.problems.map((p) => <li key={p}>⚠ {p}</li>)}</ul>
          </div>
        )}
        {model && (
          <BrowserSavePanel buildId={build.id} modelSha={build.model.sha256} rootName={build.rootName} fileName={build.model.originalName}
            occurrences={model.analysis.model.occurrences} libraryRevision={build.progress?.revision ?? null} onDone={() => void refresh()} notify={notify} />
        )}

        <div className="progress-line">
          <ProgressBar placed={build.progress?.placed ?? 0} total={build.snapshot.occurrenceCount} />
          <span className="small num" data-testid="detail-progress">{t.library.labels.placed(build.progress?.placed ?? 0, build.snapshot.occurrenceCount)}</span>
        </div>
        {build.progress && (
          <p className="small muted progress-meta">
            {t.library.labels.modeShort[build.progress.mode]} · {formatDate(build.progress.updatedAtIso, locale)}
            {build.progress.free > 0 && (
              <span data-testid="detail-free">
                {' '}· {d.freeDetail(build.progress.free, build.progress.atModel, build.snapshot.occurrenceCount)}
              </span>
            )}
          </p>
        )}

        <ul className="mode-list small" data-testid="detail-modes" aria-label={d.modesAria}>
          {(['synced', 'guided', 'freeManual'] as const).map((m) => (
            <li key={m} className={build.modes.includes(m) ? 'ok' : 'muted'}>
              {build.modes.includes(m) ? '✓' : '✗'} {t.library.labels.modeShort[m]}
              {m === 'synced' && build.syncBlocker && <span className="muted"> — {d.syncUnavailable(build.syncBlocker)}</span>}
              {m === 'guided' && !build.modes.includes(m) && build.model.state === 'OK' && <span className="muted"> — {d.noStepsInFile}</span>}
            </li>
          ))}
        </ul>

        <div className="card-actions">
          {build.modes.length > 0
            ? <button type="button" className="button primary lg" onClick={() => router.push(`/atelier/${build.id}`)} data-testid="detail-build">{actionLabel(build, t)}</button>
            : <Note tone="error">{d.cannotBuild}</Note>}
        </div>

        <details className="detail-section" open>
          <summary><FileBox size={16} aria-hidden /> {d.files} <span className={modelFile.state === 'OK' ? 'section-state ok' : 'section-state error'}>{t.library.labels.fileState[modelFile.state]}</span></summary>
          <ul className="plain">
            <FileLine file={modelFile}>{modelFile.state !== 'OK' && <RepairInput file={modelFile} accept=".mpd,.ldr" onRepaired={() => void refresh()} notify={notify} />}</FileLine>
          </ul>
          <div className="section-actions">
            <button type="button" className="secondary small" onClick={() => void check()} data-testid="detail-check"><ShieldCheck size={14} aria-hidden /> {d.checkHashes}</button>
            {checking && <span className="small" data-testid="check-result">{checking}</span>}
          </div>
        </details>

        <details className="detail-section" open>
          <summary><BookOpen size={16} aria-hidden /> {d.booklets} <span className="section-state">{booklets.length}</span></summary>
          {booklets.length === 0 && <p className="small muted">{d.noBooklet}</p>}
          <ul className="plain">
            {booklets.map((b) => (
              <FileLine key={b.sha256} file={b}>
                <span className="row-actions">
                  {b.state !== 'OK' && <RepairInput file={b} accept=".pdf" onRepaired={() => void refresh()} notify={notify} />}
                  <label className="button ghost small">{d.replace}
                    <input type="file" accept=".pdf" className="visually-hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void replaceBooklet(b.sha256, f); e.target.value = ''; }} />
                  </label>
                  <ConfirmButton label={d.unlink} confirm={d.unlinkConfirm} onConfirm={() => void setBooklets(build.booklets.filter((x) => x.sha256 !== b.sha256).map((x) => x.sha256), d.unlinked)} />
                </span>
              </FileLine>
            ))}
          </ul>
          <div className="section-actions">
            <label className="button secondary small">
              <Plus size={14} aria-hidden /> {d.associate}
              <input type="file" accept=".pdf" multiple className="visually-hidden" data-testid="detail-add-pdf" onChange={(e) => { const fs = [...(e.target.files ?? [])]; if (fs.length) void addBooklets(fs); e.target.value = ''; }} />
            </label>
          </div>
        </details>

        <details className="detail-section" open>
          <summary><Link2 size={16} aria-hidden /> {t.library.labels.mappingsTitle}
            {build.mapping && <span className={build.mapping.valid ? 'section-state ok' : 'section-state warn'}>{build.mapping.valid ? d.mappingsValid : d.mappingsDraft}</span>}
          </summary>
          {build.mapping ? (
            <div className="small" data-testid="detail-mapping">
              <p className={build.mapping.valid ? 'ok' : 'warn'}>
                {build.mapping.valid ? d.validLine : d.draftLine(build.mapping.firstError ?? d.incomplete)} · {d.mappingSteps(build.mapping.steps)} · {d.mappingVerified(build.mapping.verified, build.mapping.steps)} · {d.mappingAssigned(build.mapping.assigned, build.mapping.total)}
              </p>
              <ul className="plain">
                {build.mapping.booklets.map((b) => (
                  <li key={`${b.label}-${b.sha256}`} className={b.associated ? 'ok' : 'error'}>
                    {b.associated ? '✓' : '✗'} {d.bookletLabel(b.label)} {b.associated ? d.associated : d.notAssociated(b.sha256?.slice(0, 12) ?? d.unknownHash)}
                  </li>
                ))}
              </ul>
              <div className="section-actions">
                <button type="button" className="secondary small" onClick={() => void exportMapping()}><Download size={14} aria-hidden /> {d.exportJson}</button>
              </div>
            </div>
          ) : <p className="small muted">{d.noMappings}</p>}
          <div className="section-actions">
            <label className="button secondary small">
              <Upload size={14} aria-hidden /> {build.mapping ? d.replaceByFile : d.importMappingFile}
              <input type="file" accept=".json,application/json" className="visually-hidden" data-testid="detail-mapping-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importMapping(f); e.target.value = ''; }} />
            </label>
          </div>
        </details>

        {missing.length > 0 && <p className="small error">{d.missingParts(missing.join(', '))}</p>}
        <details className="detail-section" open={compatProblem}>
          <summary><Stethoscope size={16} aria-hidden /> {d.compatTitle}
            {model && <span className="section-state">{d.quality[model.quality.quality]}</span>}
          </summary>
          <dl className="facts small">
            <dt>{d.facts.pieces}</dt><dd>{build.snapshot.occurrenceCount}</dd>
            <dt>{d.facts.refsColours}</dt><dd>{build.snapshot.uniqueParts} / {build.snapshot.colours}</dd>
            <dt>{d.facts.ldrawSteps}</dt><dd>{build.snapshot.stepCount} ({build.snapshot.planKind})</dd>
            <dt>{d.facts.mainModel}</dt><dd>{build.rootName}</dd>
            {model && <><dt>{d.facts.quality}</dt><dd data-testid="detail-quality">{d.quality[model.quality.quality]}</dd></>}
          </dl>
          <p className={`small inventory-${inventory.verdict}`}>{inventory.verdict === 'COHERENT' ? '✓ ' : '⚠ '}{inventory.message}</p>
          {(build.snapshot.errors + build.snapshot.warnings > 0 || model?.quality.reasons.length) && (
            <details className="small">
              <summary>{d.diagnostics(build.snapshot.errors, build.snapshot.warnings)}</summary>
              <ul>
                {model?.quality.reasons.map((r) => <li key={r}>{r}</li>)}
                {build.snapshot.diagnostics.map((g, i) => <li key={i} className={g.severity}>[{g.severity}] {g.message}{g.line ? d.lineSuffix(g.line) : ''}</li>)}
              </ul>
            </details>
          )}
        </details>

        <div className="danger-zone">
          <p className="small muted">{d.trashNote}</p>
          <button type="button" className="ghost small danger-text" data-testid="detail-remove" onClick={() => setConfirmRemove(true)}><Trash2 size={14} aria-hidden /> {removeLabel}</button>
          <ConfirmDialog open={confirmRemove} title={d.confirmTitle(removeLabel)} confirmLabel={removeLabel} confirmTestId="detail-remove-confirm"
            onCancel={() => setConfirmRemove(false)} onConfirm={() => { setConfirmRemove(false); void remove(); }}>
            <p>{d.trashNote}</p>
          </ConfirmDialog>
        </div>
      </div>
    </section>
  );
}

export default function SetDetail({ setId }: { setId: string }) {
  const t = useT();
  const d = t.library.setDetail;
  // server texts (problems, sync blocker, mapping errors) follow the language: fetched again on a switch
  const locale = useLocale();
  const [view, setView] = useState<LibraryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const refresh = useCallback(async () => {
    try {
      setView(await libraryApi.view());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => void refresh(), [refresh, locale]);
  const set = view?.sets.find((s) => s.id === setId);
  useEffect(() => {
    if (set) {
      setName(set.name);
      setNumber(set.setNumber);
    }
  }, [set?.name, set?.setNumber]); // eslint-disable-line react-hooks/exhaustive-deps
  const notify: Notify = (kind, text) => setToast({ kind, text });

  const addAlternative = async (f: File) => {
    if (!set || !view) return;
    try {
      const a = analyzeModel(await f.text(), f.name);
      if (a.model.occurrences.length === 0) throw new Error(d.noPieceRead(f.name));
      const { file } = await libraryApi.upload('model', f);
      await libraryApi.addBuild(set.id, view.revision, {
        label: newLabel.trim() || t.library.labels.modelLetter(String.fromCharCode(65 + set.builds.length)), modelFileId: file.sha256, rootName: a.model.rootName,
        bookletFileIds: [],
      });
      setNewLabel('');
      notify('ok', d.buildAdded);
    } catch (e) {
      notify('error', e instanceof Error ? e.message : String(e));
    }
    await refresh();
  };

  const dirty = Boolean(set && (name.trim() !== set.name || number.trim() !== set.setNumber));
  const saveName = () => {
    if (!set || !view || !dirty) return;
    void libraryApi.updateSet(set.id, view.revision, { name: name.trim(), setNumber: number.trim() })
      .then(() => notify('ok', d.setRenamed), (e: unknown) => notify('error', e instanceof Error ? e.message : String(e))).then(refresh);
  };
  const editKeys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') saveName();
    if (e.key === 'Escape' && set) {
      setName(set.name);
      setNumber(set.setNumber);
    }
  };

  return (
    <div className="detail">
      <AppBar crumbs={[{ label: t.common.myCollection, href: '/', testId: 'back-to-collection' }, ...(set ? [{ label: `${set.setNumber} ${set.name}`, title: `${set.setNumber} ${set.name}` }] : [])]} />
      <main className="detail-main">
        {error && (
          <Note tone="error" role="alert">
            {error}{' '}
            <button type="button" className="link" onClick={() => void refresh()}><RefreshCw size={12} aria-hidden /> {t.common.retry}</button>
          </Note>
        )}
        {!view && !error && <Loading>{d.loading}</Loading>}
        {view && !set && (
          <EmptyState icon={<SearchX size={20} />} title={d.notFound}
            actions={<Link href="/" className="button primary">{d.backToCollection}</Link>} />
        )}
        {set && view && (
          <>
            <div className="detail-head">
              <span className="inline-edit-wrap">
                <input className="inline-edit setno" aria-label={d.numberAria} value={number} onChange={(e) => setNumber(e.target.value)} onKeyDown={editKeys} maxLength={32} data-testid="detail-number" />
              </span>
              <span className="inline-edit-wrap grow">
                <input className="inline-edit title" aria-label={d.nameAria} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={editKeys} maxLength={120} data-testid="detail-name" />
                <Pencil size={16} aria-hidden className="edit-hint" />
              </span>
              {dirty && (
                <>
                  <button type="button" className="button primary small" data-testid="detail-save-name" onClick={saveName}>{t.common.save}</button>
                  <button type="button" className="ghost small" onClick={() => { setName(set.name); setNumber(set.setNumber); }}>{t.common.cancel}</button>
                </>
              )}
            </div>
            {set.builds.map((b) => <BuildPanel key={b.id} set={set} build={b} revision={view.revision} refresh={refresh} notify={notify} />)}
            <section className="add-build small" aria-labelledby="add-build-title">
              <h3 id="add-build-title"><Plus size={16} aria-hidden /> {d.altTitle}</h3>
              <p className="muted">{d.altBody}</p>
              <div className="add-build-row">
                <input placeholder={d.altPlaceholder} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} maxLength={120} aria-label={d.altNameAria} />
                <label className="button secondary small"><Upload size={14} aria-hidden /> {d.altAdd}
                  <input type="file" accept=".mpd,.ldr" className="visually-hidden" data-testid="detail-add-build" onChange={(e) => { const f = e.target.files?.[0]; if (f) void addAlternative(f); e.target.value = ''; }} />
                </label>
              </div>
            </section>
          </>
        )}
      </main>
      {toast && <Toast tone={toast.kind} className="fixed" testId="detail-message" onClose={() => setToast(null)}>{toast.text}</Toast>}
    </div>
  );
}

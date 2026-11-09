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
import { actionLabel, FILE_STATE_LABEL, formatBytes, formatDate, MODE_SHORT, ProgressBar, StatusBadge } from './labels';
import { BrowserSavePanel } from './BrowserSave';
import { ModelPreview, useLibraryModel } from './ModelPreview';
import { AppBar } from '../ui/AppBar';
import { ConfirmDialog } from '../ui/Dialog';
import { EmptyState, Loading, Note, Toast } from '../ui/feedback';

type Notify = (kind: 'ok' | 'error', text: string) => void;

const QUALITY: Record<string, string> = {
  INVALID: 'Invalide', ANALYSABLE: 'Analysable (rendu incomplet ou non vérifié)', RENDERABLE: 'Affichable', MANUAL_ONLY: 'Montage libre uniquement (pas d’étapes)', GUIDED_PLAYABLE: 'Jouable avec étapes 3D',
};

/** Two clicks: the action runs only after an explicit confirmation. */
function ConfirmButton({ label, confirm, onConfirm, testId }: { label: string; confirm: string; onConfirm: () => void; testId?: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className="ghost small danger-text" onClick={() => setAsking(true)} data-testid={testId}>{label}</button>;
  return (
    <span className="confirm small">
      {confirm}{' '}
      <button type="button" className="danger solid small" onClick={() => { setAsking(false); onConfirm(); }} data-testid={testId ? `${testId}-confirm` : undefined}>Confirmer</button>
      {' '}<button type="button" className="small" onClick={() => setAsking(false)}>Annuler</button>
    </span>
  );
}

/** Picks a file and accepts it only if its SHA-256 is the expected one (repair, never substitution). */
function RepairInput({ file, accept, onRepaired, notify }: { file: FileView; accept: string; onRepaired: () => void; notify: Notify }) {
  const repair = async (f: File) => {
    const sha = await sha256Hex(await f.arrayBuffer());
    if (sha !== file.sha256) return notify('error', `${f.name} n’est pas le fichier attendu (empreinte ${sha.slice(0, 12)}… au lieu de ${file.sha256.slice(0, 12)}…) : rien n’a été changé.`);
    try {
      await libraryApi.upload(file.kind, f);
      notify('ok', `${file.originalName} réparé : copie vérifiée enregistrée dans la bibliothèque.`);
      onRepaired();
    } catch (e) {
      notify('error', e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <label className="button primary small">
      <Wrench size={14} aria-hidden /> Réparer : choisir le fichier d’origine
      <input type="file" accept={accept} hidden data-testid={`repair-${file.sha256.slice(0, 8)}`} onChange={(e) => { const f = e.target.files?.[0]; if (f) void repair(f); e.target.value = ''; }} />
    </label>
  );
}

function FileLine({ file, children }: { file: FileView; children?: React.ReactNode }) {
  return (
    <li className={`file-line state-${file.state}`} data-testid={`file-${file.kind}`}>
      <span className="file-name">{file.kind === 'pdf' ? <FileText size={16} aria-hidden /> : <FileBox size={16} aria-hidden />}{file.originalName}</span>
      <span className="small muted">{formatBytes(file.size)} · {file.location === 'external' ? 'laissé en place dans le dossier de données' : 'copie de la bibliothèque'} · <span className={file.state === 'OK' ? 'ok' : 'error'} data-testid="file-state">{FILE_STATE_LABEL[file.state]}</span></span>
      {children}
    </li>
  );
}

function BuildPanel({ set, build, revision, refresh, notify }: { set: SetView; build: BuildView; revision: number; refresh: () => Promise<void>; notify: Notify }) {
  const router = useRouter();
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
    await setBooklets(ids, `${files.length} notice(s) associée(s).`);
  };
  const replaceBooklet = async (old: string, f: File) => {
    try {
      const { file } = await libraryApi.upload('pdf', f);
      await setBooklets(build.booklets.map((b) => (b.sha256 === old ? file.sha256 : b.sha256)).filter((x, i, a) => a.indexOf(x) === i), `Notice remplacée par ${file.originalName}.`);
    } catch (e) {
      notify('error', e instanceof Error ? e.message : String(e));
    }
  };
  const importMapping = async (f: File) => {
    const parsed = parseMappingText(await f.text());
    if (!parsed.ok) return notify('error', `Import refusé : ${parsed.errors.join(' ')}`);
    const m = parsed.mapping.model;
    if (m.sha256 !== build.model.sha256 || m.rootName !== build.rootName || m.occurrenceCount !== build.snapshot.occurrenceCount) {
      return notify('error', `Import refusé : ces correspondances concernent un autre modèle (${m.fileName}, empreinte ${m.sha256.slice(0, 12)}…, ${m.occurrenceCount} pièces).`);
    }
    await run(() => libraryApi.putMapping(build.id, build.mapping?.revision ?? null, JSON.stringify(parsed.mapping), 'import'),
      `Correspondances importées : ${parsed.mapping.steps.length} étape(s).${build.mapping ? ' La version précédente est gardée dans l’historique.' : ''}`);
  };
  const exportMapping = async () => {
    const r = await libraryApi.mapping(build.id);
    const parsed = r.mapping ? parseMapping(r.mapping) : null;
    if (parsed?.ok) downloadMapping(parsed.mapping);
  };
  const check = async () => {
    setChecking('Vérification des empreintes…');
    const r = await libraryApi.check(build.id).catch((e: unknown) => ({ files: [], error: String(e) }));
    const bad = r.files.filter((f) => f.state !== 'OK');
    setChecking(bad.length === 0 ? `${r.files.length} fichier(s) vérifié(s) : empreintes SHA-256 identiques.` : bad.map((f) => f.message).join(' '));
    await refresh();
  };
  const inventory = inventoryCheck(build.model.sha256);
  const missing = model?.geometry ? [...model.geometry.missingParts] : [];

  const removeLabel = set.builds.length > 1 ? 'Retirer cette construction' : 'Retirer le set de la collection';
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
            {loading ? <Loading>Chargement de l’aperçu 3D…</Loading> : <p className="small muted"><Box size={20} aria-hidden /><br />{error ?? 'Aperçu indisponible.'}</p>}
          </div>
        )}
      </div>
      <div className="build-info">
        <div className="build-head">
          <span className="inline-edit-wrap">
            <input className="inline-edit" aria-label="Nom de la construction" value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && label.trim() && label.trim() !== build.label) void run(() => libraryApi.updateBuild(build.id, revision, { label }), 'Construction renommée (progression conservée).');
                if (e.key === 'Escape') setLabel(build.label);
              }} />
            <Pencil size={14} aria-hidden className="edit-hint" />
          </span>
          {label.trim() !== build.label && <button type="button" className="primary small" onClick={() => void run(() => libraryApi.updateBuild(build.id, revision, { label }), 'Construction renommée (progression conservée).')}>Enregistrer</button>}
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
          <span className="small num" data-testid="detail-progress">{build.progress?.placed ?? 0}/{build.snapshot.occurrenceCount} pièces posées</span>
        </div>
        {build.progress && (
          <p className="small muted progress-meta">
            {MODE_SHORT[build.progress.mode]} · {formatDate(build.progress.updatedAtIso)}
            {build.progress.free > 0 && (
              <span data-testid="detail-free">
                {' '}· {build.progress.free} posée(s) librement, {build.progress.atModel}/{build.snapshot.occurrenceCount} à leur place dans le modèle
              </span>
            )}
          </p>
        )}

        <ul className="mode-list small" data-testid="detail-modes" aria-label="Modes de construction">
          {(['synced', 'guided', 'freeManual'] as const).map((m) => (
            <li key={m} className={build.modes.includes(m) ? 'ok' : 'muted'}>
              {build.modes.includes(m) ? '✓' : '✗'} {MODE_SHORT[m]}
              {m === 'synced' && build.syncBlocker && <span className="muted"> — indisponible : {build.syncBlocker}</span>}
              {m === 'guided' && !build.modes.includes(m) && build.model.state === 'OK' && <span className="muted"> — pas d’étapes dans le fichier</span>}
            </li>
          ))}
        </ul>

        <div className="card-actions">
          {build.modes.length > 0
            ? <button type="button" className="button primary lg" onClick={() => router.push(`/atelier/${build.id}`)} data-testid="detail-build">{actionLabel(build)}</button>
            : <Note tone="error">Construction impossible tant que le modèle 3D n’est pas réparé.</Note>}
        </div>

        <details className="detail-section" open>
          <summary><FileBox size={16} aria-hidden /> Fichiers <span className={modelFile.state === 'OK' ? 'section-state ok' : 'section-state error'}>{FILE_STATE_LABEL[modelFile.state]}</span></summary>
          <ul className="plain">
            <FileLine file={modelFile}>{modelFile.state !== 'OK' && <RepairInput file={modelFile} accept=".mpd,.ldr" onRepaired={() => void refresh()} notify={notify} />}</FileLine>
          </ul>
          <div className="section-actions">
            <button type="button" className="secondary small" onClick={() => void check()} data-testid="detail-check"><ShieldCheck size={14} aria-hidden /> Vérifier les empreintes</button>
            {checking && <span className="small" data-testid="check-result">{checking}</span>}
          </div>
        </details>

        <details className="detail-section" open>
          <summary><BookOpen size={16} aria-hidden /> Notices <span className="section-state">{booklets.length}</span></summary>
          {booklets.length === 0 && <p className="small muted">Aucune notice associée : la notice synchronisée en a besoin.</p>}
          <ul className="plain">
            {booklets.map((b) => (
              <FileLine key={b.sha256} file={b}>
                <span className="row-actions">
                  {b.state !== 'OK' && <RepairInput file={b} accept=".pdf" onRepaired={() => void refresh()} notify={notify} />}
                  <label className="button ghost small">Remplacer
                    <input type="file" accept=".pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void replaceBooklet(b.sha256, f); e.target.value = ''; }} />
                  </label>
                  <ConfirmButton label="Dissocier" confirm="Dissocier cette notice (le fichier n’est pas supprimé) ?" onConfirm={() => void setBooklets(build.booklets.filter((x) => x.sha256 !== b.sha256).map((x) => x.sha256), 'Notice dissociée.')} />
                </span>
              </FileLine>
            ))}
          </ul>
          <div className="section-actions">
            <label className="button secondary small">
              <Plus size={14} aria-hidden /> Associer une ou plusieurs notices
              <input type="file" accept=".pdf" multiple hidden data-testid="detail-add-pdf" onChange={(e) => { const fs = [...(e.target.files ?? [])]; if (fs.length) void addBooklets(fs); e.target.value = ''; }} />
            </label>
          </div>
        </details>

        <details className="detail-section" open>
          <summary><Link2 size={16} aria-hidden /> Correspondances notice ↔ 3D
            {build.mapping && <span className={build.mapping.valid ? 'section-state ok' : 'section-state warn'}>{build.mapping.valid ? 'valides' : 'brouillon'}</span>}
          </summary>
          {build.mapping ? (
            <div className="small" data-testid="detail-mapping">
              <p className={build.mapping.valid ? 'ok' : 'warn'}>
                {build.mapping.valid ? '✓ Valides' : `Brouillon : ${build.mapping.firstError ?? 'incomplètes'}`} · {build.mapping.steps} étape(s) · {build.mapping.verified}/{build.mapping.steps} vérifiée(s) contre la notice · {build.mapping.assigned}/{build.mapping.total} pièces affectées
              </p>
              <ul className="plain">
                {build.mapping.booklets.map((b) => (
                  <li key={`${b.label}-${b.sha256}`} className={b.associated ? 'ok' : 'error'}>
                    {b.associated ? '✓' : '✗'} Livret « {b.label} » {b.associated ? 'associé' : `non associé (empreinte ${b.sha256?.slice(0, 12) ?? 'inconnue'}…)`}
                  </li>
                ))}
              </ul>
              <div className="section-actions">
                <button type="button" className="secondary small" onClick={() => void exportMapping()}><Download size={14} aria-hidden /> Exporter (.json)</button>
              </div>
            </div>
          ) : <p className="small muted">Aucune. Importe un fichier de correspondances, ou crée-les dans l’atelier (onglet Correspondances).</p>}
          <div className="section-actions">
            <label className="button secondary small">
              <Upload size={14} aria-hidden /> {build.mapping ? 'Remplacer par un fichier…' : 'Importer un fichier de correspondances'}
              <input type="file" accept=".json,application/json" hidden data-testid="detail-mapping-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importMapping(f); e.target.value = ''; }} />
            </label>
          </div>
        </details>

        {missing.length > 0 && <p className="small error">Pièces absentes de la bibliothèque LDraw locale : {missing.join(', ')}</p>}
        <details className="detail-section" open={compatProblem}>
          <summary><Stethoscope size={16} aria-hidden /> Compatibilité et diagnostics
            {model && <span className="section-state">{QUALITY[model.quality.quality]}</span>}
          </summary>
          <dl className="facts small">
            <dt>Pièces (fichier LDraw)</dt><dd>{build.snapshot.occurrenceCount}</dd>
            <dt>Références / couleurs</dt><dd>{build.snapshot.uniqueParts} / {build.snapshot.colours}</dd>
            <dt>Étapes LDraw</dt><dd>{build.snapshot.stepCount} ({build.snapshot.planKind})</dd>
            <dt>Modèle principal</dt><dd>{build.rootName}</dd>
            {model && <><dt>Qualité</dt><dd data-testid="detail-quality">{QUALITY[model.quality.quality]}</dd></>}
          </dl>
          <p className={`small inventory-${inventory.verdict}`}>{inventory.verdict === 'COHERENT' ? '✓ ' : '⚠ '}{inventory.message}</p>
          {(build.snapshot.errors + build.snapshot.warnings > 0 || model?.quality.reasons.length) && (
            <details className="small">
              <summary>Diagnostics ({build.snapshot.errors} erreur(s), {build.snapshot.warnings} avertissement(s))</summary>
              <ul>
                {model?.quality.reasons.map((r) => <li key={r}>{r}</li>)}
                {build.snapshot.diagnostics.map((d, i) => <li key={i} className={d.severity}>[{d.severity}] {d.message}{d.line ? ` (ligne ${d.line})` : ''}</li>)}
              </ul>
            </details>
          )}
        </details>

        <div className="danger-zone">
          <p className="small muted">Sa progression et ses correspondances iront dans library/trash (rien n’est effacé) ; les fichiers restent.</p>
          <button type="button" className="ghost small danger-text" data-testid="detail-remove" onClick={() => setConfirmRemove(true)}><Trash2 size={14} aria-hidden /> {removeLabel}</button>
          <ConfirmDialog open={confirmRemove} title={`${removeLabel} ?`} confirmLabel={removeLabel} confirmTestId="detail-remove-confirm"
            onCancel={() => setConfirmRemove(false)} onConfirm={() => { setConfirmRemove(false); void remove(); }}>
            <p>Sa progression et ses correspondances iront dans library/trash (rien n’est effacé) ; les fichiers restent.</p>
          </ConfirmDialog>
        </div>
      </div>
    </section>
  );
}

export default function SetDetail({ setId }: { setId: string }) {
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
  useEffect(() => void refresh(), [refresh]);
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
      if (a.model.occurrences.length === 0) throw new Error(`${f.name} : aucune pièce lue.`);
      const { file } = await libraryApi.upload('model', f);
      await libraryApi.addBuild(set.id, view.revision, {
        label: newLabel.trim() || `Modèle ${String.fromCharCode(65 + set.builds.length)}`, modelFileId: file.sha256, rootName: a.model.rootName,
        bookletFileIds: [],
      });
      setNewLabel('');
      notify('ok', 'Construction ajoutée à ce set.');
    } catch (e) {
      notify('error', e instanceof Error ? e.message : String(e));
    }
    await refresh();
  };

  const dirty = Boolean(set && (name.trim() !== set.name || number.trim() !== set.setNumber));
  const saveName = () => {
    if (!set || !view || !dirty) return;
    void libraryApi.updateSet(set.id, view.revision, { name: name.trim(), setNumber: number.trim() })
      .then(() => notify('ok', 'Set renommé : progression et correspondances conservées.'), (e: unknown) => notify('error', e instanceof Error ? e.message : String(e))).then(refresh);
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
      <AppBar crumbs={[{ label: 'Ma collection', href: '/', testId: 'back-to-collection' }, ...(set ? [{ label: `${set.setNumber} ${set.name}`, title: `${set.setNumber} ${set.name}` }] : [])]} />
      <main className="detail-main">
        {error && (
          <Note tone="error" role="alert">
            {error}{' '}
            <button type="button" className="link" onClick={() => void refresh()}><RefreshCw size={12} aria-hidden /> Réessayer</button>
          </Note>
        )}
        {!view && !error && <Loading>Chargement du set…</Loading>}
        {view && !set && (
          <EmptyState icon={<SearchX size={20} />} title="Ce set n’est pas (ou plus) dans ta collection."
            actions={<Link href="/" className="button primary">Retour à la collection</Link>} />
        )}
        {set && view && (
          <>
            <div className="detail-head">
              <span className="inline-edit-wrap">
                <input className="inline-edit setno" aria-label="Numéro du set" value={number} onChange={(e) => setNumber(e.target.value)} onKeyDown={editKeys} maxLength={32} data-testid="detail-number" />
              </span>
              <span className="inline-edit-wrap grow">
                <input className="inline-edit title" aria-label="Nom du set" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={editKeys} maxLength={120} data-testid="detail-name" />
                <Pencil size={16} aria-hidden className="edit-hint" />
              </span>
              {dirty && (
                <>
                  <button type="button" className="button primary small" data-testid="detail-save-name" onClick={saveName}>Enregistrer</button>
                  <button type="button" className="ghost small" onClick={() => { setName(set.name); setNumber(set.setNumber); }}>Annuler</button>
                </>
              )}
            </div>
            {set.builds.map((b) => <BuildPanel key={b.id} set={set} build={b} revision={view.revision} refresh={refresh} notify={notify} />)}
            <section className="add-build small" aria-labelledby="add-build-title">
              <h3 id="add-build-title"><Plus size={16} aria-hidden /> Modèle alternatif de cette boîte</h3>
              <p className="muted">Chaque modèle (par exemple les 3 modèles d’un Creator 3-en-1) est une construction distincte, avec sa progression, ses notices et ses correspondances.</p>
              <div className="add-build-row">
                <input placeholder="Nom (ex. Modèle B : buggy)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} maxLength={120} aria-label="Nom de la nouvelle construction" />
                <label className="button secondary small"><Upload size={14} aria-hidden /> Ajouter un modèle (.mpd / .ldr)
                  <input type="file" accept=".mpd,.ldr" hidden data-testid="detail-add-build" onChange={(e) => { const f = e.target.files?.[0]; if (f) void addAlternative(f); e.target.value = ''; }} />
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

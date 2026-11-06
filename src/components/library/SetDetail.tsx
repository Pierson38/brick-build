'use client';

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

type Notify = (kind: 'ok' | 'error', text: string) => void;

const QUALITY: Record<string, string> = {
  INVALID: 'Invalide', ANALYSABLE: 'Analysable (rendu incomplet ou non vérifié)', RENDERABLE: 'Affichable', MANUAL_ONLY: 'Montage libre uniquement (pas d’étapes)', GUIDED_PLAYABLE: 'Jouable avec étapes 3D',
};

/** Two clicks: the action runs only after an explicit confirmation. */
function ConfirmButton({ label, confirm, onConfirm, testId }: { label: string; confirm: string; onConfirm: () => void; testId?: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className="danger small" onClick={() => setAsking(true)} data-testid={testId}>{label}</button>;
  return (
    <span className="confirm small">
      {confirm}{' '}
      <button type="button" className="danger small" onClick={() => { setAsking(false); onConfirm(); }} data-testid={testId ? `${testId}-confirm` : undefined}>Confirmer</button>
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
    <label className="button secondary small">
      Réparer : choisir le fichier d’origine
      <input type="file" accept={accept} hidden data-testid={`repair-${file.sha256.slice(0, 8)}`} onChange={(e) => { const f = e.target.files?.[0]; if (f) void repair(f); e.target.value = ''; }} />
    </label>
  );
}

function FileLine({ file, children }: { file: FileView; children?: React.ReactNode }) {
  return (
    <li className={`file-line state-${file.state}`} data-testid={`file-${file.kind}`}>
      <span>{file.originalName}</span>
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

  return (
    <section className="build-panel" data-testid={`build-${build.id}`} aria-label={build.label}>
      <div className="build-preview">
        {model ? (
          <ModelPreview model={model} {...(!build.hasThumbnail ? { onThumbnail: (png: Blob) => void libraryApi.putThumbnail(build.id, png).then(refresh, () => undefined) } : {})} />
        ) : (
          <div className="preview3d empty"><p className="small muted">{loading ? 'Chargement de l’aperçu 3D…' : error ?? 'Aperçu indisponible.'}</p></div>
        )}
      </div>
      <div className="build-info">
        <div className="build-head">
          <input className="inline-edit" aria-label="Nom de la construction" value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} />
          {label.trim() !== build.label && <button type="button" className="small" onClick={() => void run(() => libraryApi.updateBuild(build.id, revision, { label }), 'Construction renommée (progression conservée).')}>Enregistrer</button>}
          <StatusBadge status={build.status} />
        </div>
        <div className="progress-line">
          <ProgressBar placed={build.progress?.placed ?? 0} total={build.snapshot.occurrenceCount} />
          <span className="small" data-testid="detail-progress">{build.progress?.placed ?? 0}/{build.snapshot.occurrenceCount} pièces posées</span>
          {build.progress && <span className="small muted">· {MODE_SHORT[build.progress.mode]} · {formatDate(build.progress.updatedAtIso)}</span>}
          {build.progress && build.progress.free > 0 && (
            <span className="small muted" data-testid="detail-free">
              · {build.progress.free} posée(s) librement, {build.progress.atModel}/{build.snapshot.occurrenceCount} à leur place dans le modèle
            </span>
          )}
        </div>
        {model && (
          <BrowserSavePanel buildId={build.id} modelSha={build.model.sha256} rootName={build.rootName} fileName={build.model.originalName}
            occurrences={model.analysis.model.occurrences} libraryRevision={build.progress?.revision ?? null} onDone={() => void refresh()} notify={notify} />
        )}
        <div className="card-actions">
          {build.modes.length > 0
            ? <button type="button" className="button primary" onClick={() => router.push(`/atelier/${build.id}`)} data-testid="detail-build">{actionLabel(build)}</button>
            : <span className="error small">Construction impossible tant que le modèle 3D n’est pas réparé.</span>}
        </div>

        <h3>Modes de construction</h3>
        <ul className="plain small" data-testid="detail-modes">
          {(['synced', 'guided', 'freeManual'] as const).map((m) => (
            <li key={m} className={build.modes.includes(m) ? 'ok' : 'muted'}>
              {build.modes.includes(m) ? '✓' : '✗'} {MODE_SHORT[m]}
              {m === 'synced' && build.syncBlocker && <span className="muted"> — indisponible : {build.syncBlocker}</span>}
              {m === 'guided' && !build.modes.includes(m) && build.model.state === 'OK' && <span className="muted"> — pas d’étapes dans le fichier</span>}
            </li>
          ))}
        </ul>

        {build.problems.length > 0 && <ul className="plain small" role="alert" data-testid="detail-problems">{build.problems.map((p) => <li key={p} className="error">⚠ {p}</li>)}</ul>}

        <h3>Fichiers</h3>
        <ul className="plain">
          <FileLine file={modelFile}>{modelFile.state !== 'OK' && <RepairInput file={modelFile} accept=".mpd,.ldr" onRepaired={() => void refresh()} notify={notify} />}</FileLine>
        </ul>
        <button type="button" className="small" onClick={() => void check()} data-testid="detail-check">Vérifier les empreintes</button>
        {checking && <p className="small" data-testid="check-result">{checking}</p>}

        <h3>Notices ({booklets.length})</h3>
        <ul className="plain">
          {booklets.map((b) => (
            <FileLine key={b.sha256} file={b}>
              <span className="row-actions">
                {b.state !== 'OK' && <RepairInput file={b} accept=".pdf" onRepaired={() => void refresh()} notify={notify} />}
                <label className="button secondary small">Remplacer
                  <input type="file" accept=".pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void replaceBooklet(b.sha256, f); e.target.value = ''; }} />
                </label>
                <ConfirmButton label="Dissocier" confirm="Dissocier cette notice (le fichier n’est pas supprimé) ?" onConfirm={() => void setBooklets(build.booklets.filter((x) => x.sha256 !== b.sha256).map((x) => x.sha256), 'Notice dissociée.')} />
              </span>
            </FileLine>
          ))}
        </ul>
        <label className="button secondary small">
          Associer une ou plusieurs notices
          <input type="file" accept=".pdf" multiple hidden data-testid="detail-add-pdf" onChange={(e) => { const fs = [...(e.target.files ?? [])]; if (fs.length) void addBooklets(fs); e.target.value = ''; }} />
        </label>

        <h3>Correspondances notice ↔ 3D</h3>
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
            <button type="button" className="small" onClick={() => void exportMapping()}>Exporter (.json)</button>
          </div>
        ) : <p className="small muted">Aucune. Importe un fichier de correspondances, ou crée-les dans l’atelier (onglet Correspondances).</p>}
        <label className="button secondary small">
          {build.mapping ? 'Remplacer par un fichier…' : 'Importer un fichier de correspondances'}
          <input type="file" accept=".json,application/json" hidden data-testid="detail-mapping-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importMapping(f); e.target.value = ''; }} />
        </label>

        <h3>Compatibilité</h3>
        <dl className="facts small">
          <dt>Pièces (fichier LDraw)</dt><dd>{build.snapshot.occurrenceCount}</dd>
          <dt>Références / couleurs</dt><dd>{build.snapshot.uniqueParts} / {build.snapshot.colours}</dd>
          <dt>Étapes LDraw</dt><dd>{build.snapshot.stepCount} ({build.snapshot.planKind})</dd>
          <dt>Modèle principal</dt><dd>{build.rootName}</dd>
          {model && <><dt>Qualité</dt><dd data-testid="detail-quality">{QUALITY[model.quality.quality]}</dd></>}
        </dl>
        <p className={`small inventory-${inventory.verdict}`}>{inventory.verdict === 'COHERENT' ? '✓ ' : '⚠ '}{inventory.message}</p>
        {missing.length > 0 && <p className="small error">Pièces absentes de la bibliothèque LDraw locale : {missing.join(', ')}</p>}
        {(build.snapshot.errors + build.snapshot.warnings > 0 || model?.quality.reasons.length) && (
          <details className="small">
            <summary>Diagnostics ({build.snapshot.errors} erreur(s), {build.snapshot.warnings} avertissement(s))</summary>
            <ul>
              {model?.quality.reasons.map((r) => <li key={r}>{r}</li>)}
              {build.snapshot.diagnostics.map((d, i) => <li key={i} className={d.severity}>[{d.severity}] {d.message}{d.line ? ` (ligne ${d.line})` : ''}</li>)}
            </ul>
          </details>
        )}
        <div className="danger-zone">
          <ConfirmButton
            label={set.builds.length > 1 ? 'Retirer cette construction' : 'Retirer le set de la collection'}
            confirm="Sa progression et ses correspondances iront dans library/trash (rien n’est effacé) ; les fichiers restent."
            testId="detail-remove"
            onConfirm={() => void (async () => {
              try {
                if (set.builds.length > 1) await libraryApi.removeBuild(build.id, revision);
                else await libraryApi.removeSet(set.id, revision);
                if (set.builds.length > 1) await refresh();
                else router.push('/');
              } catch (e) {
                notify('error', e instanceof Error ? e.message : String(e));
              }
            })()}
          />
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

  return (
    <div className="detail">
      <header className="topbar">
        <Link href="/" data-testid="back-to-collection">← Ma collection</Link>
        {set && <span className="muted">{set.setNumber} · {set.name}</span>}
      </header>
      <main className="detail-main">
        {error && <p className="banner error" role="alert">{error}</p>}
        {view && !set && <p>Ce set n’est pas (ou plus) dans ta collection. <Link href="/">Retour à la collection</Link></p>}
        {set && view && (
          <>
            <div className="detail-head">
              <input className="inline-edit setno" aria-label="Numéro du set" value={number} onChange={(e) => setNumber(e.target.value)} maxLength={32} data-testid="detail-number" />
              <input className="inline-edit title" aria-label="Nom du set" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} data-testid="detail-name" />
              {(name.trim() !== set.name || number.trim() !== set.setNumber) && (
                <button type="button" className="button primary small" data-testid="detail-save-name"
                  onClick={() => void libraryApi.updateSet(set.id, view.revision, { name: name.trim(), setNumber: number.trim() }).then(() => notify('ok', 'Set renommé : progression et correspondances conservées.'), (e: unknown) => notify('error', e instanceof Error ? e.message : String(e))).then(refresh)}>
                  Enregistrer
                </button>
              )}
            </div>
            {set.builds.map((b) => <BuildPanel key={b.id} set={set} build={b} revision={view.revision} refresh={refresh} notify={notify} />)}
            <section className="add-build small">
              <h3>Modèle alternatif de cette boîte</h3>
              <p className="muted">Chaque modèle (par exemple les 3 modèles d’un Creator 3-en-1) est une construction distincte, avec sa progression, ses notices et ses correspondances.</p>
              <input placeholder="Nom (ex. Modèle B : buggy)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} maxLength={120} aria-label="Nom de la nouvelle construction" />
              {' '}<label className="button secondary small">Ajouter un modèle (.mpd / .ldr)
                <input type="file" accept=".mpd,.ldr" hidden data-testid="detail-add-build" onChange={(e) => { const f = e.target.files?.[0]; if (f) void addAlternative(f); e.target.value = ''; }} />
              </label>
            </section>
          </>
        )}
      </main>
      {toast && <div className={`toast ${toast.kind} fixed`} role="status" data-testid="detail-message" onClick={() => setToast(null)}>{toast.text}</div>}
    </div>
  );
}

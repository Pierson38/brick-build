'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NOTICE_WITHOUT_MODEL } from '@/domain/library/compatibility';
import type { FileRef, ImportResult, LocalLookup, OnlineLookup, PreparedImport } from '@/domain/library/import-types';
import { parseSetNumber } from '@/domain/library/set-number';
import type { FileKind } from '@/domain/library/types';
import { ApiError, libraryApi } from '@/infra/library/api';
import { Check, CircleAlert, CircleCheck, FolderOpen, Hammer, Hash, Info, LoaderCircle, RotateCcw, Search, ShieldCheck, TriangleAlert, Upload } from 'lucide-react';
import type { ReactNode } from 'react';
import { AppBar } from '../../ui/AppBar';
import { ModeChips } from '../labels';
import { ResourcesPanel } from './ResourcesPanel';
import { EMPTY_SELECTION, importBuilds, selectedBuilds, withDefaults, type BuildChoice, type Selection } from './selection';
import { SourcesPanel } from './SourcesPanel';

/**
 * P8 "Ajouter un set": Recherche → Ressources → Compatibilité → Confirmation → Construction.
 * Two entries: a set number (data folder, then the OMR on click), or the quick local import of
 * several files at once (works offline). Nothing is added to the collection before confirmation.
 */

interface Picked { readonly kind: FileKind; readonly ref: FileRef }

const kindOf = (name: string): FileKind | null => (/\.(mpd|ldr)$/i.test(name) ? 'model' : /\.pdf$/i.test(name) ? 'pdf' : /\.json$/i.test(name) ? 'mapping' : null);
const GENERIC_TITLE = /^(main|model|untitled)?$/i;
const LINE_ICON: Record<string, ReactNode> = {
  ok: <CircleCheck size={14} aria-hidden />, warn: <TriangleAlert size={14} aria-hidden />, error: <CircleAlert size={14} aria-hidden />, info: <Info size={14} aria-hidden />,
};

export default function AddSetPage() {
  const [number, setNumber] = useState('');
  const [local, setLocal] = useState<LocalLookup | null>(null);
  const [online, setOnline] = useState<OnlineLookup | null>(null);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState<string[]>([]);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [extraRoots, setExtraRoots] = useState<{ sha256: string; rootName: string }[]>([]);
  const [prepared, setPrepared] = useState<PreparedImport | null>(null);
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [target, setTarget] = useState<string>('new');
  const [allowSame, setAllowSame] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const round = useRef(0);

  const parsed = useMemo(() => (number.trim() ? parseSetNumber(number) : null), [number]);
  const effectiveNumber = parsed?.ok ? parsed.value.canonical : prepared?.models.find((m) => m.setNumberInName)?.setNumberInName ?? '';

  const addPicked = (items: Picked[]) => setPicked((cur) => [...cur, ...items.filter((i) => !cur.some((c) => c.ref.sha256 === i.ref.sha256))]);

  // every change of the selected files is measured again by the server (read-only)
  useEffect(() => {
    const id = ++round.current;
    if (picked.length === 0) {
      setPrepared(null);
      return;
    }
    setBusy('Analyse des fichiers…');
    libraryApi.prepare({ ...(effectiveNumber ? { setNumber: effectiveNumber } : {}), files: picked, extraRoots })
      .then((p) => {
        if (id !== round.current) return;
        setPrepared(p);
        setSelection((s) => withDefaults(p, s));
      }, (e: unknown) => id === round.current && setErrors((x) => [...x, e instanceof Error ? e.message : String(e)]))
      .finally(() => id === round.current && setBusy(null));
  }, [picked, extraRoots, effectiveNumber]);

  // default name: Rebrickable, then the OMR page, then the model title
  useEffect(() => {
    if (nameTouched) return;
    const title = prepared?.models.find((m) => !GENERIC_TITLE.test(m.title.trim()) && !/_/.test(m.name))?.title;
    setName(online?.rebrickable.set?.name ?? online?.omr.setName ?? prepared?.existingSets[0]?.name ?? title ?? '');
  }, [online, prepared, nameTouched]);

  const existing = prepared?.existingSets ?? local?.existingSets ?? [];
  useEffect(() => {
    if (existing.length > 0 && target === 'new' && !allowSame) setTarget(existing[0]!.id);
  }, [existing, target, allowSame]);

  const search = async () => {
    setErrors([]);
    setResult(null);
    if (!parsed?.ok) return setErrors([parsed?.error ?? 'Saisis un numéro de set, par exemple 31040.']);
    setBusy('Recherche…');
    try {
      const l = await libraryApi.lookup(parsed.value.canonical);
      setLocal(l);
      setOnline(null);
      setDownloaded([]);
      setNumber(l.setNumber.canonical);
      // a new search replaces the data-folder files of the previous one; dropped or downloaded files stay
      const found: Picked[] = l.refs.map((ref) => ({ kind: ref.origin === 'discovered' && ref.rel.startsWith('instructions/') ? 'pdf' : 'model', ref }));
      setPicked((cur) => [...cur.filter((c) => c.ref.origin !== 'discovered' && !found.some((f) => f.ref.sha256 === c.ref.sha256)), ...found]);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)]);
    } finally {
      setBusy(null);
    }
  };

  const searchOnline = async () => {
    if (!local) return;
    setOnlineBusy(true);
    try {
      setOnline(await libraryApi.lookupOnline(local.setNumber.canonical));
    } catch (e) {
      setErrors((x) => [...x, e instanceof Error ? e.message : String(e)]);
    } finally {
      setOnlineBusy(false);
    }
  };

  const download = async (url: string, pageUrl: string | null) => {
    setDownloading(url);
    try {
      const { file } = await libraryApi.downloadOmr(url, pageUrl);
      setDownloaded((d) => [...d, url]);
      addPicked([{ kind: 'model', ref: { origin: 'staged', sha256: file.sha256 } }]);
    } catch (e) {
      setErrors((x) => [...x, e instanceof Error ? e.message : String(e)]);
    } finally {
      setDownloading(null);
    }
  };

  const quickImport = async (files: File[]) => {
    setResult(null);
    const problems: string[] = [];
    const items: Picked[] = [];
    for (const [i, f] of files.entries()) {
      const kind = kindOf(f.name);
      if (!kind) {
        problems.push(`${f.name} : format non pris en charge (.mpd, .ldr, .pdf ou .brick-mapping.json).`);
        continue;
      }
      setBusy(`Préparation des fichiers (${i + 1}/${files.length})…`);
      try {
        const { file } = await libraryApi.stage(kind, f);
        items.push({ kind, ref: { origin: 'staged', sha256: file.sha256 } });
      } catch (e) {
        problems.push(e instanceof ApiError || e instanceof Error ? `${f.name} : ${e.message}` : String(e));
      }
    }
    setBusy(null);
    setErrors(problems);
    addPicked(items);
  };

  const reset = () => {
    setNumber('');
    setLocal(null);
    setOnline(null);
    setDownloaded([]);
    setPicked([]);
    setExtraRoots([]);
    setSelection(EMPTY_SELECTION);
    setErrors([]);
    setName('');
    setNameTouched(false);
    setTarget('new');
    setAllowSame(false);
    setResult(null);
  };

  const remove = (sha: string) => setPicked((cur) => cur.filter((p) => p.ref.sha256 !== sha));
  const change = useCallback((key: string, patch: Partial<BuildChoice>) => setSelection((s) => ({ ...s, builds: { ...s.builds, [key]: { ...s.builds[key]!, ...patch } } })), []);

  const builds = prepared ? selectedBuilds(prepared, selection) : [];
  const targetSet = existing.find((s) => s.id === target);
  const numberOk = parseSetNumber(effectiveNumber).ok;
  const blocker = !prepared ? null
    : builds.length === 0 ? (prepared.models.length === 0 ? null : 'Coche au moins une construction.')
      : builds.some((b) => !b.choice.label.trim()) ? 'Donne un nom à chaque construction.'
        : !targetSet && !numberOk ? 'Saisis le numéro du set.'
          : !targetSet && !name.trim() ? 'Donne un nom au set.'
            : null;

  const confirm = async () => {
    if (!prepared || blocker) return;
    setBusy('Ajout à la collection…');
    setErrors([]);
    try {
      const r = await libraryApi.importSet({
        target: targetSet ? { type: 'existing', setId: targetSet.id } : { type: 'new', setNumber: effectiveNumber, name: name.trim(), allowSameNumber: allowSame },
        builds: importBuilds(prepared, selection),
      });
      setResult(r);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)]);
    } finally {
      setBusy(null);
    }
  };

  // where the user is: 1 files, 2 checking, 3 confirmation, 4 ready (the sections stay on one page)
  const stage = result ? 4 : prepared && (builds.length > 0 || existing.length > 0) ? 3 : prepared ? 2 : 1;
  const STAGES = ['Fichiers', 'Vérification', 'Confirmation', 'Prêt'] as const;

  return (
    <div className="collection add-page">
      <AppBar crumbs={[{ label: 'Ma collection', href: '/', testId: 'back-to-collection' }, { label: 'Ajouter un set' }]}>
        {busy && <span className="small muted busy" role="status" data-testid="busy"><LoaderCircle className="spinner" size={16} aria-hidden /> {busy}</span>}
      </AppBar>
      <main className="collection-main add-main" id="contenu">
        <div className="add-intro">
          <h1>Ajouter un set</h1>
          <ol className="stepper" aria-label="Étapes de l’ajout">
            {STAGES.map((label, i) => (
              <li key={label} className={i + 1 < stage ? 'done' : i + 1 === stage ? 'current' : 'todo'} aria-current={i + 1 === stage ? 'step' : undefined}>
                <span className="dot" aria-hidden>{i + 1 < stage ? <Check size={12} /> : i + 1}</span>{label}
              </li>
            ))}
          </ol>
        </div>

        {!result && (
          <section className="add-panel" data-testid="search" aria-labelledby="step-files">
            <h2 id="step-files"><span className="step-no">1</span> Fichiers</h2>
            <div className="entry-ways">
              <div className="entry-way">
                <h3><Hash size={16} aria-hidden /> Par numéro de set</h3>
                <form className="search-row" onSubmit={(e) => { e.preventDefault(); void search(); }}>
                  <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Numéro du set, ex. 31040" aria-label="Numéro du set" data-testid="search-number" autoFocus />
                  <button type="submit" className="button primary" disabled={busy !== null} data-testid="search-submit"><Search size={16} aria-hidden /> Rechercher</button>
                </form>
                <p className="small muted">Cherche d’abord dans ton dossier de données ; Internet n’est contacté que si tu le demandes ensuite.</p>
                {((parsed?.ok && parsed.value.variantPresumed) || (local?.setNumber.variantPresumed && local.setNumber.canonical === effectiveNumber)) && (
                  <p className="small muted" data-testid="variant-note">Lu comme {effectiveNumber} (variante -1 supposée ; saisis par exemple {effectiveNumber.replace(/-\d+$/, '-2')} pour une autre variante de la boîte).</p>
                )}
              </div>
              <div className={`dropzone${dragging ? ' over' : ''}`} data-testid="dropzone"
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); void quickImport([...e.dataTransfer.files]); }}>
                <span className="drop-icon" aria-hidden><Upload size={20} /></span>
                <strong>Import local rapide</strong>
                <span className="small muted">Dépose ici, en une fois, tes fichiers .mpd, .ldr, .pdf et .brick-mapping.json (fonctionne sans Internet).</span>
                <label className="button secondary small">
                  <FolderOpen size={16} aria-hidden /> Choisir des fichiers
                  <input type="file" multiple hidden accept=".mpd,.ldr,.pdf,application/pdf,.json,application/json" data-testid="quick-input" onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; if (fs.length) void quickImport(fs); }} />
                </label>
              </div>
            </div>
            {errors.length > 0 && <ul className="plain small note error" role="alert" data-testid="add-errors">{errors.map((e, i) => <li key={i} className="error">{e}</li>)}</ul>}
            {local && <SourcesPanel local={local} online={online} onlineBusy={onlineBusy} downloading={downloading} downloaded={downloaded} onSearchOnline={() => void searchOnline()} onDownload={(u, p) => void download(u, p)} />}
            {local && !prepared && picked.length === 0 && online && online.omr.models.length === 0 && <p className="warn" data-testid="nothing-found">Aucun modèle 3D trouvé pour ce set. Tu peux ajouter un fichier toi-même avec l’import rapide.</p>}
          </section>
        )}
        {result && errors.length > 0 && <ul className="plain small note error" role="alert" data-testid="add-errors">{errors.map((e, i) => <li key={i} className="error">{e}</li>)}</ul>}

        {prepared && !result && (
          <section className="add-panel" aria-labelledby="step-check">
            <h2 id="step-check"><span className="step-no">2</span> Vérification</h2>
            <ResourcesPanel prepared={prepared} selection={selection} onChange={change} onRemove={remove} onExtraRoot={(sha, rootName) => setExtraRoots((r) => [...r, { sha256: sha, rootName }])} />
            {builds.length > 0 && (
              <div className="compat-list" data-testid="compatibility">
                <h3>Compatibilité</h3>
                {builds.map((b) => (
                  <div key={b.row.key} className="compat" data-testid="compat-card">
                    <div className="model-row"><strong>{b.choice.label}</strong> <span className="small muted num">{b.row.root.occurrenceCount} pièces</span> <ModeChips modes={b.sheet.modes} /></div>
                    <p className="compat-headline" data-testid="compat-headline">{b.sheet.headline}</p>
                    <ul className="plain small compat-lines">{b.sheet.lines.map((l, i) => <li key={i} className={l.level === 'ok' ? 'ok' : l.level === 'warn' ? 'warning' : l.level === 'error' ? 'error' : 'info'}>{LINE_ICON[l.level]}<span>{l.text}</span></li>)}</ul>
                  </div>
                ))}
              </div>
            )}
            {prepared.models.length === 0 && prepared.pdfs.length > 0 && <p className="warn" data-testid="pdf-only">{NOTICE_WITHOUT_MODEL}</p>}
          </section>
        )}

        {prepared && !result && (builds.length > 0 || existing.length > 0) && (
          <section className="add-panel" data-testid="confirm" aria-labelledby="step-confirm">
            <h2 id="step-confirm"><span className="step-no">3</span> Confirmation</h2>
            {existing.length > 0 && (
              <div className="warn small" data-testid="existing-set">
                Ce set est déjà dans ta collection : {existing.map((s) => `${s.setNumber} « ${s.name} » (${s.builds.length} construction${s.builds.length > 1 ? 's' : ''})`).join(', ')}.
                <label className="block"><input type="radio" name="target" checked={target === existing[0]!.id} onChange={() => { setTarget(existing[0]!.id); setAllowSame(false); }} data-testid="target-existing" /> Ajouter les constructions cochées à ce set (construction alternative) — sa progression n’est pas touchée</label>
                <label className="block"><input type="radio" name="target" checked={target === 'new'} onChange={() => { setTarget('new'); setAllowSame(true); }} data-testid="target-new" /> Créer quand même un second set avec ce numéro</label>
              </div>
            )}
            {!targetSet && (
              <div className="form-grid">
                <label>Numéro
                  <input value={effectiveNumber} readOnly={parsed?.ok === true} onChange={(e) => setNumber(e.target.value)} data-testid="confirm-number" placeholder="31040-1" />
                </label>
                <label>Nom du set
                  <input value={name} maxLength={120} onChange={(e) => { setName(e.target.value); setNameTouched(true); }} data-testid="confirm-name" placeholder="Desert Racers" />
                </label>
              </div>
            )}
            <p className="small muted"><ShieldCheck size={14} aria-hidden className="inline-icon" /> Les fichiers ajoutés sont copiés dans <code>library/</code> et identifiés par leur SHA-256 ; ceux du dossier de données restent en place. Aucun de tes fichiers n’est envoyé hors de ce Mac (Internet ne sert qu’aux recherches et téléchargements que tu demandes).</p>
          </section>
        )}

        {result && (
          <section className="add-panel done" data-testid="import-done" aria-labelledby="step-done">
            <span className="done-icon" aria-hidden><Check size={22} /></span>
            <h2 id="step-done">{result.created.length > 0 ? 'Ajouté à ta collection' : 'Déjà dans ta collection'}</h2>
            {result.alreadyPresent.length > 0 && <p className="small" data-testid="already-present">Ce modèle existe déjà dans ta collection : {result.alreadyPresent.map((b) => `« ${b.label} »`).join(', ')} (rien n’a été dupliqué, la progression est conservée).</p>}
            {result.mappingsKept.length > 0 && <p className="small">Correspondances existantes conservées pour {result.mappingsKept.join(', ')} (non remplacées).</p>}
            <p className="small muted">{result.filesAdded} fichier(s) ajouté(s), {result.filesReused} déjà présent(s).</p>
            <div className="card-actions">
              {[...result.created, ...result.alreadyPresent].slice(0, 4).map((b) => <Link key={b.id} className="button primary lg" href={`/atelier/${b.id}`} data-testid="import-build"><Hammer size={16} aria-hidden /> Construire « {b.label} »</Link>)}
              <Link className="button secondary" href={`/sets/${result.setId}`}>Voir le set</Link>
              <Link className="button ghost" href="/">Ma collection</Link>
              <button type="button" className="ghost" onClick={reset} data-testid="add-another"><RotateCcw size={16} aria-hidden /> Ajouter un autre set</button>
            </div>
          </section>
        )}
      </main>

      {prepared && !result && (builds.length > 0 || existing.length > 0) && (
        <div className="action-bar" role="region" aria-label="Action principale">
          <div className="action-bar-inner">
            {blocker
              ? <p className="small error" data-testid="confirm-blocker">{blocker}</p>
              : <p className="small muted">{builds.length} construction(s) prête(s) · {targetSet ? `ajout à ${targetSet.setNumber}` : `nouveau set ${effectiveNumber}`}</p>}
            <span className="spacer" />
            <button type="button" className="button primary lg" disabled={busy !== null || blocker !== null || builds.length === 0} onClick={() => void confirm()} data-testid="import-submit">
              {targetSet ? `Ajouter ${builds.length} construction(s) à ${targetSet.setNumber}` : 'Ajouter à ma collection'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

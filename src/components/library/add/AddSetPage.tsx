'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NOTICE_WITHOUT_MODEL } from '@/domain/library/compatibility';
import type { FileRef, ImportResult, LocalLookup, OnlineLookup, PreparedImport } from '@/domain/library/import-types';
import { parseSetNumber } from '@/domain/library/set-number';
import type { FileKind } from '@/domain/library/types';
import { ApiError, libraryApi } from '@/infra/library/api';
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

  return (
    <div className="collection add-page">
      <header className="topbar">
        <Link href="/" className="button secondary small">← Ma collection</Link>
        <strong>Ajouter un set</strong>
        <span className="spacer" />
        {busy && <span className="small muted" role="status" data-testid="busy">{busy}</span>}
      </header>
      <main className="collection-main add-main">
        <section className="add-panel" data-testid="search">
          <h2>Recherche</h2>
          <form className="search-row" onSubmit={(e) => { e.preventDefault(); void search(); }}>
            <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Numéro du set, ex. 31040" aria-label="Numéro du set" data-testid="search-number" autoFocus />
            <button type="submit" className="button primary" disabled={busy !== null} data-testid="search-submit">Rechercher</button>
          </form>
          {((parsed?.ok && parsed.value.variantPresumed) || (local?.setNumber.variantPresumed && local.setNumber.canonical === effectiveNumber)) && (
            <p className="small muted" data-testid="variant-note">Lu comme {effectiveNumber} (variante -1 supposée ; saisis par exemple {effectiveNumber.replace(/-\d+$/, '-2')} pour une autre variante de la boîte).</p>
          )}
          <div className={`dropzone${dragging ? ' over' : ''}`} data-testid="dropzone"
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); void quickImport([...e.dataTransfer.files]); }}>
            <strong>Import local rapide</strong>
            <span className="small muted">Dépose ici, en une fois, tes fichiers .mpd, .ldr, .pdf et .brick-mapping.json (fonctionne sans Internet).</span>
            <label className="button secondary small">
              Choisir des fichiers
              <input type="file" multiple hidden accept=".mpd,.ldr,.pdf,application/pdf,.json,application/json" data-testid="quick-input" onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; if (fs.length) void quickImport(fs); }} />
            </label>
          </div>
          {errors.length > 0 && <ul className="plain small" role="alert" data-testid="add-errors">{errors.map((e, i) => <li key={i} className="error">{e}</li>)}</ul>}
        </section>

        {local && !result && <SourcesPanel local={local} online={online} onlineBusy={onlineBusy} downloading={downloading} downloaded={downloaded} onSearchOnline={() => void searchOnline()} onDownload={(u, p) => void download(u, p)} />}
        {local && !prepared && picked.length === 0 && online && online.omr.models.length === 0 && <p className="warn" data-testid="nothing-found">Aucun modèle 3D trouvé pour ce set. Tu peux ajouter un fichier toi-même avec l’import rapide.</p>}

        {prepared && !result && <ResourcesPanel prepared={prepared} selection={selection} onChange={change} onRemove={remove} onExtraRoot={(sha, rootName) => setExtraRoots((r) => [...r, { sha256: sha, rootName }])} />}

        {prepared && !result && builds.length > 0 && (
          <section className="add-panel" data-testid="compatibility">
            <h2>Compatibilité</h2>
            {builds.map((b) => (
              <div key={b.row.key} className="compat" data-testid="compat-card">
                <div className="model-row"><strong>{b.choice.label}</strong> <span className="small muted">{b.row.root.occurrenceCount} pièces</span> <ModeChips modes={b.sheet.modes} /></div>
                <p className="compat-headline" data-testid="compat-headline">{b.sheet.headline}</p>
                <ul className="plain small">{b.sheet.lines.map((l, i) => <li key={i} className={l.level === 'ok' ? 'ok' : l.level === 'warn' ? 'warning' : l.level === 'error' ? 'error' : 'info'}>{l.text}</li>)}</ul>
              </div>
            ))}
          </section>
        )}
        {prepared && prepared.models.length === 0 && prepared.pdfs.length > 0 && <p className="warn" data-testid="pdf-only">{NOTICE_WITHOUT_MODEL}</p>}

        {prepared && !result && (builds.length > 0 || existing.length > 0) && (
          <section className="add-panel" data-testid="confirm">
            <h2>Confirmation</h2>
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
            <p className="small muted">Les fichiers ajoutés sont copiés dans <code>library/</code> et identifiés par leur SHA-256 ; ceux du dossier de données restent en place. Aucun de tes fichiers n’est envoyé hors de ce Mac (Internet ne sert qu’aux recherches et téléchargements que tu demandes).</p>
            {blocker && <p className="small error" data-testid="confirm-blocker">{blocker}</p>}
            <button type="button" className="button primary" disabled={busy !== null || blocker !== null || builds.length === 0} onClick={() => void confirm()} data-testid="import-submit">
              {targetSet ? `Ajouter ${builds.length} construction(s) à ${targetSet.setNumber}` : 'Ajouter à ma collection'}
            </button>
          </section>
        )}

        {result && (
          <section className="add-panel done" data-testid="import-done">
            <h2>{result.created.length > 0 ? 'Ajouté à ta collection' : 'Déjà dans ta collection'}</h2>
            {result.alreadyPresent.length > 0 && <p className="small" data-testid="already-present">Ce modèle existe déjà dans ta collection : {result.alreadyPresent.map((b) => `« ${b.label} »`).join(', ')} (rien n’a été dupliqué, la progression est conservée).</p>}
            {result.mappingsKept.length > 0 && <p className="small">Correspondances existantes conservées pour {result.mappingsKept.join(', ')} (non remplacées).</p>}
            <p className="small muted">{result.filesAdded} fichier(s) ajouté(s), {result.filesReused} déjà présent(s).</p>
            <div className="card-actions">
              {[...result.created, ...result.alreadyPresent].slice(0, 4).map((b) => <Link key={b.id} className="button primary" href={`/atelier/${b.id}`} data-testid="import-build">Construire « {b.label} »</Link>)}
              <Link className="button secondary" href={`/sets/${result.setId}`}>Voir le set</Link>
              <Link className="button secondary" href="/">Ma collection</Link>
              <button type="button" className="button secondary" onClick={reset} data-testid="add-another">Ajouter un autre set</button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

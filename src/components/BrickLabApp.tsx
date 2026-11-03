'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  activeStepIndex, availableModes, candidates, createSession, describeFailure, isComplete, placeExact,
  resetActiveStep, tray, trayKey, tryPlace, undo, type BuildContext, type BuildMode, type BuildSession, type TrayItem,
} from '@/domain/build/engine';
import { restoreProgress, serializeProgress } from '@/domain/build/progress';
import { analyzeModel, classifyImport, sha256Hex, type ModelAnalysis, type QualityReport } from '@/domain/import/analyze';
import type { Matrix4Tuple } from '@/domain/ldraw/types';
import { loadModelGeometry, PartCatalog, type GeometryLoadResult } from '@/infra/ldraw/part-catalog';
import { clearProgress, listRecentSessions, loadStoredProgress, saveProgress, type RecentSession } from '@/infra/persistence/local-progress';
import { PartsTray } from './build/PartsTray';
import { ModelSummary } from './import/ModelSummary';
import { PdfPanel } from './pdf/PdfPanel';
import { BuildCanvas, type HeldBrick } from './three/BuildCanvas';

const MAX_MODEL_BYTES = 8 * 1024 * 1024;

interface LoadedModel {
  readonly fileName: string;
  readonly text: string;
  readonly hash: string;
  readonly analysis: ModelAnalysis;
  readonly geometry: GeometryLoadResult | null;
  readonly libraryProblem: string | null;
  readonly quality: QualityReport;
}

type Message = { kind: 'ok' | 'error' | 'info'; text: string } | null;

async function libraryStatus(): Promise<string | null> {
  try {
    const res = await fetch('/api/ldraw-status', { cache: 'no-store' });
    const body = (await res.json()) as { configured: boolean; reason?: string };
    return body.configured ? null : body.reason ?? 'Bibliothèque LDraw non configurée.';
  } catch {
    return 'Serveur local injoignable.';
  }
}

export default function BrickLabApp() {
  const catalog = useMemo(() => new PartCatalog(), []);
  const [loaded, setLoaded] = useState<LoadedModel | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [session, setSession] = useState<BuildSession | null>(null);
  const [held, setHeld] = useState<HeldBrick | null>(null);
  const [heldXZ, setHeldXZ] = useState<readonly [number, number] | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [showTargets, setShowTargets] = useState(false);
  const [tab, setTab] = useState<'model' | 'pdf'>('model');
  const [pdfPage, setPdfPage] = useState<number | undefined>(undefined);
  const [recenter, setRecenter] = useState(0);
  const [recent, setRecent] = useState<RecentSession[]>([]);
  const [, setColoursReady] = useState(false);
  const restoredPdfPage = useRef<number | undefined>(undefined);

  useEffect(() => setRecent(listRecentSessions()), [loaded]);

  const ctx: BuildContext | null = useMemo(
    () => (loaded ? { occurrences: loaded.analysis.model.occurrences, plan: loaded.analysis.plan } : null),
    [loaded],
  );

  const importText = useCallback(async (fileName: string, text: string, hash: string, rootName?: string) => {
    setBusy('Analyse du modèle…');
    const analysis = analyzeModel(text, fileName, rootName ? { rootName } : {});
    const libraryProblem = await libraryStatus();
    let geometry: GeometryLoadResult | null = null;
    if (!libraryProblem && analysis.model.occurrences.length > 0) {
      setBusy('Chargement des géométries LDraw locales…');
      geometry = await loadModelGeometry(catalog, analysis.model.occurrences);
      setColoursReady(true);
    }
    const quality = classifyImport(analysis, geometry ? geometry.missingParts : null);
    setLoaded({ fileName, text, hash, analysis, geometry, libraryProblem, quality });
    setHeld(null);
    setShowTargets(false);
    const restored = restoreProgress(loadStoredProgress(hash), hash, analysis.model.occurrences);
    if (restored.ok && quality.quality !== 'INVALID') {
      setSession(restored.session);
      setShowTargets(restored.session.mode === 'guided');
      restoredPdfPage.current = restored.lastPdfPage;
      setPdfPage(restored.lastPdfPage);
      setMessage({ kind: 'info', text: `Progression restaurée : ${restored.session.placed.length}/${analysis.model.occurrences.length} pièces posées.` });
    } else {
      setSession(null);
      restoredPdfPage.current = undefined;
      setMessage(null);
    }
    setBusy(null);
  }, [catalog]);

  const onModelFile = async (file: File) => {
    if (file.size > MAX_MODEL_BYTES) return setMessage({ kind: 'error', text: `Fichier trop volumineux (limite ${MAX_MODEL_BYTES / 1e6} Mo).` });
    if (!/\.(ldr|mpd)$/i.test(file.name)) return setMessage({ kind: 'error', text: 'Formats acceptés : .ldr et .mpd (pas .io ni .lxf).' });
    const bytes = await file.arrayBuffer();
    const text = new TextDecoder('utf-8').decode(bytes);
    await importText(file.name, text, await sha256Hex(bytes));
  };

  // Persist after every change of the build or of the PDF page.
  useEffect(() => {
    if (!loaded || !session) return;
    saveProgress(serializeProgress(loaded.hash, loaded.fileName, session, loaded.analysis.model.occurrences.length, pdfPage));
  }, [loaded, session, pdfPage]);

  const layers = useMemo(() => {
    const ys = [...new Set(ctx?.occurrences.map((o) => Math.round(o.targetMatrix[13])) ?? [])];
    return ys.sort((a, b) => b - a); // LDraw -Y up: largest y is the lowest layer
  }, [ctx]);

  const start = (mode: BuildMode) => {
    setSession(createSession(mode));
    setShowTargets(mode === 'guided');
    setHeld(null);
    setMessage({ kind: 'info', text: mode === 'guided' ? 'Mode guidé : les emplacements de l’étape apparaissent en bleu.' : 'Montage libre : suis ta notice et pose les pièces dans l’ordre de ton choix.' });
  };

  const pick = (item: TrayItem) => {
    if (!ctx || !session) return;
    const compatible = candidates(ctx, session).filter((o) => trayKey(o.partKey, o.colorCode) === item.key);
    const lowest = Math.max(...compatible.map((o) => Math.round(o.targetMatrix[13])));
    setHeld({ partKey: item.partKey, colorCode: item.colorCode, quarterTurns: 0, layerY: Number.isFinite(lowest) ? lowest : layers[0] ?? 0 });
    setMessage({ kind: 'info', text: 'Déplace la pièce et clique pour la poser. R : tourner · PageUp/PageDown : niveau · Échap : lâcher.' });
  };

  const applyPlacement = (next: BuildSession, occurrenceId: string) => {
    if (!ctx) return;
    setSession(next);
    const placed = ctx.occurrences.find((o) => o.occurrenceId === occurrenceId)!;
    const stillAvailable = tray(ctx, next).some((t) => t.key === trayKey(placed.partKey, placed.colorCode));
    if (!stillAvailable) setHeld(null);
    if (isComplete(ctx, next)) setMessage({ kind: 'ok', text: 'Bravo, modèle terminé !' });
    else setMessage({ kind: 'ok', text: `Pièce posée (${next.placed.length}/${ctx.occurrences.length}).` });
  };

  const drop = (pose: Matrix4Tuple) => {
    if (!ctx || !session || !held) return;
    const r = tryPlace(ctx, session, held, pose);
    if (r.ok) applyPlacement(r.session, r.occurrenceId);
    else setMessage({ kind: 'error', text: describeFailure(r) });
  };

  const assistPlace = () => {
    if (!ctx || !session || !held) return;
    const options = candidates(ctx, session).filter((o) => o.partKey === held.partKey && o.colorCode === held.colorCode);
    const [x, z] = heldXZ ?? [0, 0];
    const target = options.sort((a, b) => Math.hypot(a.targetMatrix[12] - x, a.targetMatrix[14] - z) - Math.hypot(b.targetMatrix[12] - x, b.targetMatrix[14] - z))[0];
    if (!target) return;
    const r = placeExact(ctx, session, target.occurrenceId);
    if (r.ok) applyPlacement(r.session, r.occurrenceId);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && session) {
        e.preventDefault();
        setSession(undo(session));
        return;
      }
      if (!held) return;
      if (e.key === 'r' || e.key === 'R') setHeld({ ...held, quarterTurns: held.quarterTurns + (e.shiftKey ? 3 : 1) });
      else if (e.key === 'Escape') setHeld(null);
      else if (e.key === 'PageUp' || e.key === 'PageDown') {
        e.preventDefault();
        const i = layers.indexOf(held.layerY);
        const next = layers[Math.min(layers.length - 1, Math.max(0, i + (e.key === 'PageUp' ? 1 : -1)))];
        if (next !== undefined) setHeld({ ...held, layerY: next });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [held, layers, session]);

  const onPdfPage = useCallback((p: number) => setPdfPage(p), []);

  const restart = () => {
    if (!loaded) return;
    clearProgress(loaded.hash);
    setSession(null);
    setHeld(null);
    setMessage(null);
  };

  const geometry = loaded?.geometry ?? null;
  const missing = geometry ? [...geometry.missingParts] : [];
  const playable = loaded && (loaded.quality.quality === 'GUIDED_PLAYABLE' || loaded.quality.quality === 'MANUAL_ONLY' || loaded.quality.quality === 'RENDERABLE');
  const placedSet = new Set(session?.placed ?? []);
  const stepIdx = ctx && session ? activeStepIndex(ctx, session) : -1;
  const openCandidates = ctx && session ? candidates(ctx, session) : [];
  const ghostIds = new Set(
    !session || !showTargets ? []
      : openCandidates.filter((o) => session.mode === 'guided' || (held && o.partKey === held.partKey && o.colorCode === held.colorCode)).map((o) => o.occurrenceId),
  );
  const solidIds = session ? placedSet : new Set(ctx?.occurrences.map((o) => o.occurrenceId) ?? []);
  const renderStatus = !loaded ? ''
    : loaded.libraryProblem ? `Rendu indisponible : ${loaded.libraryProblem}`
      : geometry ? `Géométrie LDraw : ${geometry.templates.size} combinaison(s) pièce/couleur chargée(s), ${missing.length} référence(s) manquante(s), ${Math.round(geometry.durationMs)} ms.`
        : '';

  return (
    <div className="app">
      <header className="topbar">
        <strong>Brick Lab Local</strong>
        {loaded && <span className="muted">{loaded.fileName}</span>}
        <span className="spacer" />
        {ctx && session && (
          <>
            {session.mode === 'guided' && stepIdx >= 0 && <span data-testid="step-indicator">Étape {stepIdx + 1} / {ctx.plan.steps.length}</span>}
            {session.mode === 'freeManual' && <span>Montage libre</span>}
            <span data-testid="progress">{session.placed.length}/{ctx.occurrences.length} pièces posées</span>
            <span className="muted small">Sauvegardé localement</span>
          </>
        )}
      </header>

      <main className="workspace">
        <div className="viewport">
          {loaded && geometry && geometry.templates.size > 0 && ctx ? (
            <BuildCanvas
              occurrences={ctx.occurrences}
              templates={geometry.templates}
              solidIds={solidIds}
              ghostIds={ghostIds}
              held={held}
              heldPosition={heldXZ}
              onHeldMove={setHeldXZ}
              onDrop={drop}
              recenterToken={recenter}
            />
          ) : (
            <div className="home">
              <h1>Brick Lab Local</h1>
              <p className="muted">Reconstruis virtuellement un modèle LDraw pièce par pièce. Tout reste sur ce Mac. Application non affiliée à LEGO.</p>
              <label className="button primary">
                Importer un modèle (.mpd / .ldr)
                <input type="file" accept=".ldr,.mpd" hidden data-testid="model-input"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void onModelFile(f); e.target.value = ''; }} />
              </label>
              <p className="small"><a href="https://www.lego.com/fr-fr/service/building-instructions" target="_blank" rel="noreferrer noopener">Trouver une notice sur LEGO.com</a> (ouvre le site, aucun téléchargement automatique)</p>
              {busy && <p className="muted">{busy}</p>}
              {loaded && !geometry && <p className="error">{renderStatus}</p>}
              {recent.length > 0 && (
                <section className="recent">
                  <h3>Sessions récentes</h3>
                  <ul>{recent.map((r) => <li key={r.hash}>{r.displayName} — {r.placed}/{r.total} pièces · réimporte le fichier pour reprendre</li>)}</ul>
                </section>
              )}
            </div>
          )}
          {message && <div className={`toast ${message.kind}`} role="status" data-testid="message">{message.text}</div>}
        </div>

        <aside className="side">
          <nav className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'model'} onClick={() => setTab('model')}>Modèle</button>
            <button type="button" role="tab" aria-selected={tab === 'pdf'} onClick={() => setTab('pdf')}>Notice PDF</button>
          </nav>
          <div hidden={tab !== 'model'}>
            {loaded ? (
              <>
                <ModelSummary
                  fileName={loaded.fileName}
                  analysis={loaded.analysis}
                  quality={loaded.quality}
                  renderStatus={renderStatus}
                  missingParts={missing}
                  onChooseRoot={(name) => void importText(loaded.fileName, loaded.text, loaded.hash, name)}
                />
                {!session && playable && ctx && (
                  <div className="actions">
                    {availableModes(ctx.plan).includes('guided') && <button type="button" className="button primary" onClick={() => start('guided')}>Commencer — mode guidé</button>}
                    <button type="button" className="button secondary" onClick={() => start('freeManual')}>Montage libre (avec notice)</button>
                    {ctx.plan.kind === 'NO_STEPS' && <p className="small muted">Étapes non disponibles dans ce fichier : aucune séquence n’est inventée.</p>}
                  </div>
                )}
                {!playable && loaded.quality.quality !== 'INVALID' && <p className="small muted">Visualisation seulement tant que des pièces manquent.</p>}
                <label className="button secondary small">
                  Importer un autre modèle
                  <input type="file" accept=".ldr,.mpd" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onModelFile(f); e.target.value = ''; }} />
                </label>
              </>
            ) : <p className="muted small">Aucun modèle importé.</p>}
          </div>
          <div hidden={tab !== 'pdf'}>
            <PdfPanel initialPage={restoredPdfPage.current} onPageChange={onPdfPage} />
          </div>
        </aside>
      </main>

      {ctx && session && (
        <footer className="tray">
          {isComplete(ctx, session) ? (
            <div className="done">
              <strong>Modèle terminé : {ctx.occurrences.length}/{ctx.occurrences.length} pièces.</strong>
              <button type="button" className="button primary" onClick={restart}>Recommencer</button>
            </div>
          ) : (
            <PartsTray items={tray(ctx, session)} heldKey={held ? trayKey(held.partKey, held.colorCode) : null} colourOf={(c) => catalog.colourHex(c)} onPick={pick} />
          )}
          <div className="tray-actions">
            {held && <span className="small muted" data-testid="held-info">Niveau {layers.indexOf(held.layerY) + 1}/{layers.length} · rotation {((held.quarterTurns % 4) + 4) % 4 * 90}°</span>}
            <button type="button" onClick={() => setSession(undo(session))} disabled={session.placed.length === 0}>Annuler</button>
            {session.mode === 'guided' && <button type="button" onClick={() => setSession(resetActiveStep(ctx, session))}>Réinitialiser l’étape</button>}
            <label className="small"><input type="checkbox" checked={showTargets} onChange={(e) => setShowTargets(e.target.checked)} /> Montrer les emplacements</label>
            <button type="button" onClick={() => setRecenter((n) => n + 1)}>Centrer</button>
            <button type="button" onClick={assistPlace} disabled={!held} title="Aide / accessibilité : pose la pièce tenue à l’emplacement libre le plus proche" data-testid="assist-place">Poser à la position cible (aide)</button>
            <button type="button" onClick={restart}>Abandonner</button>
          </div>
        </footer>
      )}
    </div>
  );
}

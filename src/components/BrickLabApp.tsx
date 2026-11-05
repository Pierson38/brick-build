'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  activeStepIndex, availableModes, candidates, createSession, describeFailure, isComplete, isStepped, orientationChoices, placeExact,
  resetActiveStep, rewindToStep, switchMode, tray, trayKey, tryPlace, undo, type BuildContext, type BuildMode, type BuildSession, type TrayItem,
} from '@/domain/build/engine';
import { restoreProgress, serializeProgress } from '@/domain/build/progress';
import { bottomExtent, resolveHover, type HoverHit, type HoverResolution, type Ray } from '@/domain/build/surface';
import { analyzeModel, classifyImport, sha256Hex, type ModelAnalysis, type QualityReport } from '@/domain/import/analyze';
import { inventoryCheck } from '@/domain/import/known-validations';
import {
  assignToStep, assignmentIndex, createMapping, mappingDigest, mappingToStepPlan, parseMappingText, stepLabel, touch, unassignFromStep,
  validateMapping, type InstructionMapping, type MappingTarget,
} from '@/domain/instructions/mapping';
import { loadModelGeometry, PartCatalog, templateVertices, type GeometryLoadResult } from '@/infra/ldraw/part-catalog';
import { browserStore, type BuildStore, type SaveState } from '@/infra/persistence/build-store';
import { downloadMapping } from '@/infra/persistence/local-mapping';
import { listRecentSessions, type RecentSession } from '@/infra/persistence/local-progress';
import { PartsTray } from './build/PartsTray';
import { ModelSummary } from './import/ModelSummary';
import { MappingEditor } from './mapping/MappingEditor';
import { PdfPanel } from './pdf/PdfPanel';
import { useNotice } from './pdf/useNotice';
import { SyncStepBanner } from './sync/SyncStepBanner';
import { BuildCanvas, type HeldBrick } from './three/BuildCanvas';

const MAX_MODEL_BYTES = 8 * 1024 * 1024;

declare global {
  interface Window {
    __brickLabGame?: {
      candidates: () => { id: string; partKey: string; colorCode: string; matrix: number[] }[];
      held: () => (Omit<HeldBrick, 'orientation'> & { orientation: number[]; orientationIndex: number; orientationCount: number; layerIndex: number; previewPose: number[] | null; previewLayerY: number | null; previewSource: string | null; targetId: string | null; bottom: number }) | null;
      layers: () => number[];
      symmetries: (partKey: string) => number[];
    };
    __brickLabLastDrop?: { pose: number[]; layerY: number; ok: boolean };
  }
}

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

const MODE_LABEL: Record<BuildMode, string> = { guided: 'Guidé (étapes LDraw)', synced: 'Notice synchronisée', freeManual: 'Montage libre' };

async function libraryStatus(): Promise<string | null> {
  try {
    const res = await fetch('/api/ldraw-status', { cache: 'no-store' });
    const body = (await res.json()) as { configured: boolean; reason?: string };
    return body.configured ? null : body.reason ?? 'Bibliothèque LDraw non configurée.';
  } catch {
    return 'Serveur local injoignable.';
  }
}

export interface BrickLabAppProps {
  /** Where progress and mapping are kept (P5/P6: this browser; P7: the local library). */
  readonly store?: BuildStore;
  /** Library build: model and booklets loaded at start, from verified bytes; no other model can be imported. */
  readonly initial?: {
    readonly fileName: string;
    readonly text: string;
    readonly sha256: string;
    readonly rootName: string;
    readonly booklets: readonly { readonly file: File; readonly sha256: string }[];
  };
  readonly nav?: ReactNode;
  /** Shown under the top bar (library notes). */
  readonly banner?: ReactNode;
}

const SAVE_LABEL = { idle: 'Enregistré dans la bibliothèque', saving: 'Enregistrement…', saved: 'Enregistré dans la bibliothèque' } as const;

export default function BrickLabApp({ store = browserStore, initial, nav, banner }: BrickLabAppProps = {}) {
  const catalog = useMemo(() => new PartCatalog(), []);
  const library = store.kind === 'library';
  const [loaded, setLoaded] = useState<LoadedModel | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [session, setSession] = useState<BuildSession | null>(null);
  const [held, setHeld] = useState<HeldBrick | null>(null);
  const [preview, setPreview] = useState<HoverResolution | null>(null);
  // synchronous copies: a click right after a move must use the pose that is shown
  const previewRef = useRef<HoverResolution | null>(null);
  const lastHover = useRef<{ ray: Ray; hit: HoverHit | null } | null>(null);
  const verticesCache = useRef(new Map<string, number[]>());
  const [orientationIdx, setOrientationIdx] = useState(0);
  const [message, setMessage] = useState<Message>(null);
  const [showTargets, setShowTargets] = useState(false);
  const [tab, setTab] = useState<'model' | 'pdf' | 'mapping'>('model');
  const notice = useNotice();
  const [mapping, setMapping] = useState<InstructionMapping | null>(null);
  // previous mapping kept after an import or a reset, so that it can be restored
  const [replacedMapping, setReplacedMapping] = useState<InstructionMapping | null>(null);
  const [editStepId, setEditStepId] = useState<string | null>(null);
  const [showLater, setShowLater] = useState(false);
  // synchronised mode: index of a past step being consulted (null = the active step)
  const [consultIdx, setConsultIdx] = useState<number | null>(null);
  const [recenter, setRecenter] = useState(0);
  const [recent, setRecent] = useState<RecentSession[]>([]);
  const [, setColoursReady] = useState(false);
  const restoredPdfPage = useRef<number | undefined>(undefined);
  const restoredBooklet = useRef<string | undefined>(undefined);
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const [confirmRestart, setConfirmRestart] = useState(false);

  useEffect(() => setRecent(library ? [] : listRecentSessions()), [loaded, library]);
  useEffect(() => store.onSaveState(setSaveState), [store]);
  // leaving the atelier (link, tab closed): send the last change now
  useEffect(() => {
    const flush = () => store.flush();
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [store]);

  const target: MappingTarget | null = useMemo(
    () => (loaded ? { sha256: loaded.hash, fileName: loaded.fileName, rootName: loaded.analysis.model.rootName, occurrences: loaded.analysis.model.occurrences } : null),
    [loaded],
  );
  const report = useMemo(() => (mapping && target ? validateMapping(mapping, target) : null), [mapping, target]);
  // the synchronised mode exists only with a mapping that passes validation: no invented correspondence
  const syncPlan = useMemo(() => (mapping && report?.ok ? mappingToStepPlan(mapping) : null), [mapping, report]);
  const editing = tab === 'mapping' && mapping !== null && loaded !== null;

  const ctx: BuildContext | null = useMemo(
    () => (loaded
      ? {
        occurrences: loaded.analysis.model.occurrences,
        plan: session?.mode === 'synced' && syncPlan ? syncPlan : loaded.analysis.plan,
        ...(loaded.geometry ? { symmetries: loaded.geometry.symmetries } : {}),
      }
      : null),
    [loaded, session?.mode, syncPlan],
  );

  const importText = useCallback(async (fileName: string, text: string, hash: string, rootName?: string) => {
    setBusy('Analyse du modèle…');
    const analysis = analyzeModel(text, fileName, rootName ? { rootName } : {});
    const libraryProblem = await libraryStatus();
    let geometry: GeometryLoadResult | null = null;
    if (!libraryProblem && analysis.model.occurrences.length > 0) {
      setBusy('Chargement des géométries LDraw locales…');
      geometry = await loadModelGeometry(catalog, analysis.model.occurrences, analysis.embeddedParts);
      setColoursReady(true);
    }
    const quality = classifyImport(analysis, geometry ? geometry.missingParts : null);
    setLoaded({ fileName, text, hash, analysis, geometry, libraryProblem, quality });
    setHeld(null);
    setShowTargets(false);
    setConsultIdx(null);
    setReplacedMapping(null);
    const storedMapping = await store.loadMapping(hash);
    const restoredMapping = storedMapping?.ok ? storedMapping.mapping : null;
    setMapping(restoredMapping);
    setEditStepId(restoredMapping?.steps[0]?.id ?? null);
    if (tab === 'mapping') setTab('model');
    const restored = restoreProgress(await store.loadProgress(hash), hash, analysis.model.occurrences);
    if (restored.ok && quality.quality !== 'INVALID') {
      const total = analysis.model.occurrences.length;
      let next = restored.session;
      let text = `Progression restaurée : ${next.placed.length}/${total} pièces posées.`;
      if (next.mode === 'synced') {
        const target = { sha256: hash, fileName, rootName: analysis.model.rootName, occurrences: analysis.model.occurrences };
        if (!restoredMapping || !validateMapping(restoredMapping, target).ok) {
          // never replay a synchronised build without a valid mapping: explicit fallback, bricks kept
          next = switchMode(next, 'freeManual');
          text = `${text} Partie en mode notice synchronisée, mais aucune correspondance valide pour ce fichier : reprise en montage libre. Réimporte ton fichier de correspondances pour revenir au mode synchronisé.`;
        } else if (restored.mappingDigest && restored.mappingDigest !== mappingDigest(restoredMapping)) {
          text = `${text} Les correspondances ont changé depuis la sauvegarde : l’étape en cours est recalculée à partir des pièces posées.`;
        }
      }
      setSession(next);
      setShowTargets(isStepped(next.mode));
      restoredPdfPage.current = restored.lastPdfPage;
      restoredBooklet.current = restored.lastBookletSha256;
      if (next.mode === 'synced') setTab('pdf');
      setMessage({ kind: next.mode === restored.session.mode ? 'info' : 'error', text });
    } else {
      setSession(null);
      restoredPdfPage.current = undefined;
      restoredBooklet.current = undefined;
      setMessage(null);
    }
    setBusy(null);
    if (storedMapping && !storedMapping.ok) setMessage({ kind: 'error', text: `Correspondances enregistrées illisibles, ignorées : ${storedMapping.errors.join(' ')}` });
  }, [catalog, tab, store]);

  // Library build: open the model and its booklets without asking for them. The booklet shown
  // last is opened last, at its saved page; in synchronised mode the step then turns the page.
  const started = useRef(false);
  useEffect(() => {
    if (!initial || started.current) return;
    started.current = true;
    void (async () => {
      await importText(initial.fileName, initial.text, initial.sha256, initial.rootName);
      const preferred = initial.booklets.find((b) => b.sha256 === restoredBooklet.current) ?? initial.booklets[0];
      for (const b of [...initial.booklets.filter((x) => x !== preferred), ...(preferred ? [preferred] : [])]) {
        await notice.open(b.file, b === preferred ? restoredPdfPage.current : undefined);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onModelFile = async (file: File) => {
    if (file.size > MAX_MODEL_BYTES) return setMessage({ kind: 'error', text: `Fichier trop volumineux (limite ${MAX_MODEL_BYTES / 1e6} Mo).` });
    if (!/\.(ldr|mpd)$/i.test(file.name)) return setMessage({ kind: 'error', text: 'Formats acceptés : .ldr et .mpd (pas .io ni .lxf).' });
    const bytes = await file.arrayBuffer();
    const text = new TextDecoder('utf-8').decode(bytes);
    await importText(file.name, text, await sha256Hex(bytes));
  };

  // Persist after every change of the build or of the PDF page.
  const pdfView = notice.view;
  useEffect(() => {
    if (!loaded || !session) return;
    // until the booklet is open again, keep the saved position (page AND booklet) as it was
    const pdf = pdfView ? { page: pdfView.page, bookletSha256: pdfView.sha256 }
      : restoredPdfPage.current !== undefined ? { page: restoredPdfPage.current, ...(restoredBooklet.current ? { bookletSha256: restoredBooklet.current } : {}) } : {};
    store.saveProgress(serializeProgress(loaded.hash, loaded.fileName, session, loaded.analysis.model.occurrences.length, pdf, mapping && session.mode === 'synced' ? mappingDigest(mapping) : undefined));
  }, [loaded, session, pdfView, mapping, store]);

  const changeMapping = useCallback((next: InstructionMapping, note?: string) => {
    const stamped = touch(next);
    setMapping(stamped);
    if (note) setMessage({ kind: 'info', text: note });
    void store.saveMapping(stamped).then((ok) => {
      if (!ok) setMessage({ kind: 'error', text: library ? 'Correspondances non enregistrées dans la bibliothèque (voir l’état en haut).' : 'Sauvegarde locale des correspondances impossible (stockage plein ou indisponible).' });
    });
  }, [store, library]);

  // A synchronised build whose mapping became invalid (edited, cleared, other import) goes back to
  // free mode explicitly, bricks kept, instead of following steps that no longer exist.
  useEffect(() => {
    if (session?.mode !== 'synced' || syncPlan || editing) return;
    setSession(switchMode(session, 'freeManual'));
    setMessage({ kind: 'error', text: 'Correspondances absentes ou invalides : la partie continue en montage libre (pièces posées conservées).' });
  }, [session, syncPlan, editing]);

  const layers = useMemo(() => {
    const ys = [...new Set(ctx?.occurrences.map((o) => Math.round(o.targetMatrix[13])) ?? [])];
    return ys.sort((a, b) => b - a); // LDraw -Y up: largest y is the lowest layer
  }, [ctx]);

  const MODE_HINT: Record<BuildMode, string> = {
    guided: 'Mode guidé : les emplacements de l’étape apparaissent en bleu.',
    freeManual: 'Montage libre : suis ta notice et pose les pièces dans l’ordre de ton choix.',
    synced: 'Notice synchronisée : la page de l’étape s’affiche, seules ses pièces sont proposées.',
  };
  const start = (mode: BuildMode, keepPieces = false) => {
    setSession(keepPieces && session ? switchMode(session, mode) : createSession(mode));
    setShowTargets(isStepped(mode));
    setHeld(null);
    setConsultIdx(null);
    if (mode === 'synced') setTab('pdf');
    setMessage({ kind: 'info', text: MODE_HINT[mode] });
  };

  const pick = (item: TrayItem) => {
    if (!ctx || !session) return;
    const compatible = candidates(ctx, session).filter((o) => trayKey(o.partKey, o.colorCode) === item.key);
    const lowest = Math.max(...compatible.map((o) => Math.round(o.targetMatrix[13])));
    const orientation = orientationChoices(ctx, item.partKey, item.colorCode)[0]!;
    setOrientationIdx(0);
    setHeld({ partKey: item.partKey, colorCode: item.colorCode, quarterTurns: 0, layerY: Number.isFinite(lowest) ? lowest : layers[0] ?? 0, orientation, layerMode: 'auto' });
    setMessage({ kind: 'info', text: 'Survole le modèle : la pièce se pose sur la surface visée. Clic : poser · R : tourner · O : orientation · PageUp/PageDown : niveau manuel (A : auto) · Échap : lâcher.' });
  };

  const applyPlacement = (next: BuildSession, occurrenceId: string) => {
    if (!ctx || !session) return;
    setSession(next);
    setConsultIdx(null);
    const placed = ctx.occurrences.find((o) => o.occurrenceId === occurrenceId)!;
    const stillAvailable = tray(ctx, next).some((t) => t.key === trayKey(placed.partKey, placed.colorCode));
    if (!stillAvailable) setHeld(null);
    const before = activeStepIndex(ctx, session);
    const after = activeStepIndex(ctx, next);
    const upcoming = ctx.plan.steps[after]?.instruction;
    if (isComplete(ctx, next)) setMessage({ kind: 'ok', text: 'Bravo, modèle terminé !' });
    else if (next.mode === 'synced' && after !== before && upcoming) {
      setMessage({ kind: 'ok', text: `${ctx.plan.steps[before]?.instruction?.label ?? 'Étape'} terminée ! Suivante : ${upcoming.label}, p. ${upcoming.page}.` });
    } else setMessage({ kind: 'ok', text: `Pièce posée (${next.placed.length}/${ctx.occurrences.length}).` });
  };

  const drop = () => {
    const shown = previewRef.current;
    if (!ctx || !session || !held || !shown) return;
    const r = tryPlace(ctx, session, held, shown.pose);
    if (process.env.NODE_ENV !== 'production') window.__brickLabLastDrop = { pose: [...shown.pose], layerY: shown.layerY, ok: r.ok };
    if (r.ok) {
      previewRef.current = null;
      setPreview(null);
      applyPlacement(r.session, r.occurrenceId);
    } else setMessage({ kind: 'error', text: describeFailure(r) });
  };

  // Height of the held brick under its current orientation, from its real geometry.
  const heldBottom = useMemo(() => {
    if (!held || !loaded?.geometry) return 0;
    const template = loaded.geometry.templates.get(trayKey(held.partKey, held.colorCode));
    if (!template) return 0;
    let v = verticesCache.current.get(held.partKey);
    if (!v) {
      v = templateVertices(template);
      verticesCache.current.set(held.partKey, v);
    }
    return bottomExtent(v, held.orientation);
  }, [held, loaded]);

  const updatePreview = useCallback((ray: Ray, hit: HoverHit | null) => {
    lastHover.current = { ray, hit };
    if (!ctx || !session || !held) return;
    const r = resolveHover(ctx, session, held, ray, hit, heldBottom);
    if (!r) return;
    previewRef.current = r;
    setPreview(r);
  }, [ctx, session, held, heldBottom]);

  // Rotation, orientation, layer or session changes: recompute the preview at the same pointer position.
  useEffect(() => {
    if (!held) {
      previewRef.current = null;
      setPreview(null);
      return;
    }
    if (lastHover.current) updatePreview(lastHover.current.ray, lastHover.current.hit);
  }, [held, session, updatePreview]);

  const assistPlace = () => {
    if (!ctx || !session || !held) return;
    const options = candidates(ctx, session).filter((o) => o.partKey === held.partKey && o.colorCode === held.colorCode);
    const [x, z] = preview ? [preview.pose[12], preview.pose[14]] : [0, 0];
    const target = options.sort((a, b) => Math.hypot(a.targetMatrix[12] - x, a.targetMatrix[14] - z) - Math.hypot(b.targetMatrix[12] - x, b.targetMatrix[14] - z))[0];
    if (!target) return;
    const r = placeExact(ctx, session, target.occurrenceId);
    if (r.ok) applyPlacement(r.session, r.occurrenceId);
  };

  const heldOrientations = useMemo(
    () => (held && ctx ? orientationChoices(ctx, held.partKey, held.colorCode) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx, held?.partKey, held?.colorCode],
  );
  const nextOrientation = useCallback(() => {
    if (!held || heldOrientations.length === 0) return;
    const next = (orientationIdx + 1) % heldOrientations.length;
    setOrientationIdx(next);
    setHeld({ ...held, orientation: heldOrientations[next]! });
  }, [held, heldOrientations, orientationIdx]);

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
      else if (e.key === 'o' || e.key === 'O') nextOrientation();
      else if (e.key === 'Escape') setHeld(null);
      else if (e.key === 'a' || e.key === 'A') setHeld({ ...held, layerMode: 'auto' });
      else if (e.key === 'PageUp' || e.key === 'PageDown') {
        // manual fallback: starts from the default layer (lowest one with an open compatible
        // target), so it never costs more keys than the former keyboard-only scheme
        e.preventDefault();
        const i = layers.indexOf(held.layerY);
        const next = layers[Math.min(layers.length - 1, Math.max(0, i + (e.key === 'PageUp' ? 1 : -1)))];
        if (next !== undefined) setHeld({ ...held, layerY: next, layerMode: 'manual' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [held, layers, session, nextOrientation]);

  // Dev/test only: read-only view of the game state for the E2E "scripted player".
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    window.__brickLabGame = {
      candidates: () => (ctx && session ? candidates(ctx, session).map((o) => ({ id: o.occurrenceId, partKey: o.partKey, colorCode: o.colorCode, matrix: [...o.targetMatrix] })) : []),
      held: () => (held
        ? {
          ...held, orientation: [...held.orientation], orientationIndex: orientationIdx, orientationCount: heldOrientations.length, layerIndex: layers.indexOf(held.layerY),
          previewPose: preview ? [...preview.previewPose] : null, previewLayerY: preview?.layerY ?? null, previewSource: preview?.source ?? null, targetId: preview?.targetId ?? null, bottom: heldBottom,
        }
        : null),
      layers: () => [...layers],
      symmetries: (partKey: string) => [...(ctx?.symmetries?.get(partKey) ?? [0])],
    };
    return () => {
      delete window.__brickLabGame;
    };
  }, [ctx, session, held, preview, heldBottom, orientationIdx, heldOrientations, layers]);

  const restart = async () => {
    if (!loaded) return;
    // library: an explicit confirmation, and the progress goes to the build's history
    if (library && !confirmRestart) return setConfirmRestart(true);
    setConfirmRestart(false);
    if (!(await store.clearProgress(loaded.hash))) return;
    setSession(null);
    setHeld(null);
    setConsultIdx(null);
    setMessage(null);
  };

  // ---- synchronised mode: step shown and its booklet page ----
  const plan = ctx?.plan;
  const activeIdx = ctx && session ? activeStepIndex(ctx, session) : -1;
  const synced = session?.mode === 'synced' && syncPlan !== null && !editing;
  const shownIdx = synced ? consultIdx ?? activeIdx : -1;
  const shownStep = shownIdx >= 0 ? plan?.steps[shownIdx] : undefined;
  const shownBooklet = shownStep?.instruction && mapping ? mapping.booklets.find((b) => b.id === shownStep.instruction!.bookletId) ?? null : null;
  const openShas = notice.booklets.map((b) => b.sha256).join(',');
  const showStepPage = useCallback(() => {
    if (shownBooklet?.sha256 && shownStep?.instruction) notice.show(shownBooklet.sha256, shownStep.instruction.page);
  }, [notice, shownBooklet, shownStep]);
  // jump to the page when the step changes or when its booklet gets opened
  useEffect(showStepPage, [shownStep?.id, shownBooklet?.sha256, openShas]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- mapping editor ----
  const editIdx = editing ? mapping.steps.findIndex((st) => st.id === editStepId) : -1;
  const editStep = editIdx >= 0 ? mapping!.steps[editIdx] : undefined;
  const editBookletSha = editStep ? mapping!.booklets.find((b) => b.id === editStep.bookletId)?.sha256 : undefined;
  useEffect(() => {
    if (editStep && editBookletSha) notice.show(editBookletSha, editStep.page);
  }, [editStep?.id, editBookletSha, editStep?.page, openShas]); // eslint-disable-line react-hooks/exhaustive-deps

  const openEditor = () => {
    if (!target) return;
    if (!mapping) {
      const fresh = createMapping(target);
      changeMapping(fresh);
      setEditStepId(null);
    }
    setHeld(null);
    setTab('mapping');
  };

  const pickInEditor = (occurrenceId: string, { alt }: { alt: boolean }) => {
    if (!mapping || !editStep) return setMessage({ kind: 'info', text: 'Crée d’abord une étape de notice (+ Nouvelle étape).' });
    const owners = assignmentIndex(mapping).get(occurrenceId) ?? [];
    const o = ctx?.occurrences.find((x) => x.occurrenceId === occurrenceId);
    const name = o ? `${o.partRef.replace(/\.dat$/i, '')} (couleur ${o.colorCode})` : occurrenceId;
    if (owners.includes(editStep.id)) return changeMapping(unassignFromStep(mapping, editStep.id, [occurrenceId]), `${name} retirée de ${stepLabel(editStep)}.`);
    if (owners.length > 0 && !alt) {
      const other = mapping.steps.find((st) => st.id === owners[0]);
      return setMessage({ kind: 'info', text: `${name} est déjà dans ${other ? `${stepLabel(other)} (p. ${other.page})` : 'une autre étape'} : ⌥-clic pour la déplacer ici.` });
    }
    changeMapping(assignToStep(mapping, editStep.id, [occurrenceId], { move: alt }).mapping, `${name} ${alt && owners.length ? 'déplacée dans' : 'ajoutée à'} ${stepLabel(editStep)}.`);
  };

  const importMappingFile = async (file: File) => {
    if (!target) return;
    const parsed = parseMappingText(await file.text());
    if (!parsed.ok) return setMessage({ kind: 'error', text: `Import refusé : ${parsed.errors.join(' ')}` });
    const check = validateMapping(parsed.mapping, target);
    const mismatch = check.issues.find((i) => i.code === 'MODEL_MISMATCH');
    if (mismatch) return setMessage({ kind: 'error', text: `Import refusé : ${mismatch.message}` });
    if (mapping && mapping.steps.length > 0) setReplacedMapping(mapping);
    changeMapping(parsed.mapping, `Correspondances importées : ${parsed.mapping.steps.length} étape(s), ${check.assigned}/${check.total} pièces affectées${check.ok ? ', valides.' : ' (brouillon, voir la validation).'}`);
    setEditStepId(parsed.mapping.steps[0]?.id ?? null);
  };

  const clearAllMapping = () => {
    if (!loaded || !target || !mapping) return;
    setReplacedMapping(mapping);
    store.clearMapping(loaded.hash);
    changeMapping(createMapping(target), 'Correspondances effacées.');
    setEditStepId(null);
  };

  const geometry = loaded?.geometry ?? null;
  const missing = geometry ? [...geometry.missingParts] : [];
  const playable = loaded && (loaded.quality.quality === 'GUIDED_PLAYABLE' || loaded.quality.quality === 'MANUAL_ONLY' || loaded.quality.quality === 'RENDERABLE');
  const placedSet = new Set(session?.placed ?? []);
  const stepIdx = activeIdx;
  const openCandidates = ctx && session ? candidates(ctx, session) : [];
  let ghostIds = new Set(
    !session || !showTargets ? []
      : openCandidates.filter((o) => isStepped(session.mode) || (held && o.partKey === held.partKey && o.colorCode === held.colorCode)).map((o) => o.occurrenceId),
  );
  let solidIds = session ? placedSet : new Set(ctx?.occurrences.map((o) => o.occurrenceId) ?? []);
  let highlightIds: Set<string> = synced && consultIdx !== null && shownStep ? new Set(shownStep.occurrenceIds) : new Set();
  if (editing && report) {
    // editor preview: built up to the current step, its bricks highlighted, unassigned as ghosts
    const before = mapping.steps.slice(0, Math.max(0, editIdx)).flatMap((st) => st.occurrenceIds);
    const later = showLater ? mapping.steps.slice(editIdx + 1).flatMap((st) => st.occurrenceIds) : [];
    solidIds = new Set(before);
    highlightIds = new Set(editStep?.occurrenceIds ?? []);
    ghostIds = new Set([...report.unassigned, ...later]);
  }
  const syncUnavailable = !loaded ? '' : !mapping || mapping.steps.length === 0 ? 'aucune correspondance notice ↔ 3D pour ce fichier.'
    : report && !report.ok ? (report.issues.find((i) => i.severity === 'error')?.message ?? 'correspondances invalides.') : '';
  const renderStatus = !loaded ? ''
    : loaded.libraryProblem ? `Rendu indisponible : ${loaded.libraryProblem}`
      : geometry ? `Géométrie LDraw : ${geometry.templates.size} combinaison(s) pièce/couleur chargée(s), ${missing.length} référence(s) manquante(s), ${Math.round(geometry.durationMs)} ms.`
        : '';

  return (
    <div className="app">
      <div className="app-head">
      <header className="topbar">
        {nav}
        {!nav && <strong>Brick Lab Local</strong>}
        {loaded && !initial && <span className="muted">{loaded.fileName}</span>}
        <span className="spacer" />
        {ctx && session && (
          <>
            {isStepped(session.mode) && stepIdx >= 0 && <span data-testid="step-indicator">Étape {stepIdx + 1} / {ctx.plan.steps.length}</span>}
            {session.mode === 'synced' && ctx.plan.steps[stepIdx]?.instruction && (
              <span data-testid="notice-step">Notice : {ctx.plan.steps[stepIdx]!.instruction!.label}, p. {ctx.plan.steps[stepIdx]!.instruction!.page}</span>
            )}
            {session.mode === 'freeManual' && <span>Montage libre</span>}
            <span data-testid="progress">{session.placed.length}/{ctx.occurrences.length} pièces posées</span>
            {library
              ? <span className={`small save-${saveState.kind}`} data-testid="save-state" role={saveState.kind === 'error' || saveState.kind === 'conflict' ? 'alert' : undefined}>
                {saveState.kind === 'error' || saveState.kind === 'conflict' ? `Non enregistré : ${saveState.message}` : SAVE_LABEL[saveState.kind]}
              </span>
              : <span className="muted small">Sauvegardé localement</span>}
          </>
        )}
      </header>
      {banner}
      {saveState.kind === 'conflict' && (
        <div className="banner error" role="alert" data-testid="save-conflict">
          {saveState.message} <button type="button" onClick={() => window.location.reload()}>Recharger</button>
        </div>
      )}
      </div>

      <main className={editing ? 'workspace editing' : 'workspace'}>
        <div className="viewport">
          {loaded && geometry && geometry.templates.size > 0 && ctx ? (
            <BuildCanvas
              occurrences={ctx.occurrences}
              templates={geometry.templates}
              solidIds={solidIds}
              ghostIds={ghostIds}
              highlightIds={highlightIds}
              held={editing ? null : held}
              previewPose={preview?.previewPose ?? null}
              onHover={updatePreview}
              onDrop={drop}
              {...(editing ? { onPick: pickInEditor } : {})}
              recenterToken={recenter}
            />
          ) : initial ? (
            // library build: no manual import here, only what is being loaded (or why it cannot render)
            <div className="home" data-testid="library-loading">
              <p className="muted">{busy ?? (loaded ? '' : 'Chargement du modèle…')}</p>
              {loaded && !geometry && <p className="error">{renderStatus}</p>}
            </div>
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
            {loaded && <button type="button" role="tab" aria-selected={tab === 'mapping'} onClick={openEditor}>Correspondances</button>}
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
                  inventory={inventoryCheck(loaded.hash)}
                  {...(initial ? {} : { onChooseRoot: (name: string) => void importText(loaded.fileName, loaded.text, loaded.hash, name) })}
                />
                {!session && playable && ctx && (
                  <div className="actions">
                    {syncPlan && <button type="button" className="button primary" onClick={() => start('synced')}>Commencer — notice synchronisée</button>}
                    {availableModes(loaded.analysis.plan).includes('guided') && <button type="button" className={syncPlan ? 'button secondary' : 'button primary'} onClick={() => start('guided')}>Commencer — mode guidé</button>}
                    <button type="button" className="button secondary" onClick={() => start('freeManual')}>Montage libre (avec notice)</button>
                    {loaded.analysis.plan.kind === 'NO_STEPS' && <p className="small muted">Étapes non disponibles dans ce fichier : aucune séquence n’est inventée.</p>}
                  </div>
                )}
                {playable && (
                  <div className="sync-status small" data-testid="sync-availability">
                    {syncPlan
                      ? <span className="ok">Notice synchronisée disponible : {syncPlan.steps.length} étape(s) de notice, correspondances validées.</span>
                      : <span className="muted">Notice synchronisée indisponible : {syncUnavailable}</span>}
                    {' '}<button type="button" className="small" onClick={openEditor}>{mapping && mapping.steps.length > 0 ? 'Modifier les correspondances' : 'Créer les correspondances'}</button>
                  </div>
                )}
                {!playable && loaded.quality.quality !== 'INVALID' && <p className="small muted">Visualisation seulement tant que des pièces manquent.</p>}
                {!initial && (
                  <label className="button secondary small">
                    Importer un autre modèle
                    <input type="file" accept=".ldr,.mpd" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onModelFile(f); e.target.value = ''; }} />
                  </label>
                )}
              </>
            ) : <p className="muted small">Aucun modèle importé.</p>}
          </div>
          <div hidden={tab === 'model'}>
            <PdfPanel
              notice={notice}
              initialPage={restoredPdfPage.current}
              compact={editing}
              fitWidth={synced || editing}
              caption={synced ? 'page pilotée par l’étape de notice en cours.' : editing ? 'page de l’étape éditée.' : 'page PDF indépendante des étapes 3D.'}
              banner={synced && plan ? (
                <SyncStepBanner
                  steps={plan.steps}
                  activeIdx={activeIdx}
                  shownIdx={shownIdx}
                  placed={placedSet}
                  booklet={shownBooklet}
                  bookletOpen={Boolean(shownBooklet?.sha256 && notice.booklets.some((b) => b.sha256 === shownBooklet.sha256))}
                  view={notice.view}
                  onConsult={(i) => { setHeld(null); setConsultIdx(i); }}
                  onRewind={(i) => {
                    if (!ctx || !session) return;
                    setSession(rewindToStep(ctx, session, i));
                    setConsultIdx(null);
                    setMessage({ kind: 'info', text: `Reprise depuis ${plan.steps[i]?.instruction?.label ?? 'cette étape'} : les pièces des étapes suivantes ont été retirées.` });
                  }}
                  onShowStepPage={showStepPage}
                />
              ) : null}
            />
            {editing && report && target && (
              <MappingEditor
                mapping={mapping}
                report={report}
                occurrences={loaded.analysis.model.occurrences}
                ldrawPlan={loaded.analysis.plan}
                notice={notice}
                currentStepId={editStep?.id ?? null}
                onSelectStep={setEditStepId}
                onChange={changeMapping}
                onExport={() => downloadMapping(mapping)}
                onImportFile={(f) => void importMappingFile(f)}
                onClear={clearAllMapping}
                onClose={() => setTab(session?.mode === 'synced' ? 'pdf' : 'model')}
                showLater={showLater}
                onShowLater={setShowLater}
                colourOf={(c) => catalog.colourHex(c)}
              />
            )}
            {editing && replacedMapping && (
              <p className="small">
                Correspondances précédentes remplacées.{' '}
                <button type="button" className="small" onClick={() => { changeMapping(replacedMapping, 'Correspondances précédentes restaurées.'); setEditStepId(replacedMapping.steps[0]?.id ?? null); setReplacedMapping(null); }}>Les restaurer</button>
              </p>
            )}
          </div>
        </aside>
      </main>

      {ctx && session && !editing && (
        <footer className="tray">
          {isComplete(ctx, session) ? (
            <div className="done">
              <strong>Modèle terminé : {ctx.occurrences.length}/{ctx.occurrences.length} pièces.</strong>
              <button type="button" className="button primary" onClick={() => void restart()}>{confirmRestart ? 'Confirmer : recommencer' : 'Recommencer'}</button>
            </div>
          ) : (
            <PartsTray items={tray(ctx, session)} heldKey={held ? trayKey(held.partKey, held.colorCode) : null} colourOf={(c) => catalog.colourHex(c)} onPick={pick} />
          )}
          <div className="tray-actions">
            {held && (
              <span className="small muted" data-testid="held-info">
                {held.layerMode === 'auto' ? 'Niveau auto (surface)' : `Niveau manuel ${layers.indexOf(held.layerY) + 1}/${layers.length} (A : auto)`}
                {' · '}rotation {((held.quarterTurns % 4) + 4) % 4 * 90}° · orientation {orientationIdx + 1}/{heldOrientations.length}
                {preview?.targetId ? <strong className="ok" data-testid="target-found"> · emplacement trouvé, clic pour poser</strong> : null}
              </span>
            )}
            {held && heldOrientations.length > 1 && <button type="button" onClick={nextOrientation}>Orientation suivante (O)</button>}
            <button type="button" onClick={() => { setConsultIdx(null); setSession(undo(session)); }} disabled={session.placed.length === 0}>Annuler</button>
            {isStepped(session.mode) && <button type="button" onClick={() => setSession(resetActiveStep(ctx, session))}>Réinitialiser l’étape</button>}
            <label className="small">Mode{' '}
              <select data-testid="mode-select" value={session.mode} onChange={(e) => start(e.target.value as BuildMode, true)}>
                {(['synced', 'guided', 'freeManual'] as const)
                  .filter((m) => m === session.mode || (m === 'synced' ? syncPlan !== null : m === 'guided' ? availableModes(loaded!.analysis.plan).includes('guided') : true))
                  .map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
              </select>
            </label>
            <label className="small"><input type="checkbox" checked={showTargets} onChange={(e) => setShowTargets(e.target.checked)} /> Montrer les emplacements</label>
            <button type="button" onClick={() => setRecenter((n) => n + 1)}>Centrer</button>
            <button type="button" onClick={assistPlace} disabled={!held} title="Aide / accessibilité : pose la pièce tenue à l’emplacement libre le plus proche" data-testid="assist-place">Poser à la position cible (aide)</button>
            {confirmRestart ? (
              <span className="confirm small" data-testid="confirm-restart">
                La progression ({session.placed.length}/{ctx.occurrences.length}) sera retirée de cette partie (copie gardée dans l’historique de la bibliothèque).
                {' '}<button type="button" className="danger" onClick={() => void restart()}>Confirmer l’abandon</button>
                {' '}<button type="button" onClick={() => setConfirmRestart(false)}>Annuler</button>
              </span>
            ) : <button type="button" onClick={() => void restart()}>Abandonner</button>}
          </div>
        </footer>
      )}
    </div>
  );
}

'use client';

import { BookOpen, Box, Check, CircleAlert, Crosshair, FlaskConical, Ghost, Grid3x3, Link2, LoaderCircle, Magnet, PanelRightClose, PanelRightOpen, RotateCcw, RotateCw, ScanEye, Target, Trash2, Undo2, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import {
  activeStepIndex, availableModes, candidates, createSession, describeFailure, isComplete, isStepped, orientationChoices, placeExact,
  resetActiveStep, rewindToStep, switchMode, tray, trayKey, tryPlace, undo, type BuildContext, type BuildMode, type BuildSession, type TrayItem,
} from '@/domain/build/engine';
import {
  FINE_HEIGHT_STEP_LDU, FREE_TARGET_MAGNET, HEIGHT_STEP_LDU, freePiecesOf, groupPoses, isStockExhausted, liftedY, makeGroup, matchToModel, movePiece, moveGroup,
  occupiedView, pieceKind, placeFree, poseOf, removeLast, removePiece, removePieces, resolveFreeHover, sameRef, stockLeft, toStepped, usedCount, atModelCount,
  groupBottom, orientationLabel, quarterTurn, rotateOrientation, rotatedInPlace, applyDelta, deltaTo, shownCoords,
  type Axis, type FreeResult, type GroupMember, type PieceRef,
} from '@/domain/build/free';
import {
  connectedAssembly, connectionGraph, ConnectorIndex, heldConnectors,
  type Engagement, type PlacedPiece, type SnapMiss, type SnapProposal,
} from '@/domain/build/connections';
import { snapHover } from '@/domain/build/snap';
import { restoreProgress, serializeProgress } from '@/domain/build/progress';
import { IDENTITY, multiply, rotationY, withTranslation } from '@/domain/ldraw/matrix';
import type { Matrix4Tuple } from '@/domain/ldraw/types';
import { bottomExtent, resolveHover, type HoverHit, type HoverResolution, type Ray } from '@/domain/build/surface';
import { analyzeModel, classifyImport, sha256Hex, type ModelAnalysis, type QualityReport } from '@/domain/import/analyze';
import { inventoryCheck } from '@/domain/import/known-validations';
import {
  assignToStep, assignmentIndex, createMapping, mappingDigest, mappingToStepPlan, parseMappingText, stepLabel, touch, unassignFromStep,
  validateMapping, type InstructionMapping, type MappingTarget,
} from '@/domain/instructions/mapping';
import { ConnectorCatalog } from '@/infra/ldraw/connector-catalog';
import { loadModelGeometry, PartCatalog, templateVertices, type GeometryLoadResult } from '@/infra/ldraw/part-catalog';
import { browserStore, type BuildStore, type SaveState } from '@/infra/persistence/build-store';
import { downloadMapping } from '@/infra/persistence/local-mapping';
import { listRecentSessions, type RecentSession } from '@/infra/persistence/local-progress';
import { HelpButton } from './atelier/HelpDialog';
import { HeldBar, SelectionBar } from './atelier/ManipBar';
import { ModeSwitch } from './atelier/ModeSwitch';
import { StartPanel } from './atelier/StartPanel';
import { PartsTray } from './build/PartsTray';
import { DEMO_ID, DEMO_MODEL } from './demo/demo-model';
import { ModelSummary } from './import/ModelSummary';
import { MappingEditor } from './mapping/MappingEditor';
import { Splitter, useSidePanel } from './layout/Splitter';
import { PdfPanel } from './pdf/PdfPanel';
import { useNotice } from './pdf/useNotice';
import { ProgressBar } from './library/labels';
import { AppBar, type Crumb } from './ui/AppBar';
import { ConfirmDialog } from './ui/Dialog';
import { Loading, Note, Toast } from './ui/feedback';
import { LdrawSetup } from './ui/LdrawSetup';
import { SyncStepBanner } from './sync/SyncStepBanner';
import { BuildCanvas, modelGroundY, type GizmoSpec, type HeldBrick } from './three/BuildCanvas';

const MAX_MODEL_BYTES = 8 * 1024 * 1024;

declare global {
  interface Window {
    __brickLabGame?: {
      candidates: () => { id: string; partKey: string; colorCode: string; matrix: number[] }[];
      /** Free mode: pieces placed at a pose chosen by the player, and how many stand at their place in the model. */
      freePieces: () => { id: string; partKey: string; colorCode: string; pose: number[] }[];
      atModel: () => number;
      /** Ground level of the model (LDraw y): where the free pieces stand. */
      ground: () => number;
      /** Free mode: the selected pieces. */
      selection: () => PieceRef[];
      /** Free mode: the snapping proposal shown, and the connection interfaces read for a part. */
      snap: () => SnapProposal | null;
      /** Free mode: the connections verified at the exact pose shown (the green markers), or why there is no proposal. */
      engaged: () => Engagement | null;
      snapMiss: () => SnapMiss | null;
      connectors: (partKey: string) => { kind: string; pos: readonly number[] }[] | null;
      /** Free mode: the connection graph of the placed pieces (piece key → connected piece keys). */
      graph: () => Record<string, string[]>;
      held: () => (Omit<HeldBrick, 'orientation'> & { orientation: number[]; orientationIndex: number; orientationCount: number; layerIndex: number; previewPose: number[] | null; previewLayerY: number | null; previewSource: string | null; targetId: string | null; bottom: number }) | null;
      layers: () => number[];
      symmetries: (partKey: string) => number[];
    };
    /** `targetId`: model target the drop stands on (free mode: null when placed elsewhere). */
    __brickLabLastDrop?: { pose: number[]; layerY: number; ok: boolean; targetId: string | null };
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
  /** Breadcrumb after the brand (where this atelier sits). */
  readonly crumbs?: readonly Crumb[];
  /** Shown under the top bar (library notes). */
  readonly banner?: ReactNode;
}

const FREE_FAILURE: Record<Exclude<FreeResult, { ok: true }>['reason'], string> = {
  NOT_FREE_MODE: 'Pose libre possible seulement en montage libre.',
  NO_STOCK: 'Plus de pièce de ce type dans le stock du set.',
  UNKNOWN_PIECE: 'Cette pièce n’est plus dans la construction.',
  INVALID_POSE: 'Position impossible à enregistrer.',
};

/** Why the pieces magnet proposes nothing (NONE_NEAR: nothing to say). */
const SNAP_MISS: Record<Exclude<SnapMiss, 'NONE_NEAR'>, string> = {
  NO_CONNECTOR: 'aimant : aucune connexion reconnue sur cette pièce (pose libre, Maj + clic pour l’assembler)',
  AXES: 'aimant : connexion compatible tout près, mais axes non alignés — tourne la pièce (X / Y / Z)',
  OCCUPIED: 'aimant : les connecteurs alignés tout près sont déjà occupés',
};

/** "4 tenon(s) emboîté(s)", "2 goupille(s) emboîtée(s)"… from the kinds of the connections. */
function connectionsLabel(e: Engagement): string {
  const only = e.kinds.length === 1 ? e.kinds[0] : null;
  return `${e.pairs} ${only === 'stud' ? 'tenon(s) emboîté(s)' : only === 'pin' ? 'goupille(s) emboîtée(s)' : only === 'axle' ? 'axe(s) engagé(s)' : 'connexion(s) emboîtée(s)'}`;
}

/** Free mode, stock used up: says what is true — the build is not compared with the official model. */
function freeEndText(atModel: number, total: number): string {
  return atModel >= total
    ? `Toutes les pièces sont posées à leur place dans le modèle : modèle reconstruit (${total}/${total}).`
    : `Toutes les pièces du set sont posées (${total}/${total}). Montage libre : ta construction n’est pas comparée au modèle officiel — ${atModel} pièce(s) à leur place dans le modèle.`;
}

const SAVE_LABEL = { idle: 'Enregistré dans la bibliothèque', saving: 'Enregistrement…', saved: 'Enregistré dans la bibliothèque' } as const;

const NO_STEPS_TEXT = 'Étapes non disponibles dans ce fichier : aucune séquence n’est inventée.';
/** Instructions of the scene legend (decision A6: instructions there, results in the toast). */
const HINT_PICK_FREE = 'Pointe où tu veux : la pièce se pose sur la surface visée (grille d’un demi-tenon, G pour la retirer). Clic : poser · R : tourner · O : orientation · Monter / Descendre (PageUp / PageDown) : hauteur libre · Échap : lâcher.';
const HINT_PICK = 'Survole le modèle : la pièce se pose sur la surface visée. Clic : poser · R : tourner · O : orientation · PageUp/PageDown : niveau manuel (A : auto) · Échap : lâcher.';
const HINT_TAKEN = 'Pièce reprise : clic pour la reposer · R / O : la tourner · Monter / Descendre : hauteur · Suppr : la remettre dans le stock · Échap : la laisser où elle était.';
const PANEL_KEY = 'brick-lab:panel-collapsed';

export default function BrickLabApp({ store = browserStore, initial, crumbs = [], banner }: BrickLabAppProps = {}) {
  const catalog = useMemo(() => new PartCatalog(), []);
  // connection interfaces of the parts (studs, receptors, pins, pin holes), read in the background
  const connectorCatalog = useMemo(() => new ConnectorCatalog(), []);
  const [connectorsVersion, setConnectorsVersion] = useState(0);
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
  // side panel folded away (browser preference, like its width)
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(PANEL_KEY) === '1');
    } catch {
      // storage unavailable: the panel is shown
    }
  }, []);
  const setPanelCollapsed = (value: boolean) => {
    setCollapsed(value);
    try {
      window.localStorage.setItem(PANEL_KEY, value ? '1' : '0');
    } catch {
      // private browsing: applies to this page only
    }
  };
  const [homeDrag, setHomeDrag] = useState(false);
  // free mode: previous states of this session, for undo (move, turn, removal); empty after a reload
  const [freeHistory, setFreeHistory] = useState<BuildSession[]>([]);
  const [snap, setSnap] = useState({ grid: true, magnet: true });
  // free → guided / synchronised with pieces off the model: waits for an explicit choice
  const [pendingSwitch, setPendingSwitch] = useState<{ mode: Exclude<BuildMode, 'freeManual'>; recognised: number; unmatched: number } | null>(null);
  // free mode: placed pieces selected (click, Shift+click) to be moved or removed together
  const [selection, setSelection] = useState<PieceRef[]>([]);
  // free mode: manual height step (a plate, or 1 LDU)
  const [heightStep, setHeightStep] = useState<number>(HEIGHT_STEP_LDU);
  // horizontal position kept after a height change, until the pointer moves again
  const liftXZ = useRef<[number, number] | null>(null);
  // a drag (direct manipulation) is in progress
  const dragging = useRef(false);
  // transform gizmo on the selection (free mode): arrows / rings, global / local axes, steps
  const [gizmoMode, setGizmoMode] = useState<'translate' | 'rotate'>('translate');
  const [gizmoSpace, setGizmoSpace] = useState<'world' | 'local'>('world');
  const [gizmoStep, setGizmoStep] = useState<10 | 20 | 1>(10);
  const [gizmoRotation, setGizmoRotation] = useState<90 | 15>(90);
  const [gizmoLive, setGizmoLive] = useState<Matrix4Tuple | null>(null);
  const [typed, setTyped] = useState<[string, string, string] | null>(null);
  const [manipSettings, setManipSettings] = useState(false);

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
  // width of the side panel (notice, model, editor): chosen with the separator, remembered per context
  const panel = useSidePanel(editing ? 'editor' : 'atelier');

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

  const freeMode = session?.mode === 'freeManual';
  const match = useMemo(() => (ctx && session && freeMode ? matchToModel(ctx, session) : null), [ctx, session, freeMode]);
  // model targets already taken (anchored or occupied by a free piece), the moved piece excepted
  const occupied = useMemo(() => {
    if (!ctx || !session || !freeMode) return null;
    const base = held?.moving ? removePiece(session, held.moving) : session;
    return occupiedView(base, held?.moving ? matchToModel(ctx, base) : match!);
  }, [ctx, session, freeMode, held?.moving, match]);
  const groundY = useMemo(() => (loaded?.geometry && ctx ? modelGroundY(ctx.occurrences, loaded.geometry.templates) : 0), [loaded, ctx]);
  const [snapPieces, setSnapPieces] = useState(true);
  // "Voir les connexions": the pieces outside the selection seen through (display only)
  const [xray, setXray] = useState(false);
  // what the connections tell about the pose shown: the proposal of the pieces magnet, the connections
  // verified at that exact pose (the green markers), or why nothing snaps
  const [snapInfo, setSnapInfo] = useState<{ proposal: SnapProposal | null; engaged: Engagement; miss: SnapMiss | null } | null>(null);
  const snapRef = useRef<SnapProposal | null>(null);
  const snapInfoKey = useRef('');
  const engagedRef = useRef<{ engaged: Engagement; miss: SnapMiss | null } | null>(null);
  // where the previous proposal put the piece(s) in hand, for the same hand: kept on small moves
  const stickRef = useRef<{ hand: string; at: readonly [number, number, number] } | null>(null);
  // Option (⌥) held: the snapping between pieces is bypassed while moving
  const altDown = useRef(false);
  useEffect(() => {
    const on = (e: KeyboardEvent) => { altDown.current = e.altKey; };
    const off = () => { altDown.current = false; };
    window.addEventListener('keydown', on);
    window.addEventListener('keyup', on);
    window.addEventListener('blur', off);
    return () => {
      window.removeEventListener('keydown', on);
      window.removeEventListener('keyup', on);
      window.removeEventListener('blur', off);
    };
  }, []);

  // the parts of the model: their connectors are read once the geometry is shown (same files, cached)
  useEffect(() => {
    if (!loaded?.geometry) return;
    let live = true;
    const keys = [...new Set(loaded.analysis.model.occurrences.map((o) => o.partKey))];
    void Promise.all(keys.map((k) => connectorCatalog.get(k))).then(() => {
      if (live) setConnectorsVersion((v) => v + 1);
    });
    return () => {
      live = false;
    };
  }, [loaded, connectorCatalog]);
  const peekConnectors = useCallback((partKey: string) => connectorCatalog.peek(partKey), [connectorCatalog]);

  /** Placed pieces as seen by the connections (piece keys: `f:` free, `a:` on a model target). */
  const placedPieces = useCallback((exclude: ReadonlySet<string> = new Set()): PlacedPiece[] => {
    if (!ctx || !session) return [];
    const byId = new Map(ctx.occurrences.map((o) => [o.occurrenceId, o] as const));
    return [
      ...session.placed.flatMap((id) => (exclude.has(`a:${id}`) || !byId.get(id) ? [] : [{ key: `a:${id}`, partKey: byId.get(id)!.partKey, pose: byId.get(id)!.targetMatrix }])),
      ...freePiecesOf(session).flatMap((f) => (exclude.has(`f:${f.id}`) ? [] : [{ key: `f:${f.id}`, partKey: f.partKey, pose: f.pose }])),
    ];
  }, [ctx, session]);
  const refKey = (r: PieceRef) => (r.kind === 'free' ? `f:${r.id}` : `a:${r.occurrenceId}`);
  const refOf = (key: string): PieceRef => (key.startsWith('f:') ? { kind: 'free', id: key.slice(2) } : { kind: 'anchored', occurrenceId: key.slice(2) });

  /** Free mode: every change goes through here, so that it can be undone. */
  const commitFree = (next: BuildSession) => {
    if (session) setFreeHistory((h) => [...h.slice(-199), session]);
    setSession(next);
  };

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
    setFreeHistory([]);
    setPendingSwitch(null);
    setSelection([]);
    const storedMapping = await store.loadMapping(hash);
    const restoredMapping = storedMapping?.ok ? storedMapping.mapping : null;
    setMapping(restoredMapping);
    setEditStepId(restoredMapping?.steps[0]?.id ?? null);
    if (tab === 'mapping') setTab('model');
    const restored = restoreProgress(await store.loadProgress(hash), hash, analysis.model.occurrences);
    if (restored.ok && quality.quality !== 'INVALID') {
      const total = analysis.model.occurrences.length;
      let next = restored.session;
      const freeCount = freePiecesOf(next).length;
      let text = `Progression restaurée : ${usedCount(next)}/${total} pièces posées${freeCount > 0 ? `, dont ${freeCount} posée(s) librement` : ''}.`;
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
    if (started.current) return;
    // standalone atelier, « Essayer la démo » of the first launch: the embedded CC0 model, imported
    // exactly as a file chosen by hand (progress kept in this browser, nothing added to the library)
    if (!initial && !library && new URLSearchParams(window.location.search).get('demo') === DEMO_ID) {
      started.current = true;
      const bytes = new TextEncoder().encode(DEMO_MODEL.text);
      void sha256Hex(bytes).then((hash) => importText(DEMO_MODEL.fileName, DEMO_MODEL.text, hash));
      return;
    }
    if (!initial) return;
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
    freeManual: 'Montage libre : prends une pièce et pose-la où tu veux, la notice reste consultable. Clic sur une pièce posée : la reprendre.',
    synced: 'Notice synchronisée : la page de l’étape s’affiche, seules ses pièces sont proposées.',
  };
  const start = (mode: BuildMode, keepPieces = false, dropUnmatched = false) => {
    let next = createSession(mode);
    let note = '';
    if (keepPieces && session) {
      if (mode !== 'freeManual' && freePiecesOf(session).length > 0 && ctx) {
        // free pieces off the model: never removed without an explicit choice
        const r = toStepped(ctx, session, mode, dropUnmatched);
        if (!r.ok) return setPendingSwitch({ mode, recognised: r.recognised, unmatched: r.unmatched });
        next = r.session;
        note = ` ${r.recognised} pièce(s) posée(s) librement reconnue(s) à leur place dans le modèle${r.dropped > 0 ? `, ${r.dropped} remise(s) dans le stock` : ''}.`;
      } else next = switchMode(session, mode);
    }
    setSession(next);
    setPendingSwitch(null);
    setFreeHistory([]);
    setSelection([]);
    setShowTargets(isStepped(mode));
    setHeld(null);
    setConsultIdx(null);
    if (mode === 'synced') setTab('pdf');
    setMessage(note ? { kind: 'info', text: note.trim() } : null);
  };

  const pick = (item: TrayItem) => {
    if (!ctx || !session) return;
    const compatible = candidates(ctx, occupied ?? session).filter((o) => trayKey(o.partKey, o.colorCode) === item.key);
    const lowest = Math.max(...compatible.map((o) => Math.round(o.targetMatrix[13])));
    const orientation = orientationChoices(ctx, item.partKey, item.colorCode)[0]!;
    setOrientationIdx(0);
    setHeld({ partKey: item.partKey, colorCode: item.colorCode, quarterTurns: 0, layerY: Number.isFinite(lowest) ? lowest : layers[0] ?? 0, orientation, layerMode: 'auto' });
  };

  /** Vertices of a part (part-local), from the geometry already loaded; null when not rendered. */
  const verticesOfPart = (partKey: string, _pose?: unknown): number[] | null => {
    const cached = verticesCache.current.get(partKey);
    if (cached) return cached;
    const template = [...(loaded?.geometry?.templates.entries() ?? [])].find(([k]) => k.startsWith(`${partKey}|`))?.[1];
    if (!template) return null;
    const v = templateVertices(template);
    verticesCache.current.set(partKey, v);
    return v;
  };

  /** Lowest point of a piece under its origin, for a given pose (real geometry). */
  const bottomOf = (partKey: string, colorCode: string, pose: readonly number[]) => {
    const template = loaded?.geometry?.templates.get(trayKey(partKey, colorCode));
    if (!template) return 0;
    let v = verticesCache.current.get(partKey);
    if (!v) {
      v = templateVertices(template);
      verticesCache.current.set(partKey, v);
    }
    return bottomExtent(v, pose as never);
  };

  /** Free mode: one placed piece taken again (move, turn, remove). */
  const take = (ref: PieceRef) => {
    if (!ctx || !session || session.mode !== 'freeManual') return;
    const kind = pieceKind(ctx, session, ref);
    const pose = poseOf(ctx, session, ref);
    if (!kind || !pose) return;
    setOrientationIdx(0);
    liftXZ.current = null;
    setHeld({ ...kind, quarterTurns: 0, layerY: pose[13], orientation: withTranslation(pose, [0, 0, 0]), layerMode: 'auto', moving: ref });
  };

  /** Free mode: click on a placed piece = select it; Shift+click = add / remove; click elsewhere = clear. */
  const select = (ref: PieceRef | null, { shift }: { shift: boolean }) => {
    if (!session || session.mode !== 'freeManual') return;
    if (!ref) {
      if (!shift && selection.length > 0) setSelection([]);
      return;
    }
    const has = selection.some((r) => sameRef(r, ref));
    const next = shift ? (has ? selection.filter((r) => !sameRef(r, ref)) : [...selection, ref]) : [ref];
    setSelection(next);
  };

  /**
   * The connected assembly of the selected pieces: every piece joined to them by a recognised
   * connection (stud in a receptor, pin in a pin hole), directly or through others.
   */
  const selectAssembly = (start: readonly PieceRef[] = selection) => {
    if (!session || session.mode !== 'freeManual' || start.length === 0) return;
    const graph = connectionGraph(connectorIndex() ?? new ConnectorIndex(placedPieces(), peekConnectors));
    const keys = connectedAssembly(graph, start.map(refKey));
    setSelection(keys.map(refOf));
    setMessage({
      kind: 'info',
      text: keys.length > start.length
        ? `Assemblage sélectionné : ${keys.length} pièces reliées par des connexions reconnues (tenons, goupilles, axes), visibles ou cachées. Glisse-le ou « Déplacer la sélection ».`
        : 'Aucune autre pièce reliée par une connexion reconnue : ajoute-les avec Maj + clic (clips, barres, charnières… ne sont pas reconnus).',
    });
  };

  /** The selection in hand: one piece as before, several as one rigid group around a common pivot. */
  const moveSelection = (refs: readonly PieceRef[] = selection) => {
    if (!ctx || !session || refs.length === 0) return;
    if (refs.length === 1) return take(refs[0]!);
    const members = refs.flatMap((ref) => {
      const kind = pieceKind(ctx, session, ref);
      const pose = poseOf(ctx, session, ref);
      return kind && pose ? [{ ref, ...kind, pose, bottom: bottomOf(kind.partKey, kind.colorCode, pose) }] : [];
    });
    if (members.length !== refs.length) return;
    const group = makeGroup(members);
    liftXZ.current = null;
    setHeld({ partKey: members[0]!.partKey, colorCode: members[0]!.colorCode, quarterTurns: 0, layerY: group.pivot[1], orientation: IDENTITY, layerMode: 'auto', group });
  };

  /**
   * Direct manipulation: a drag on a placed piece takes it — with the rest of the selection when it
   * belongs to it (Shift at the start adds it) — and the release puts it where it is shown.
   */
  const dragStart = (ref: PieceRef, { shift }: { shift: boolean }) => {
    if (!session || session.mode !== 'freeManual' || held) return;
    const inSelection = selection.some((r) => sameRef(r, ref));
    const refs = inSelection ? selection : shift ? [...selection, ref] : [ref];
    setSelection(refs);
    dragging.current = true;
    moveSelection(refs);
  };
  const dragEnd = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (held && previewRef.current) drop(); // Échap during the drag: nothing in hand any more, nothing placed
  };

  /** Puts the pieces in hand (moved piece or group) back into the stock, in one action. */
  const removeHeld = () => {
    if (!session || !(held?.moving || held?.group)) return;
    const refs = held.group ? held.group.members.map((m) => m.ref) : [held.moving!];
    commitFree(removePieces(session, refs));
    setHeld(null);
    setSelection([]);
    setMessage({ kind: 'ok', text: refs.length === 1 ? 'Pièce remise dans le stock.' : `${refs.length} pièces remises dans le stock.` });
  };

  const removeSelection = () => {
    if (!session || selection.length === 0 || held) return;
    commitFree(removePieces(session, selection));
    setMessage({ kind: 'ok', text: selection.length === 1 ? 'Pièce remise dans le stock.' : `${selection.length} pièces remises dans le stock.` });
    setSelection([]);
  };

  /** Free mode: manual height, independent of the model levels; the piece goes straight up or down. */
  const lift = (steps: number, step = heightStep) => {
    if (!held || session?.mode !== 'freeManual') return;
    const shown = previewRef.current;
    const from = held.layerMode === 'manual' ? held.layerY : shown?.layerY ?? held.layerY;
    if (shown) liftXZ.current = [shown.previewPose[12], shown.previewPose[14]];
    setHeld({ ...held, layerMode: 'manual', layerY: liftedY(from, steps, step) });
  };
  const autoHeight = () => {
    if (!held) return;
    liftXZ.current = null;
    setHeld({ ...held, layerMode: 'auto' });
  };
  /** Rotation of what is in hand: the orientation and the quarter turns (guided-style R) folded together. */
  const heldRotation = (h: HeldBrick) => withTranslation(multiply(rotationY(h.quarterTurns), h.orientation), [0, 0, 0]);
  const memberBottom = (m: GroupMember, rotation: Matrix4Tuple) => bottomOf(m.partKey, m.colorCode, rotation);

  /** Free mode: ±90° around X, Y or Z — the piece or group in hand, else the selection turned in place. */
  const rotate = (axis: Axis, steps: number) => {
    if (!session || session.mode !== 'freeManual' || !ctx) return;
    if (held) {
      setHeld({ ...held, orientation: rotateOrientation(heldRotation(held), axis, steps), quarterTurns: 0 });
      return;
    }
    if (selection.length === 0) return;
    const members = selection.flatMap((ref) => {
      const kind = pieceKind(ctx, session, ref);
      const pose = poseOf(ctx, session, ref);
      return kind && pose ? [{ ref, ...kind, pose, bottom: bottomOf(kind.partKey, kind.colorCode, pose) }] : [];
    });
    if (members.length !== selection.length) return;
    const group = makeGroup(members);
    const poses = rotatedInPlace(group, quarterTurn(axis, steps), memberBottom);
    const r = moveGroup(ctx, session, group.members.map((m, i) => ({ ref: m.ref, pose: poses[i]! })));
    if (!r.ok) return setMessage({ kind: 'error', text: `Rotation impossible : ${FREE_FAILURE[r.reason]}` });
    commitFree(r.session);
    setSelection([...r.refs]);
    setMessage({ kind: 'ok', text: `${members.length > 1 ? `${members.length} pièces tournées` : 'Pièce tournée'} sur place (${axis.toUpperCase()} ${steps > 0 ? '+' : '−'}90°).` });
  };

  const cancelHeld = () => {
    if (!held) return;
    setHeld(null);
    if (held.moving || held.group) setMessage({ kind: 'info', text: held.group ? 'Groupe laissé où il était.' : 'Pièce laissée où elle était.' });
  };

  /** Free mode: result of a drop (new piece, moved piece, or the assisted placement). */
  const finishFree = (r: FreeResult) => {
    if (!ctx || !held) return;
    if (!r.ok) return setMessage({ kind: 'error', text: FREE_FAILURE[r.reason] });
    commitFree(r.session);
    previewRef.current = null;
    setPreview(null);
    const where = matchToModel(ctx, r.session).byPiece.has(r.pieceId) ? ' à sa place dans le modèle' : ' librement';
    if (held.moving) {
      setHeld(null);
      setSelection([{ kind: 'free', id: r.pieceId }]);
      return setMessage({ kind: 'ok', text: `Pièce déplacée${where}.` });
    }
    if (stockLeft(ctx, r.session, held.partKey, held.colorCode) <= 0) setHeld(null);
    setMessage(isStockExhausted(ctx, r.session)
      ? { kind: 'ok', text: freeEndText(atModelCount(r.session, matchToModel(ctx, r.session)), ctx.occurrences.length) }
      : { kind: 'ok', text: `Pièce posée${where} (${usedCount(r.session)}/${ctx.occurrences.length}).` });
  };

  const undoAction = () => {
    if (!session) return;
    setConsultIdx(null);
    if (session.mode !== 'freeManual') return setSession(undo(session));
    if (held?.moving || held?.group) setHeld(null);
    if (freeHistory.length > 0) {
      setSession(freeHistory.at(-1)!);
      setFreeHistory((h) => h.slice(0, -1));
    } else setSession(removeLast(session));
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
    if (session.mode === 'freeManual' && held.group) {
      // the whole group or nothing: one action, undone at once
      const group = held.group;
      const poses = groupPoses(group, heldRotation(held), [shown.pose[12], shown.pose[13], shown.pose[14]]);
      const r = moveGroup(ctx, session, group.members.map((m, i) => ({ ref: m.ref, pose: poses[i]! })));
      if (process.env.NODE_ENV !== 'production') window.__brickLabLastDrop = { pose: [...shown.pose], layerY: shown.layerY, ok: r.ok, targetId: null };
      if (!r.ok) return setMessage({ kind: 'error', text: `Groupe non déplacé : ${FREE_FAILURE[r.reason]}` });
      commitFree(r.session);
      previewRef.current = null;
      setPreview(null);
      setHeld(null);
      setSelection([...r.refs]);
      return setMessage({ kind: 'ok', text: `Groupe de ${group.members.length} pièces déplacé (« Annuler » le remet en place d’un coup).` });
    }
    if (session.mode === 'freeManual') {
      // no comparison with the model: the piece goes where it is shown
      const r = held.moving ? movePiece(ctx, session, held.moving, shown.previewPose) : placeFree(ctx, session, held, shown.previewPose);
      if (process.env.NODE_ENV !== 'production') window.__brickLabLastDrop = { pose: [...shown.previewPose], layerY: shown.layerY, ok: r.ok, targetId: shown.targetId };
      return finishFree(r);
    }
    const r = tryPlace(ctx, session, held, shown.pose);
    if (process.env.NODE_ENV !== 'production') window.__brickLabLastDrop = { pose: [...shown.pose], layerY: shown.layerY, ok: r.ok, targetId: r.ok ? r.occurrenceId : null };
    if (r.ok) {
      previewRef.current = null;
      setPreview(null);
      applyPlacement(r.session, r.occurrenceId);
    } else setMessage({ kind: 'error', text: describeFailure(r) });
  };

  // Height of the held brick under its current orientation, from its real geometry.
  const heldBottom = useMemo(() => {
    if (!held || !loaded?.geometry) return 0;
    // a group rests by its lowest point, for its current rotation
    if (held.group) return groupBottom(held.group, heldRotation(held), memberBottom);
    const template = loaded.geometry.templates.get(trayKey(held.partKey, held.colorCode));
    if (!template) return 0;
    let v = verticesCache.current.get(held.partKey);
    if (!v) {
      v = templateVertices(template);
      verticesCache.current.set(held.partKey, v);
    }
    return bottomExtent(v, heldRotation(held));
  }, [held, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ONE index of the connectors of the placed pieces per state of the build (snapping, assemblies,
  // graph), rebuilt when the build changes or when the connectors of one more part become known (a
  // slow browser may be hovering before every part is read). It never depends on the hand: the
  // piece(s) in hand are excluded at query time. (A memo keyed on the hand used to stay null for a
  // piece taken from the tray: no snap until it was placed and taken again — owner's bug on 31039,
  // 08/11/2026.)
  const indexCache = useRef<{ pieces: unknown; version: number; index: ConnectorIndex } | null>(null);
  const connectorIndex = useCallback((): ConnectorIndex | null => {
    if (!freeMode) return null;
    const c = indexCache.current;
    if (c && c.pieces === placedPieces && c.version === connectorCatalog.version) return c.index;
    const index = new ConnectorIndex(placedPieces(), peekConnectors);
    indexCache.current = { pieces: placedPieces, version: connectorCatalog.version, index };
    return index;
  }, [freeMode, placedPieces, peekConnectors, connectorCatalog]);
  const piecesInHand = useMemo(
    () => new Set([held?.moving, ...(held?.group?.members.map((m) => m.ref) ?? [])].flatMap((r) => (r ? [refKey(r)] : []))),
    [held?.moving, held?.group], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const updatePreview = useCallback((ray: Ray, hit: HoverHit | null) => {
    lastHover.current = { ray, hit };
    if (!ctx || !session || !held) return;
    let r = session.mode === 'freeManual' && occupied
      ? resolveFreeHover(ctx, held, ray, hit, heldBottom, { groundY, grid: snap.grid, magnet: snap.magnet && !held.group, occupied, fixedXZ: liftXZ.current })
      : resolveHover(ctx, session, held, ray, hit, heldBottom);
    if (!r) return;
    let info: { proposal: SnapProposal | null; engaged: Engagement; miss: SnapMiss | null } | null = null;
    const index = session.mode === 'freeManual' ? connectorIndex() : null;
    if (index) {
      // the connectors of the piece(s) in hand where they are shown — same path for a piece from the
      // tray, a piece taken again and a group (the model magnet, when it found the official spot, wins)
      const anchorOf = (res: HoverResolution) => (held.group ? res.pose : res.previewPose);
      const shown = held.group
        ? groupPoses(held.group, heldRotation(held), [r.pose[12], r.pose[13], r.pose[14]]).map((pose, i) => ({ partKey: held.group!.members[i]!.partKey, pose }))
        : [{ partKey: held.partKey, pose: r.previewPose }];
      const hand = `${held.partKey}|${held.moving ? refKey(held.moving) : ''}|${held.group ? 'g' : ''}|${heldRotation(held).slice(0, 12).join(',')}`;
      const a = anchorOf(r);
      const prev = stickRef.current?.hand === hand ? stickRef.current.at : null;
      const result = snapHover(heldConnectors(shown, peekConnectors), index, {
        pieces: snapPieces && !altDown.current && !r.targetId,
        keepHeight: held.layerMode === 'manual',
        exclude: piecesInHand,
        stick: prev ? [prev[0] - a[12], prev[1] - a[13], prev[2] - a[14]] : null,
      });
      const d = result.proposal?.delta;
      if (d && Math.hypot(...d) > 0.01) {
        // to the hundredth, as saved (poseToLDraw): the pose shown is the pose saved, digit for digit
        const at = (v: number) => Math.round(v * 100) / 100;
        const shift = (m: Matrix4Tuple) => withTranslation(m, [at(m[12] + d[0]), at(m[13] + d[1]), at(m[14] + d[2])]);
        const moved = shift(r.previewPose);
        // still at its place in the model after the snap? (information only)
        const place = !held.group && occupied ? tryPlace(ctx, occupied, held, moved, FREE_TARGET_MAGNET) : null;
        r = { ...r, pose: shift(r.pose), previewPose: moved, layerY: r.layerY + d[1], source: 'snap', targetId: place?.ok ? place.occurrenceId : null };
      }
      const b = anchorOf(r);
      stickRef.current = result.proposal ? { hand, at: [b[12], b[13], b[14]] } : null;
      info = result;
    }
    snapRef.current = info?.proposal ?? null;
    engagedRef.current = info ? { engaged: info.engaged, miss: info.miss } : null;
    // a new state only when something changed: a pointer move must not re-render the atelier for nothing
    const infoKey = info ? JSON.stringify([info.proposal?.delta, info.proposal?.targets, info.engaged.points, info.miss]) : '';
    if (infoKey !== snapInfoKey.current) {
      snapInfoKey.current = infoKey;
      setSnapInfo(info);
    }
    previewRef.current = r;
    setPreview(r);
  }, [ctx, session, held, heldBottom, occupied, groundY, snap, snapPieces, connectorIndex, piecesInHand, peekConnectors, connectorsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rotation, orientation, layer or session changes: recompute the preview at the same pointer position.
  useEffect(() => {
    if (!held) {
      previewRef.current = null;
      setPreview(null);
      snapRef.current = null;
      engagedRef.current = null;
      stickRef.current = null;
      snapInfoKey.current = '';
      setSnapInfo(null);
      return;
    }
    if (lastHover.current) updatePreview(lastHover.current.ray, lastHover.current.hit);
  }, [held, session, updatePreview]);

  const assistPlace = () => {
    if (!ctx || !session || !held) return;
    const options = candidates(ctx, occupied ?? session).filter((o) => o.partKey === held.partKey && o.colorCode === held.colorCode);
    const [x, z] = preview ? [preview.pose[12], preview.pose[14]] : [0, 0];
    const target = options.sort((a, b) => Math.hypot(a.targetMatrix[12] - x, a.targetMatrix[14] - z) - Math.hypot(b.targetMatrix[12] - x, b.targetMatrix[14] - z))[0];
    if (!target) return;
    if (session.mode === 'freeManual') {
      return finishFree(held.moving ? movePiece(ctx, session, held.moving, target.targetMatrix) : placeFree(ctx, session, held, target.targetMatrix));
    }
    const r = placeExact(ctx, session, target.occurrenceId);
    if (r.ok) applyPlacement(r.session, r.occurrenceId);
  };

  const heldOrientations = useMemo(
    () => (held && ctx ? orientationChoices(ctx, held.partKey, held.colorCode) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx, held?.partKey, held?.colorCode],
  );
  const nextOrientation = useCallback(() => {
    if (!held || held.group || heldOrientations.length === 0) return;
    const next = (orientationIdx + 1) % heldOrientations.length;
    setOrientationIdx(next);
    setHeld({ ...held, orientation: heldOrientations[next]! });
  }, [held, heldOrientations, orientationIdx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && session) {
        e.preventDefault();
        undoAction();
        return;
      }
      const free = session?.mode === 'freeManual';
      if ((e.key === 'g' || e.key === 'G') && free) return setSnap((v) => ({ ...v, grid: !v.grid }));
      // free mode: ±90° around X / Y / Z (Shift: −90°); R = Y as in the other modes
      const axisKey = free && !e.metaKey && !e.ctrlKey && !e.altKey ? ({ x: 'x', y: 'y', z: 'z' } as Record<string, Axis>)[e.key.toLowerCase()] : undefined;
      if (axisKey && (held || selection.length > 0)) return rotate(axisKey, e.shiftKey ? -1 : 1);
      // R: a quarter turn around Y, as in the other modes (the piece in hand), or the selection in place
      if ((e.key === 'r' || e.key === 'R') && free && !held && selection.length > 0) return rotate('y', e.shiftKey ? -1 : 1);
      if (!held) {
        // free mode, nothing in hand: the selection
        if (!free || selection.length === 0) return;
        if (e.key === 'w' || e.key === 'W') return setGizmoMode('translate');
        if (e.key === 'e' || e.key === 'E') return setGizmoMode('rotate');
        if (e.key === 'q' || e.key === 'Q') return setGizmoSpace((v) => (v === 'world' ? 'local' : 'world'));
        if (e.key === 'm' || e.key === 'M') moveSelection(selection);
        else if (e.key === 'Escape') setSelection([]);
        else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          removeSelection();
        }
        return;
      }
      if (e.key === 'r' || e.key === 'R') setHeld({ ...held, quarterTurns: held.quarterTurns + (e.shiftKey ? 3 : 1) });
      else if (e.key === 'o' || e.key === 'O') nextOrientation();
      else if (e.key === 'Escape') cancelHeld();
      else if ((e.key === 'Delete' || e.key === 'Backspace') && (held.moving || held.group)) {
        e.preventDefault();
        removeHeld();
      }
      else if (e.key === 'a' || e.key === 'A') autoHeight();
      else if ((e.key === 'PageUp' || e.key === 'PageDown') && free) {
        // free height: one plate per key (Shift: 1 LDU), whatever the model levels
        e.preventDefault();
        lift(e.key === 'PageUp' ? 1 : -1, e.shiftKey ? FINE_HEIGHT_STEP_LDU : heightStep);
      } else if (e.key === 'PageUp' || e.key === 'PageDown') {
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
  }, [held, layers, session, nextOrientation, undoAction, removeHeld, selection, moveSelection, removeSelection, lift, autoHeight, cancelHeld, heightStep, rotate]);

  // Dev/test only: read-only view of the game state for the E2E "scripted player".
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    window.__brickLabGame = {
      // free mode: the targets not occupied yet, for pieces still in the stock
      candidates: () => (ctx && session
        ? candidates(ctx, occupied ?? session)
          .filter((o) => session.mode !== 'freeManual' || stockLeft(ctx, session, o.partKey, o.colorCode) > 0)
          .map((o) => ({ id: o.occurrenceId, partKey: o.partKey, colorCode: o.colorCode, matrix: [...o.targetMatrix] }))
        : []),
      freePieces: () => (session ? freePiecesOf(session).map((f) => ({ id: f.id, partKey: f.partKey, colorCode: f.colorCode, pose: [...f.pose] })) : []),
      atModel: () => (session ? atModelCount(session, match ?? { byPiece: new Map(), unmatched: [] }) : 0),
      ground: () => groundY,
      selection: () => [...selection],
      snap: () => snapRef.current,
      engaged: () => engagedRef.current?.engaged ?? null,
      snapMiss: () => engagedRef.current?.miss ?? null,
      connectors: (partKey: string) => peekConnectors(partKey)?.connectors.map((c) => ({ kind: c.kind, pos: [...c.pos] })) ?? null,
      graph: () => Object.fromEntries([...connectionGraph(connectorIndex() ?? new ConnectorIndex(placedPieces(), peekConnectors))].map(([k, v]) => [k, [...v].sort()])),
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
  }, [ctx, session, held, preview, heldBottom, orientationIdx, heldOrientations, layers, occupied, match, groundY, selection, connectorIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // pieces of the selection that no longer exist (undo, removal) leave it
  useEffect(() => {
    if (!ctx || !session) return;
    setSelection((sel) => {
      const kept = sel.filter((r) => poseOf(ctx, session, r) !== null);
      return kept.length === sel.length ? sel : kept;
    });
  }, [ctx, session]);

  const restart = async () => {
    if (!loaded) return;
    // confirmed in a dialog first (decision A5, standalone atelier included); library: the
    // progress goes to the build's history
    setConfirmRestart(false);
    if (!(await store.clearProgress(loaded.hash))) return;
    setSession(null);
    setFreeHistory([]);
    setSelection([]);
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

  /** ← / → move between the tabs of the side panel (roving focus, as in a native tab list). */
  const onTabKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const tabs: ('model' | 'pdf' | 'mapping')[] = loaded ? ['model', 'pdf', 'mapping'] : ['model', 'pdf'];
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = tabs[(tabs.indexOf(tab) + d + tabs.length) % tabs.length]!;
    if (next === 'mapping') openEditor();
    else setTab(next);
    requestAnimationFrame(() => document.getElementById(`tab-${next}`)?.focus());
  };

  const geometry = loaded?.geometry ?? null;
  const missing = geometry ? [...geometry.missingParts] : [];
  const playable = loaded && (loaded.quality.quality === 'GUIDED_PLAYABLE' || loaded.quality.quality === 'MANUAL_ONLY' || loaded.quality.quality === 'RENDERABLE');
  const placedSet = new Set(session?.placed ?? []);
  const stepIdx = activeIdx;
  const openCandidates = ctx && session ? candidates(ctx, occupied ?? session) : [];
  let ghostIds = new Set(
    !session || !showTargets ? []
      : openCandidates.filter((o) => isStepped(session.mode) || (held && o.partKey === held.partKey && o.colorCode === held.colorCode)).map((o) => o.occurrenceId),
  );
  // a piece taken again (free mode) is shown only in the hand
  const inHand = new Set([held?.moving, ...(held?.group?.members.map((m) => m.ref) ?? [])].flatMap((r) => (r?.kind === 'anchored' ? [r.occurrenceId] : [])));
  let solidIds = session ? (inHand.size > 0 ? new Set([...placedSet].filter((id) => !inHand.has(id))) : placedSet) : new Set(ctx?.occurrences.map((o) => o.occurrenceId) ?? []);
  let highlightIds: Set<string> = synced && consultIdx !== null && shownStep ? new Set(shownStep.occurrenceIds) : new Set();
  if (freeMode) {
    // selected pieces: free ones by id, anchored ones (older builds) through the highlight
    for (const r of selection) if (r.kind === 'anchored' && !inHand.has(r.occurrenceId)) highlightIds.add(r.occurrenceId);
  }
  const selectedFree = new Set(selection.flatMap((r) => (r.kind === 'free' ? [r.id] : [])));
  const groupPreview = held?.group && preview
    ? groupPoses(held.group, heldRotation(held), [preview.pose[12], preview.pose[13], preview.pose[14]])
      .map((pose, i) => ({ partKey: held.group!.members[i]!.partKey, colorCode: held.group!.members[i]!.colorCode, pose }))
    : null;
  const heightAboveGround = preview ? Math.round((groundY - (preview.layerY + heldBottom)) * 100) / 100 : null;
  // the transform gizmo: on the selection, in free mode, with nothing in hand
  const gizmo: GizmoSpec | null = useMemo(() => {
    if (!freeMode || editing || held || !ctx || !session || selection.length === 0) return null;
    const members = selection.flatMap((ref) => {
      const kind = pieceKind(ctx, session, ref);
      const pose = poseOf(ctx, session, ref);
      return kind && pose ? [{ ref, key: refKey(ref), ...kind, pose }] : [];
    });
    if (members.length !== selection.length) return null;
    const pivot = members.length === 1 ? members[0]!.pose
      : withTranslation(IDENTITY, makeGroup(members.map((m) => ({ ...m, bottom: bottomOf(m.partKey, m.colorCode, m.pose) }))).pivot);
    const grid = snap.grid ? gizmoStep : null;
    return {
      members, pivot, mode: gizmoMode, space: gizmoSpace,
      stepXZ: grid, stepY: grid === null ? null : grid === 1 ? 1 : 8,
      rotationStep: (gizmoRotation * Math.PI) / 180,
    };
  }, [freeMode, editing, held, ctx, session, selection, snap.grid, gizmoStep, gizmoMode, gizmoSpace, gizmoRotation]); // eslint-disable-line react-hooks/exhaustive-deps

  /** One transform of the whole selection (gizmo drag or typed coordinates): all or nothing, one undo. */
  const transformSelection = (delta: Matrix4Tuple, what: string) => {
    setGizmoLive(null);
    setTyped(null);
    if (!ctx || !session || !gizmo) return;
    const identity = delta.every((v, i) => Math.abs(v - IDENTITY[i]!) < 1e-9);
    if (identity) return;
    const poses = applyDelta(delta, gizmo.members.map((m) => m.pose));
    const r = moveGroup(ctx, session, gizmo.members.map((m, i) => ({ ref: refOf(m.key), pose: poses[i]! })));
    if (!r.ok) return setMessage({ kind: 'error', text: `${what} impossible : ${FREE_FAILURE[r.reason]}` });
    commitFree(r.session);
    setSelection([...r.refs]);
    setMessage({ kind: 'ok', text: `${gizmo.members.length > 1 ? `${gizmo.members.length} pièces` : 'Pièce'} : ${what} (« Annuler » revient en une fois).` });
  };
  const shown = gizmo ? shownCoords(gizmoLive ?? gizmo.pivot, groundY) : null;
  const applyTyped = () => {
    if (!gizmo || !typed) return;
    const v = typed.map((t) => Number(t.replace(',', '.'))) as [number, number, number];
    if (!v.every(Number.isFinite)) return setMessage({ kind: 'error', text: 'Coordonnées invalides.' });
    transformSelection(deltaTo(gizmo.pivot, v, groundY), 'déplacée aux coordonnées saisies');
  };

  // orientation in words: the piece in hand, or the only selected piece
  const shownRotation = held && !held.group ? heldRotation(held)
    : !held && selection.length === 1 && ctx && session ? poseOf(ctx, session, selection[0]!) : null;
  const orientation = shownRotation ? orientationLabel(shownRotation) : null;
  const orientationInfo = orientation && <span className="small muted" data-testid="orientation-info">Dessus : {orientation.top} · Avant : {orientation.front}</span>;
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

  // status of the piece in hand, in the HUD at the top left of the 3D view (every mode)
  const heldInfo = held ? (
    <span className="small muted" data-testid="held-info">
      {held.moving ? 'Pièce reprise · ' : held.group ? `Groupe de ${held.group.members.length} pièces · ` : ''}
      {held.layerMode === 'auto' ? 'Niveau auto (surface)' : freeMode ? 'Hauteur manuelle (A : auto)' : `Niveau manuel ${layers.indexOf(held.layerY) + 1}/${layers.length} (A : auto)`}
      {' · '}rotation {((held.quarterTurns % 4) + 4) % 4 * 90}° · orientation {orientationIdx + 1}/{heldOrientations.length}
      {snapInfo?.proposal
        ? <strong className="ok" data-testid="snap-info"> · aimant : {connectionsLabel(snapInfo.proposal)} sur {snapInfo.proposal.targets.length} pièce(s) (⌥ : ignorer)</strong>
        : preview?.targetId
          ? <strong className="ok" data-testid="target-found"> · {freeMode ? 'à sa place dans le modèle' : 'emplacement trouvé'}{snapInfo && snapInfo.engaged.pairs > 0 ? ` · ${connectionsLabel(snapInfo.engaged)} vérifié(s)` : ''}, clic pour poser</strong>
          : freeMode && preview ? <span data-testid="free-pose"> · pose libre{snapInfo && snapInfo.engaged.pairs > 0 ? ` · ${connectionsLabel(snapInfo.engaged)} vérifié(s)` : ''}, clic pour poser</span> : null}
      {snapInfo?.miss && snapInfo.miss !== 'NONE_NEAR' && <span className="snap-miss" data-testid="snap-miss"> · {SNAP_MISS[snapInfo.miss]}</span>}
    </span>
  ) : null;

  const sessionTotal = ctx?.occurrences.length ?? 0;
  const placedNow = session ? usedCount(session) : 0;
  const modeUnavailable: Partial<Record<BuildMode, string>> = loaded ? {
    ...(syncPlan ? {} : { synced: syncUnavailable || 'aucune correspondance notice ↔ 3D validée.' }),
    ...(availableModes(loaded.analysis.plan).includes('guided') ? {} : { guided: loaded.analysis.plan.kind === 'NO_STEPS' ? NO_STEPS_TEXT : 'étapes LDraw inutilisables.' }),
  } : {};
  const sceneHint = !session || editing ? null
    : held ? (held.group ? `Groupe de ${held.group.members.length} pièces en main : déplace la souris, clic (ou relâche) pour le poser · R, X / Y / Z : tourner · Monter / Descendre : hauteur · Échap : le laisser où il était.`
      : held.moving ? HINT_TAKEN : freeMode ? HINT_PICK_FREE : HINT_PICK)
      : freeMode && selection.length > 0 ? `${selection.length} pièce(s) sélectionnée(s) · flèches X / Y / Z (W) ou anneaux (E) du manipulateur, ou glisse la pièce · Maj+clic : ajouter ou retirer · Suppr : remettre dans le stock · Échap : désélectionner.`
        : MODE_HINT[session.mode];
  const showLdrawSetup = Boolean(loaded?.libraryProblem && !geometry);
  const restartText = `La progression (${placedNow}/${sessionTotal}) sera retirée de cette partie${library ? ' (copie gardée dans l’historique de la bibliothèque)' : ' et effacée de ce navigateur'}.`;
  const panelCollapsed = collapsed && !editing;

  return (
    <div className="app">
      <a className="skip-link" href="#panneau">Aller au panneau latéral</a>
      <div className="app-head">
      <AppBar crumbs={[...crumbs, ...(loaded && !initial ? [{ label: loaded.fileName, title: loaded.fileName }] : [])]}>
        {ctx && session && (
          <>
            <ModeSwitch value={session.mode} labels={MODE_LABEL} unavailable={modeUnavailable} onChange={(m) => start(m, true)} />
            <div className="atelier-progress">
              <div className="atelier-progress-main">
                <ProgressBar placed={placedNow} total={ctx.occurrences.length} />
                <span className="num" data-testid="progress">{placedNow}/{ctx.occurrences.length} pièces posées</span>
              </div>
              <div className="atelier-progress-sub small muted" title={[isStepped(session.mode) && stepIdx >= 0 ? `Étape ${stepIdx + 1} / ${ctx.plan.steps.length}` : '', match && freePiecesOf(session).length > 0 ? `${freePiecesOf(session).length} posée(s) librement · ${atModelCount(session, match)} à leur place dans le modèle` : ''].filter(Boolean).join(' · ') || undefined}>
                {isStepped(session.mode) && stepIdx >= 0 && <span data-testid="step-indicator">Étape {stepIdx + 1} / {ctx.plan.steps.length}</span>}
                {session.mode === 'synced' && ctx.plan.steps[stepIdx]?.instruction && (
                  <span data-testid="notice-step">Notice : {ctx.plan.steps[stepIdx]!.instruction!.label}, p. {ctx.plan.steps[stepIdx]!.instruction!.page}</span>
                )}
                {match && freePiecesOf(session).length > 0 && (
                  <span data-testid="free-info">{freePiecesOf(session).length} posée(s) librement · {atModelCount(session, match)} à leur place dans le modèle</span>
                )}
              </div>
            </div>
            {library
              ? <span className={`small save-state save-${saveState.kind}`} data-testid="save-state" role={saveState.kind === 'error' || saveState.kind === 'conflict' ? 'alert' : undefined}>
                {saveState.kind === 'saving' ? <LoaderCircle className="spinner" size={14} aria-hidden /> : saveState.kind === 'error' || saveState.kind === 'conflict' ? <CircleAlert size={14} aria-hidden /> : <Check size={14} aria-hidden />}
                {saveState.kind === 'error' || saveState.kind === 'conflict' ? `Non enregistré : ${saveState.message}` : saveState.kind === 'saving' ? SAVE_LABEL.saving : <>Enregistré<span className="visually-hidden"> dans la bibliothèque</span></>}
              </span>
              : <span className="small save-state save-saved"><Check size={14} aria-hidden />Sauvegardé localement</span>}
          </>
        )}
        <HelpButton />
      </AppBar>
      {banner}
      {saveState.kind === 'conflict' && (
        <div className="banner error" role="alert" data-testid="save-conflict">
          {saveState.message} <button type="button" onClick={() => window.location.reload()}>Recharger</button>
        </div>
      )}
      </div>

      <main className={editing ? 'workspace editing' : 'workspace'} ref={panel.ref} style={{ gridTemplateColumns: panelCollapsed ? 'minmax(0, 1fr) 0 0' : panel.gridTemplateColumns }} data-side-width={panel.side} data-panel={panelCollapsed ? 'collapsed' : 'open'}>
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
              onHover={(ray, hit) => { liftXZ.current = null; updatePreview(ray, hit); }}
              onDrop={drop}
              {...(editing ? { onPick: pickInEditor } : {})}
              {...(freeMode && !editing ? { freePieces: freePiecesOf(session!), selectedFree, groupPreview, onSelect: select, onDragStart: dragStart, onDragEnd: dragEnd, onDoublePick: (ref: PieceRef) => selectAssembly([ref]), snapPoints: snapInfo?.engaged.points ?? null, xray: xray && selection.length > 0 && !held,
                gizmo, onGizmoLive: setGizmoLive, onGizmoCommit: (d: Matrix4Tuple) => transformSelection(d, gizmoMode === 'rotate' ? 'tournée' : 'déplacée') } : {})}
              groundY={groundY}
              {...(freeMode && held && preview ? { axesAt: [preview.previewPose[12], preview.previewPose[13], preview.previewPose[14]] as const } : {})}
              recenterToken={recenter}
            />
          ) : showLdrawSetup ? (
            <div className="scene-screen">
              <LdrawSetup reason={loaded!.libraryProblem!} onRetry={() => void importText(loaded!.fileName, loaded!.text, loaded!.hash, loaded!.analysis.model.rootName)} />
            </div>
          ) : initial ? (
            // library build: no manual import here, only what is being loaded (or why it cannot render)
            <div className="scene-screen" data-testid="library-loading">
              {busy || !loaded ? <Loading>{busy ?? 'Chargement du modèle…'}</Loading> : null}
              {loaded && !geometry && <Note tone="error" role="alert">{renderStatus}</Note>}
            </div>
          ) : (
            <div className={`scene-screen home${homeDrag ? ' over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setHomeDrag(true); }} onDragLeave={() => setHomeDrag(false)}
              onDrop={(e) => { e.preventDefault(); setHomeDrag(false); const f = e.dataTransfer.files[0]; if (f) void onModelFile(f); }}>
              <span className="empty-icon" aria-hidden><Box size={22} /></span>
              <h1>Atelier sans collection</h1>
              <p className="muted">Reconstruis virtuellement un modèle LDraw pièce par pièce, sans l’ajouter à ta collection : la progression reste dans ce navigateur. Tout reste sur ce Mac. Application non affiliée à LEGO.</p>
              <div className="card-actions">
                <label className="button primary lg">
                  <Upload size={16} aria-hidden /> Importer un modèle (.mpd / .ldr)
                  <input type="file" accept=".ldr,.mpd" hidden data-testid="model-input"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void onModelFile(f); e.target.value = ''; }} />
                </label>
                <a className="button lg" href={`/atelier?demo=${DEMO_ID}`}><FlaskConical size={16} aria-hidden /> Essayer la démo</a>
              </div>
              <p className="small muted">ou dépose le fichier ici. <a href="https://www.lego.com/fr-fr/service/building-instructions" target="_blank" rel="noreferrer noopener">Trouver une notice sur LEGO.com</a> (ouvre le site, aucun téléchargement automatique)</p>
              {busy && <Loading>{busy}</Loading>}
              {loaded && !geometry && <Note tone="error" role="alert">{renderStatus}</Note>}
              {recent.length > 0 && (
                <section className="recent">
                  <h3 className="section-title">Sessions récentes de ce navigateur</h3>
                  <ul>{recent.map((r) => <li key={r.hash}>{r.displayName} — {r.placed}/{r.total} pièces · réimporte le fichier pour reprendre</li>)}</ul>
                </section>
              )}
            </div>
          )}
          {ctx && session && !editing && (
            <div className="scene-rail" role="toolbar" aria-label="Outils de la scène" aria-orientation="vertical">
              <button type="button" className="ghost icon" aria-label="Centrer" data-tip="Centrer la vue" data-tip-side="left" onClick={() => setRecenter((n) => n + 1)}><Crosshair size={18} aria-hidden /></button>
              <label className="tool-toggle" data-tip="Montrer les emplacements" data-tip-side="left">
                <input type="checkbox" aria-label="Montrer les emplacements" checked={showTargets} onChange={(e) => setShowTargets(e.target.checked)} />
                <Ghost size={18} aria-hidden />
              </label>
              {freeMode && (
                <>
                  <hr />
                  <label className="tool-toggle" data-tip="Grille d’un demi-tenon et niveaux de plaque (G)" data-tip-side="left">
                    <input type="checkbox" aria-label="Grille (G)" data-testid="snap-grid" checked={snap.grid} onChange={(e) => setSnap({ ...snap, grid: e.target.checked })} />
                    <Grid3x3 size={18} aria-hidden />
                  </label>
                  <label className="tool-toggle" data-tip="Aimant pièces : tenons, réceptacles, goupilles (⌥ pour l’ignorer)" data-tip-side="left">
                    <input type="checkbox" aria-label="Aimant pièces" data-testid="snap-pieces" checked={snapPieces} onChange={(e) => setSnapPieces(e.target.checked)} />
                    <Magnet size={18} aria-hidden />
                  </label>
                  <label className="tool-toggle" data-tip="Aimant modèle : se cale sur sa place dans le modèle" data-tip-side="left">
                    <input type="checkbox" aria-label="Aimant modèle" data-testid="snap-model" checked={snap.magnet} onChange={(e) => setSnap({ ...snap, magnet: e.target.checked })} />
                    <Target size={18} aria-hidden />
                  </label>
                </>
              )}
              {freeMode && !held && selection.length > 0 && (
                <button type="button" className="ghost icon" data-testid="xray" aria-pressed={xray} aria-label="Voir les connexions" data-tip="Voir les connexions : les autres pièces deviennent transparentes (affichage seulement)" data-tip-side="left" onClick={() => setXray(!xray)}><ScanEye size={18} aria-hidden /></button>
              )}
              {panelCollapsed && (
                <>
                  <hr />
                  <button type="button" className="ghost icon" aria-label="Afficher le panneau" data-tip="Afficher le panneau" data-tip-side="left" onClick={() => setPanelCollapsed(false)}><PanelRightOpen size={18} aria-hidden /></button>
                </>
              )}
            </div>
          )}
          <div className="scene-top">
            {freeMode && !editing && held && (
              <HeldBar moving={Boolean(held.moving || held.group)} autoHeight={held.layerMode === 'auto'} heightStep={heightStep} steps={[HEIGHT_STEP_LDU, FINE_HEIGHT_STEP_LDU]}
                onLift={lift} onStep={setHeightStep} onAuto={autoHeight} onRotate={rotate} onRemove={removeHeld} onCancel={cancelHeld} />
            )}
            {freeMode && !editing && !held && selection.length > 0 && (
              <SelectionBar gizmoMode={gizmoMode} gizmoSpace={gizmoSpace} onGizmoMode={setGizmoMode} onGizmoSpace={setGizmoSpace} onRotate={rotate}
                onMove={() => moveSelection(selection)} onAssembly={() => selectAssembly(selection)} onRemove={removeSelection} onClear={() => setSelection([])}
                settingsOpen={manipSettings} onSettings={() => setManipSettings((o) => !o)}
                settings={(
                  <>
                    <label className="field-row" title="Pas des flèches : à l’horizontale ½ tenon (10 LDU) ou un tenon (20 LDU), à la verticale une plaque (8 LDU) ; ou 1 LDU partout. ⌥ pendant le glisser : sans pas.">
                      <span>Pas des flèches</span>
                      <select data-testid="gizmo-step" value={gizmoStep} onChange={(e) => setGizmoStep(Number(e.target.value) as 10 | 20 | 1)}>
                        <option value={10}>½ tenon</option>
                        <option value={20}>tenon</option>
                        <option value={1}>1 LDU</option>
                      </select>
                    </label>
                    <label className="field-row" title="⌥ pendant le glisser : sans pas.">
                      <span>Pas des anneaux</span>
                      <select data-testid="gizmo-angle" value={gizmoRotation} onChange={(e) => setGizmoRotation(Number(e.target.value) as 90 | 15)}>
                        <option value={90}>90°</option>
                        <option value={15}>15°</option>
                      </select>
                    </label>
                      {shown && (
                      <fieldset className="coords">
                        <legend>Coordonnées <span className="muted">(LDU, Y = hauteur)</span></legend>
                        {(['X', 'Y', 'Z'] as const).map((axis, i) => (
                          <label key={axis}>{axis}{' '}
                            <input type="number" step="any" data-testid={`gizmo-${axis.toLowerCase()}`} value={typed ? typed[i] : String(shown[i])}
                              onChange={(e) => { const next = [...(typed ?? shown.map(String))] as [string, string, string]; next[i] = e.target.value; setTyped(next); }}
                              onKeyDown={(e) => { if (e.key === 'Enter') applyTyped(); }} />
                          </label>
                        ))}
                        <button type="button" className="primary small" data-testid="gizmo-apply" onClick={applyTyped} disabled={!typed}>Appliquer</button>
                      </fieldset>
                    )}
                  </>
                )} />
            )}
            {held && !editing && (
              <div className="hud" aria-live="polite">
                {heldInfo}
                {freeMode && (heightAboveGround !== null || orientationInfo) && (
                  <div className="hud-line">
                    {heightAboveGround !== null && <span className="small" data-testid="height-info">bas à {heightAboveGround} LDU du sol</span>}
                    {orientationInfo}
                  </div>
                )}
              </div>
            )}
            {freeMode && !editing && !held && selection.length > 0 && (
              <div className="hud">
                <span className="small" data-testid="selection-info">{selection.length} pièce(s) sélectionnée(s)</span>
                {(orientationInfo || shown) && (
                  <div className="hud-line">
                    {orientationInfo}
                    {shown && <span className="small" data-testid="gizmo-coords">X {shown[0]} · Y {shown[1]} (hauteur) · Z {shown[2]} LDU</span>}
                  </div>
                )}
              </div>
            )}
          </div>
          {message && <Toast tone={message.kind} onClose={() => setMessage(null)}>{message.text}</Toast>}
          {sceneHint && <p className="scene-legend" data-testid="scene-hint">{sceneHint} <span className="legend-help"><kbd>?</kbd> toutes les touches</span></p>}
        </div>

        <Splitter side={panel.side} total={panel.total} context={editing ? 'editor' : 'atelier'} onResize={panel.setSide} />
        <aside className="side" id="panneau" tabIndex={-1} hidden={panelCollapsed}>
          <div className="tabs" role="tablist" aria-label="Panneau latéral" onKeyDown={onTabKey}>
            <button type="button" role="tab" id="tab-model" aria-controls="panel-model" aria-selected={tab === 'model'} tabIndex={tab === 'model' ? 0 : -1} onClick={() => setTab('model')}><Box size={15} aria-hidden /> Modèle</button>
            <button type="button" role="tab" id="tab-pdf" aria-controls="panel-pdf" aria-selected={tab === 'pdf'} tabIndex={tab === 'pdf' ? 0 : -1} onClick={() => setTab('pdf')}><BookOpen size={15} aria-hidden /> Notice PDF</button>
            {loaded && <button type="button" role="tab" id="tab-mapping" aria-controls="panel-pdf" aria-selected={tab === 'mapping'} tabIndex={tab === 'mapping' ? 0 : -1} onClick={openEditor}><Link2 size={15} aria-hidden /> Correspondances</button>}
            <span className="spacer" />
            {!editing && <button type="button" className="ghost icon small" aria-label="Replier le panneau" data-tip="Replier le panneau" data-tip-side="left" onClick={() => setPanelCollapsed(true)}><PanelRightClose size={16} aria-hidden /></button>}
          </div>
          <div role="tabpanel" id="panel-model" aria-labelledby="tab-model" hidden={tab !== 'model'} className="tab-panel">
            {loaded ? (
              <>
                {!session && playable && ctx && <StartPanel unavailable={modeUnavailable} onStart={(m) => start(m)} />}
                {!playable && loaded.quality.quality !== 'INVALID' && (
                  <Note tone="warning">
                    Visualisation seulement tant que des pièces manquent.
                    {loaded.libraryProblem && <> Cause : la bibliothèque de pièces LDraw de ce Mac (voir la zone 3D), pas ton fichier.</>}
                  </Note>
                )}
                <ModelSummary
                  fileName={loaded.fileName}
                  analysis={loaded.analysis}
                  quality={loaded.quality}
                  renderStatus={renderStatus}
                  missingParts={missing}
                  inventory={inventoryCheck(loaded.hash)}
                  {...(initial ? {} : { onChooseRoot: (name: string) => void importText(loaded.fileName, loaded.text, loaded.hash, name) })}
                />
                {loaded.analysis.plan.kind === 'NO_STEPS' && session && <p className="small muted">{NO_STEPS_TEXT}</p>}
                {playable && (
                  <div className="sync-status small" data-testid="sync-availability">
                    {syncPlan
                      ? <span className="ok">Notice synchronisée disponible : {syncPlan.steps.length} étape(s) de notice, correspondances validées.</span>
                      : <span className="muted">Notice synchronisée indisponible : {syncUnavailable}</span>}
                    {' '}<button type="button" className="small" onClick={openEditor}><Link2 size={14} aria-hidden /> {mapping && mapping.steps.length > 0 ? 'Modifier les correspondances' : 'Créer les correspondances'}</button>
                  </div>
                )}
                {!initial && (
                  <label className="button secondary small">
                    <Upload size={14} aria-hidden /> Importer un autre modèle
                    <input type="file" accept=".ldr,.mpd" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onModelFile(f); e.target.value = ''; }} />
                  </label>
                )}
              </>
            ) : <p className="muted small">Aucun modèle importé.</p>}
          </div>
          <div role="tabpanel" id="panel-pdf" aria-labelledby={tab === 'mapping' ? 'tab-mapping' : 'tab-pdf'} hidden={tab === 'model'} className="tab-panel">
            <PdfPanel
              notice={notice}
              initialPage={restoredPdfPage.current}
              compact={editing}
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
          <div className="tray-parts">
            {isComplete(ctx, session) ? (
              <div className="done">
                <span className="done-icon" aria-hidden><Check size={20} /></span>
                <strong>Modèle terminé : {ctx.occurrences.length}/{ctx.occurrences.length} pièces.</strong>
                <button type="button" className="button primary" onClick={() => setConfirmRestart(true)}><RotateCcw size={16} aria-hidden /> Recommencer</button>
              </div>
            ) : freeMode && match && isStockExhausted(ctx, session) ? (
              <div className="done" data-testid="free-done">
                <span className="done-icon" aria-hidden><Check size={20} /></span>
                <strong>{freeEndText(atModelCount(session, match), ctx.occurrences.length)}</strong>
                <button type="button" className="button secondary" onClick={() => setConfirmRestart(true)}><RotateCcw size={16} aria-hidden /> Recommencer</button>
              </div>
            ) : (
              <PartsTray
                items={tray(ctx, session)}
                heldKey={held ? trayKey(held.partKey, held.colorCode) : null}
                colourOf={(c) => catalog.colourHex(c)}
                colourName={(c) => catalog.colourName(c)}
                {...(geometry ? { templates: geometry.templates } : {})}
                onPick={pick}
              />
            )}
          </div>
          <div className="tray-actions">
            <button type="button" aria-label="Annuler" data-tip="Annuler la dernière action (⌘Z)" onClick={undoAction} disabled={usedCount(session) === 0 && freeHistory.length === 0}><Undo2 size={16} aria-hidden /> Annuler <kbd aria-hidden>⌘Z</kbd></button>
            {held && heldOrientations.length > 1 && <button type="button" onClick={nextOrientation}><RotateCw size={16} aria-hidden /> Orientation suivante (O)</button>}
            <button type="button" onClick={assistPlace} disabled={!held} data-tip="Aide / accessibilité : pose la pièce tenue à l’emplacement libre le plus proche" data-testid="assist-place"><Target size={16} aria-hidden /> Poser à la position cible (aide)</button>
            <div className="tray-secondary">
              {isStepped(session.mode) && <button type="button" className="ghost small" onClick={() => setSession(resetActiveStep(ctx, session))}>Réinitialiser l’étape</button>}
              <button type="button" className="ghost small danger-text" onClick={() => setConfirmRestart(true)}><Trash2 size={14} aria-hidden /> Abandonner</button>
            </div>
          </div>
        </footer>
      )}

      <ConfirmDialog
        open={confirmRestart && Boolean(session)}
        title="Abandonner cette partie ?"
        confirmLabel="Confirmer l’abandon"
        onConfirm={() => void restart()}
        onCancel={() => setConfirmRestart(false)}
        testId="confirm-restart"
      >
        <p>{restartText}</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={pendingSwitch !== null}
        title={pendingSwitch ? `Passer en ${MODE_LABEL[pendingSwitch.mode]} ?` : ''}
        confirmLabel="Retirer et changer de mode"
        cancelLabel="Rester en montage libre"
        onConfirm={() => pendingSwitch && start(pendingSwitch.mode, true, true)}
        onCancel={() => setPendingSwitch(null)}
        testId="mode-switch-confirm"
      >
        {pendingSwitch && (
          <p>
            {pendingSwitch.unmatched} pièce(s) posée(s) hors du modèle officiel : pour passer en {MODE_LABEL[pendingSwitch.mode]}, elles seront remises dans le stock
            {pendingSwitch.recognised > 0 ? ` (${pendingSwitch.recognised} reconnue(s) à leur place, gardée(s))` : ''}.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}

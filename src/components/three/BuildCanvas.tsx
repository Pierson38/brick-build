'use client';

import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, type Group, LineBasicMaterial, LineSegments, Matrix4, type Object3D, Points, PointsMaterial, Ray as ThreeRay, Vector3 } from 'three';
import { trayKey, type FreePiece } from '@/domain/build/engine';
import type { PieceGroup, PieceRef } from '@/domain/build/free';
import { bottomExtent, type HoverHit, type LayerMode, type Ray } from '@/domain/build/surface';
import type { BrickOccurrence, Matrix4Tuple } from '@/domain/ldraw/types';
import { cloneTemplate, templateVertices, type BrickVariant } from '@/infra/ldraw/part-catalog';

export interface HeldBrick {
  readonly partKey: string;
  readonly colorCode: string;
  readonly quarterTurns: number;
  readonly layerY: number;
  /** Orientation chosen among the model's target orientations (see orientationChoices). */
  readonly orientation: Matrix4Tuple;
  /** auto = height from the surface under the pointer; manual = PageUp/PageDown. */
  readonly layerMode: LayerMode;
  /** Free mode: a placed piece taken again to move, turn or remove it (hidden at its pose meanwhile). */
  readonly moving?: PieceRef;
  /** Free mode: several placed pieces moved together (hidden at their poses meanwhile). */
  readonly group?: PieceGroup;
}

interface Props {
  readonly occurrences: readonly BrickOccurrence[];
  readonly templates: ReadonlyMap<string, Group>;
  readonly solidIds: ReadonlySet<string>;
  readonly ghostIds: ReadonlySet<string>;
  /** Shown solid with a highlight (step being edited or consulted); wins over solid and ghost. */
  readonly highlightIds?: ReadonlySet<string>;
  readonly held: HeldBrick | null;
  /** Pose at which the held brick is shown (from the last hover). */
  readonly previewPose: Matrix4Tuple | null;
  readonly onHover: (ray: Ray, hit: HoverHit | null) => void;
  /** Click without drag while holding a brick: drop it where it is shown. */
  readonly onDrop: () => void;
  /** Click without drag and without a held brick on a shown brick (mapping editor). */
  readonly onPick?: (occurrenceId: string, modifiers: { readonly alt: boolean }) => void;
  /** Free mode: pieces placed at a pose chosen by the player. */
  readonly freePieces?: readonly FreePiece[];
  /** Free pieces shown as selected. */
  readonly selectedFree?: ReadonlySet<string>;
  /** Free mode, group being moved: the pieces at the pose they would get. */
  readonly groupPreview?: readonly { readonly partKey: string; readonly colorCode: string; readonly pose: Matrix4Tuple }[] | null;
  /** Free mode: click without drag and without a held piece — a placed piece, or nothing (null). */
  readonly onSelect?: (ref: PieceRef | null, modifiers: { readonly shift: boolean }) => void;
  /**
   * Free mode, direct manipulation: a press on a placed piece followed by a move beyond DRAG_PX starts
   * a drag (the camera is suspended meanwhile); the release ends it. A shorter move stays a click.
   */
  readonly onDragStart?: (ref: PieceRef, modifiers: { readonly shift: boolean }) => void;
  readonly onDragEnd?: () => void;
  /** Free mode: double click on a placed piece (select its connected assembly). */
  readonly onDoublePick?: (ref: PieceRef) => void;
  /** Free mode: connectors that the snapping proposal makes fit (markers of the preview). */
  readonly snapPoints?: readonly (readonly [number, number, number])[] | null;
  /** Free mode: the three rotation axes drawn through the piece in hand (X red, Y green, Z blue). */
  readonly axesAt?: readonly [number, number, number];
  /** Lowest point of the finished model (see modelGroundY); computed here when not given. */
  readonly groundY?: number;
  readonly recenterToken: number;
}


type Variant = BrickVariant;

interface BrickHit {
  readonly variant: Variant;
  readonly occurrenceId: string;
  /** Free piece id (free mode). */
  readonly pieceId?: string;
  /** Origin of an upright piece (LDraw): the top of its body. */
  readonly anchor?: readonly [number, number, number];
}

/** Finds the piece root (PlacedBrick) an intersected mesh belongs to. */
function brickOf(object: Object3D): BrickHit | null {
  for (let o: Object3D | null = object; o; o = o.parent) {
    if (o.userData.variant) {
      return { variant: o.userData.variant as Variant, occurrenceId: o.userData.occurrenceId as string, pieceId: o.userData.pieceId as string | undefined, anchor: o.userData.anchor as BrickHit['anchor'] };
    }
  }
  return null;
}

/** Ground = the lowest point of the finished model, from the real geometry of each part. */
export function modelGroundY(occurrences: readonly BrickOccurrence[], templates: ReadonlyMap<string, Group>): number {
  const vertices = new Map<string, number[]>();
  let ground = 0;
  for (const o of occurrences) {
    const template = templates.get(trayKey(o.partKey, o.colorCode));
    if (!template) continue;
    if (!vertices.has(o.partKey)) vertices.set(o.partKey, templateVertices(template));
    ground = Math.max(ground, o.targetMatrix[13] + bottomExtent(vertices.get(o.partKey)!, o.targetMatrix));
  }
  return ground;
}

/** The three rotation axes (X red, Y green, Z blue), built once; never picked by the pointer. */
const ROTATION_AXES = (() => {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([-45, 0, 0, 45, 0, 0, 0, -45, 0, 0, 45, 0, 0, 0, -45, 0, 0, 45], 3));
  g.setAttribute('color', new Float32BufferAttribute([0.86, 0.15, 0.15, 0.86, 0.15, 0.15, 0.09, 0.64, 0.29, 0.09, 0.64, 0.29, 0.15, 0.39, 0.92, 0.15, 0.39, 0.92], 3));
  const lines = new LineSegments(g, new LineBasicMaterial({ vertexColors: true, depthTest: false }));
  lines.name = 'rotation-axes';
  lines.renderOrder = 10;
  lines.raycast = () => undefined;
  return lines;
})();

/** Two clicks on the same piece within this delay (ms): a double click. */
const DOUBLE_MS = 400;

/** Pointer travel (px) separating a click from a drag — the same threshold as the click below. */
export const DRAG_PX = 4;

export function BuildCanvas(props: Props) {
  const bounds = useMemo(() => modelBounds(props.occurrences), [props.occurrences]);
  return (
    <Canvas
      data-testid="build-canvas"
      camera={{ fov: 45, near: 1, far: 20000, position: [bounds.center[0] + bounds.radius * 1.6, bounds.center[1] + bounds.radius * 1.4, bounds.center[2] + bounds.radius * 2] }}
      gl={{ preserveDrawingBuffer: true, antialias: true }}
    >
      <color attach="background" args={['#eef1f5']} />
      <hemisphereLight args={['#ffffff', '#8a8f99', 1.6]} />
      <directionalLight position={[300, 600, 400]} intensity={1.8} />
      <directionalLight position={[-400, 200, -300]} intensity={0.6} />
      <Scene {...props} />
      <CameraRig center={bounds.center} radius={bounds.radius} token={props.recenterToken} />
      <TestHooks />
    </Canvas>
  );
}

function Scene({ occurrences, templates, solidIds, ghostIds, highlightIds, held, previewPose, onHover, onDrop, onPick, freePieces, selectedFree, groupPreview, onSelect, onDragStart, onDragEnd, onDoublePick, snapPoints, axesAt, groundY: givenGround }: Props) {
  const root = useRef<Group>(null);
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null;
  // press on a placed piece: becomes a drag after DRAG_PX of travel, otherwise stays a click
  const press = useRef<{ ref: PieceRef; x: number; y: number; started: boolean } | null>(null);
  // the click that ends a drag is not a click (R3F rounds its own travel, 4.4 px counts as 4)
  const justDragged = useRef(false);
  const lastClick = useRef<{ key: string; at: number } | null>(null);
  const dragHandlers = useRef({ onDragStart, onDragEnd });
  dragHandlers.current = { onDragStart, onDragEnd };
  useEffect(() => {
    const end = () => {
      const p = press.current;
      press.current = null;
      if (controls) controls.enabled = true;
      if (p?.started) {
        justDragged.current = true;
        dragHandlers.current.onDragEnd?.();
      }
    };
    const move = (e: PointerEvent) => {
      const p = press.current;
      if (!p || p.started || Math.hypot(e.clientX - p.x, e.clientY - p.y) <= DRAG_PX) return;
      p.started = true;
      dragHandlers.current.onDragStart?.(p.ref, { shift: e.shiftKey });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('blur', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('blur', end);
    };
  }, [controls]);
  const computedGround = useMemo(() => (givenGround === undefined ? modelGroundY(occurrences, templates) : 0), [givenGround, occurrences, templates]);
  const groundY = givenGround ?? computedGround;
  const byId = useMemo(() => new Map(occurrences.map((o) => [o.occurrenceId, o] as const)), [occurrences]);

  const toHover = (e: ThreeEvent<PointerEvent | MouseEvent>): { ray: Ray; hit: HoverHit | null } => {
    const inverse = new Matrix4().copy(root.current!.matrixWorld).invert();
    const r = new ThreeRay().copy(e.ray).applyMatrix4(inverse);
    let hit: HoverHit | null = null;
    for (const i of e.intersections) {
      const p = i.point.clone().applyMatrix4(inverse);
      if (i.object.name === 'ground-plane') { hit = { kind: 'ground', x: p.x, y: p.y, z: p.z, distance: p.distanceTo(r.origin) }; break; }
      const brick = brickOf(i.object);
      if (!brick || brick.variant === 'held') continue;
      if (brick.variant === 'ghost') {
        const o = byId.get(brick.occurrenceId);
        // only ghosts of the held part+colour attract the brick; others are transparent to the pointer
        if (!held || !o || o.partKey !== held.partKey || o.colorCode !== held.colorCode) continue;
        hit = { kind: 'ghost', x: p.x, y: p.y, z: p.z, occurrenceId: brick.occurrenceId };
        break;
      }
      // free mode: the face orientation and the piece origin tell where a piece can rest on it
      const normal = i.face?.normal.clone().transformDirection(i.object.matrixWorld).transformDirection(inverse);
      hit = {
        kind: 'solid', x: p.x, y: p.y, z: p.z, distance: p.distanceTo(r.origin),
        ...(brick.anchor ? { anchor: brick.anchor } : {}), ...(normal ? { up: normal.y < -0.5 } : {}),
      };
      break;
    }
    return { ray: { origin: [r.origin.x, r.origin.y, r.origin.z], direction: [r.direction.x, r.direction.y, r.direction.z] }, hit };
  };

  return (
    // LDraw is -Y up: flip the whole model once; every matrix below stays in LDraw coordinates.
    <group
      ref={root}
      rotation={[Math.PI, 0, 0]}
      name="ldraw-root"
      onPointerDown={(e) => {
        justDragged.current = false;
        if (held || !onDragStart || e.button !== 0) return;
        const brick = e.intersections.map((i) => brickOf(i.object)).find((b) => b && b.variant !== 'held' && b.variant !== 'ghost');
        if (!brick) return; // empty space: the camera
        // the camera listens on the same element after us: suspended for this press
        if (controls) controls.enabled = false;
        press.current = { ref: brick.pieceId ? { kind: 'free', id: brick.pieceId } : { kind: 'anchored', occurrenceId: brick.occurrenceId }, x: e.clientX, y: e.clientY, started: false };
      }}
      onPointerMove={(e) => {
        // free mode also reports the pointer before a piece is in hand: a drag shows its preview at once
        if (!held && !onDragStart) return;
        e.stopPropagation();
        const { ray, hit } = toHover(e);
        onHover(ray, hit);
      }}
      onClick={(e) => {
        // R3F calls this once per intersected object: stop here, the flag stays until the next press
        if (justDragged.current) {
          e.stopPropagation();
          return;
        }
        if (e.delta > 4) return; // an orbit drag
        if (!held) {
          // the mapping editor picks any shown brick (ghosts = unassigned ones); free mode selects placed pieces only
          const brick = onPick || onSelect ? e.intersections.map((i) => brickOf(i.object)).find((b) => b && b.variant !== 'held' && (onPick || b.variant !== 'ghost')) : null;
          if (onPick) {
            if (!brick) return;
            e.stopPropagation();
            onPick(brick.occurrenceId, { alt: e.altKey });
          } else if (onSelect) {
            // free mode: select a placed piece (Shift: add / remove), or nothing to clear the selection;
            // a second click on the same piece within DOUBLE_MS is a double click (its assembly)
            e.stopPropagation();
            const ref: PieceRef | null = brick ? (brick.pieceId ? { kind: 'free', id: brick.pieceId } : { kind: 'anchored', occurrenceId: brick.occurrenceId }) : null;
            const key = ref ? (ref.kind === 'free' ? `f:${ref.id}` : `a:${ref.occurrenceId}`) : null;
            // the time of the click itself, not of its handling (a slow frame must not split a double click)
            const now = e.nativeEvent.timeStamp;
            if (ref && onDoublePick && !e.shiftKey && lastClick.current?.key === key && now - lastClick.current.at < DOUBLE_MS) {
              lastClick.current = null;
              onDoublePick(ref);
            } else {
              lastClick.current = key ? { key, at: now } : null;
              onSelect(ref, { shift: e.shiftKey });
            }
          }
          return;
        }
        e.stopPropagation();
        onDrop();
      }}
    >
      {occurrences.map((o) => {
        const variant = highlightIds?.has(o.occurrenceId) ? 'selected' : solidIds.has(o.occurrenceId) ? 'solid' : ghostIds.has(o.occurrenceId) ? 'ghost' : null;
        const template = templates.get(trayKey(o.partKey, o.colorCode));
        if (!variant || !template) return null;
        return <PlacedBrick key={`${o.occurrenceId}:${variant}`} template={template} matrix={o.targetMatrix} variant={variant} id={o.occurrenceId} />;
      })}
      {freePieces?.map((f) => {
        const template = templates.get(trayKey(f.partKey, f.colorCode));
        const inHand = (held?.moving?.kind === 'free' && held.moving.id === f.id) || held?.group?.members.some((m) => m.ref.kind === 'free' && m.ref.id === f.id);
        if (!template || inHand) return null;
        const variant = selectedFree?.has(f.id) ? 'selected' : 'solid';
        return <PlacedBrick key={`free:${f.id}:${variant}`} template={template} matrix={f.pose} variant={variant} id={`free:${f.id}`} pieceId={f.id} />;
      })}
      {held?.group
        ? groupPreview?.map((g, i) => {
          const template = templates.get(trayKey(g.partKey, g.colorCode));
          return template ? <PlacedBrick key={`held-group:${i}`} template={template} matrix={g.pose} variant="held" id={`held-${i}`} /> : null;
        })
        : held && previewPose && templates.get(trayKey(held.partKey, held.colorCode)) && (
          <PlacedBrick template={templates.get(trayKey(held.partKey, held.colorCode))!} matrix={previewPose} variant="held" id="held" />
        )}
      {axesAt && <primitive object={ROTATION_AXES} position={[...axesAt]} />}
      {snapPoints && snapPoints.length > 0 && <SnapMarkers points={snapPoints} />}
      {/* invisible ground: catches the pointer around the model (also used in manual layer mode) */}
      <mesh name="ground-plane" position={[0, groundY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[20000, 20000]} />
        {/* double-sided: after the LDraw -Y flip the plane faces away from the camera */}
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={DoubleSide} />
      </mesh>
      <gridHelper args={[2000, 100, '#c3c9d4', '#dde2ea']} position={[0, groundY, 0]} />
    </group>
  );
}

/** Green dots on the connectors the snapping makes fit; drawn over everything, never picked. */
function SnapMarkers({ points }: { points: readonly (readonly [number, number, number])[] }) {
  const object = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(points.flatMap((p) => [p[0], p[1] - 0.5, p[2]]), 3));
    const o = new Points(g, new PointsMaterial({ color: '#16a34a', size: 9, sizeAttenuation: false, depthTest: false }));
    o.name = 'snap-markers';
    o.renderOrder = 11;
    o.raycast = () => undefined;
    return o;
  }, [points]);
  useEffect(() => () => {
    object.geometry.dispose();
    (object.material as PointsMaterial).dispose();
  }, [object]);
  return <primitive object={object} />;
}

function PlacedBrick({ template, matrix, variant, id, pieceId }: { template: Group; matrix: Matrix4Tuple; variant: Variant; id: string; pieceId?: string }) {
  const place = (o: Object3D, m: Matrix4Tuple) => {
    o.matrix.fromArray([...m]);
    o.matrixWorldNeedsUpdate = true;
    // upright piece: its origin is the top of its body (LDraw convention), something can stand on it
    o.userData.anchor = m[5] > 0.99 ? [m[12], m[13], m[14]] : undefined;
  };
  const object = useMemo(() => {
    const o = cloneTemplate(template, variant);
    o.matrixAutoUpdate = false;
    o.userData.occurrenceId = id;
    o.userData.variant = variant;
    if (pieceId) o.userData.pieceId = pieceId;
    // placed at once: a re-created object (selected / not selected) must never be picked at the origin
    place(o, matrix);
    return o;
  }, [template, variant, id, pieceId]); // eslint-disable-line react-hooks/exhaustive-deps
  // world matrix right after it is attached (before any next pointer event): picking never waits for a frame
  useLayoutEffect(() => {
    place(object, matrix);
    object.updateWorldMatrix(true, true);
  }, [object, matrix]);
  return <primitive object={object} />;
}

function CameraRig({ center, radius, token }: { center: readonly [number, number, number]; radius: number; token: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useRef<{ target: Vector3; update: () => void } | null>(null);
  useEffect(() => {
    camera.position.set(center[0] + radius * 1.6, center[1] + radius * 1.4, center[2] + radius * 2);
    controls.current?.target.set(...center);
    controls.current?.update();
  }, [camera, center, radius, token]);
  return <OrbitControls ref={controls as never} makeDefault target={[...center]} enableDamping={false} />;
}

/** Bounding sphere of the targets, in Three.js world coordinates (after the -Y flip). */
function modelBounds(occurrences: readonly BrickOccurrence[]): { center: [number, number, number]; radius: number } {
  if (occurrences.length === 0) return { center: [0, 0, 0], radius: 200 };
  const pts = occurrences.map((o) => [o.targetMatrix[12], -o.targetMatrix[13], -o.targetMatrix[14]] as const);
  const min = [0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i]!)));
  const max = [0, 1, 2].map((i) => Math.max(...pts.map((p) => p[i]!)));
  const center = [0, 1, 2].map((i) => (min[i]! + max[i]!) / 2) as [number, number, number];
  const radius = Math.max(120, Math.hypot(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!) / 2 + 80);
  return { center, radius };
}

declare global {
  interface Window {
    __brickLab?: {
      /** Screen position (client px) of an LDraw-space point. Dev/test only. */
      project: (ldraw: readonly [number, number, number]) => { x: number; y: number };
      sceneSummary: () => { solid: number; ghost: number; held: number; selected: number; meshes: number };
      /** True when the renderer size used for picking matches the canvas on screen. */
      sizeInSync: () => boolean;
    };
  }
}

function TestHooks() {
  const { camera, gl, scene } = useThree();
  const size = useThree((s) => s.size);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    window.__brickLab = {
      project: ([x, y, z]) => {
        const v = new Vector3(x, y, z).applyMatrix4(new Matrix4().makeRotationX(Math.PI)).project(camera);
        const rect = gl.domElement.getBoundingClientRect();
        return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
      },
      sizeInSync: () => {
        const rect = gl.domElement.getBoundingClientRect();
        return Math.abs(rect.width - sizeRef.current.width) < 1 && Math.abs(rect.height - sizeRef.current.height) < 1;
      },
      sceneSummary: () => {
        const counts = { solid: 0, ghost: 0, held: 0, selected: 0, meshes: 0 };
        scene.traverse((o) => {
          const variant = o.userData.variant as Variant | undefined;
          if (variant) counts[variant] += 1;
          if ((o as { isMesh?: boolean }).isMesh && o.name !== 'ground-plane') counts.meshes += 1;
        });
        return counts;
      },
    };
    return () => {
      delete window.__brickLab;
    };
  }, [camera, gl, scene]);
  return null;
}

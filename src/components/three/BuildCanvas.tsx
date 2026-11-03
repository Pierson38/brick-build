'use client';

import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { DoubleSide, type Group, Matrix4, type Object3D, Vector3 } from 'three';
import { heldPose as enginePose, MOVE_GRID_LDU, trayKey } from '@/domain/build/engine';
import type { BrickOccurrence, Matrix4Tuple } from '@/domain/ldraw/types';
import { cloneTemplate } from '@/infra/ldraw/part-catalog';

export interface HeldBrick {
  readonly partKey: string;
  readonly colorCode: string;
  readonly quarterTurns: number;
  readonly layerY: number;
  /** Orientation chosen among the model's target orientations (see orientationChoices). */
  readonly orientation: Matrix4Tuple;
}

interface Props {
  readonly occurrences: readonly BrickOccurrence[];
  readonly templates: ReadonlyMap<string, Group>;
  readonly solidIds: ReadonlySet<string>;
  readonly ghostIds: ReadonlySet<string>;
  readonly held: HeldBrick | null;
  readonly heldPosition: readonly [number, number] | null;
  readonly onHeldMove: (xz: readonly [number, number]) => void;
  readonly onDrop: (pose: Matrix4Tuple) => void;
  readonly recenterToken: number;
}


export function heldPose(held: HeldBrick, xz: readonly [number, number]): Matrix4Tuple {
  return enginePose(held.orientation, held.quarterTurns, [xz[0], held.layerY, xz[1]]);
}

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

function Scene({ occurrences, templates, solidIds, ghostIds, held, heldPosition, onHeldMove, onDrop }: Props) {
  const groundY = useMemo(() => Math.max(0, ...occurrences.map((o) => o.targetMatrix[13])) + 24, [occurrences]);
  return (
    // LDraw is -Y up: flip the whole model once; every matrix below stays in LDraw coordinates.
    <group rotation={[Math.PI, 0, 0]} name="ldraw-root">
      {occurrences.map((o) => {
        const variant = solidIds.has(o.occurrenceId) ? 'solid' : ghostIds.has(o.occurrenceId) ? 'ghost' : null;
        const template = templates.get(trayKey(o.partKey, o.colorCode));
        if (!variant || !template) return null;
        return <PlacedBrick key={`${o.occurrenceId}:${variant}`} template={template} matrix={o.targetMatrix} variant={variant} id={o.occurrenceId} />;
      })}
      {held && heldPosition && templates.get(trayKey(held.partKey, held.colorCode)) && (
        <PlacedBrick template={templates.get(trayKey(held.partKey, held.colorCode))!} matrix={heldPose(held, heldPosition)} variant="held" id="held" />
      )}
      {held && <DropPlane y={held.layerY} onMove={onHeldMove} onDrop={(xz) => onDrop(heldPose(held, xz))} />}
      <gridHelper args={[2000, 100, '#c3c9d4', '#dde2ea']} position={[0, groundY, 0]} />
    </group>
  );
}

function PlacedBrick({ template, matrix, variant, id }: { template: Group; matrix: Matrix4Tuple; variant: 'solid' | 'ghost' | 'held'; id: string }) {
  const object = useMemo(() => {
    const o = cloneTemplate(template, variant);
    o.matrixAutoUpdate = false;
    o.userData.occurrenceId = id;
    o.userData.variant = variant;
    return o;
  }, [template, variant, id]);
  useEffect(() => {
    object.matrix.fromArray([...matrix]);
    object.matrixWorldNeedsUpdate = true;
  }, [object, matrix]);
  return <primitive object={object} />;
}

function snap(v: number): number {
  return Math.round(v / MOVE_GRID_LDU) * MOVE_GRID_LDU;
}

function DropPlane({ y, onMove, onDrop }: { y: number; onMove: (xz: readonly [number, number]) => void; onDrop: (xz: readonly [number, number]) => void }) {
  const ref = useRef<Object3D>(null);
  // Last hovered cell, updated synchronously: the drop goes where the held brick is SHOWN.
  // (A React state read here could be one render behind a fast move + click.)
  const lastHover = useRef<readonly [number, number] | null>(null);
  const toLDraw = (e: ThreeEvent<PointerEvent | MouseEvent>): [number, number] => {
    const local = ref.current!.parent!.worldToLocal(e.point.clone());
    return [snap(local.x), snap(local.z)];
  };
  return (
    <mesh
      ref={ref}
      name="drop-plane"
      position={[0, y, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerMove={(e) => {
        lastHover.current = toLDraw(e);
        onMove(lastHover.current);
      }}
      onClick={(e) => {
        if (e.delta > 4) return; // orbit drag, not a drop
        e.stopPropagation();
        onDrop(lastHover.current ?? toLDraw(e));
      }}
    >
      <planeGeometry args={[4000, 4000]} />
      {/* double-sided: after the LDraw -Y flip the plane faces away from the camera */}
      <meshBasicMaterial transparent opacity={0} depthWrite={false} side={DoubleSide} />
    </mesh>
  );
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
      sceneSummary: () => { solid: number; ghost: number; held: number; meshes: number };
      /** True when the renderer size used for picking matches the canvas on screen. */
      sizeInSync: () => boolean;
      /** World-space data of the drop plane, for debugging. */
      dropPlane: () => { ldrawY: number; count: number } | null;
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
      dropPlane: () => {
        const planes: Object3D[] = [];
        scene.traverse((o) => { if (o.name === 'drop-plane') planes.push(o); });
        if (planes.length === 0) return null;
        const p = planes[0]!.getWorldPosition(new Vector3());
        return { ldrawY: -p.y, count: planes.length };
      },
      sceneSummary: () => {
        const counts = { solid: 0, ghost: 0, held: 0, meshes: 0 };
        scene.traverse((o) => {
          const variant = o.userData.variant as 'solid' | 'ghost' | 'held' | undefined;
          if (variant) counts[variant] += 1;
          if ((o as { isMesh?: boolean }).isMesh && o.name !== 'drop-plane') counts.meshes += 1;
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

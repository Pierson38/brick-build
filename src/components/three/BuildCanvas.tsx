'use client';

import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { DoubleSide, type Group, Matrix4, type Object3D, Ray as ThreeRay, Vector3 } from 'three';
import { trayKey } from '@/domain/build/engine';
import { bottomExtent, type HoverHit, type LayerMode, type Ray } from '@/domain/build/surface';
import type { BrickOccurrence, Matrix4Tuple } from '@/domain/ldraw/types';
import { cloneTemplate, templateVertices } from '@/infra/ldraw/part-catalog';

export interface HeldBrick {
  readonly partKey: string;
  readonly colorCode: string;
  readonly quarterTurns: number;
  readonly layerY: number;
  /** Orientation chosen among the model's target orientations (see orientationChoices). */
  readonly orientation: Matrix4Tuple;
  /** auto = height from the surface under the pointer; manual = PageUp/PageDown. */
  readonly layerMode: LayerMode;
}

interface Props {
  readonly occurrences: readonly BrickOccurrence[];
  readonly templates: ReadonlyMap<string, Group>;
  readonly solidIds: ReadonlySet<string>;
  readonly ghostIds: ReadonlySet<string>;
  readonly held: HeldBrick | null;
  /** Pose at which the held brick is shown (from the last hover). */
  readonly previewPose: Matrix4Tuple | null;
  readonly onHover: (ray: Ray, hit: HoverHit | null) => void;
  /** Click without drag while holding a brick: drop it where it is shown. */
  readonly onDrop: () => void;
  readonly recenterToken: number;
}


type Variant = 'solid' | 'ghost' | 'held';

/** Finds the occurrence root (PlacedBrick) an intersected mesh belongs to. */
function brickOf(object: Object3D): { variant: Variant; occurrenceId: string } | null {
  for (let o: Object3D | null = object; o; o = o.parent) {
    if (o.userData.variant) return { variant: o.userData.variant as Variant, occurrenceId: o.userData.occurrenceId as string };
  }
  return null;
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

function Scene({ occurrences, templates, solidIds, ghostIds, held, previewPose, onHover, onDrop }: Props) {
  const root = useRef<Group>(null);
  // Ground = the lowest point of the finished model, from the real geometry of each part.
  const groundY = useMemo(() => {
    const vertices = new Map<string, number[]>();
    let ground = 0;
    for (const o of occurrences) {
      const template = templates.get(trayKey(o.partKey, o.colorCode));
      if (!template) continue;
      if (!vertices.has(o.partKey)) vertices.set(o.partKey, templateVertices(template));
      ground = Math.max(ground, o.targetMatrix[13] + bottomExtent(vertices.get(o.partKey)!, o.targetMatrix));
    }
    return ground;
  }, [occurrences, templates]);
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
      hit = { kind: 'solid', x: p.x, y: p.y, z: p.z, distance: p.distanceTo(r.origin) };
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
      onPointerMove={(e) => {
        if (!held) return;
        e.stopPropagation();
        const { ray, hit } = toHover(e);
        onHover(ray, hit);
      }}
      onClick={(e) => {
        if (!held || e.delta > 4) return; // no brick held, or an orbit drag
        e.stopPropagation();
        onDrop();
      }}
    >
      {occurrences.map((o) => {
        const variant = solidIds.has(o.occurrenceId) ? 'solid' : ghostIds.has(o.occurrenceId) ? 'ghost' : null;
        const template = templates.get(trayKey(o.partKey, o.colorCode));
        if (!variant || !template) return null;
        return <PlacedBrick key={`${o.occurrenceId}:${variant}`} template={template} matrix={o.targetMatrix} variant={variant} id={o.occurrenceId} />;
      })}
      {held && previewPose && templates.get(trayKey(held.partKey, held.colorCode)) && (
        <PlacedBrick template={templates.get(trayKey(held.partKey, held.colorCode))!} matrix={previewPose} variant="held" id="held" />
      )}
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
        const counts = { solid: 0, ghost: 0, held: 0, meshes: 0 };
        scene.traverse((o) => {
          const variant = o.userData.variant as 'solid' | 'ghost' | 'held' | undefined;
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

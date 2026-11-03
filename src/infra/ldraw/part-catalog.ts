import { Color, type Group, type Material, type Mesh, MeshBasicMaterial, type Object3D } from 'three';
import { LDrawLoader } from 'three/examples/jsm/loaders/LDrawLoader.js';
import { LDrawConditionalLineMaterial } from 'three/examples/jsm/materials/LDrawConditionalLineMaterial.js';
import { trayKey } from '@/domain/build/engine';
import type { BrickOccurrence } from '@/domain/ldraw/types';

/**
 * Geometry for (part, colour) pairs, loaded with Three's LDrawLoader ONE PART AT A TIME.
 * Spike finding (three 0.187.0): loading a whole model with LDrawLoader fails entirely
 * when a single part is missing, and its global step counter mixes nested steps.
 * The structural parser stays the source of truth; this catalog only provides meshes,
 * reused through clone() (shared geometry) for every occurrence.
 */
export class PartCatalog {
  private readonly loader: LDrawLoader;
  private readonly templates = new Map<string, Promise<Group>>();
  private materialsReady: Promise<void> | null = null;

  constructor(private readonly basePath = '/api/ldraw/') {
    this.loader = new LDrawLoader();
    this.loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);
    this.loader.setPartsLibraryPath(basePath);
  }

  init(): Promise<void> {
    this.materialsReady ??= this.loader.preloadMaterials(`${this.basePath}LDConfig.ldr`);
    return this.materialsReady;
  }

  /** Template group for one part in one colour. Never add it to a scene: clone it. */
  template(partRef: string, colorCode: string): Promise<Group> {
    const key = trayKey(partRef.toLowerCase(), colorCode);
    let promise = this.templates.get(key);
    if (!promise) {
      const text = `0 FILE __brick_lab_single.ldr\n1 ${colorCode} 0 0 0 1 0 0 0 1 0 0 0 1 ${partRef}\n`;
      promise = this.init().then(() => new Promise<Group>((resolve, reject) => this.loader.parse(text, resolve, reject)));
      this.templates.set(key, promise);
    }
    return promise;
  }

  colourHex(colorCode: string): string | null {
    try {
      const material = this.loader.getMaterial(colorCode) as (Material & { color?: Color }) | null;
      return material?.color ? `#${material.color.getHexString()}` : null;
    } catch {
      return null;
    }
  }
}

export interface GeometryLoadResult {
  readonly templates: ReadonlyMap<string, Group>;
  /** Part keys whose geometry could not be loaded (missing file or sub-primitive). */
  readonly missingParts: ReadonlySet<string>;
  readonly errors: readonly string[];
  readonly durationMs: number;
}

export async function loadModelGeometry(catalog: PartCatalog, occurrences: readonly BrickOccurrence[]): Promise<GeometryLoadResult> {
  const start = performance.now();
  await catalog.init();
  const pairs = new Map<string, BrickOccurrence>();
  for (const o of occurrences) pairs.set(trayKey(o.partKey, o.colorCode), o);
  const templates = new Map<string, Group>();
  const missingParts = new Set<string>();
  const errors: string[] = [];
  await Promise.all([...pairs.entries()].map(async ([key, o]) => {
    try {
      templates.set(key, await catalog.template(o.partRef, o.colorCode));
    } catch (error) {
      missingParts.add(o.partKey);
      errors.push(`${o.partRef} (couleur ${o.colorCode}) : ${error instanceof Error ? error.message : String(error)}`);
    }
  }));
  return { templates, missingParts, errors, durationMs: performance.now() - start };
}

const ghostMaterial = new MeshBasicMaterial({ color: '#3b82f6', transparent: true, opacity: 0.28, depthWrite: false });

/** Clone sharing geometry; `ghost` swaps materials for a translucent silhouette without edges. */
export function cloneTemplate(template: Group, variant: 'solid' | 'ghost' | 'held'): Object3D {
  const copy = template.clone(true);
  copy.traverse((child) => {
    if ((child as Mesh).isMesh) {
      const mesh = child as Mesh;
      if (variant === 'ghost') mesh.material = ghostMaterial;
      if (variant !== 'solid') mesh.raycast = () => {};
    } else if ('isLineSegments' in child && child.isLineSegments && variant === 'ghost') {
      child.visible = false;
    }
  });
  return copy;
}

import { ACESFilmicToneMapping, Box3, DirectionalLight, Group, HemisphereLight, OrthographicCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';

/**
 * Thumbnails of the parts to place, drawn from the SAME geometry the 3D view uses (the LDraw
 * template of each part/colour pair, see part-catalog.ts), in an isometric view.
 * One shared off-screen WebGL renderer for the whole page (never one context per thumbnail),
 * one image per template kept in memory, rendered progressively in short time slices so that
 * the construction view stays fluid.
 */

/** Thumbnail size in CSS pixels. */
export const THUMB_SIZE = 64;
/** View direction (Three.js space, after the LDraw → Three.js flip): from the front right, above. */
const VIEW = new Vector3(1, 0.85, 1.25).normalize();
/**
 * Above this radius (LDU), edge lines are hidden: on a large plate the stud outlines would cover
 * the surface at thumbnail size (a green 16×16 plate looked black). Small parts keep their edges.
 */
const EDGES_MAX_RADIUS = 90;
/** Rendering budget per slice (ms) before yielding to the page. */
const SLICE_MS = 10;

export interface Framing {
  readonly center: Vector3;
  /** Half extent of the orthographic frustum (square). */
  readonly half: number;
  readonly distance: number;
}

/** Orthographic framing that contains the whole box, seen along VIEW, with a small margin. */
export function framing(box: Box3, margin = 1.08): Framing {
  const center = box.getCenter(new Vector3());
  const radius = Math.max(1, box.getSize(new Vector3()).length() / 2);
  return { center, half: radius * margin, distance: radius * 4 + 10 };
}

export interface ThumbnailStats {
  readonly rendered: number;
  readonly totalMs: number;
  readonly maxMs: number;
  readonly failed: boolean;
}

export class PartThumbnails {
  private renderer: WebGLRenderer | null = null;
  private failed = false;
  private readonly cache = new WeakMap<Group, Promise<string | null>>();
  private readonly queue: { template: Group; resolve: (v: string | null) => void }[] = [];
  private scheduled = false;
  private scene: Scene | null = null;
  private camera: OrthographicCamera | null = null;
  private stats = { rendered: 0, totalMs: 0, maxMs: 0 };

  /** Image (data URL) of a template; null when it cannot be drawn (no WebGL). Cached per template. */
  thumbnail(template: Group): Promise<string | null> {
    let p = this.cache.get(template);
    if (!p) {
      p = new Promise((resolve) => this.queue.push({ template, resolve }));
      this.cache.set(template, p);
      this.schedule();
    }
    return p;
  }

  getStats(): ThumbnailStats {
    return { ...this.stats, failed: this.failed };
  }

  private schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    setTimeout(() => this.runSlice(), 0);
  }

  private runSlice() {
    this.scheduled = false;
    const start = performance.now();
    while (this.queue.length > 0 && performance.now() - start < SLICE_MS) {
      const job = this.queue.shift()!;
      job.resolve(this.render(job.template));
    }
    if (this.queue.length > 0) this.schedule();
  }

  private setup(): boolean {
    if (this.renderer) return true;
    if (this.failed) return false;
    try {
      if (process.env.NODE_ENV !== 'production' && window.__brickLabThumbsFail) throw new Error('test: échec simulé');
      const canvas = document.createElement('canvas');
      const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(THUMB_SIZE, THUMB_SIZE, false);
      // same colour pipeline as the 3D view (React Three Fiber defaults)
      renderer.outputColorSpace = SRGBColorSpace;
      renderer.toneMapping = ACESFilmicToneMapping;
      renderer.setClearColor(0x000000, 0);
      canvas.addEventListener('webglcontextlost', () => {
        this.renderer = null;
        this.failed = true;
      });
      const scene = new Scene();
      scene.add(new HemisphereLight('#ffffff', '#8a8f99', 1.6));
      const key = new DirectionalLight('#ffffff', 1.8);
      key.position.set(300, 600, 400);
      const fill = new DirectionalLight('#ffffff', 0.6);
      fill.position.set(-400, 200, -300);
      scene.add(key, fill);
      this.renderer = renderer;
      this.scene = scene;
      this.camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
      return true;
    } catch {
      this.failed = true;
      return false;
    }
  }

  private render(template: Group): string | null {
    if (!this.setup()) return null;
    const t0 = performance.now();
    const renderer = this.renderer!;
    const scene = this.scene!;
    const camera = this.camera!;
    // a clone shares geometry and materials with the template used by the 3D view
    const holder = new Group();
    holder.rotation.x = Math.PI; // LDraw (Y down) → Three.js (Y up), as in BuildCanvas
    holder.add(template.clone(true));
    scene.add(holder);
    try {
      holder.updateMatrixWorld(true);
      const box = new Box3().setFromObject(holder);
      if (box.isEmpty()) return null;
      const f = framing(box);
      if (f.half / 1.08 > EDGES_MAX_RADIUS) {
        holder.traverse((o) => {
          if ((o as { isLineSegments?: boolean }).isLineSegments) o.visible = false;
        });
      }
      camera.left = -f.half;
      camera.right = f.half;
      camera.top = f.half;
      camera.bottom = -f.half;
      camera.near = 0.1;
      camera.far = f.distance * 2;
      camera.position.copy(f.center).addScaledVector(VIEW, f.distance);
      camera.lookAt(f.center);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    } catch {
      return null;
    } finally {
      scene.remove(holder);
      const ms = performance.now() - t0;
      this.stats.rendered += 1;
      this.stats.totalMs += ms;
      this.stats.maxMs = Math.max(this.stats.maxMs, ms);
    }
  }
}

/** The page's single thumbnail renderer. */
export const partThumbnails = new PartThumbnails();

declare global {
  interface Window {
    /** Dev/test only: renderer statistics (count, time). */
    __brickLabThumbs?: { stats: () => ThumbnailStats };
    /** Dev/test only: simulate a renderer that cannot draw (fallback check). */
    __brickLabThumbsFail?: boolean;
  }
}
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') window.__brickLabThumbs = { stats: () => partThumbnails.getStats() };

import { scanPartConnectors, type PartConnectors, type ReadFile } from '@/domain/ldraw/connectors';

/**
 * Connection interfaces of LDraw parts (see domain/ldraw/connectors.ts), read from the same local
 * library files as the 3D rendering (`/api/ldraw/`, already in the HTTP cache once a model is shown).
 * One scan per LDraw reference, kept for the page; each library file is fetched once.
 */

/** Primitive families live in p/, everything else in parts/ (parts/s/ for "s\" sub-parts). */
const PRIMITIVE = /^(stud|stug|box|rect|tri|edge|cyl|con\d|ndis|disc|ring|chrd|bump|axle|peghole|beamhol|npeghol|connhole|connect|confric|filstud|t\d\d|\d+-\d+)/;

export class ConnectorCatalog {
  private readonly parts = new Map<string, Promise<PartConnectors>>();
  private readonly files = new Map<string, Promise<string | null>>();
  private readonly scanned = new Map<string, Promise<unknown>>();
  private readonly ready = new Map<string, PartConnectors>();

  constructor(private readonly basePath = '/api/ldraw/') {}

  private readonly read: ReadFile = (name) => {
    let p = this.files.get(name);
    if (!p) {
      const candidates = name.startsWith('s/') ? [`parts/${name}`]
        : /^(48|8)\//.test(name) ? [`p/${name}`]
          : PRIMITIVE.test(name) ? [`p/${name}`, `parts/${name}`] : [`parts/${name}`, `p/${name}`];
      p = (async () => {
        for (const c of candidates) {
          try {
            const res = await fetch(`${this.basePath}${c}`);
            if (res.ok) return await res.text();
          } catch {
            return null;
          }
        }
        return null;
      })();
      this.files.set(name, p);
    }
    return p;
  };

  /** Connectors of a part (part-local); an unknown or unreadable part has none. */
  get(partKey: string): Promise<PartConnectors> {
    const key = partKey.toLowerCase();
    let p = this.parts.get(key);
    if (!p) {
      p = scanPartConnectors(key, this.read, this.scanned as never)
        .catch(() => ({ connectors: [], axleUnrecognised: false }))
        .then((r) => {
          this.ready.set(key, r);
          return r;
        });
      this.parts.set(key, p);
    }
    return p;
  }

  /** Already scanned (synchronous, for the pointer path). */
  peek(partKey: string): PartConnectors | undefined {
    return this.ready.get(partKey.toLowerCase());
  }
}

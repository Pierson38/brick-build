'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { analyzeModel, classifyImport, sha256Hex, type ModelAnalysis, type QualityReport } from '@/domain/import/analyze';
import type { BuildView } from '@/domain/library/types';
import { libraryApi } from '@/infra/library/api';
import { loadModelGeometry, PartCatalog, type GeometryLoadResult } from '@/infra/ldraw/part-catalog';
import { BuildCanvas } from '../three/BuildCanvas';

export interface LoadedLibraryModel {
  readonly analysis: ModelAnalysis;
  readonly geometry: GeometryLoadResult | null;
  readonly quality: QualityReport;
  readonly libraryProblem: string | null;
}

async function libraryStatus(): Promise<string | null> {
  const body = (await fetch('/api/ldraw-status', { cache: 'no-store' }).then((r) => r.json()).catch(() => null)) as { configured: boolean; reason?: string } | null;
  return !body ? 'Serveur local injoignable.' : body.configured ? null : body.reason ?? 'Bibliothèque LDraw non configurée.';
}

/** Model of a library build, parsed and rendered in this browser (verified bytes only). */
export function useLibraryModel(build: Pick<BuildView, 'model' | 'rootName'> | null, enabled = true) {
  const [state, setState] = useState<{ model: LoadedLibraryModel | null; error: string | null; loading: boolean }>({ model: null, error: null, loading: false });
  const catalog = useMemo(() => new PartCatalog(), []);
  const sha = build?.model.sha256;
  const root = build?.rootName;
  const name = build?.model.originalName;
  useEffect(() => {
    if (!enabled || !sha || !root || !name) return;
    let cancelled = false;
    setState({ model: null, error: null, loading: true });
    (async () => {
      const bytes = await libraryApi.fileBytes(sha);
      if ((await sha256Hex(bytes)) !== sha) throw new Error('Empreinte du modèle différente de celle de la bibliothèque : fichier non utilisé.');
      const analysis = analyzeModel(new TextDecoder('utf-8').decode(bytes), name, { rootName: root });
      const libraryProblem = await libraryStatus();
      const geometry = libraryProblem ? null : await loadModelGeometry(catalog, analysis.model.occurrences, analysis.embeddedParts);
      const quality = classifyImport(analysis, geometry ? geometry.missingParts : null);
      if (!cancelled) setState({ model: { analysis, geometry, quality, libraryProblem }, error: null, loading: false });
    })().catch((e: unknown) => {
      if (!cancelled) setState({ model: null, error: e instanceof Error ? e.message : String(e), loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [sha, root, name, enabled, catalog]);
  return state;
}

const THUMB_W = 480;
const THUMB_H = 320;
const CROP = 0.62;

/** Downscaled PNG of the rendered canvas, computed locally. */
async function captureThumbnail(container: HTMLElement): Promise<Blob | null> {
  const source = container.querySelector('canvas');
  if (!source || source.width === 0) return null;
  const out = document.createElement('canvas');
  out.width = THUMB_W;
  out.height = THUMB_H;
  const g = out.getContext('2d');
  if (!g) return null;
  // the atelier camera frames the model with a margin: keep the central part, at the thumbnail ratio
  const sw = Math.min(source.width, (source.height * THUMB_W) / THUMB_H) * CROP;
  const sh = (sw * THUMB_H) / THUMB_W;
  g.drawImage(source, (source.width - sw) / 2, (source.height - sh) / 2, sw, sh, 0, 0, THUMB_W, THUMB_H);
  return new Promise((resolve) => out.toBlob(resolve, 'image/png'));
}

interface Props {
  readonly model: LoadedLibraryModel;
  /** Called once with a locally rendered thumbnail. */
  readonly onThumbnail?: (png: Blob) => void;
  readonly className?: string;
}

/** Finished model, all bricks solid, orbit camera; no interaction with the build. */
export function ModelPreview({ model, onThumbnail, className = 'preview3d' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const occurrences = model.analysis.model.occurrences;
  const all = useMemo(() => new Set(occurrences.map((o) => o.occurrenceId)), [occurrences]);
  const none = useMemo(() => new Set<string>(), []);
  const sent = useRef(false);
  useEffect(() => {
    if (!onThumbnail || sent.current || !model.geometry || model.geometry.templates.size === 0) return;
    let frames = 0;
    let raf = 0;
    const tick = () => {
      // a few frames: geometry uploaded and drawn with the final camera
      if (++frames < 8) raf = requestAnimationFrame(tick);
      else if (ref.current) void captureThumbnail(ref.current).then((png) => {
        if (png && !sent.current) {
          sent.current = true;
          onThumbnail(png);
        }
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [model, onThumbnail]);
  if (!model.geometry || model.geometry.templates.size === 0) {
    return <div className={`${className} empty`}><p className="small muted">{model.libraryProblem ? `Aperçu indisponible : ${model.libraryProblem}` : 'Aperçu indisponible.'}</p></div>;
  }
  return (
    <div className={className} ref={ref}>
      <BuildCanvas
        occurrences={occurrences}
        templates={model.geometry.templates}
        solidIds={all}
        ghostIds={none}
        held={null}
        previewPose={null}
        onHover={() => undefined}
        onDrop={() => undefined}
        recenterToken={0}
      />
    </div>
  );
}

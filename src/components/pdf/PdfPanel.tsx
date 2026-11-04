'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { RenderTask } from 'pdfjs-dist';
import type { NoticeState } from './useNotice';

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

interface Props {
  readonly notice: NoticeState;
  /** Page to reopen when a PDF is imported (saved progress). */
  readonly initialPage?: number;
  /** Context shown above the page (synchronised step, editor). */
  readonly banner?: ReactNode;
  readonly caption?: string;
  readonly compact?: boolean;
  /** Fit the page to the panel width (synchronised mode, editor); +/− go back to fixed zooms. */
  readonly fitWidth?: boolean;
}

/**
 * Local PDF viewer for one or several booklets. Files are read with the File API and never leave
 * the machine. Outside the synchronised mode, the page is independent from the 3D build steps.
 */
export function PdfPanel({ notice, initialPage, banner, caption = 'page PDF indépendante des étapes 3D.', compact = false, fitWidth = false }: Props) {
  const { booklets, view, active, error, loading } = notice;
  const [zoomIndex, setZoomIndex] = useState(2);
  const [fit, setFit] = useState(fitWidth);
  useEffect(() => setFit(fitWidth), [fitWidth]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fitScale = useRef(1);
  // leaving "fit width": the nearest fixed zoom above (+) or below (−) the fitted scale
  const unfit = (dir: 1 | -1) => {
    const i = dir > 0 ? ZOOMS.findIndex((z) => z > fitScale.current + 0.01) : ZOOMS.findLastIndex((z) => z < fitScale.current - 0.01);
    setZoomIndex(i >= 0 ? i : dir > 0 ? ZOOMS.length - 1 : 0);
    setFit(false);
  };
  const [renderError, setRenderError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const page = view?.page ?? 1;

  useEffect(() => {
    if (!active || !canvasRef.current) return;
    let task: RenderTask | null = null;
    let cancelled = false;
    setRenderError(null);
    (async () => {
      try {
        const p = await active.doc.getPage(page);
        if (cancelled) return;
        const ratio = window.devicePixelRatio || 1;
        const available = (scrollRef.current?.clientWidth ?? 0) - 2;
        const zoom = fit && available > 0 ? available / p.getViewport({ scale: 1 }).width : ZOOMS[zoomIndex]!;
        if (fit) fitScale.current = zoom;
        const viewport = p.getViewport({ scale: zoom * ratio });
        const canvas = canvasRef.current!;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
        task = p.render({ canvas, viewport });
        await task.promise;
      } catch (e) {
        if ((e as { name?: string }).name !== 'RenderingCancelledException') setRenderError(`Erreur de rendu de la page ${page}.`);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [active, page, zoomIndex, fit]);

  const go = (delta: number) => active && notice.show(active.sha256, page + delta);
  const shownError = error ?? renderError;

  return (
    <section className={compact ? 'pdf-panel compact' : 'pdf-panel'} aria-label="Notice PDF">
      <div className="pdf-toolbar">
        <label className="button secondary">
          {active ? 'Ajouter / changer de livret' : 'Importer une notice PDF'}
          <input type="file" accept="application/pdf,.pdf" hidden data-testid="pdf-input"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void notice.open(f, initialPage); e.target.value = ''; }} />
        </label>
        {booklets.length > 1 && (
          <select aria-label="Livret affiché" data-testid="pdf-booklet" value={active?.sha256 ?? ''}
            onChange={(e) => notice.show(e.target.value, 1)}>
            {booklets.map((b) => <option key={b.sha256} value={b.sha256}>{b.fileName}</option>)}
          </select>
        )}
        {active && (
          <>
            <button type="button" onClick={() => go(-1)} disabled={page <= 1} aria-label="Page précédente">◀</button>
            <span data-testid="pdf-page">PDF p. {page} / {active.pageCount}</span>
            <button type="button" onClick={() => go(1)} disabled={page >= active.pageCount} aria-label="Page suivante">▶</button>
            <button type="button" onClick={() => (fit ? unfit(-1) : setZoomIndex((z) => Math.max(0, z - 1)))} aria-label="Zoom arrière">−</button>
            <span data-testid="pdf-zoom">{fit ? 'Largeur' : `${Math.round(ZOOMS[zoomIndex]! * 100)} %`}</span>
            <button type="button" onClick={() => (fit ? unfit(1) : setZoomIndex((z) => Math.min(ZOOMS.length - 1, z + 1)))} aria-label="Zoom avant">+</button>
            {!fit && <button type="button" onClick={() => setFit(true)} aria-label="Ajuster à la largeur">↔</button>}
          </>
        )}
      </div>
      {banner}
      {loading && <p className="muted">Lecture du PDF…</p>}
      {shownError && <p className="error" role="alert">{shownError}</p>}
      {active ? (
        <>
          <p className="muted small">{active.fileName} — {caption}</p>
          <div className="pdf-scroll" ref={scrollRef}><canvas ref={canvasRef} data-testid="pdf-canvas" /></div>
        </>
      ) : (
        <p className="muted small">Ta notice reste sur ce Mac : elle est lue localement et n’est pas sauvegardée.</p>
      )}
    </section>
  );
}

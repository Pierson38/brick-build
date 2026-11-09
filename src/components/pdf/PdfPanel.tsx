'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, FilePlus2, FileUp, MoveHorizontal, ZoomIn, ZoomOut } from 'lucide-react';
import type { RenderTask } from 'pdfjs-dist';
import { Loading, Note } from '../ui/feedback';
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
  /** Fit the page to the panel width (default, every mode); +/− go back to fixed zooms, ↔ comes back. */
  readonly fitWidth?: boolean;
}

/**
 * Local PDF viewer for one or several booklets. Files are read with the File API and never leave
 * the machine. Outside the synchronised mode, the page is independent from the 3D build steps.
 */
export function PdfPanel({ notice, initialPage, banner, caption = 'page PDF indépendante des étapes 3D.', compact = false, fitWidth = true }: Props) {
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

  // width available for the page: followed with a ResizeObserver (separator, window), settled
  // before a sharp re-render (the CSS already shrinks the page while the panel moves)
  const [boxWidth, setBoxWidth] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setBoxWidth(el.clientWidth);
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => setBoxWidth(el.clientWidth), 120);
    });
    ro.observe(el);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, [active]);

  // one render at a time on the canvas: a new one waits until the cancelled one has really stopped
  const renderChain = useRef<Promise<unknown>>(Promise.resolve());
  const widthKey = fit ? boxWidth : 0;
  useEffect(() => {
    if (!active || !canvasRef.current) return;
    let task: RenderTask | null = null;
    let cancelled = false;
    setRenderError(null);
    const previous = renderChain.current;
    const run = (async () => {
      await previous;
      if (cancelled) return;
      try {
        const p = await active.doc.getPage(page);
        if (cancelled) return;
        const ratio = window.devicePixelRatio || 1;
        const available = (scrollRef.current?.clientWidth ?? 0) - 2;
        const zoom = fit && available > 0 ? available / p.getViewport({ scale: 1 }).width : ZOOMS[zoomIndex]!;
        if (fit) fitScale.current = zoom;
        const viewport = p.getViewport({ scale: zoom * ratio });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
        canvas.dataset.scale = zoom.toFixed(4);
        task = p.render({ canvas, viewport });
        await task.promise;
      } catch (e) {
        if ((e as { name?: string }).name !== 'RenderingCancelledException') setRenderError(`Erreur de rendu de la page ${page}.`);
      }
    })();
    renderChain.current = run.catch(() => undefined);
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [active, page, zoomIndex, fit, widthKey]);

  const go = (delta: number) => active && notice.show(active.sha256, page + delta);
  const shownError = error ?? renderError;

  const importInput = (
    <input type="file" accept="application/pdf,.pdf" hidden data-testid="pdf-input"
      onChange={(e) => { const f = e.target.files?.[0]; if (f) void notice.open(f, initialPage); e.target.value = ''; }} />
  );

  return (
    <section className={compact ? 'pdf-panel compact' : 'pdf-panel'} aria-label="Notice PDF">
      {active && (
        <div className="pdf-toolbar">
          <label className="button ghost icon small" aria-label="Ajouter / changer de livret" data-tip="Ajouter / changer de livret" data-tip-side="bottom">
            <FilePlus2 size={16} aria-hidden />
            {importInput}
          </label>
          {booklets.length > 1 && (
            <select aria-label="Livret affiché" data-testid="pdf-booklet" value={active.sha256}
              onChange={(e) => notice.show(e.target.value, 1)}>
              {booklets.map((b) => <option key={b.sha256} value={b.sha256}>{b.fileName}</option>)}
            </select>
          )}
          <span className="pdf-group" role="group" aria-label="Pages">
            <button type="button" className="ghost icon small" onClick={() => go(-1)} disabled={page <= 1} aria-label="Page précédente"><ChevronLeft size={16} aria-hidden /></button>
            <span className="num" data-testid="pdf-page">PDF p. {page} / {active.pageCount}</span>
            <button type="button" className="ghost icon small" onClick={() => go(1)} disabled={page >= active.pageCount} aria-label="Page suivante"><ChevronRight size={16} aria-hidden /></button>
          </span>
          <span className="pdf-group" role="group" aria-label="Zoom">
            <button type="button" className="ghost icon small" onClick={() => (fit ? unfit(-1) : setZoomIndex((z) => Math.max(0, z - 1)))} aria-label="Zoom arrière"><ZoomOut size={16} aria-hidden /></button>
            <span className="num pdf-zoom" data-testid="pdf-zoom">{fit ? 'Largeur' : `${Math.round(ZOOMS[zoomIndex]! * 100)} %`}</span>
            <button type="button" className="ghost icon small" onClick={() => (fit ? unfit(1) : setZoomIndex((z) => Math.min(ZOOMS.length - 1, z + 1)))} aria-label="Zoom avant"><ZoomIn size={16} aria-hidden /></button>
            {!fit && <button type="button" className="ghost icon small" onClick={() => setFit(true)} aria-label="Ajuster à la largeur" data-tip="Ajuster à la largeur" data-tip-side="bottom" data-tip-align="end"><MoveHorizontal size={16} aria-hidden /></button>}
          </span>
        </div>
      )}
      {banner}
      {loading && <Loading>Lecture du PDF…</Loading>}
      {shownError && <Note tone="error" role="alert">{shownError}</Note>}
      {active ? (
        <>
          <p className="pdf-caption muted small"><span className="pdf-file">{active.fileName}</span> — {caption}</p>
          <div className={fit ? 'pdf-scroll fit' : 'pdf-scroll'} ref={scrollRef}><canvas ref={canvasRef} data-testid="pdf-canvas" /></div>
        </>
      ) : (
        <div className="pdf-empty">
          <span className="empty-icon" aria-hidden><BookOpen size={20} /></span>
          <p className="pdf-empty-title">Aucune notice ouverte</p>
          <p className="muted small">Ta notice reste sur ce Mac : elle est lue localement et n’est pas sauvegardée.</p>
          <label className="button primary">
            <FileUp size={16} aria-hidden /> Importer une notice PDF
            {importInput}
          </label>
        </div>
      )}
    </section>
  );
}

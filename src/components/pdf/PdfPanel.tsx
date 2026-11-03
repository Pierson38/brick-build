'use client';

import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

const MAX_PDF_BYTES = 300 * 1024 * 1024;
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

interface Props {
  /** Page to reopen after re-importing a PDF (from saved progress). */
  readonly initialPage?: number;
  readonly onPageChange: (page: number) => void;
}

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc ||= new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  return pdfjs;
}

/**
 * Local PDF viewer. The file is read with the File API and never leaves the machine.
 * The page number is deliberately independent from the 3D build steps.
 */
export function PdfPanel({ initialPage, onPageChange }: Props) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [fileName, setFileName] = useState('');
  const [page, setPage] = useState(1);
  const [zoomIndex, setZoomIndex] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const taskRef = useRef<PDFDocumentLoadingTask | null>(null);

  const open = async (file: File) => {
    setError(null);
    if (file.size > MAX_PDF_BYTES) return setError(`PDF trop volumineux (${Math.round(file.size / 1e6)} Mo, limite ${MAX_PDF_BYTES / 1e6} Mo).`);
    setLoading(true);
    try {
      const pdfjs = await loadPdfJs();
      const data = new Uint8Array(await file.arrayBuffer());
      const task = pdfjs.getDocument({ data, enableXfa: false });
      const next = await task.promise;
      await taskRef.current?.destroy();
      taskRef.current = task;
      setDoc(next);
      setFileName(file.name);
      setPage(Math.min(Math.max(1, initialPage ?? 1), next.numPages));
    } catch (e) {
      const name = (e as { name?: string }).name;
      setError(
        name === 'PasswordException' ? 'PDF protégé par mot de passe : non pris en charge.'
          : name === 'InvalidPDFException' ? 'Fichier PDF invalide ou abîmé.'
            : `Impossible d’ouvrir ce PDF (${e instanceof Error ? e.message : String(e)}).`,
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    let task: RenderTask | null = null;
    let cancelled = false;
    (async () => {
      try {
        const p = await doc.getPage(page);
        if (cancelled) return;
        const ratio = window.devicePixelRatio || 1;
        const viewport = p.getViewport({ scale: ZOOMS[zoomIndex]! * ratio });
        const canvas = canvasRef.current!;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
        task = p.render({ canvas, viewport });
        await task.promise;
      } catch (e) {
        if ((e as { name?: string }).name !== 'RenderingCancelledException') setError(`Erreur de rendu de la page ${page}.`);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, zoomIndex]);

  useEffect(() => {
    if (doc) onPageChange(page);
  }, [doc, page, onPageChange]);

  const go = (delta: number) => doc && setPage((p) => Math.min(doc.numPages, Math.max(1, p + delta)));

  return (
    <section className="pdf-panel" aria-label="Notice PDF">
      <div className="pdf-toolbar">
        <label className="button secondary">
          {doc ? 'Changer de PDF' : 'Importer une notice PDF'}
          <input type="file" accept="application/pdf,.pdf" hidden data-testid="pdf-input"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void open(f); e.target.value = ''; }} />
        </label>
        {doc && (
          <>
            <button type="button" onClick={() => go(-1)} disabled={page <= 1} aria-label="Page précédente">◀</button>
            <span data-testid="pdf-page">PDF p. {page} / {doc.numPages}</span>
            <button type="button" onClick={() => go(1)} disabled={page >= doc.numPages} aria-label="Page suivante">▶</button>
            <button type="button" onClick={() => setZoomIndex((z) => Math.max(0, z - 1))} aria-label="Zoom arrière">−</button>
            <span data-testid="pdf-zoom">{Math.round(ZOOMS[zoomIndex]! * 100)} %</span>
            <button type="button" onClick={() => setZoomIndex((z) => Math.min(ZOOMS.length - 1, z + 1))} aria-label="Zoom avant">+</button>
          </>
        )}
      </div>
      {loading && <p className="muted">Lecture du PDF…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {doc ? (
        <>
          <p className="muted small">{fileName} — page PDF indépendante des étapes 3D.</p>
          <div className="pdf-scroll"><canvas ref={canvasRef} data-testid="pdf-canvas" /></div>
        </>
      ) : (
        <p className="muted small">Ta notice reste sur ce Mac : elle est lue localement et n’est pas sauvegardée.</p>
      )}
    </section>
  );
}

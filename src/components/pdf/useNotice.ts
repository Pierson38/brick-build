'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { sha256Hex } from '@/domain/import/analyze';
import { msgs } from '@/i18n/runtime';

const MAX_PDF_BYTES = 300 * 1024 * 1024;
const MAX_LOADED_BOOKLETS = 6;

/** A PDF opened in this tab. Its bytes stay in memory only; the SHA-256 identifies it. */
export interface LoadedBooklet {
  readonly sha256: string;
  readonly fileName: string;
  readonly pageCount: number;
  readonly doc: PDFDocumentProxy;
  readonly task: PDFDocumentLoadingTask;
}

export interface PdfView {
  readonly sha256: string;
  readonly page: number;
}

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc ||= new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  return pdfjs;
}

/**
 * Local booklets (one or several PDFs) and the page shown. Files are read with the File API and
 * never leave the machine; nothing is stored, a reload asks for the files again.
 */
export function useNotice() {
  const [booklets, setBooklets] = useState<LoadedBooklet[]>([]);
  const [view, setView] = useState<PdfView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const bookletsRef = useRef(booklets);
  bookletsRef.current = booklets;

  useEffect(() => () => {
    for (const b of bookletsRef.current) void b.task.destroy();
  }, []);

  /** Opens a PDF (or selects it if already open) and shows `initialPage`, clamped. */
  const open = useCallback(async (file: File, initialPage?: number): Promise<LoadedBooklet | null> => {
    setError(null);
    if (file.size > MAX_PDF_BYTES) {
      setError(msgs().workshop.pdf.tooLarge(Math.round(file.size / 1e6), MAX_PDF_BYTES / 1e6));
      return null;
    }
    setLoading(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const sha256 = await sha256Hex(bytes);
      const clamp = (b: { pageCount: number }) => Math.min(Math.max(1, initialPage ?? 1), b.pageCount);
      const existing = bookletsRef.current.find((b) => b.sha256 === sha256);
      if (existing) {
        setView({ sha256, page: clamp(existing) });
        return existing;
      }
      const pdfjs = await loadPdfJs();
      const task = pdfjs.getDocument({ data: bytes, enableXfa: false });
      const doc = await task.promise;
      const booklet: LoadedBooklet = { sha256, fileName: file.name, pageCount: doc.numPages, doc, task };
      const next = [...bookletsRef.current, booklet];
      for (const dropped of next.splice(0, Math.max(0, next.length - MAX_LOADED_BOOKLETS))) void dropped.task.destroy();
      bookletsRef.current = next;
      setBooklets(next);
      setView({ sha256, page: clamp(booklet) });
      return booklet;
    } catch (e) {
      const name = (e as { name?: string }).name;
      const m = msgs().workshop.pdf;
      setError(
        name === 'PasswordException' ? m.password
          : name === 'InvalidPDFException' ? m.invalid
            : m.cannotOpen(e instanceof Error ? e.message : String(e)),
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /** Shows a page of an open booklet; false when that booklet is not open. */
  const show = useCallback((sha256: string, page: number): boolean => {
    const b = bookletsRef.current.find((x) => x.sha256 === sha256);
    if (!b) return false;
    setView({ sha256, page: Math.min(Math.max(1, page), b.pageCount) });
    return true;
  }, []);

  const active = view ? booklets.find((b) => b.sha256 === view.sha256) ?? null : null;
  return { booklets, view, active, error, loading, open, show };
}

export type NoticeState = ReturnType<typeof useNotice>;

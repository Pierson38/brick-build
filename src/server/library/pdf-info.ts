import { msgs } from '@/i18n/runtime';

// Server-only. Page count of a PDF with pdf.js (already used by the viewer), read from memory,
// no PDF script or XFA form run, no font loading, bounded in time. Nothing of the content is kept.

const TIMEOUT_MS = 20_000;

export async function pdfPageCount(bytes: Uint8Array): Promise<{ pages: number | null; problem: string | null }> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes), enableXfa: false, disableFontFace: true, useSystemFonts: false, stopAtErrors: false, verbosity: 0 });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const doc = await Promise.race([
        task.promise,
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(msgs().server.pdfInfo.timeout)), TIMEOUT_MS); }),
      ]);
      return { pages: doc.numPages, problem: null };
    } finally {
      clearTimeout(timer);
      await task.destroy().catch(() => undefined);
    }
  } catch (e) {
    return { pages: null, problem: msgs().server.pdfInfo.pagesUnreadable(e instanceof Error ? e.message.slice(0, 120) : msgs().server.pdfInfo.unknownError) };
  }
}

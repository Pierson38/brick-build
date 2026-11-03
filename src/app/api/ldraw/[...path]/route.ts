import { promises as fs } from 'node:fs';
import { libraryRoot, resolveLibraryFile, sanitizeSegments } from '@/infra/ldraw/library-path';

export const runtime = 'nodejs';

/** Serves the local LDraw parts library to LDrawLoader (same origin, no outgoing request). */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const root = libraryRoot();
  if (!root) return new Response('LDRAW_LIBRARY_DIR non configuré', { status: 503 });
  const segments = sanitizeSegments((await params).path);
  if (!segments) return new Response('Chemin refusé', { status: 400 });
  const file = await resolveLibraryFile(root, segments);
  if (!file) return new Response('Introuvable', { status: 404 });
  const text = await fs.readFile(file, 'utf8');
  return new Response(text, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, max-age=3600' },
  });
}

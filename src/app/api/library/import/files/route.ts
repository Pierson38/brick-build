import type { FileKind } from '@/domain/library/types';
import { bodyChunks, failure, guard, json } from '@/server/http/guard';
import { store } from '@/server/library/instance';
import { LibraryError } from '@/server/library/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS: readonly FileKind[] = ['model', 'pdf', 'mapping'];

/** A file dropped or chosen during an import: checked and kept in library/staging/ until confirmation. */
export async function POST(request: Request) {
  const refused = guard(request, { write: true });
  if (refused) return refused;
  try {
    const url = new URL(request.url);
    const kind = url.searchParams.get('kind') as FileKind;
    if (!KINDS.includes(kind)) throw new LibraryError('INVALID', 'Type de fichier inconnu.');
    if (request.headers.get('content-type') !== 'application/octet-stream') throw new LibraryError('UNSUPPORTED', 'Contenu binaire attendu.');
    return json({ file: await store().stage(kind, url.searchParams.get('name') ?? '', bodyChunks(request), { source: 'upload' }) }, 201);
  } catch (e) {
    return failure(e);
  }
}

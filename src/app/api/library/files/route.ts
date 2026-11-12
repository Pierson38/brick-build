import { msgs } from '@/i18n/runtime';
import type { FileKind } from '@/domain/library/types';
import { bodyChunks, failure, guard, json } from '@/server/http/guard';
import { store } from '@/server/library/instance';
import { LibraryError } from '@/server/library/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS: readonly FileKind[] = ['model', 'pdf', 'mapping'];

/**
 * Import of one file chosen by the user: raw body (application/octet-stream), `?kind=&name=`.
 * Streamed, bounded, hashed; an identical file already in the library is not stored again.
 */
export async function POST(request: Request) {
  const refused = guard(request, { write: true });
  if (refused) return refused;
  try {
    const url = new URL(request.url);
    const kind = url.searchParams.get('kind') as FileKind;
    if (!KINDS.includes(kind)) throw new LibraryError('INVALID', msgs().server.routes.unknownFileType);
    if (request.headers.get('content-type') !== 'application/octet-stream') throw new LibraryError('UNSUPPORTED', msgs().server.routes.binaryExpected);
    const { file, duplicate } = await store().ingest(kind, url.searchParams.get('name') ?? '', bodyChunks(request));
    return json({ file: { sha256: file.sha256, kind: file.kind, size: file.size, originalName: file.originalName, location: file.location.type }, duplicate }, duplicate ? 200 : 201);
  } catch (e) {
    return failure(e);
  }
}

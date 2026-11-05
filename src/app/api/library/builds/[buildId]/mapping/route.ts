import { failure, guard, json, readJsonBody, revisionOf } from '@/server/http/guard';
import { store } from '@/server/library/instance';
import { LibraryError } from '@/server/library/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ buildId: string }> };
const SOURCES = ['editor', 'import', 'clear', 'browser'] as const;

export async function GET(request: Request, { params }: Ctx) {
  const refused = guard(request, { write: false });
  if (refused) return refused;
  try {
    const m = await store().readMapping((await params).buildId);
    return json(m ?? { revision: null, mapping: null });
  } catch (e) {
    return failure(e);
  }
}

/**
 * Saves the build's mapping (a draft is accepted, a mapping of another model never). `text` is the
 * mapping file content; the replaced version is kept in the build's history.
 */
export async function PUT(request: Request, { params }: Ctx) {
  const refused = guard(request, { write: true });
  if (refused) return refused;
  try {
    const body = await readJsonBody(request, 1100 * 1024);
    const base = body.baseRevision === null ? null : revisionOf(body.baseRevision);
    if (base === null && body.baseRevision !== null) throw new LibraryError('INVALID', 'Révision de base manquante.');
    const source = SOURCES.find((s) => s === body.source) ?? 'editor';
    const rec = await store().putMapping((await params).buildId, String(body.text ?? ''), base, source);
    return json({ revision: rec.revision, savedAtIso: rec.savedAtIso });
  } catch (e) {
    return failure(e);
  }
}

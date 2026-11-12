import { msgs } from '@/i18n/runtime';
import { failure, guard, json, readJsonBody, revisionOf } from '@/server/http/guard';
import { store } from '@/server/library/instance';
import { LibraryError } from '@/server/library/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ buildId: string }> };

/** The stored progress (P6 schema v2 payload, validated again by the client before use). */
export async function GET(request: Request, { params }: Ctx) {
  const refused = guard(request, { write: false });
  if (refused) return refused;
  try {
    const rec = await store().readRecord((await params).buildId, 'progress');
    return json(rec ? { revision: rec.revision, savedAtIso: rec.savedAtIso, progress: rec.payload } : { revision: null, progress: null });
  } catch (e) {
    return failure(e);
  }
}

/** Saves the progress if `baseRevision` is the stored one (null: first save). Refused if it does not fit the model. */
export async function PUT(request: Request, { params }: Ctx) {
  const refused = guard(request, { write: true });
  if (refused) return refused;
  try {
    const body = await readJsonBody(request, 1024 * 1024);
    const base = body.baseRevision === null ? null : revisionOf(body.baseRevision);
    if (base === null && body.baseRevision !== null) throw new LibraryError('INVALID', msgs().server.routes.baseRevisionMissing);
    const rec = await store().putProgress((await params).buildId, body.progress, base, body.source === 'browser' ? 'browser' : 'atelier');
    return json({ revision: rec.revision, savedAtIso: rec.savedAtIso });
  } catch (e) {
    return failure(e);
  }
}

/** Restart: the progress is moved to the build's history, with explicit confirmation. */
export async function DELETE(request: Request, { params }: Ctx) {
  const refused = guard(request, { write: true });
  if (refused) return refused;
  try {
    const body = await readJsonBody(request);
    const base = revisionOf(body.baseRevision);
    if (base === null) throw new LibraryError('INVALID', msgs().server.routes.baseRevisionMissing);
    await store().clearProgress((await params).buildId, body.confirm, base);
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}

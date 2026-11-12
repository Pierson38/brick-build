import { msgs } from '@/i18n/runtime';
import { failure, guard, json, readJsonBody, revisionOf } from '@/server/http/guard';
import { store } from '@/server/library/instance';
import { LibraryError } from '@/server/library/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ buildId: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const refused = guard(request, { write: false });
  if (refused) return refused;
  try {
    return json(await store().buildDetail((await params).buildId));
  } catch (e) {
    return failure(e);
  }
}

/** Rename, associate / replace / reorder booklets. The model and its main model never change. */
export async function PATCH(request: Request, { params }: Ctx) {
  const refused = guard(request, { write: true });
  if (refused) return refused;
  try {
    const body = await readJsonBody(request);
    const base = revisionOf(body.baseRevision);
    if (base === null) throw new LibraryError('INVALID', msgs().server.routes.baseRevisionMissing);
    return json({ build: await store().updateBuild((await params).buildId, { label: body.label, bookletFileIds: body.bookletFileIds }, base) });
  } catch (e) {
    return failure(e);
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  const refused = guard(request, { write: true });
  if (refused) return refused;
  try {
    const body = await readJsonBody(request);
    const base = revisionOf(body.baseRevision);
    if (base === null) throw new LibraryError('INVALID', msgs().server.routes.baseRevisionMissing);
    return json(await store().remove({ buildId: (await params).buildId }, body.confirm, base));
  } catch (e) {
    return failure(e);
  }
}

import { msgs } from '@/i18n/runtime';
import { failure, guard, json, readJsonBody, revisionOf } from '@/server/http/guard';
import { store } from '@/server/library/instance';
import { LibraryError } from '@/server/library/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ setId: string }> };

/** Rename / renumber. Progress and mappings belong to the builds and are untouched. */
export async function PATCH(request: Request, { params }: Ctx) {
  const refused = guard(request, { write: true });
  if (refused) return refused;
  try {
    const body = await readJsonBody(request);
    const base = revisionOf(body.baseRevision);
    if (base === null) throw new LibraryError('INVALID', msgs().server.routes.baseRevisionMissing);
    return json({ set: await store().updateSet((await params).setId, { name: body.name, setNumber: body.setNumber }, base) });
  } catch (e) {
    return failure(e);
  }
}

/** Removes the set from the collection: its records go to library/trash/, no file is deleted. */
export async function DELETE(request: Request, { params }: Ctx) {
  const refused = guard(request, { write: true });
  if (refused) return refused;
  try {
    const body = await readJsonBody(request);
    const base = revisionOf(body.baseRevision);
    if (base === null) throw new LibraryError('INVALID', msgs().server.routes.baseRevisionMissing);
    return json(await store().remove({ setId: (await params).setId }, body.confirm, base));
  } catch (e) {
    return failure(e);
  }
}

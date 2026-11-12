import { msgs } from '@/i18n/runtime';
import { failure, guard, json, readJsonBody } from '@/server/http/guard';
import { store } from '@/server/library/instance';
import { parseBuildInput } from '@/server/library/inputs';
import { LibraryError } from '@/server/library/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const refused = guard(request, { write: true });
  if (refused) return refused;
  try {
    const body = await readJsonBody(request);
    if (!Array.isArray(body.builds)) throw new LibraryError('INVALID', msgs().server.routes.buildListExpected);
    const created = await store().createSet({
      setNumber: String(body.setNumber ?? ''),
      name: String(body.name ?? ''),
      builds: body.builds.map(parseBuildInput),
      allowSameNumber: body.allowSameNumber === true,
    });
    return json(created, 201);
  } catch (e) {
    return failure(e);
  }
}

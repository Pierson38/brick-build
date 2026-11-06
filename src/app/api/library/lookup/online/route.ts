import { parseSetNumber } from '@/domain/library/set-number';
import { failure, guard, json, readJsonBody } from '@/server/http/guard';
import { LibraryError } from '@/server/library/store';
import { onlineLookup } from '@/server/online/sources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Online lookup (OMR page of the set, optional Rebrickable metadata). POST with the application
 * header: only this application's page, on an explicit click, can make the server go online.
 */
export async function POST(request: Request) {
  const refused = guard(request, { write: true });
  if (refused) return refused;
  try {
    const body = await readJsonBody(request, 4 * 1024);
    const parsed = parseSetNumber(body.setNumber);
    if (!parsed.ok) throw new LibraryError('INVALID', parsed.error);
    return json(await onlineLookup(parsed.value));
  } catch (e) {
    return failure(e);
  }
}

import { failure, guard, json } from '@/server/http/guard';
import { store } from '@/server/library/instance';
import { localLookup } from '@/server/library/prepare';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Search by set number in the collection and the data folder (no network). */
export async function GET(request: Request) {
  const refused = guard(request, { write: false });
  if (refused) return refused;
  try {
    return json(await localLookup(store(), new URL(request.url).searchParams.get('number') ?? ''));
  } catch (e) {
    return failure(e);
  }
}

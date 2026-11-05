import { failure, guard, json } from '@/server/http/guard';
import { store } from '@/server/library/instance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The whole collection, with a quick state of every file (exists, same size). */
export async function GET(request: Request) {
  const refused = guard(request, { write: false });
  if (refused) return refused;
  try {
    return json(await store().view());
  } catch (e) {
    return failure(e);
  }
}

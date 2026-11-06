import type { ImportInput } from '@/domain/library/import-types';
import { failure, guard, json, readJsonBody } from '@/server/http/guard';
import { store } from '@/server/library/instance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Confirmation: adds the set (or the builds) in one index write; safe to retry. */
export async function POST(request: Request) {
  const refused = guard(request, { write: true });
  if (refused) return refused;
  try {
    const result = await store().importSet((await readJsonBody(request, 64 * 1024)) as unknown as ImportInput);
    return json(result, result.created.length > 0 ? 201 : 200);
  } catch (e) {
    return failure(e);
  }
}

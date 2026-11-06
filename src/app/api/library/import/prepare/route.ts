import { failure, guard, json, readJsonBody } from '@/server/http/guard';
import { store } from '@/server/library/instance';
import { prepareImport, type PrepareInput } from '@/server/library/prepare';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Measures the selected files (read-only): models, booklets, mappings, compatibility inputs. */
export async function POST(request: Request) {
  const refused = guard(request, { write: true });
  if (refused) return refused;
  try {
    return json(await prepareImport(store(), (await readJsonBody(request, 64 * 1024)) as unknown as PrepareInput));
  } catch (e) {
    return failure(e);
  }
}

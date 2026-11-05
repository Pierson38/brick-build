import { failure, guard, json, readJsonBody } from '@/server/http/guard';
import { adopt, discover, type AdoptInput } from '@/server/library/discovery';
import { store } from '@/server/library/instance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Files already present in the data folder (models/, instructions/, mappings/), read-only. */
export async function GET(request: Request) {
  const refused = guard(request, { write: false });
  if (refused) return refused;
  try {
    return json(await discover(store()));
  } catch (e) {
    return failure(e);
  }
}

/** Adds a discovered set to the collection; its files stay where they are. */
export async function POST(request: Request) {
  const refused = guard(request, { write: true });
  if (refused) return refused;
  try {
    const body = await readJsonBody(request);
    return json(await adopt(store(), body as unknown as AdoptInput), 201);
  } catch (e) {
    return failure(e);
  }
}

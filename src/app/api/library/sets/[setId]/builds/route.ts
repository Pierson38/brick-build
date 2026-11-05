import { failure, guard, json, readJsonBody, revisionOf } from '@/server/http/guard';
import { store } from '@/server/library/instance';
import { parseBuildInput } from '@/server/library/inputs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Adds a build (alternative model, other main model) to an existing set. */
export async function POST(request: Request, { params }: { params: Promise<{ setId: string }> }) {
  const refused = guard(request, { write: true });
  if (refused) return refused;
  try {
    const body = await readJsonBody(request);
    const base = revisionOf(body.baseRevision);
    return json({ build: await store().addBuild((await params).setId, parseBuildInput(body.build), base ?? undefined) }, 201);
  } catch (e) {
    return failure(e);
  }
}

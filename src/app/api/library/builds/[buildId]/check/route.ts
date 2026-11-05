import { failure, guard, json } from '@/server/http/guard';
import { store } from '@/server/library/instance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Re-hashes every file of the build. */
export async function GET(request: Request, { params }: { params: Promise<{ buildId: string }> }) {
  const refused = guard(request, { write: false });
  if (refused) return refused;
  try {
    return json({ files: await store().checkBuild((await params).buildId) });
  } catch (e) {
    return failure(e);
  }
}

import { msgs } from '@/i18n/runtime';
import { failure, guard, json, readJsonBody } from '@/server/http/guard';
import { store } from '@/server/library/instance';
import { LibraryError } from '@/server/library/store';
import { NetError, onlineEnabled, safeGet } from '@/server/net/safe-fetch';
import { OMR_FILE, omrFileUrl } from '@/server/online/sources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Downloads ONE model file of the LDraw OMR chosen by the user (explicit click), then checks it
 * like any imported file (size, LDraw text, at least one part) and keeps it in library/staging/
 * with its source URL and the licence written in the file. Nothing is executed.
 */
export async function POST(request: Request) {
  const refused = guard(request, { write: true });
  if (refused) return refused;
  try {
    if (!onlineEnabled()) throw new LibraryError('FORBIDDEN', msgs().server.routes.onlineDisabled);
    const body = await readJsonBody(request, 4 * 1024);
    const url = omrFileUrl(body.url);
    if (!url) throw new LibraryError('FORBIDDEN', msgs().server.routes.omrModelsOnly);
    const pageUrl = typeof body.pageUrl === 'string' && /^https:\/\/library\.ldraw\.org\/omr\/set\/[A-Za-z0-9-]{1,40}$/.test(body.pageUrl) ? body.pageUrl : undefined;
    let res;
    try {
      res = await safeGet(url.toString(), OMR_FILE);
    } catch (e) {
      if (e instanceof NetError) return json({ error: { code: 'NETWORK', message: msgs().server.routes.downloadFailed(e.message) } }, 502);
      throw e;
    }
    const name = decodeURIComponent(url.pathname.split('/').pop()!);
    const file = await store().stage('model', name, (async function* () { yield res.body; })(), {
      source: 'omr', url: url.toString(), ...(pageUrl ? { pageUrl } : {}), retrievedAtIso: new Date().toISOString(),
    });
    return json({ file }, 201);
  } catch (e) {
    return failure(e);
  }
}

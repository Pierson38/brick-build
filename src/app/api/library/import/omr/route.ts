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
    if (!onlineEnabled()) throw new LibraryError('FORBIDDEN', 'Accès Internet désactivé (BRICK_LAB_ONLINE=0).');
    const body = await readJsonBody(request, 4 * 1024);
    const url = omrFileUrl(body.url);
    if (!url) throw new LibraryError('FORBIDDEN', 'Seuls les fichiers de modèles de l’OMR (library.ldraw.org/media/omr_models/…) peuvent être téléchargés.');
    const pageUrl = typeof body.pageUrl === 'string' && /^https:\/\/library\.ldraw\.org\/omr\/set\/[A-Za-z0-9-]{1,40}$/.test(body.pageUrl) ? body.pageUrl : undefined;
    let res;
    try {
      res = await safeGet(url.toString(), OMR_FILE);
    } catch (e) {
      if (e instanceof NetError) return json({ error: { code: 'NETWORK', message: `Téléchargement impossible : ${e.message} Ouvre la page de l’OMR et dépose le fichier ici.` } }, 502);
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

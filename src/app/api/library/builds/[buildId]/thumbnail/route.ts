import { msgs } from '@/i18n/runtime';
import { failure, guard, json, readBody } from '@/server/http/guard';
import { store } from '@/server/library/instance';
import { LibraryError, MAX_BYTES } from '@/server/library/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ buildId: string }> };

/** Thumbnail rendered locally from the 3D model by the browser (never a downloaded image). */
export async function GET(request: Request, { params }: Ctx) {
  const refused = guard(request, { write: false });
  if (refused) return refused;
  try {
    const png = await store().readThumbnail((await params).buildId);
    if (!png) throw new LibraryError('NOT_FOUND', msgs().server.routes.noThumbnail);
    return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' } });
  } catch (e) {
    return failure(e);
  }
}

export async function PUT(request: Request, { params }: Ctx) {
  const refused = guard(request, { write: true });
  if (refused) return refused;
  try {
    if (request.headers.get('content-type') !== 'image/png') throw new LibraryError('UNSUPPORTED', msgs().server.routes.pngExpected);
    await store().putThumbnail((await params).buildId, await readBody(request, MAX_BYTES.thumbnail));
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}

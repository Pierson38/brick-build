import { failure, guard } from '@/server/http/guard';
import { store } from '@/server/library/instance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TYPES = { model: 'text/plain; charset=utf-8', pdf: 'application/pdf', mapping: 'application/json' } as const;

/** Bytes of a library file, only after its SHA-256 matched the index (409 otherwise). */
export async function GET(request: Request, { params }: { params: Promise<{ sha: string }> }) {
  const refused = guard(request, { write: false });
  if (refused) return refused;
  try {
    const { file, bytes } = await store().readVerified((await params).sha);
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': TYPES[file.kind],
        'Content-Length': String(bytes.length),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'attachment',
        'X-Brick-Lab-Sha256': file.sha256,
      },
    });
  } catch (e) {
    return failure(e);
  }
}

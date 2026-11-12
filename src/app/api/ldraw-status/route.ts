import { msgs } from '@/i18n/runtime';
import { libraryRoot, resolveLibraryFile } from '@/infra/ldraw/library-path';
import { enterRequestLocale } from '@/server/http/locale';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  enterRequestLocale(request);
  const root = libraryRoot();
  if (!root) return Response.json({ configured: false, reason: msgs().server.routes.ldrawVariableMissing });
  try {
    const config = await resolveLibraryFile(root, ['LDConfig.ldr']);
    if (!config) return Response.json({ configured: false, reason: msgs().server.routes.ldconfigMissing });
    return Response.json({ configured: true });
  } catch {
    return Response.json({ configured: false, reason: msgs().server.routes.ldrawFolderUnreadable });
  }
}

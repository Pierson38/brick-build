import { libraryRoot, resolveLibraryFile } from '@/infra/ldraw/library-path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const root = libraryRoot();
  if (!root) return Response.json({ configured: false, reason: 'Variable LDRAW_LIBRARY_DIR absente.' });
  try {
    const config = await resolveLibraryFile(root, ['LDConfig.ldr']);
    if (!config) return Response.json({ configured: false, reason: 'LDConfig.ldr introuvable dans la bibliothèque.' });
    return Response.json({ configured: true });
  } catch {
    return Response.json({ configured: false, reason: 'Dossier de bibliothèque illisible.' });
  }
}

import { libraryRoot, resolveLibraryFile, sanitizeSegments } from '@/infra/ldraw/library-path';

// Server-only. First-level check of the part files a model references against the local LDraw
// library (LDRAW_LIBRARY_DIR), in the folders LDrawLoader searches. Sub-files of a part
// (primitives) are not followed here: a missing primitive still shows when the model is rendered.

const FOLDERS = ['parts', 'p', 'models', ''] as const;

export const partsLibraryConfigured = () => libraryRoot() !== null;

/** Part references absent from the local library. Null when no library is configured. */
export async function missingPartRefs(refs: readonly string[]): Promise<Set<string> | null> {
  const root = libraryRoot();
  if (!root) return null;
  const missing = new Set<string>();
  for (const ref of new Set(refs.map((r) => r.trim().replace(/\\/g, '/').toLowerCase()))) {
    let found = false;
    for (const folder of FOLDERS) {
      const segments = sanitizeSegments([...(folder ? [folder] : []), ...ref.split('/')]);
      if (!segments) break;
      if (await resolveLibraryFile(root, segments).catch(() => null)) {
        found = true;
        break;
      }
    }
    if (!found) missing.add(ref);
  }
  return missing;
}

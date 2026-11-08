import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isSafeOnPlatform } from '@/infra/portable-name';

// Server-only: resolves files of the user's local LDraw library (LDRAW_LIBRARY_DIR).

const SEGMENT_RE = /^[A-Za-z0-9_\-.]+$/;
const ALLOWED_EXT = /\.(dat|ldr)$/i;
export const MAX_LIBRARY_FILE_BYTES = 4 * 1024 * 1024;

export function libraryRoot(): string | null {
  const dir = process.env.LDRAW_LIBRARY_DIR;
  return dir && dir.trim() ? path.resolve(dir.trim()) : null;
}

/** Validates request segments; returns null when the path must be refused. */
export function sanitizeSegments(segments: readonly string[]): string[] | null {
  if (segments.length === 0 || segments.length > 4) return null;
  if (!segments.every((s) => SEGMENT_RE.test(s) && s !== '.' && s !== '..' && isSafeOnPlatform(s))) return null;
  if (!ALLOWED_EXT.test(segments.at(-1)!)) return null;
  return [...segments];
}

/** Finds the file, trying the exact case then lower case, and checks it stays inside the root. */
export async function resolveLibraryFile(root: string, segments: readonly string[]): Promise<string | null> {
  const realRoot = await fs.realpath(root);
  for (const candidate of [segments.join('/'), segments.join('/').toLowerCase()]) {
    const full = path.resolve(realRoot, candidate);
    try {
      const real = await fs.realpath(full);
      if (!real.startsWith(realRoot + path.sep)) continue;
      const stat = await fs.stat(real);
      if (stat.isFile() && stat.size <= MAX_LIBRARY_FILE_BYTES) return real;
    } catch {
      // not found: try next candidate
    }
  }
  return null;
}

import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

// Server-only: where the library lives, and the only way a stored relative path becomes a real path.

/** Default data folder; `BRICK_LAB_DATA_DIR` overrides it (tests use a temporary folder). */
export function dataRoot(): string {
  const dir = process.env.BRICK_LAB_DATA_DIR?.trim();
  // runtime folder of the user, not part of the build output (no file tracing)
  return path.resolve(/* turbopackIgnore: true */ dir || path.join(homedir(), 'Documents', 'brick-lab-data'));
}

/** Everything P7 writes goes under `<data>/library/`; files found elsewhere in `<data>` are only read. */
export const LIBRARY_DIRNAME = 'library';

const SEGMENT_RE = /^[A-Za-z0-9 _()+.,'&-]{1,128}$/;

/**
 * Validates a stored relative path (forward slashes, at most 6 segments, no `.`/`..`, no hidden
 * file, plain characters). Returns the segments, or null when the path must be refused.
 */
export function safeSegments(rel: string): string[] | null {
  if (typeof rel !== 'string' || rel.length === 0 || rel.length > 512 || rel.includes('\\') || rel.startsWith('/')) return null;
  const segments = rel.split('/');
  if (segments.length > 6) return null;
  if (!segments.every((s) => SEGMENT_RE.test(s) && s !== '.' && s !== '..' && !s.startsWith('.'))) return null;
  return segments;
}

export class UnsafePathError extends Error {}

/**
 * Resolves `rel` inside `root`, following symbolic links, and checks that the real target is
 * still inside the real root. Throws UnsafePathError otherwise; ENOENT when it does not exist.
 */
export async function resolveInside(root: string, rel: string): Promise<string> {
  const segments = safeSegments(rel);
  if (!segments) throw new UnsafePathError(`Chemin refusé : ${JSON.stringify(rel).slice(0, 80)}`);
  const realRoot = await fs.realpath(root);
  const real = await fs.realpath(path.join(realRoot, ...segments));
  if (!real.startsWith(realRoot + path.sep)) throw new UnsafePathError('Chemin hors du dossier de données.');
  return real;
}

/** Same check for a path that may not exist yet (its parent must). */
export async function resolveNewInside(root: string, rel: string): Promise<string> {
  const segments = safeSegments(rel);
  if (!segments) throw new UnsafePathError(`Chemin refusé : ${JSON.stringify(rel).slice(0, 80)}`);
  const realRoot = await fs.realpath(root);
  const target = path.join(realRoot, ...segments);
  const parent = await fs.realpath(path.dirname(target)).catch(() => null);
  if (parent !== null && parent !== realRoot && !parent.startsWith(realRoot + path.sep)) throw new UnsafePathError('Chemin hors du dossier de données.');
  return target;
}

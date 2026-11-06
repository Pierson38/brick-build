import type { LocalBuildProgress } from '@/domain/build/progress';

// Browser-only progress store. Values are untrusted on read: callers validate with restoreProgress().

const PREFIX = 'brick-lab:progress:';
const MAX_ENTRY_BYTES = 512 * 1024;

export function loadStoredProgress(hash: string): unknown {
  try {
    const raw = window.localStorage.getItem(PREFIX + hash);
    if (!raw || raw.length > MAX_ENTRY_BYTES) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function saveProgress(progress: LocalBuildProgress): boolean {
  try {
    const raw = JSON.stringify(progress);
    if (raw.length > MAX_ENTRY_BYTES) return false;
    window.localStorage.setItem(PREFIX + progress.modelContentHash, raw);
    return true;
  } catch {
    return false;
  }
}

export function clearProgress(hash: string): void {
  try {
    window.localStorage.removeItem(PREFIX + hash);
  } catch {
    // storage unavailable: nothing to clear
  }
}

export interface RecentSession {
  readonly hash: string;
  readonly displayName: string;
  readonly placed: number;
  readonly total: number;
  readonly updatedAtIso: string;
}

export function listRecentSessions(limit = 8): RecentSession[] {
  const out: RecentSession[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const value = loadStoredProgress(key.slice(PREFIX.length)) as Partial<LocalBuildProgress> | null;
      if (!value || typeof value.displayName !== 'string' || !Array.isArray(value.placedOccurrenceIds)) continue;
      out.push({
        hash: key.slice(PREFIX.length),
        displayName: value.displayName,
        placed: value.placedOccurrenceIds.length + (Array.isArray(value.freePieces) ? value.freePieces.length : 0),
        total: typeof value.totalOccurrences === 'number' ? value.totalOccurrences : 0,
        updatedAtIso: typeof value.updatedAtIso === 'string' ? value.updatedAtIso : '',
      });
    }
  } catch {
    return [];
  }
  return out.sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso)).slice(0, limit);
}

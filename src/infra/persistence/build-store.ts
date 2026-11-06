import type { LocalBuildProgress } from '@/domain/build/progress';
import { parseMapping, serializeMapping, type InstructionMapping, type ParseMappingResult } from '@/domain/instructions/mapping';
import { ApiError, libraryApi } from '../library/api';
import { clearMapping, loadStoredMapping, saveMapping } from './local-mapping';
import { clearProgress, loadStoredProgress, saveProgress } from './local-progress';

/**
 * Where the atelier keeps a build's progress and mapping. P5/P6 used this browser's localStorage
 * (still the store of the standalone atelier); P7 adds the library on the local disk, shared by
 * every browser of this Mac. The atelier logic (restore, validation, fallback) is the same for both.
 */
export type SaveState = { kind: 'idle' | 'saving' | 'saved' } | { kind: 'error' | 'conflict'; message: string };

export interface BuildStore {
  readonly kind: 'browser' | 'library';
  loadProgress(hash: string): Promise<unknown>;
  saveProgress(progress: LocalBuildProgress): void;
  /** "Recommencer" / "Abandonner". */
  clearProgress(hash: string): Promise<boolean>;
  loadMapping(hash: string): Promise<ParseMappingResult | null>;
  saveMapping(mapping: InstructionMapping): Promise<boolean>;
  /** Called before an emptied mapping is saved ("Tout effacer"). */
  clearMapping(hash: string): void;
  onSaveState(listener: (s: SaveState) => void): () => void;
  /** Sends what is pending now (leaving the page). */
  flush(): void;
}

export const browserStore: BuildStore = {
  kind: 'browser',
  loadProgress: async (hash) => loadStoredProgress(hash),
  saveProgress: (p) => void saveProgress(p),
  clearProgress: async (hash) => {
    clearProgress(hash);
    return true;
  },
  loadMapping: async (hash) => loadStoredMapping(hash),
  saveMapping: async (m) => saveMapping(m),
  clearMapping: (hash) => clearMapping(hash),
  onSaveState: () => () => undefined,
  flush: () => undefined,
};

export interface LibraryStoreInit {
  readonly buildId: string;
  readonly progress: { revision: number | null; payload: unknown };
  readonly mapping: { revision: number | null; payload: unknown };
}

/**
 * Library-backed store. Saves are sent one at a time, the latest state wins, and each carries the
 * revision it replaces: if another tab or browser changed the game in between, the server refuses
 * (409) and the atelier says so instead of overwriting; a change of PDF page only is reconciled.
 */
export function libraryBuildStore(init: LibraryStoreInit): BuildStore {
  let progressRev = init.progress.revision;
  let mappingRev = init.mapping.revision;
  let pending: LocalBuildProgress | null = null;
  let inFlight = false;
  let stopped: SaveState | null = null;
  let clearing = false;
  let mappingChain: Promise<boolean> = Promise.resolve(true);
  // what the library holds, without its timestamp: re-saving the same state (opening the build,
  // re-rendering) writes nothing, so merely opening a build in two tabs is not a conflict
  const signature = (p: unknown) => {
    if (p === null || typeof p !== 'object') return 'null';
    const { updatedAtIso: _ignored, ...rest } = p as Record<string, unknown>;
    return JSON.stringify(rest);
  };
  let saved = signature(init.progress.payload);
  // the game itself (mode, placed bricks, mapping played): what must never be overwritten silently
  let base: unknown = init.progress.payload;
  const game = (p: unknown) => {
    if (p === null || typeof p !== 'object') return 'null';
    const r = p as Partial<LocalBuildProgress>;
    // free pieces are part of the game: a conflict on them is never resolved silently
    return JSON.stringify([r.buildMode, [...(r.placedOccurrenceIds ?? [])].sort(), r.mappingDigest ?? null, r.freePieces ?? []]);
  };
  const listeners = new Set<(s: SaveState) => void>();
  const emit = (s: SaveState) => listeners.forEach((l) => l(s));
  const fail = (e: unknown): SaveState => (e instanceof ApiError && e.code === 'CONFLICT'
    ? { kind: 'conflict', message: e.message }
    : { kind: 'error', message: e instanceof Error ? e.message : String(e) });

  const pump = async () => {
    if (inFlight || !pending || stopped) return;
    inFlight = true;
    const next = pending;
    pending = null;
    emit({ kind: 'saving' });
    try {
      progressRev = (await libraryApi.putProgress(init.buildId, progressRev, next)).revision;
      saved = signature(next);
      base = next;
      emit({ kind: pending ? 'saving' : 'saved' });
    } catch (e) {
      const s = fail(e);
      if (s.kind === 'conflict') {
        // Saved elsewhere in between. If only the view changed there (PDF page or booklet, e.g. two
        // tabs opened together), the game is the same: take that revision and save again. If the
        // game changed (bricks, mode, mapping), stop: nothing is overwritten.
        const current = await libraryApi.progress(init.buildId).catch(() => null);
        if (current && current.revision !== null && game(current.progress) === game(base)) {
          progressRev = current.revision;
          base = current.progress;
          pending ??= next;
        } else {
          stopped = s;
          emit(s);
        }
      } else {
        pending ??= next; // retried with the next change or the next flush
        emit(s);
      }
    } finally {
      inFlight = false;
      if (pending && !stopped) void pump();
    }
  };

  return {
    kind: 'library',
    loadProgress: async () => init.progress.payload,
    saveProgress: (p) => {
      if (signature(p) === saved && !inFlight) {
        pending = null;
        return;
      }
      pending = p;
      void pump();
    },
    clearProgress: async () => {
      if (progressRev === null) return true;
      try {
        await libraryApi.clearProgress(init.buildId, progressRev);
        progressRev = null;
        saved = 'null';
        base = null;
        pending = null;
        return true;
      } catch (e) {
        emit(fail(e));
        return false;
      }
    },
    loadMapping: async () => (init.mapping.payload === null ? null : parseMapping(init.mapping.payload)),
    // in order, one at a time: each save carries the revision returned by the previous one
    saveMapping: (m) => {
      const run = mappingChain.then(async () => {
        if (stopped) return false;
        try {
          mappingRev = (await libraryApi.putMapping(init.buildId, mappingRev, serializeMapping(m), clearing ? 'clear' : 'editor')).revision;
          clearing = false;
          return true;
        } catch (e) {
          const s = fail(e);
          if (s.kind === 'conflict') stopped = s;
          emit(s);
          return false;
        }
      });
      mappingChain = run;
      return run;
    },
    clearMapping: () => {
      clearing = true;
    },
    onSaveState: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    flush: () => {
      if (!pending || inFlight || stopped) return;
      // keepalive: the request survives the page being closed or left
      const next = pending;
      void libraryApi.putProgress(init.buildId, progressRev, next, true).then((r) => {
        progressRev = r.revision;
        saved = signature(next);
        base = next;
      }, () => undefined);
      pending = null;
    },
  };
}

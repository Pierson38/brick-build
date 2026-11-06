import type { FileProvenance, ImportInput, ImportResult, LocalLookup, OnlineLookup, PreparedImport } from '@/domain/library/import-types';
import type { FileKind, LibraryView, SetView, BuildView, DiscoveryResult, LibrarySet } from '@/domain/library/types';

// Browser side of the local library API (same origin, 127.0.0.1). Writes carry the header that the
// server requires (see src/server/http/guard.ts); nothing is ever sent elsewhere.

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}) {
    super(message);
  }
}

const WRITE_HEADERS = { 'x-brick-lab': '1' };

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    const write = init.method !== undefined && init.method !== 'GET';
    res = await fetch(path, { cache: 'no-store', ...init, headers: { ...(write ? WRITE_HEADERS : {}), ...(init.headers as Record<string, string> | undefined) } });
  } catch {
    throw new ApiError(0, 'OFFLINE', 'Serveur local injoignable : relance `npm run start` (ou `npm run dev`).');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } & Record<string, unknown> } | null;
    const { code = 'HTTP', message = `Erreur ${res.status}.`, ...details } = body?.error ?? {};
    throw new ApiError(res.status, code, message, details);
  }
  return (await res.json()) as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

export interface UploadedFile { sha256: string; kind: FileKind; size: number; originalName: string; location: 'blob' | 'external' }

export interface StagedFile { sha256: string; kind: FileKind; size: number; originalName: string; provenance: FileProvenance; inLibrary: boolean }

export const libraryApi = {
  view: () => call<LibraryView>('/api/library'),
  build: (id: string) => call<{ revision: number; set: LibrarySet; build: BuildView }>(`/api/library/builds/${encodeURIComponent(id)}`),
  check: (id: string) => call<{ files: { sha256: string; kind: FileKind; originalName: string; state: string; message: string | null }[] }>(`/api/library/builds/${encodeURIComponent(id)}/check`),
  discover: () => call<DiscoveryResult>('/api/library/discover'),
  adopt: (body: unknown) => call<{ set: LibrarySet }>('/api/library/discover', jsonInit('POST', body)),

  upload: (kind: FileKind, file: File) =>
    call<{ file: UploadedFile; duplicate: boolean }>(`/api/library/files?kind=${kind}&name=${encodeURIComponent(file.name)}`, {
      method: 'POST', body: file, headers: { 'content-type': 'application/octet-stream' },
    }),
  /** Bytes of a library file (the server checked its SHA-256; the caller checks it again). */
  fileBytes: async (sha: string): Promise<ArrayBuffer> => {
    const res = await fetch(`/api/library/files/${sha}`, { cache: 'no-store' }).catch(() => null);
    if (!res) throw new ApiError(0, 'OFFLINE', 'Serveur local injoignable.');
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } & Record<string, unknown> } | null;
      const { code = 'HTTP', message = `Erreur ${res.status}.`, ...details } = body?.error ?? {};
      throw new ApiError(res.status, code, message, details);
    }
    return res.arrayBuffer();
  },

  // P8 simplified import
  lookup: (number: string) => call<LocalLookup>(`/api/library/lookup?number=${encodeURIComponent(number)}`),
  lookupOnline: (setNumber: string) => call<OnlineLookup>('/api/library/lookup/online', jsonInit('POST', { setNumber })),
  stage: (kind: FileKind, file: File) =>
    call<{ file: StagedFile }>(`/api/library/import/files?kind=${kind}&name=${encodeURIComponent(file.name)}`, {
      method: 'POST', body: file, headers: { 'content-type': 'application/octet-stream' },
    }),
  downloadOmr: (url: string, pageUrl: string | null) => call<{ file: StagedFile }>('/api/library/import/omr', jsonInit('POST', { url, ...(pageUrl ? { pageUrl } : {}) })),
  prepare: (body: { setNumber?: string; files: unknown[]; extraRoots?: unknown[] }) => call<PreparedImport>('/api/library/import/prepare', jsonInit('POST', body)),
  importSet: (body: ImportInput) => call<ImportResult>('/api/library/import', jsonInit('POST', body)),

  createSet: (body: { setNumber: string; name: string; builds: unknown[]; allowSameNumber?: boolean }) =>
    call<{ set: LibrarySet; builds: { id: string }[] }>('/api/library/sets', jsonInit('POST', body)),
  updateSet: (id: string, baseRevision: number, patch: { name?: string; setNumber?: string }) =>
    call<{ set: LibrarySet }>(`/api/library/sets/${encodeURIComponent(id)}`, jsonInit('PATCH', { baseRevision, ...patch })),
  removeSet: (id: string, baseRevision: number) => call<{ trashedTo: string }>(`/api/library/sets/${encodeURIComponent(id)}`, jsonInit('DELETE', { baseRevision, confirm: true })),
  addBuild: (setId: string, baseRevision: number, build: unknown) => call<{ build: { id: string } }>(`/api/library/sets/${encodeURIComponent(setId)}/builds`, jsonInit('POST', { baseRevision, build })),
  updateBuild: (id: string, baseRevision: number, patch: { label?: string; bookletFileIds?: string[] }) =>
    call<unknown>(`/api/library/builds/${encodeURIComponent(id)}`, jsonInit('PATCH', { baseRevision, ...patch })),
  removeBuild: (id: string, baseRevision: number) => call<{ trashedTo: string }>(`/api/library/builds/${encodeURIComponent(id)}`, jsonInit('DELETE', { baseRevision, confirm: true })),

  progress: (id: string) => call<{ revision: number | null; progress: unknown; savedAtIso?: string }>(`/api/library/builds/${encodeURIComponent(id)}/progress`),
  putProgress: (id: string, baseRevision: number | null, progress: unknown, keepalive = false, source: 'atelier' | 'browser' = 'atelier') =>
    call<{ revision: number }>(`/api/library/builds/${encodeURIComponent(id)}/progress`, { ...jsonInit('PUT', { baseRevision, progress, source }), keepalive }),
  clearProgress: (id: string, baseRevision: number) => call<unknown>(`/api/library/builds/${encodeURIComponent(id)}/progress`, jsonInit('DELETE', { baseRevision, confirm: true })),
  mapping: (id: string) => call<{ revision: number | null; mapping: unknown }>(`/api/library/builds/${encodeURIComponent(id)}/mapping`),
  putMapping: (id: string, baseRevision: number | null, text: string, source: 'editor' | 'import' | 'clear' | 'browser') =>
    call<{ revision: number }>(`/api/library/builds/${encodeURIComponent(id)}/mapping`, jsonInit('PUT', { baseRevision, text, source })),
  putThumbnail: (id: string, png: Blob) => call<unknown>(`/api/library/builds/${encodeURIComponent(id)}/thumbnail`, { method: 'PUT', body: png, headers: { 'content-type': 'image/png' } }),
  thumbnailUrl: (b: Pick<BuildView, 'id' | 'updatedAtIso'>) => `/api/library/builds/${encodeURIComponent(b.id)}/thumbnail`,
};

export type { SetView, BuildView };

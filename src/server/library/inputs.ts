import { msgs } from '@/i18n/runtime';
import { LibraryError, type NewBuildInput } from './store';

/** Request body → build input (types only; the store validates the content). */
export function parseBuildInput(v: unknown): NewBuildInput {
  if (typeof v !== 'object' || v === null) throw new LibraryError('INVALID', msgs().server.inputs.invalidBuild);
  const b = v as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === 'string' ? x : undefined);
  const label = str(b.label);
  const modelFileId = str(b.modelFileId);
  if (!label || !modelFileId) throw new LibraryError('INVALID', msgs().server.inputs.buildNameAndModel);
  const rootName = str(b.rootName);
  const mappingFileId = str(b.mappingFileId);
  if (b.bookletFileIds !== undefined && !Array.isArray(b.bookletFileIds)) throw new LibraryError('INVALID', msgs().server.inputs.invalidBookletList);
  return {
    label, modelFileId,
    ...(rootName ? { rootName } : {}),
    ...(mappingFileId ? { mappingFileId } : {}),
    bookletFileIds: ((b.bookletFileIds as unknown[] | undefined) ?? []).map((x) => String(x)),
  };
}

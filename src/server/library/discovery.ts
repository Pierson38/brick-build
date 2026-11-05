import { promises as fs, type Dirent } from 'node:fs';
import path from 'node:path';
import { analyzeModel } from '@/domain/import/analyze';
import { parseMappingText } from '@/domain/instructions/mapping';
import {
  SET_NUMBER_RE, type DiscoveredFile, type DiscoveredMapping, type DiscoveredModel, type DiscoveredSet, type DiscoveryResult, type LibraryIndex,
} from '@/domain/library/types';
import { safeSegments } from './paths';
import { LibraryError, MAX_BYTES, sha256, type LibraryStore } from './store';

// Server-only. Looks for the files the user already keeps in the data folder, with the layout used
// since P5: models/<set>/<file>.mpd|ldr, instructions/<set>/<file>.pdf, mappings/<file>.json.
// Read-only, never follows symbolic links, never leaves these three folders, bounded in count.

export const DISCOVERY_DIRS = ['models', 'instructions', 'mappings'] as const;
const MAX_FOLDERS = 200;
const MAX_FILES_PER_FOLDER = 50;
const MAX_TOTAL_BYTES = 4 * 1024 ** 3;

const hashCache = new Map<string, { size: number; mtimeMs: number; sha: string }>();

interface Found { rel: string; abs: string; name: string; size: number }

async function plainEntries(dir: string): Promise<Dirent[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [] as Dirent[]);
  // no symbolic link, no hidden or unusual name: nothing can lead outside the folder
  return entries.filter((e) => !e.isSymbolicLink() && !e.name.startsWith('.') && safeSegments(e.name) !== null).sort((a, b) => a.name.localeCompare(b.name));
}

async function filesIn(root: string, relDir: string, ext: RegExp, skipped: string[]): Promise<Found[]> {
  const out: Found[] = [];
  const entries = await plainEntries(path.join(root, relDir));
  if (entries.length > MAX_FILES_PER_FOLDER) skipped.push(`${relDir} : plus de ${MAX_FILES_PER_FOLDER} entrées, seules les premières sont lues.`);
  for (const e of entries.slice(0, MAX_FILES_PER_FOLDER)) {
    if (!e.isFile() || !ext.test(e.name)) continue;
    const rel = `${relDir}/${e.name}`;
    const abs = path.join(root, relDir, e.name);
    const stat = await fs.lstat(abs);
    out.push({ rel, abs, name: e.name, size: stat.size });
  }
  return out;
}

async function hashOf(f: Found): Promise<string> {
  const stat = await fs.lstat(f.abs);
  const cached = hashCache.get(f.abs);
  if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) return cached.sha;
  const sha = sha256(await fs.readFile(f.abs));
  hashCache.set(f.abs, { size: stat.size, mtimeMs: stat.mtimeMs, sha });
  return sha;
}

export async function discover(store: LibraryStore): Promise<DiscoveryResult> {
  const started = performance.now();
  const root = await fs.realpath(store.dataDir).catch(() => null);
  const skipped: string[] = [];
  if (!root) return { dataDir: store.dataDir, sets: [], skipped: ['Dossier de données absent.'], durationMs: 0 };
  const index: LibraryIndex = await store.readIndex();
  let budget = MAX_TOTAL_BYTES;
  const take = (f: Found, max: number) => {
    if (f.size > max) {
      skipped.push(`${f.rel} : trop volumineux.`);
      return false;
    }
    if (f.size > budget) {
      skipped.push(`${f.rel} : quota de lecture atteint.`);
      return false;
    }
    budget -= f.size;
    return true;
  };
  const describe = async (f: Found): Promise<DiscoveredFile> => {
    const sha = await hashOf(f);
    return { rel: f.rel, name: f.name, size: f.size, sha256: sha, inLibrary: Boolean(index.files[sha]) };
  };

  const folders = new Map<string, { models: DiscoveredModel[]; pdfs: DiscoveredFile[] }>();
  const folder = (name: string) => {
    let f = folders.get(name);
    if (!f) folders.set(name, (f = { models: [], pdfs: [] }));
    return f;
  };

  for (const [top, ext, kind] of [['models', /\.(mpd|ldr)$/i, 'model'], ['instructions', /\.pdf$/i, 'pdf']] as const) {
    const dirs = (await plainEntries(path.join(/* turbopackIgnore: true */ root, top))).filter((e) => e.isDirectory());
    if (dirs.length > MAX_FOLDERS) skipped.push(`${top} : plus de ${MAX_FOLDERS} dossiers, seuls les premiers sont lus.`);
    for (const d of dirs.slice(0, MAX_FOLDERS)) {
      for (const f of await filesIn(root, `${top}/${d.name}`, ext, skipped)) {
        if (!take(f, MAX_BYTES[kind])) continue;
        const base = await describe(f);
        if (kind === 'pdf') {
          const head = Buffer.alloc(1024);
          const h = await fs.open(f.abs, 'r');
          await h.read(head, 0, 1024, 0).finally(() => h.close());
          if (head.indexOf('%PDF-') < 0) skipped.push(`${f.rel} : pas un PDF.`);
          else folder(d.name).pdfs.push(base);
          continue;
        }
        const a = analyzeModel(await fs.readFile(f.abs, 'utf8'), f.name);
        if (a.model.occurrences.length === 0) {
          skipped.push(`${f.rel} : aucune pièce lue.`);
          continue;
        }
        const existing = index.builds.find((b) => b.modelFileId === base.sha256 && b.rootName === a.model.rootName);
        folder(d.name).models.push({
          ...base,
          title: a.document.sections.find((s) => s.name === a.model.rootName)?.meta?.title ?? '',
          rootName: a.model.rootName,
          rootCandidates: a.rootCandidates,
          occurrenceCount: a.model.occurrences.length,
          planKind: a.plan.kind,
          stepCount: a.plan.steps.length,
          existingBuild: existing ? { setId: existing.setId, buildId: existing.id, label: existing.label } : null,
        });
      }
    }
  }

  // mappings are matched by the model fingerprint they contain, never by their file name
  const mappings: DiscoveredMapping[] = [];
  for (const f of await filesIn(root, 'mappings', /\.json$/i, skipped)) {
    if (!take(f, MAX_BYTES.mapping)) continue;
    const parsed = parseMappingText(await fs.readFile(f.abs, 'utf8'));
    if (!parsed.ok) {
      skipped.push(`${f.rel} : ${parsed.errors[0] ?? 'illisible'}`);
      continue;
    }
    const m = parsed.mapping;
    mappings.push({
      ...(await describe(f)),
      modelSha256: m.model.sha256,
      rootName: m.model.rootName,
      steps: m.steps.length,
      verified: m.steps.filter((s) => s.provenance === 'verified').length,
      bookletSha256s: m.booklets.map((b) => b.sha256).filter((s): s is string => s !== null),
    });
  }

  const sets: DiscoveredSet[] = [...folders.entries()].filter(([, f]) => f.models.length > 0).map(([name, f]) => ({
    folder: name,
    setNumber: SET_NUMBER_RE.test(name) ? name : null,
    models: f.models,
    pdfs: f.pdfs,
    mappings: mappings.filter((m) => f.models.some((x) => x.sha256 === m.modelSha256 && x.rootName === m.rootName)),
  }));
  return { dataDir: store.dataDir, sets, skipped, durationMs: Math.round(performance.now() - started) };
}

export interface AdoptInput {
  readonly setNumber: string;
  readonly name: string;
  readonly models: readonly { readonly rel: string; readonly sha256: string; readonly label: string; readonly rootName?: string }[];
  readonly pdfs: readonly { readonly rel: string; readonly sha256: string }[];
  /** At most one mapping per model, by model SHA-256. */
  readonly mappings: readonly { readonly rel: string; readonly sha256: string; readonly modelSha256: string }[];
}

const inScope = (rel: unknown, top: (typeof DISCOVERY_DIRS)[number]) => typeof rel === 'string' && safeSegments(rel) !== null && rel.split('/')[0] === top;

/**
 * Adds discovered files to the library WITHOUT copying or moving them: they are referenced in
 * place, re-hashed now, and their fingerprint is checked again at every use.
 */
export async function adopt(store: LibraryStore, input: AdoptInput) {
  if (!Array.isArray(input.models) || input.models.length === 0 || input.models.length > 20) throw new LibraryError('INVALID', 'Choisis au moins un modèle.');
  if (!Array.isArray(input.pdfs) || input.pdfs.length > 20 || !Array.isArray(input.mappings) || input.mappings.length > 20) throw new LibraryError('INVALID', 'Sélection invalide.');
  if (!input.models.every((m) => inScope(m.rel, 'models')) || !input.pdfs.every((p) => inScope(p.rel, 'instructions')) || !input.mappings.every((m) => inScope(m.rel, 'mappings'))) {
    throw new LibraryError('FORBIDDEN', 'Seuls les fichiers détectés dans models/, instructions/ et mappings/ peuvent être ajoutés ainsi.');
  }
  for (const m of input.models) await store.registerExternal('model', m.rel, m.sha256);
  for (const p of input.pdfs) await store.registerExternal('pdf', p.rel, p.sha256);
  for (const m of input.mappings) await store.registerExternal('mapping', m.rel, m.sha256);
  return store.createSet({
    setNumber: input.setNumber,
    name: input.name,
    builds: input.models.map((m) => {
      const mapping = input.mappings.find((x) => x.modelSha256 === m.sha256);
      return {
        label: m.label,
        modelFileId: m.sha256,
        ...(m.rootName ? { rootName: m.rootName } : {}),
        bookletFileIds: input.pdfs.map((p) => p.sha256),
        ...(mapping ? { mappingFileId: mapping.sha256 } : {}),
      };
    }),
  }, 'discovery');
}

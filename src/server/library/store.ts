import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { availableModes } from '@/domain/build/engine';
import { restoreProgress, type LocalBuildProgress } from '@/domain/build/progress';
import { analyzeModel, type ModelAnalysis } from '@/domain/import/analyze';
import { MAX_MAPPING_BYTES, parseMapping, parseMappingText, serializeMapping, validateMapping, type InstructionMapping } from '@/domain/instructions/mapping';
import {
  buildStatus, cleanName, ID_RE, SET_NUMBER_RE, SHA256_RE,
  type BuildView, type FileKind, type FileState, type FileView, type LibraryBuild, type LibraryFile, type LibraryIndex, type LibrarySet,
  type LibraryView, type MappingView, type ModelSnapshot, type ProgressView,
} from '@/domain/library/types';
import { Mutex, linkNewFile, readJson, tmpName, writeFileAtomic } from './fs-atomic';
import { LIBRARY_DIRNAME, resolveInside, safeSegments, UnsafePathError } from './paths';
import { emptyIndex, MAX_INDEX_BYTES, parseIndex, parseRecord, RECORD_FORMAT, type StoredRecord } from './schema';

// Server-only. The personal library on the local disk: one JSON index, content-addressed copies of
// imported files, per-build records. Never deletes or overwrites a user file: removals go to
// `library/trash/`, replaced records to `history/`, and discovered files are only read.

export type LibraryErrorCode =
  | 'NOT_FOUND' | 'CONFLICT' | 'DUPLICATE' | 'INVALID' | 'TOO_LARGE' | 'UNSUPPORTED'
  | 'CORRUPT_INDEX' | 'FILE_PROBLEM' | 'STORAGE' | 'CONFIRMATION_REQUIRED' | 'FORBIDDEN';

const STATUS: Record<LibraryErrorCode, number> = {
  NOT_FOUND: 404, CONFLICT: 409, DUPLICATE: 409, INVALID: 422, TOO_LARGE: 413, UNSUPPORTED: 415,
  CORRUPT_INDEX: 503, FILE_PROBLEM: 409, STORAGE: 500, CONFIRMATION_REQUIRED: 428, FORBIDDEN: 403,
};

export class LibraryError extends Error {
  readonly status: number;
  constructor(readonly code: LibraryErrorCode, message: string, readonly details: Record<string, unknown> = {}) {
    super(message);
    this.status = STATUS[code];
  }
}

export const MAX_BYTES: Record<FileKind | 'thumbnail', number> = {
  model: 8 * 1024 * 1024,
  pdf: 300 * 1024 * 1024,
  mapping: MAX_MAPPING_BYTES,
  thumbnail: 2 * 1024 * 1024,
};
const MAX_RECORD_BYTES = 2 * 1024 * 1024;
const MAX_INDEX_BACKUPS = 20;
const MAX_HISTORY = 30;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
const stamp = (d: Date) => d.toISOString().replace(/[:.]/g, '-');

function cleanFileName(name: unknown): string {
  const base = typeof name === 'string' ? name.split(/[/\\]/).pop() ?? '' : '';
  // eslint-disable-next-line no-control-regex
  const s = base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 128);
  return s || 'sans-nom';
}

function snapshotOf(a: ModelAnalysis): ModelSnapshot {
  const meta = a.document.sections.find((s) => s.name === a.model.rootName)?.meta;
  const issues = a.diagnostics.filter((d) => d.severity !== 'info');
  return {
    title: (meta?.title ?? '').slice(0, 512),
    occurrenceCount: a.model.occurrences.length,
    uniqueParts: a.uniqueParts.length,
    colours: a.colours.length,
    planKind: a.plan.kind,
    stepCount: a.plan.steps.length,
    rootCandidates: a.rootCandidates.slice(0, 2_000),
    errors: a.diagnostics.filter((d) => d.severity === 'error').length,
    warnings: a.diagnostics.filter((d) => d.severity === 'warning').length,
    diagnostics: [...issues, ...a.diagnostics.filter((d) => d.severity === 'info')].slice(0, 50).map((d) => ({
      severity: d.severity, code: d.code, message: d.message.slice(0, 1000), ...(d.line !== undefined ? { line: d.line } : {}),
    })),
  };
}

export interface NewBuildInput {
  readonly label: string;
  readonly modelFileId: string;
  readonly rootName?: string;
  readonly bookletFileIds?: readonly string[];
  /** A mapping file of the library, validated against this build before it is attached. */
  readonly mappingFileId?: string;
}

export interface FileBytes {
  readonly file: LibraryFile;
  readonly bytes: Buffer;
}

export class LibraryStore {
  readonly libDir: string;
  private readonly mutex = new Mutex();
  private readonly analyses = new Map<string, ModelAnalysis>();

  constructor(readonly dataDir: string) {
    this.libDir = path.join(dataDir, LIBRARY_DIRNAME);
  }

  private p(...segments: string[]) {
    return path.join(this.libDir, ...segments);
  }

  /** Every write goes through here: one at a time, and only when the index is readable. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    return this.mutex.run(async () => {
      try {
        return await fn();
      } catch (e) {
        if (e instanceof LibraryError || e instanceof UnsafePathError) throw e;
        const err = e as NodeJS.ErrnoException;
        throw new LibraryError('STORAGE', `Écriture sur le disque impossible (${err.code ?? err.message}). Rien n’a été modifié.`);
      }
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Index
  // ---------------------------------------------------------------------------------------------

  async readIndex(): Promise<LibraryIndex> {
    let raw: unknown;
    try {
      raw = await readJson(this.p('library.json'), MAX_INDEX_BYTES);
    } catch (e) {
      throw new LibraryError('CORRUPT_INDEX', `library.json illisible (${(e as Error).message}). Aucune écriture ne sera faite ; des copies se trouvent dans ${this.p('backups')}.`);
    }
    if (raw === null) {
      const backups = await fs.readdir(this.p('backups')).catch(() => [] as string[]);
      if (backups.some((f) => f.endsWith('.json'))) {
        throw new LibraryError('CORRUPT_INDEX', `library.json est absent alors que des sauvegardes existent dans ${this.p('backups')} : restaure la plus récente (voir la documentation) plutôt que de repartir d’une bibliothèque vide.`);
      }
      return emptyIndex();
    }
    const parsed = parseIndex(raw);
    if (!parsed.ok) throw new LibraryError('CORRUPT_INDEX', `${parsed.error} Aucune écriture ne sera faite ; des copies se trouvent dans ${this.p('backups')}.`);
    return parsed.index;
  }

  /**
   * Applies `change` to the current index and writes it atomically. `baseRevision`, when given,
   * must be the current revision (a change made from a stale page is refused, never merged).
   * Registering a file (content-addressed, additive) does not change the revision: importing a
   * notice then associating it from the same page is not a conflict.
   */
  private async commit(change: (index: LibraryIndex, now: Date) => LibraryIndex | Promise<LibraryIndex>, baseRevision?: number, { filesOnly = false } = {}): Promise<LibraryIndex> {
    const current = await this.readIndex();
    if (baseRevision !== undefined && baseRevision !== current.revision) {
      throw new LibraryError('CONFLICT', 'La collection a été modifiée entre-temps (autre onglet ou navigateur). Recharge la page puis recommence.', { revision: current.revision });
    }
    const now = new Date();
    const changed = await change(current, now);
    const next: LibraryIndex = { ...changed, revision: current.revision + (filesOnly ? 0 : 1), updatedAtIso: now.toISOString() };
    const check = parseIndex(JSON.parse(JSON.stringify(next)));
    if (!check.ok) throw new LibraryError('INVALID', `Modification refusée : ${check.error}`);
    const text = `${JSON.stringify(next, null, 2)}\n`;
    await writeFileAtomic(this.p('backups', `library-${stamp(now)}-r${String(next.revision).padStart(6, '0')}.json`), text);
    await writeFileAtomic(this.p('library.json'), text);
    await this.pruneDir(this.p('backups'), MAX_INDEX_BACKUPS);
    return next;
  }

  /** Keeps the `keep` most recent `.json` files of a folder written by this store. */
  private async pruneDir(dir: string, keep: number) {
    const names = (await fs.readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith('.json')).sort();
    for (const n of names.slice(0, Math.max(0, names.length - keep))) await fs.rm(path.join(dir, n), { force: true });
  }

  // ---------------------------------------------------------------------------------------------
  // Files
  // ---------------------------------------------------------------------------------------------

  private async absolutePath(file: LibraryFile): Promise<string> {
    if (file.location.type === 'blob') return resolveInside(this.libDir, file.location.path);
    const real = await resolveInside(this.dataDir, file.location.path);
    const realLib = await fs.realpath(this.libDir).catch(() => null);
    if (realLib && real.startsWith(realLib + path.sep)) throw new UnsafePathError('Un fichier externe ne peut pas désigner le dossier de la bibliothèque.');
    return real;
  }

  /** Exists and has the recorded size (no hashing: used by listings). */
  async quickState(file: LibraryFile): Promise<FileState> {
    try {
      const stat = await fs.stat(await this.absolutePath(file));
      if (!stat.isFile()) return 'MISSING';
      return stat.size === file.size ? 'OK' : 'SIZE_CHANGED';
    } catch (e) {
      if (e instanceof UnsafePathError) return 'UNREADABLE';
      return (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'MISSING' : 'UNREADABLE';
    }
  }

  /** Reads a library file and checks its SHA-256 against the index. Never returns other bytes. */
  async readVerified(sha: string, kind?: FileKind): Promise<FileBytes> {
    if (!SHA256_RE.test(sha)) throw new LibraryError('INVALID', 'Empreinte invalide.');
    const index = await this.readIndex();
    const file = index.files[sha];
    if (!file || (kind && file.kind !== kind)) throw new LibraryError('NOT_FOUND', 'Fichier inconnu de la bibliothèque.');
    return { file, bytes: await this.verifiedBytes(file) };
  }

  private async verifiedBytes(file: LibraryFile): Promise<Buffer> {
    const problem = (state: FileState, msg: string) => new LibraryError('FILE_PROBLEM', msg, { state, sha256: file.sha256, originalName: file.originalName, location: file.location });
    let abs: string;
    try {
      abs = await this.absolutePath(file);
    } catch (e) {
      if (e instanceof UnsafePathError) throw problem('UNREADABLE', `${file.originalName} : emplacement refusé (${e.message}).`);
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw problem('MISSING', `${file.originalName} est introuvable (${file.location.path}).`);
      throw problem('UNREADABLE', `${file.originalName} est illisible.`);
    }
    const stat = await fs.stat(abs);
    if (stat.size !== file.size) throw problem('SIZE_CHANGED', `${file.originalName} a changé depuis son ajout (${file.size} → ${stat.size} octets) : ce n’est plus le même fichier.`);
    const bytes = await fs.readFile(abs);
    if (sha256(bytes) !== file.sha256) throw problem('HASH_MISMATCH', `${file.originalName} a été modifié depuis son ajout (empreinte SHA-256 différente) : il n’est pas utilisé.`);
    return bytes;
  }

  private validateContent(kind: FileKind, bytes: Buffer, name: string): void {
    const ext = path.extname(name).toLowerCase();
    if (kind === 'model') {
      if (ext !== '.mpd' && ext !== '.ldr') throw new LibraryError('UNSUPPORTED', 'Formats de modèle acceptés : .mpd et .ldr.');
      if (bytes.includes(0)) throw new LibraryError('UNSUPPORTED', 'Ce fichier n’est pas un fichier texte LDraw.');
      const a = analyzeModel(new TextDecoder('utf-8').decode(bytes), name);
      if (a.model.occurrences.length === 0) {
        throw new LibraryError('INVALID', `Modèle inutilisable : aucune pièce lue. ${a.diagnostics.filter((d) => d.severity === 'error').slice(0, 3).map((d) => d.message).join(' ')}`.trim());
      }
    } else if (kind === 'pdf') {
      if (ext !== '.pdf' || bytes.subarray(0, 1024).indexOf('%PDF-') < 0) throw new LibraryError('UNSUPPORTED', 'Ce fichier n’est pas un PDF.');
    } else {
      const parsed = parseMappingText(bytes.toString('utf8'));
      if (!parsed.ok) throw new LibraryError('INVALID', `Fichier de correspondances refusé : ${parsed.errors.join(' ')}`);
    }
  }

  /**
   * Stores an imported file (streamed, bounded, hashed on the fly). A file already in the library
   * (same SHA-256, imported or found in the data folder) is not stored twice.
   */
  async ingest(kind: FileKind, originalName: string, chunks: AsyncIterable<Uint8Array>): Promise<{ file: LibraryFile; duplicate: boolean }> {
    const name = cleanFileName(originalName);
    await fs.mkdir(this.p('tmp'), { recursive: true });
    const tmp = this.p('tmp', `${randomBytes(8).toString('hex')}.part`);
    const hash = createHash('sha256');
    const parts: Buffer[] = [];
    let size = 0;
    try {
      for await (const chunk of chunks) {
        size += chunk.byteLength;
        if (size > MAX_BYTES[kind]) throw new LibraryError('TOO_LARGE', `Fichier trop volumineux (limite ${Math.round(MAX_BYTES[kind] / 1024 / 1024)} Mo).`);
        hash.update(chunk);
        parts.push(Buffer.from(chunk));
      }
      if (size === 0) throw new LibraryError('INVALID', 'Fichier vide.');
      const bytes = Buffer.concat(parts, size);
      this.validateContent(kind, bytes, name);
      const sha = hash.digest('hex');
      return await this.exclusive(async () => {
        const index = await this.readIndex();
        const known = index.files[sha];
        if (known) {
          if (known.kind !== kind) throw new LibraryError('INVALID', `Ce fichier est déjà dans la bibliothèque comme ${known.kind}.`);
          // a known file whose copy is missing or was modified is repaired from this upload
          // (for a file left in place, a verified copy goes into the library; the original is not touched)
          if (await this.verifiedBytes(known).then(() => true, () => false)) return { file: known, duplicate: true };
        }
        await fs.writeFile(tmp, bytes, { flag: 'wx', mode: 0o600 });
        const ext = kind === 'model' ? path.extname(name).toLowerCase() : kind === 'pdf' ? '.pdf' : '.json';
        const rel = `blobs/${sha.slice(0, 2)}/${sha}${ext}`;
        const target = this.p(...rel.split('/'));
        if (!(await linkNewFile(tmp, target))) {
          // the blob exists (orphan of an interrupted import, or restored): keep it only if identical
          if (sha256(await fs.readFile(target)) !== sha) throw new LibraryError('STORAGE', `Un fichier différent occupe déjà ${rel} : rien n’a été écrasé.`);
        }
        const file: LibraryFile = known
          ? { ...known, location: { type: 'blob', path: rel } }
          : { sha256: sha, kind, size, originalName: name, location: { type: 'blob', path: rel }, addedAtIso: new Date().toISOString() };
        if (!known || known.location.path !== rel) await this.commit((idx) => ({ ...idx, files: { ...idx.files, [sha]: file } }), undefined, { filesOnly: true });
        return { file, duplicate: Boolean(known) };
      });
    } finally {
      await fs.rm(tmp, { force: true });
    }
  }

  /** Registers a file left in place in the data folder (discovery). It is hashed now and at every use. */
  async registerExternal(kind: FileKind, rel: string, expectedSha: string): Promise<LibraryFile> {
    if (!safeSegments(rel) || rel.split('/')[0] === LIBRARY_DIRNAME) throw new LibraryError('FORBIDDEN', 'Chemin refusé.');
    return this.exclusive(async () => {
      const index = await this.readIndex();
      const abs = await resolveInside(this.dataDir, rel).catch((e: unknown) => {
        throw e instanceof UnsafePathError ? new LibraryError('FORBIDDEN', e.message) : new LibraryError('NOT_FOUND', `${rel} est introuvable.`);
      });
      const stat = await fs.stat(abs);
      if (!stat.isFile() || stat.size > MAX_BYTES[kind]) throw new LibraryError('INVALID', `${rel} : fichier refusé.`);
      const bytes = await fs.readFile(abs);
      const sha = sha256(bytes);
      if (sha !== expectedSha) throw new LibraryError('CONFLICT', `${rel} a changé depuis la détection : relance la détection.`);
      // already known (imported or found elsewhere): the existing record is kept, never duplicated
      if (index.files[sha]) return index.files[sha]!;
      this.validateContent(kind, bytes, path.basename(abs));
      const file: LibraryFile = { sha256: sha, kind, size: bytes.length, originalName: cleanFileName(path.basename(abs)), location: { type: 'external', path: rel }, addedAtIso: new Date().toISOString() };
      await this.commit((idx) => ({ ...idx, files: { ...idx.files, [sha]: file } }), undefined, { filesOnly: true });
      return file;
    });
  }

  /** Parsed model of a build (cached by content hash and main model). */
  async analysis(build: Pick<LibraryBuild, 'modelFileId' | 'rootName'>): Promise<{ analysis: ModelAnalysis; file: LibraryFile }> {
    const { file, bytes } = await this.readVerified(build.modelFileId, 'model');
    const key = `${file.sha256}|${build.rootName}`;
    let a = this.analyses.get(key);
    if (!a) {
      a = analyzeModel(new TextDecoder('utf-8').decode(bytes), file.originalName, { rootName: build.rootName });
      if (this.analyses.size > 32) this.analyses.delete(this.analyses.keys().next().value!);
      this.analyses.set(key, a);
    }
    return { analysis: a, file };
  }

  // ---------------------------------------------------------------------------------------------
  // Sets and builds
  // ---------------------------------------------------------------------------------------------

  private async makeBuild(index: LibraryIndex, setId: string, input: NewBuildInput, now: Date): Promise<{ build: LibraryBuild; mapping: InstructionMapping | null }> {
    const label = cleanName(input.label);
    if (!label) throw new LibraryError('INVALID', 'Nom de construction invalide.');
    const model = index.files[input.modelFileId];
    if (!model || model.kind !== 'model') throw new LibraryError('INVALID', 'Modèle 3D inconnu : importe-le d’abord.');
    const booklets = [...new Set(input.bookletFileIds ?? [])];
    if (booklets.length > 20 || !booklets.every((id) => index.files[id]?.kind === 'pdf')) throw new LibraryError('INVALID', 'Notice inconnue ou trop de notices (20 au plus).');
    const bytes = await this.verifiedBytes(model);
    const text = new TextDecoder('utf-8').decode(bytes);
    const probe = analyzeModel(text, model.originalName);
    const rootName = input.rootName ?? probe.model.rootName;
    if (!probe.rootCandidates.includes(rootName) && rootName !== probe.model.rootName) throw new LibraryError('INVALID', `Modèle principal « ${rootName} » absent du fichier.`);
    const a = rootName === probe.model.rootName ? probe : analyzeModel(text, model.originalName, { rootName });
    if (a.model.occurrences.length === 0) throw new LibraryError('INVALID', 'Ce modèle principal ne contient aucune pièce.');
    const twin = index.builds.find((b) => b.modelFileId === model.sha256 && b.rootName === rootName);
    if (twin) {
      const set = index.sets.find((s) => s.id === twin.setId);
      throw new LibraryError('DUPLICATE', `Ce modèle est déjà dans ta collection : ${set?.setNumber ?? ''} ${set?.name ?? ''} — « ${twin.label} ».`, { setId: twin.setId, buildId: twin.id });
    }
    let mapping: InstructionMapping | null = null;
    if (input.mappingFileId) {
      const mf = index.files[input.mappingFileId];
      if (!mf || mf.kind !== 'mapping') throw new LibraryError('INVALID', 'Fichier de correspondances inconnu.');
      mapping = this.checkMapping((await this.verifiedBytes(mf)).toString('utf8'), { sha256: model.sha256, fileName: model.originalName, rootName, occurrences: a.model.occurrences });
    }
    return {
      build: { id: newId('b'), setId, label, modelFileId: model.sha256, rootName, bookletFileIds: booklets, snapshot: snapshotOf(a), createdAtIso: now.toISOString(), updatedAtIso: now.toISOString() },
      mapping,
    };
  }

  /** Structure + model fingerprint only: a draft (incomplete) mapping is accepted, another model's never. */
  private checkMapping(text: string, target: Parameters<typeof validateMapping>[1]): InstructionMapping {
    const parsed = parseMappingText(text);
    if (!parsed.ok) throw new LibraryError('INVALID', `Correspondances refusées : ${parsed.errors.join(' ')}`);
    const mismatch = validateMapping(parsed.mapping, target).issues.find((i) => i.code === 'MODEL_MISMATCH');
    if (mismatch) throw new LibraryError('INVALID', `Correspondances incompatibles avec ce modèle : ${mismatch.message}`);
    return parsed.mapping;
  }

  async createSet(input: { setNumber: string; name: string; builds: readonly NewBuildInput[]; allowSameNumber?: boolean }, mappingSource = 'import'): Promise<{ set: LibrarySet; builds: LibraryBuild[] }> {
    const setNumber = typeof input.setNumber === 'string' ? input.setNumber.trim() : '';
    if (!SET_NUMBER_RE.test(setNumber)) throw new LibraryError('INVALID', 'Numéro de set invalide (chiffres, lettres et tirets, ex. 31040-1).');
    const name = cleanName(input.name);
    if (!name) throw new LibraryError('INVALID', `Nom de set invalide (1 à 120 caractères).`);
    if (!Array.isArray(input.builds) || input.builds.length === 0 || input.builds.length > 20) throw new LibraryError('INVALID', 'Ajoute au moins un modèle 3D (20 au plus).');
    return this.exclusive(async () => {
      let created: { set: LibrarySet; builds: LibraryBuild[] } | null = null;
      const mappings: [string, InstructionMapping][] = [];
      await this.commit(async (index, now) => {
        const same = index.sets.find((s) => s.setNumber.toLowerCase() === setNumber.toLowerCase());
        if (same && !input.allowSameNumber) {
          throw new LibraryError('DUPLICATE', `Le set ${same.setNumber} (« ${same.name} ») est déjà dans ta collection : ajoute plutôt une construction à ce set.`, { setId: same.id });
        }
        const set: LibrarySet = { id: newId('s'), setNumber, name, createdAtIso: now.toISOString(), updatedAtIso: now.toISOString() };
        const builds: LibraryBuild[] = [];
        for (const b of input.builds) {
          const made = await this.makeBuild({ ...index, builds: [...index.builds, ...builds] }, set.id, b, now);
          builds.push(made.build);
          if (made.mapping) mappings.push([made.build.id, made.mapping]);
        }
        created = { set, builds };
        return { ...index, sets: [...index.sets, set], builds: [...index.builds, ...builds] };
      });
      for (const [buildId, m] of mappings) await this.writeRecord(buildId, 'mapping', serializeMapping(m), null, mappingSource);
      return created!;
    });
  }

  async addBuild(setId: string, input: NewBuildInput, baseRevision?: number): Promise<LibraryBuild> {
    return this.exclusive(async () => {
      let build: LibraryBuild | null = null;
      let mapping: InstructionMapping | null = null;
      await this.commit(async (index, now) => {
        if (!index.sets.some((s) => s.id === setId)) throw new LibraryError('NOT_FOUND', 'Set inconnu.');
        const made = await this.makeBuild(index, setId, input, now);
        build = made.build;
        mapping = made.mapping;
        return { ...index, builds: [...index.builds, made.build], sets: index.sets.map((s) => (s.id === setId ? { ...s, updatedAtIso: now.toISOString() } : s)) };
      }, baseRevision);
      if (mapping) await this.writeRecord(build!.id, 'mapping', serializeMapping(mapping), null, 'import');
      return build!;
    });
  }

  async updateSet(setId: string, patch: { name?: unknown; setNumber?: unknown }, baseRevision: number): Promise<LibrarySet> {
    return this.exclusive(async () => {
      let out: LibrarySet | null = null;
      await this.commit((index, now) => {
        const set = index.sets.find((s) => s.id === setId);
        if (!set) throw new LibraryError('NOT_FOUND', 'Set inconnu.');
        const name = patch.name === undefined ? set.name : cleanName(patch.name);
        const setNumber = patch.setNumber === undefined ? set.setNumber : typeof patch.setNumber === 'string' ? patch.setNumber.trim() : '';
        if (!name) throw new LibraryError('INVALID', 'Nom de set invalide (1 à 120 caractères).');
        if (!SET_NUMBER_RE.test(setNumber)) throw new LibraryError('INVALID', 'Numéro de set invalide.');
        out = { ...set, name, setNumber, updatedAtIso: now.toISOString() };
        return { ...index, sets: index.sets.map((s) => (s.id === setId ? out! : s)) };
      }, baseRevision);
      return out!;
    });
  }

  async updateBuild(buildId: string, patch: { label?: unknown; bookletFileIds?: unknown }, baseRevision: number): Promise<LibraryBuild> {
    return this.exclusive(async () => {
      let out: LibraryBuild | null = null;
      await this.commit((index, now) => {
        const build = index.builds.find((b) => b.id === buildId);
        if (!build) throw new LibraryError('NOT_FOUND', 'Construction inconnue.');
        const label = patch.label === undefined ? build.label : cleanName(patch.label);
        if (!label) throw new LibraryError('INVALID', 'Nom de construction invalide.');
        let booklets = build.bookletFileIds;
        if (patch.bookletFileIds !== undefined) {
          const ids = patch.bookletFileIds;
          if (!Array.isArray(ids) || ids.length > 20 || !ids.every((id) => typeof id === 'string' && index.files[id]?.kind === 'pdf') || new Set(ids).size !== ids.length) {
            throw new LibraryError('INVALID', 'Liste de notices invalide.');
          }
          booklets = ids as string[];
        }
        out = { ...build, label, bookletFileIds: booklets, updatedAtIso: now.toISOString() };
        return { ...index, builds: index.builds.map((b) => (b.id === buildId ? out! : b)) };
      }, baseRevision);
      return out!;
    });
  }

  /** Moves a build's records to `trash/` and removes it from the index (the set too when asked). */
  async remove(target: { buildId: string } | { setId: string }, confirm: unknown, baseRevision: number): Promise<{ trashedTo: string }> {
    if (confirm !== true) throw new LibraryError('CONFIRMATION_REQUIRED', 'Suppression non confirmée.');
    return this.exclusive(async () => {
      const index = await this.readIndex();
      if (baseRevision !== index.revision) throw new LibraryError('CONFLICT', 'La collection a été modifiée entre-temps : recharge la page.', { revision: index.revision });
      const builds = 'buildId' in target ? index.builds.filter((b) => b.id === target.buildId) : index.builds.filter((b) => b.setId === target.setId);
      const set = index.sets.find((s) => ('setId' in target ? s.id === target.setId : s.id === builds[0]?.setId));
      if (!set || ('buildId' in target && builds.length === 0)) throw new LibraryError('NOT_FOUND', 'Élément inconnu.');
      const dir = this.p('trash', `${stamp(new Date())}-${'buildId' in target ? target.buildId : target.setId}`);
      await fs.mkdir(dir, { recursive: true });
      await writeFileAtomic(path.join(dir, 'removed.json'), `${JSON.stringify({ set, builds, files: builds.flatMap((b) => [b.modelFileId, ...b.bookletFileIds]).map((id) => index.files[id]) }, null, 2)}\n`);
      for (const b of builds) await fs.rename(this.p('builds', b.id), path.join(dir, b.id)).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; });
      const ids = new Set(builds.map((b) => b.id));
      await this.commit((idx) => ({
        ...idx,
        builds: idx.builds.filter((b) => !ids.has(b.id)),
        sets: 'setId' in target ? idx.sets.filter((s) => s.id !== target.setId) : idx.sets,
      }));
      return { trashedTo: dir };
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Per-build records: progress, mapping, thumbnail
  // ---------------------------------------------------------------------------------------------

  private recordPath(buildId: string, kind: 'progress' | 'mapping') {
    if (!ID_RE.test(buildId)) throw new LibraryError('INVALID', 'Identifiant de construction invalide.');
    return this.p('builds', buildId, `${kind}.json`);
  }

  async readRecord(buildId: string, kind: 'progress' | 'mapping'): Promise<StoredRecord | null> {
    let raw: unknown;
    try {
      raw = await readJson(this.recordPath(buildId, kind), MAX_RECORD_BYTES);
    } catch (e) {
      if (e instanceof LibraryError) throw e;
      throw new LibraryError('FILE_PROBLEM', `${kind === 'progress' ? 'Progression' : 'Correspondances'} enregistrée(s) illisible(s) (${(e as Error).message}) : le fichier est conservé tel quel.`, { state: 'UNREADABLE' });
    }
    if (raw === null) return null;
    const rec = parseRecord(raw);
    if (!rec) throw new LibraryError('FILE_PROBLEM', `${kind === 'progress' ? 'Progression' : 'Correspondances'} enregistrée(s) illisible(s) : le fichier est conservé tel quel.`, { state: 'UNREADABLE' });
    return rec;
  }

  /** Replaces a record if `baseRevision` is the current one (null = must not exist yet). The old one goes to history/. */
  private async writeRecord(buildId: string, kind: 'progress' | 'mapping', payloadText: string, baseRevision: number | null, source: string): Promise<StoredRecord> {
    const current = await this.readRecord(buildId, kind).catch((e: unknown) => {
      if (e instanceof LibraryError && e.code === 'FILE_PROBLEM') return 'unreadable' as const;
      throw e;
    });
    const currentRevision = current === null ? null : current === 'unreadable' ? -1 : current.revision;
    if (currentRevision !== baseRevision) {
      throw new LibraryError('CONFLICT', kind === 'progress'
        ? 'Cette partie a été enregistrée entre-temps depuis un autre onglet ou navigateur : recharge pour reprendre la version la plus récente (rien n’a été écrasé).'
        : 'Les correspondances ont été modifiées entre-temps depuis un autre onglet ou navigateur : recharge la page (rien n’a été écrasé).', { revision: currentRevision });
    }
    const file = this.recordPath(buildId, kind);
    // keep the replaced version (an unreadable one is kept byte for byte); progress is saved at
    // every brick, so its history keeps at most one version per minute
    const recent = kind === 'progress' && source === 'atelier' && current !== 'unreadable' && current !== null && Date.now() - Date.parse(current.savedAtIso) < 60_000
      && (await this.lastHistoryAge(buildId, kind)) < 60_000;
    if (current !== null && !recent) {
      const history = this.p('builds', buildId, 'history');
      await fs.mkdir(history, { recursive: true });
      await fs.copyFile(file, path.join(history, `${kind}-${stamp(new Date())}-r${currentRevision}.json`), fs.constants.COPYFILE_EXCL).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'EEXIST') throw e; });
      await this.pruneHistory(history, kind);
    }
    const rec: StoredRecord = { format: RECORD_FORMAT, revision: (currentRevision ?? 0) + 1, savedAtIso: new Date().toISOString(), source, payload: JSON.parse(payloadText) as unknown };
    await writeFileAtomic(file, `${JSON.stringify(rec)}\n`);
    return rec;
  }

  private async lastHistoryAge(buildId: string, kind: string): Promise<number> {
    const dir = this.p('builds', buildId, 'history');
    const last = (await fs.readdir(dir).catch(() => [] as string[])).filter((n) => n.startsWith(`${kind}-`) && !n.includes('cleared')).sort().at(-1);
    if (!last) return Infinity;
    return Date.now() - (await fs.stat(path.join(dir, last))).mtimeMs;
  }

  private async pruneHistory(dir: string, kind: string) {
    const names = (await fs.readdir(dir)).filter((n) => n.startsWith(`${kind}-`)).sort();
    for (const n of names.slice(0, Math.max(0, names.length - MAX_HISTORY))) await fs.rm(path.join(dir, n), { force: true });
  }

  private async buildOf(buildId: string): Promise<{ index: LibraryIndex; build: LibraryBuild }> {
    const index = await this.readIndex();
    const build = index.builds.find((b) => b.id === buildId);
    if (!build) throw new LibraryError('NOT_FOUND', 'Construction inconnue.');
    return { index, build };
  }

  /** `browser`: a save of this browser chosen explicitly by the user; the replaced one is always kept in history. */
  async putProgress(buildId: string, progress: unknown, baseRevision: number | null, source: 'atelier' | 'browser' = 'atelier'): Promise<StoredRecord> {
    return this.exclusive(async () => {
      const { build } = await this.buildOf(buildId);
      const { analysis } = await this.analysis(build);
      const restored = restoreProgress(progress, build.modelFileId, analysis.model.occurrences);
      if (!restored.ok) throw new LibraryError('INVALID', `Progression refusée (${restored.reason}) : elle ne correspond pas à ce modèle.`);
      return this.writeRecord(buildId, 'progress', JSON.stringify(progress), baseRevision, source);
    });
  }

  /** "Recommencer" / "Abandonner": the progress moves to history, it is not deleted. */
  async clearProgress(buildId: string, confirm: unknown, baseRevision: number): Promise<void> {
    if (confirm !== true) throw new LibraryError('CONFIRMATION_REQUIRED', 'Remise à zéro non confirmée.');
    await this.exclusive(async () => {
      await this.buildOf(buildId);
      const current = await this.readRecord(buildId, 'progress');
      if (!current) return;
      if (current.revision !== baseRevision) throw new LibraryError('CONFLICT', 'Cette partie a été enregistrée entre-temps : recharge la page.', { revision: current.revision });
      const history = this.p('builds', buildId, 'history');
      await fs.mkdir(history, { recursive: true });
      await fs.rename(this.recordPath(buildId, 'progress'), path.join(history, `progress-${stamp(new Date())}-r${current.revision}-cleared.json`));
    });
  }

  async putMapping(buildId: string, text: string, baseRevision: number | null, source: 'editor' | 'import' | 'clear' | 'browser'): Promise<StoredRecord> {
    if (typeof text !== 'string' || text.length > MAX_MAPPING_BYTES) throw new LibraryError('TOO_LARGE', 'Correspondances trop volumineuses.');
    return this.exclusive(async () => {
      const { build, index } = await this.buildOf(buildId);
      const { analysis } = await this.analysis(build);
      const model = index.files[build.modelFileId]!;
      const mapping = this.checkMapping(text, { sha256: model.sha256, fileName: model.originalName, rootName: build.rootName, occurrences: analysis.model.occurrences });
      return this.writeRecord(buildId, 'mapping', serializeMapping(mapping), baseRevision, source);
    });
  }

  async readMapping(buildId: string): Promise<{ revision: number; mapping: InstructionMapping } | null> {
    const rec = await this.readRecord(buildId, 'mapping');
    if (!rec) return null;
    const parsed = parseMapping(rec.payload);
    if (!parsed.ok) throw new LibraryError('FILE_PROBLEM', `Correspondances enregistrées illisibles : ${parsed.errors.join(' ')}`, { state: 'UNREADABLE' });
    return { revision: rec.revision, mapping: parsed.mapping };
  }

  async putThumbnail(buildId: string, bytes: Buffer): Promise<void> {
    if (bytes.length === 0 || bytes.length > MAX_BYTES.thumbnail) throw new LibraryError('TOO_LARGE', 'Miniature trop volumineuse (2 Mo au plus).');
    if (!PNG_MAGIC.every((b, i) => bytes[i] === b)) throw new LibraryError('UNSUPPORTED', 'Miniature : PNG attendu.');
    await this.exclusive(async () => {
      const { build } = await this.buildOf(buildId);
      // the thumbnail is tied to the model it was rendered from
      await writeFileAtomic(this.p('builds', buildId, `thumbnail-${build.modelFileId.slice(0, 16)}.png`), bytes);
    });
  }

  async readThumbnail(buildId: string): Promise<Buffer | null> {
    const { build } = await this.buildOf(buildId);
    return fs.readFile(this.p('builds', buildId, `thumbnail-${build.modelFileId.slice(0, 16)}.png`)).catch(() => null);
  }

  // ---------------------------------------------------------------------------------------------
  // Views for the UI
  // ---------------------------------------------------------------------------------------------

  private async fileView(index: LibraryIndex, sha: string): Promise<FileView> {
    const f = index.files[sha]!;
    return { sha256: f.sha256, kind: f.kind, originalName: f.originalName, size: f.size, location: f.location.type, state: await this.quickState(f) };
  }

  async buildView(index: LibraryIndex, build: LibraryBuild): Promise<BuildView> {
    const problems: string[] = [];
    let model = await this.fileView(index, build.modelFileId);
    const booklets = await Promise.all(build.bookletFileIds.map((id) => this.fileView(index, id)));
    let occurrences: ModelAnalysis['model']['occurrences'] | null = null;
    let plan: ModelAnalysis['plan'] | null = null;
    if (model.state === 'OK') {
      try {
        const { analysis } = await this.analysis(build);
        occurrences = analysis.model.occurrences;
        plan = analysis.plan;
      } catch (e) {
        problems.push(e instanceof LibraryError ? e.message : 'Modèle illisible.');
        // the model is always hashed (it is parsed here): a same-size modification shows too
        model = { ...model, state: e instanceof LibraryError && typeof e.details.state === 'string' ? (e.details.state as FileState) : 'UNREADABLE' };
      }
    } else problems.push(`Modèle 3D ${model.state === 'MISSING' ? 'introuvable' : 'modifié ou illisible'} : ${model.originalName}.`);
    for (const b of booklets) if (b.state !== 'OK') problems.push(`Notice ${b.state === 'MISSING' ? 'introuvable' : 'modifiée ou illisible'} : ${b.originalName}.`);

    let mapping: MappingView | null = null;
    try {
      const m = await this.readMapping(build.id);
      if (m) {
        const target = { sha256: build.modelFileId, fileName: model.originalName, rootName: build.rootName, occurrences: occurrences ?? [] };
        const report = occurrences ? validateMapping(m.mapping, target) : null;
        const okBooklets = new Set(booklets.filter((b) => b.state === 'OK').map((b) => b.sha256));
        mapping = {
          revision: m.revision,
          steps: m.mapping.steps.length,
          verified: m.mapping.steps.filter((s) => s.provenance === 'verified').length,
          assigned: report?.assigned ?? 0,
          total: report?.total ?? build.snapshot.occurrenceCount,
          valid: report?.ok ?? false,
          firstError: report ? report.issues.find((i) => i.severity === 'error')?.message ?? null : 'Modèle indisponible : correspondances non vérifiées.',
          booklets: m.mapping.booklets.map((b) => ({ label: b.label, sha256: b.sha256, associated: b.sha256 !== null && okBooklets.has(b.sha256) })),
        };
      }
    } catch (e) {
      problems.push(e instanceof LibraryError ? e.message : 'Correspondances illisibles.');
    }

    let progress: ProgressView | null = null;
    try {
      const rec = await this.readRecord(build.id, 'progress');
      if (rec) {
        const p = rec.payload as Partial<LocalBuildProgress>;
        const restored = occurrences ? restoreProgress(rec.payload, build.modelFileId, occurrences) : null;
        if (restored && !restored.ok) problems.push(`Progression enregistrée incompatible avec le modèle (${restored.reason}) : elle est conservée mais ne peut pas être reprise.`);
        progress = {
          revision: rec.revision,
          placed: restored?.ok ? restored.session.placed.length : Array.isArray(p.placedOccurrenceIds) ? p.placedOccurrenceIds.length : 0,
          total: build.snapshot.occurrenceCount,
          mode: restored?.ok ? restored.session.mode : 'freeManual',
          lastPdfPage: restored?.ok ? restored.lastPdfPage ?? null : null,
          updatedAtIso: typeof p.updatedAtIso === 'string' ? p.updatedAtIso : rec.savedAtIso,
        };
      }
    } catch (e) {
      problems.push(e instanceof LibraryError ? e.message : 'Progression illisible.');
    }

    const syncBlocker = !mapping ? 'aucune correspondance notice ↔ 3D.'
      : !mapping.valid ? mapping.firstError ?? 'correspondances invalides.'
        : mapping.booklets.some((b) => !b.associated) ? `notice attendue par les correspondances non associée ou indisponible (${mapping.booklets.filter((b) => !b.associated).map((b) => b.label).join(', ')}).`
          : null;
    const modes = model.state !== 'OK' || !plan ? [] : [...(syncBlocker ? [] : ['synced' as const]), ...availableModes(plan)];
    const hasThumbnail = await fs.access(this.p('builds', build.id, `thumbnail-${build.modelFileId.slice(0, 16)}.png`)).then(() => true, () => false);
    return {
      id: build.id, setId: build.setId, label: build.label, rootName: build.rootName, snapshot: build.snapshot, model, booklets, mapping, progress,
      status: buildStatus(progress?.placed ?? 0, build.snapshot.occurrenceCount), modes, syncBlocker, hasThumbnail, problems,
      updatedAtIso: progress && progress.updatedAtIso > build.updatedAtIso ? progress.updatedAtIso : build.updatedAtIso,
    };
  }

  async buildDetail(buildId: string): Promise<{ revision: number; set: LibrarySet; build: BuildView }> {
    const { index, build } = await this.buildOf(buildId);
    return { revision: index.revision, set: index.sets.find((s) => s.id === build.setId)!, build: await this.buildView(index, build) };
  }

  /** Full SHA-256 check of every file of a build (opening a build, "Vérifier les fichiers"). */
  async checkBuild(buildId: string): Promise<{ sha256: string; kind: FileKind; originalName: string; state: FileState; message: string | null }[]> {
    const { index, build } = await this.buildOf(buildId);
    return Promise.all([build.modelFileId, ...build.bookletFileIds].map(async (sha) => {
      const f = index.files[sha]!;
      try {
        await this.verifiedBytes(f);
        return { sha256: sha, kind: f.kind, originalName: f.originalName, state: 'OK' as FileState, message: null };
      } catch (e) {
        const state = e instanceof LibraryError && typeof e.details.state === 'string' ? (e.details.state as FileState) : 'UNREADABLE';
        return { sha256: sha, kind: f.kind, originalName: f.originalName, state, message: e instanceof Error ? e.message : String(e) };
      }
    }));
  }

  async view(): Promise<LibraryView> {
    const index = await this.readIndex();
    const builds = await Promise.all(index.builds.map((b) => this.buildView(index, b)));
    return {
      revision: index.revision,
      dataDir: this.dataDir,
      sets: index.sets.map((s) => ({ ...s, builds: builds.filter((b) => b.setId === s.id) })),
    };
  }
}

// One store per data folder for the server process.
const stores = new Map<string, LibraryStore>();
export function libraryStore(dataDir: string): LibraryStore {
  let s = stores.get(dataDir);
  if (!s) {
    s = new LibraryStore(dataDir);
    stores.set(dataDir, s);
  }
  return s;
}

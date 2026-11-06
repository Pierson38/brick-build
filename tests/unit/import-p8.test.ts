import { createHash } from 'node:crypto';
import { promises as fs, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serializeProgress } from '@/domain/build/progress';
import { analyzeModel } from '@/domain/import/analyze';
import { addBooklet, addStep, assignToStep, createMapping, serializeMapping, updateStep, type InstructionMapping } from '@/domain/instructions/mapping';
import type { FileRef, ImportInput } from '@/domain/library/import-types';
import { writeHooks } from '@/server/library/fs-atomic';
import { localLookup, prepareImport } from '@/server/library/prepare';
import { parseIndex } from '@/server/library/schema';
import { LibraryError, LibraryStore } from '@/server/library/store';
import { makeTestPdf } from '../e2e/make-test-pdf';

const repo = (rel: string) => path.join(__dirname, '..', '..', rel);
const MINI = readFileSync(repo('fixtures/mini-4-pieces.mpd'));
const SYNC8 = readFileSync(repo('tests/fixtures/notice-sync-8.mpd'));
const TRIO = readFileSync(repo('tests/fixtures/p8-trio.mpd'));
const PDF_A = makeTestPdf(3);
const PDF_B = makeTestPdf(5);
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
async function* once(b: Buffer) {
  yield b;
}

/** Mapping of notice-sync-8 on booklet PDF_A; `complete: false` leaves 2 bricks unassigned (draft). */
function sync8Mapping({ complete = true, modelSha = sha(SYNC8), verified = true } = {}): InstructionMapping {
  const a = analyzeModel(SYNC8.toString('utf8'), 'notice-sync-8.mpd');
  let m = createMapping({ sha256: modelSha, fileName: 'notice-sync-8.mpd', rootName: a.model.rootName, occurrences: a.model.occurrences });
  m = addBooklet(m, { label: 'Livret test', fileName: 'notice-test.pdf', sha256: sha(PDF_A), pageCount: 3 }).mapping;
  let last: string | null = null;
  for (const [page, ids] of (complete ? [[2, [0, 1, 2, 3]], [3, [4, 5, 6, 7]]] : [[2, [0, 1, 2, 3]], [3, [4, 5]]]) as [number, number[]][]) {
    const r = addStep(m, last, { page });
    m = assignToStep(r.mapping, r.stepId, ids.map((i) => `notice-sync-8.mpd#${i}`)).mapping;
    if (verified) m = updateStep(m, r.stepId, { provenance: 'verified' });
    last = r.stepId;
  }
  return m;
}

let dir: string;
let store: LibraryStore;
const OLD_LDRAW = process.env.LDRAW_LIBRARY_DIR;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(tmpdir(), 'brick-lab-p8-'));
  store = new LibraryStore(dir);
  delete process.env.LDRAW_LIBRARY_DIR;
});
afterEach(async () => {
  writeHooks.beforeRename = null;
  if (OLD_LDRAW === undefined) delete process.env.LDRAW_LIBRARY_DIR; else process.env.LDRAW_LIBRARY_DIR = OLD_LDRAW;
  await fs.chmod(path.join(dir, 'library'), 0o700).catch(() => undefined);
  await fs.rm(dir, { recursive: true, force: true });
});

const stage = async (kind: 'model' | 'pdf' | 'mapping', name: string, bytes: Buffer, s = store) => {
  const f = await s.stage(kind, name, once(bytes), { source: 'upload' });
  return { kind, ref: { origin: 'staged', sha256: f.sha256 } as FileRef };
};
const libraryJson = async () => JSON.parse(await fs.readFile(path.join(dir, 'library', 'library.json'), 'utf8')) as { revision: number; sets: unknown[]; builds: { id: string; label: string; rootName: string }[]; files: Record<string, { provenance?: unknown; location: { type: string } }> };
const exists = (p: string) => fs.access(p).then(() => true, () => false);

async function writeData(rel: string, bytes: Buffer) {
  const abs = path.join(dir, ...rel.split('/'));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, bytes);
}

describe('P8 search by number (local)', () => {
  it('finds models and booklets of the data folder for this number only (variants are different boxes)', async () => {
    await writeData('models/90001-1/90001-1.mpd', SYNC8);
    await writeData('models/90001-2/90001-2.mpd', MINI);
    await writeData('instructions/90001-1/90001-1_notice_A.pdf', PDF_A);
    await writeData('instructions/90001-1/90001-1_notice_B.pdf', PDF_B);
    const r = await localLookup(store, '90001');
    expect(r.setNumber).toMatchObject({ canonical: '90001-1', variantPresumed: true });
    expect(r.refs.map((x) => (x.origin === 'discovered' ? x.rel : x.origin)).sort()).toEqual(['instructions/90001-1/90001-1_notice_A.pdf', 'instructions/90001-1/90001-1_notice_B.pdf', 'models/90001-1/90001-1.mpd']);
    expect(r.links.legoInstructions).toBe('https://www.lego.com/fr-fr/service/building-instructions/90001');
    expect((await localLookup(store, '90001-2')).refs.map((x) => (x.origin === 'discovered' ? x.rel : ''))).toEqual(['models/90001-2/90001-2.mpd']);
    expect((await localLookup(store, '90002')).refs).toEqual([]);
  });
  it('refuses an invalid number', async () => {
    await expect(localLookup(store, '../etc')).rejects.toMatchObject({ code: 'INVALID' });
    await expect(localLookup(store, '')).rejects.toMatchObject({ code: 'INVALID' });
  });
});

describe('P8 preparation (read-only measurements)', () => {
  it('quick import of several files at once: models, booklets with page counts, mapping matched by fingerprint; nothing in the index yet', async () => {
    const files = [await stage('model', 'notice-sync-8.mpd', SYNC8), await stage('pdf', 'notice-test.pdf', PDF_A), await stage('pdf', 'notice-test-2.pdf', PDF_B),
      await stage('mapping', 'perso.brick-mapping.json', Buffer.from(serializeMapping(sync8Mapping())))];
    const p = await prepareImport(store, { files });
    expect(p.models).toHaveLength(1);
    expect(p.models[0]!.roots[0]).toMatchObject({ role: 'main', occurrenceCount: 8, planKind: 'ROOT_STEPS', stepCount: 2, missingParts: { checked: false } });
    expect(p.models[0]!.provenance).toMatchObject({ source: 'upload', license: 'CC0-1.0', author: 'Brick Lab Local - test original' });
    expect(p.pdfs.map((x) => [x.name, x.pages])).toEqual([['notice-test.pdf', 3], ['notice-test-2.pdf', 5]]);
    expect(p.mappings).toHaveLength(1);
    expect(p.mappingMatches[0]).toMatchObject({ structuralOk: true, assigned: 8, total: 8 });
    expect(p.mappings[0]).toMatchObject({ verified: 2, steps: 2, bookletSha256s: [sha(PDF_A)] });
    expect(await exists(path.join(dir, 'library', 'library.json'))).toBe(false); // nothing added before confirmation
  });

  it('several models of a set: separate files and a second unused model of the same MPD (possible alternative)', async () => {
    const p = await prepareImport(store, { files: [await stage('model', '90008-1.mpd', TRIO), await stage('model', '90008-1_Mini.mpd', MINI)] });
    expect(p.models.map((m) => m.roots.map((r) => [r.rootName, r.role, r.occurrenceCount]))).toEqual([
      [['p8-trio - main.ldr', 'main', 4], ['p8-trio - tower.ldr', 'unreferenced', 3]],
      [['mini-4-pieces.mpd', 'main', 4]],
    ]);
    expect(p.models[0]!.roots[0]!.submodels).toBe(1);
    expect(p.models[1]!.setNumberInName).toBe('90008-1');
    // the advanced choice of another main model is measured too
    const q = await prepareImport(store, { files: [await stage('model', '90008-1.mpd', TRIO)], extraRoots: [{ sha256: sha(TRIO), rootName: 'p8-trio - base.ldr' }, { sha256: sha(TRIO), rootName: 'absent.ldr' }] });
    expect(q.models[0]!.roots.map((r) => [r.rootName, r.role])).toContainEqual(['p8-trio - base.ldr', 'chosen']);
    expect(q.models[0]!.roots.map((r) => r.rootName)).not.toContain('absent.ldr');
  });

  it('no model: booklets only (nothing can be built), and unreadable files are reported', async () => {
    const p = await prepareImport(store, { files: [await stage('pdf', 'notice.pdf', PDF_A)] });
    expect(p.models).toEqual([]);
    expect(p.pdfs).toHaveLength(1);
    await expect(store.stage('model', 'vide.mpd', once(Buffer.from('0 juste un commentaire\n')), { source: 'upload' })).rejects.toMatchObject({ code: 'INVALID' });
    await expect(store.stage('pdf', 'faux.pdf', once(Buffer.from('pas un pdf')), { source: 'upload' })).rejects.toMatchObject({ code: 'UNSUPPORTED' });
    await expect(store.stage('model', 'binaire.mpd', once(Buffer.from([0, 1, 2])), { source: 'upload' })).rejects.toMatchObject({ code: 'UNSUPPORTED' });
    await expect(store.stage('mapping', 'x.json', once(Buffer.from('{"format":"autre"}')), { source: 'upload' })).rejects.toMatchObject({ code: 'INVALID' });
    const gone = await prepareImport(store, { files: [{ kind: 'model', ref: { origin: 'staged', sha256: 'a'.repeat(64) } }] });
    expect(gone.rejected[0]!.reason).toContain('introuvable');
  });

  it('mapping of another model is rejected; a draft mapping is "incomplete"; no mapping is ever invented', async () => {
    const model = await stage('model', 'notice-sync-8.mpd', SYNC8);
    const other = await stage('mapping', 'autre.brick-mapping.json', Buffer.from(serializeMapping(sync8Mapping({ modelSha: 'e'.repeat(64) }))));
    const draft = await stage('mapping', 'brouillon.brick-mapping.json', Buffer.from(serializeMapping(sync8Mapping({ complete: false, verified: false }))));
    const p = await prepareImport(store, { files: [model, other, draft, await stage('pdf', 'notice-test.pdf', PDF_A)] });
    expect(p.rejected.map((r) => r.reason).join()).toContain('concernent un autre modèle');
    expect(p.mappings.map((m) => m.name)).toEqual(['brouillon.brick-mapping.json']);
    expect(p.mappingMatches[0]).toMatchObject({ structuralOk: false, assigned: 6, total: 8 });
    const none = await prepareImport(store, { files: [model] });
    expect(none.mappings).toEqual([]);
    expect(none.mappingMatches).toEqual([]);
  });

  it('finds a mapping kept in mappings/ by the exact model fingerprint, whatever its name', async () => {
    await writeData('mappings/nom-quelconque.json', Buffer.from(serializeMapping(sync8Mapping())));
    await writeData('mappings/autre.json', Buffer.from(serializeMapping(sync8Mapping({ modelSha: 'e'.repeat(64) }))));
    const p = await prepareImport(store, { files: [await stage('model', 'renamed.mpd', SYNC8)] });
    expect(p.mappings.map((m) => [m.name, m.ref.origin])).toEqual([['nom-quelconque.json', 'discovered']]);
    expect(p.rejected).toEqual([]); // mappings found by the search are not "errors"
  });

  it('missing part files are listed against the local LDraw library (embedded parts excluded)', async () => {
    const lib = path.join(dir, 'ldraw');
    await fs.mkdir(path.join(lib, 'parts'), { recursive: true });
    await fs.writeFile(path.join(lib, 'parts', '3001.dat'), '0 Brick 2 x 4\n');
    process.env.LDRAW_LIBRARY_DIR = lib;
    const text = `${MINI.toString('utf8')}0 FILE extra.ldr\n1 4 0 0 0 1 0 0 0 1 0 0 0 1 9999.dat\n1 4 0 0 0 1 0 0 0 1 0 0 0 1 custom.dat\n0 FILE custom.dat\n0 !LDRAW_ORG Unofficial_Part\n3 16 0 0 0 1 0 0 0 1 0\n`;
    const p = await prepareImport(store, { files: [await stage('model', 'x.mpd', Buffer.from(text)), await stage('model', 'mini.mpd', MINI)] });
    expect(p.partsLibraryConfigured).toBe(true);
    const extra = p.models[0]!.roots.find((r) => r.rootName === 'extra.ldr')!;
    expect(extra.missingParts).toEqual({ checked: true, refs: ['9999.dat'], occurrences: 1 });
    expect(p.models[1]!.roots[0]!.missingParts).toEqual({ checked: true, refs: [], occurrences: 0 });
  });
});

describe('P8 import (one index write, retry-safe)', () => {
  const MAPPING = Buffer.from(serializeMapping(sync8Mapping()));
  async function prepared() {
    const model = await stage('model', 'notice-sync-8.mpd', SYNC8);
    const a = await stage('pdf', 'notice-test.pdf', PDF_A);
    const b = await stage('pdf', 'notice-test-2.pdf', PDF_B);
    const m = await stage('mapping', 'perso.brick-mapping.json', MAPPING);
    return { model, a, b, m };
  }
  const input = (f: Awaited<ReturnType<typeof prepared>>, over: Partial<ImportInput> = {}): ImportInput => ({
    target: { type: 'new', setNumber: '90001', name: 'Maison de test' },
    builds: [{ label: 'Modèle principal', model: f.model.ref, rootName: 'notice-sync-8.mpd', booklets: [f.a.ref, f.b.ref], mapping: f.m.ref }],
    ...over,
  });

  it('adds the set with its booklets and mapping, provenance kept; the synchronised mode is available; staging is emptied', async () => {
    const f = await prepared();
    const r = await store.importSet(input(f));
    expect(r).toMatchObject({ created: [{ label: 'Modèle principal' }], alreadyPresent: [], filesAdded: 4, filesReused: 0 });
    const view = await new LibraryStore(dir).view();
    expect(view.sets[0]).toMatchObject({ setNumber: '90001-1', name: 'Maison de test' });
    const b = view.sets[0]!.builds[0]!;
    expect(b.modes).toEqual(['synced', 'guided', 'freeManual']);
    expect(b.booklets.map((x) => x.originalName)).toEqual(['notice-test.pdf', 'notice-test-2.pdf']);
    const idx = await libraryJson();
    expect(idx.files[sha(SYNC8)]).toMatchObject({ location: { type: 'blob' }, provenance: { source: 'upload', license: 'CC0-1.0' } });
    expect(parseIndex(idx).ok).toBe(true);
    expect((await fs.readdir(path.join(dir, 'library', 'staging'))).filter((n) => !n.startsWith('.'))).toEqual([]);
  });

  it('without a mapping: added and playable in the compatible modes, synchronised mode NOT offered', async () => {
    const f = await prepared();
    await store.importSet(input(f, { builds: [{ label: 'Modèle principal', model: f.model.ref, rootName: 'notice-sync-8.mpd', booklets: [f.a.ref], mapping: null }] }));
    const b = (await store.view()).sets[0]!.builds[0]!;
    expect(b.modes).toEqual(['guided', 'freeManual']);
    expect(b.mapping).toBeNull();
    expect(b.syncBlocker).toBe('aucune correspondance notice ↔ 3D.');
  });

  it('repeated import: no duplicate, progress and mapping kept, files not copied again', async () => {
    const f = await prepared();
    const first = await store.importSet(input(f));
    const buildId = first.created[0]!.id;
    const progress = serializeProgress(sha(SYNC8), 'notice-sync-8.mpd', { mode: 'guided', placed: ['notice-sync-8.mpd#0', 'notice-sync-8.mpd#1'] }, 8, undefined, undefined);
    await store.putProgress(buildId, progress, null);
    const rev = (await libraryJson()).revision;
    // the user retries with the same files (dropped again: staged again)
    const again = await prepared();
    const second = await store.importSet(input(again));
    expect(second).toMatchObject({ setId: first.setId, created: [], alreadyPresent: [{ id: buildId }], filesAdded: 0, filesReused: 4 });
    expect(second.mappingsKept).toEqual(['Modèle principal']);
    const idx = await libraryJson();
    expect(idx.sets).toHaveLength(1);
    expect(idx.builds).toHaveLength(1);
    expect(idx.revision).toBe(rev + 1); // one write, no change of content
    expect((await store.view()).sets[0]!.builds[0]!.progress).toMatchObject({ placed: 2, mode: 'guided' });
    expect((await store.readMapping(buildId))!.revision).toBe(1);
  });

  it('same number already in the collection: refused for a new set, accepted as an alternative build; the existing progress is untouched', async () => {
    const f = await prepared();
    const first = await store.importSet(input(f));
    await store.putProgress(first.created[0]!.id, serializeProgress(sha(SYNC8), 'notice-sync-8.mpd', { mode: 'freeManual', placed: ['notice-sync-8.mpd#3'] }, 8, undefined, undefined), null);
    const mini = await stage('model', 'mini.mpd', MINI);
    const alt = { label: 'Modèle B', model: mini.ref, rootName: 'mini-4-pieces.mpd', booklets: [], mapping: null };
    await expect(store.importSet({ target: { type: 'new', setNumber: '90001-1', name: 'Autre' }, builds: [alt] })).rejects.toMatchObject({ code: 'DUPLICATE', details: { setId: first.setId } });
    const r = await store.importSet({ target: { type: 'existing', setId: first.setId }, builds: [alt] });
    expect(r.created.map((b) => b.label)).toEqual(['Modèle B']);
    const set = (await store.view()).sets[0]!;
    expect(set.builds.map((b) => [b.label, b.progress?.placed ?? 0])).toEqual([['Modèle principal', 1], ['Modèle B', 0]]);
    // a different variant is another box
    const other = await store.importSet({ target: { type: 'new', setNumber: '90001-2', name: 'Variante' }, builds: [{ ...alt, model: (await stage('model', 'trio.mpd', TRIO)).ref, rootName: 'p8-trio - main.ldr' }] });
    expect(other.setId).not.toBe(first.setId);
  });

  it('a model already used by another set is refused (duplicate), two builds from one MPD are accepted', async () => {
    const trio = await stage('model', 'trio.mpd', TRIO);
    const r = await store.importSet({
      target: { type: 'new', setNumber: '90008', name: 'Trio' },
      builds: [
        { label: 'Principal', model: trio.ref, rootName: 'p8-trio - main.ldr', booklets: [], mapping: null },
        { label: 'Tour', model: trio.ref, rootName: 'p8-trio - tower.ldr', booklets: [], mapping: null },
      ],
    });
    expect(r.created.map((b) => b.label)).toEqual(['Principal', 'Tour']);
    expect((await libraryJson()).builds.map((b) => b.rootName)).toEqual(['p8-trio - main.ldr', 'p8-trio - tower.ldr']);
    const again = await stage('model', 'trio-copie.mpd', TRIO);
    await expect(store.importSet({ target: { type: 'new', setNumber: '90009', name: 'Copie' }, builds: [{ label: 'X', model: again.ref, rootName: 'p8-trio - main.ldr', booklets: [], mapping: null }] }))
      .rejects.toMatchObject({ code: 'DUPLICATE' });
    const p = await prepareImport(store, { files: [again] });
    expect(p.models[0]!.roots.map((x) => x.existingBuild?.label)).toEqual(['Principal', 'Tour']);
  });

  it('incompatible mapping at confirmation: nothing is added', async () => {
    const f = await prepared();
    const bad = await stage('mapping', 'autre.json', Buffer.from(serializeMapping(sync8Mapping({ modelSha: 'e'.repeat(64) }))));
    await expect(store.importSet(input(f, { builds: [{ label: 'M', model: f.model.ref, rootName: 'notice-sync-8.mpd', booklets: [], mapping: bad.ref }] }))).rejects.toMatchObject({ code: 'INVALID' });
    expect(await exists(path.join(dir, 'library', 'library.json'))).toBe(false);
  });

  it('files of the data folder are referenced in place, never copied or modified', async () => {
    await writeData('models/90001-1/90001-1.mpd', SYNC8);
    await writeData('instructions/90001-1/notice.pdf', PDF_A);
    const before = await fs.stat(path.join(dir, 'models', '90001-1', '90001-1.mpd'));
    const l = await localLookup(store, '90001');
    const [model, pdf] = [l.refs.find((r) => r.origin === 'discovered' && r.rel.startsWith('models/'))!, l.refs.find((r) => r.origin === 'discovered' && r.rel.startsWith('instructions/'))!];
    await store.importSet({ target: { type: 'new', setNumber: '90001', name: 'Trouvé' }, builds: [{ label: 'M', model, rootName: 'notice-sync-8.mpd', booklets: [pdf], mapping: null }] });
    const idx = await libraryJson();
    expect(idx.files[sha(SYNC8)]).toMatchObject({ location: { type: 'external', path: 'models/90001-1/90001-1.mpd' }, provenance: { source: 'discovery', license: 'CC0-1.0' } });
    expect((await fs.stat(path.join(dir, 'models', '90001-1', '90001-1.mpd'))).mtimeMs).toBe(before.mtimeMs);
    expect(await exists(path.join(dir, 'library', 'blobs'))).toBe(false);
  });

  it('hostile references are refused: path traversal, library/ itself, wrong kind, changed file', async () => {
    await writeData('models/90001-1/90001-1.mpd', SYNC8);
    const good = { origin: 'discovered', rel: 'models/90001-1/90001-1.mpd', sha256: sha(SYNC8) } as const;
    const build = (model: unknown) => ({ target: { type: 'new' as const, setNumber: '90001', name: 'X' }, builds: [{ label: 'M', model: model as FileRef, rootName: 'notice-sync-8.mpd', booklets: [], mapping: null }] });
    for (const rel of ['../models/90001-1/90001-1.mpd', 'models/../library/library.json', '/etc/passwd', 'library/library.json', 'instructions/x.mpd', 'models/90001-1/.hidden.mpd']) {
      await expect(store.importSet(build({ ...good, rel }))).rejects.toBeInstanceOf(LibraryError);
    }
    await expect(store.importSet(build({ origin: 'elsewhere', sha256: sha(SYNC8) }))).rejects.toMatchObject({ code: 'INVALID' });
    await writeData('models/90001-1/90001-1.mpd', MINI);
    await expect(store.importSet(build(good))).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await exists(path.join(dir, 'library', 'library.json'))).toBe(false);
  });

  it('interrupted index write: no partial set; the retry succeeds without duplicate', async () => {
    const f = await prepared();
    writeHooks.beforeRename = async (_tmp, target) => {
      if (target.endsWith('library.json')) throw Object.assign(new Error('disque plein'), { code: 'ENOSPC' });
    };
    await expect(store.importSet(input(f))).rejects.toMatchObject({ code: 'STORAGE' });
    writeHooks.beforeRename = null;
    expect(await exists(path.join(dir, 'library', 'library.json'))).toBe(false);
    expect((await store.view()).sets).toEqual([]);
    // staged files are still there: the same request succeeds
    const r = await store.importSet(input(f));
    expect(r.created).toHaveLength(1);
    expect((await libraryJson()).sets).toHaveLength(1);
  });

  it('read-only library folder: clear storage error, nothing changed', async () => {
    const f = await prepared();
    await store.importSet({ target: { type: 'new', setNumber: '90002', name: 'Premier' }, builds: [{ label: 'M', model: (await stage('model', 'mini.mpd', MINI)).ref, rootName: 'mini-4-pieces.mpd', booklets: [], mapping: null }] });
    const before = await fs.readFile(path.join(dir, 'library', 'library.json'), 'utf8');
    await fs.chmod(path.join(dir, 'library'), 0o500);
    await expect(store.importSet(input(f))).rejects.toMatchObject({ code: 'STORAGE' });
    await fs.chmod(path.join(dir, 'library'), 0o700);
    expect(await fs.readFile(path.join(dir, 'library', 'library.json'), 'utf8')).toBe(before);
  });

  it('a P7 index (files without provenance) is read and extended; P7 progress (v1/v2) is kept', async () => {
    // P7 path: upload + createSet
    const p7 = (await store.ingest('model', 'mini.mpd', once(MINI))).file;
    const { builds } = await store.createSet({ setNumber: '31040-1', name: 'Ancien P7', builds: [{ label: 'Modèle principal', modelFileId: p7.sha256 }] });
    await store.putProgress(builds[0]!.id, serializeProgress(p7.sha256, 'mini.mpd', { mode: 'guided', placed: ['mini-4-pieces.mpd#0'] }, 4, undefined, undefined), null);
    expect((await libraryJson()).files[p7.sha256]!.provenance).toBeUndefined();
    // P8 search by "31040" finds the P7 set (same number, variant 1)
    const p = await prepareImport(store, { setNumber: '31040', files: [await stage('model', 'trio.mpd', TRIO)] });
    expect(p.existingSets.map((s) => [s.name, s.builds[0]!.placed])).toEqual([['Ancien P7', 1]]);
    await store.importSet({ target: { type: 'existing', setId: p.existingSets[0]!.id }, builds: [{ label: 'Alternatif', model: p.models[0]!.ref, rootName: 'p8-trio - main.ldr', booklets: [], mapping: null }] });
    const view = await new LibraryStore(dir).view();
    expect(view.sets[0]!.builds.map((b) => [b.label, b.progress?.placed ?? 0])).toEqual([['Modèle principal', 1], ['Alternatif', 0]]);
  });

  it('a hand-damaged provenance makes the index invalid (never silently repaired)', async () => {
    const f = await prepared();
    await store.importSet(input(f));
    const idx = await libraryJson();
    (idx.files[sha(SYNC8)] as { provenance: unknown }).provenance = { source: 'omr', url: 'javascript:alert(1)' };
    expect(parseIndex(idx).ok).toBe(false);
  });
});

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serializeProgress } from '@/domain/build/progress';
import { analyzeModel } from '@/domain/import/analyze';
import { addBooklet, addStep, assignToStep, createMapping, serializeMapping, type InstructionMapping } from '@/domain/instructions/mapping';
import { filterSets, setStatus, type BuildView } from '@/domain/library/types';
import { writeHooks } from '@/server/library/fs-atomic';
import { adopt, discover } from '@/server/library/discovery';
import { parseIndex } from '@/server/library/schema';
import { safeSegments } from '@/server/library/paths';
import { LibraryError, LibraryStore } from '@/server/library/store';
import { makeTestPdf } from '../e2e/make-test-pdf';

const repo = (rel: string) => path.join(__dirname, '..', '..', rel);
const MINI = readFileSync(repo('fixtures/mini-4-pieces.mpd'));
const SYNC8 = readFileSync(repo('tests/fixtures/notice-sync-8.mpd'));
const NESTED = readFileSync(repo('fixtures/nested-submodel.mpd'));
const PDF_A = makeTestPdf(3);
const PDF_B = makeTestPdf(5);
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
async function* chunks(b: Buffer, size = 7) {
  for (let i = 0; i < b.length; i += size) yield b.subarray(i, i + size);
}

/** Complete mapping of notice-sync-8 on booklet `pdf` (4 steps, 8/8 bricks). */
function sync8Mapping(pdf: Buffer = PDF_A, modelSha = sha(SYNC8)): InstructionMapping {
  const a = analyzeModel(SYNC8.toString('utf8'), 'notice-sync-8.mpd');
  let m = createMapping({ sha256: modelSha, fileName: 'notice-sync-8.mpd', rootName: a.model.rootName, occurrences: a.model.occurrences });
  m = addBooklet(m, { label: 'Livret test', fileName: 'notice-test.pdf', sha256: sha(pdf), pageCount: 3 }).mapping;
  let last: string | null = null;
  for (const [page, ids] of [[2, [0, 1]], [2, [2, 3]], [3, [4]], [3, [5, 6, 7]]] as const) {
    const r = addStep(m, last, { page });
    m = assignToStep(r.mapping, r.stepId, ids.map((i) => `notice-sync-8.mpd#${i}`)).mapping;
    last = r.stepId;
  }
  return m;
}

let dir: string;
let store: LibraryStore;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(tmpdir(), 'brick-lab-library-'));
  store = new LibraryStore(dir);
});
afterEach(async () => {
  writeHooks.beforeRename = null;
  await fs.chmod(path.join(dir, 'library'), 0o700).catch(() => undefined);
  await fs.rm(dir, { recursive: true, force: true });
});

const ingest = (kind: 'model' | 'pdf' | 'mapping', name: string, bytes: Buffer, s = store) => s.ingest(kind, name, chunks(bytes));

async function addSync8Set(s = store) {
  const model = (await ingest('model', 'notice-sync-8.mpd', SYNC8, s)).file;
  const a = (await ingest('pdf', 'notice-test.pdf', PDF_A, s)).file;
  const b = (await ingest('pdf', 'notice-test-2.pdf', PDF_B, s)).file;
  const mapping = (await ingest('mapping', 'notice-sync-8.brick-mapping.json', Buffer.from(serializeMapping(sync8Mapping())), s)).file;
  return s.createSet({ setNumber: '90001-1', name: 'Set de test', builds: [{ label: 'Modèle principal', modelFileId: model.sha256, bookletFileIds: [a.sha256, b.sha256], mappingFileId: mapping.sha256 }] });
}

const progressFor = (modelSha: string, ids: string[], mode: 'synced' | 'guided' | 'freeManual' = 'synced', page = 3) =>
  serializeProgress(modelSha, 'notice-sync-8.mpd', { mode, placed: ids }, 8, { page, bookletSha256: sha(PDF_A) }, undefined);

describe('library: add, reopen, duplicates', () => {
  it('adds a set with a model, two PDFs and a mapping; a fresh store (server restart) reads it back', async () => {
    const { set, builds } = await addSync8Set();
    const fresh = new LibraryStore(dir);
    const view = await fresh.view();
    expect(view.sets).toHaveLength(1);
    const b = view.sets[0]!.builds[0]!;
    expect(view.sets[0]).toMatchObject({ id: set.id, setNumber: '90001-1', name: 'Set de test' });
    expect(b).toMatchObject({ id: builds[0]!.id, label: 'Modèle principal', status: 'NOT_STARTED', syncBlocker: null, problems: [] });
    expect(b.snapshot).toMatchObject({ occurrenceCount: 8, planKind: 'ROOT_STEPS', stepCount: 2, errors: 0 });
    expect(b.booklets.map((x) => x.originalName)).toEqual(['notice-test.pdf', 'notice-test-2.pdf']);
    expect(b.modes).toEqual(['synced', 'guided', 'freeManual']);
    expect(b.mapping).toMatchObject({ steps: 4, assigned: 8, total: 8, valid: true });
    // the bytes served are the ones imported, checked by fingerprint
    expect((await fresh.readVerified(sha(SYNC8))).bytes.equals(SYNC8)).toBe(true);
  });

  it('survives a real process restart (separate Node processes)', async () => {
    await addSync8Set();
    const out = execFileSync('npx', ['tsx', 'tests/unit/helpers/print-library.ts', dir], { cwd: repo('.'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    expect(JSON.parse(out.trim().split('\n').pop()!)).toEqual([['90001-1', [['Modèle principal', 8, 'synced+guided+freeManual']]]]);
  });

  it('stores an identical file once, refuses the same model twice and the same set number unless asked', async () => {
    const first = await ingest('model', 'a.mpd', MINI);
    const again = await ingest('model', 'renamed.mpd', MINI);
    expect(first.duplicate).toBe(false);
    expect(again).toMatchObject({ duplicate: true, file: { sha256: first.file.sha256, originalName: 'a.mpd' } });
    const blobs = await fs.readdir(path.join(dir, 'library', 'blobs', first.file.sha256.slice(0, 2)));
    expect(blobs).toEqual([`${first.file.sha256}.mpd`]);
    await store.createSet({ setNumber: '90002-1', name: 'Mini', builds: [{ label: 'Principal', modelFileId: first.file.sha256 }] });
    await expect(store.createSet({ setNumber: '90003-1', name: 'Copie', builds: [{ label: 'Principal', modelFileId: first.file.sha256 }] }))
      .rejects.toMatchObject({ code: 'DUPLICATE', message: expect.stringContaining('déjà dans ta collection : 90002-1 Mini') });
    const other = (await ingest('model', 'notice-sync-8.mpd', SYNC8)).file;
    await expect(store.createSet({ setNumber: '90002-1', name: 'Autre', builds: [{ label: 'X', modelFileId: other.sha256 }] })).rejects.toMatchObject({ code: 'DUPLICATE' });
    const ok = await store.createSet({ setNumber: '90002-1', name: 'Autre', allowSameNumber: true, builds: [{ label: 'X', modelFileId: other.sha256 }] });
    expect(ok.set.setNumber).toBe('90002-1');
  });

  it('rejects files that are not what they claim, empty or too large', async () => {
    await expect(ingest('pdf', 'x.pdf', Buffer.from('not a pdf'))).rejects.toMatchObject({ code: 'UNSUPPORTED' });
    await expect(ingest('model', 'x.io', MINI)).rejects.toMatchObject({ code: 'UNSUPPORTED' });
    await expect(ingest('model', 'x.mpd', Buffer.from('0 just a comment\n'))).rejects.toMatchObject({ code: 'INVALID' });
    await expect(ingest('model', 'x.mpd', Buffer.from([0x30, 0, 0x31]))).rejects.toMatchObject({ code: 'UNSUPPORTED' });
    await expect(ingest('mapping', 'm.json', Buffer.from('{"format":"other"}'))).rejects.toMatchObject({ code: 'INVALID' });
    await expect(ingest('model', 'x.mpd', Buffer.alloc(0))).rejects.toMatchObject({ code: 'INVALID' });
    await expect(ingest('mapping', 'm.json', Buffer.alloc(1024 * 1024 + 1, 0x20))).rejects.toMatchObject({ code: 'TOO_LARGE' });
    expect(await fs.readdir(path.join(dir, 'library', 'tmp'))).toEqual([]);
  });
});

describe('library: booklets, mappings, alternative models', () => {
  it('importing a file does not invalidate the revision a page is editing from', async () => {
    const { builds } = await addSync8Set();
    const rev = (await store.view()).revision;
    const pdf = (await ingest('pdf', 'nouvelle.pdf', makeTestPdf(7))).file;
    expect((await store.view()).revision).toBe(rev);
    await store.updateBuild(builds[0]!.id, { bookletFileIds: [sha(PDF_A), pdf.sha256] }, rev);
    expect((await store.view()).sets[0]!.builds[0]!.booklets).toHaveLength(2);
  });

  it('associates several PDFs in order, replaces one, keeps the progress', async () => {
    const { builds } = await addSync8Set();
    const id = builds[0]!.id;
    await store.putProgress(id, progressFor(sha(SYNC8), ['notice-sync-8.mpd#0']), null);
    const rev = (await store.view()).revision;
    await store.updateBuild(id, { bookletFileIds: [sha(PDF_B), sha(PDF_A)] }, rev);
    let b = (await store.view()).sets[0]!.builds[0]!;
    expect(b.booklets.map((x) => x.originalName)).toEqual(['notice-test-2.pdf', 'notice-test.pdf']);
    // the mapping needs PDF A: without it the synchronised mode is not offered
    await store.updateBuild(id, { bookletFileIds: [sha(PDF_B)] }, rev + 1);
    b = (await store.view()).sets[0]!.builds[0]!;
    expect(b.modes).toEqual(['guided', 'freeManual']);
    expect(b.syncBlocker).toContain('notice attendue par les correspondances non associée');
    expect(b.progress).toMatchObject({ placed: 1, total: 8 });
    await expect(store.updateBuild(id, { bookletFileIds: ['f'.repeat(64)] }, rev + 2)).rejects.toMatchObject({ code: 'INVALID' });
  });

  it('accepts a mapping added later, rejects the mapping of another model', async () => {
    const model = (await ingest('model', 'notice-sync-8.mpd', SYNC8)).file;
    const pdf = (await ingest('pdf', 'notice-test.pdf', PDF_A)).file;
    const { builds } = await store.createSet({ setNumber: '90004-1', name: 'Sans mapping', builds: [{ label: 'Principal', modelFileId: model.sha256, bookletFileIds: [pdf.sha256] }] });
    const id = builds[0]!.id;
    expect((await store.view()).sets[0]!.builds[0]!.syncBlocker).toBe('aucune correspondance notice ↔ 3D.');
    const foreign = sync8Mapping(PDF_A, 'e'.repeat(64));
    await expect(store.putMapping(id, serializeMapping(foreign), null, 'import')).rejects.toMatchObject({ code: 'INVALID', message: expect.stringContaining('autre fichier') });
    const wrongCount = { ...sync8Mapping(), model: { ...sync8Mapping().model, occurrenceCount: 9 } };
    await expect(store.putMapping(id, serializeMapping(wrongCount), null, 'import')).rejects.toMatchObject({ code: 'INVALID' });
    const foreignFile = (await ingest('mapping', 'foreign.json', Buffer.from(serializeMapping(foreign)))).file;
    await expect(store.addBuild((await store.view()).sets[0]!.id, { label: 'B', modelFileId: model.sha256, mappingFileId: foreignFile.sha256 })).rejects.toMatchObject({ code: 'DUPLICATE' });
    const rec = await store.putMapping(id, serializeMapping(sync8Mapping()), null, 'import');
    expect(rec.revision).toBe(1);
    const b = (await store.view()).sets[0]!.builds[0]!;
    expect(b.modes).toEqual(['synced', 'guided', 'freeManual']);
    // a stale editor cannot overwrite a newer mapping
    await expect(store.putMapping(id, serializeMapping(sync8Mapping()), null, 'editor')).rejects.toMatchObject({ code: 'CONFLICT' });
    await store.putMapping(id, serializeMapping(createMapping({ sha256: model.sha256, fileName: 'notice-sync-8.mpd', rootName: 'notice-sync-8.mpd', occurrences: b.snapshot ? analyzeModel(SYNC8.toString(), 'notice-sync-8.mpd').model.occurrences : [] })), 1, 'clear');
    // the replaced (valid) mapping is kept in the history
    const history = await fs.readdir(path.join(dir, 'library', 'builds', id, 'history'));
    expect(history.filter((n) => n.startsWith('mapping-'))).toHaveLength(1);
    expect((await store.view()).sets[0]!.builds[0]!.modes).toEqual(['guided', 'freeManual']);
  });

  it('keeps alternative models of one box as distinct builds with their own progress', async () => {
    const a = (await ingest('model', 'mini-4-pieces.mpd', MINI)).file;
    const nested = (await ingest('model', 'nested-submodel.mpd', NESTED)).file;
    const { set } = await store.createSet({
      setNumber: '90005-1', name: '3-en-1 de test',
      builds: [{ label: 'Modèle A', modelFileId: a.sha256 }, { label: 'Modèle B', modelFileId: nested.sha256 }],
    });
    // same file, another main model: a third build, not a duplicate
    const c = await store.addBuild(set.id, { label: 'Sous-modèle seul', modelFileId: nested.sha256, rootName: 'reusable-submodel.ldr' });
    await expect(store.addBuild(set.id, { label: 'Encore', modelFileId: nested.sha256, rootName: 'reusable-submodel.ldr' })).rejects.toMatchObject({ code: 'DUPLICATE' });
    await expect(store.addBuild(set.id, { label: 'Inconnu', modelFileId: nested.sha256, rootName: 'absent.ldr' })).rejects.toMatchObject({ code: 'INVALID' });
    const v = await store.view();
    const builds = v.sets[0]!.builds;
    expect(builds.map((b) => [b.label, b.rootName, b.snapshot.occurrenceCount])).toEqual([
      ['Modèle A', 'mini-4-pieces.mpd', 4], ['Modèle B', 'nested-submodel.mpd', 4], ['Sous-modèle seul', 'reusable-submodel.ldr', 2],
    ]);
    // progress of one build does not fit another (occurrence ids carry the main model)
    const pB = serializeProgress(nested.sha256, 'nested-submodel.mpd', { mode: 'guided', placed: ['nested-submodel.mpd#0/reusable-submodel.ldr#0'] }, 4);
    await store.putProgress(builds[1]!.id, pB, null);
    await expect(store.putProgress(c.id, pB, null)).rejects.toMatchObject({ code: 'INVALID' });
    await expect(store.putProgress(builds[0]!.id, pB, null)).rejects.toMatchObject({ code: 'INVALID' });
    const after = (await store.view()).sets[0]!.builds;
    expect(after.map((b) => b.status)).toEqual(['NOT_STARTED', 'IN_PROGRESS', 'NOT_STARTED']);
    expect(setStatus(after)).toBe('IN_PROGRESS');
  });
});

describe('library: progress', () => {
  it('progress history: at most one atelier version per minute, but an explicit browser recovery always keeps the replaced one', async () => {
    const { builds } = await addSync8Set();
    const id = builds[0]!.id;
    const m = sha(SYNC8);
    const hist = async () => (await fs.readdir(path.join(dir, 'library', 'builds', id, 'history')).catch(() => [] as string[])).filter((n) => n.startsWith('progress-'));
    const r1 = await store.putProgress(id, progressFor(m, ['notice-sync-8.mpd#0']), null);
    const r2 = await store.putProgress(id, progressFor(m, ['notice-sync-8.mpd#0', 'notice-sync-8.mpd#1']), r1.revision);
    const r3 = await store.putProgress(id, progressFor(m, ['notice-sync-8.mpd#0', 'notice-sync-8.mpd#1', 'notice-sync-8.mpd#2']), r2.revision);
    expect(await hist()).toHaveLength(1); // r1 kept, r2 replaced within the minute (atelier autosave)
    const older = progressFor(m, ['notice-sync-8.mpd#7'], 'freeManual');
    await store.putProgress(id, older, r3.revision, 'browser');
    const files = await hist();
    expect(files).toHaveLength(2);
    // the replaced library version (3 bricks) is in the history, byte for byte
    const kept = JSON.parse(await fs.readFile(path.join(dir, 'library', 'builds', id, 'history', files.sort().at(-1)!), 'utf8')) as { payload: { placedOccurrenceIds: string[] } };
    expect(kept.payload.placedOccurrenceIds).toHaveLength(3);
    expect((await store.readRecord(id, 'progress'))!.payload).toEqual(older);
    // a recovery based on a stale revision is refused, not merged
    await expect(store.putProgress(id, older, r3.revision, 'browser')).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('saves, resumes, refuses stale or foreign progress, and restarts only with confirmation', async () => {
    const { builds } = await addSync8Set();
    const id = builds[0]!.id;
    const m = sha(SYNC8);
    const r1 = await store.putProgress(id, progressFor(m, ['notice-sync-8.mpd#0', 'notice-sync-8.mpd#1']), null);
    const r2 = await store.putProgress(id, progressFor(m, ['notice-sync-8.mpd#0', 'notice-sync-8.mpd#1', 'notice-sync-8.mpd#2']), r1.revision);
    expect(r2.revision).toBe(2);
    // another tab still at revision 1 cannot overwrite
    await expect(store.putProgress(id, progressFor(m, []), r1.revision)).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(store.putProgress(id, progressFor('d'.repeat(64), []), r2.revision)).rejects.toMatchObject({ code: 'INVALID' });
    await expect(store.putProgress(id, progressFor(m, ['nope#1']), r2.revision)).rejects.toMatchObject({ code: 'INVALID' });
    const v = (await new LibraryStore(dir).view()).sets[0]!.builds[0]!;
    expect(v.progress).toMatchObject({ placed: 3, total: 8, mode: 'synced', lastPdfPage: 3, revision: 2 });
    expect(v.status).toBe('IN_PROGRESS');
    await expect(store.clearProgress(id, false, 2)).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
    await store.clearProgress(id, true, 2);
    expect((await store.view()).sets[0]!.builds[0]!.progress).toBeNull();
    const history = await fs.readdir(path.join(dir, 'library', 'builds', id, 'history'));
    expect(history.some((n) => n.includes('cleared'))).toBe(true);
  });

  it('accepts P5 (schema v1) and P6 (schema v2) progress payloads unchanged', async () => {
    const { builds } = await addSync8Set();
    const v1 = { schemaVersion: 1, modelContentHash: sha(SYNC8), displayName: 'notice-sync-8.mpd', buildMode: 'guided', placedOccurrenceIds: ['notice-sync-8.mpd#0'], totalOccurrences: 8, lastPdfPage: 2, updatedAtIso: '2026-11-03T10:00:00.000Z' };
    const r = await store.putProgress(builds[0]!.id, v1, null);
    expect((await store.readRecord(builds[0]!.id, 'progress'))!.payload).toEqual(v1);
    // a v1 save cannot claim the synchronised mode (P6 rule)
    await expect(store.putProgress(builds[0]!.id, { ...v1, buildMode: 'synced' }, r.revision)).rejects.toMatchObject({ code: 'INVALID' });
    await store.putProgress(builds[0]!.id, progressFor(sha(SYNC8), ['notice-sync-8.mpd#0']), r.revision);
    expect((await store.view()).sets[0]!.builds[0]!.progress).toMatchObject({ mode: 'synced', placed: 1 });
  });
});

describe('library: missing or modified files', () => {
  it('reports a modified, a resized and a missing external file, and never serves other bytes', async () => {
    const data = path.join(dir, 'models', '90006-1');
    await fs.mkdir(data, { recursive: true });
    await fs.mkdir(path.join(dir, 'instructions', '90006-1'), { recursive: true });
    await fs.writeFile(path.join(data, 'mini.mpd'), MINI);
    await fs.writeFile(path.join(dir, 'instructions', '90006-1', 'n.pdf'), PDF_A);
    const found = await discover(store);
    const s = found.sets[0]!;
    await adopt(store, { setNumber: '90006-1', name: 'Externe', models: [{ rel: s.models[0]!.rel, sha256: s.models[0]!.sha256, label: 'Principal' }], pdfs: [{ rel: s.pdfs[0]!.rel, sha256: s.pdfs[0]!.sha256 }], mappings: [] });
    // same size, different content (one colour changed)
    await fs.writeFile(path.join(data, 'mini.mpd'), Buffer.from(MINI.toString('utf8').replace('1 4 0 0 0', '1 2 0 0 0'), 'utf8'));
    await expect(store.readVerified(sha(MINI))).rejects.toMatchObject({ code: 'FILE_PROBLEM', details: { state: 'HASH_MISMATCH' } });
    let b = (await store.view()).sets[0]!.builds[0]!;
    // the size is the same, but the model is always hashed (it is parsed for the view)
    expect(b.model.state).toBe('HASH_MISMATCH');
    expect(b.modes).toEqual([]);
    expect(b.problems.join(' ')).toContain('empreinte SHA-256 différente');
    expect((await store.checkBuild(b.id)).map((f) => f.state)).toEqual(['HASH_MISMATCH', 'OK']);
    await fs.appendFile(path.join(data, 'mini.mpd'), '0 extra\n');
    b = (await store.view()).sets[0]!.builds[0]!;
    expect(b.model.state).toBe('SIZE_CHANGED');
    await fs.rm(path.join(dir, 'instructions', '90006-1', 'n.pdf'));
    b = (await store.view()).sets[0]!.builds[0]!;
    expect(b.booklets[0]!.state).toBe('MISSING');
    expect(b.problems.join(' ')).toContain('Notice introuvable : n.pdf');
    // putting the original file back repairs it
    await fs.writeFile(path.join(data, 'mini.mpd'), MINI);
    expect((await store.checkBuild(b.id))[0]!.state).toBe('OK');
  });

  it('restores a missing blob from a re-import of the same file', async () => {
    const f = (await ingest('pdf', 'n.pdf', PDF_A)).file;
    const blob = path.join(dir, 'library', ...f.location.path.split('/'));
    await fs.rm(blob);
    await expect(store.readVerified(f.sha256)).rejects.toMatchObject({ details: { state: 'MISSING' } });
    expect((await ingest('pdf', 'n.pdf', PDF_A)).duplicate).toBe(true);
    expect((await store.readVerified(f.sha256)).bytes.equals(PDF_A)).toBe(true);
  });
});

describe('library: storage errors and interrupted writes', () => {
  it('an interrupted index write leaves the previous index intact and no temporary file', async () => {
    await addSync8Set();
    const before = await fs.readFile(path.join(dir, 'library', 'library.json'), 'utf8');
    const rev = (await store.view()).revision;
    let calls = 0;
    writeHooks.beforeRename = async (_tmp, target) => {
      if (target.endsWith('library.json')) {
        calls++;
        throw Object.assign(new Error('simulated crash'), { code: 'EIO' });
      }
    };
    await expect(store.updateSet((await store.view()).sets[0]!.id, { name: 'Nouveau nom' }, rev)).rejects.toMatchObject({ code: 'STORAGE' });
    expect(calls).toBe(1);
    writeHooks.beforeRename = null;
    expect(await fs.readFile(path.join(dir, 'library', 'library.json'), 'utf8')).toBe(before);
    expect((await fs.readdir(path.join(dir, 'library'))).filter((n) => n.endsWith('.tmp'))).toEqual([]);
    expect((await store.view()).sets[0]!.name).toBe('Set de test');
  });

  it('a damaged index is refused and never overwritten; a deleted index with backups is not silently reset', async () => {
    await addSync8Set();
    const file = path.join(dir, 'library', 'library.json');
    const good = await fs.readFile(file, 'utf8');
    await fs.writeFile(file, good.slice(0, good.length / 2));
    await expect(store.view()).rejects.toMatchObject({ code: 'CORRUPT_INDEX' });
    await expect(ingest('model', 'mini.mpd', MINI)).rejects.toMatchObject({ code: 'CORRUPT_INDEX' });
    expect(await fs.readFile(file, 'utf8')).toBe(good.slice(0, good.length / 2));
    await fs.rm(file);
    await expect(store.view()).rejects.toMatchObject({ code: 'CORRUPT_INDEX', message: expect.stringContaining('sauvegardes') });
    // restore = copy the latest backup back (documented procedure)
    const backups = (await fs.readdir(path.join(dir, 'library', 'backups'))).sort();
    await fs.copyFile(path.join(dir, 'library', 'backups', backups.at(-1)!), file);
    expect((await store.view()).sets).toHaveLength(1);
  });

  it('a read-only library folder gives a clear error and changes nothing', async () => {
    await addSync8Set();
    const before = await fs.readFile(path.join(dir, 'library', 'library.json'), 'utf8');
    await fs.chmod(path.join(dir, 'library'), 0o500);
    const v = await store.view();
    await expect(store.updateSet(v.sets[0]!.id, { name: 'X' }, v.revision)).rejects.toMatchObject({ code: 'STORAGE', message: expect.stringContaining('Rien n’a été modifié') });
    await fs.chmod(path.join(dir, 'library'), 0o700);
    expect(await fs.readFile(path.join(dir, 'library', 'library.json'), 'utf8')).toBe(before);
  });

  it('a corrupted progress record is reported and kept as is', async () => {
    const { builds } = await addSync8Set();
    const file = path.join(dir, 'library', 'builds', builds[0]!.id, 'progress.json');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, '{"format":"brick-lab-library-record","revis');
    const b = (await store.view()).sets[0]!.builds[0]!;
    expect(b.problems.join(' ')).toContain('Progression enregistrée(s) illisible(s)');
    await expect(store.putProgress(b.id, progressFor(sha(SYNC8), []), null)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await fs.readFile(file, 'utf8')).toBe('{"format":"brick-lab-library-record","revis');
  });
});

describe('library: hostile paths', () => {
  it('refuses traversal, absolute, hidden and odd paths', () => {
    for (const bad of ['../x', 'a/../../b', '/etc/passwd', 'a\\b', '.hidden/x', 'a//b', '', 'a/./b', 'x\u0000y', 'a/b/c/d/e/f/g']) expect(safeSegments(bad)).toBeNull();
    expect(safeSegments('models/31040-1/31040-1.mpd')).toEqual(['models', '31040-1', '31040-1.mpd']);
  });

  it('an index pointing outside its folder is refused as a whole', async () => {
    await addSync8Set();
    const file = path.join(dir, 'library', 'library.json');
    const idx = JSON.parse(await fs.readFile(file, 'utf8')) as { files: Record<string, { location: { path: string } }> };
    idx.files[sha(SYNC8)]!.location.path = '../../../etc/passwd';
    expect(parseIndex(idx)).toMatchObject({ ok: false });
    const proto = JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
    expect(parseIndex({ ...proto, files: JSON.parse('{"__proto__":{"polluted":true}}') })).toMatchObject({ ok: false });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('discovery ignores symbolic links and adoption accepts only the discovery folders', async () => {
    const outside = await fs.mkdtemp(path.join(tmpdir(), 'brick-lab-outside-'));
    await fs.writeFile(path.join(outside, 'secret.mpd'), MINI);
    await fs.mkdir(path.join(dir, 'models', 'evil'), { recursive: true });
    await fs.symlink(path.join(outside, 'secret.mpd'), path.join(dir, 'models', 'evil', 'link.mpd'));
    await fs.symlink(outside, path.join(dir, 'models', 'linked-dir'));
    const found = await discover(store);
    expect(found.sets).toEqual([]);
    const s = sha(MINI);
    await expect(store.registerExternal('model', 'models/evil/link.mpd', s)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(store.registerExternal('model', '../' + path.basename(outside) + '/secret.mpd', s)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(store.registerExternal('model', 'library/library.json', s)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(adopt(store, { setNumber: '1', name: 'x', models: [{ rel: 'ldraw/parts/3001.dat', sha256: s, label: 'x' }], pdfs: [], mappings: [] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await fs.rm(outside, { recursive: true, force: true });
  });
});

describe('library: metadata edits never lose data', () => {
  it('renaming a set keeps progress and mapping byte for byte, a stale edit is refused, backups exist', async () => {
    const { set, builds } = await addSync8Set();
    const id = builds[0]!.id;
    await store.putProgress(id, progressFor(sha(SYNC8), ['notice-sync-8.mpd#0']), null);
    const read = (n: string) => fs.readFile(path.join(dir, 'library', 'builds', id, n), 'utf8');
    const [p0, m0] = [await read('progress.json'), await read('mapping.json')];
    const rev = (await store.view()).revision;
    await store.updateSet(set.id, { name: 'Désert — mon set', setNumber: '31040-1' }, rev);
    await store.updateBuild(id, { label: 'Voiture rouge' }, rev + 1);
    await expect(store.updateSet(set.id, { name: 'Trop tard' }, rev)).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(store.updateSet(set.id, { name: '   ' }, rev + 2)).rejects.toMatchObject({ code: 'INVALID' });
    expect([await read('progress.json'), await read('mapping.json')]).toEqual([p0, m0]);
    const v = await store.view();
    expect(v.sets[0]).toMatchObject({ name: 'Désert — mon set', setNumber: '31040-1' });
    expect(v.sets[0]!.builds[0]).toMatchObject({ label: 'Voiture rouge', progress: { placed: 1 } });
    expect((await fs.readdir(path.join(dir, 'library', 'backups'))).length).toBeGreaterThanOrEqual(3);
  });

  it('removal needs confirmation and moves records to the trash; files stay', async () => {
    const { set, builds } = await addSync8Set();
    await store.putProgress(builds[0]!.id, progressFor(sha(SYNC8), ['notice-sync-8.mpd#0']), null);
    const rev = (await store.view()).revision;
    await expect(store.remove({ setId: set.id }, undefined, rev)).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
    const { trashedTo } = await store.remove({ setId: set.id }, true, rev);
    expect((await store.view()).sets).toEqual([]);
    expect(JSON.parse(await fs.readFile(path.join(trashedTo, builds[0]!.id, 'progress.json'), 'utf8')).payload.placedOccurrenceIds).toEqual(['notice-sync-8.mpd#0']);
    expect((await store.readVerified(sha(SYNC8))).bytes.equals(SYNC8)).toBe(true);
  });
});

describe('library: discovery of the existing data folder', () => {
  it('finds models, PDFs and mappings by fingerprint, adopts them in place without copying', async () => {
    await fs.mkdir(path.join(dir, 'models', '90007-1'), { recursive: true });
    await fs.mkdir(path.join(dir, 'instructions', '90007-1'), { recursive: true });
    await fs.mkdir(path.join(dir, 'mappings'), { recursive: true });
    await fs.writeFile(path.join(dir, 'models', '90007-1', 'notice-sync-8.mpd'), SYNC8);
    await fs.writeFile(path.join(dir, 'instructions', '90007-1', 'b.pdf'), PDF_B);
    await fs.writeFile(path.join(dir, 'instructions', '90007-1', 'a.pdf'), PDF_A);
    const m = sync8Mapping();
    const verified = { ...m, steps: m.steps.map((s) => ({ ...s, provenance: 'verified' as const })) };
    await fs.writeFile(path.join(dir, 'mappings', 'whatever-name.json'), serializeMapping(verified));
    await fs.writeFile(path.join(dir, 'mappings', 'other-model.json'), serializeMapping(sync8Mapping(PDF_A, 'e'.repeat(64))));
    const before = await fs.stat(path.join(dir, 'models', '90007-1', 'notice-sync-8.mpd'));

    const found = await discover(store);
    expect(found.sets).toHaveLength(1);
    const s = found.sets[0]!;
    expect(s).toMatchObject({ folder: '90007-1', setNumber: '90007-1' });
    expect(s.models[0]).toMatchObject({ occurrenceCount: 8, rootName: 'notice-sync-8.mpd', inLibrary: false, existingBuild: null });
    expect(s.pdfs.map((p) => p.name)).toEqual(['a.pdf', 'b.pdf']);
    expect(s.mappings.map((x) => [x.name, x.steps, x.verified])).toEqual([['whatever-name.json', 4, 4]]);

    await adopt(store, {
      setNumber: '90007-1', name: 'Découvert',
      models: [{ rel: s.models[0]!.rel, sha256: s.models[0]!.sha256, label: 'Modèle principal' }],
      pdfs: s.pdfs.map((p) => ({ rel: p.rel, sha256: p.sha256 })),
      mappings: [{ rel: s.mappings[0]!.rel, sha256: s.mappings[0]!.sha256, modelSha256: s.mappings[0]!.modelSha256 }],
    });
    const b = (await store.view()).sets[0]!.builds[0]!;
    expect(b.model.location).toBe('external');
    expect(b.modes).toEqual(['synced', 'guided', 'freeManual']);
    expect(b.mapping).toMatchObject({ verified: 4, valid: true });
    // nothing copied (no blob), nothing modified in the data folder
    await expect(fs.readdir(path.join(dir, 'library', 'blobs'))).rejects.toMatchObject({ code: 'ENOENT' });
    const after = await fs.stat(path.join(dir, 'models', '90007-1', 'notice-sync-8.mpd'));
    expect(after.mtimeMs).toBe(before.mtimeMs);
    const again = await discover(store);
    expect(again.sets[0]!.models[0]).toMatchObject({ inLibrary: true, existingBuild: { label: 'Modèle principal' } });
    // a file changed between detection and adoption is refused
    await fs.writeFile(path.join(dir, 'instructions', '90007-1', 'c.pdf'), PDF_A);
    await expect(store.registerExternal('pdf', 'instructions/90007-1/c.pdf', sha(PDF_B))).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('collection search and filters', () => {
  const b = (status: BuildView['status'], label = 'Modèle principal') => ({ status, label }) as BuildView;
  const sets = [
    { setNumber: '31040-1', name: 'Desert Racers', builds: [b('IN_PROGRESS')] },
    { setNumber: '31009-1', name: 'Small Cottage', builds: [b('NOT_STARTED')] },
    { setNumber: '10001', name: 'Éléphant', builds: [b('DONE'), b('DONE', 'Girafe')] },
  ];
  it('searches number, name (accents ignored) and build labels, and filters by status', () => {
    expect(filterSets(sets, '31040', 'ALL').map((s) => s.name)).toEqual(['Desert Racers']);
    expect(filterSets(sets, 'cottage', 'ALL').map((s) => s.setNumber)).toEqual(['31009-1']);
    expect(filterSets(sets, 'elephant', 'ALL')).toHaveLength(1);
    expect(filterSets(sets, 'girafe', 'DONE')).toHaveLength(1);
    expect(filterSets(sets, '', 'IN_PROGRESS').map((s) => s.setNumber)).toEqual(['31040-1']);
    expect(filterSets(sets, '', 'NOT_STARTED').map((s) => s.setNumber)).toEqual(['31009-1']);
    expect(filterSets(sets, '310', 'DONE')).toEqual([]);
  });
});

it('LibraryError carries an HTTP status', () => {
  expect(new LibraryError('CONFLICT', 'x').status).toBe(409);
  expect(new LibraryError('CORRUPT_INDEX', 'x').status).toBe(503);
});

describe('library: true free building', () => {
  const at = (x: number, y: number, z: number, q = 0): [number, ...number[]] => {
    const c = [1, 0, -1, 0][q]!, s = [0, 1, 0, -1][q]!;
    return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, x, y, z, 1];
  };
  const pieces = [
    { id: 'f1', partKey: '3001.dat', colorCode: '4', pose: at(412.5, -8, -260.25, 1) },
    { id: 'f2', partKey: '3001.dat', colorCode: '1', pose: at(80, 0, 0) },
  ] as never;

  it('free poses are saved, read back by a fresh store (server restart) and counted; v3 refused when it does not fit', async () => {
    const model = (await ingest('model', 'mini-4-pieces.mpd', MINI)).file;
    const { builds } = await store.createSet({ setNumber: '90120-1', name: 'Libre', builds: [{ label: 'Principal', modelFileId: model.sha256 }] });
    const buildId = builds[0]!.id;
    const progress = serializeProgress(model.sha256, 'mini-4-pieces.mpd', { mode: 'freeManual', placed: ['mini-4-pieces.mpd#3'], free: pieces }, 4);
    expect(progress.schemaVersion).toBe(3);
    await store.putProgress(buildId, progress, null);

    const fresh = new LibraryStore(dir);
    const rec = await fresh.readRecord(buildId, 'progress');
    expect(rec!.payload).toEqual(JSON.parse(JSON.stringify(progress)));
    const b = (await fresh.view()).sets[0]!.builds[0]!;
    // 1 on its target + f2 recognised at its place (blue at 80,0,0); f1 elsewhere
    expect(b.progress).toMatchObject({ placed: 3, free: 2, atModel: 2, mode: 'freeManual' });
    expect(b.status).toBe('IN_PROGRESS');

    // a red brick both on its target and free: stock exceeded, refused, nothing written
    const twice = { ...progress, placedOccurrenceIds: ['mini-4-pieces.mpd#0'] };
    await expect(fresh.putProgress(buildId, twice, rec!.revision)).rejects.toMatchObject({ code: 'INVALID' });
    expect((await fresh.readRecord(buildId, 'progress'))!.payload).toEqual(rec!.payload);
  });

  it('every piece at its place in the model: the build is done, even placed freely', async () => {
    const model = (await ingest('model', 'mini-4-pieces.mpd', MINI)).file;
    const { builds } = await store.createSet({ setNumber: '90121-1', name: 'Libre exact', builds: [{ label: 'Principal', modelFileId: model.sha256 }] });
    const all = [[0, 0, 0, '4'], [80, 0, 0, '1'], [0, -24, 0, '2'], [80, -24, 0, '14']] as const;
    const free = all.map(([x, y, z, c], i) => ({ id: `f${i + 1}`, partKey: '3001.dat', colorCode: c, pose: at(x, y, z) })) as never;
    await store.putProgress(builds[0]!.id, serializeProgress(model.sha256, 'mini-4-pieces.mpd', { mode: 'freeManual', placed: [], free }, 4), null);
    const b = (await store.view()).sets[0]!.builds[0]!;
    expect(b.progress).toMatchObject({ placed: 4, free: 4, atModel: 4 });
    expect(b.status).toBe('DONE');
  });
});

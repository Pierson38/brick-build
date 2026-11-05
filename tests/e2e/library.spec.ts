import { createHash } from 'node:crypto';
import { promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { analyzeModel } from '../../src/domain/import/analyze';
import { serializeProgress } from '../../src/domain/build/progress';
import { addBooklet, addStep, assignToStep, createMapping, mappingDigest, serializeMapping, type InstructionMapping } from '../../src/domain/instructions/mapping';
import { E2E_DATA_DIR } from '../../playwright.config';
import { makeTestPdf } from './make-test-pdf';

/**
 * P7 personal library on ORIGINAL fixtures, in an isolated data folder (E2E_DATA_DIR): add a set,
 * resume after closing the browser, duplicates, several booklets, mappings, alternative models,
 * P5/P6 browser saves, missing / modified files, unauthorised requests.
 */
const fixture = (rel: string) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));
const SYNC8 = fixture('tests/fixtures/notice-sync-8.mpd');
const SYNC8_BYTES = readFileSync(SYNC8);
const MINI = fixture('fixtures/mini-4-pieces.mpd');
const NESTED = fixture('fixtures/nested-submodel.mpd');
const PDF = makeTestPdf(3);
const PDF2 = makeTestPdf(5);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const id = (i: number) => `notice-sync-8.mpd#${i}`;
const POS: [number, number, number][] = [[0, 0, 0], [80, 0, 0], [0, 0, -40], [80, 0, -40], [0, -24, 0], [80, -24, 0], [0, -24, -40], [80, -24, -40]];
const COLOUR = ['4', '1', '14', '14', '2', '2', '15', '0'];
const W = { origin: 'http://127.0.0.1:3000', 'x-brick-lab': '1' };

const FOUR_STEPS = [[{ page: 2, printedStep: '1' }, [0, 1]], [{ page: 2, printedStep: '2' }, [2, 3]], [{ page: 3, printedStep: '3' }, [4, 5]], [{ page: 3, printedStep: '4' }, [6, 7]]] as const;
const TWO_STEPS = [[{ page: 2, printedStep: '1' }, [0, 1, 2, 3]], [{ page: 3, printedStep: '2' }, [4, 5, 6, 7]]] as const;

function mapping(modelSha = sha(SYNC8_BYTES), steps: typeof FOUR_STEPS | typeof TWO_STEPS = FOUR_STEPS): InstructionMapping {
  const a = analyzeModel(SYNC8_BYTES.toString('utf8'), 'notice-sync-8.mpd');
  let m = createMapping({ sha256: modelSha, fileName: 'notice-sync-8.mpd', rootName: a.model.rootName, occurrences: a.model.occurrences });
  m = addBooklet(m, { label: 'Livret 1', fileName: 'notice-test.pdf', sha256: sha(PDF), pageCount: 3 }).mapping;
  let last: string | null = null;
  for (const [init, occ] of steps) {
    const r = addStep(m, last, init);
    m = assignToStep(r.mapping, r.stepId, occ.map(id)).mapping;
    last = r.stepId;
  }
  return m;
}
const file = (name: string, buffer: Buffer, mimeType = 'application/octet-stream') => ({ name, mimeType, buffer });

async function dropAt(page: Page, i: number) {
  await page.getByTestId(`tray-3001.dat-${COLOUR[i]}`).click();
  await page.waitForTimeout(150);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const [x, y, z] = POS[i]!;
  const p = await page.evaluate((pt) => window.__brickLab!.project(pt), [x, y + 24, z] as [number, number, number]);
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await page.mouse.click(p.x, p.y);
}

async function library(request: APIRequestContext) {
  return (await (await request.get('/api/library')).json()) as { revision: number; dataDir: string; sets: { id: string; setNumber: string; name: string; builds: { id: string; label: string; progress: { placed: number; mode: string; revision: number } | null; modes: string[]; problems: string[] }[] }[] };
}

async function upload(request: APIRequestContext, kind: string, name: string, data: Buffer) {
  const r = await request.post(`/api/library/files?kind=${kind}&name=${encodeURIComponent(name)}`, { data, headers: { ...W, 'content-type': 'application/octet-stream' } });
  expect(r.ok(), await r.text()).toBe(true);
  return ((await r.json()) as { file: { sha256: string } }).file.sha256;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  // never run against a server that uses the real data folder
  const lib = await library(request);
  if (path.resolve(lib.dataDir) !== path.resolve(E2E_DATA_DIR)) throw new Error(`Serveur sur ${lib.dataDir}, attendu ${E2E_DATA_DIR} : arrête le serveur de développement avant les tests.`);
  await fs.rm(E2E_DATA_DIR, { recursive: true, force: true });
  await fs.mkdir(E2E_DATA_DIR, { recursive: true });
});

test('add a set with a model, two booklets and a mapping; incompatible mapping and duplicates are refused', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Ta collection est vide')).toBeVisible({ timeout: 60_000 }); // first compilation of the page in dev
  await page.getByTestId('add-set').click();
  await page.getByTestId('add-model-input').setInputFiles(SYNC8);
  await expect(page.getByTestId('add-model-row')).toContainText('8 pièces');
  await page.getByTestId('add-number').fill('90001-1');
  await page.getByTestId('add-name').fill('Maison de test');
  await page.getByTestId('add-pdf-input').setInputFiles([file('notice-test.pdf', PDF, 'application/pdf'), file('notice-test-2.pdf', PDF2, 'application/pdf')]);
  // the mapping of another model is refused before anything is sent
  await page.getByTestId('add-mapping-input').setInputFiles(file('autre.brick-mapping.json', Buffer.from(serializeMapping(mapping('e'.repeat(64)))), 'application/json'));
  await expect(page.getByTestId('add-mapping-status')).toContainText('concerne un autre modèle');
  await page.getByTestId('add-submit').click();
  await expect(page.getByTestId('add-error')).toContainText('incompatible');
  await page.getByTestId('add-mapping-input').setInputFiles(file('perso.brick-mapping.json', Buffer.from(serializeMapping(mapping())), 'application/json'));
  await expect(page.getByTestId('add-mapping-status')).toContainText('4 étape(s), 0 vérifiée(s), pour « Modèle principal »');
  await page.getByTestId('add-submit').click();
  const card = page.getByTestId('set-card-90001-1');
  await expect(card).toContainText('Maison de test');
  await expect(card).toContainText('8 pièces');
  await expect(card).toContainText('2 notices');
  await expect(card).toContainText('Correspondances ✓');
  await expect(card).toContainText('Notice synchronisée');
  await expect(card.getByTestId('status')).toHaveText('Jamais commencé');
  await expect(card.getByTestId('card-build')).toHaveText('Construire');
  // locally rendered thumbnail
  await expect(card.locator('img.thumb')).toBeVisible({ timeout: 30_000 });

  // the same model again: refused, pointing to the existing set
  await page.getByTestId('add-set').click();
  await page.getByTestId('add-model-input').setInputFiles({ name: 'copie.mpd', mimeType: 'text/plain', buffer: SYNC8_BYTES });
  await page.getByTestId('add-number').fill('90002-1');
  await page.getByTestId('add-name').fill('Copie');
  await page.getByTestId('add-submit').click();
  await expect(page.getByTestId('add-error')).toContainText('déjà dans ta collection : 90001-1 Maison de test');
  await expect(page.getByTestId('add-error').getByRole('link', { name: 'Ouvrir ce set' })).toBeVisible();
  await page.getByRole('button', { name: 'Annuler' }).click();
  // the PDFs were stored once each
  const blobs = (await fs.readdir(path.join(E2E_DATA_DIR, 'library', 'blobs'), { recursive: true })).filter((n) => String(n).endsWith('.pdf'));
  expect(blobs).toHaveLength(2);
});

test('synchronised build, back to the collection, browser closed, resumed with notice and page, without any import', async ({ page, browser }) => {
  await page.goto('/');
  await page.getByTestId('set-card-90001-1').getByTestId('card-build').click();
  await expect(page.getByTestId('render-status')).toContainText('Géométrie LDraw', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Commencer — notice synchronisée' }).click();
  // the booklet is open without any file selection
  await expect(page.getByTestId('pdf-page')).toHaveText('PDF p. 2 / 3', { timeout: 15_000 });
  for (const i of [0, 1, 2]) await dropAt(page, i);
  await expect(page.getByTestId('progress')).toHaveText('3/8 pièces posées');
  await expect(page.getByTestId('save-state')).toHaveText('Enregistré dans la bibliothèque');
  await page.getByTestId('back-to-collection').click();
  await expect(page.getByTestId('set-card-90001-1').getByTestId('card-progress')).toHaveText('3/8 pièces posées');
  await expect(page.getByTestId('set-card-90001-1').getByTestId('status')).toHaveText('En cours');
  await page.getByTestId('search').fill('maison');
  await page.getByRole('radio', { name: 'En cours' }).click();
  await expect(page.getByTestId('set-card-90001-1')).toBeVisible();
  await page.getByRole('radio', { name: 'Terminés' }).click();
  await expect(page.getByTestId('no-result')).toBeVisible();
  await page.close();

  // "close the browser and come back later": a new context has no storage of its own
  const context = await browser.newContext();
  const again = await context.newPage();
  await again.goto('/');
  await expect(again.getByTestId('set-card-90001-1').getByTestId('card-build')).toHaveText('Reprendre');
  await again.getByTestId('set-card-90001-1').getByTestId('card-build').click();
  await expect(again.getByTestId('message')).toContainText('Progression restaurée : 3/8 pièces posées.', { timeout: 30_000 });
  await expect(again.getByTestId('mode-select')).toHaveValue('synced');
  await expect(again.getByTestId('notice-step')).toHaveText('Notice : Étape 2, p. 2');
  await expect(again.getByTestId('pdf-page')).toHaveText('PDF p. 2 / 3');
  await expect(again.getByTestId('sync-missing-booklet')).toHaveCount(0);
  // finish step 2: the page turns by itself, the save follows
  await dropAt(again, 3);
  await expect(again.getByTestId('pdf-page')).toHaveText('PDF p. 3 / 3');
  await expect(again.getByTestId('save-state')).toHaveText('Enregistré dans la bibliothèque');
  await again.screenshot({ path: 'test-results/proof-p7-resumed.png' });
  await context.close();
});

test('two tabs on the same build: a page change is reconciled, a game change in the stale tab is refused', async ({ browser }) => {
  const context = await browser.newContext();
  const a = await context.newPage();
  const b = await context.newPage();
  await a.goto('/');
  const href = await a.getByTestId('set-card-90001-1').getByTestId('card-build').getAttribute('href');
  const buildId = href!.split('/').pop()!;
  // the library holds an outdated PDF page (the step is on p. 3): both tabs re-save the page on load
  const current = (await (await context.request.get(`/api/library/builds/${buildId}/progress`)).json()) as { revision: number; progress: Record<string, unknown> };
  const put = await context.request.put(`/api/library/builds/${buildId}/progress`, { data: { baseRevision: current.revision, progress: { ...current.progress, lastPdfPage: 2 } }, headers: W });
  expect(put.ok(), await put.text()).toBe(true);
  await Promise.all([a.goto(href!), b.goto(href!)]);
  await expect(a.getByTestId('progress')).toHaveText('4/8 pièces posées', { timeout: 30_000 });
  await expect(b.getByTestId('progress')).toHaveText('4/8 pièces posées', { timeout: 30_000 });
  await expect(a.getByTestId('pdf-page')).toHaveText('PDF p. 3 / 3');
  await expect(b.getByTestId('pdf-page')).toHaveText('PDF p. 3 / 3');
  await expect.poll(async () => ((await (await context.request.get(`/api/library/builds/${buildId}/progress`)).json()) as { progress: { lastPdfPage: number } }).progress.lastPdfPage).toBe(3);
  await a.waitForTimeout(500);
  // opening the same build twice is not a conflict
  await expect(a.getByTestId('save-conflict')).toHaveCount(0);
  await expect(b.getByTestId('save-conflict')).toHaveCount(0);
  await dropAt(a, 4);
  await expect(a.getByTestId('progress')).toHaveText('5/8 pièces posées');
  await expect.poll(async () => (await library(context.request)).sets[0]!.builds[0]!.progress!.placed).toBe(5);
  await expect(a.getByTestId('save-conflict')).toHaveCount(0);
  // the other tab still shows 4 bricks: its own move is refused, nothing is overwritten
  await dropAt(b, 4);
  await expect(b.getByTestId('save-conflict')).toContainText('enregistrée entre-temps');
  expect((await library(context.request)).sets[0]!.builds[0]!.progress!.placed).toBe(5);
  await context.close();
});

test('rename keeps the progress; booklets associated and dissociated from the detail page', async ({ page, request }) => {
  await page.goto('/');
  await page.getByTestId('set-card-90001-1').getByRole('link', { name: 'Détails' }).click();
  await page.getByTestId('detail-name').fill('Maison renommée');
  await page.getByTestId('detail-save-name').click();
  await expect(page.getByTestId('detail-message')).toContainText('progression et correspondances conservées');
  await expect(page.getByTestId('detail-progress')).toHaveText('5/8 pièces posées');
  await expect(page.getByTestId('detail-modes')).toContainText('✓ Notice synchronisée');
  // dissociating the mapped booklet removes the synchronised mode, explicitly
  const mapped = page.getByTestId('file-pdf').filter({ hasText: 'notice-test.pdf' });
  await mapped.getByRole('button', { name: 'Dissocier' }).click();
  await mapped.getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.getByTestId('detail-modes')).toContainText('notice attendue par les correspondances non associée');
  await expect(page.getByTestId('detail-mapping')).toContainText('✗ Livret « Livret 1 » non associé');
  await page.getByTestId('detail-add-pdf').setInputFiles(file('notice-test.pdf', PDF, 'application/pdf'));
  await expect(page.getByTestId('detail-modes')).toContainText('✓ Notice synchronisée');
  const lib = await library(request);
  expect(lib.sets[0]).toMatchObject({ name: 'Maison renommée', builds: [{ progress: { placed: 5, mode: 'synced' } }] });
});

test('mapping added later: valid one accepted, another model’s refused', async ({ page, request }) => {
  const model = await upload(request, 'model', 'nested-submodel.mpd', readFileSync(NESTED));
  const r = await request.post('/api/library/sets', { data: { setNumber: '90003-1', name: 'Sans correspondances', builds: [{ label: 'Principal', modelFileId: model }] }, headers: W });
  expect(r.status()).toBe(201);
  await page.goto('/');
  await page.getByTestId('set-card-90003-1').getByRole('link', { name: 'Détails' }).click();
  await expect(page.getByTestId('detail-modes')).toContainText('aucune correspondance');
  await page.getByTestId('detail-mapping-input').setInputFiles(file('x.json', Buffer.from(serializeMapping(mapping())), 'application/json'));
  await expect(page.getByTestId('detail-message')).toContainText('Import refusé : ces correspondances concernent un autre modèle');
  // the other set accepts its own mapping again (replacement kept in history)
  await page.goto('/');
  await page.getByTestId('set-card-90001-1').getByRole('link', { name: 'Détails' }).click();
  await page.getByTestId('detail-mapping-input').setInputFiles(file('perso.json', Buffer.from(serializeMapping(mapping())), 'application/json'));
  await expect(page.getByTestId('detail-message')).toContainText('La version précédente est gardée dans l’historique');
});

test('alternative models of one box are distinct builds with their own progress', async ({ page, request }) => {
  await page.goto('/');
  await page.getByTestId('set-card-90003-1').getByRole('link', { name: 'Détails' }).click();
  await page.getByPlaceholder('Nom (ex. Modèle B : buggy)').fill('Modèle B');
  await page.getByTestId('detail-add-build').setInputFiles(MINI);
  await expect(page.getByTestId('detail-message')).toContainText('Construction ajoutée');
  await expect(page.locator('.build-panel')).toHaveCount(2);
  const set = (await library(request)).sets.find((s) => s.setNumber === '90003-1')!;
  expect(set.builds.map((b) => b.label)).toEqual(['Principal', 'Modèle B']);
  await page.goto(`/atelier/${set.builds[1]!.id}`);
  await expect(page.getByTestId('render-status')).toContainText('Géométrie LDraw', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Commencer — mode guidé' }).click();
  await page.getByTestId('tray-3001.dat-4').click();
  await page.getByTestId('assist-place').click();
  await expect(page.getByTestId('progress')).toHaveText('1/4 pièces posées');
  await expect.poll(async () => (await library(request)).sets.find((s) => s.setNumber === '90003-1')!.builds.map((b) => b.progress?.placed ?? 0)).toEqual([0, 1]);
  await page.goto('/');
  await expect(page.getByTestId('set-card-90003-1')).toContainText('2 constructions');
  await expect(page.getByTestId('set-card-90003-1').getByTestId('card-build')).toHaveText('Reprendre « Modèle B »');
});

test('P5/P6 saves of this browser are taken over without being deleted', async ({ page, request }) => {
  const bytes = readFileSync(MINI);
  const modelSha = sha(bytes);
  // the P5 (schema v1) progress of mini-4-pieces, as P5 left it in localStorage
  // a model of this browser's P5 era (not yet in the collection) with its P5 (schema v1) progress
  await fs.mkdir(path.join(E2E_DATA_DIR, 'models', '90004-1'), { recursive: true });
  const variant = Buffer.from(bytes.toString('utf8').replace('0 Name: mini-4-pieces.mpd', '0 Name: mini-4-pieces.mpd\n0 // variante'));
  const variantSha = sha(variant);
  expect(variantSha).not.toBe(modelSha);
  await fs.writeFile(path.join(E2E_DATA_DIR, 'models', '90004-1', 'mini-4-pieces.mpd'), variant);
  const v1b = { schemaVersion: 1, modelContentHash: variantSha, displayName: 'mini-4-pieces.mpd', buildMode: 'guided', placedOccurrenceIds: ['mini-4-pieces.mpd#0', 'mini-4-pieces.mpd#1'], totalOccurrences: 4, updatedAtIso: '2026-11-03T10:00:00.000Z' };
  await page.goto('/');
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [`brick-lab:progress:${variantSha}`, JSON.stringify(v1b)] as const);
  await page.reload();
  await expect(page.getByTestId('legacy-saves')).toContainText('mini-4-pieces.mpd — 2/4 pièces : ajoute ce modèle à ta collection');
  const adopted = await request.post('/api/library/discover', { data: { setNumber: '90004-1', name: 'Ancienne partie', models: [{ rel: 'models/90004-1/mini-4-pieces.mpd', sha256: variantSha, label: 'Principal' }], pdfs: [], mappings: [] }, headers: W });
  expect(adopted.status(), await adopted.text()).toBe(201);
  await page.reload();
  await expect(page.getByTestId('legacy-saves')).toContainText('reprise automatiquement à l’ouverture du set correspondant');
  await page.getByTestId('set-card-90004-1').getByTestId('card-build').click();
  await expect(page.getByTestId('atelier-notes')).toContainText('Partie enregistrée dans ce navigateur reprise dans la bibliothèque (2/4 pièces');
  await expect(page.getByTestId('progress')).toHaveText('2/4 pièces posées');
  await expect(page.getByTestId('mode-select')).toHaveValue('guided');
  const lib = await library(request);
  expect(lib.sets.find((s) => s.setNumber === '90004-1')!.builds[0]!.progress).toMatchObject({ placed: 2, mode: 'guided' });
  expect(await page.evaluate((k) => localStorage.getItem(k), `brick-lab:progress:${variantSha}`)).toBe(JSON.stringify(v1b));
});

test('a modified or missing file blocks the build with a clear error and a repair path; nothing else is loaded', async ({ page, request }) => {
  const target = path.join(E2E_DATA_DIR, 'models', '90004-1', 'mini-4-pieces.mpd');
  const original = await fs.readFile(target);
  const buildId = (await library(request)).sets.find((s) => s.setNumber === '90004-1')!.builds[0]!.id;
  await fs.writeFile(target, original.toString('utf8').replace('1 4 0 0 0', '1 2 0 0 0'));
  await page.goto(`/atelier/${buildId}`);
  await expect(page.getByTestId('atelier-error')).toContainText('empreinte SHA-256 différente');
  await expect(page.getByTestId('atelier-error')).toContainText('aucun autre modèle ni aucune correspondance n’est utilisé');
  await expect(page.getByTestId('build-canvas')).toHaveCount(0);
  await page.getByRole('link', { name: 'Réparer depuis le détail du set' }).click();
  await expect(page.getByTestId('detail-problems')).toContainText('empreinte SHA-256 différente');
  await expect(page.getByTestId('detail-build')).toHaveCount(0);
  // a different file is never accepted as a repair
  await page.getByTestId(`repair-${sha(original).slice(0, 8)}`).setInputFiles(MINI);
  await expect(page.getByTestId('detail-message')).toContainText('n’est pas le fichier attendu');
  await fs.rm(target);
  await page.reload();
  await expect(page.getByTestId('file-state')).toHaveText('introuvable');
  // the original file chosen by the user repairs the build (verified copy in the library)
  await page.getByTestId(`repair-${sha(original).slice(0, 8)}`).setInputFiles(file('mini-4-pieces.mpd', original, 'text/plain'));
  await expect(page.getByTestId('detail-message')).toContainText('réparé');
  await expect(page.getByTestId('detail-build')).toHaveText('Reprendre');
  await page.getByTestId('detail-build').click();
  await expect(page.getByTestId('progress')).toHaveText('2/4 pièces posées', { timeout: 30_000 });
});

test('requests from other origins or hosts are refused; paths cannot be chosen by the client', async ({ request, page }) => {
  const evil = await request.post('/api/library/sets', { data: { setNumber: '1', name: 'x', builds: [] }, headers: { origin: 'http://evil.test', 'x-brick-lab': '1' } });
  expect(evil.status()).toBe(403);
  const noHeader = await request.post('/api/library/sets', { data: { setNumber: '1', name: 'x', builds: [] }, headers: { origin: 'http://127.0.0.1:3000' } });
  expect(noHeader.status()).toBe(403);
  const rebinding = await request.get('/api/library', { headers: { host: 'attacker.example:3000' } });
  expect(rebinding.status()).toBe(403);
  const traversal = await request.post('/api/library/discover', { data: { setNumber: '1', name: 'x', models: [{ rel: '../../../etc/hosts', sha256: 'a'.repeat(64), label: 'x' }], pdfs: [], mappings: [] }, headers: W });
  expect(traversal.status()).toBe(403);
  const outside = await request.post('/api/library/discover', { data: { setNumber: '1', name: 'x', models: [{ rel: 'library/library.json', sha256: 'a'.repeat(64), label: 'x' }], pdfs: [], mappings: [] }, headers: W });
  expect(outside.status()).toBe(403);
  const badFile = await request.get('/api/library/files/..%2F..%2Fetc%2Fpasswd');
  expect([404, 422]).toContain(badFile.status());
  // a page of another origin cannot write: the browser refuses the cross-origin preflight
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const frame = document.createElement('iframe');
    frame.sandbox.add('allow-scripts');
    frame.srcdoc = `<script>fetch('http://127.0.0.1:3000/api/library/sets',{method:'POST',headers:{'content-type':'application/json','x-brick-lab':'1'},body:'{}'}).then(r=>parent.postMessage('status '+r.status,'*'),e=>parent.postMessage('blocked','*'))</script>`;
    const msg = new Promise<string>((r) => window.addEventListener('message', (e) => r(String(e.data)), { once: true }));
    document.body.append(frame);
    return msg;
  });
  expect(result).toBe('blocked');
});

// ---- P5/P6 browser saves that DIFFER from the library's: never decided by date, never lost ----

/** A copy of the fixture with its own fingerprint (same occurrence ids), as its own set. */
async function variantSet(request: APIRequestContext, setNumber: string, tag: string) {
  const bytes = Buffer.from(SYNC8_BYTES.toString('utf8').replace('0 Name: notice-sync-8.mpd', `0 Name: notice-sync-8.mpd\n0 // ${tag}`));
  const modelSha = await upload(request, 'model', 'notice-sync-8.mpd', bytes);
  const r = await request.post('/api/library/sets', { data: { setNumber, name: tag, builds: [{ label: 'Principal', modelFileId: modelSha }] }, headers: W });
  expect(r.status(), await r.text()).toBe(201);
  const created = (await r.json()) as { set: { id: string }; builds: { id: string }[] };
  return { modelSha, setId: created.set.id, buildId: created.builds[0]!.id };
}
const progressOf = (modelSha: string, mode: 'guided' | 'freeManual' | 'synced', bricks: number[], at: Date, page?: number, digest?: string) =>
  serializeProgress(modelSha, 'notice-sync-8.mpd', { mode, placed: bricks.map(id) }, 8, page ? { page } : {}, digest, at);
async function putLibraryProgress(request: APIRequestContext, buildId: string, progress: unknown) {
  const r = await request.put(`/api/library/builds/${buildId}/progress`, { data: { baseRevision: null, progress }, headers: W });
  expect(r.ok(), await r.text()).toBe(true);
}
const historyOf = async (buildId: string) =>
  Promise.all((await fs.readdir(path.join(E2E_DATA_DIR, 'library', 'builds', buildId, 'history')).catch(() => [] as string[])).sort().map(async (n) => ({
    name: n, record: JSON.parse(await fs.readFile(path.join(E2E_DATA_DIR, 'library', 'builds', buildId, 'history', n), 'utf8')) as { payload: { placedOccurrenceIds?: string[]; steps?: unknown[] } },
  })));

test('an OLDER browser save that differs is offered; keeping the library keeps it; it is recovered later from the set page; nothing is lost', async ({ page, request }) => {
  const { modelSha, setId, buildId } = await variantSet(request, '90020-1', 'ancienne partie');
  // the library has the newer, larger build (like the 12/65 of the trial), the browser an older P6 save
  await putLibraryProgress(request, buildId, progressOf(modelSha, 'guided', [0, 1, 2, 3, 4, 5], new Date()));
  const old = progressOf(modelSha, 'freeManual', [0, 7], new Date('2026-11-01T10:00:00Z'), 2);
  await page.goto('/');
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [`brick-lab:progress:${modelSha}`, JSON.stringify(old)] as const);
  await expect(page.getByTestId('legacy-saves')).toContainText('comparer et récupérer dans le détail de 90020-1');

  await page.goto(`/atelier/${buildId}`);
  const choice = page.getByTestId('progress-choice');
  await expect(choice).toBeVisible({ timeout: 30_000 });
  await expect(choice.getByTestId('diff-Pièces posées')).toContainText('6/82/8');
  await expect(choice.getByTestId('diff-Pièces posées')).toHaveClass('differs');
  await expect(choice.getByTestId('diff-Mode')).toHaveClass('differs');
  await expect(choice.getByTestId('diff-Page de la notice')).toHaveClass('differs');
  await expect(choice).toContainText('5 pièce(s) posée(s) seulement ici');
  await expect(choice).toContainText('Enregistrée en dernier : la bibliothèque');
  await page.screenshot({ path: 'test-results/proof-p7-choice.png' });
  await choice.getByTestId('choice-library').click();
  await expect(page.getByTestId('progress')).toHaveText('6/8 pièces posées', { timeout: 30_000 });
  await expect(page.getByTestId('atelier-notes')).toContainText('Celle de ce navigateur est conservée');
  // not asked again for the same browser save, but still announced
  await page.reload();
  await expect(page.getByTestId('progress')).toHaveText('6/8 pièces posées', { timeout: 30_000 });
  await expect(page.getByTestId('progress-choice')).toHaveCount(0);
  await expect(page.getByTestId('atelier-notes')).toContainText('Une autre sauvegarde existe dans ce navigateur (2/8 pièces)');

  // explicit recovery from the set page, although it is older
  await page.goto(`/sets/${setId}`);
  const panel = page.getByTestId('browser-save');
  await expect(panel).toContainText('2/8');
  await panel.getByTestId('browser-save-take').click();
  await panel.getByTestId('browser-save-confirm').click();
  await expect(page.getByTestId('detail-message')).toContainText('Sauvegarde de ce navigateur reprise (2/8 pièces)');
  await expect(page.getByTestId('detail-progress')).toHaveText('2/8 pièces posées');
  await expect(page.getByTestId('browser-save')).toHaveCount(0);
  // the replaced library version (6 bricks) is in the history; the browser save is untouched
  expect((await historyOf(buildId)).some((h) => h.name.startsWith('progress-') && h.record.payload.placedOccurrenceIds?.length === 6)).toBe(true);
  expect(await page.evaluate((k) => localStorage.getItem(k), `brick-lab:progress:${modelSha}`)).toBe(JSON.stringify(old));
  // identical saves now: no question, the recovered mode and bricks are restored
  await page.goto(`/atelier/${buildId}`);
  await expect(page.getByTestId('progress')).toHaveText('2/8 pièces posées', { timeout: 30_000 });
  await expect(page.getByTestId('mode-select')).toHaveValue('freeManual');
  await expect(page.getByTestId('progress-choice')).toHaveCount(0);
});

test('a browser save played with another mapping: the difference is shown, its mapping can be taken with it, the library one is kept in history', async ({ page, request }) => {
  const { modelSha, buildId } = await variantSet(request, '90021-1', 'autre mapping');
  const libMapping = mapping(modelSha, FOUR_STEPS);
  const navMapping = mapping(modelSha, TWO_STEPS);
  const r = await request.put(`/api/library/builds/${buildId}/mapping`, { data: { baseRevision: null, text: serializeMapping(libMapping), source: 'import' }, headers: W });
  expect(r.ok(), await r.text()).toBe(true);
  await putLibraryProgress(request, buildId, progressOf(modelSha, 'synced', [0], new Date(), 2, mappingDigest(libMapping)));
  const nav = progressOf(modelSha, 'synced', [0, 1, 2], new Date('2026-11-02T10:00:00Z'), 2, mappingDigest(navMapping));
  await page.goto('/');
  await page.evaluate(([kp, vp, km, vm]) => { localStorage.setItem(kp, vp); localStorage.setItem(km, vm); },
    [`brick-lab:progress:${modelSha}`, JSON.stringify(nav), `brick-lab:mapping:${modelSha}`, serializeMapping(navMapping)] as const);
  await page.goto(`/atelier/${buildId}`);
  const choice = page.getByTestId('progress-choice');
  await expect(choice).toBeVisible({ timeout: 30_000 });
  await expect(choice.getByTestId('diff-Correspondances jouées')).toHaveClass('differs');
  await expect(choice.getByTestId('diff-Mode')).not.toHaveClass('differs');
  await expect(choice.getByTestId('choice-with-mapping')).toBeChecked();
  await choice.getByTestId('choice-browser').click();
  await expect(page.getByTestId('progress')).toHaveText('3/8 pièces posées', { timeout: 30_000 });
  await expect(page.getByTestId('mode-select')).toHaveValue('synced');
  await expect(page.getByTestId('notice-step')).toHaveText('Notice : Étape 1, p. 2');
  const stored = (await (await request.get(`/api/library/builds/${buildId}/mapping`)).json()) as { mapping: { steps: unknown[] } };
  expect(stored.mapping.steps).toHaveLength(2);
  const history = await historyOf(buildId);
  expect(history.some((h) => h.name.startsWith('mapping-') && h.record.payload.steps?.length === 4)).toBe(true);
  expect(history.some((h) => h.name.startsWith('progress-') && h.record.payload.placedOccurrenceIds?.length === 1)).toBe(true);
});

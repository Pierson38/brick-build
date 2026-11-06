import { createHash } from 'node:crypto';
import { promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { analyzeModel } from '../../src/domain/import/analyze';
import { addBooklet, addStep, assignToStep, createMapping, serializeMapping, updateStep } from '../../src/domain/instructions/mapping';
import { E2E_DATA_DIR, E2E_NET_FIXTURES } from '../../playwright.config';
import { makeTestPdf } from './make-test-pdf';

/**
 * P8 "Ajouter un set" on ORIGINAL fixtures, in the isolated data folder. The OMR is SIMULATED
 * (E2E_NET_FIXTURES: synthetic set pages and files): the suite never contacts a third-party site.
 * Search → resources → compatibility → confirmation → construction → collection → resume.
 */
const fixture = (rel: string) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));
const SYNC8 = readFileSync(fixture('tests/fixtures/notice-sync-8.mpd'));
const TRIO = fixture('tests/fixtures/p8-trio.mpd');
const MINI = readFileSync(fixture('fixtures/mini-4-pieces.mpd'));
const PDF = makeTestPdf(3);
const PDF2 = makeTestPdf(5);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const file = (name: string, buffer: Buffer, mimeType = 'application/octet-stream') => ({ name, mimeType, buffer });
const OMR = 'https://library.ldraw.org';

function mapping() {
  const a = analyzeModel(SYNC8.toString('utf8'), 'notice-sync-8.mpd');
  let m = createMapping({ sha256: sha(SYNC8), fileName: '90020-1.mpd', rootName: a.model.rootName, occurrences: a.model.occurrences });
  m = addBooklet(m, { label: 'Livret 1', fileName: 'notice.pdf', sha256: sha(PDF), pageCount: 3 }).mapping;
  let last: string | null = null;
  for (const [page, ids] of [[2, [0, 1, 2, 3]], [3, [4, 5, 6, 7]]] as const) {
    const r = addStep(m, last, { page, printedStep: String(page - 1) });
    m = updateStep(assignToStep(r.mapping, r.stepId, ids.map((i) => `notice-sync-8.mpd#${i}`)).mapping, r.stepId, { provenance: 'verified' });
    last = r.stepId;
  }
  return Buffer.from(serializeMapping(m));
}

/** Synthetic page with the structure of an OMR set page. */
const omrPage = (n: string, name: string, files: [number, string, string][]) => `<html><head><title>LDraw.org Official Model Repository - ${name} | LDraw.org Library</title></head>
<body><main><div>${n} - ${name}</div><div>Models</div>${files.map(([id, f, kind]) => `<div><div> ${kind} </div><div><span>Author:</span>Auteur de test [test]</div>
<a href="${OMR}/media/omr_models/${id}/${f}?v=1">Download</a></div>`).join('')}</main></body></html>`;

const POS: [number, number, number][] = [[0, 0, 0], [80, 0, 0], [0, 0, -40], [80, 0, -40]];
const COLOUR = ['4', '1', '14', '14'];
async function dropAt(page: Page, i: number) {
  await page.getByTestId(`tray-3001.dat-${COLOUR[i]}`).click();
  await page.waitForTimeout(150);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const [x, y, z] = POS[i]!;
  const p = await page.evaluate((pt) => window.__brickLab!.project(pt), [x, y + 24, z] as [number, number, number]);
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await page.mouse.click(p.x, p.y);
}

type Lib = { dataDir: string; sets: { id: string; setNumber: string; name: string; builds: { id: string; label: string; modes: string[]; progress: { placed: number } | null }[] }[] };
const library = async (request: APIRequestContext) => (await (await request.get('/api/library')).json()) as Lib;
const index = async () => JSON.parse(await fs.readFile(path.join(E2E_DATA_DIR, 'library', 'library.json'), 'utf8')) as { files: Record<string, { originalName: string; provenance?: Record<string, string> }> };

async function search(page: Page, n: string) {
  await page.goto('/ajouter');
  await page.getByTestId('search-number').fill(n);
  await page.getByTestId('search-submit').click();
  await expect(page.getByTestId('sources')).toBeVisible({ timeout: 60_000 });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  const lib = await library(request);
  if (path.resolve(lib.dataDir) !== path.resolve(E2E_DATA_DIR)) throw new Error(`Serveur sur ${lib.dataDir}, attendu ${E2E_DATA_DIR} : arrête le serveur de développement avant les tests.`);
  await fs.rm(E2E_DATA_DIR, { recursive: true, force: true });
  await fs.mkdir(E2E_DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(E2E_DATA_DIR, 'omr-not-ldraw.mpd'), '<html>not a model</html>');
  await fs.writeFile(E2E_NET_FIXTURES, JSON.stringify({
    [`${OMR}/omr/set/90020-1`]: { status: 200, body: omrPage('90020-1', 'Test Racers', [[7002, '90020-1_Tower.mpd', 'Alternate Model'], [7001, '90020-1.mpd', 'Main Model']]) },
    [`${OMR}/media/omr_models/7001/90020-1.mpd`]: { status: 200, bodyFile: fixture('tests/fixtures/notice-sync-8.mpd') },
    [`${OMR}/media/omr_models/7002/90020-1_Tower.mpd`]: { status: 200, bodyFile: TRIO },
    [`${OMR}/omr/set/90021-1`]: { status: 404, body: 'Not Found' },
    [`${OMR}/omr/set/90022-1`]: { status: 503, body: 'down' },
    [`${OMR}/omr/set/90023-1`]: { status: 200, body: omrPage('90023-1', 'Broken', [[7003, '90023-1.mpd', 'Main Model'], [7004, '90023-1_Bad.mpd', 'Alternate Model']]) },
    [`${OMR}/media/omr_models/7003/90023-1.mpd`]: { status: 0, error: 'ECONNRESET' },
    [`${OMR}/media/omr_models/7004/90023-1_Bad.mpd`]: { status: 200, bodyFile: path.join(E2E_DATA_DIR, 'omr-not-ldraw.mpd') },
  }));
});

test('search: invalid number, then nothing anywhere for this number', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('add-set').click();
  await expect(page.getByTestId('search-number')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('search-number').fill('31040; rm');
  await page.getByTestId('search-submit').click();
  await expect(page.getByTestId('add-errors')).toContainText('n’est pas un numéro de set');
  await page.getByTestId('search-number').fill('90021');
  await expect(page.getByTestId('variant-note')).toContainText('Lu comme 90021-1 (variante -1 supposée');
  await page.getByTestId('search-submit').click();
  await expect(page.getByTestId('source-local')).toContainText('rien pour ce numéro');
  await expect(page.getByTestId('lego-link')).toHaveAttribute('href', 'https://www.lego.com/fr-fr/service/building-instructions/90021');
  await expect(page.getByTestId('source-lego')).toContainText('Notice disponible sur LEGO.com, mais téléchargement manuel nécessaire');
  await page.getByTestId('search-online').click();
  await expect(page.getByTestId('omr-status')).toHaveText('Aucun modèle 3D trouvé pour ce set sur l’OMR.');
  await expect(page.getByTestId('nothing-found')).toContainText('Aucun modèle 3D trouvé pour ce set.');
  await expect(page.getByTestId('source-rebrickable')).toContainText('Rebrickable non configuré');
});

test('OMR main + alternate downloaded on click, booklets and mapping dropped, synchronised mode, build, resume without import', async ({ page, browser, request }) => {
  await search(page, '90020');
  await page.getByTestId('search-online').click();
  await expect(page.getByTestId('omr-status')).toHaveText('2 modèle(s) 3D sur l’OMR, dont 1 alternatif(s).');
  await page.getByTestId('omr-download-90020-1.mpd').click();
  await expect(page.getByTestId('model-card')).toHaveCount(1);
  await page.getByTestId('omr-download-90020-1_Tower.mpd').click();
  await expect(page.getByTestId('model-card')).toHaveCount(2);
  // main model first; the alternate file is named after its OMR name; the unused model of that file is proposed, not checked
  await expect(page.getByTestId('build-label').nth(0)).toHaveValue('Modèle principal');
  await expect(page.getByTestId('build-label').nth(1)).toHaveValue('Tower');
  await expect(page.getByTestId('build-check')).toHaveCount(3);
  await expect(page.getByTestId('build-check').nth(2)).not.toBeChecked();
  await expect(page.getByTestId('model-card').nth(0)).toContainText('téléchargé depuis l’OMR');
  await expect(page.getByTestId('model-card').nth(0)).toContainText('Licence : CC0-1.0');
  // the booklets downloaded by hand from LEGO.com and the mapping, dropped at once
  await page.getByTestId('quick-input').setInputFiles([file('notice.pdf', PDF, 'application/pdf'), file('notice-2.pdf', PDF2, 'application/pdf'), file('90020-1.brick-mapping.json', mapping(), 'application/json')]);
  await expect(page.getByTestId('pdf-row')).toHaveCount(2);
  await expect(page.getByTestId('pdf-row').nth(0)).toContainText('3 pages');
  await expect(page.getByTestId('pdf-row').nth(1)).toContainText('5 pages');
  await expect(page.getByTestId('resources')).toContainText('Plusieurs constructions');
  // the booklet named by the mapping is associated with the main build only; nothing is associated by guess with the alternate
  await expect(page.getByTestId('pdf-row').nth(0)).toContainText('Modèle principal (liée par les correspondances)');
  await expect(page.getByTestId('pdf-row').nth(1).getByTestId('pdf-assoc').nth(0)).not.toBeChecked();
  await expect(page.getByTestId('mapping-90020-1.brick-mapping.json')).toBeChecked();
  const compat = page.getByTestId('compat-card');
  await expect(compat).toHaveCount(2);
  await expect(compat.nth(0).getByTestId('compat-headline')).toHaveText('Notice synchronisée disponible.');
  await expect(compat.nth(1).getByTestId('compat-headline')).toHaveText('Modèle prêt pour le montage guidé.');
  await expect(compat.nth(1)).not.toContainText('Notice synchronisée disponible');
  await expect(page.getByTestId('confirm-name')).toHaveValue('Test Racers');
  await page.getByTestId('import-submit').click();
  await expect(page.getByTestId('import-done')).toContainText('Ajouté à ta collection');
  await expect(page.getByTestId('import-done')).toContainText('4 fichier(s) ajouté(s)');
  const files = Object.values((await index()).files);
  expect(files.find((f) => f.originalName === '90020-1.mpd')?.provenance).toMatchObject({ source: 'omr', url: `${OMR}/media/omr_models/7001/90020-1.mpd`, pageUrl: `${OMR}/omr/set/90020-1`, license: 'CC0-1.0' });

  // build a few bricks in synchronised mode, straight from the confirmation
  await page.getByTestId('import-build').first().click();
  await expect(page.getByTestId('render-status')).toContainText('Géométrie LDraw', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Commencer — notice synchronisée' }).click();
  await expect(page.getByTestId('pdf-page')).toHaveText('PDF p. 2 / 3', { timeout: 15_000 });
  for (const i of [0, 1]) await dropAt(page, i);
  await expect(page.getByTestId('progress')).toHaveText('2/8 pièces posées');
  await expect(page.getByTestId('save-state')).toHaveText('Enregistré dans la bibliothèque');
  await page.getByTestId('back-to-collection').click();
  const card = page.getByTestId('set-card-90020-1');
  await expect(card).toContainText('2 constructions');
  await expect(card.getByTestId('card-progress')).toHaveText('2/8 pièces posées');
  await page.close();
  // later, another browser session: resumed from the collection, nothing imported again
  const context = await browser.newContext();
  const again = await context.newPage();
  await again.goto('/');
  await again.getByTestId('set-card-90020-1').getByTestId('card-build').click();
  await expect(again.getByTestId('message')).toContainText('Progression restaurée : 2/8 pièces posées.', { timeout: 30_000 });
  await expect(again.getByTestId('mode-select')).toHaveValue('synced');
  await again.screenshot({ path: 'test-results/proof-p8-resumed.png' });
  await context.close();
  expect((await library(request)).sets).toHaveLength(1);
});

test('the same set again: already in the collection, nothing duplicated, an alternative build is added without touching the progress', async ({ page, request }) => {
  await search(page, '90020-1');
  await page.getByTestId('search-online').click();
  await page.getByTestId('omr-download-90020-1.mpd').click();
  await expect(page.getByTestId('already-in-collection')).toContainText('Ce modèle existe déjà dans ta collection : 90020-1 Test Racers — « Modèle principal »');
  await expect(page.getByTestId('build-check').first()).toBeDisabled();
  await expect(page.getByTestId('existing-set')).toContainText('Ce set est déjà dans ta collection : 90020-1 « Test Racers » (2 constructions)');
  await expect(page.getByTestId('target-existing')).toBeChecked();
  await page.getByTestId('quick-input').setInputFiles(file('mini-alt.mpd', MINI, 'text/plain'));
  await expect(page.getByTestId('import-submit')).toHaveText('Ajouter 1 construction(s) à 90020-1');
  await page.getByTestId('import-submit').click();
  await expect(page.getByTestId('import-done')).toContainText('Ajouté à ta collection');
  const lib = await library(request);
  expect(lib.sets).toHaveLength(1);
  expect(lib.sets[0]!.builds.map((b) => [b.label, b.progress?.placed ?? 0])).toEqual([['Modèle principal', 2], ['Tower', 0], ['Modèle C', 0]]);
  expect(lib.sets[0]!.builds[0]!.modes).toEqual(['synced', 'guided', 'freeManual']);
});

test('source unavailable, interrupted download, invalid files, booklets without a model', async ({ page }) => {
  await search(page, '90022');
  await page.getByTestId('search-online').click();
  await expect(page.getByTestId('omr-status')).toContainText('OMR indisponible : L’OMR a répondu 503.');
  await expect(page.getByTestId('source-omr').getByRole('link', { name: 'Ouvrir la page de l’OMR ↗' })).toHaveAttribute('href', `${OMR}/omr/set/90022-1`);

  await search(page, '90023');
  await page.getByTestId('search-online').click();
  await page.getByTestId('omr-download-90023-1.mpd').click();
  await expect(page.getByTestId('add-errors')).toContainText('Téléchargement impossible');
  await page.getByTestId('omr-download-90023-1_Bad.mpd').click();
  await expect(page.getByTestId('add-errors')).toContainText('Modèle inutilisable');
  await expect(page.getByTestId('model-card')).toHaveCount(0);

  // quick import: an unsupported file and a fake PDF are refused, the real booklet is kept; no model → nothing to build
  await page.getByTestId('quick-input').setInputFiles([file('lisez-moi.txt', Buffer.from('x'), 'text/plain'), file('faux.pdf', Buffer.from('pas un pdf'), 'application/pdf'), file('notice.pdf', PDF, 'application/pdf')]);
  await expect(page.getByTestId('add-errors')).toContainText('lisez-moi.txt : format non pris en charge');
  await expect(page.getByTestId('add-errors')).toContainText('faux.pdf : Ce fichier n’est pas un PDF.');
  await expect(page.getByTestId('pdf-row')).toHaveCount(1);
  await expect(page.getByTestId('no-model')).toContainText('Aucun modèle 3D trouvé pour ce set.');
  await expect(page.getByTestId('pdf-only')).toContainText('Notice trouvée sans modèle 3D : pas de construction interactive disponible.');
  await expect(page.getByTestId('import-submit')).toHaveCount(0);
});

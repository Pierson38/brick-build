/**
 * Reference screenshots of the UI redesign (before / after): every key screen and state, with the
 * ORIGINAL fixtures only (CC0) and a generated PDF — safe to commit, nothing leaves 127.0.0.1.
 *
 *   npx tsx REFONTE/scripts/captures.ts <baseUrl> <outDir> <dataDir>             # normal server
 *   npx tsx REFONTE/scripts/captures.ts <baseUrl> <outDir> <dataDir> --degraded  # server started
 *       with LDRAW_LIBRARY_DIR= and BRICK_LAB_ONLINE=0, on the data folder of the first run
 *
 * The server must be `next dev` (test hooks) with BRICK_LAB_DATA_DIR=<dataDir>, an EMPTY folder for
 * the normal run. The "Chercher en ligne" button is never clicked: no request to the OMR.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';
import { analyzeModel } from '../../src/domain/import/analyze';
import { addBooklet, addStep, assignToStep, createMapping, serializeMapping } from '../../src/domain/instructions/mapping';
import { makeTestPdf } from '../../tests/e2e/make-test-pdf';

const [baseUrl, outDir, dataDir, flag] = process.argv.slice(2);
if (!baseUrl || !outDir || !dataDir) throw new Error('usage: captures.ts <baseUrl> <outDir> <dataDir> [--degraded]');
const degraded = flag === '--degraded';
mkdirSync(outDir, { recursive: true });

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel: string) => readFileSync(path.join(root, rel));
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const MINI = read('fixtures/mini-4-pieces.mpd');
const NO_STEPS = read('fixtures/no-steps.ldr');
const SYNC = read('tests/fixtures/notice-sync-8.mpd');
const PDF = makeTestPdf(3);
// same bricks, another fingerprint: not already in the collection once mini-4-pieces is added
const DISCOVERED = Buffer.from(MINI.toString('utf8').replace(/\n/, '\n0 Copie rangée dans le dossier de données\n'));
const MISSING = Buffer.from('0 FILE piece-absente.ldr\n0 Modèle avec une pièce absente\n1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat\n1 1 0 -24 0 1 0 0 0 1 0 0 0 1 not-a-real-part-9999.dat\n');

/** The mapping a user would have entered for notice-sync-8 (same as the P6 E2E suite). */
function syncMapping(): Buffer {
  const a = analyzeModel(SYNC.toString('utf8'), 'notice-sync-8.mpd');
  const id = (i: number) => `notice-sync-8.mpd#${i}`;
  let m = createMapping({ sha256: sha(SYNC), fileName: 'notice-sync-8.mpd', rootName: a.model.rootName, occurrences: a.model.occurrences });
  m = addBooklet(m, { label: 'Livret 1', fileName: 'notice-test.pdf', sha256: sha(PDF), pageCount: 3 }).mapping;
  let last: string | null = null;
  for (const [init, occ] of [[{ page: 2, printedStep: '1' }, [0, 1]], [{ page: 2, printedStep: '2', repeat: 2 }, [2, 3]], [{ page: 3, printedStep: '3', callout: '1' }, [4]], [{ page: 3, printedStep: '3' }, [5, 6, 7]]] as const) {
    const r = addStep(m, last, init);
    m = assignToStep(r.mapping, r.stepId, occ.map(id)).mapping;
    last = r.stepId;
  }
  return Buffer.from(serializeMapping(m));
}

const file = (name: string, buffer: Buffer, mimeType = 'text/plain') => ({ name, mimeType, buffer });
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
const shots: string[] = [];

async function shot(page: Page, name: string, fullPage = false) {
  await page.waitForTimeout(400);
  const target = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: target, fullPage });
  shots.push(name);
  console.log('✓', name);
}
async function settle(page: Page) {
  await page.waitForTimeout(250);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
const rendered = (page: Page) => page.getByTestId('render-status').waitFor({ timeout: 120_000 });
const canvasCentre = async (page: Page) => {
  const box = (await page.getByTestId('build-canvas').boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height * 0.6 };
};

/** Picks the first tray item and places it with the explicit assisted-placement button. */
async function assistPlaceOne(page: Page) {
  await page.locator('.tray-item').first().click();
  const c = await canvasCentre(page);
  await page.mouse.move(c.x, c.y);
  await settle(page);
  await page.getByTestId('assist-place').click();
  await settle(page);
}

async function addSet(page: Page, number: string, name: string, files: ReturnType<typeof file>[]) {
  await page.goto(`${baseUrl}/ajouter`);
  await page.getByTestId('search-number').fill(number);
  await page.getByTestId('quick-input').setInputFiles(files);
  await page.getByTestId('compat-card').first().waitFor({ timeout: 60_000 });
  await page.getByTestId('confirm-name').fill(name);
  await page.getByTestId('import-submit').click();
  await page.getByTestId('import-done').waitFor({ timeout: 60_000 });
}

async function normalRun() {
  // a set already present in the data folder, not in the collection (discovery)
  mkdirSync(path.join(dataDir, 'models', '90009-1'), { recursive: true });
  writeFileSync(path.join(dataDir, 'models', '90009-1', 'mini-4-pieces.mpd'), DISCOVERED);

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  // ---- collection: empty (discovery panel), discovery opened
  await page.goto(baseUrl);
  await page.getByTestId('discovery').waitFor();
  await shot(page, '01-collection-vide');
  await page.getByTestId('discovery').getByRole('button').first().click();
  await shot(page, '02-collection-detection-dossier', true);

  // ---- add a set: empty, local search, files + compatibility, done
  await page.goto(`${baseUrl}/ajouter`);
  await shot(page, '03-ajouter-vide');
  await page.getByTestId('search-number').fill('90001');
  await page.getByTestId('search-submit').click();
  await page.getByTestId('sources').waitFor();
  await shot(page, '04-ajouter-recherche-locale', true);
  await page.getByTestId('quick-input').setInputFiles([file('notice-sync-8.mpd', SYNC), file('notice-test.pdf', PDF, 'application/pdf'), file('maison.brick-mapping.json', syncMapping(), 'application/json')]);
  await page.getByTestId('compat-card').first().waitFor({ timeout: 60_000 });
  await page.getByTestId('confirm-name').fill('Maison de test');
  await shot(page, '05-ajouter-fichiers-compatibilite', true);
  await page.getByTestId('import-submit').click();
  await page.getByTestId('import-done').waitFor({ timeout: 60_000 });
  await shot(page, '06-ajouter-termine');

  await addSet(page, '90002', 'Mini 4 pièces', [file('mini-4-pieces.mpd', MINI)]);
  await addSet(page, '90003', 'Sans étapes', [file('no-steps.ldr', NO_STEPS)]);
  await page.goto(baseUrl);
  await page.getByTestId('discovery').getByRole('button').first().click();
  await page.getByTestId('discovered-90009-1').getByTestId('discovered-name').fill('Copie du dossier de données');
  await page.getByTestId('discovered-add').click();
  await page.getByTestId('set-card-90009-1').waitFor();

  // ---- guided build on 90002 (library), from the collection
  await page.getByTestId('set-card-90002-1').getByTestId('card-build').click();
  await rendered(page);
  await shot(page, '07-atelier-diagnostic-guide');
  await page.getByRole('button', { name: 'Commencer — mode guidé' }).click();
  await page.locator('.tray-item').first().click();
  const c = await canvasCentre(page);
  await page.mouse.move(c.x, c.y);
  await settle(page);
  await shot(page, '08-atelier-guide-piece-en-main');
  await page.getByTestId('assist-place').click();
  await settle(page);
  await shot(page, '09-atelier-guide-en-cours');
  await page.getByRole('button', { name: 'Abandonner' }).click();
  await shot(page, '10-atelier-confirmation-abandon');
  await page.getByRole('button', { name: 'Annuler', exact: true }).last().click();
  for (let i = 0; i < 3; i++) await assistPlaceOne(page);
  await shot(page, '11-atelier-guide-termine');

  // ---- synchronised mode, editor, free mode on 90001
  await page.goto(baseUrl);
  await page.getByTestId('set-card-90001-1').getByTestId('card-build').click();
  await rendered(page);
  await shot(page, '12-atelier-diagnostic-synchro');
  await page.getByRole('button', { name: 'Commencer — notice synchronisée' }).click();
  await page.getByTestId('pdf-canvas').waitFor();
  await assistPlaceOne(page);
  await shot(page, '13-atelier-synchronise');
  await page.getByRole('tab', { name: 'Correspondances' }).click();
  await page.getByTestId('mapping-status').waitFor();
  await shot(page, '14-atelier-editeur-correspondances');
  await page.getByRole('button', { name: 'Terminer l’édition' }).click();
  await page.getByTestId('mode-select').selectOption('freeManual');
  await page.locator('.tray-item').first().click();
  const f = await canvasCentre(page);
  await page.mouse.move(f.x + 60, f.y + 40);
  await settle(page);
  await shot(page, '15-atelier-libre-piece-en-main');
  await page.mouse.click(f.x + 60, f.y + 40);
  await settle(page);
  const free = await page.evaluate(() => window.__brickLabGame!.freePieces());
  const pose = free.at(-1)!.pose;
  const p = await page.evaluate((pt) => window.__brickLab!.project(pt), [pose[12]! + 10, pose[13]!, pose[14]! + 5] as [number, number, number]);
  await page.mouse.click(p.x, p.y);
  await page.getByTestId('selection-info').waitFor();
  await settle(page);
  await shot(page, '16-atelier-libre-selection-gizmo');
  await page.setViewportSize({ width: 1024, height: 768 });
  await settle(page);
  await shot(page, '17-atelier-libre-selection-1024');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('tab', { name: 'Modèle' }).click();
  await page.keyboard.press('Escape');

  // ---- collection with sets (thumbnails), set detail
  await page.goto(baseUrl);
  await page.waitForFunction(() => document.querySelectorAll('img.thumb').length >= 3, null, { timeout: 60_000 }).catch(() => undefined);
  await shot(page, '18-collection', true);
  await page.setViewportSize({ width: 1024, height: 768 });
  await shot(page, '19-collection-1024');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByTestId('set-card-90001-1').getByRole('link', { name: 'Détails' }).click();
  await page.locator('.build-panel').waitFor();
  await shot(page, '20-detail-set', true);

  // ---- standalone atelier: home, no steps, missing part, notice PDF
  await page.goto(`${baseUrl}/atelier`);
  await shot(page, '21-atelier-autonome-accueil');
  await page.locator('input[type=file][accept=".ldr,.mpd"]').first().setInputFiles(file('no-steps.ldr', NO_STEPS));
  await rendered(page);
  await shot(page, '22-atelier-sans-etapes');
  await page.locator('aside input[type=file][accept=".ldr,.mpd"]').setInputFiles(file('piece-absente.ldr', MISSING));
  await page.getByTestId('missing-parts').waitFor({ timeout: 60_000 });
  await shot(page, '23-atelier-piece-absente');
  await page.locator('aside input[type=file][accept=".ldr,.mpd"]').setInputFiles(file('mini-4-pieces.mpd', MINI));
  await rendered(page);
  await page.getByRole('button', { name: 'Montage libre (avec notice)' }).click();
  await page.getByRole('tab', { name: 'Notice PDF' }).click();
  await shot(page, '24-atelier-notice-vide');
  await page.getByTestId('pdf-input').setInputFiles(file('notice-test.pdf', PDF, 'application/pdf'));
  await page.getByTestId('pdf-canvas').waitFor();
  await page.waitForTimeout(1500);
  await shot(page, '25-atelier-libre-notice-pdf');

  // ---- broken file: the build cannot open, the detail page offers the repair
  const target = path.join(dataDir, 'models', '90009-1', 'mini-4-pieces.mpd');
  await page.goto(baseUrl);
  const href = await page.getByTestId('set-card-90009-1').getByTestId('card-build').getAttribute('href');
  writeFileSync(target, DISCOVERED.toString('utf8').replace('1 4 0 0 0', '1 2 0 0 0'));
  await page.goto(`${baseUrl}${href}`);
  await page.getByTestId('atelier-error').waitFor({ timeout: 60_000 });
  await shot(page, '26-atelier-erreur-fichier-modifie');
  await page.getByRole('link', { name: 'Réparer depuis le détail du set' }).click();
  await page.getByTestId('detail-problems').waitFor();
  await shot(page, '27-detail-fichier-modifie', true);
  writeFileSync(target, DISCOVERED);

  await page.close();
  return errors;
}

async function degradedRun() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${baseUrl}/atelier`);
  await page.locator('input[type=file][accept=".ldr,.mpd"]').first().setInputFiles(file('mini-4-pieces.mpd', MINI));
  await page.getByText('Rendu indisponible').first().waitFor({ timeout: 60_000 });
  await shot(page, '28-atelier-ldraw-absent');
  await page.goto(`${baseUrl}/ajouter`);
  await page.getByTestId('search-number').fill('90001');
  await page.getByTestId('search-submit').click();
  await page.getByTestId('sources').waitFor();
  await shot(page, '29-ajouter-hors-ligne', true);
  await page.goto(baseUrl);
  await page.getByTestId('set-card-90002-1').getByRole('link', { name: 'Détails' }).click();
  await page.getByText('Aperçu indisponible').first().waitFor({ timeout: 60_000 });
  await shot(page, '30-detail-ldraw-absent');
  await page.close();
  return errors;
}

const errors = degraded ? await degradedRun() : await normalRun();
await browser.close();
console.log(`${shots.length} capture(s) dans ${outDir}`);
if (errors.length > 0) console.log(`Erreurs console (${errors.length}) :\n${[...new Set(errors)].join('\n')}`);

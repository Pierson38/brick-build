import { createHash } from 'node:crypto';
import { existsSync, promises as fs, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { RECETTE_DATA_DIR, RECETTE_SET } from '../../playwright.recette-p8.config';
import { makeTestPdf } from '../e2e/make-test-pdf';
import { newStats, placeOneByPointer, progressCount } from '../e2e/scripted-player';
import { defaultDataRoot } from '../../src/server/library/paths';

/**
 * P8 real trial on a set that is NOT in the owner's collection (default 31045, OMR), in an isolated
 * data folder. Part 1: search → OMR (real) → files → parts check → booklet → add → build → collection.
 * Part 2 (`-g "part 2"`, after restarting the server by hand): resume without any import.
 * The booklet: the owner's own PDF when present in $BRICK_LAB_DATA/instructions/<set>-1/ (never
 * downloaded by the script); otherwise a SYNTHETIC stand-in, reported as such.
 */
const SRC = process.env.BRICK_LAB_DATA ?? defaultDataRoot();
const PROOFS = path.join(SRC, 'proofs', 'p8');
const CANON = `${RECETTE_SET}-1`;
const PLACE = 12;

interface Lib { dataDir: string; sets: { id: string; setNumber: string; name: string; builds: { id: string; label: string; modes: string[]; progress: { placed: number; mode: string } | null; snapshot: { occurrenceCount: number } }[] }[] }
const library = async (r: APIRequestContext) => (await (await r.get('/api/library')).json()) as Lib;
const log: Record<string, unknown> = {};
const save = () => writeFileSync(path.join(PROOFS, `recette-${CANON}.json`), `${JSON.stringify(log, null, 2)}\n`);

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  const lib = await library(request);
  if (path.resolve(lib.dataDir) !== path.resolve(RECETTE_DATA_DIR)) throw new Error(`Serveur sur ${lib.dataDir}, attendu ${RECETTE_DATA_DIR} : jamais la bibliothèque réelle.`);
  mkdirSync(PROOFS, { recursive: true });
  if (existsSync(path.join(PROOFS, `recette-${CANON}.json`))) Object.assign(log, JSON.parse(readFileSync(path.join(PROOFS, `recette-${CANON}.json`), 'utf8')));
});

async function waitAtelier(page: Page) {
  await expect(page.getByTestId('render-status')).toContainText('Géométrie LDraw', { timeout: 120_000 });
  await page.waitForFunction(() => Boolean(window.__brickLab && window.__brickLabGame));
  await page.waitForTimeout(300);
}

test('part 1: search, OMR, files, parts, booklet, add, build, back to the collection', async ({ page, request }) => {
  await fs.rm(path.join(RECETTE_DATA_DIR, 'library'), { recursive: true, force: true });
  const t0 = Date.now();
  // 1. search
  await page.goto('/ajouter');
  await page.getByTestId('search-number').fill(RECETTE_SET);
  await page.getByTestId('search-submit').click();
  await expect(page.getByTestId('source-local')).toContainText('rien pour ce numéro');
  await page.getByTestId('search-online').click();
  const status = page.getByTestId('omr-status');
  await expect(status).toBeVisible({ timeout: 30_000 });
  log.omr = await status.textContent();
  log.rebrickable = await page.getByTestId('source-rebrickable').textContent();
  log.legoLink = await page.getByTestId('lego-link').getAttribute('href');
  await expect(status).toContainText('modèle(s) 3D sur l’OMR');
  log.omrModels = await page.getByTestId('source-omr').locator('.omr-models li').allTextContents();

  // 2. download the main model (one click = one file)
  await page.getByTestId(`omr-download-${CANON}.mpd`).click();
  const card = page.getByTestId('model-card');
  await expect(card).toHaveCount(1, { timeout: 60_000 });
  log.modelCard = await card.textContent();

  // 3. parts: the compatibility sheet states what the local LDraw library lacks
  await expect(page.getByTestId('compat-card')).toHaveCount(1);
  log.compatibility = await page.getByTestId('compat-card').allTextContents();

  // 4. booklet: the owner's own PDF if present, otherwise a synthetic stand-in
  const dir = path.join(SRC, 'instructions', CANON);
  const own = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.pdf')).map((f) => path.join(dir, f)) : [];
  if (own.length > 0) await page.getByTestId('quick-input').setInputFiles(own);
  else await page.getByTestId('quick-input').setInputFiles({ name: `${CANON}-notice-SYNTHETIQUE.pdf`, mimeType: 'application/pdf', buffer: makeTestPdf(4) });
  log.booklet = own.length > 0 ? own.map((f) => path.basename(f)) : 'PDF synthétique de 4 pages (aucune notice réelle disponible localement)';
  await expect(page.getByTestId('pdf-row')).toHaveCount(Math.max(1, own.length));
  log.pdfRows = await page.getByTestId('pdf-row').allTextContents();
  log.compatibilityWithBooklet = await page.getByTestId('compat-card').allTextContents();
  await expect(page.getByTestId('compat-card')).toContainText('Notice synchronisée indisponible : aucune correspondance validée.');
  await page.screenshot({ path: path.join(PROOFS, `${CANON}-compatibilite.png`), fullPage: true });

  // 5. add to the collection
  log.name = await page.getByTestId('confirm-name').inputValue();
  if (!log.name) await page.getByTestId('confirm-name').fill('Set de recette');
  await page.getByTestId('import-submit').click();
  await expect(page.getByTestId('import-done')).toContainText('Ajouté à ta collection');
  log.searchToAddedMs = Date.now() - t0;
  const index = JSON.parse(readFileSync(path.join(RECETTE_DATA_DIR, 'library', 'library.json'), 'utf8')) as { files: Record<string, { originalName: string; provenance?: unknown; sha256: string; size: number }> };
  log.files = Object.values(index.files).map((f) => ({ name: f.originalName, size: f.size, sha256: f.sha256, provenance: f.provenance }));
  const mpd = Object.values(index.files).find((f) => f.originalName.endsWith('.mpd'))!;
  const blob = readdirSync(path.join(RECETTE_DATA_DIR, 'library', 'blobs', mpd.sha256.slice(0, 2))).find((n) => n.startsWith(mpd.sha256))!;
  expect(createHash('sha256').update(readFileSync(path.join(RECETTE_DATA_DIR, 'library', 'blobs', mpd.sha256.slice(0, 2), blob))).digest('hex')).toBe(mpd.sha256);

  // 6. build several bricks (guided mode), straight from the confirmation
  await page.getByTestId('import-build').first().click();
  await waitAtelier(page);
  await page.getByRole('button', { name: 'Commencer — mode guidé' }).click();
  const stats = newStats();
  const t1 = Date.now();
  for (let i = 0; i < PLACE; i++) await placeOneByPointer(page, stats, false);
  log.placed = await progressCount(page);
  log.placeStats = { ...stats, ms: Date.now() - t1 };
  await expect(page.getByTestId('save-state')).toHaveText('Enregistré dans la bibliothèque');
  await page.screenshot({ path: path.join(PROOFS, `${CANON}-construction.png`) });

  // 7. back to the collection
  await page.getByTestId('back-to-collection').click();
  const setCard = page.getByTestId(`set-card-${CANON}`);
  await expect(setCard.getByTestId('card-progress')).toContainText(`${PLACE}/`);
  log.collectionCard = await setCard.textContent();
  const lib = await library(request);
  log.library = lib.sets.map((s) => ({ setNumber: s.setNumber, name: s.name, builds: s.builds.map((b) => ({ label: b.label, modes: b.modes, placed: b.progress?.placed, pieces: b.snapshot.occurrenceCount })) }));
  save();
});

test('part 2: after a server restart, resume without import; the same search finds the set already in the collection', async ({ page, browser, request }) => {
  const context = await browser.newContext();
  const again = await context.newPage();
  await again.goto('/');
  const setCard = again.getByTestId(`set-card-${CANON}`);
  await expect(setCard.getByTestId('card-build')).toHaveText('Reprendre');
  await setCard.getByTestId('card-build').click();
  await expect(again.getByTestId('message')).toContainText(`Progression restaurée : ${PLACE}/`, { timeout: 120_000 });
  log.resume = { message: await again.getByTestId('message').textContent(), mode: await again.getByTestId('mode-select').getAttribute('data-value') };
  await again.screenshot({ path: path.join(PROOFS, `${CANON}-reprise.png`) });
  await context.close();

  // the same number again: no new import is needed or possible
  await page.goto('/ajouter');
  await page.getByTestId('search-number').fill(RECETTE_SET);
  await page.getByTestId('search-submit').click();
  await page.getByTestId('search-online').click();
  await page.getByTestId(`omr-download-${CANON}.mpd`).click();
  await expect(page.getByTestId('already-in-collection')).toContainText('Ce modèle existe déjà dans ta collection');
  await expect(page.getByTestId('existing-set')).toContainText('Ce set est déjà dans ta collection');
  log.secondSearch = await page.getByTestId('already-in-collection').textContent();
  expect((await library(request)).sets).toHaveLength(1);
  save();
});

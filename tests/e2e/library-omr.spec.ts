import { existsSync, promises as fs, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { E2E_DATA_DIR } from '../../playwright.config';
import { newStats, placeOneByPointer, progressCount } from './scripted-player';

/**
 * P7 real trial: 31040 (model + booklet + the owner's verified mapping) and 31009 (model + booklet
 * of the main model), found by DISCOVERY in a data folder laid out like ~/Documents/brick-lab-data.
 * The files are copied from BRICK_LAB_DATA into the isolated E2E folder (never into the repository);
 * the suite is SKIPPED, and reported as such, when one of them is absent.
 */
const SRC = process.env.BRICK_LAB_DATA ?? path.join(homedir(), 'Documents', 'brick-lab-data');
const FILES = [
  'models/31040-1/31040-1.mpd',
  'instructions/31040-1/31040-1_notice_6145903.pdf',
  'mappings/31040-1.brick-mapping.json',
  'mappings/31040-1.prepared-by-claude.brick-mapping.json',
  'models/31009-1/31009-1.mpd',
  'instructions/31009-1/31009-1_notice_6038244.pdf',
];
const PROOFS = path.join(SRC, 'proofs', 'p7');
const W = { origin: 'http://127.0.0.1:3000', 'x-brick-lab': '1' };

test.describe.configure({ mode: 'serial' });
test.setTimeout(20 * 60_000);
test.use({ launchOptions: { args: ['--enable-gpu', '--ignore-gpu-blocklist'] } });
test.skip(!FILES.every((f) => existsSync(path.join(SRC, f))), 'fichiers 31040/31009 hors dépôt absents (modèles, notices ou correspondances)');

interface Lib { dataDir: string; sets: { id: string; setNumber: string; builds: { id: string; modes: string[]; progress: { placed: number; mode: string; lastPdfPage: number | null } | null; mapping: { verified: number; valid: boolean } | null }[] }[] }
const library = async (r: APIRequestContext) => (await (await r.get('/api/library')).json()) as Lib;

test.beforeAll(async ({ request }) => {
  const lib = await library(request);
  if (path.resolve(lib.dataDir) !== path.resolve(E2E_DATA_DIR)) throw new Error(`Serveur sur ${lib.dataDir}, attendu ${E2E_DATA_DIR}.`);
  await fs.rm(E2E_DATA_DIR, { recursive: true, force: true });
  for (const f of FILES) {
    await fs.mkdir(path.dirname(path.join(E2E_DATA_DIR, f)), { recursive: true });
    await fs.copyFile(path.join(SRC, f), path.join(E2E_DATA_DIR, f));
  }
  mkdirSync(PROOFS, { recursive: true });
});

async function waitAtelier(page: Page) {
  await expect(page.getByTestId('render-status')).toContainText('Géométrie LDraw', { timeout: 120_000 });
  await page.waitForFunction(() => Boolean(window.__brickLab && window.__brickLabGame));
  await page.waitForTimeout(300);
}

test('31040 and 31009 are detected and added without copying their files; the verified mapping is preselected', async ({ page, request }) => {
  await page.goto('/');
  await page.getByTestId('discovery').getByRole('button').first().click();
  const d40 = page.getByTestId('discovered-31040-1');
  await expect(d40.getByTestId('discovered-mapping-31040-1.brick-mapping.json')).toBeChecked();
  await expect(d40).toContainText('24/24 vérifiées');
  await expect(d40).toContainText('0/24 vérifiées');
  await d40.getByTestId('discovered-name').fill('Desert Racers');
  await d40.getByTestId('discovered-add').click();
  const d09 = page.getByTestId('discovered-31009-1');
  await d09.getByTestId('discovered-name').fill('Small Cottage');
  await d09.getByTestId('discovered-add').click();
  await expect(page.getByTestId('set-card-31040-1')).toContainText('Notice synchronisée');
  await expect(page.getByTestId('set-card-31009-1')).toContainText('270 pièces');
  const lib = await library(request);
  const b40 = lib.sets.find((s) => s.setNumber === '31040-1')!.builds[0]!;
  expect(b40.modes).toEqual(['synced', 'guided', 'freeManual']);
  expect(b40.mapping).toMatchObject({ verified: 24, valid: true });
  // nothing was copied into the library store
  expect(existsSync(path.join(E2E_DATA_DIR, 'library', 'blobs'))).toBe(false);
  await expect(page.locator('img.thumb')).toHaveCount(2, { timeout: 120_000 });
  await page.screenshot({ path: path.join(PROOFS, 'collection.png') });
});

test('31040: synchronised build from the collection, interrupted, browser closed, resumed with notice and page, finished', async ({ page, browser, request }) => {
  const started = Date.now();
  await page.goto('/');
  await page.getByTestId('set-card-31040-1').getByTestId('card-build').click();
  await waitAtelier(page);
  const openMs = Date.now() - started;
  await page.getByRole('button', { name: 'Commencer — notice synchronisée' }).click();
  await expect(page.getByTestId('pdf-page')).toHaveText('PDF p. 2 / 32', { timeout: 30_000 });
  const stats = newStats();
  for (let i = 0; i < 30; i++) await placeOneByPointer(page, stats, i % 2 === 0);
  await expect(page.getByTestId('progress')).toHaveText('30/65 pièces posées');
  const step = await page.getByTestId('notice-step').textContent();
  const pdfPage = await page.getByTestId('pdf-page').textContent();
  await expect.poll(async () => (await library(request)).sets.find((s) => s.setNumber === '31040-1')!.builds[0]!.progress?.placed).toBe(30);
  await page.getByTestId('back-to-collection').click();
  await expect(page.getByTestId('set-card-31040-1').getByTestId('card-progress')).toHaveText('30/65 pièces posées');
  await page.context().close();

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const again = await context.newPage();
  const t0 = Date.now();
  await again.goto('/');
  await again.getByTestId('set-card-31040-1').getByTestId('card-build').click();
  await waitAtelier(again);
  const resumeMs = Date.now() - t0;
  await expect(again.getByTestId('message')).toContainText('Progression restaurée : 30/65 pièces posées.');
  await expect(again.getByTestId('mode-select')).toHaveValue('synced');
  await expect(again.getByTestId('notice-step')).toHaveText(step!);
  await expect(again.getByTestId('pdf-page')).toHaveText(pdfPage!);
  await expect(again.getByTestId('sync-missing-booklet')).toHaveCount(0);
  await again.screenshot({ path: path.join(PROOFS, '31040-1-resumed-30.png') });
  while ((await progressCount(again)) < 65) await placeOneByPointer(again, stats, false);
  await expect(again.getByTestId('message')).toHaveText('Bravo, modèle terminé !');
  await again.getByTestId('back-to-collection').click();
  await expect(again.getByTestId('set-card-31040-1').getByTestId('status')).toHaveText('Terminé');
  writeFileSync(path.join(PROOFS, '31040-1-library.json'), JSON.stringify({ ...stats, openMs, resumeMs, resumedAt: 30, step, pdfPage }, null, 2));
  expect(stats.failures).toEqual([]);
  await context.close();
});

test('31009: opens from the collection with its booklet, no mapping (synchronised mode not offered), guided start persists', async ({ page, request }) => {
  await page.goto('/');
  await page.getByTestId('set-card-31009-1').getByTestId('card-build').click();
  await waitAtelier(page);
  await expect(page.getByTestId('occurrence-count')).toHaveText('270');
  await expect(page.getByTestId('inventory-check')).toContainText('Inventaire indéterminé');
  await expect(page.getByTestId('sync-availability')).toContainText('Notice synchronisée indisponible');
  await expect(page.getByRole('button', { name: 'Commencer — notice synchronisée' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Notice PDF' }).click();
  await expect(page.getByTestId('pdf-page')).toHaveText('PDF p. 1 / 84');
  await page.getByRole('tab', { name: 'Modèle' }).click();
  await page.getByRole('button', { name: 'Commencer — mode guidé' }).click({ timeout: 10_000 });
  const stats = newStats();
  for (let i = 0; i < 5; i++) await placeOneByPointer(page, stats, false);
  await expect.poll(async () => (await library(request)).sets.find((s) => s.setNumber === '31009-1')!.builds[0]!.progress).toMatchObject({ placed: 5, mode: 'guided' });
});

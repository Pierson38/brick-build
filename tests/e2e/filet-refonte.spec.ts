import { createHash } from 'node:crypto';
import { promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { analyzeModel } from '../../src/domain/import/analyze';
import { addBooklet, addStep, assignToStep, createMapping, serializeMapping } from '../../src/domain/instructions/mapping';
import { E2E_DATA_DIR } from '../../playwright.config';
import { clickAt, open, OWNER } from './free-helpers';
import { makeTestPdf } from './make-test-pdf';

/**
 * Safety net of the UI redesign (REFONTE, phase 3): user paths of the inventory that no other spec
 * covered, checked on the UI as it was BEFORE the redesign, so that each screen redone afterwards is
 * held to the same behaviour. Original fixtures only, isolated data folder.
 *
 * Two states depend on the server configuration (BRICK_LAB_ONLINE=0, LDraw library absent): here the
 * local API answer is replaced in the page (page.route) to check what the UI shows; the server side
 * of both is covered by the unit tests (online-sources, import-p8).
 */
const fixture = (rel: string) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));
const MINI = fixture('fixtures/mini-4-pieces.mpd');
const SYNC8 = fixture('tests/fixtures/notice-sync-8.mpd');
const SYNC8_BYTES = readFileSync(SYNC8);
const PDF = makeTestPdf(3);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const file = (name: string, buffer: Buffer, mimeType = 'application/octet-stream') => ({ name, mimeType, buffer });

/** notice-sync-8 in 4 booklet steps of 2 bricks (pages 2, 2, 3, 3). */
function mappingFile(): Buffer {
  const a = analyzeModel(SYNC8_BYTES.toString('utf8'), 'notice-sync-8.mpd');
  let m = createMapping({ sha256: sha(SYNC8_BYTES), fileName: 'notice-sync-8.mpd', rootName: a.model.rootName, occurrences: a.model.occurrences });
  m = addBooklet(m, { label: 'Livret 1', fileName: 'notice-test.pdf', sha256: sha(PDF), pageCount: 3 }).mapping;
  let last: string | null = null;
  for (const [i, page] of [[0, 2], [2, 2], [4, 3], [6, 3]] as const) {
    const r = addStep(m, last, { page, printedStep: String(i / 2 + 1) });
    m = assignToStep(r.mapping, r.stepId, [`notice-sync-8.mpd#${i}`, `notice-sync-8.mpd#${i + 1}`]).mapping;
    last = r.stepId;
  }
  return Buffer.from(serializeMapping(m));
}

async function openStandalone(page: Page, model: string) {
  await page.goto('/atelier');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('model-input').setInputFiles(model);
  await expect(page.getByTestId('render-status')).toContainText('Géométrie LDraw', { timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.__brickLab && window.__brickLabGame));
}

/** One brick of the tray, placed with the explicit accessibility button (no pointer aiming). */
async function assistPlace(page: Page, tray = page.locator('.tray-item').first()) {
  await tray.click();
  await page.getByTestId('assist-place').click();
}

const progressKeys = (page: Page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('brick-lab:progress:')));

test.describe('atelier sans collection', () => {
  test('guidé : réinitialiser l’étape, montrer les emplacements, abandonner (effacement, rien de restauré au réimport)', async ({ page }) => {
    await openStandalone(page, MINI);
    await page.getByRole('button', { name: 'Commencer — mode guidé' }).click();
    // "Montrer les emplacements": ghosts of the active step, none when unticked
    const ghosts = () => page.evaluate(() => window.__brickLab!.sceneSummary().ghost);
    await expect.poll(ghosts).toBeGreaterThan(0);
    await page.getByLabel('Montrer les emplacements').uncheck();
    await expect.poll(ghosts).toBe(0);
    await page.getByLabel('Montrer les emplacements').check();
    await expect.poll(ghosts).toBeGreaterThan(0);

    await assistPlace(page);
    await expect(page.getByTestId('progress')).toHaveText('1/4 pièces posées');
    await page.getByRole('button', { name: 'Réinitialiser l’étape' }).click();
    await expect(page.getByTestId('progress')).toHaveText('0/4 pièces posées');
    await expect(page.getByTestId('step-indicator')).toHaveText('Étape 1 / 2');

    await assistPlace(page);
    await expect(page.getByTestId('progress')).toHaveText('1/4 pièces posées');
    expect(await progressKeys(page)).toHaveLength(1);
    // before the redesign: no confirmation in the standalone atelier (decision A5 adds one, this test follows)
    await page.getByRole('button', { name: 'Abandonner' }).click();
    await expect(page.getByTestId('progress')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Commencer — mode guidé' })).toBeVisible();
    expect(await progressKeys(page)).toHaveLength(0);
    // the same file imported again: nothing to restore
    await page.reload();
    await page.getByTestId('model-input').setInputFiles(MINI);
    await expect(page.getByTestId('render-status')).toContainText('Géométrie LDraw', { timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Commencer — mode guidé' })).toBeVisible();
    await expect(page.getByTestId('message')).toHaveCount(0);
  });

  test('montage libre : la touche G bascule la grille, Q les axes du manipulateur', async ({ page }) => {
    await open(page, OWNER.map((f) => (f.partKey === '30157.dat' ? { ...f, pose: [f.pose[0]!, 17.41, ...f.pose.slice(2)] } : f)));
    const grid = page.getByTestId('snap-grid');
    await expect(grid).toBeChecked();
    await page.keyboard.press('g');
    await expect(grid).not.toBeChecked();
    await page.keyboard.press('G');
    await expect(grid).toBeChecked();

    await clickAt(page, [70, 17.41, -70]);
    await expect(page.getByTestId('selection-info')).toHaveText('1 pièce(s) sélectionnée(s)');
    await expect(page.getByTestId('gizmo-world')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('q');
    await expect(page.getByTestId('gizmo-local')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('gizmo-world')).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => window.__brickLabGizmo?.controls()?.space)).toBe('local');
    await page.keyboard.press('q');
    await expect(page.getByTestId('gizmo-world')).toHaveAttribute('aria-pressed', 'true');
  });

  test('éditeur de correspondances : descendre, supprimer une étape, tout effacer puis restaurer', async ({ page }) => {
    await openStandalone(page, SYNC8);
    await page.getByRole('tab', { name: 'Notice PDF' }).click();
    await page.getByTestId('pdf-input').setInputFiles(file('notice-test.pdf', PDF, 'application/pdf'));
    await expect(page.getByTestId('pdf-page')).toHaveText('PDF p. 1 / 3');
    await page.getByRole('tab', { name: 'Correspondances' }).click();
    await page.getByTestId('mapping-import').setInputFiles(file('perso.brick-mapping.json', mappingFile(), 'application/json'));
    await expect(page.getByTestId('mapping-coverage')).toHaveText('8/8 pièces affectées · 4 étape(s)');
    const steps = page.getByTestId('mapping-step-select').locator('option');
    const printed = async () => (await steps.allTextContents()).map((t) => t.match(/Étape (\d+)/)?.[1]);
    expect(await printed()).toEqual(['1', '2', '3', '4']);

    // step 1 one place down, then back up
    await page.getByTestId('mapping-step-select').selectOption({ index: 0 });
    await page.getByRole('button', { name: '↓ Descendre' }).click();
    expect(await printed()).toEqual(['2', '1', '3', '4']);
    await page.getByRole('button', { name: '↑ Monter' }).click();
    expect(await printed()).toEqual(['1', '2', '3', '4']);

    // a step deleted: its bricks are unassigned again
    await page.getByTestId('mapping-step-select').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Supprimer l’étape' }).click();
    await expect(page.getByTestId('mapping-coverage')).toHaveText('6/8 pièces affectées · 3 étape(s)');
    await expect(page.getByTestId('message')).toContainText('supprimée ; ses pièces redeviennent non affectées');
    expect(await printed()).toEqual(['1', '3', '4']);

    // clear everything (two clicks), then restore the previous mapping
    await page.getByRole('button', { name: 'Tout effacer' }).click();
    await expect(page.getByTestId('mapping-coverage')).toHaveText('6/8 pièces affectées · 3 étape(s)');
    await page.getByRole('button', { name: 'Confirmer l’effacement' }).click();
    await expect(page.getByTestId('mapping-coverage')).toHaveText('0/8 pièces affectées · 0 étape(s)');
    await expect(page.getByText('Correspondances précédentes remplacées.')).toBeVisible();
    await page.getByRole('button', { name: 'Les restaurer' }).click();
    await expect(page.getByTestId('mapping-coverage')).toHaveText('6/8 pièces affectées · 3 étape(s)');
    await expect(page.getByTestId('message')).toHaveText('Correspondances précédentes restaurées.');
  });

  test('bibliothèque LDraw absente : rendu indisponible expliqué, aucun mode proposé', async ({ page }) => {
    await page.route('**/api/ldraw-status', (route) => route.fulfill({ json: { configured: false, reason: 'Variable LDRAW_LIBRARY_DIR absente.' } }));
    await page.goto('/atelier');
    await page.getByTestId('model-input').setInputFiles(MINI);
    await expect(page.getByTestId('render-status')).toHaveText('Rendu indisponible : Variable LDRAW_LIBRARY_DIR absente.', { timeout: 60_000 });
    await expect(page.getByTestId('quality')).toContainText('Analysable');
    await expect(page.getByText('Visualisation seulement tant que des pièces manquent.')).toBeVisible();
    await expect(page.getByTestId('build-canvas')).toHaveCount(0);
    for (const name of ['Commencer — mode guidé', 'Commencer — notice synchronisée', 'Montage libre (avec notice)']) {
      await expect(page.getByRole('button', { name })).toHaveCount(0);
    }
  });
});

test.describe('ajouter un set', () => {
  test('hors ligne (BRICK_LAB_ONLINE=0) : pas de recherche en ligne, l’import local reste complet', async ({ page }) => {
    // the local lookup as the server answers it with BRICK_LAB_ONLINE=0 (see src/server/library/prepare.ts)
    await page.route(/\/api\/library\/lookup\?number=/, async (route) => {
      const res = await route.fetch();
      const body = (await res.json()) as Record<string, unknown>;
      await route.fulfill({ response: res, json: { ...body, online: { omr: false, rebrickable: false } } });
    });
    let online = 0;
    page.on('request', (r) => { if (r.url().includes('/api/library/lookup/online') || r.url().includes('/api/library/import/omr')) online++; });
    await page.goto('/ajouter');
    await page.getByTestId('search-number').fill('90041');
    await page.getByTestId('search-submit').click();
    await expect(page.getByTestId('source-omr')).toContainText('Accès Internet désactivé.');
    await expect(page.getByTestId('search-online')).toHaveCount(0);
    await expect(page.getByTestId('lego-link')).toBeVisible();
    // its own fingerprint: another spec may already have put mini-4-pieces.mpd in the shared collection
    const own = readFileSync(MINI, 'utf8').replace('\n', '\n0 Copie du filet hors ligne\n');
    await page.getByTestId('quick-input').setInputFiles(file('hors-ligne.mpd', Buffer.from(own), 'text/plain'));
    await expect(page.getByTestId('compat-card')).toHaveCount(1, { timeout: 60_000 });
    await expect(page.getByTestId('import-submit')).toBeVisible();
    expect(online).toBe(0);
  });
});

test.describe('bibliothèque', () => {
  test.describe.configure({ mode: 'serial' });
  const library = async (request: APIRequestContext) =>
    (await (await request.get('/api/library')).json()) as { dataDir: string; sets: { id: string; setNumber: string; builds: { id: string; label: string; progress: { placed: number } | null }[] }[] };

  test.beforeAll(async ({ request }) => {
    const lib = await library(request);
    if (path.resolve(lib.dataDir) !== path.resolve(E2E_DATA_DIR)) throw new Error(`Serveur sur ${lib.dataDir}, attendu ${E2E_DATA_DIR} : arrête le serveur de développement avant les tests.`);
    await fs.rm(E2E_DATA_DIR, { recursive: true, force: true });
    await fs.mkdir(E2E_DATA_DIR, { recursive: true });
  });

  test('détail : vérifier les empreintes, exporter les correspondances ; atelier : abandon confirmé ; retirer une construction puis le set', async ({ page, request }) => {
    await page.goto('/ajouter');
    await page.getByTestId('search-number').fill('90051');
    await page.getByTestId('quick-input').setInputFiles([file('notice-sync-8.mpd', SYNC8_BYTES, 'text/plain'), file('notice-test.pdf', PDF, 'application/pdf'), file('maison.brick-mapping.json', mappingFile(), 'application/json')]);
    await expect(page.getByTestId('compat-card')).toHaveCount(1, { timeout: 60_000 });
    await page.getByTestId('confirm-name').fill('Filet de sécurité');
    await page.getByTestId('import-submit').click();
    await expect(page.getByTestId('import-done')).toContainText('Ajouté à ta collection', { timeout: 60_000 });
    const setId = (await library(request)).sets.find((s) => s.setNumber === '90051-1')!.id;

    // the set detail: hashes verified, mapping exported as a local download
    await page.goto(`/sets/${setId}`);
    await page.getByTestId('detail-check').click();
    await expect(page.getByTestId('check-result')).toHaveText('2 fichier(s) vérifié(s) : empreintes SHA-256 identiques.') // model + booklet;
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('detail-mapping').getByRole('button', { name: 'Exporter (.json)' }).click()]);
    expect(download.suggestedFilename()).toBe('notice-sync-8.brick-mapping.json');
    const exported = JSON.parse(await fs.readFile((await download.path())!, 'utf8')) as { steps: unknown[]; model: { sha256: string } };
    expect(exported.steps).toHaveLength(4);
    expect(exported.model.sha256).toBe(sha(SYNC8_BYTES));

    // a second build (alternative model) in the same set
    await page.getByPlaceholder('Nom (ex. Modèle B : buggy)').fill('Mini');
    await page.getByTestId('detail-add-build').setInputFiles(MINI);
    await expect(page.getByTestId('detail-message')).toContainText('Construction ajoutée');
    await expect(page.locator('.build-panel')).toHaveCount(2);
    const mini = (await library(request)).sets.find((s) => s.id === setId)!.builds.find((b) => b.label === 'Mini')!;

    // library atelier: "Abandonner" asks first; "Annuler" keeps the progress, the confirmation clears it
    await page.goto(`/atelier/${mini.id}`);
    await expect(page.getByTestId('render-status')).toContainText('Géométrie LDraw', { timeout: 60_000 });
    await page.getByRole('button', { name: 'Commencer — mode guidé' }).click();
    await assistPlace(page);
    await expect(page.getByTestId('progress')).toHaveText('1/4 pièces posées');
    await expect(page.getByTestId('save-state')).toHaveText('Enregistré dans la bibliothèque');
    await page.getByRole('button', { name: 'Abandonner' }).click();
    await expect(page.getByTestId('confirm-restart')).toContainText('La progression (1/4) sera retirée de cette partie');
    await page.getByTestId('confirm-restart').getByRole('button', { name: 'Annuler' }).click();
    await expect(page.getByTestId('confirm-restart')).toHaveCount(0);
    await expect(page.getByTestId('progress')).toHaveText('1/4 pièces posées');
    await page.getByRole('button', { name: 'Abandonner' }).click();
    await page.getByTestId('confirm-restart').getByRole('button', { name: 'Confirmer l’abandon' }).click();
    await expect(page.getByTestId('progress')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Commencer — mode guidé' })).toBeVisible();
    await expect.poll(async () => (await library(request)).sets.find((s) => s.id === setId)!.builds.find((b) => b.id === mini.id)!.progress).toBeNull();

    // remove one build (confirmed), then the whole set: back to an empty collection
    await page.goto(`/sets/${setId}`);
    const miniPanel = page.getByTestId(`build-${mini.id}`);
    await miniPanel.getByTestId('detail-remove').click();
    await expect(miniPanel).toContainText('rien n’est effacé');
    await miniPanel.getByTestId('detail-remove-confirm').click();
    await expect(page.locator('.build-panel')).toHaveCount(1);
    await expect(page.getByTestId('detail-remove')).toHaveText('Retirer le set de la collection');
    await page.getByTestId('detail-remove').click();
    await page.getByTestId('detail-remove-confirm').click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText('Ta collection est vide')).toBeVisible();
    expect((await library(request)).sets).toHaveLength(0);
  });
  test('collection (refonte) : démo au premier lancement, bandeau « Reprendre », filtres au clavier', async ({ page, request }) => {
    // empty collection: the first-launch screen offers the embedded demo (standalone atelier, nothing added)
    await page.goto('/');
    await expect(page.getByText('Ta collection est vide')).toBeVisible();
    await page.getByTestId('try-demo').click();
    await expect(page).toHaveURL(/\/atelier\?demo=mini-4$/);
    await expect(page.getByTestId('render-status')).toContainText('Géométrie LDraw', { timeout: 60_000 });
    await expect(page.getByTestId('occurrence-count')).toHaveText('4');
    expect((await library(request)).sets).toHaveLength(0);

    // a build in progress: the banner resumes it in one click
    await page.goto('/ajouter');
    await page.getByTestId('search-number').fill('90061');
    await page.getByTestId('quick-input').setInputFiles(MINI);
    await page.getByTestId('confirm-name').fill('Reprise');
    await page.getByTestId('import-submit').click();
    await page.getByTestId('import-build').first().click();
    await expect(page.getByTestId('render-status')).toContainText('Géométrie LDraw', { timeout: 60_000 });
    await page.getByRole('button', { name: 'Commencer — mode guidé' }).click();
    await assistPlace(page);
    await expect(page.getByTestId('save-state')).toHaveText('Enregistré dans la bibliothèque');
    await page.goto('/');
    const banner = page.getByTestId('resume-banner');
    await expect(banner).toContainText('Reprise');
    await expect(banner).toContainText('1/4 pièces posées');
    await expect(page.locator('img.thumb')).toHaveCount(1, { timeout: 30_000 }); // the banner image is not a card thumbnail
    await banner.getByTestId('resume-build').click();
    await expect(page.getByTestId('progress')).toHaveText('1/4 pièces posées', { timeout: 60_000 });

    // status filters: a radio group driven by the arrow keys
    await page.goto('/');
    await page.getByRole('radio', { name: 'Tous' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: 'En cours' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('radio', { name: 'En cours' })).toBeFocused();
    await expect(page.getByTestId('set-card-90061-1')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('no-result')).toBeVisible();
  });
});

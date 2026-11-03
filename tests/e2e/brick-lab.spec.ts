import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { makeTestPdf } from './make-test-pdf';

const fixture = (name: string) => fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url));

async function importModel(page: Page, file: string | { name: string; text: string }) {
  const input = page.getByTestId('model-input').or(page.locator('aside input[type=file][accept=".ldr,.mpd"]')).first();
  if (typeof file === 'string') await input.setInputFiles(fixture(file));
  else await input.setInputFiles({ name: file.name, mimeType: 'text/plain', buffer: Buffer.from(file.text) });
  await expect(page.getByTestId('render-status')).toContainText('Géométrie LDraw', { timeout: 30_000 });
}

async function sceneSummary(page: Page) {
  await page.waitForFunction(() => Boolean(window.__brickLab));
  return page.evaluate(() => window.__brickLab!.sceneSummary());
}

/** Real pointer drop: hover the LDraw point on the drop plane and click. */
async function dropAt(page: Page, ldraw: [number, number, number]) {
  await page.waitForTimeout(150); // let the canvas settle after layout changes
  const p = await page.evaluate((pt) => window.__brickLab!.project(pt), ldraw);
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await page.mouse.click(p.x, p.y);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('mini-4-pieces: import, real LDraw render, guided build with pointer drops, completion', async ({ page }) => {
  await importModel(page, 'mini-4-pieces.mpd');
  await expect(page.getByTestId('occurrence-count')).toHaveText('4');
  await expect(page.getByTestId('step-count')).toContainText('2');
  await expect(page.getByTestId('quality')).toHaveText('Jouable avec étapes 3D');
  await expect(page.getByTestId('render-status')).toContainText('0 référence(s) manquante(s)');
  const preview = await sceneSummary(page);
  expect(preview.solid).toBe(4);
  expect(preview.meshes).toBeGreaterThanOrEqual(4);
  await page.screenshot({ path: 'test-results/proof-mini-4-preview.png' });

  await page.getByRole('button', { name: 'Commencer — mode guidé' }).click();
  await expect(page.getByTestId('step-indicator')).toHaveText('Étape 1 / 2');
  expect((await sceneSummary(page)).ghost).toBe(2);

  // a brick of step 2 is not offered during step 1
  await expect(page.getByTestId('tray-3001.dat-2')).toHaveCount(0);

  await page.getByTestId('tray-3001.dat-4').click();
  await dropAt(page, [0, 0, 60]);
  await expect(page.getByTestId('message')).toContainText('Trop loin');
  await expect(page.getByTestId('progress')).toHaveText('0/4 pièces posées');
  await dropAt(page, [0, 0, 0]);
  await expect(page.getByTestId('progress')).toHaveText('1/4 pièces posées');

  await page.getByTestId('tray-3001.dat-1').click();
  await dropAt(page, [80, 0, 0]);
  await expect(page.getByTestId('progress')).toHaveText('2/4 pièces posées');
  await expect(page.getByTestId('step-indicator')).toHaveText('Étape 2 / 2');

  // upper layer
  await page.getByTestId('tray-3001.dat-2').click();
  await expect(page.getByTestId('held-info')).toContainText('Niveau 2/2');
  await dropAt(page, [0, -24, 0]);
  await expect(page.getByTestId('progress')).toHaveText('3/4 pièces posées');
  await page.getByTestId('tray-3001.dat-14').click();
  await page.getByTestId('assist-place').click();
  await expect(page.getByTestId('progress')).toHaveText('4/4 pièces posées');
  await expect(page.getByTestId('message')).toHaveText('Bravo, modèle terminé !');
  await expect(page.getByTestId('step-indicator')).toHaveCount(0);
  expect((await sceneSummary(page)).solid).toBe(4);
  await page.screenshot({ path: 'test-results/proof-mini-4-done.png' });
});

test('progress survives a reload and re-import of the same file only', async ({ page }) => {
  await importModel(page, 'mini-4-pieces.mpd');
  await page.getByRole('button', { name: 'Commencer — mode guidé' }).click();
  await page.getByTestId('tray-3001.dat-4').click();
  await page.getByTestId('assist-place').click();
  await page.getByTestId('tray-3001.dat-1').click();
  await page.getByTestId('assist-place').click();
  await expect(page.getByTestId('progress')).toHaveText('2/4 pièces posées');

  await page.reload();
  await expect(page.getByText('mini-4-pieces.mpd — 2/4 pièces')).toBeVisible();
  // another model does not inherit this progress
  await importModel(page, 'no-steps.ldr');
  await expect(page.getByTestId('progress')).toHaveCount(0);
  await importModel(page, 'mini-4-pieces.mpd');
  await expect(page.getByTestId('message')).toHaveText('Progression restaurée : 2/4 pièces posées.');
  await expect(page.getByTestId('step-indicator')).toHaveText('Étape 2 / 2');
  expect((await sceneSummary(page)).solid).toBe(2);
});

test('no-steps.ldr: no fake guided mode, free build in any order', async ({ page }) => {
  await importModel(page, 'no-steps.ldr');
  await expect(page.getByTestId('quality')).toHaveText('Montage libre uniquement (pas d’étapes)');
  await expect(page.getByRole('button', { name: 'Commencer — mode guidé' })).toHaveCount(0);
  await expect(page.getByText('Étapes non disponibles dans ce fichier')).toBeVisible();
  await page.getByRole('button', { name: 'Montage libre (avec notice)' }).click();
  await expect(page.getByTestId('step-indicator')).toHaveCount(0);
  expect((await sceneSummary(page)).ghost).toBe(0);
  // blue (second in the file) first
  await page.getByTestId('tray-3001.dat-1').click();
  await dropAt(page, [80, 0, 0]);
  await expect(page.getByTestId('progress')).toHaveText('1/2 pièces posées');
  await page.getByTestId('tray-3001.dat-4').click();
  await dropAt(page, [0, 0, 0]);
  await expect(page.getByTestId('progress')).toHaveText('2/2 pièces posées');
});

test('nested-submodel: 4 distinct bricks from 2 copies, flattened steps', async ({ page }) => {
  await importModel(page, 'nested-submodel.mpd');
  await expect(page.getByTestId('occurrence-count')).toHaveText('4');
  await expect(page.getByTestId('step-count')).toContainText('4 (étapes aplaties des sous-modèles)');
  expect((await sceneSummary(page)).solid).toBe(4);
  await page.getByRole('button', { name: 'Commencer — mode guidé' }).click();
  await page.getByTestId('tray-3001.dat-4').click();
  await dropAt(page, [0, 0, 0]);
  await expect(page.getByTestId('progress')).toHaveText('1/4 pièces posées');
});

test('missing part is reported, not faked', async ({ page }) => {
  const text = ['0 FILE missing.ldr', '1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat', '1 1 80 0 0 1 0 0 0 1 0 0 0 1 not-a-real-part-9999.dat'].join('\n');
  await importModel(page, { name: 'missing.mpd', text });
  await expect(page.getByTestId('missing-parts')).toContainText('not-a-real-part-9999.dat');
  await expect(page.getByTestId('quality')).toContainText('Analysable');
  await expect(page.getByRole('button', { name: 'Montage libre (avec notice)' })).toHaveCount(0);
  expect((await sceneSummary(page)).solid).toBe(1);
});

test('local PDF: navigation and zoom independent from 3D steps, no request leaves localhost', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    const host = new URL(r.url()).hostname;
    if (!['127.0.0.1', 'localhost'].includes(host) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) external.push(r.url());
  });
  await importModel(page, 'mini-4-pieces.mpd');
  await page.getByRole('button', { name: 'Commencer — mode guidé' }).click();
  await page.getByRole('tab', { name: 'Notice PDF' }).click();
  await page.getByTestId('pdf-input').setInputFiles({ name: 'notice-test.pdf', mimeType: 'application/pdf', buffer: makeTestPdf(3) });
  await expect(page.getByTestId('pdf-page')).toHaveText('PDF p. 1 / 3');
  await page.getByRole('button', { name: 'Page suivante' }).click();
  await page.getByRole('button', { name: 'Page suivante' }).click();
  await expect(page.getByTestId('pdf-page')).toHaveText('PDF p. 3 / 3');
  await expect(page.getByRole('button', { name: 'Page suivante' })).toBeDisabled();
  await page.getByRole('button', { name: 'Page précédente' }).click();
  await expect(page.getByTestId('pdf-page')).toHaveText('PDF p. 2 / 3');
  await page.getByRole('button', { name: 'Zoom avant' }).click();
  await expect(page.getByTestId('pdf-zoom')).toHaveText('125 %');
  // the canvas really received pixels (rendering is asynchronous)
  const darkPixels = () => page.getByTestId('pdf-canvas').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3]! > 0 && d[i]! < 128) dark++;
    return dark;
  });
  await expect.poll(darkPixels, { timeout: 10_000 }).toBeGreaterThan(100);
  await expect(page.getByTestId('step-indicator')).toHaveText('Étape 1 / 2');
  await expect(page.locator('.pdf-panel [role=alert]')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/proof-pdf-panel.png' });

  await page.getByTestId('pdf-input').setInputFiles({ name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a pdf') });
  await expect(page.locator('.pdf-panel [role=alert]')).toContainText('PDF');
  expect(external).toEqual([]);
});

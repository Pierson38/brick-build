import { createHash } from 'node:crypto';
import { promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { analyzeModel } from '../../src/domain/import/analyze';
import { addBooklet, addStep, assignToStep, createMapping, serializeMapping } from '../../src/domain/instructions/mapping';
import { E2E_DATA_DIR } from '../../playwright.config';
import { makeTestPdf } from './make-test-pdf';

/**
 * French / English interface. The suites run in French (locale pinned in playwright.config.ts);
 * here the switch of the top bar turns the main screens to English — collection, add a set, set
 * detail, workshop in synchronised, guided and free modes — with no French left, and the choice
 * survives a reload. A browser that asks for English gets English without any choice.
 */
const fixture = (rel: string) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));
const SYNC8_BYTES = readFileSync(fixture('tests/fixtures/notice-sync-8.mpd'));
const MINI_BYTES = readFileSync(fixture('fixtures/mini-4-pieces.mpd'));
const PDF = makeTestPdf(3);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const W = { origin: 'http://127.0.0.1:3000', 'x-brick-lab': '1' };

/** French left on screen: accented letters, French quotes and apostrophe, common French UI words. */
const FRENCH = /[àâçéèêëîïôûùœÉÈÀÇ«»’]|\b(?:les?|la|des|une?|du|avec|sans|pour|aucune?|pièces?|étapes?|notice|modèles?|montage|enregistr\w*|ajouter|retirer|annuler|fermer|chercher|commencer|reprendre|introuvable|fichier|bibliothèque|ta|ton|tes)\b/i;

/** Every text the user can read or hear: visible text, accessible names, tooltips, placeholders. */
async function screenText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const parts = [document.body.innerText, document.title];
    for (const el of document.querySelectorAll('[aria-label],[title],[data-tip],[placeholder]')) {
      if ((el as HTMLElement).closest('[hidden]')) continue;
      for (const a of ['aria-label', 'title', 'data-tip', 'placeholder']) {
        const v = el.getAttribute(a);
        if (v) parts.push(v);
      }
    }
    return parts.join('\n');
  });
}

/** Lines of the screen that still look French (user data such as file names excluded by `allow`). */
async function frenchLeft(page: Page, allow: readonly string[] = []): Promise<string[]> {
  let text = await screenText(page);
  for (const a of allow) text = text.split(a).join('');
  return text.split('\n').map((l) => l.trim()).filter((l) => l && FRENCH.test(l));
}

async function upload(request: APIRequestContext, kind: string, name: string, data: Buffer) {
  const r = await request.post(`/api/library/files?kind=${kind}&name=${encodeURIComponent(name)}`, { data, headers: { ...W, 'content-type': 'application/octet-stream' } });
  expect(r.ok(), await r.text()).toBe(true);
  return ((await r.json()) as { file: { sha256: string } }).file.sha256;
}

function mappingText(): string {
  const a = analyzeModel(SYNC8_BYTES.toString('utf8'), 'notice-sync-8.mpd');
  let m = createMapping({ sha256: sha(SYNC8_BYTES), fileName: 'notice-sync-8.mpd', rootName: a.model.rootName, occurrences: a.model.occurrences });
  m = addBooklet(m, { label: 'Booklet 1', fileName: 'test-booklet.pdf', sha256: sha(PDF), pageCount: 3 }).mapping;
  let last: string | null = null;
  for (const [page, occ] of [[2, [0, 1, 2, 3]], [3, [4, 5, 6, 7]]] as const) {
    const r = addStep(m, last, { page, printedStep: String(page - 1) });
    m = assignToStep(r.mapping, r.stepId, occ.map((i) => `notice-sync-8.mpd#${i}`)).mapping;
    last = r.stepId;
  }
  return serializeMapping(m);
}

const DATA = ['Français', 'test-booklet.pdf', 'notice-sync-8.mpd', 'Booklet 1', 'Lighthouse', 'Main build'];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  const lib = (await (await request.get('/api/library')).json()) as { dataDir: string };
  if (path.resolve(lib.dataDir) !== path.resolve(E2E_DATA_DIR)) throw new Error(`Server on ${lib.dataDir}, expected ${E2E_DATA_DIR}: stop the development server before the tests.`);
  await fs.rm(E2E_DATA_DIR, { recursive: true, force: true });
  await fs.mkdir(E2E_DATA_DIR, { recursive: true });
  const model = await upload(request, 'model', 'notice-sync-8.mpd', SYNC8_BYTES);
  const pdf = await upload(request, 'pdf', 'test-booklet.pdf', PDF);
  const mapping = await upload(request, 'mapping', 'lighthouse.brick-mapping.json', Buffer.from(mappingText()));
  const r = await request.post('/api/library/sets', { data: { setNumber: '90070-1', name: 'Lighthouse', builds: [{ label: 'Main build', modelFileId: model, bookletFileIds: [pdf], mappingFileId: mapping }] }, headers: W });
  expect(r.status(), await r.text()).toBe(201);
});

test('the switch turns the main screens to English, and back to French', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByTestId('set-card-90070-1')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('add-set')).toBeVisible();
  await expect(page.getByTestId('locale-toggle')).toHaveAttribute('aria-label', 'Langue : Français (passer à English)');

  // collection
  await page.getByTestId('locale-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByTestId('locale-toggle')).toHaveAttribute('aria-label', 'Language: English (switch to Français)');
  await expect(page).toHaveTitle(/^My collection/);
  expect((await context.cookies()).find((c) => c.name === 'brick-lab-locale')?.value).toBe('en');
  await expect(page.getByTestId('set-card-90070-1').getByTestId('status')).toHaveText('Never started');
  expect(await frenchLeft(page, DATA)).toEqual([]);

  // the choice survives a reload
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByTestId('set-card-90070-1').getByTestId('status')).toHaveText('Never started');
  expect(await frenchLeft(page, DATA)).toEqual([]);

  // set detail (texts computed by the server: modes, compatibility)
  await page.getByTestId('set-card-90070-1').getByRole('link', { name: 'Details', exact: true }).click();
  await expect(page.getByTestId('detail-modes')).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveTitle(/^Set details/);
  await page.locator('details').evaluateAll((all) => all.forEach((d) => { (d as HTMLDetailsElement).open = true; }));
  expect(await frenchLeft(page, DATA)).toEqual([]);

  // add a set
  await page.goto('/ajouter');
  await expect(page.getByTestId('quick-input')).toBeAttached({ timeout: 60_000 });
  expect(await frenchLeft(page, DATA)).toEqual([]);
  await page.getByTestId('search-number').fill('90071');
  await page.getByTestId('quick-input').setInputFiles([
    { name: 'mini-4-pieces.mpd', mimeType: 'text/plain', buffer: MINI_BYTES },
    { name: 'test-booklet.pdf', mimeType: 'application/pdf', buffer: PDF },
  ]);
  await expect(page.getByTestId('compat-headline')).toBeVisible({ timeout: 30_000 });
  // the title line of the model file is user data (written in French in this fixture)
  expect(await frenchLeft(page, [...DATA, 'mini-4-pieces.mpd', 'Miniature de test — 4 briques, 2 étapes'])).toEqual([]);

  // workshop: start panel, then synchronised, guided and free modes
  await page.goto('/');
  await page.getByTestId('set-card-90070-1').getByTestId('card-build').click();
  await expect(page.getByTestId('render-status')).toContainText('LDraw', { timeout: 60_000 });
  await expect(page.getByTestId('start-synced')).toBeVisible();
  expect(await frenchLeft(page, DATA)).toEqual([]);
  await page.getByTestId('start-synced').getByRole('button').click();
  await expect(page.getByTestId('pdf-page')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('progress')).toHaveText('0/8 pieces placed');
  expect(await frenchLeft(page, DATA)).toEqual([]);
  for (const mode of ['guided', 'freeManual'] as const) {
    await page.getByTestId('mode-select').locator(`[data-value="${mode}"]`).click();
    await expect(page.getByTestId('mode-select')).toHaveAttribute('data-value', mode);
    expect(await frenchLeft(page, DATA), mode).toEqual([]);
  }
  // keyboard shortcuts help
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await frenchLeft(page, DATA)).toEqual([]);
  await page.keyboard.press('Escape');

  // back to French, live
  await page.getByTestId('locale-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByTestId('progress')).toHaveText('0/8 pièces posées');
});

test('a browser that asks for English gets English without choosing', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'en-US' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByTestId('set-card-90070-1')).toBeVisible({ timeout: 60_000 });
  expect(await frenchLeft(page, DATA)).toEqual([]);
  // server messages follow the request language too
  const r = await page.request.post('/api/library/sets', { data: { setNumber: '!', name: 'x', builds: [] }, headers: { ...W, 'accept-language': 'en-US' } });
  expect(r.status()).toBe(422);
  const { error } = (await r.json()) as { error: { code: string; message: string } };
  expect(error.code).toBe('INVALID');
  expect(error.message).toMatch(/^Invalid set number/);
  expect(error.message).not.toMatch(FRENCH);
  await context.close();
});

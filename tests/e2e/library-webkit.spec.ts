import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, webkit, type Browser, type Page } from '@playwright/test';
import { E2E_DATA_DIR } from '../../playwright.config';

/**
 * Chromium and WebKit (the engine of Safari) on the SAME local library: a build started in one is
 * resumed in the other. WebKit here is Playwright's build, not the Safari app: the human acceptance
 * test covers the real Safari (docs/implementation/RECETTE_HUMAINE_P7.md).
 */
const MINI = readFileSync(fileURLToPath(new URL('../../fixtures/mini-4-pieces.mpd', import.meta.url)));
// distinct content (and fingerprint) so that this suite never collides with library.spec.ts
const MODEL = Buffer.from(MINI.toString('utf8').replace('0 Name: mini-4-pieces.mpd', '0 Name: mini-4-pieces.mpd\n0 // webkit'));
const W = { origin: 'http://127.0.0.1:3000', 'x-brick-lab': '1' };

let safari: Browser | null = null;
test.beforeAll(async () => {
  safari = await webkit.launch().catch(() => null);
});
test.afterAll(async () => {
  await safari?.close();
});

async function placeOne(page: Page, expected: string) {
  await page.getByTestId('tray-3001.dat-4').or(page.getByTestId('tray-3001.dat-1')).or(page.getByTestId('tray-3001.dat-2')).or(page.getByTestId('tray-3001.dat-14')).first().click();
  await page.getByTestId('assist-place').click();
  await expect(page.getByTestId('progress')).toHaveText(expected);
}

test('a build started in Chromium is resumed in WebKit, and back', async ({ page, request }) => {
  test.skip(!safari, 'WebKit de Playwright non installé (npx playwright install webkit)');
  test.setTimeout(180_000);
  const lib = (await (await request.get('/api/library')).json()) as { dataDir: string; sets: { setNumber: string; builds: { id: string }[] }[] };
  if (path.resolve(lib.dataDir) !== path.resolve(E2E_DATA_DIR)) throw new Error(`Serveur sur ${lib.dataDir}, attendu ${E2E_DATA_DIR}.`);
  let buildId = lib.sets.find((s) => s.setNumber === '90100-1')?.builds[0]?.id;
  if (buildId) {
    const p = (await (await request.get(`/api/library/builds/${buildId}/progress`)).json()) as { revision: number | null };
    if (p.revision !== null) await request.delete(`/api/library/builds/${buildId}/progress`, { data: { baseRevision: p.revision, confirm: true }, headers: W });
  } else {
    const up = await request.post('/api/library/files?kind=model&name=mini-webkit.mpd', { data: MODEL, headers: { ...W, 'content-type': 'application/octet-stream' } });
    const sha = ((await up.json()) as { file: { sha256: string } }).file.sha256;
    const created = await request.post('/api/library/sets', { data: { setNumber: '90100-1', name: 'Partagé Chrome Safari', builds: [{ label: 'Principal', modelFileId: sha }] }, headers: W });
    buildId = ((await created.json()) as { builds: { id: string }[] }).builds[0]!.id;
  }

  // Chromium: start, place one brick
  await page.goto(`/atelier/${buildId}`);
  await expect(page.getByTestId('render-status')).toContainText('Géométrie LDraw', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Commencer — mode guidé' }).click();
  await placeOne(page, '1/4 pièces posées');
  await expect.poll(async () => ((await (await request.get(`/api/library/builds/${buildId}/progress`)).json()) as { progress: { placedOccurrenceIds: string[] } | null }).progress?.placedOccurrenceIds.length).toBe(1);

  // WebKit: same collection, same progress, without any import
  const ctx = await safari!.newContext({ baseURL: 'http://127.0.0.1:3000', viewport: { width: 1280, height: 800 } });
  const s = await ctx.newPage();
  await s.goto('/');
  const card = s.getByTestId('set-card-90100-1');
  await expect(card.getByTestId('card-progress')).toHaveText('1/4 pièces posées', { timeout: 60_000 });
  await card.getByTestId('card-build').click();
  await expect(s.getByTestId('message')).toContainText('Progression restaurée : 1/4 pièces posées.', { timeout: 60_000 });
  await expect(s.getByTestId('mode-select')).toHaveValue('guided');
  await placeOne(s, '2/4 pièces posées');
  await expect.poll(async () => ((await (await request.get(`/api/library/builds/${buildId}/progress`)).json()) as { progress: { placedOccurrenceIds: string[] } | null }).progress?.placedOccurrenceIds.length).toBe(2);
  await s.screenshot({ path: 'test-results/proof-p7-webkit.png' });
  await ctx.close();

  // back in Chromium (fresh page): the WebKit move is there
  const again = await page.context().newPage();
  await again.goto(`/atelier/${buildId}`);
  await expect(again.getByTestId('progress')).toHaveText('2/4 pièces posées', { timeout: 60_000 });
});

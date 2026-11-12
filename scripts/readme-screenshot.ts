/**
 * The README screenshot (docs/images/workshop-free-building.png): a set from the collection in the
 * workshop, free building, most parts placed, one assembly selected with the 3D manipulator.
 * English interface (cookie `brick-lab-locale=en`); labels come from the English catalog.
 * ORIGINAL fixtures only (CC0) and a generated PDF: safe to commit, nothing leaves 127.0.0.1.
 *
 *   npx tsx scripts/readme-screenshot.ts <baseUrl> <outFile>
 *
 * The server must be `next dev` (test hooks) with BRICK_LAB_DATA_DIR=<an EMPTY folder>.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';
import { analyzeModel } from '../src/domain/import/analyze';
import { CATALOGS } from '../src/i18n/catalogs';
import { addBooklet, addStep, assignToStep, createMapping, serializeMapping } from '../src/domain/instructions/mapping';
import { makeTestPdf } from '../tests/e2e/make-test-pdf';

const [baseUrl = '', outFile = ''] = process.argv.slice(2);
if (!baseUrl || !outFile) throw new Error('usage: readme-screenshot.ts <baseUrl> <outFile>');
mkdirSync(path.dirname(outFile), { recursive: true });

const root = fileURLToPath(new URL('../', import.meta.url));
const SYNC = readFileSync(path.join(root, 'tests/fixtures/notice-sync-8.mpd'));
const PDF = makeTestPdf(3);
const EN = CATALOGS.en;
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

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
async function settle(page: Page) {
  await page.waitForTimeout(300);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
const canvasCentre = async (page: Page) => {
  const box = (await page.getByTestId('build-canvas').boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height * 0.6 };
};

const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: 'light', locale: 'en-US' });
await context.addCookies([{ name: 'brick-lab-locale', value: 'en', url: baseUrl }]);
const page = await context.newPage();
const errors: string[] = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

// ---- add the set (local files only: "Chercher en ligne" is never clicked)
await page.goto(`${baseUrl}/ajouter`);
await page.getByTestId('search-number').fill('90001');
await page.getByTestId('quick-input').setInputFiles([file('notice-sync-8.mpd', SYNC), file('notice-test.pdf', PDF, 'application/pdf'), file('maison.brick-mapping.json', syncMapping(), 'application/json')]);
await page.getByTestId('compat-card').first().waitFor({ timeout: 60_000 });
await page.getByTestId('confirm-name').fill('Test house');
await page.getByTestId('import-submit').click();
await page.getByTestId('import-done').waitFor({ timeout: 60_000 });

// ---- workshop, free building, six parts at their target position
await page.goto(baseUrl);
await page.getByTestId('set-card-90001-1').getByTestId('card-build').click();
await page.getByTestId('render-status').waitFor({ timeout: 120_000 });
await page.getByRole('button', { name: EN.workshop.modes.start.freeManual }).click();
for (let i = 0; i < 6; i++) {
  await page.locator('.tray-item').first().click();
  const c = await canvasCentre(page);
  await page.mouse.move(c.x, c.y);
  await settle(page);
  await page.getByTestId('assist-place').click();
  await settle(page);
}

// ---- select the top assembly (double-click: connected parts) to show the manipulator
const free = await page.evaluate(() => window.__brickLabGame!.freePieces());
const top = [...free].sort((a, b) => a.pose[13]! - b.pose[13]!)[0]!.pose;
const p = await page.evaluate((pt) => window.__brickLab!.project(pt), [top[12]!, top[13]! - 4, top[14]!] as [number, number, number]);
await page.mouse.dblclick(p.x, p.y);
await page.getByTestId('selection-info').waitFor();
await page.getByRole('tab', { name: EN.atelier.side.model }).click();
for (const close of await page.getByRole('button', { name: EN.workshop.feedback.closeMessage }).all()) await close.click();
await page.mouse.move(5, 400);
await settle(page);
await page.waitForTimeout(800);
await page.screenshot({ path: outFile });
await browser.close();
console.log(`✓ ${outFile}`);
if (errors.length > 0) console.log(`Console errors (${errors.length}):\n${[...new Set(errors)].join('\n')}`);

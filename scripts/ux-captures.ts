/**
 * Before/after screenshots of the atelier (UX batch: resizable panels, PDF fit, part previews).
 * Standalone atelier (/atelier): files are imported in the page, nothing is written to a library.
 *
 *   npx tsx scripts/ux-captures.ts <baseUrl> <outDir> <label> [model.mpd] [notice.pdf]
 *
 * Without model/notice: ORIGINAL fixtures (notice-sync-8 + a synthetic PDF), safe to commit.
 * With the owner's real files (31009…): keep the output OUTSIDE the repository (LEGO content).
 */
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { makeTestPdf } from '../tests/e2e/make-test-pdf';

const [baseUrl, outDir, label, modelPath, pdfPath] = process.argv.slice(2);
if (!baseUrl || !outDir || !label) throw new Error('usage: ux-captures.ts <baseUrl> <outDir> <label> [model] [pdf]');
mkdirSync(outDir, { recursive: true });

const model = modelPath ? { name: path.basename(modelPath), mimeType: 'text/plain', buffer: readFileSync(modelPath) }
  : { name: 'notice-sync-8.mpd', mimeType: 'text/plain', buffer: readFileSync(fileURLToPath(new URL('../tests/fixtures/notice-sync-8.mpd', import.meta.url))) };
const pdf = pdfPath ? { name: path.basename(pdfPath), mimeType: 'application/pdf', buffer: readFileSync(pdfPath) }
  : { name: 'notice-test.pdf', mimeType: 'application/pdf', buffer: makeTestPdf(3) };

const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
for (const [w, h] of [[1280, 800], [1512, 945]] as const) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(`${baseUrl}/atelier`);
  await page.locator('input[type=file][accept=".ldr,.mpd"]').first().setInputFiles(model);
  await page.getByTestId('render-status').waitFor({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Montage libre (avec notice)' }).click();
  await page.getByRole('tab', { name: 'Notice PDF' }).click();
  await page.getByTestId('pdf-input').setInputFiles(pdf);
  await page.getByTestId('pdf-canvas').waitFor();
  await page.waitForTimeout(2500); // PDF render, thumbnails (after)
  const overflow = await page.evaluate(() => {
    const s = document.querySelector('.pdf-scroll') as HTMLElement | null;
    return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, pdf: s ? s.scrollWidth - s.clientWidth : null };
  });
  const file = path.join(outDir, `${label}-${w}x${h}.png`);
  await page.screenshot({ path: file });
  console.log(file, 'débordement horizontal (px) :', JSON.stringify(overflow));
  await page.close();
}
await browser.close();

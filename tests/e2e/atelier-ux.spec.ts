import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, webkit, type Page } from '@playwright/test';
import { analyzeModel } from '../../src/domain/import/analyze';
import { addBooklet, addStep, assignToStep, createMapping, serializeMapping } from '../../src/domain/instructions/mapping';
import { makeTestPdf } from './make-test-pdf';

/**
 * UX batch on ORIGINAL fixtures (standalone atelier, nothing written to a library):
 * resizable separator (mouse, keyboard, double-click, memorised), PDF fitted to the width in every
 * mode, exact 3D picking after resizes, part thumbnails drawn from the real LDraw geometry.
 */
const SYNC8 = fileURLToPath(new URL('../fixtures/notice-sync-8.mpd', import.meta.url));
const SYNC8_BYTES = readFileSync(SYNC8);
const PDF = makeTestPdf(3);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const POS: [number, number, number][] = [[0, 0, 0], [80, 0, 0], [0, 0, -40], [80, 0, -40], [0, -24, 0], [80, -24, 0], [0, -24, -40], [80, -24, -40]];
const COLOUR = ['4', '1', '14', '14', '2', '2', '15', '0'];
/** Original test model: several references, one of them in two colours, plus a twin colour of the same part. */
const MULTI = `0 FILE ux-multi.ldr
0 Modèle de test UX : plusieurs références
0 Name: ux-multi.ldr
0 Author: Brick Lab Local - test original
0 !LICENSE CC0-1.0
1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat
1 4 100 0 0 1 0 0 0 1 0 0 0 1 3001.dat
1 1 200 0 0 1 0 0 0 1 0 0 0 1 3001.dat
1 4 0 0 100 1 0 0 0 1 0 0 0 1 3003.dat
1 14 100 0 100 1 0 0 0 1 0 0 0 1 3004.dat
1 2 200 0 100 1 0 0 0 1 0 0 0 1 3023.dat
1 15 0 0 200 1 0 0 0 1 0 0 0 1 3062b.dat
`;

function mapping() {
  const a = analyzeModel(SYNC8_BYTES.toString('utf8'), 'notice-sync-8.mpd');
  let m = createMapping({ sha256: sha(SYNC8_BYTES), fileName: 'notice-sync-8.mpd', rootName: a.model.rootName, occurrences: a.model.occurrences });
  m = addBooklet(m, { label: 'Livret 1', fileName: 'notice-test.pdf', sha256: sha(PDF), pageCount: 3 }).mapping;
  let last: string | null = null;
  for (const [init, occ] of [[{ page: 2, printedStep: '1' }, [0, 1, 2, 3]], [{ page: 3, printedStep: '2' }, [4, 5, 6, 7]]] as const) {
    const r = addStep(m, last, init);
    m = assignToStep(r.mapping, r.stepId, occ.map((i) => `notice-sync-8.mpd#${i}`)).mapping;
    last = r.stepId;
  }
  return Buffer.from(serializeMapping(m));
}

async function openAtelier(page: Page, model: { name: string; buffer: Buffer } = { name: 'notice-sync-8.mpd', buffer: SYNC8_BYTES }) {
  await page.goto('/atelier');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('input[type=file][accept=".ldr,.mpd"]').first().setInputFiles({ ...model, mimeType: 'text/plain' });
  await expect(page.getByTestId('render-status')).toContainText('Géométrie LDraw', { timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.__brickLab));
}
async function openNotice(page: Page) {
  await page.getByRole('tab', { name: 'Notice PDF' }).click();
  await page.getByTestId('pdf-input').setInputFiles({ name: 'notice-test.pdf', mimeType: 'application/pdf', buffer: PDF });
  await expect(page.getByTestId('pdf-page')).toContainText('/ 3');
}
const sideWidth = async (page: Page) => Number(await page.locator('main.workspace').getAttribute('data-side-width'));
/** Fitted page: the rendered canvas fills the panel (±2 px), no horizontal scroll. */
async function expectPdfFitted(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const box = document.querySelector('.pdf-scroll') as HTMLElement;
    const canvas = box.querySelector('canvas') as HTMLCanvasElement;
    return Math.abs(box.clientWidth - 2 - parseFloat(canvas.style.width)) <= 2 && box.scrollWidth <= box.clientWidth;
  }), { timeout: 10_000 }).toBe(true);
}
async function noPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}
async function dragSplitter(page: Page, dx: number) {
  const box = (await page.getByTestId('splitter').boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y, { steps: 4 });
  await page.mouse.move(x + dx, y, { steps: 4 });
  await page.mouse.up();
}
async function inSync(page: Page) {
  await expect.poll(() => page.evaluate(() => window.__brickLab!.sizeInSync()), { timeout: 5_000 }).toBe(true);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
/** Real pointer drop of brick i of notice-sync-8 (point at the surface it rests on, then click). */
async function dropAt(page: Page, i: number) {
  await page.getByTestId(`tray-3001.dat-${COLOUR[i]}`).click();
  await inSync(page);
  const [x, y, z] = POS[i]!;
  const p = await page.evaluate((pt) => window.__brickLab!.project(pt), [x, y + 24, z] as [number, number, number]);
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await page.mouse.click(p.x, p.y);
}

test.describe('separator and notice', () => {
  test.use({ viewport: { width: 1280, height: 800 } }); // 13" MacBook

  test('mouse, keyboard, double-click; memorised after reload; PDF re-fitted; no horizontal overflow', async ({ page }) => {
    await openAtelier(page);
    await page.getByRole('button', { name: 'Montage libre (avec notice)' }).click();
    await openNotice(page);
    // free mode: fitted to the width by default
    await expect(page.getByTestId('pdf-zoom')).toHaveText('Largeur');
    expect(await sideWidth(page)).toBe(400);
    await expectPdfFitted(page);
    const scale0 = Number(await page.getByTestId('pdf-canvas').getAttribute('data-scale'));
    await noPageOverflow(page);

    // mouse / trackpad: wider notice
    await dragSplitter(page, -300);
    expect(Math.abs((await sideWidth(page)) - 700)).toBeLessThanOrEqual(2);
    await expectPdfFitted(page);
    await expect.poll(async () => Number(await page.getByTestId('pdf-canvas').getAttribute('data-scale'))).toBeGreaterThan(scale0 * 1.5);
    await noPageOverflow(page);

    // keyboard (accessible separator)
    const sep = page.getByTestId('splitter');
    await expect(sep).toHaveAttribute('role', 'separator');
    await sep.focus();
    const w1 = await sideWidth(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(await sideWidth(page)).toBe(w1 - 32);
    await page.keyboard.press('Shift+ArrowLeft');
    expect(await sideWidth(page)).toBe(w1 + 48);
    await expect(sep).toHaveAttribute('aria-valuenow', String(w1 + 48));
    await page.keyboard.press('Home'); // widest notice, the 3D view keeps its minimum
    expect(await sideWidth(page)).toBe(1280 - 8 - 320);
    await noPageOverflow(page);
    await page.keyboard.press('End');
    expect(await sideWidth(page)).toBe(280);
    await page.keyboard.press('Shift+ArrowLeft');
    const kept = await sideWidth(page);

    // memorised in this browser
    await page.reload();
    await page.locator('input[type=file][accept=".ldr,.mpd"]').first().setInputFiles(SYNC8);
    await expect(page.getByTestId('render-status')).toContainText('Géométrie LDraw', { timeout: 60_000 });
    expect(await sideWidth(page)).toBe(kept);

    // double-click: default proportions
    await page.getByTestId('splitter').dblclick();
    expect(await sideWidth(page)).toBe(400);
    expect(await page.evaluate(() => localStorage.getItem('brick-lab:atelier-layout:v1'))).toContain('"atelier":null');

    // smaller windows: still no horizontal overflow, the 3D view keeps its minimum
    for (const [w, h] of [[1440, 900], [1024, 700], [800, 600]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(200);
      await noPageOverflow(page);
      expect(await sideWidth(page)).toBeLessThanOrEqual(w - 8 - 320);
    }
  });

  test('zoom controls still work, then back to the width', async ({ page }) => {
    await openAtelier(page);
    await page.getByRole('button', { name: 'Montage libre (avec notice)' }).click();
    await openNotice(page);
    await page.getByRole('button', { name: 'Zoom avant' }).click();
    await expect(page.getByTestId('pdf-zoom')).toHaveText(/^\d+ %$/);
    const fixed = await page.getByTestId('pdf-zoom').textContent();
    // a fixed zoom does not follow the panel
    await dragSplitter(page, -200);
    await page.waitForTimeout(400);
    await expect(page.getByTestId('pdf-zoom')).toHaveText(fixed!);
    await page.getByRole('button', { name: 'Zoom arrière' }).click();
    await page.getByRole('button', { name: 'Ajuster à la largeur' }).click();
    await expect(page.getByTestId('pdf-zoom')).toHaveText('Largeur');
    await expectPdfFitted(page);
  });
});

test('3D picking stays exact after several resizes (guided, then free)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openAtelier(page);
  await page.getByRole('button', { name: 'Commencer — mode guidé' }).click();
  const resizes: (() => Promise<void>)[] = [
    () => dragSplitter(page, -250),
    async () => { await page.getByTestId('splitter').focus(); await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Shift+ArrowRight'); },
    () => page.setViewportSize({ width: 1440, height: 900 }),
    () => dragSplitter(page, 180),
  ];
  for (const [i, resize] of resizes.entries()) {
    await resize();
    await dropAt(page, i);
    await expect(page.getByTestId('progress')).toHaveText(`${i + 1}/8 pièces posées`);
  }
  await page.getByTestId('mode-select').selectOption('freeManual');
  await dragSplitter(page, -120);
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const i of [4, 5]) await dropAt(page, i);
  await expect(page.getByTestId('progress')).toHaveText('6/8 pièces posées');
});

test('synchronised mode and mapping editor: one width per context, notice fitted, bricks placed after resizing', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openAtelier(page);
  await openNotice(page);
  await page.getByRole('tab', { name: 'Correspondances' }).click();
  await page.getByTestId('mapping-import').setInputFiles({ name: 'perso.brick-mapping.json', mimeType: 'application/json', buffer: mapping() });
  // editor: its own default width, its own memory
  expect(await sideWidth(page)).toBe(520);
  await dragSplitter(page, -100);
  const editorWidth = await sideWidth(page);
  expect(Math.abs(editorWidth - 620)).toBeLessThanOrEqual(2);
  await expectPdfFitted(page);
  await page.getByRole('tab', { name: 'Modèle' }).click();
  expect(await sideWidth(page)).toBe(400);
  await page.getByRole('button', { name: 'Commencer — notice synchronisée' }).click();
  await page.getByRole('tab', { name: 'Notice PDF' }).click();
  await expect(page.getByTestId('pdf-zoom')).toHaveText('Largeur');
  await dragSplitter(page, -200);
  await expectPdfFitted(page);
  for (const i of [0, 1, 2, 3]) await dropAt(page, i);
  // the step is done: the notice turns the page by itself, still fitted
  await expect(page.getByTestId('pdf-page')).toHaveText('PDF p. 3 / 3');
  await expectPdfFitted(page);
  await page.getByRole('tab', { name: 'Correspondances' }).click();
  expect(await sideWidth(page)).toBe(editorWidth);
});

test.describe('part thumbnails', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('real LDraw geometry, right colour, quantities, several references and colours, selection', async ({ page }) => {
    await openAtelier(page, { name: 'ux-multi.ldr', buffer: Buffer.from(MULTI) });
    await page.getByRole('button', { name: 'Montage libre (avec notice)' }).click();
    const items = page.locator('.tray-item');
    await expect(items).toHaveCount(6);
    await expect(page.locator('.tray-item img[data-thumb="ok"]')).toHaveCount(6, { timeout: 30_000 });
    // quantities and the technical reference kept small
    await expect(page.getByTestId('tray-3001.dat-4')).toContainText('×2');
    await expect(page.getByTestId('tray-3001.dat-4').locator('.ref')).toHaveText('3001');
    await expect(page.getByTestId('tray-3001.dat-1')).toContainText('×1');
    await expect(page.getByTestId('tray-3001.dat-4')).toHaveAttribute('title', /3001 · Red \(4\) · 2\/2 à poser/);

    // LDConfig of the local library: expected colour of each item
    const ldconfig = await page.evaluate(() => fetch('/api/ldraw/LDConfig.ldr').then((r) => r.text()));
    const hex = (code: string) => new RegExp(`CODE\\s+${code}\\s+VALUE\\s+#([0-9A-Fa-f]{6})`).exec(ldconfig)![1]!;
    const pixels = (testId: string) => page.getByTestId(testId).locator('img').evaluate(async (img: HTMLImageElement) => {
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let r = 0, gg = 0, b = 0, n = 0, h = 0;
      for (let i = 0; i < d.length; i += 4) {
        h = (h * 31 + d[i]! + d[i + 1]! * 7 + d[i + 2]! * 13 + d[i + 3]! * 17) >>> 0;
        if (d[i + 3]! < 200) continue;
        r += d[i]!; gg += d[i + 1]!; b += d[i + 2]!; n++;
      }
      return { mean: [r / n, gg / n, b / n], opaque: n / (d.length / 4), hash: h };
    });
    const ids = ['tray-3001.dat-4', 'tray-3001.dat-1', 'tray-3003.dat-4', 'tray-3004.dat-14', 'tray-3023.dat-2', 'tray-3062b.dat-15'];
    const codes = ['4', '1', '4', '14', '2', '15'];
    const shots = await Promise.all(ids.map(pixels));
    const ref = codes.map((c) => { const h = hex(c); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); });
    const dist = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
    shots.forEach((s, i) => {
      expect(s.opaque).toBeGreaterThan(0.05); // a part is drawn
      // the mean colour is closer to its own LDraw colour than to any other colour of the set
      const own = dist(s.mean, ref[i]!);
      for (const [j, other] of ref.entries()) if (codes[j] !== codes[i]) expect(own, `${ids[i]} vs couleur ${codes[j]}`).toBeLessThan(dist(s.mean, other));
    });
    // same part, two colours → two images; same colour, different parts → different shapes
    expect(shots[0]!.hash).not.toBe(shots[1]!.hash);
    expect(shots[0]!.hash).not.toBe(shots[2]!.hash);

    // the selected part is clearly marked
    await page.getByTestId('tray-3003.dat-4').click();
    await expect(page.getByTestId('tray-3003.dat-4')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('tray-3003.dat-4').locator('.held-badge')).toHaveText('en main');
    await expect(page.locator('.tray-item.held')).toHaveCount(1);

    // one shared renderer, cached: reopening the tray does not render again
    const stats = await page.evaluate(() => window.__brickLabThumbs!.stats());
    expect(stats.rendered).toBe(6);
  });

  test('explicit fallback when a shape cannot be drawn', async ({ page }) => {
    await page.addInitScript(() => { window.__brickLabThumbsFail = true; });
    await openAtelier(page, { name: 'ux-multi.ldr', buffer: Buffer.from(MULTI) });
    await page.getByRole('button', { name: 'Montage libre (avec notice)' }).click();
    await expect(page.locator('.tray-item [data-thumb="missing"]')).toHaveCount(6);
    await expect(page.getByTestId('tray-3001.dat-4')).toContainText('forme indisponible');
    await expect(page.getByTestId('tray-3001.dat-4')).toContainText('×2');
    await expect(page.getByTestId('tray-3001.dat-4')).toHaveAttribute('aria-label', /Pièce 3001, Red, 2 à poser/);
  });
});

test('WebKit (Safari engine): separator, memorised width, fitted notice, thumbnails, placement', async () => {
  const safari = await webkit.launch().catch(() => null);
  test.skip(!safari, 'WebKit de Playwright indisponible');
  const page = await safari!.newPage({ viewport: { width: 1280, height: 800 }, baseURL: 'http://127.0.0.1:3000' });
  try {
    await openAtelier(page);
    await page.getByRole('button', { name: 'Commencer — mode guidé' }).click();
    await expect(page.locator('.tray-item img[data-thumb="ok"]').first()).toBeVisible({ timeout: 30_000 });
    await openNotice(page);
    await dragSplitter(page, -240);
    expect(Math.abs((await sideWidth(page)) - 640)).toBeLessThanOrEqual(2);
    await expectPdfFitted(page);
    await noPageOverflow(page);
    await dropAt(page, 0);
    await expect(page.getByTestId('progress')).toHaveText('1/8 pièces posées');
  } finally {
    await safari!.close();
  }
});

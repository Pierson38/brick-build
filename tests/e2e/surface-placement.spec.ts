import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Surface-assisted placement on repository fixtures (always runs, no third-party file needed).
// The pointer designates the spot ON a surface (ground or top of a placed brick); the app
// derives the height from that surface. 3001 bricks: 24 LDU high, so a brick whose origin is
// at y rests on the surface y + 24.
// No PageUp/PageDown and no "Poser à la position cible (aide)" button are used here.

const fixture = (name: string) => fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url));

async function importModel(page: Page, file: string | { name: string; text: string }) {
  const input = page.locator('input[type=file][accept=".ldr,.mpd"]').first();
  if (typeof file === 'string') await input.setInputFiles(fixture(file));
  else await input.setInputFiles({ name: file.name, mimeType: 'text/plain', buffer: Buffer.from(file.text) });
  await expect(page.getByTestId('render-status')).toContainText('Géométrie LDraw', { timeout: 30_000 });
  await page.waitForFunction(() => Boolean(window.__brickLab));
}

async function point(page: Page, ldraw: [number, number, number]) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const p = await page.evaluate((pt) => window.__brickLab!.project(pt), ldraw);
  await page.mouse.move(p.x, p.y, { steps: 4 });
  return p;
}

const keys: string[] = [];
test.beforeEach(async ({ page }) => {
  keys.length = 0;
  page.on('console', () => {});
  await page.goto('/atelier');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.exposeFunction('__recordKey', (k: string) => keys.push(k));
  await page.addInitScript(() => window.addEventListener('keydown', (e) => (window as unknown as { __recordKey: (k: string) => void }).__recordKey(e.key)));
});

test('free mode: two levels placed by pointing only, height taken from the surface under the pointer', async ({ page }) => {
  await importModel(page, 'mini-4-pieces.mpd');
  await page.getByRole('button', { name: 'Montage libre (avec notice)' }).click();
  // spot pointed on the supporting surface: ground (y = 24) or top of the brick below (y = 0)
  const order: [string, [number, number, number]][] = [['1', [80, 24, 0]], ['4', [0, 24, 0]], ['14', [80, 0, 0]], ['2', [0, 0, 0]]];
  for (const [i, [colour, at]] of order.entries()) {
    await page.getByTestId(`tray-3001.dat-${colour}`).click();
    await expect(page.getByTestId('held-info')).toContainText('Niveau auto (surface)');
    const p = await point(page, at);
    await expect(page.getByTestId('target-found')).toBeVisible(); // feedback before the click
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId('progress')).toHaveText(`${i + 1}/4 pièces posées`);
  }
  expect(keys.filter((k) => k === 'PageUp' || k === 'PageDown')).toEqual([]);
  expect(keys).toEqual([]); // not a single key for the whole build
});

test('far from any spot: no magnet, the click is refused with a message', async ({ page }) => {
  await importModel(page, 'no-steps.ldr');
  await page.getByRole('button', { name: 'Montage libre (avec notice)' }).click();
  await page.getByTestId('tray-3001.dat-4').click();
  const p = await point(page, [0, 24, 120]);
  await expect(page.getByTestId('target-found')).toHaveCount(0);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('message')).toContainText('Trop loin');
  await expect(page.getByTestId('progress')).toHaveText('0/2 pièces posées');
});

test('identical bricks: each pointed spot gets its own brick, an occupied spot is never offered', async ({ page }) => {
  const text = ['0 FILE same.ldr', '1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat', '1 4 80 0 0 1 0 0 0 1 0 0 0 1 3001.dat', '1 4 0 -24 0 1 0 0 0 1 0 0 0 1 3001.dat'].join('\n');
  await importModel(page, { name: 'same.mpd', text });
  await page.getByRole('button', { name: 'Montage libre (avec notice)' }).click();
  await page.getByTestId('tray-3001.dat-4').click();
  let p = await point(page, [80, 24, 0]);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('progress')).toHaveText('1/3 pièces posées');
  // pointing at the brick just placed: the surface is its top, so the brick goes ABOVE it (no target there)
  p = await point(page, [80, 0, 0]);
  await expect(page.getByTestId('target-found')).toHaveCount(0);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('progress')).toHaveText('1/3 pièces posées');
  // the two remaining spots, on two levels
  for (const [n, at] of [[2, [0, 24, 0]], [3, [0, 0, 0]]] as const) {
    p = await point(page, [...at]);
    await expect(page.getByTestId('target-found')).toBeVisible();
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId('progress')).toHaveText(`${n}/3 pièces posées`);
  }
});

test('manual layers remain as a fallback; A returns to surface mode', async ({ page }) => {
  await importModel(page, 'mini-4-pieces.mpd');
  await page.getByRole('button', { name: 'Montage libre (avec notice)' }).click();
  await page.getByTestId('tray-3001.dat-2').click();
  await point(page, [80, 24, 0]);
  await page.keyboard.press('PageDown');
  await expect(page.getByTestId('held-info')).toContainText('Niveau manuel 1/2');
  await page.keyboard.press('PageUp');
  await expect(page.getByTestId('held-info')).toContainText('Niveau manuel 2/2');
  await page.keyboard.press('a');
  await expect(page.getByTestId('held-info')).toContainText('Niveau auto (surface)');
});

test('trackpad-like jitter: a click with a 2 px slip still drops, a drag orbits without dropping', async ({ page }) => {
  await importModel(page, 'no-steps.ldr');
  await page.getByRole('button', { name: 'Montage libre (avec notice)' }).click();
  await page.getByTestId('tray-3001.dat-4').click();
  let p = await point(page, [0, 24, 0]);
  await expect(page.getByTestId('target-found')).toBeVisible();
  // drag: orbit, no drop
  await page.mouse.down();
  await page.mouse.move(p.x + 60, p.y + 10, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('progress')).toHaveText('0/2 pièces posées');
  // small slip during the click (typical of a trackpad press)
  p = await point(page, [0, 24, 0]);
  await page.mouse.down();
  await page.mouse.move(p.x + 2, p.y + 1);
  await page.mouse.up();
  await expect(page.getByTestId('progress')).toHaveText('1/2 pièces posées');
});

test('nothing below yet: pointing at the spot in the air finds it (free order, top brick first)', async ({ page }) => {
  await importModel(page, 'mini-4-pieces.mpd');
  await page.getByRole('button', { name: 'Montage libre (avec notice)' }).click();
  await page.getByTestId('tray-3001.dat-14').click();
  const p = await point(page, [80, -24, 0]); // where the yellow brick goes (its top), nothing under it yet
  await expect(page.getByTestId('target-found')).toBeVisible();
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('progress')).toHaveText('1/4 pièces posées');
  expect(keys).toEqual([]);
});

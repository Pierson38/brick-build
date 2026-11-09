import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { analyzeModel } from '../../src/domain/import/analyze';
import { addBooklet, addStep, assignToStep, createMapping, serializeMapping, type InstructionMapping } from '../../src/domain/instructions/mapping';
import { makeTestPdf } from './make-test-pdf';

/**
 * P6 on SYNTHETIC files only (original fixture + generated PDF): booklet ↔ 3D mapping editor,
 * synchronised build, restore, undo/rewind, booklet change and explicit fallback.
 */
const FIXTURE = fileURLToPath(new URL('../fixtures/notice-sync-8.mpd', import.meta.url));
const MODEL_BYTES = readFileSync(FIXTURE);
const PDF = makeTestPdf(3);
const OTHER_PDF = makeTestPdf(4);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const id = (i: number) => `notice-sync-8.mpd#${i}`;
// LDraw positions of the 8 bricks (see the fixture)
// the second row (z = -40) faces the default camera, so each brick is visible when it is placed
const POS: [number, number, number][] = [[0, 0, 0], [80, 0, 0], [0, 0, -40], [80, 0, -40], [0, -24, 0], [80, -24, 0], [0, -24, -40], [80, -24, -40]];
const COLOUR = ['4', '1', '14', '14', '2', '2', '15', '0'];

/** The mapping a user would have entered: 4 booklet steps (2 on page 2, a callout on page 3). */
function referenceMapping(): InstructionMapping {
  const a = analyzeModel(MODEL_BYTES.toString('utf8'), 'notice-sync-8.mpd');
  let m = createMapping({ sha256: sha(MODEL_BYTES), fileName: 'notice-sync-8.mpd', rootName: a.model.rootName, occurrences: a.model.occurrences });
  m = addBooklet(m, { label: 'Livret 1', fileName: 'notice-test.pdf', sha256: sha(PDF), pageCount: 3 }).mapping;
  let last: string | null = null;
  for (const [init, occ] of [[{ page: 2, printedStep: '1' }, [0, 1]], [{ page: 2, printedStep: '2', repeat: 2 }, [2, 3]], [{ page: 3, printedStep: '3', callout: '1' }, [4]], [{ page: 3, printedStep: '3' }, [5, 6, 7]]] as const) {
    const r = addStep(m, last, init);
    m = assignToStep(r.mapping, r.stepId, occ.map(id)).mapping;
    last = r.stepId;
  }
  return m;
}

async function importModel(page: Page) {
  await page.getByTestId('model-input').or(page.locator('aside input[type=file][accept=".ldr,.mpd"]')).first().setInputFiles(FIXTURE);
  await expect(page.getByTestId('render-status')).toContainText('Géométrie LDraw', { timeout: 30_000 });
  await page.waitForFunction(() => Boolean(window.__brickLab));
}
const importPdf = (page: Page, buffer: Buffer, name = 'notice-test.pdf') => page.getByTestId('pdf-input').setInputFiles({ name, mimeType: 'application/pdf', buffer });
const importMappingFile = (page: Page, m: InstructionMapping | string) =>
  page.getByTestId('mapping-import').setInputFiles({ name: 'perso.brick-mapping.json', mimeType: 'application/json', buffer: Buffer.from(typeof m === 'string' ? m : serializeMapping(m)) });
const scene = (page: Page) => page.evaluate(() => window.__brickLab!.sceneSummary());

async function settle(page: Page) {
  await page.waitForTimeout(150);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
/** Real click on the top face of a brick (origin = top of a 3001 in LDraw). */
async function clickBrick(page: Page, i: number, alt = false) {
  await settle(page);
  const [x, y, z] = POS[i]!;
  const p = await page.evaluate((pt) => window.__brickLab!.project(pt), [x + 10, y, z + 5] as [number, number, number]);
  if (alt) await page.keyboard.down('Alt');
  await page.mouse.click(p.x, p.y);
  if (alt) await page.keyboard.up('Alt');
}
/** Real pointer drop of a 3001 brick: point at the surface it rests on, then click. */
async function dropAt(page: Page, i: number) {
  await page.getByTestId(`tray-3001.dat-${COLOUR[i]}`).click();
  await settle(page);
  const [x, y, z] = POS[i]!;
  const p = await page.evaluate((pt) => window.__brickLab!.project(pt), [x, y + 24, z] as [number, number, number]);
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await page.mouse.click(p.x, p.y);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/atelier');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('editor: booklet, steps on shared pages, 3D assignment, duplicates, validation, export', async ({ page }) => {
  await importModel(page);
  await expect(page.getByTestId('sync-availability')).toContainText('indisponible : aucune correspondance');
  await expect(page.getByRole('button', { name: 'Commencer — notice synchronisée' })).toHaveCount(0);

  await page.getByRole('tab', { name: 'Correspondances' }).click();
  await expect(page.getByTestId('mapping-coverage')).toHaveText('0/8 pièces affectées · 0 étape(s)');
  expect(await scene(page)).toMatchObject({ solid: 0, selected: 0, ghost: 8 });
  await importPdf(page, PDF);
  await page.getByTestId('add-booklet').click();
  await page.getByRole('button', { name: 'Page suivante' }).click();
  await expect(page.getByTestId('pdf-page')).toHaveText('PDF p. 2 / 3');

  // step 1, page 2: red + blue (list buttons)
  await page.getByTestId('mapping-new-step').click();
  await expect(page.getByTestId('mapping-page')).toHaveValue('2');
  await expect(page.getByTestId('mapping-printed')).toHaveValue('1');
  await page.getByTestId('unassigned-add-3001.dat|4').click();
  await page.getByTestId('unassigned-add-3001.dat|1').click();
  expect(await scene(page)).toMatchObject({ solid: 0, selected: 2, ghost: 6 });

  // step 2, same page, "2x": the two yellow bricks
  await page.getByTestId('mapping-new-step').click();
  await expect(page.getByTestId('mapping-printed')).toHaveValue('2');
  await page.getByTestId('mapping-repeat').fill('2');
  await page.getByTestId('unassigned-add-3001.dat|14').click();
  await expect(page.getByTestId('mapping-issues')).toContainText('pas un multiple de 2');
  await page.getByTestId('unassigned-add-3001.dat|14').click();
  await expect(page.getByTestId('mapping-issues')).not.toContainText('pas un multiple');
  expect(await scene(page)).toMatchObject({ solid: 2, selected: 2, ghost: 4 });

  // step 3 · callout 1, page 3: the first green brick, picked in 3D
  await page.getByRole('button', { name: 'Page suivante' }).click();
  await page.getByTestId('mapping-new-step').click();
  await expect(page.getByTestId('mapping-page')).toHaveValue('3');
  await page.getByTestId('mapping-callout').fill('1');
  await clickBrick(page, 4);
  await expect(page.getByTestId('message')).toContainText('ajoutée à Étape 3 · encadré 1');
  // a second click on a highlighted brick removes it, a third adds it back
  await clickBrick(page, 4);
  await expect(page.getByTestId('message')).toContainText('retirée de');
  await expect(page.getByTestId('mapping-coverage')).toContainText('4/8');
  await clickBrick(page, 4);
  await expect(page.getByTestId('mapping-coverage')).toContainText('5/8');

  // step 3, page 3: the rest, with the LDraw-step aid (only the free bricks of LDraw step 2)
  await page.getByTestId('mapping-new-step').click();
  await expect(page.getByTestId('mapping-printed')).toHaveValue('3');
  await expect(page.getByTestId('mapping-callout')).toHaveValue('');
  // a brick of an earlier step is not taken silently
  await clickBrick(page, 4);
  await expect(page.getByTestId('message')).toContainText('déjà dans Étape 3 · encadré 1 (p. 3) : ⌥-clic');
  await expect(page.getByTestId('mapping-coverage')).toContainText('5/8');
  await page.getByTestId('assign-ldraw-step').click();
  await expect(page.getByTestId('mapping-coverage')).toHaveText('8/8 pièces affectées · 4 étape(s)');
  expect(await scene(page)).toMatchObject({ solid: 5, selected: 3, ghost: 0 });
  await expect(page.getByTestId('mapping-status')).toHaveText('Valide : mode synchronisé disponible');

  // ⌥-click moves explicitly; validation then flags the emptied callout step (warning, still valid)
  await clickBrick(page, 4, true);
  await expect(page.getByTestId('message')).toContainText('déplacée dans Étape 3');
  await expect(page.getByTestId('mapping-issues')).toContainText('n’a aucune pièce');
  await page.getByRole('button', { name: 'Étape de notice précédente' }).click();
  await page.getByLabel('Montrer en fantôme les pièces des étapes suivantes').check();
  await clickBrick(page, 4, true);
  await expect(page.getByTestId('mapping-issues')).not.toContainText('n’a aucune pièce');
  await page.getByTestId('mapping-verified').check();
  await expect(page.getByTestId('mapping-issues')).toContainText('3/4 étape(s) non vérifiée(s)');
  await page.screenshot({ path: 'test-results/proof-p6-editor.png' });

  // export: ids, numbers and fingerprints only
  const download = page.waitForEvent('download');
  await page.getByTestId('mapping-export').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('notice-sync-8.brick-mapping.json');
  const exported = JSON.parse(readFileSync((await file.path())!, 'utf8')) as InstructionMapping;
  expect(exported.steps.map((s) => [s.page, s.printedStep, s.callout ?? null, s.repeat ?? null, s.occurrenceIds.length])).toEqual([
    [2, '1', null, null, 2], [2, '2', null, 2, 2], [3, '3', '1', null, 1], [3, '3', null, null, 3],
  ]);
  expect(exported.booklets[0]).toMatchObject({ fileName: 'notice-test.pdf', sha256: sha(PDF), pageCount: 3 });
  expect(JSON.stringify(exported)).not.toContain('Page de test');

  // a re-imported file with a duplicate is reported and can be fixed
  const dup = structuredClone(exported) as unknown as { steps: { occurrenceIds: string[] }[] };
  dup.steps[3]!.occurrenceIds.push(id(0));
  await importMappingFile(page, JSON.stringify(dup));
  await expect(page.getByTestId('mapping-status')).toContainText('Brouillon');
  await expect(page.getByTestId('mapping-duplicates')).toContainText('1 pièce(s) en double');
  await page.getByRole('button', { name: 'Garder la première étape' }).click();
  await expect(page.getByTestId('mapping-status')).toHaveText('Valide : mode synchronisé disponible');

  // the mapping of another model is refused, the current one is kept
  await importMappingFile(page, { ...referenceMapping(), model: { ...referenceMapping().model, sha256: 'e'.repeat(64) } });
  await expect(page.getByTestId('message')).toContainText('Import refusé : Ces correspondances ont été faites pour un autre fichier');
  await expect(page.getByTestId('mapping-status')).toHaveText('Valide : mode synchronisé disponible');

  await page.getByRole('button', { name: 'Terminer l’édition' }).click();
  await expect(page.getByTestId('sync-availability')).toContainText('Notice synchronisée disponible : 4 étape(s)');
  await expect(page.getByRole('button', { name: 'Commencer — notice synchronisée' })).toBeVisible();
});

test('synchronised build: page per step, only the step bricks, auto-advance, consult, rewind, reload, booklet change', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    const host = new URL(r.url()).hostname;
    if (!['127.0.0.1', 'localhost'].includes(host) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) external.push(r.url());
  });
  await importModel(page);
  await page.getByRole('tab', { name: 'Correspondances' }).click();
  await importMappingFile(page, referenceMapping());
  await expect(page.getByTestId('mapping-status')).toHaveText('Valide : mode synchronisé disponible');
  await page.getByRole('button', { name: 'Terminer l’édition' }).click();
  await page.getByRole('button', { name: 'Commencer — notice synchronisée' }).click();

  await expect(page.getByTestId('step-indicator')).toHaveText('Étape 1 / 4');
  await expect(page.getByTestId('notice-step')).toHaveText('Notice : Étape 1, p. 2');
  // the booklet is not open yet: said, and no other PDF is used instead
  await expect(page.getByTestId('sync-missing-booklet')).toContainText('importe « notice-test.pdf » (3 p.) pour voir la page 2');
  await importPdf(page, PDF);
  await expect(page.getByTestId('pdf-page')).toHaveText('PDF p. 2 / 3');
  await expect(page.getByTestId('sync-banner')).toContainText('(1re étape imprimée sur 2 de la page)');

  // only the bricks of booklet step 1 are offered
  await expect(page.getByTestId('tray-3001.dat-4')).toBeVisible();
  await expect(page.getByTestId('tray-3001.dat-1')).toBeVisible();
  await expect(page.getByTestId('tray-3001.dat-14')).toHaveCount(0);
  await dropAt(page, 0);
  await expect(page.getByTestId('progress')).toHaveText('1/8 pièces posées');
  await dropAt(page, 1);
  await expect(page.getByTestId('message')).toHaveText('Étape 1 terminée ! Suivante : Étape 2 (×2), p. 2.');
  await expect(page.getByTestId('step-indicator')).toHaveText('Étape 2 / 4');
  await expect(page.getByTestId('pdf-page')).toHaveText('PDF p. 2 / 3'); // same page, second step on it
  await expect(page.getByTestId('sync-banner')).toContainText('(2e étape imprimée sur 2 de la page)');
  await dropAt(page, 2);
  await dropAt(page, 3);
  await expect(page.getByTestId('notice-step')).toHaveText('Notice : Étape 3 · encadré 1, p. 3');
  await expect(page.getByTestId('pdf-page')).toHaveText('PDF p. 3 / 3'); // auto page turn

  // consult a past step: its page and bricks, nothing removed
  await page.getByRole('button', { name: 'Étape précédente' }).click();
  await expect(page.getByTestId('sync-step')).toHaveText('Étape 2 (×2)');
  await expect(page.getByTestId('pdf-page')).toHaveText('PDF p. 2 / 3');
  expect((await scene(page)).selected).toBe(2);
  await expect(page.getByTestId('progress')).toHaveText('4/8 pièces posées');
  await page.getByRole('button', { name: 'Revenir à l’étape en cours' }).click();
  await expect(page.getByTestId('pdf-page')).toHaveText('PDF p. 3 / 3');
  expect((await scene(page)).selected).toBe(0);

  // rewind: start again from step 2 (its bricks and the later ones are removed)
  await page.getByRole('button', { name: 'Étape précédente' }).click();
  await page.getByTestId('sync-rewind').click();
  await expect(page.getByTestId('confirm-rewind')).toContainText('2 pièce(s) posée(s) à cette étape et aux suivantes seront retirées');
  await page.getByTestId('confirm-rewind').getByRole('button', { name: 'Reprendre depuis cette étape' }).click();
  await expect(page.getByTestId('progress')).toHaveText('2/8 pièces posées');
  await expect(page.getByTestId('step-indicator')).toHaveText('Étape 2 / 4');
  await dropAt(page, 2);
  await dropAt(page, 3);
  await dropAt(page, 4);
  await expect(page.getByTestId('notice-step')).toHaveText('Notice : Étape 3, p. 3');
  // undo crosses back into the previous step, consistently
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByTestId('notice-step')).toHaveText('Notice : Étape 3 · encadré 1, p. 3');
  await dropAt(page, 4);
  await expect(page.getByTestId('progress')).toHaveText('5/8 pièces posées');

  // reload: the mapping and the build come back; the PDF is asked again and checked
  await page.reload();
  await importModel(page);
  await expect(page.getByTestId('message')).toHaveText('Progression restaurée : 5/8 pièces posées.');
  await expect(page.getByTestId('notice-step')).toHaveText('Notice : Étape 3, p. 3');
  await expect(page.getByTestId('mode-select')).toHaveAttribute('data-value', 'synced');
  await expect(page.getByTestId('sync-missing-booklet')).toBeVisible();
  // a wrong notice (other edition, other fingerprint) is shown as such, never as the booklet
  await importPdf(page, OTHER_PDF, 'autre-notice.pdf');
  await expect(page.getByTestId('pdf-page')).toHaveText('PDF p. 3 / 4');
  await expect(page.getByTestId('sync-missing-booklet')).toContainText('Un autre PDF ne sera pas utilisé à sa place');
  await importPdf(page, PDF);
  await expect(page.getByTestId('pdf-page')).toHaveText('PDF p. 3 / 3');
  await expect(page.getByTestId('sync-missing-booklet')).toHaveCount(0);

  // looking at the other PDF by hand: warned, one click back to the step page
  await page.getByTestId('pdf-booklet').selectOption({ label: 'autre-notice.pdf' });
  await expect(page.getByTestId('pdf-page')).toHaveText('PDF p. 1 / 4');
  await expect(page.getByTestId('sync-off-page')).toContainText('Page affichée ≠ page de l’étape');
  await page.getByRole('button', { name: 'Revenir à la p. 3' }).click();
  await expect(page.getByTestId('pdf-page')).toHaveText('PDF p. 3 / 3');
  await expect(page.getByTestId('sync-off-page')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/proof-p6-synced.png' });

  for (const i of [5, 6, 7]) await dropAt(page, i);
  await expect(page.getByTestId('message')).toHaveText('Bravo, modèle terminé !');
  await expect(page.getByTestId('progress')).toHaveText('8/8 pièces posées');
  expect(external).toEqual([]);
});

test('without a valid mapping the synchronised mode is not offered, and a synced save falls back explicitly', async ({ page }) => {
  await importModel(page);
  await page.getByRole('tab', { name: 'Correspondances' }).click();
  // incomplete mapping (one brick missing): draft only
  const partial = referenceMapping();
  const incomplete = { ...partial, steps: partial.steps.map((s, i) => (i === 3 ? { ...s, occurrenceIds: s.occurrenceIds.slice(0, 2) } : s)) };
  await importMappingFile(page, incomplete);
  await expect(page.getByTestId('mapping-status')).toContainText('Brouillon');
  await page.getByRole('button', { name: 'Terminer l’édition' }).click();
  await expect(page.getByTestId('sync-availability')).toContainText('1 pièce(s) du modèle non affectée(s)');
  await expect(page.getByRole('button', { name: 'Commencer — notice synchronisée' })).toHaveCount(0);

  // complete it, play two bricks in synced mode
  await page.getByRole('tab', { name: 'Correspondances' }).click();
  await importMappingFile(page, referenceMapping());
  await page.getByRole('button', { name: 'Terminer l’édition' }).click();
  await page.getByRole('button', { name: 'Commencer — notice synchronisée' }).click();
  await dropAt(page, 0);
  await dropAt(page, 1);
  await expect(page.getByTestId('step-indicator')).toHaveText('Étape 2 / 4');

  // the mapping disappears (other browser profile, storage cleared…): explicit fallback, bricks kept
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('brick-lab:mapping:')) localStorage.removeItem(k);
  });
  await page.reload();
  await importModel(page);
  await expect(page.getByTestId('message')).toContainText('aucune correspondance valide pour ce fichier : reprise en montage libre');
  await expect(page.getByTestId('mode-select')).toHaveAttribute('data-value', 'freeManual');
  await expect(page.getByTestId('notice-step')).toHaveCount(0);
  await expect(page.getByTestId('progress')).toHaveText('2/8 pièces posées');
  await expect(page.getByTestId('mode-select').locator('[data-value=synced]:not([aria-disabled])')).toHaveCount(0);

  // re-importing the personal mapping file brings the synchronised mode back, same bricks
  await page.getByRole('tab', { name: 'Correspondances' }).click();
  await importMappingFile(page, referenceMapping());
  await page.getByRole('button', { name: 'Terminer l’édition' }).click();
  await page.getByTestId('mode-select').locator('[data-value="synced"]').click();
  await expect(page.getByTestId('notice-step')).toHaveText('Notice : Étape 2 (×2), p. 2');
  await expect(page.getByTestId('progress')).toHaveText('2/8 pièces posées');
});

test('P5 progress (schema v1) is still restored', async ({ page }) => {
  const a = analyzeModel(MODEL_BYTES.toString('utf8'), 'notice-sync-8.mpd');
  const hash = sha(MODEL_BYTES);
  await page.evaluate(([h, first]) => localStorage.setItem(`brick-lab:progress:${h}`, JSON.stringify({
    schemaVersion: 1, modelContentHash: h, displayName: 'notice-sync-8.mpd', buildMode: 'guided', placedOccurrenceIds: [first], totalOccurrences: 8, updatedAtIso: '2026-11-03T12:00:00.000Z',
  })), [hash, a.model.occurrences[0]!.occurrenceId] as const);
  await importModel(page);
  await expect(page.getByTestId('message')).toHaveText('Progression restaurée : 1/8 pièces posées.');
  await expect(page.getByTestId('mode-select')).toHaveAttribute('data-value', 'guided');
  await expect(page.getByTestId('step-indicator')).toHaveText('Étape 1 / 2');
});

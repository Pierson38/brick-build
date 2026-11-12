# E2E test dependencies on the interface

Automated survey (`grep`) over `tests/e2e`, `tests/recette`, `tests/perf` and `scripts/ux-captures.ts`, base `a1309a4`. **Redesign rule**: everything below is kept as is; if a targeted label changes, the test is updated **in the same commit**, with the reason.

## 1. `data-testid` (≈170 distinct, number of uses in parentheses)

Dynamically built identifiers: `tray-<partKey>-<colorCode>`, `set-card-<n°>`, `discovered-<dossier>`, `discovered-mapping-<fichier>`, `omr-download-<fichier>`, `mapping-<fichier>`, `repair-<sha8>`, `unassigned-add-<partKey>|<couleur>`, `step-remove-<clé>`, `rot-<x|y|z>-<minus|plus>`, `gizmo-<x|y|z>`, `diff-<row label>` (e.g. `diff-Pièces posées`, `diff-Mode`, `diff-Page de la notice`, `diff-Correspondances jouées`), `build-<buildId>`, `file-<kind>`.

`progress` (77) · `message` (57) · `tray-3001.dat-4` (33) · `pdf-page` (30) · `mode-select` (30) · `render-status` (25) · `selection-info` (19) · `step-indicator` (17) · `held-info` (16) · `select-assembly` (15) · `card-build` (14) · `notice-step` (13) · `target-found` (11) · `pdf-zoom` (11) · `tray-3001.dat-1` (10) · `set-card-90001-1` (10) · `clear-selection` (10) · `quick-input` (9) · `pdf-input` (9) · `pdf-row` (8) · `move-selection` (8) · `tray-30157.dat-71` (7) · `sync-missing-booklet` (7) · `search-online` (7) · `search-number` (7) · `mapping-status` (7) · `lift-up` (7) · `import-submit` (7) · `detail-message` (7) · `build-canvas` (7) · `step-8` (6) · `model-card` (6) · `mode-switch-confirm` (6) · `mapping-coverage` (6) · `lift-down` (6) · `tray-3001.dat-14` (5) · `step-1` (5) · `splitter` (5) · `snap-pieces` (5) · `set-card-31040-1` (5) · `search-submit` (5) · `pdf-canvas` (5) · `mapping-issues` (5) · `import-done` (5) · `compat-card` (5) · `card-progress` (5) · `back-to-collection` (5) · `assist-place` (5) · `add-errors` (5) · `tray-3001.dat-${COLOUR[i]}` (4) · `sync-availability` (4) · `set-card-90003-1` (4) · `save-state` (4) · `save-conflict` (4) · `quality` (4) · `progress-choice` (4) · `omr-status` (4) · `occurrence-count` (4) · `mapping-new-step` (4) · `manip-bar` (4) · `free-info` (4) · `detail-modes` (4) · `confirm-name` (4) · `compat-headline` (4) · `build-check` (4) · `already-in-collection` (4) · `tray-3023.dat-25` (3) · `tray-3003.dat-4` (3) · `tray-3001.dat-2` (3) · `step-count` (3) · `status` (3) · `snap-info` (3) · `rot-x-plus` (3) · `mapping-printed` (3) · `mapping-import` (3) · `legacy-saves` (3) · `inventory-check` (3) · `gizmo-coords` (3) · `free-done` (3) · `discovered-name` (3) · `discovered-add` (3) · `detail-progress` (3) · `detail-build` (3) · `atelier-notes` (3) · `add-set` (3) · `xray` (2) · `unassigned-add-3001.dat|14` (2) · `tray-3001.dat-${colour}` (2) · `sync-step` (2) · `sync-off-page` (2) · `sync-banner` (2) · `source-rebrickable` (2) · `source-omr` (2) · `source-local` (2) · `snap-miss` (2) · `set-card-90020-1` (2) · `set-card-31009-1` (2) · `set-card-${CANON}` (2) · `repair-${sha(original).slice(0,` (2) · `omr-download-90020-1.mpd` (2) · `omr-download-${CANON}.mpd` (2) · `model-input` (2) · `missing-parts` (2) · `mapping-page` (2) · `mapping-callout` (2) · `lego-link` (2) · `import-build` (2) · `height-auto` (2) · `gizmo-x` (2) · `gizmo-step` (2) · `gizmo-rotate` (2) · `gizmo-apply` (2) · `existing-set` (2) · `discovery` (2) · `diff-Pièces` (2) · `diff-Mode` (2) · `detail-mapping-input` (2) · `build-label` (2) · `browser-save` (2) · `atelier-error` (2) · `variant-note` (1) · `unassigned-add-3001.dat|4` (1) · `unassigned-add-3001.dat|1` (1) · `tray-32062.dat-4` (1) · `tray-3034.dat-15` (1) · `tray-${target.partKey}-${target.colorCode}` (1) · `target-existing` (1) · `sync-rewind` (1) · `sync-page` (1) · `sources` (1) · `source-lego` (1) · `snap-model` (1) · `set-card-90100-1` (1) · `set-card-90004-1` (1) · `set-card-${s.number}` (1) · `search` (1) · `rot-z-plus` (1) · `resources` (1) · `remove-piece` (1) · `rejected` (1) · `pdf-only` (1) · `pdf-booklet` (1) · `pdf-assoc` (1) · `orientation-info` (1) · `omr-download-90023-1_Bad.mpd` (1) · `omr-download-90023-1.mpd` (1) · `omr-download-90020-1_Tower.mpd` (1) · `nothing-found` (1) · `no-result` (1) · `no-model` (1) · `mapping-verified` (1) · `mapping-step-select` (1) · `mapping-repeat` (1) · `mapping-perso.brick-mapping.json` (1) · `mapping-export` (1) · `mapping-duplicates` (1) · `mapping-90020-1.brick-mapping.json` (1) · `gizmo-z` (1) · `gizmo-translate` (1) · `free-pose` (1) · `file-state` (1) · `file-pdf` (1) · `discovered-mapping-31040-1.brick-mapping.json` (1) · `discovered-31040-1` (1) · `discovered-31009-1` (1) · `discovered-${s.number}` (1) · `diff-Page` (1) · `diff-Correspondances` (1) · `detail-save-name` (1) · `detail-problems` (1) · `detail-name` (1) · `detail-mapping` (1) · `detail-free` (1) · `detail-add-pdf` (1) · `detail-add-build` (1) · `confirm-restart` (1) · `choice-with-mapping` (1) · `choice-library` (1) · `choice-browser` (1) · `build-choice` (1) · `browser-save-take` (1) · `browser-save-confirm` (1) · `assign-ldraw-step` (1) · `add-booklet` (1) · 


## 2. ARIA roles + accessible names (exact text)

Exact labels are the app's French UI strings and are kept verbatim; an English gloss is given in parentheses.

| Role | Name | Uses |
|---|---|---|
| button | `Montage libre (avec notice)` (Free building (with instructions)) | 23 |
| button | `Annuler` (Cancel/Undo) (including `exact: true`) | 21 |
| button | `Commencer — mode guidé` (Start — guided mode) | 16 |
| button | `Commencer — notice synchronisée` (Start — synced instructions) | 11 |
| tab | `Correspondances` (Mappings) | 8 |
| tab | `Notice PDF` (PDF instructions) | 6 |
| tab | `Modèle` (Model) | 2 |
| button | `Terminer l’édition` (Finish editing) | 6 |
| button | `Page suivante` (Next page) / `Page précédente` (Previous page) | 6 / 1 |
| button | `Zoom avant` (Zoom in) / `Zoom arrière` (Zoom out) / `Ajuster à la largeur` (Fit to width) | 4 / 1 / 2 |
| button | `Centrer` (Center) (including `exact: true`) | 5 |
| link | `Détails` (Details) | 4 |
| button | `◀ Étape précédente` (Previous step) | 2 |
| button | `Retirer et changer de mode` (Remove and change mode) / `Rester en montage libre` (Stay in free building) | 2 / 2 |
| button | `Abandonner` (Abandon) / `Confirmer l’abandon` (Confirm abandoning) | 2 / 1 |
| radio | `Terminés` (Completed) / `En cours` (In progress) (collection filters) | 1 / 1 |
| link | `Réparer depuis le détail du set` (Repair from the set detail) | 1 |
| link | `Ouvrir la page de l’OMR ↗` (Open the OMR page) | 1 |
| button | `Étape de notice précédente` (Previous instructions step) | 1 |
| button | `Revenir à l’étape en cours` (Back to the current step) / `Revenir à la p. 3` (Back to p. 3) | 1 / 1 |
| button | `Garder la première étape` (Keep the first step) / `Dissocier` (Unlink) / `Confirmer` (Confirm) | 1 / 1 / 1 |

A button's accessible name includes its visible text: adding an `aria-hidden` SVG icon does not change it, replacing the text with an icon alone breaks it.

## 3. Texts, labels, placeholders

- `getByText('Étapes non disponibles dans ce fichier')` (Steps not available in this file), `getByText('mini-4-pieces.mpd — 2/4 pièces')` (recent sessions of the standalone workshop), `getByText('Ta collection est vide')` (Your collection is empty)
- `getByPlaceholder('Nom (ex. Modèle B : buggy)')` (Name (e.g. Model B: buggy))
- `getByLabel('Montrer en fantôme les pièces des étapes suivantes')` (Show the parts of the following steps as ghosts)
- `hasText: 'notice-test.pdf'` (option of the booklet select)

## 4. CSS selectors and DOM structure

| Selector | Use | Constraint for the redesign |
|---|---|---|
| `input[type=file][accept=".ldr,.mpd"]` (12), `aside input[type=file][accept=".ldr,.mpd"]` (2) | Model import (standalone workshop) | Keep an `<input type=file accept=".ldr,.mpd">`, including one **inside the `<aside>`** ("Importer un autre modèle" (Import another model)) |
| `.tray-item` (8), `.tray-item .count` (2), `.count` (1), `.ref` (1), `.tray-item.held` (1), `.held-badge` (1), `.tray-item img[data-thumb="ok"]` (4), `.tray-item [data-thumb="missing"]` (2) | Parts tray | Keep these classes and the `data-thumb` attribute |
| `main.workspace` + `data-side-width` attribute | Panel width (ux) | Keep the `main.workspace` element and its attribute |
| `.pdf-scroll` (+ `canvas` inside, `style.width`) | Instructions fit (ux, ux-omr) | Keep the class; the "canvas width = box width − 2 px" rule depends on the 1 px border |
| `.pdf-panel [role=alert]` (3) | PDF errors | Keep `role=alert` in `.pdf-panel` |
| `.build-panel` (1), `.omr-models li` (1), `img.thumb` (2) | Detail, OMR, thumbnails | Keep |
| `option[value="guided"]`, `option[value=synced]` | Mode select | Keep a native `<select>` `mode-select` with these values (or adapt the tests) |
| `canvas` (2), `build-canvas` | 3D scene | — |
| `document.documentElement.scrollWidth − clientWidth ≤ 0` | No horizontal scrolling | At 1280 px |

## 5. Verified attributes

`toHaveClass('differs')` (5, rows of the differences table) · `toHaveAttribute('title', /3001 · Red \(4\)/)` and `('aria-label', /Pièce 3001, Red, 2 à poser/)` (tray tiles) · `('aria-pressed', 'true')` · `('role', 'separator')` and `('aria-valuenow', …)` (splitter) · `('href', …)` of the OMR and LEGO links.

## 6. Test hooks (dev only, do not remove)

`window.__brickLabGame` (game state), `window.__brickLab` (screen projection, `sizeInSync`, `sceneSummary`, `snapMarkers`), `window.__brickLabGizmo`, `window.__brickLabLastDrop`. `sizeInSync` fails if the canvas size changes without R3F having measured it: any layout animation around the 3D view must take this into account.

## 7. Text assertions (233, `toHaveText` / `toContainText` by `data-testid`)

Format: `<testid> <assertion>(<expected text>`. Dynamic texts (`${…}`) are templates.

```text
add-errors toContainText('Modèle inutilisable'
add-errors toContainText('Téléchargement impossible'
add-errors toContainText('faux.pdf : Ce fichier n’est pas un PDF.'
add-errors toContainText('lisez-moi.txt : format non pris en charge'
add-errors toContainText('n’est pas un numéro de set'
already-in-collection toContainText('Ce modèle existe déjà dans ta collection : 90001-1 Maison de test'
already-in-collection toContainText('Ce modèle existe déjà dans ta collection : 90020-1 Test Racers — « Modèle principal »'
already-in-collection toContainText('Ce modèle existe déjà dans ta collection'
atelier-error toContainText('aucun autre modèle ni aucune correspondance n’est utilisé'
atelier-error toContainText('empreinte SHA-256 différente'
atelier-notes toContainText('Celle de ce navigateur est conservée'
atelier-notes toContainText('Partie enregistrée dans ce navigateur reprise dans la bibliothèque (2/4 pièces'
atelier-notes toContainText('Une autre sauvegarde existe dans ce navigateur (2/8 pièces)'
build-choice toContainText('8 pièces'
card-build toHaveText('Construire'
card-build toHaveText('Reprendre « Modèle B »'
card-build toHaveText('Reprendre'
card-progress toContainText(`${PLACE}/`
card-progress toHaveText('1/4 pièces posées'
card-progress toHaveText('2/8 pièces posées'
card-progress toHaveText('3/8 pièces posées'
card-progress toHaveText('30/65 pièces posées'
compat-card toContainText('Notice synchronisée indisponible : aucune correspondance validée.'
compat-headline toHaveText('Modèle prêt pour le montage guidé.'
compat-headline toHaveText('Notice synchronisée disponible.'
detail-build toHaveText('Reprendre'
detail-free toContainText('4 posée(s) librement, 1/4 à leur place dans le modèle'
detail-mapping toContainText('✗ Livret « Livret 1 » non associé'
detail-message toContainText('Construction ajoutée'
detail-message toContainText('Import refusé : ces correspondances concernent un autre modèle'
detail-message toContainText('La version précédente est gardée dans l’historique'
detail-message toContainText('Sauvegarde de ce navigateur reprise (2/8 pièces)'
detail-message toContainText('n’est pas le fichier attendu'
detail-message toContainText('progression et correspondances conservées'
detail-message toContainText('réparé'
detail-modes toContainText('aucune correspondance'
detail-modes toContainText('notice attendue par les correspondances non associée'
detail-modes toContainText('✓ Notice synchronisée'
detail-problems toContainText('empreinte SHA-256 différente'
detail-progress toHaveText('2/8 pièces posées'
detail-progress toHaveText('4/4 pièces posées'
detail-progress toHaveText('5/8 pièces posées'
diff-Pièces posées toContainText('6/82/8'
existing-set toContainText('Ce set est déjà dans ta collection : 90020-1 « Test Racers » (2 constructions)'
existing-set toContainText('Ce set est déjà dans ta collection'
file-state toHaveText('introuvable'
free-done toContainText('1 pièce(s) à leur place dans le modèle'
free-done toContainText('Toutes les pièces du set sont posées (3/3). Montage libre : ta construction n’est pas comparée au modèle officiel — 0 pièce(s) à leur place dans le modèle.'
free-done toContainText('Toutes les pièces du set sont posées (3/3). Montage libre : ta construction n’est pas comparée au modèle officiel — 2 pièce(s) à leur place dans le modèle.'
free-info toHaveText('1 posée(s) librement · 0 à leur place dans le modèle'
free-info toHaveText('2 posée(s) librement · 1 à leur place dans le modèle'
gizmo-coords toHaveText(`X 70 · Y ${Math.round((g - 17.41) * 100) / 100} (hauteur) · Z 70 LDU`
held-info toContainText('Groupe de 3 pièces'
held-info toContainText('Hauteur manuelle'
held-info toContainText('Niveau auto (surface)'
held-info toContainText('Niveau manuel 1/1'
held-info toContainText('Niveau manuel 1/2'
held-info toContainText('Niveau manuel 2/2'
held-info toContainText('Pièce reprise'
held-info toContainText(`Groupe de ${MECHANISM.length} pièces`
import-done toContainText('4 fichier(s) ajouté(s)'
import-done toContainText('Ajouté à ta collection'
import-submit toHaveText('Ajouter 1 construction(s) à 90020-1'
inventory-check toContainText('Inventaire indéterminé'
inventory-check toContainText('non comparé à la notice officielle'
legacy-saves toContainText('comparer et récupérer dans le détail de 90020-1'
legacy-saves toContainText('mini-4-pieces.mpd — 2/4 pièces : ajoute ce modèle à ta collection'
legacy-saves toContainText('reprise automatiquement à l’ouverture du set correspondant'
mapping-coverage toContainText('4/8'
mapping-coverage toContainText('5/8'
mapping-coverage toHaveText('0/8 pièces affectées · 0 étape(s)'
mapping-coverage toHaveText('65/65 pièces affectées · 24 étape(s)'
mapping-coverage toHaveText('8/8 pièces affectées · 4 étape(s)'
mapping-duplicates toContainText('1 pièce(s) en double'
mapping-issues not.toContainText('n’a aucune pièce'
mapping-issues not.toContainText('pas un multiple'
mapping-issues toContainText('3/4 étape(s) non vérifiée(s)'
mapping-issues toContainText('n’a aucune pièce'
mapping-issues toContainText('pas un multiple de 2'
mapping-status toContainText('Brouillon'
mapping-status toHaveText('Valide : mode synchronisé disponible'
message toContainText('1 pièce(s) posée(s) librement reconnue(s) à leur place dans le modèle'
message toContainText('2 pièces tournées sur place (X +90°)'
message toContainText('6 pièces tournées sur place'
message toContainText('Aucune autre pièce reliée'
message toContainText('Groupe de 2 pièces déplacé'
message toContainText('Groupe de 3 pièces déplacé'
message toContainText('Groupe de 7 pièces déplacé'
message toContainText('Import refusé : Ces correspondances ont été faites pour un autre fichier'
message toContainText('Pièce : déplacée'
message toContainText('Pièce déplacée'
message toContainText('Pièce posée librement'
message toContainText('Pièce posée'
message toContainText('Pièce tournée sur place (Z +90°)'
message toContainText('Progression restaurée : 1/4 pièces posées.'
message toContainText('Progression restaurée : 2/8 pièces posées.'
message toContainText('Progression restaurée : 3/8 pièces posées.'
message toContainText('Progression restaurée : 30/65 pièces posées.'
message toContainText('Trop loin'
message toContainText('ajoutée à Étape 3 · encadré 1'
message toContainText('aucune correspondance valide pour ce fichier : reprise en montage libre'
message toContainText('déjà dans Étape 3 · encadré 1 (p. 3) : ⌥-clic'
message toContainText('déplacé'
message toContainText('déplacée dans Étape 3'
message toContainText('retirée de'
message toContainText('visibles ou cachées'
message toContainText(/Trop loin|orientation/
message toContainText(`Groupe de ${MECHANISM.length} pièces déplacé`
message toContainText(`Progression restaurée : ${PLACE}/`
message toHaveText('Bravo, modèle terminé !'
message toHaveText('Pièce déplacée librement.'
message toHaveText('Pièce laissée où elle était.'
message toHaveText('Pièce remise dans le stock.'
message toHaveText('Progression restaurée : 1/8 pièces posées.'
message toHaveText('Progression restaurée : 2/4 pièces posées.'
message toHaveText('Progression restaurée : 3/3 pièces posées, dont 3 posée(s) librement.'
message toHaveText('Progression restaurée : 30/65 pièces posées.'
message toHaveText('Progression restaurée : 5/8 pièces posées.'
message toHaveText('Étape 1 terminée ! Suivante : Étape 2 (×2), p. 2.'
message toHaveText(`Progression restaurée : 12/${s.occurrences} pièces posées.`
missing-parts toContainText('not-a-real-part-9999.dat'
mode-switch-confirm toContainText('hors du modèle officiel'
no-model toContainText('Aucun modèle 3D trouvé pour ce set.'
nothing-found toContainText('Aucun modèle 3D trouvé pour ce set.'
notice-step toHaveText('Notice : Étape 1, p. 2'
notice-step toHaveText('Notice : Étape 2 (×2), p. 2'
notice-step toHaveText('Notice : Étape 2, p. 2'
notice-step toHaveText('Notice : Étape 3 · encadré 1, p. 3'
notice-step toHaveText('Notice : Étape 3, p. 3'
occurrence-count toHaveText('270'
occurrence-count toHaveText('4'
omr-status toContainText('OMR indisponible : L’OMR a répondu 503.'
omr-status toHaveText('2 modèle(s) 3D sur l’OMR, dont 1 alternatif(s).'
omr-status toHaveText('Aucun modèle 3D trouvé pour ce set sur l’OMR.'
pdf-only toContainText('Notice trouvée sans modèle 3D : pas de construction interactive disponible.'
pdf-page toContainText('/ 3'
pdf-page toHaveText('PDF p. 1 / 3'
pdf-page toHaveText('PDF p. 1 / 4'
pdf-page toHaveText('PDF p. 1 / 84'
pdf-page toHaveText('PDF p. 2 / 3'
pdf-page toHaveText('PDF p. 2 / 32'
pdf-page toHaveText('PDF p. 3 / 3'
pdf-page toHaveText('PDF p. 3 / 4'
pdf-page toHaveText('PDF p. 8 / 32'
pdf-page toHaveText(/PDF p\. 1 \/
pdf-page toHaveText(/PDF p\. 5 \/
pdf-zoom toHaveText('Largeur'
pdf-zoom toHaveText(/^\d+ %$/
progress toHaveText('0/2 pièces posées'
progress toHaveText('0/4 pièces posées'
progress toHaveText('1/2 pièces posées'
progress toHaveText('1/3 pièces posées'
progress toHaveText('1/4 pièces posées'
progress toHaveText('1/5 pièces posées'
progress toHaveText('1/8 pièces posées'
progress toHaveText('2/2 pièces posées'
progress toHaveText('2/3 pièces posées'
progress toHaveText('2/4 pièces posées'
progress toHaveText('2/8 pièces posées'
progress toHaveText('3/11 pièces posées'
progress toHaveText('3/3 pièces posées'
progress toHaveText('3/4 pièces posées'
progress toHaveText('3/5 pièces posées'
progress toHaveText('3/8 pièces posées'
progress toHaveText('30/65 pièces posées'
progress toHaveText('4/4 pièces posées'
progress toHaveText('4/8 pièces posées'
progress toHaveText('5/8 pièces posées'
progress toHaveText('6/8 pièces posées'
progress toHaveText('65/65 pièces posées'
progress toHaveText('7/11 pièces posées'
progress toHaveText('8/11 pièces posées'
progress toHaveText('8/8 pièces posées'
progress toHaveText(`${PIECES.length}/${PIECES.length} pièces posées`
progress toHaveText(`${i + 1}/4 pièces posées`
progress toHaveText(`${i + 1}/8 pièces posées`
progress toHaveText(`${n}/3 pièces posées`
progress toHaveText(`${n}/609 pièces posées`
progress toHaveText(`${placedCount}/609 pièces posées`
progress toHaveText(`${s.occurrences}/${s.occurrences} pièces posées`
progress toHaveText(`${total}/${s.occurrences} pièces posées`
progress toHaveText(`0/${entry.occurrences}`
progress toHaveText(`13/${s.occurrences} pièces posées`
quality toContainText('Analysable'
quality toHaveText('Jouable avec étapes 3D'
quality toHaveText('Montage libre uniquement (pas d’étapes)'
rejected toContainText('concernent un autre modèle'
render-status toContainText('0 référence(s) manquante(s)'
render-status toContainText('Géométrie LDraw'
resources toContainText('Plusieurs constructions'
save-conflict toContainText('enregistrée entre-temps'
save-state toHaveText('Enregistré dans la bibliothèque'
selection-info not.toHaveText('1 pièce(s) sélectionnée(s)'
selection-info toHaveText('1 pièce(s) sélectionnée(s)'
selection-info toHaveText('2 pièce(s) sélectionnée(s)'
selection-info toHaveText('3 pièce(s) sélectionnée(s)'
selection-info toHaveText('6 pièce(s) sélectionnée(s)'
selection-info toHaveText('7 pièce(s) sélectionnée(s)'
selection-info toHaveText(`${MECHANISM.length} pièce(s) sélectionnée(s)`
set-card-31009-1 toContainText('270 pièces'
set-card-31040-1 toContainText('Notice synchronisée'
set-card-90003-1 toContainText('2 constructions'
snap-info toContainText('aimant : 4 tenon(s) emboîté(s) sur 2 pièce(s)'
snap-miss toContainText('axes non alignés'
source-lego toContainText('Notice disponible sur LEGO.com, mais téléchargement manuel nécessaire'
source-local toContainText('rien pour ce numéro'
source-rebrickable toContainText('Rebrickable non configuré'
status toHaveText('En cours'
status toHaveText('Jamais commencé'
status toHaveText('Terminé'
step-count toContainText('2'
step-count toContainText('4 (étapes aplaties des sous-modèles)'
step-indicator toHaveText('Étape 1 / 2'
step-indicator toHaveText('Étape 1 / 4'
step-indicator toHaveText('Étape 2 / 2'
step-indicator toHaveText('Étape 2 / 4'
sync-availability toContainText('1 pièce(s) du modèle non affectée(s)'
sync-availability toContainText('Notice synchronisée disponible : 4 étape(s)'
sync-availability toContainText('Notice synchronisée indisponible'
sync-availability toContainText('indisponible : aucune correspondance'
sync-banner toContainText('(1re étape imprimée sur 2 de la page)'
sync-banner toContainText('(2e étape imprimée sur 2 de la page)'
sync-missing-booklet toContainText('Un autre PDF ne sera pas utilisé à sa place'
sync-missing-booklet toContainText('importe « notice-test.pdf » (3 p.) pour voir la page 2'
sync-off-page toContainText('Page affichée ≠ page de l’étape'
sync-step toHaveText('Étape 2 (×2)'
target-found toContainText('à sa place dans le modèle'
tray-3001.dat-1 toContainText('×1'
tray-3001.dat-4 toContainText('forme indisponible'
tray-3001.dat-4 toContainText('×1'
tray-3001.dat-4 toContainText('×2'
tray-3001.dat-4 toContainText('×3'
variant-note toContainText('Lu comme 90021-1 (variante -1 supposée'
```

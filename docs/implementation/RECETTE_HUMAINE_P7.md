# P7 manual acceptance test — to be done by the owner (Chrome then Safari, Mac)

> The Playwright tests drive the mouse by script, and Playwright's WebKit is not the Safari application: they do not replace a real trial.

Estimated duration: 30–40 min.

## 0. Preparation

```bash
cd <worktree feat/p7-personal-library>
npm ci
npm run build
npm run start
```

Open http://127.0.0.1:3000 in **Chrome**. The collection uses `~/Documents/brick-lab-data/library/` (created by P7). During development, Claude added 31040 "Desert Racers" and 31009 "Small Cottage" to it and placed 12 parts of 31040. **Do not do steps 1.2–1.3 if both sets are already there**; go straight to section 2. A safety copy of the `library/` folder was made before your acceptance test (see the report, section 7); Claude did not rename or delete anything.

## 1. Collection

| # | Action | Expected | OK/KO |
|---|---|---|---|
| 1.1 | Open the application | "Ma collection" (My collection) page; if it is empty, a yellow banner "set(s) trouvé(s) dans ton dossier de données" (set(s) found in your data folder) | |
| 1.2 | Expand the banner | 31040: instructions checked, mappings `31040-1.brick-mapping.json` (24/24 verified) preselected; 31009: 3 instruction booklets offered | |
| 1.3 | Add 31040 (name "Desert Racers") and 31009 ("Small Cottage", keep only the instructions 6038244) | Two cards with 3D thumbnail, part count, files, modes, "Jamais commencé" (Never started) | |
| 1.4 | Check that `models/`, `instructions/`, `mappings/` have not changed (Finder, dates) | Nothing copied or moved | |
| 1.5 | Search "31040", then "cottage"; filters "En cours" (In progress) / "Terminés" (Completed) / "Non commencés" (Not started) | Correct filtering | |

## 2. Resuming 31040 in synchronized instructions mode (main criterion)

| # | Action | Expected | OK/KO |
|---|---|---|---|
| 2.1 | 31040 card → "Construire" (Build) | Workshop: model loaded **without file selection** | |
| 2.2 | "Commencer — notice synchronisée" (Start — synchronized instructions) | Notice tab (instructions): booklet 6145903 opens by itself, p. 2, step 1 | |
| 2.3 | Place about ten parts | The page follows the steps; at the top "Enregistré dans la bibliothèque" (Saved in the library) | |
| 2.4 | "← Ma collection" | Card: x/65 parts placed, "En cours", "Reprendre" (Resume) button | |
| 2.5 | **Quit Chrome** (⌘Q), stop the server (Ctrl+C), restart it (`npm run start`), reopen Chrome | Same card, same progress | |
| 2.6 | "Reprendre" | "Progression restaurée" (Progress restored), Notice synchronisée mode, same step, same page, booklet open without import | |

## 3. Safari, same library

| # | Action | Expected | OK/KO |
|---|---|---|---|
| 3.1 | Open http://127.0.0.1:3000 in **Safari** | Same collection, same progress | |
| 3.2 | Resume 31040, place 2 parts | Saved; the instructions follow | |
| 3.3 | Go back to Chrome (tab left open on the workshop) and place a part | Message "enregistrée entre-temps depuis un autre onglet ou navigateur… Recharger" (saved in the meantime from another tab or browser… Reload): **nothing is overwritten**; after "Recharger", the Safari progress is there | |

## 4. Set detail and management

| # | Action | Expected | OK/KO |
|---|---|---|---|
| 4.1 | "Détails" (Details) of 31040 | 3D preview, files "disponible / laissé en place" (available / left in place), valid mappings 24/24, modes, diagnostics | |
| 4.2 | Rename the set, "Enregistrer" (Save) | Name changed, progress kept | |
| 4.3 | "Vérifier les empreintes" (Verify fingerprints) | "fichier(s) vérifié(s) : empreintes SHA-256 identiques" (file(s) verified: identical SHA-256 fingerprints) | |
| 4.4 | Detail of 31009 → "Associer une ou plusieurs notices" (Associate one or more instruction booklets) (6038252) then "Dissocier" (Dissociate) (confirm) | Instructions added then removed; the file is not deleted | |
| 4.5 | "Ajouter un set" (Add a set) with another MPD from `models/` (e.g. 31028) and a mappings file of 31040 | Mappings rejected ("concerne un autre modèle" (concerns another model)) | |
| 4.6 | Remove this test set (confirm) | It disappears; it is in `library/trash/` | |

## 5. P5/P6 browser saves (your Chrome P6 game)

The library already contains 12/65 parts of 31040 (Claude's trials). Your P6 game is in Chrome's `localStorage`.

| # | Action | Expected | OK/KO |
|---|---|---|---|
| 5.1 | Chrome → "Ma collection" | Box "Parties enregistrées dans ce navigateur" (Games saved in this browser): your 31040 game, with a link "comparer et récupérer dans le détail de 31040-1" (compare and recover in the detail of 31040-1) (if it differs from the library) | |
| 5.2 | "Reprendre" 31040 | "Deux sauvegardes différentes" (Two different saves) screen: Bibliothèque (Library) / Ce navigateur (This browser) table (placed parts, mode, page, booklet, mappings), differing rows highlighted, **even if your game is older** | |
| 5.3 | "Reprendre ce navigateur" (Resume this browser) | Your P6 game is restored (parts, mode, page); banner "version précédente gardée dans l'historique" (previous version kept in the history) | |
| 5.4 | (variant) "Reprendre la bibliothèque" (Resume the library), then Detail of 31040 → "Reprendre la sauvegarde de ce navigateur" (Resume this browser's save) → Confirm | Same result, at any time | |
| 5.5 | Check in the Finder `~/Documents/brick-lab-data/library/builds/<id>/history/` | The 12/65 version is there (file `progress-…json`) | |
| 5.6 | Open "Atelier sans collection" (Workshop without collection) | P5/P6 workshop unchanged (manual import, recent sessions) | |

## 6. Impressions

Pleasant interface on a MacBook? Painful points? Slowness?

## Result

To be completed by the owner: date, browsers (Safari version), OK/KO, remarks.

**2026-11-06, Chrome and Safari** (results reported by the owner; Safari version not reported): P6 save recovery OK; collection and resume in Chrome OK; same collection and resume in Safari OK; conflict handling between browsers OK. Details: [P7_RAPPORT.md](P7_RAPPORT.md) section 8.

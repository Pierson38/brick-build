# P8 manual acceptance test — production, Chrome then Safari (to be done by the owner)

> The automated tests simulate the OMR and drive the mouse by script; Claude's real acceptance test (31045) was done in an **isolated** folder. Here, everything happens on **your real collection**, with the **production** server. The OMR download on click is approved (2026-11-06, framework in [P8_ARCHITECTURE_IMPORT.md](P8_ARCHITECTURE_IMPORT.md) section 3). PR #5 is not merged.

Estimated duration: 40–50 min. Report: [P8_RAPPORT.md](P8_RAPPORT.md).

## Recorded results (2026-11-06, Claude's survey at 19:15)

> Claude did not see your screen: this table distinguishes what **the data proves** from what **only your testimony** can establish. No point is validated until you have confirmed it. Local times (UTC+1).

**Traces collected** (read-only on `~/Documents/brick-lab-data`, server terminal):

- Production server started **only once** (terminal tab: a single "Ready", no stop or restart).
- Index: revision 2 → **3** (a single write, 19:08:40). Set **31039-1 "Blue Power Jet"** added, 1 build "Modèle principal" (Main model), 2 files added: model `31039-1.mpd` (library copy, **OMR** provenance: `…/media/omr_models/206/31039-1.mpd`, page `…/omr/set/31039-1`, author Merlijn Wissink [legolijntje], license CCAL 2.0, downloaded at 19:07:25) and instructions `6127618.pdf` (25.8 MB, **224 pages**, dropped). No other set, no duplicate, `staging/` empty, no trash.
- Model 31039: **609 parts** in the OMR file (402 in the main model + 11 submodels used), **no LDraw steps** → free building only (the protocol wrongly presented it as a small set; box part count not verified).
- Build 31039: progress created at 19:08:51 in **free building**, instructions `6127618.pdf` opened, page 1 → **page 4** (19:09:08), **0 parts placed**. An **empty** mappings draft (0 booklets, 0 steps, source "éditeur" (editor)) was created from the workshop at 19:08:54 — not by the import.
- 31040: progress **unchanged** (25/65, synchronized instructions, page 6, revision 37 of 11-06 at 16:27). 31009: still no progress.
- `models/`, `instructions/`, `mappings/`: fingerprints **identical** to the inventory from before the acceptance test.

| Point | What the traces prove | Owner's confirmation |
|---|---|---|
| 1. Search by number | Indirect: a model from the OMR page of 31039-1 was downloaded, which implies the search | to be filled in |
| 2. OMR download by click | **Yes**: OMR file of 31039-1 with source, author, license and fingerprint | to be filled in |
| 3. Manual import of the PDF instructions | **Yes**: `6127618.pdf` dropped and associated; whether it is the right booklet cannot be verified by Claude | to be filled in |
| 4. Compatibility sheet | No trace (display only) | to be filled in |
| 5. Add and resume after restart | Add **yes**; free building opened, 0 parts placed; **no server restart** observed | to be filled in |
| 6. No duplicates | No duplicate in the collection; **no trace of a trial** of a duplicate (no new download or drop) | to be filled in |
| 7. Offline import | **No trace** (no prepared file, no set 31028) | to be filled in |
| 8. Non-regression 31040 / 31009 | Data intact; opening not traceable; no part placed on 31040 | to be filled in |
| Chrome / Safari | Not traceable (the server does not log browsers) | to be filled in |

## Closure flow — 6 remaining checks (≈ 15 min)

> No check is ticked by Claude: fill in the "Résultat" (Result) column (OK / KO + remark). No code change or test re-run is planned unless a new defect appears.

**Before starting (done by Claude, 2026-11-06 19:19)**: state verified — index revision 3, 3 sets; 31040 **25/65**, synchronized instructions, page 6; 31039 **0/609**, free building, page 4; no file in staging. New **verified** backup (39 identical files after extraction): `~/Documents/brick-lab-data/backups-p8/library-2026-11-06T19-19-12-avant-cloture-p8.tar.gz` (+ inventory `donnees-2026-11-06T19-19-12.sha256`). The production server runs in the terminal tab "Brick Build prod (P8)". **Do not touch 31040** during this flow.

Recommended order: C6 → C5 → C1 → C2 → C3 → C4 (Chrome first, Safari in C3).

| # | Check | Steps | Expected | Result |
|---|---|---|---|---|
| C6 | **Instructions** of 31039 | Collection → 31039 "Construire" (Build) → **Notice PDF** tab; browse the cover and a few pages | `6127618.pdf` (224 p.) opens without file selection; it is indeed the booklet of the model you want to build (Blue Power Jet, main model). *If it is not the right one:* set detail → "Dissocier" (Dissociate) (confirm; the file is not deleted) → "Associer une ou plusieurs notices" (Associate one or more instruction booklets) with the right PDF | |
| C5 | **Compatibility** of 31039 (free building, no steps) | Still in the workshop, then "Détails" (Details) of the set | Workshop: no "Commencer — mode guidé" (Start — guided mode) (if it offers the start buttons) and "Étapes non disponibles dans ce fichier : aucune séquence n'est inventée." (Steps not available in this file: no sequence is invented.); card: only the **"Montage libre"** (Free building) mode; detail: Quality **"Montage libre uniquement (pas d'étapes)"** (Free building only (no steps)). The add page's sheet does not reappear for a model already in the collection (it can no longer be checked): if you remember the one seen at import, note it; the same rule is reviewed in C4 on 31028 ("Pas d'étapes LDraw dans ce fichier : montage libre uniquement") | |
| C1 | **Resume after restart** | Workshop 31039 in free building: place **at least one part** (choose a part in the bottom bar, place it at a compatible location); display a specific instruction page (e.g. p. 10); wait for "Enregistré dans la bibliothèque" (Saved in the library); "← Ma collection"; in the terminal tab: **Ctrl+C**, then `npm run start`; reload Chrome | Card 31039: **x/609 pièces posées** (parts placed), "En cours" (In progress), "Reprendre" (Resume); "Reprendre" → "Progression restaurée : x/609" (Progress restored: x/609), **Montage libre** mode, Notice PDF tab on the **same page**, with no file selection. 31040 still 25/65 | |
| C2 | **Duplicates** | "Ajouter un set" → `31039` → "Rechercher" (Search) → "Chercher en ligne (OMR)" (Search online (OMR)) → "Télécharger" (Download) the main model → **confirm nothing** → "← Ma collection" | "Ce set est déjà dans ta collection : 31039-1 "Blue Power Jet" (1 construction)" (This set is already in your collection: 31039-1 "Blue Power Jet" (1 build)); on the model: "**Ce modèle existe déjà dans ta collection**" (This model already exists in your collection): 31039-1 Blue Power Jet — "Modèle principal"", checkbox disabled, add button inactive ("Coche au moins une construction." (Check at least one build.)); back: still **3 sets**, 31039 still **x/609**. (The re-downloaded file stays in staging outside the collection; deleted automatically after 7 days) | |
| C3 | **Safari** | Open http://127.0.0.1:3000 in Safari; 31039 "Reprendre" (place nothing); then "Ajouter un set" → `31039` → "Rechercher" | Same 3 sets and same progress (31040 25/65, 31039 x/609); identical resume (mode, page); the add page works: variant "31039-1", resources, "Ce set est déjà dans ta collection". Close without confirming | |
| C4 | **Offline** (without adding) | **Turn off Wi-Fi**; "Ajouter un set" (new page); "Choisir des fichiers" (Choose files): `~/Documents/brick-lab-data/models/31028-1/31028-1.mpd`, `~/Documents/brick-lab-data/instructions/31009-1/31009-1_notice_6038252.pdf` and `~/Documents/brick-lab-data/mappings/31040-1.brick-mapping.json`, **together**; then enter `31028` → "Rechercher" → "Chercher en ligne"; **do not confirm** → "← Ma collection"; turn Wi-Fi back on | Model 31028 analyzed (53 parts, no steps → "Pas d'étapes LDraw dans ce fichier : montage libre uniquement"); PDF listed with its page count; mappings of 31040 **rejected** ("concernent un autre modèle" (concern another model)); number proposed 31028-1; online search: "**OMR indisponible** : …" (OMR unavailable) and link to the page; collection unchanged (**3 sets**). The chosen files are read, never moved | |

**Results (2026-11-06)**: the six checks are declared **OK by the owner** at the end of his manual acceptance test (Chrome, then Safari for C3). Claude did not observe the screen and reports no measurement from this acceptance test.

**Discrepancy between the declaration and the traces**, noted by Claude before the merge (read-only, around 19:45) and presented to the owner:

| Check | Expected trace | Observed trace |
|---|---|---|
| C1 | 31039 ≥ 1/609, saved after 19:19; second server start | 31039 **0/609**, last save **19:09**; a single server start (same process) |
| C2 | Re-downloaded model kept in `library/staging/` until confirmation | `staging/` empty |
| C4 | Dropped files kept in `library/staging/` | `staging/` empty |

The other checks (C3, C5, C6) leave no trace in the data. Data intact: index revision 3, 3 sets, 31040 25/65 (unchanged), `models/`, `instructions/`, `mappings/` identical to the 19:19 inventory. **Owner's decision: merge despite this discrepancy** ("Merge anyway", 2026-11-06). Checks C1, C2 and C4 therefore rest on his declaration alone; they remain covered by the automatic tests (resume after restart in the isolated real acceptance test 31045, duplicates and offline import in unit and E2E tests).

**At the end**: send me the "Résultat" column. I will verify the traces (index, progress, integrity of `models/`, `instructions/`, `mappings/` against the 19:19 inventory), record the acceptance test and prepare the merge of PR #5 **by rebase**, without launching it before your GO.

## 0. State before the acceptance test and backup (done by Claude on 2026-11-06, 18:17)

**State verified** (read-only on `~/Documents/brick-lab-data/library/`):

| Item | Reference value |
|---|---|
| Index | revision 2, 2 sets, 2 builds, 5 files, all present with correct SHA-256 fingerprint |
| 31040-1 Desert Racers | 65 parts, **25/65 placed**, **synchronized instructions** mode, page **6**, booklet 6145903, mappings **24/24 verified** (valid); modes: synchronized, guided, free |
| 31009-1 Small Cottage | 270 parts, **no progress**, instructions 6038244; modes: guided, free |
| Set files | left in place in `models/`, `instructions/`, `mappings/` |

**Backup**: `~/Documents/brick-lab-data/backups-p8/library-2026-11-06T18-17-15-avant-recette-p8.tar.gz` (folders `library/` and `mappings/`, archive SHA-256 `80c14800…bbe8`), **verified** by separate extraction: 33 identical files. Inventory of the fingerprints of `library/`, `models/`, `instructions/`, `mappings/`: `backups-p8/donnees-2026-11-06T18-17-15.sha256`.

**Production build check** (without modifying anything, `library.json` unchanged): listening on `127.0.0.1:3000` only, LDraw library configured, `/ajouter` responds, 31040 does offer the synchronized mode (25/65), 31009 guided/free, no problem reported; online search rejected (403) without the application header.

> If you have played since 18:17, make a new backup (section 6, first command) before starting.

## 1. Launch (production)

```bash
cd ~/Documents/brick-build-worktrees/p8-simplified-import
npm run build
npm run start
```

The terminal displays `http://127.0.0.1:3000`. Open it in **Chrome**. (Optional: `REBRICKABLE_API_KEY=<your key>` in `.env.local` before `npm run start` to see the name, year and announced part count.)

**Recommended set: 31039 Blue Power Jet** (Creator 3-in-1): present on the OMR with its main model and two alternates (Helicopter, Speedboat), **absent** from your collection and from your `models/` folder. *Correction after the acceptance test: the OMR file has 609 parts and no LDraw steps (free building only), it is not a small set.* Replacement: 31038 Changing Seasons. (Sets 31027, 31028, 31031, 31045… are already in `models/`: their file would be found locally and the OMR click would not make a new copy.)

## 2. Non-regression 31040 and 31009 (point 8)

| # | Action | Expected | OK/KO |
|---|---|---|---|
| 2.1 | Home page | "Ma collection": 31040 "25/65 pièces posées", En cours; 31009 "0/270", Jamais commencé (Never started) | |
| 2.2 | 31040 → "Reprendre" | "Progression restaurée : 25/65"; **Notice synchronisée** (synchronized instructions) mode; page 6; booklet open **without file selection** | |
| 2.3 | Place 1 or 2 parts, "← Ma collection" | "Enregistré dans la bibliothèque"; the card follows | |
| 2.4 | 31009 → "Construire" | Model (270 parts) and instructions opened without import; "indeterminate" inventory still flagged | |

## 3. New set by its number (points 1 to 4)

| # | Action | Expected | OK/KO |
|---|---|---|---|
| 3.1 | "Ajouter un set" → `31039` → "Rechercher" (point 1) | "Lu comme 31039-1 (variante -1 supposée…)" (Read as 31039-1 (variant -1 assumed…)); Data folder: "rien pour ce numéro" (nothing for this number); LEGO line "Notice disponible sur LEGO.com, mais téléchargement manuel nécessaire" | |
| 3.2 | Trial: `31039; x` then `31039-2` | The first is rejected ("n'est pas un numéro de set" (is not a set number)); the second is read as **another** box (31039-2); go back to `31039` | |
| 3.3 | "Chercher en ligne (OMR)" (point 2) | "3 modèle(s) 3D sur l'OMR, dont 2 alternatif(s)"; main then Helicopter, Speedboat, with the author | |
| 3.4 | "Télécharger" the **main model** only | "téléchargé ✓" (downloaded ✓); one card: file name, size, "téléchargé depuis l'OMR" (downloaded from the OMR), **author and license read from the file**, parts, LDraw steps | |
| 3.5 | Optional: "Télécharger" an alternate | Second build named after the OMR ("Helicopter"…); message "Plusieurs constructions : coche pour chaque notice…" (Several builds: check for each instruction booklet…) | |
| 3.6 | "Ouvrir la page LEGO ↗" (Open the LEGO page ↗) (point 3): download the main model's instructions in your browser, then **drop them** in "Import local rapide" (Quick local import) | Instructions listed with their **page count**; "association proposée, non vérifiée" (one build only) or checkbox (several) | |
| 3.7 | Compatibility sheet (point 4) | Modes actually available (guided only if the file has steps); "Montage libre avec notice"; "**Notice synchronisée indisponible : aucune correspondance validée**"; "Pièces vérifiées" or the list of missing references; "Inventaire indéterminé" | |
| 3.8 | "Détails avancés" (Advanced details) | SHA-256 of the file, diagnostics, choice of another model from the file | |

## 4. Add, build, resume after restart (point 5)

| # | Action | Expected | OK/KO |
|---|---|---|---|
| 4.1 | Proposed name ("Blue Power Jet" or the OMR's) → "Ajouter à ma collection" (Add to my collection) | "Ajouté à ta collection" (Added to your collection); number of files added; button "Construire "Modèle principal"" | |
| 4.2 | "Construire" → "Commencer — mode guidé" (or "Montage libre (avec notice)"), place **at least 5 parts** | "Enregistré dans la bibliothèque"; the dropped instructions open in the Notice PDF tab | |
| 4.3 | "← Ma collection" | New card 31039-1 with thumbnail, x/N parts, "En cours"; 31040 and 31009 unchanged | |
| 4.4 | **Quit Chrome** (⌘Q), stop the server (Ctrl+C), `npm run start`, reopen Chrome | Same collection, same progress | |
| 4.5 | 31039 → "Reprendre" | "Progression restaurée : x/N", same mode, instructions opened without import | |
| 4.6 | "Détails" of 31039 | Model file "copie de la bibliothèque" (library copy), associated instructions, "Vérifier les empreintes" (Verify fingerprints) OK | |

## 5. Duplicates (point 6) and Safari

| # | Action | Expected | OK/KO |
|---|---|---|---|
| 5.1 | "Ajouter un set" → `31039` → "Rechercher" | "Ce set est déjà dans ta collection : 31039-1 …"; choice "Ajouter les constructions cochées à ce set" (Add the checked builds to this set) checked | |
| 5.2 | "Chercher en ligne" → "Télécharger" the main | "**Ce modèle existe déjà dans ta collection**"; its checkbox is disabled; the add button stays inactive ("Coche au moins une construction.") | |
| 5.3 | Drop the same instructions again | "déjà dans la bibliothèque" (already in the library) (no new copy) | |
| 5.4 | Optional: download an alternate, "Ajouter 1 construction(s) à 31039-1" (Add 1 build(s) to 31039-1) | The set has one more build; the main model's progress is **unchanged** | |
| 5.5 | Open http://127.0.0.1:3000 in **Safari** | Same collection (31040, 31009, 31039) and same progress | |
| 5.6 | Safari: 31039 → "Reprendre", place 1 part; then "Ajouter un set" → `31039` | Resume without import; same duplicate messages as in 5.1–5.2 | |

## 6. Offline import (point 7)

| # | Action | Expected | OK/KO |
|---|---|---|---|
| 6.1 | **Turn off Wi-Fi** | — | |
| 6.2 | "Ajouter un set" → `31039` → "Rechercher" | Immediate local result (set already present) | |
| 6.3 | "Chercher en ligne" | "OMR indisponible : …" and link to the page; nothing else blocks | |
| 6.4 | Go back to "Ajouter un set" (new page); "Choisir des fichiers" or drag **all at once** `~/Documents/brick-lab-data/models/31028-1/31028-1.mpd` and any PDF, plus `mappings/31040-1.brick-mapping.json` | The model (53 parts) is analyzed; the PDF is listed with its pages; the 31040 mapping is **rejected** ("concernent un autre modèle"); number proposed 31028-1 | |
| 6.5 | Your choice: "← Ma collection" **without confirming** (nothing is added) **or** confirm (set 31028 added offline, file left in place) | Collection matches the choice | |
| 6.6 | Turn Wi-Fi back on | — | |

## 7. After the acceptance test

Stop the server, then compare your sets' files with the inventory from before (only `library/` should have changed):

```bash
cd ~/Documents/brick-lab-data
find models instructions mappings -type f -exec shasum -a 256 {} \; | sort -k2 > /tmp/apres.sha256
grep -E " (models|instructions|mappings)/" backups-p8/donnees-2026-11-06T18-17-15.sha256 | diff - /tmp/apres.sha256 && echo "Fichiers des sets inchangés"
```

To remove an acceptance-test set: set detail → "Retirer le set de la collection" (Remove the set from the collection), then "Confirmer" (Confirm) (it goes to `library/trash/`, nothing is erased).

**Return to the state before the acceptance test** (if needed): stop the server, set aside the current folder (do not delete it), then restore:

```bash
cd ~/Documents/brick-lab-data
mv library library-apres-recette-p8
tar -xzf backups-p8/library-2026-11-06T18-17-15-avant-recette-p8.tar.gz -C ~/Documents/brick-lab-data
```

(Make a backup at any time: `tar -czf backups-p8/library-$(date +%Y-%m-%dT%H-%M-%S).tar.gz library mappings`, server stopped.)

Note each deviation (screenshot, exact message, browser) in the tables; they will be handled before any merge. The final GO to merge PR #5 remains yours.

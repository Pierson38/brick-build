# P6 manual acceptance test — to be done by the owner (Chrome and Safari, Mac)

> The Playwright tests drive the mouse by script; they do not replace a real trial.

Estimated duration: 30–40 min per browser.

## 0. Setup

Local files (outside the repository):
- model: `~/Documents/brick-lab-data/models/31040-1/31040-1.mpd`
- instructions: `~/Documents/brick-lab-data/instructions/31040-1/31040-1_notice_6145903.pdf`
- mappings prepared during P6: `~/Documents/brick-lab-data/mappings/31040-1.brick-mapping.json` (entered by Claude while reading the instructions; **to be verified by you**, see § 2)

```bash
cd <worktree feat/p6-instructions-sync>
npm run build
npm run start
```

Open http://127.0.0.1:3000. Before each browser, start from empty storage: if 31040 appears in "Sessions récentes" (Recent sessions), import it then "Abandonner" (Abandon); in the Correspondances (Mappings) tab, "Tout effacer" (Clear all) then "Confirmer l'effacement" (Confirm clearing).

## 1. Without mappings: nothing is invented

| # | Action | Expected | OK/KO |
|---|---|---|---|
| 1.1 | Import `31040-1.mpd` | Model tab: "Notice synchronisée indisponible : aucune correspondance…" (Synchronized instructions unavailable: no mapping…); no "Commencer — notice synchronisée" (Start — synchronized instructions) button | |
| 1.2 | "Commencer — mode guidé" (Start — guided mode), place 2 parts, then "Abandonner" | P5 guided mode unchanged | |

## 2. Editor (verification of the prepared mappings)

| # | Action | Expected | OK/KO |
|---|---|---|---|
| 2.1 | **Correspondances** tab → "Importer un fichier de correspondances" (Import a mappings file) → `31040-1.brick-mapping.json` | "Valide : mode synchronisé disponible" (Valid: synchronized mode available), 65/65, 24 steps | |
| 2.2 | Import the instructions PDF (button at the top of the panel) | The booklet is "opened"; the page of the selected step is displayed, at the panel width | |
| 2.3 | Go through the 24 steps with ▶; for each, compare the 3D (parts highlighted in amber = parts of the step) with the page | Same parts; check "Vérifiée contre la page" (Verified against the page) when it is right | |
| 2.4 | Doubtful points flagged by a **note** (steps 4, 9, 16, 19): look at them closely | Fix if needed (3D click to remove, ⌥-click to move) | |
| 2.5 | 3D click on a ghost part, then on the same highlighted part | Added then removed; the counter follows | |
| 2.6 | 3D click on a part of a previous step | Message "déjà dans l'étape … : ⌥-clic" (already in step …: ⌥-click); nothing is moved without ⌥ | |
| 2.7 | "Exporter (.json)" (Export (.json)) | A `31040-1.brick-mapping.json` file is downloaded; open it: only ids, pages, numbers and fingerprints | |

## 3. Synchronized play

| # | Action | Expected | OK/KO |
|---|---|---|---|
| 3.1 | "Terminer l'édition" (Finish editing) → "Commencer — notice synchronisée" | Instructions tab: banner "Étape 1 — …, p. 2 (1re étape imprimée sur 2 de la page)" (Step 1 — …, p. 2 (1st printed step of 2 on the page)) | |
| 3.2 | Build following the page | Only the parts of the step are offered; the step locations are blue (can be unchecked) | |
| 3.3 | Complete a step | Message "Étape … terminée ! Suivante : …" (Step … completed! Next: …); the page turns on its own when the next step is on another page | |
| 3.4 | "◀ Étape précédente" (Previous step) then "Revenir à l'étape en cours" (Return to the current step) | Page and parts of the past step highlighted, nothing is removed | |
| 3.5 | View a past step → "Reprendre depuis cette étape" (Resume from this step) | The parts of this step and the following ones are removed; progress stays consistent | |
| 3.6 | Undo (⌘Z) at the first part of a step | Back to the previous step | |
| 3.7 | Reload the page, re-import the MPD | "Progression restaurée", same step; banner "Livret non ouvert : importe …" (Booklet not opened: import …) | |
| 3.8 | Import another PDF (e.g. a 31009 booklet) | It is not used in place of the booklet: warning maintained | |
| 3.9 | Re-import the right PDF | The step's page comes back | |
| 3.10 | Finish the model | "Bravo, modèle terminé !" (Well done, model complete!) | |
| 3.11 | Feel: do the instructions and the 3D follow each other pleasantly? Annoyances? | Free comments | |

## 4. Result (2026-11-05)

**Acceptance test performed by the owner: OK.** It covered the local production server, commit `4ebe7ce`.

- Reported result: "C'est tout bon" (It's all good).
- 31040 mapping: "Yes, all 24" entries checked against the instructions, without correction.
- Not reported: detailed grid and browsers tested. No KO or annoyance reported.

Details and verified mapping: [P6_RAPPORT.md § 7](P6_RAPPORT.md#7-manual-acceptance-test-and-mapping-verification-2026-11-05).

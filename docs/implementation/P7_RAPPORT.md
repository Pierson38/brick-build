# P7 — Personal set library: report

**Date:** 2026-11-05. Branch `feat/p7-personal-library`, dedicated worktree, base `origin/main` = `7f2e670` (P6 merged).
**Machine:** Mac Apple M2 Pro, macOS 26.6.2, Node 24.5.0, Chromium and WebKit (Playwright 1.64.1).

Architecture, security, backup and restore: [P7_ARCHITECTURE_BIBLIOTHEQUE.md](P7_ARCHITECTURE_BIBLIOTHEQUE.md). Decisions: [JOURNAL_DECISIONS.md](JOURNAL_DECISIONS.md#journal--2026-11-05-batch-p7-personal-library). Manual acceptance test: [RECETTE_HUMAINE_P7.md](RECETTE_HUMAINE_P7.md).

> No LEGO content is added to the repository: no set MPD, no PDF, no real mapping, no instruction screenshot. The fixtures of the storage tests are original (CC0). The real evidence stays in `~/Documents/brick-lab-data/proofs/p7/`.

## 1. What is delivered

| Need | Delivered |
|---|---|
| Land on "Ma collection" (My collection) | `/`: grid of sets (local 3D thumbnail, number, name, parts, files, modes, progress, status), number/name search (accents ignored), filters "En cours" (In progress) / "Terminés" (Completed) / "Non commencés" (Not started), "Construire" (Build) / "Reprendre" (Resume). The P5/P6 workshop without a collection stays on `/atelier`. |
| Durable storage on the Mac, shared Chrome/Safari | Local Next.js server (Node `fs`), `~/Documents/brick-lab-data/library/`: validated JSON index, files addressed by SHA-256, progress and mapping per build, atomic writes, history, trash. |
| Add a set | Dialog: one or more `.mpd`/`.ldr` models (one per build, main model selectable), one or more PDF instructions, a JSON mapping (rejected if it concerns another model), number and name. Duplicates detected by fingerprint. |
| Alternate models | A set contains several distinct builds (each: model, main model, instructions, mapping, progress). |
| Manage | Set detail: 3D preview, rename (set and build) without touching the progress, associate / replace / dissociate instructions, import or replace a mapping, export, verify fingerprints, repair a file, add a build, remove (trash). |
| Existing files | Read-only detection of `models/`, `instructions/`, `mappings/`; adding **without copying**; mapping recognized by model fingerprint, most verified one preselected. |
| Resume | Opening from the collection: fingerprints recomputed, model and instructions loaded without selection, progress validated (P5/P6), mode restored, mapping revalidated, mode synchronized only if mapping valid **and** expected instructions associated, page and step restored. Missing/modified file: clear error, nothing else loaded, repair from the detail. |
| P5/P6 compatibility | P5/P6 workshop unchanged (`BuildStore` injected). v1/v2 progress accepted as is. `localStorage` saves picked up on opening (never erased); choice asked if they diverge and are newer. |

## 2. Real acceptance test 31040 / 31009 (real data folder)

**Production** server (`npm run build && npm run start`), folder `~/Documents/brick-lab-data/`.

1. Empty collection → banner "8 set(s) trouvé(s)" (8 set(s) found) (discovery: 130 ms). 31040: instructions 6145903 checked, `31040-1.brick-mapping.json` **24/24 verified** preselected (the prepared 0/24 version is offered but not chosen). 31009: 3 instruction booklets; only 6038244 (booklet of the main model) was kept.
2. Added via the interface: "31040-1 Desert Racers" and "31009-1 Small Cottage". Thumbnails rendered locally. Files left in place; only the mapping (7 KB) and the index are written under `library/`.
3. 31040 → "Construire" → "Commencer — notice synchronisée" (Start — synchronized instructions): booklet opened **without selection**, p. 2, step 1. 12 parts placed (placement aid) → step 6, p. 4, "Enregistré dans la bibliothèque" (Saved in the library).
4. Page closed, **server stopped then restarted**, new page: card "12/65 pièces posées" (12/65 parts placed), "En cours", "Reprendre" → "Progression restaurée : 12/65" (Progress restored: 12/65), Notice synchronisée (synchronized instructions) mode, Step 6, p. 4, booklet open.
5. 31009: opened from the collection, 270 parts, 92 part/color combinations, "indeterminate" inventory warning kept, 84-page instructions opened, synchronized mode not offered (no mapping).
6. Fingerprints and modification dates of the third-party files (`models/`, `instructions/`, `mappings/`) **identical** before/after.

Equivalent automated run on an isolated copy (`tests/e2e/library-omr.spec.ts`, scripted P5 player, pointer and keyboard):

| Measurement (31040, synchronized mode) | Result |
|---|---|
| Discovery, verified mapping preselected, no file copied | OK |
| Parts placed | **65/65**, 0 refusals, 0 PageUp/PageDown fallbacks |
| Interruption at 30/65, back to collection, **browser closed** (new context) | Resume: 30/65, Notice synchronisée, Step 11, p. 7, booklet open without import |
| Opening from the collection (model + instructions + geometry) | 5.1 s cold (dev server), 3.5 s on resume |
| Final status in the collection | "Terminé" (Completed) |
| 31009: opening, instructions, 5 parts in guided mode saved | OK |

Screenshots (outside the repository): `proofs/p7/collection.png`, `proofs/p7/31040-1-resumed-30.png`.

## 3. Tests

New:
- **unit** `library-store.test.ts` (24): add and re-read by a new store **and by another Node process** (restart), duplicates (file, model, number), rejected types and sizes, several PDFs (order, replacement, progress kept), mapping added later / mapping of another model or another part count rejected / revision conflict / history, alternate models (same file with another main model, progress not transferable), progress (revisions, conflict, foreign progress rejected, reset with confirmation), P5 v1 and P6 v2, modified files (same size), resized, missing, repair, interrupted write (index intact, no temporary file), damaged index (no write) or deleted with backups, read-only folder, corrupted progress kept, hostile paths, index pointing outside the folder, `__proto__`, symbolic links ignored, rename without loss, trash, discovery and adoption without copy, search/filters;
- **unit** `library-api.test.ts` (11): HTTP guard (DNS rebinding, cross-site, same-site, other origin, no origin, no header, `null` origin), full flow through the handlers, malformed requests;
- **E2E** `library.spec.ts` (9, original fixtures): full add + incompatible mapping + duplicate, synchronized build → collection → **browser closed** → resume (page, step, instructions without import), two tabs (no overwrite), rename + instructions, mapping added later / rejected, alternate models, resume of a P5 browser save, modified/missing file + repair, unauthorized requests (including an iframe from another origin: "blocked");
- **E2E** `library-webkit.spec.ts` (1): game started in Chromium, resumed in **WebKit**, then again in Chromium;
- **E2E** `library-omr.spec.ts` (3, real, skipped without the files).

The 6 existing specs change only by URL (`/` → `/atelier`).

## 4. Acceptance test output (2026-11-05, after review, `npm run recette`, exit 0)

```
check:spec   15 OK, 2 DÉCLARÉ (écarts P5 inchangés), 0 écart nouveau
typecheck    tsc --noEmit : 0 erreur
vitest       Test Files 8 passed (8) — Tests 131 passed (131)   [84 P0–P6 + 47 P7]
playwright   43 passed (15.7m), 0 ignoré
  brick-lab.spec.ts               6/6   (P0–P4, fixtures)
  instructions-sync.spec.ts       4/4   (P6, fixtures)
  library-webkit.spec.ts          1/1   (P7, Chromium ↔ WebKit)
  library.spec.ts                11/11  (P7, fixtures originales)
  surface-placement.spec.ts       6/6   (P5, fixtures)
  instructions-sync-omr.spec.ts   2/2   (P6, 31040 réel)
  library-omr.spec.ts             3/3   (P7, 31040 + 31009 réels)
  omr-validation.spec.ts         10/10  (P5, 31040 + 31009 réels)
npm run build   OK (production, 0 avertissement)
```

Not run: `npm run perf` (P7 changes neither the rendering nor the engine).

## 5. Known limitations

- **Real Safari not tested by Claude**: Playwright's WebKit (Safari's engine) is tested; the Safari application remains for the manual acceptance test (section 3 of the protocol).
- **Only one server at a time** on a given folder: writes are serialized within the process; two simultaneous servers (dev + production) on the same folder are not protected by a file lock (revisions limit the risk without excluding it).
- **Browser saves**: read in the browser that holds them (Chrome and Safari each have their own), by model fingerprint. The one from your P6 acceptance test in Chrome could not be verified by Claude.
- **Position in the instructions**: in case of concurrent saves that differ only by the page or the displayed booklet, the last one wins (the game itself is never overwritten).
- **Quick check** in the collection (existence + size; the model is always hashed): an instruction booklet modified without a size change only shows up in the set detail or on opening (full hash).
- **Files "left in place"**: moving or renaming them breaks the reference (reported, repairable by choosing the original file, which is then copied into `library/blobs/`).
- **Orphan files**: a file imported then abandoned (dialog cancelled, build removed) stays in `library/blobs/`; no automatic cleanup.
- **History**: 30 versions per type and per build (progress: at most one per minute), 20 versions of the index.
- **Thumbnail**: rendered the first time the collection or the detail is displayed; without a configured LDraw library, no thumbnail (placeholder).
- **31009**: no mapping (entry not done, out of scope); booklets 6038252 / 6038254 are those of the alternate models, for which the OMR provides no MPD.
- **First cold render in `next dev`**: up to a few seconds (page compilation); first test timeout raised to 60 s.

## 6. Verdict

**GO with conditions.**

Demonstrated: the collection is on the Mac's disk, shared by the browsers; 31040 and 31009 are in it without re-import or copy of their files; 31040 resumes from "Ma collection" in synchronized instructions mode, after closing the browser and restarting the server, at the same step and the same page, booklet open without selection, then completes (65/65). Nothing is invented: modified or missing file → error and repair, never substitution. P5/P6: no regression (full acceptance test), browser saves picked up without loss.

Conditions:
1. **P7 manual acceptance test** (`RECETTE_HUMAINE_P7.md`), in particular in the **Safari** application (only Playwright's WebKit was tested).
2. Verify the resume of your P6 game left in your Chrome's `localStorage` (not accessible to Claude).

Merging remains subject to your explicit approval.

## 7. Fixes after the owner's review (2026-11-05)

**Request.** The choice between a P5/P6 browser save and the library's must not depend on the date: the old P6 game must remain recoverable even if it is older than the 12/65 parts of the trials; compare mode, placed parts, page, mappings; no silent overwrite.

**Delivered.**
- `src/domain/library/save-compare.ts`: comparison of the relevant differences (mode, placed parts — with the detail of those specific to each version —, page, displayed booklet, fingerprint of the mappings played); the date is only indicative.
- On opening: as soon as the two versions differ, a screen compares them side by side and asks which one to resume, **regardless of the date**. The browser's mappings can be picked up along with the game (visible checkbox). A library save that has become incompatible is never replaced without asking.
- "Reprendre la bibliothèque" is remembered for that specific browser save (no more question, but a reminder); it remains recoverable at any time from the **set detail** ("Reprendre la sauvegarde de ce navigateur", with confirmation). The collection flags these saves with a link to the detail.
- Every explicit resume copies the replaced library version into `history/` (including within the minute, unlike automatic saves); a resume based on a stale revision is rejected. `localStorage` is never modified.

**Tests added.** Unit `save-compare.test.ts` (11: identical despite dates and order, older browser offered, newer browser offered, each difference alone, all together, library absent / incompatible, save of another model ignored, memorization per specific save); `library-store` "explicit browser recovery always keeps the replaced one"; E2E "an OLDER browser save…" (keep the library, then recover from the detail, history and `localStorage` verified) and "… another mapping" (mappings picked up, old version in the history).

**Found when re-running the acceptance test.**
1. *Reload loop in `next dev`* (11 then 12 failures at the start of the series): the first explanation (`headers()` rule) was **wrong**. Measured cause: the worktree's Turbopack cache `.next/dev` (HMR "hash mismatch" on every connection; 733 / 640 navigations in 20 s with this cache, 2 out of 5 attempts without). The E2E server now starts with a fresh cache. The production server is not affected.
2. *Two tabs opened together*: each re-saved the page on load, and the second was blocked without any game change. On a conflict, if only the page or the displayed booklet changed, the save is redone; otherwise, rejection and "Recharger" (Reload). Test made deterministic.

**Real data.** Nothing was renamed, deleted or reset in `~/Documents/brick-lab-data/library/`. Safety backup before the manual acceptance test: `~/Documents/brick-lab-data/backups-p7/library-2026-11-05T19-05-04-avant-recette-humaine.tar.gz` (archive verified by separate extraction and comparison of the SHA-256 listed in `library-2026-11-05T19-05-04.sha256`). To return to this state: stop the server, set aside (do not delete) the current `library/` folder, then `tar -xzf <archive> -C ~/Documents/brick-lab-data`.

**Verdict.** Unchanged: **GO with conditions** (manual acceptance test in Chrome and Safari, including the resume of your P6 game). No merge without your explicit GO.

## 8. Owner's manual acceptance test and final verdict (2026-11-06)

Results reported by the owner, who ran the acceptance test himself on the production server and his real data folder ([RECETTE_HUMAINE_P7.md](RECETTE_HUMAINE_P7.md)):

| Point verified | Result |
|---|---|
| Recovery of his P6 save (Chrome `localStorage`) | OK |
| Collection and resume in Chrome | OK |
| Same collection and resume in Safari | OK |
| Conflict handling between browsers | OK |

No other measurement was taken during this acceptance test; the Safari version was not reported.

**Verdict: GO.** The two conditions of section 6 are lifted. The owner gave his explicit GO to merge PR #4 (by rebase).

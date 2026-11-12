# P8 — Simplified import and set discovery: report

**Date:** 2026-11-06. Branch `feat/p8-simplified-import`, worktree `brick-build-worktrees/p8-simplified-import`, base `origin/main` = `a4d2eeb47dc502b3cd50328c86babe8b9c31b0ea` (P7 merged).
**Machine:** Mac Apple M2 Pro, macOS 26.6.2, Node 24.5.0, Chromium (Playwright 1.64.1).

Sources, permissions, strategy, security: [P8_ARCHITECTURE_IMPORT.md](P8_ARCHITECTURE_IMPORT.md). Decisions: [JOURNAL_DECISIONS.md](JOURNAL_DECISIONS.md#journal--2026-11-06-batch-p8-simplified-import). Manual acceptance test: [RECETTE_HUMAINE_P8.md](RECETTE_HUMAINE_P8.md).

> No third-party content is added to the repository: no set MPD, no PDF, no real mapping, no recorded OMR page. The fixtures are original (CC0); the OMR pages in the tests are synthetic. The real evidence stays in `~/Documents/brick-lab-data/proofs/p8/`.

## 1. What is delivered

| Need | Delivered |
|---|---|
| Enter the set number | Page `/ajouter` ("Ajouter un set" (Add a set) button of "Ma collection" (My collection)). `31040`, `31040-1`, ` 31040 - 1 ` → `31040-1`; variant `-1` assumed **and displayed**; `31040-2` remains another box. Invalid number rejected with an example. |
| Search for models and instructions | Without network: collection (sets with the same number and their builds) and data folder (`models/<n>/`, `instructions/<n>/`, mappings from `mappings/` by fingerprint). On a "Chercher en ligne" (Search online) click: set page on the OMR (main model + alternates, author), Rebrickable if a local key exists, link to the LEGO instructions. |
| Present resources and limits | Per source: found / nothing / unavailable / not configured, with the reason and a link to the official page. "Notice disponible sur LEGO.com, mais téléchargement manuel nécessaire." (Instructions available on LEGO.com, but manual download required.) |
| Explicit selection | Models (and possible builds of a same MPD), instructions per build, mappings per build; everything can be checked or removed; advanced details collapsed. |
| Prepare, analyze | Server side, outside the index: LDraw steps, submodels, parts, references missing from the local LDraw library, diagnostics, license and author of the file, pages and SHA-256 of the PDFs, mappings classified valid / incomplete / incompatible. |
| Compatibility before confirmation | Sheet per build: modes actually available and reasons (see section 3). |
| Add to the library | A single index write; SHA-256-addressed copies, data folder files left in place; provenance kept; retry without duplicates; existing progress and mapping never replaced. |
| Start building | "Construire "…"" (Build "…") opens the workshop directly (no file selection). |
| Quick local import | Drag and drop or simultaneous selection of `.mpd`, `.ldr`, `.pdf`, `.brick-mapping.json`, without Internet. |
| Set already present | "Ce set est déjà dans ta collection" (This set is already in your collection) → add the builds to the existing set (default) or second set (explicit choice); "Ce modèle existe déjà dans ta collection" (This model already exists in your collection) (disabled checkbox, link). |

Replaced: the P7 dialog `AddSetDialog` (its rules are carried over and extended). Unchanged: engine, workshop, mappings editor, set detail, P7 discovery banner.

## 2. Real acceptance test (2026-11-06)

**Set: 31045-1 Ocean Explorer** (Creator 3-in-1, 213 parts in the OMR MPD), absent from the collection. **Isolated environment**: `$TMPDIR/brick-lab-recette-p8` (library empty at the start), real LDraw part library read, **real OMR** (no simulated response). Reproducible command: `npx playwright test -c playwright.recette-p8.config.ts -g "part 1"`, server stop and restart, then `-g "part 2"`.

| Step | Result |
|---|---|
| 1. Search `31045` | Read as 31045-1; data folder (isolated): nothing; "Chercher en ligne": **"3 modèle(s) 3D sur l'OMR, dont 2 alternatif(s)"** (3 3D model(s) on the OMR, including 2 alternate(s)): Ocean Explorer (`31045-1.mpd`), Aircraft, Submarine, author Tomas Kralicek [RabbiT_CZ]. Rebrickable: "non configuré" (not configured) (no key). LEGO link: `…/fr-fr/service/building-instructions/31045`. |
| 2. Retrieval | One "Télécharger" (Download) click: `31045-1.mpd`, 51 KB, **SHA-256 `b25e0473…` identical to the file obtained by hand in P5**; downloaded without the page's `?v=` parameter. License read from the file: "Redistributable under CCAL version 2.0". |
| 3. Parts check | 213 parts, 70 references, 85 part/color combinations, 6 submodels, 75 LDraw steps (flattened), 0 errors, **no reference missing** from the local LDraw library. Inventory: "indéterminé" (indeterminate) (not compared to the official inventory). |
| 4. Instructions | **No real 31045 instructions exist on this Mac and the script does not download from LEGO.com**: a 4-page **synthetic** PDF was dropped in its place to exercise the association ("4 pages", "association proposée, non vérifiée" (association proposed, not verified)). Sheet: "Montage libre avec notice" (Free building with instructions), "Notice synchronisée indisponible : aucune correspondance validée" (Synchronized instructions unavailable: no validated mapping). The trial with the real instructions is in section 2.5 of the manual acceptance test. |
| 5. Add | Proposed name "Ocean Explorer" (OMR page). Search → added: **7.0 s** (network included). Index: one revision; provenance `{ source: omr, url: …/media/omr_models/371/31045-1.mpd, pageUrl: …/omr/set/31045-1, license, author, retrievedAtIso }`. |
| 6. Build | "Construire" → guided mode → **12 parts placed** by the scripted P5 player (pointer and keyboard): 12 placements, 0 refusals, 0 PageUp/PageDown fallbacks, 1 camera move; "Enregistré dans la bibliothèque" (Saved in the library). |
| 7. Back to the collection | Card "31045-1 Ocean Explorer, 213 parts, Modèle 3D ✓ (3D model), 1 notice, Pas de correspondances (No mappings), Guidé / Montage libre, **12/213 pièces posées**, En cours, Reprendre". |
| 8. Resume without re-import | Server **stopped and restarted**, new browser context: "**Progression restaurée : 12/213 pièces posées.**" (Progress restored: 12/213 parts placed.), guided mode. New search `31045` + download: "Ce modèle existe déjà dans ta collection : 31045-1 Ocean Explorer — "Modèle principal"", still **1** set. |

The search → OMR → add flow was also run on the **production server** (`next start`): same result (index, file, provenance). The scripted placement requires the test hooks, absent from production: it was done on `next dev`, like the P5–P7 acceptance tests.

**Real data intact**: SHA-256 of the 48 files of `~/Documents/brick-lab-data/{library,models,instructions,mappings}` (excluding `library/backups`) identical before and after the acceptance test, `library.json` date unchanged. 31040 and 31009 were not touched. No set added to your library.

Evidence (outside the repository): `proofs/p8/recette-31045-1.json` (full log), `31045-1-compatibilite.png`, `31045-1-construction.png`, `31045-1-reprise.png`.

### Defects found and fixed during the batch

1. **Non-ASCII `User-Agent` header** (typographic apostrophe): Node rejects the request (`ERR_INVALID_CHAR`), the OMR appeared "unavailable". Invisible with the simulated transport; found by the real acceptance test. Fixed (ASCII) + a test that validates each header sent with Node's validator.
2. **Interrupted first index write**: the backup copy was written before `library.json`, leaving a backup without an index; at the next startup the library locked up. **P7** defect revealed by a P8 test; order reversed.
3. **Node `BlockList`**: a rule `::ffff:0:0/96` also applies to all IPv4 addresses (everything was "private"); rule removed, mapped IPv4 explicitly converted (dotted and hexadecimal forms).
4. **Default label** of a build added to an existing set: "Modèle principal" a second time; the letter now follows the existing builds ("Modèle C").
5. **Compatibility sheet**: nothing was said when all parts are present; "Pièces vérifiées" (Parts verified) line added.

## 3. Compatibility sheet rules (verified by the tests)

| Case | Displayed |
|---|---|
| LDraw steps | "Modèle prêt pour le montage guidé : N étape(s) LDraw" (Model ready for guided building: N LDraw step(s)) (+ "ordre différent de la notice officielle" (order differs from the official instructions) if flattened) |
| No steps | "Pas d'étapes LDraw dans ce fichier : montage libre uniquement" |
| + PDF | "Montage libre avec notice : N livret(s)" |
| + valid mapping **and** its booklets selected | "Notice synchronisée disponible" (mode `synced`) |
| PDF without valid mapping | "Notice synchronisée indisponible : aucune correspondance validée" (or the reason: incomplete, booklet not selected) |
| Missing references | "Modèle incomplet à l'écran : N référence(s)…" |
| LDraw library not configured | "Pièces non vérifiées" |
| Unverified inventory | "Inventaire indéterminé…" (31040: "Inventaire officiel vérifié"; 31009: P5 message) |
| Instructions without model | "Notice trouvée sans modèle 3D : pas de construction interactive disponible"; confirmation not possible |

No mapping is generated: without an existing mapping for the exact fingerprint of the model, the synchronized mode is never offered.

## 4. Tests

New:
- **unit** `set-number.test.ts` (22): normalization, variants, number in a file name; compatibility sheet (each case of section 3, valid / incomplete mapping / booklet not selected / other main model, missing parts, inventory).
- **unit** `online-sources.test.ts` (44): public / private addresses (IPv4, IPv6, mapped), rejected URLs (http, other host, trap subdomain, credentials, port, IP, `file:`), **DNS rebinding** (simulated resolver), redirects (same host accepted, other host / cloud metadata / http rejected), announced and streamed size, timeout, HTTP 503, network cut, ASCII headers; synthetic OMR page (main then alternates, links of other sets and other hosts ignored, unknown layout → no model), accepted / rejected download URLs; online search: several models, 404, 503, DNS, offline switch (no request), Rebrickable without key / with key (never sent back) / key rejected.
- **unit** `import-p8.test.ts` (20): local search (variants, data folder), invalid number; quick import of several files (nothing in the index before confirmation), **several models** of a set (separate files + unused model of an MPD + other main model chosen), **no model** (PDF alone), invalid files (empty, binary, fake PDF, fake mapping), prepared file gone; **incompatible** mapping rejected, "incomplete" **draft**, **no mapping invented**; mapping from `mappings/` found by fingerprint; missing parts (temporary LDraw library, parts embedded in the MPD excluded); full import with provenance and synchronized mode; without mapping → no synchronized mode; **repeated import** (no duplicate, progress and mapping kept, no copy); same number → second set rejected, addition to the existing set without touching the progress; different variant → another set; model duplicate in another set; two builds of a same MPD; incompatible mapping at confirmation → nothing added; data folder files left in place (date unchanged); hostile references (`..`, `/etc`, `library/`, wrong folder, hidden file, unknown origin, modified file); **interrupted index write** then retry; **read-only folder**; **P7 index** without provenance re-read and extended, P7 progress kept; forged provenance rejected.
- **unit** `import-api.test.ts` (5): network outputs triggerable only by the application's page (cross-site, DNS rebinding, simple form → 403); non-OMR URLs rejected **before any connection**; source unavailable → clear 502, nothing prepared; offline switch; full flow through the routes (prepare, confirm, retry) and malformed requests.
- **E2E** `add-set.spec.ts` (4, simulated OMR): invalid number then nothing anywhere; OMR main + alternate downloaded on click, instructions and mapping dropped, association per build, synchronized mode for the main only, build, collection, **resume in another browser context**; same set again (already present, nothing duplicated, alternate build added, progress and synchronized mode kept); source unavailable, interrupted download, non-LDraw file, invalid files, instructions without model.
- **Real acceptance test** `tests/recette/p8-reel.spec.ts` (2, outside the standard suite, dedicated configuration).

Modified: `library.spec.ts`, 1st test (the P7 dialog is replaced by the P8 page; same checks: model, two instruction booklets, mapping of another model rejected, valid mapping, card, duplicate, instructions stored once).

## 5. Final validation output

Chain `npm run check:spec && npm run typecheck && npx vitest run && npx playwright test && npm run build` on the final code (2026-11-06), **exit 0**:

```
check:spec   15 OK, 2 DÉCLARÉ (écarts P5 inchangés : .gitignore, CLAUDE.md), 0 écart nouveau
typecheck    tsc --noEmit : 0 erreur
vitest       Test Files 12 passed (12) — Tests 222 passed (222)   [131 P0–P7 + 91 P8]
playwright   47 passed (14.7m), 0 ignoré, 0 instable
  add-set.spec.ts                 4/4   (P8, OMR simulé)
  brick-lab.spec.ts               6/6   (P0–P4)
  instructions-sync.spec.ts       4/4   (P6)
  instructions-sync-omr.spec.ts   2/2   (P6, 31040 réel)
  library.spec.ts                11/11  (P7 ; 1er test passé par la page P8)
  library-webkit.spec.ts          1/1   (P7, Chromium ↔ WebKit)
  library-omr.spec.ts             3/3   (P7, 31040 + 31009 réels : découverte, mapping 24/24, mode synchronisé)
  omr-validation.spec.ts         10/10  (P5, 31040 + 31009 réels)
  surface-placement.spec.ts       6/6   (P5)
npm run build   OK (production, 0 avertissement)
recette réelle  tests/recette/p8-reel.spec.ts : part 1 ✓ (24,2 s), part 2 ✓ après redémarrage (18,7 s)
```

After this validation, only one interface text changed ("Aucun de tes fichiers n'est envoyé hors de ce Mac…" (None of your files is sent outside this Mac…), the previous sentence was inaccurate once the OMR is queried): typecheck and `add-set.spec.ts` + `library.spec.ts` re-run, **15/15**.

Not run: `npm run perf` (P8 touches neither the rendering nor the engine).

## 6. Known limitations

- **OMR without API**: the page `/omr/set/<n>` is not documented; if it changes, the online search lists nothing anymore (clear message, link, manual import). No stability guarantee.
- **LEGO instructions**: still downloaded by the user; the instructions ↔ build association of a 3-in-1 remains to be checked (proposed only for a single build, never deduced from the PDF).
- **Approved specification deviation** (2026-11-06): download of an OMR file by the local server on click, within the architecture framework of section 3. `BRICK_LAB_ONLINE=0` disables it.
- **Rebrickable**: terms of use not read (page refused on automated reading); optional, not tested with a real key (no key available) — tested with simulated responses.
- **Parts check**: first level of files only; a missing primitive inside a part only shows up at rendering.
- **Real acceptance test**: 31045 instructions replaced by a synthetic PDF; OMR alternate model not built (alternate download verified in simulated E2E and listed in real); Safari not tested in P8 (no browser-specific code added) → manual acceptance test.
- **Staging area**: files dropped then abandoned kept 7 days in `library/staging/`.
- **One server at a time** per data folder (unchanged since P7).
- **Scripted placement**: impossible on the production build (test hooks absent, P5 choice); done on `next dev`.

## 7. Verdict

**GO with conditions.**

Demonstrated: a set absent from the collection (31045) is added by entering its number, with **two clicks** for the model ("Chercher en ligne", "Télécharger") and one drop for the instructions; the analysis, the compatibility sheet and the add promise only the modes actually available (no synchronized mode without validated mappings, indeterminate inventory flagged); the build starts without file selection, shows up in the collection and resumes after a restart, without re-import; a replayed import duplicates nothing; the quick local import works without Internet; 31040/31009 and the synchronized mode are unchanged (real P5–P7 suites re-run); your real library was not modified.

Conditions:
1. ~~Validate the specification deviation~~: **lifted on 2026-11-06** (explicit GO from the owner, framework recorded in architecture section 3 and in the decision journal).
2. **P8 manual acceptance test** (`RECETTE_HUMAINE_P8.md`) in Chrome and Safari, with a real LEGO instruction booklet and, at your convenience, a real addition of a set to your collection.

Merging remains subject to your final GO after the manual acceptance test.

## 8. Follow-up after the report

**2026-11-06 — OMR download approval.** The owner approves the deviation (condition 1 lifted) and the current download architecture, **not yet the merge** of PR #5. No code modified. Production manual acceptance test prepared (`RECETTE_HUMAINE_P8.md`), after checking the state of the real data and a verified backup (see that document, section 0).

**2026-11-06, 19:15 — production manual acceptance test: survey of the traces.** Point-by-point detail: [RECETTE_HUMAINE_P8.md](RECETTE_HUMAINE_P8.md#recorded-results-2026-11-06-claudes-survey-at-1915). Established by the data: real addition of **31039-1 Blue Power Jet** from the OMR (full provenance kept), instructions dropped (224 pages), free building opened (0 parts placed), a single index write, no duplicate, 31040/31009 and the set files intact. **No trace**: compatibility sheet, server restart (none observed), duplicate trial, offline import, opening of 31040/31009, Safari. None of these points is considered validated without confirmation from the owner. No anomaly found in the traces; the empty mappings draft of 31039 comes from the workshop (P6/P7 behavior), not from the import.

## 9. Closure and merge verdict

**Branch state**: `feat/p8-simplified-import`, no functional change since the final validation (section 5); the following commits only touch the documentation. Base `origin/main` = `a4d2eeb`, merge without conflict reported by GitHub.

**Merge verdict (before the closure acceptance test): technically ready, merge not recommended as is** — points 4 to 8 and Safari had no trace.

- Achieved: full automatic validation (222 unit, 47 E2E with no skipped test, build), Claude's isolated real acceptance test (31045, resume after restart), production manual acceptance test for the search, the OMR download, the import of the instructions and the add.

## 10. Closure manual acceptance test and final verdict (2026-11-06)

Results **declared by the owner** at the end of his manual acceptance test ([RECETTE_HUMAINE_P8.md](RECETTE_HUMAINE_P8.md), closure flow); no measurement was taken by Claude during this acceptance test:

| Check | Result (owner) | Traces in the data |
|---|---|---|
| C6 — LEGO instructions `6127618.pdf` of 31039 | OK | not traceable |
| C5 — compatibility (free building, no steps) | OK | not traceable |
| C1 — progress and resume after restart | OK | **absent**: 31039 0/609, last save 19:09, no server restart |
| C2 — duplicates | OK | **absent**: nothing in staging |
| C3 — Safari | OK | not traceable |
| C4 — offline import | OK | **absent**: nothing in staging |

The C1/C2/C4 discrepancy was presented before the merge; **the owner decided to merge despite it**. Real data intact at the time of the decision (index revision 3, 31040 25/65, set files identical to the 19:19 inventory; `backups-p8/` backups kept).

**Final verdict: GO** (owner's decision, 2026-11-06). Merge of PR #5 by rebase, without force push, branch and worktree kept.

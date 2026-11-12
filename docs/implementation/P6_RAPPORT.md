# P6 — Official instructions and synchronized 3D building: report

**Date:** 2026-11-04. Branch `feat/p6-instructions-sync`, dedicated worktree, base `origin/main` = `5e03680` (P5 merged).
**Machine:** Mac Apple M2 Pro, macOS 26.6.2, Node 24.5.0, Chromium (Playwright 1.64.1).

Architecture, schema and risks: [P6_ARCHITECTURE_NOTICE_SYNC.md](P6_ARCHITECTURE_NOTICE_SYNC.md). Decisions: [JOURNAL_DECISIONS.md](JOURNAL_DECISIONS.md#journal--2026-11-04-batch-p6-instructions--3d-synchronized).

> No LEGO content is added to the repository: no PDF, no instruction image or text, no set MPD, no real mapping. The P6 fixture is original (CC0). The 31040 mapping, the screenshots and the measurements stay in `~/Documents/brick-lab-data/` (`mappings/`, `proofs/p6/`).

## 1. What is delivered

| Phase | Delivered | Evidence |
|---|---|---|
| A — Study | Measurements on 31040 (1 booklet, 3 models, 21 steps of model 1 over 11 pages, callouts, "2x/4x") and 31009 (3 booklets = 3 models, inserted sequence, non-unique numbers) | `P6_ARCHITECTURE_NOTICE_SYNC.md` § 1 |
| B — Model | `brick-lab-instruction-mapping` v1 schema: MPD fingerprint (SHA-256, main model, part count), booklets (PDF SHA-256 and pages), entries (booklet, PDF page, printed number, callout, multiplier, `occurrenceIds`, `manual`/`verified` provenance, note). Bounded parsing of untrusted input; recomputed validation (duplicates, coverage, pages, order). | `src/domain/instructions/mapping.ts`, 23 unit tests |
| C — Editor | **Correspondances** (Mappings) tab: booklets linked to the displayed PDF, ◀ ▶ navigation between steps, new prefilled step (displayed page, next number), assignment by 3D click on a ghost, removal by click on a highlighted part, explicit move by ⌥-click, +1 / +n buttons per part/color, "free parts of an LDraw step" aid, 3D preview (built up to the step, step in amber, unassigned as ghost), duplicates with correction, detailed validation, automatic local save, export and re-import of the personal file | `src/components/mapping/MappingEditor.tsx`, E2E "editor" |
| D — Play | **Notice synchronisée** (Synchronized instructions) mode offered only if the mapping is valid. Step banner (printed label, booklet, page, rank on the page), page turned automatically, only the parts of the step in the tray, automatic advance, viewing a past step, "reprendre depuis cette étape" (resume from this step), undo, mode change that keeps the parts, resume after reload, fingerprint check of the re-imported PDF. Without a valid mapping: **explicit** return to free building, parts kept. | `BrickLabApp.tsx`, `SyncStepBanner.tsx`, E2E "synchronised build", "fallback" |

## 2. Real trial on 31040 (model 1, booklet 6145903, pp. 2–12)

**Input.** Claude entered the mapping by reading each page (local PDF rendering), following the editor's method: 24 entries for 21 printed steps (the callouts of steps 7, 14 and 18 are split into substeps), i.e. 65/65 occurrences assigned once. The validator reports **no warning**, only "24/24 not visually verified".

| LDraw steps (OMR file) | Instruction entries | Match |
|---|---|---|
| 1 (5 parts) | 1, 2 (p. 2) | 2 + 3 |
| 2 (7) | 3, 4 (p. 3), 5 (p. 4) | 2 + 4 + 1 |
| 3 (3) | 6 (p. 4) | 3 |
| 4 (8) | 7·1, 7·2, 8 (p. 5) | 1 + 3 + 4 |
| 5 (5) | 9, 10 (p. 6) | 2 + 3 |
| 6 (5) | 11, 12 (p. 7) | 3 + 2 |
| 7 (10) | 13, 14·1 ×2, 14·2 ×2 (p. 8) | 4 + 2 + 4 |
| 8 (5) | 15, 16 (p. 9) | 3 + 2 |
| 9 (4) | 17, 18·1, 18·2 (p. 10) | 1 + 1 + 2 |
| 10 (5) | 19, 20 (p. 11) | 3 + 2 |
| 11 (8) | 21 ×4 (p. 12) | 8 |

Each LDraw step splits **exactly** into consecutive instruction steps: the OMR author merged steps without changing the order. This finding holds for 31040, not in general (31009: submodels, minifig last).

**Uncertain points**, noted in the mapping and to be verified by the owner:
- steps 9, 16 and 19: the instructions draw **one** part with two arrows, whereas the file contains two, identical and symmetric;
- boundary between steps 4 and 5 (dark gray 1×4 plates).

**Real build** (`tests/e2e/instructions-sync-omr.spec.ts`, P5 scripted player, pointer and keyboard only, step locations displayed by default):

| Measurement | Result |
|---|---|
| Parts placed | **65/65**, 65 clicks, **0 refusals**, 0 PageUp/PageDown fallbacks |
| Instruction entries traversed | **24/24, in mapping order** |
| Displayed page = step page, without clicking on the PDF | **24/24** (11 pages, from p. 2 to p. 12) |
| Parts offered outside the active step | **0** (checked before each placement) |
| Resume after reload at 30/65 | OK: same entry, booklet to re-import, page found again |
| Placements in equivalent orientation / orientation changes (O) / camera rotations | 18 / 25 / 7 |
| Duration of the scripted build | 34 s |
| Editor preview at step 13 (p. 8) | 33 parts built, 4 highlighted, 0 ghost |

**Visual check** (screenshot outside the repository `proofs/p6/31040-1-synced-step8.png`): at step 8, the 3D matches the state of step 7 drawn on page 5, and the tray only offers the 4 parts drawn at step 8.

**Measurement that changed a decision**: with the locations hidden, the scripted player failed at the 52nd part (tile placed on the back face, hidden from the camera). The step locations are now displayed by default, as in guided mode. The checkbox can still be unchecked.

## 3. Tests actually run

See § 6 (output of `npm run recette`). New tests:
- **unit** `tests/unit/mapping.test.ts` (23): complete and incomplete coverage, duplicates within a step and between steps, another model, another main model, another part count, unknown parts, booklets and pages, page order, repeated labels, multiplier, empty step, several booklets, submodels, editing without silent duplicates, exact export/import round trip, malformed or out-of-bounds entries, unknown fields and `__proto__` ignored, synchronized plan (page and rank), advance, undo, going back, mode change, v2 progress and re-reading of v1, mapping fingerprint;
- **synthetic E2E** `tests/e2e/instructions-sync.spec.ts` (4): complete editor (including real 3D clicks and ⌥-click), synchronized play (2 steps on a page, callout, "2x", page turning, viewing, resume from a step, undo between steps, reload, wrong instructions, return to the page), absence of synchronized mode without a valid mapping, explicit fallback, P5 v1 progress;
- **real trial** `tests/e2e/instructions-sync-omr.spec.ts` (2, skipped if the files outside the repository are missing).

The P5 scripted player was **moved without modification** to `tests/e2e/scripted-player.ts`; the P5 `omr-validation` spec imports it and passes again in full (§ 6).

## 4. Limits

- **Manual input only**: no recognition of the instructions. For 31040, 24 entries and 65 parts; for 31009, about 80 entries and 270 parts would be needed (not done in this batch).
- **31040 mapping**: entered by Claude, then checked by the owner against the instructions (§ 7). The 24 entries are `verified` on their confirmation; the 4 uncertain points are kept as is, without correction. The "à confirmer" (to be confirmed) notes of steps 9, 16 and 19 remain in the file.
- **Strict fingerprint**: another edition or language of the same instructions (other SHA-256) is refused, even if its pages are identical. The booklet must be linked again in the editor, which invalidates the verification.
- **No physical verification of the order** (part placed before its support): P5's "in the air" placement allows it.
- **Empty steps** (assembly of a callout, flipping): flagged then skipped in play; their page is not shown separately.
- **Callouts**: built in place, at the final position, and not separately as in the instructions.
- **"+1" shortcut**: it takes the first free part in file order, not necessarily the one on the page. The 3D click is the exact method.
- **P6 manual acceptance test**: OK (§ 7), but detailed grid and browsers tested not reported.
- **31009 not tried** in synchronized mode (the multi-booklet schema is tested on fixtures and in unit tests).

## 5. Verdict

**GO** (2026-11-05, after manual acceptance test; initial verdict of 11-04: conditional GO).

Demonstrated: the mapping schema guarantees "each occurrence exactly once". The editor allows real input, and synchronized mode has 31040 built end to end at the pace of its official instructions, page by page, with no part outside the step, with resume after reload. No P5 regression (§ 6). Nothing is invented without a valid mapping.

Conditions set on 11-04, lifted on 11-05 (§ 7):
1. ✅ **P6 manual acceptance test** per `RECETTE_HUMAINE_P6.md`: OK.
2. ✅ **Verification of the 31040 mapping** by the owner against the instructions: 24/24 entries confirmed, without correction.

Merging remains subject to the owner's explicit GO.

Outside the conditions, to be decided: input of 31009 (input cost, R9); aid for creating steps from the PDF text layer (step numbers), never automatic part assignment.

## 6. Acceptance test output (2026-11-04, `npm run recette`, exit 0)

```
check:spec   15 OK, 2 DÉCLARÉ (écarts P5 inchangés), 0 écart nouveau
typecheck    tsc --noEmit : 0 erreur
vitest       Test Files 5 passed (5) — Tests 84 passed (84)   [61 P0–P5 + 23 P6]
playwright   28 passed (11.9m)
  brick-lab.spec.ts               6/6   (P0–P4, fixtures)
  surface-placement.spec.ts       6/6   (P5, fixtures)
  omr-validation.spec.ts         10/10  (P5, 31040 + 31009 réels : guidé, reprise, libre, libre + notice)
  instructions-sync.spec.ts       4/4   (P6, fixtures synthétiques)
  instructions-sync-omr.spec.ts   2/2   (P6, essai réel 31040)
npm run build   OK (production)
```

Not run in this batch: `npm run perf` (P6 touches neither rendering nor loading; only a highlighted material is added, and only in the editor and viewing).

## 7. Manual acceptance test and mapping verification (2026-11-05)

**Conditions.** Local production server (`npm run build && npm run start`, `127.0.0.1:3000`), code of PR #3 at commit `4ebe7ce`. Local files: MPD `2036218e4555…`, instructions `38e9cd4e32da…`, prepared mapping (24 entries, 0 `verified`). Aid provided: local sheet `brick-lab-data/proofs/p6/verification-31040/index.html`, generated outside the repository. For each entry, it gives the page, the number, the callout and the multiplier, the parts (reference, LDraw designation, color, count, position) and the before/after 3D from two angles. The 4 uncertainties are flagged there.

**Result reported by the owner:**
- acceptance test (`RECETTE_HUMAINE_P6.md` protocol): "C'est tout bon" (It's all good). No KO or annoyance reported; the detailed grid and the list of browsers were not sent (the protocol plans Chrome then Safari);
- mapping verification: "Yes, all 24" (the 24 entries checked against the instructions).

**Verified mapping.**
- **File exported from the application** (Nov 5, 16:25). Validation: 65/65, 0 duplicates, PDF fingerprint recognized. Assignments and order **identical** to the prepared mapping (same `mappingDigest`): no correction. 1 entry out of 24 ticked "Vérifiée" (Verified) in the interface.
- **Marking of the other 23 entries**: set to `verified` **on the owner's explicit confirmation** ("Yes, all 24"), by script, with no other change. Result: 24/24 `verified`, validation with no remark, assignment fingerprint unchanged.
- **Filing, outside the repository**: `~/Documents/brick-lab-data/mappings/31040-1.brick-mapping.json` (SHA-256 `7639e54c1370…`). The version prepared by Claude is kept in `31040-1.prepared-by-claude.brick-mapping.json`.
- **Uncertain points** (steps 4, 9, 16, 19): validated as entered. No change to code or specification during the acceptance test.

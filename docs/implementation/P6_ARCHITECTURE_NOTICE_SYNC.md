# P6 — LEGO instructions and synchronized 3D building: architecture and risks

**Date:** 2026-11-04. Branch `feat/p6-instructions-sync`, base `origin/main` = `5e03680`.

> The instructions and the OMR models stay outside the repository (`~/Documents/brick-lab-data/`). This document only contains **structural counts** (pages, step numbers, number of parts), with no image or excerpt from the instructions.

## 1. Technical study (phase A): what the files really contain

### 1.1 Measurements

Method: PDF text layer (`pdftotext -layout`, page by page), low-resolution rendering of a few pages for visual verification, MPD analysis with the repository's parser (`analyzeModel`).

| Measurement | 31040 Desert Racers | 31009 Small Cottage |
|---|---|---|
| Booklets | 1 PDF (6145903), 32 pp. | 3 PDFs (6038244: 84 pp., 6038252: 64 pp., 6038254: 64 pp.) |
| Models in the instructions | **3 models in the same booklet**: model 1 pp. 2–12 (steps 1–21), model 2 pp. 13–22 (1–19), model 3 pp. 23–30 (1–11); inventory p. 31 | **1 booklet per alternative model** (verified on the covers); the MPD matches booklet 1 |
| Steps per page | 2 in general (pp. 2–11), 1 on p. 12 | 1 to 2; pages without a step (overviews) |
| Subassembly callouts | Substeps "1, 2" in a box, attached to the main step (p. 5 → step 7; p. 8 → step 14 with "2x"; p. 10 → step 17) | Many "1, 2, 3" callouts |
| Multipliers | "2x" (subassembly to be done twice), "4x" (wheels, step 21) | "2x", "3x", "4x" |
| Numbering | Restarts at 1 for each model of the booklet | Booklet 1: steps 1–36, then **an inserted sequence 1–25** (pp. 46–68), then 37–46. **A printed number is not unique within a booklet.** |
| MPD steps | 11 `ROOT_STEPS`, 65 occurrences, no submodel | 77 `FLATTENED_STEPS`, 270 occurrences, 12 submodels |

### 1.2 Consequences

1. **LDraw step ≠ instruction step ≠ PDF page.** 31040: 11 LDraw steps, 21 official steps, 11 pages. The mapping is **n-n** and cannot be deduced from any index.
2. **Key of an instruction step** = (booklet, PDF page, printed number, possible callout), and above all its **position in the sequence**. The number alone is ambiguous (successive models, inserted sequences).
3. **Printed page vs PDF page**: we record the **PDF file's** page index, the one the reader displays. On 31040 they coincide, but nothing guarantees it.
4. **Callouts**: in 3D, all parts are placed at their final position, so the subassembly is built in place. The user chooses their granularity: either a step "7 · callout 1", "7 · callout 2", then "7", or everything grouped in "7". The schema accepts both.
5. **"2x" / "4x"**: in the MPD, each copy has its own occurrences. A "4x" step therefore groups 4 × k occurrences. The multiplier is recorded for information and checked (warning if the number of occurrences is not a multiple).
6. **Alternative models (3-in-1)**: a mapping links **one** MPD (its fingerprint, its main model) to **a range** of instruction steps. For 31040, only pp. 2–12 concern the MPD. The other models in the booklet are not referenced.
7. **Several booklets**: a mapping references an **ordered list** of booklets. Each step designates its booklet. Progress remains a single sequence.
8. **LDraw submodels and subassemblies** (31009): the mapping works at the level of **final part occurrences** (`occurrenceId`), independently of LDraw submodels. The LDraw split only serves as an input aid.
9. **Inventory fidelity**: a part in the instructions that is absent from the MPD (31009: 5 elements) cannot be placed. This is a deviation documented by a note on the step, never invented.

## 2. Mapping model (phase B)

### 2.1 `brick-lab-instruction-mapping` v1 schema (local JSON, exportable)

```ts
interface InstructionMappingV1 {
  format: 'brick-lab-instruction-mapping';
  schemaVersion: 1;
  model: { sha256: string; fileName: string; rootName: string; occurrenceCount: number };
  booklets: { id: string; label: string; fileName: string; sha256: string | null; pageCount: number | null }[];
  steps: {
    id: string;                  // unique, stable ("s1", "s2"…)
    bookletId: string;
    page: number;                // page index IN THE PDF FILE (1-based)
    printedStep: string;         // number as printed ("7")
    callout?: string;            // callout substep ("1", "2")
    repeat?: number;             // printed multiplier ("2x" → 2)
    occurrenceIds: string[];     // MPD occurrences placed at this step
    provenance: 'manual' | 'verified';  // verified = visually checked against the page
    note?: string;
  }[];
  provenance: { method: 'manual'; tool: string; createdAtIso: string; updatedAtIso: string };
}
```

- **Model fingerprint**: SHA-256 of the exact bytes of the MPD, plus `rootName`, because the `occurrenceId`s depend on it, and the number of occurrences.
- **Instructions identity**: SHA-256 of the exact bytes of each PDF and its page count. **No PDF content** is stored: neither text nor image.
- **Provenance**: P6 only offers manual input. `verified` means the user ticked "vérifiée contre la page" (verified against the page) for this step. No automatic method exists in this batch.
- **Warnings**: they are **never read from the file**, but recomputed by `validateMapping` on every load.

### 2.2 Validation (blocking for enabling synchronized mode)

| Code | Severity | Rule |
|---|---|---|
| `MODEL_MISMATCH` | error | fingerprint, main model or number of occurrences different from the imported MPD |
| `UNKNOWN_OCCURRENCE` | error | id absent from the model |
| `DUPLICATE_OCCURRENCE` | error | occurrence assigned twice (same step or two steps) |
| `UNASSIGNED_OCCURRENCE` | error | incomplete coverage: each occurrence must be assigned **exactly once** |
| `UNKNOWN_BOOKLET`, `BOOKLET_UNBOUND` | error | step pointing to an unknown booklet; booklet without PDF fingerprint |
| `PAGE_OUT_OF_RANGE` | error | page outside the booklet |
| `NO_STEPS`, `DUPLICATE_STEP_ID` | error | — |
| `EMPTY_STEP` | warning | step without a part: ignored in play |
| `PAGE_ORDER` | warning | the sequence goes backwards (booklet or page) |
| `DUPLICATE_LABEL` | warning | same (booklet, page, number, callout) twice |
| `REPEAT_MISMATCH` | warning | `repeat` > 1 and number of occurrences not a multiple |
| `NOT_VERIFIED` | info | steps not visually checked |

An incomplete draft can be **saved and exported**, but not **activated**.

### 2.3 From mapping to play

`mappingToStepPlan` produces a `StepPlan` of type `INSTRUCTION_STEPS` (provenance `USER_EDITED`). Each step carries its instruction reference (booklet, page, number). Empty steps are removed. The existing engine is reused **without modifying its placement rules**: a new `synced` mode behaves like `guided` (candidates = active step), with this plan.

- **Active step** = first unfinished step, **derived** from the set of placed parts. It is never stored, so it cannot be corrupted.
- **Automatic advance**: when the last part of the step is placed, the next step becomes active and the instructions jump to its page.
- **Going back**: (a) *view* a past step (page and parts highlighted, nothing removed); (b) *resume from step k* explicitly removes the parts of steps ≥ k; (c) *Annuler* (Undo) removes the last part.
- **Mode change** during a game: placed parts are kept and the active step is recomputed.

### 2.4 Persistence (local only)

| Data | `localStorage` key | Content |
|---|---|---|
| Progress | `brick-lab:progress:<MPD sha>` (schema v2, still reads P5's v1) | mode (`guided`/`freeManual`/`synced`), placed parts, page, active booklet, fingerprint of the mapping used |
| Mapping | `brick-lab:mapping:<MPD sha>` | the JSON above (ids and numbers, no third-party content) |
| PDF | — | **never stored**: re-import requested, fingerprint checked |

Export: `<model>.brick-mapping.json` downloaded locally. Re-import: strict validation of the file (size ≤ 1 MB, types, lengths, bounds) **then** confrontation with the imported MPD.

## 3. Mapping risks

| # | Risk | Probability | Mitigation in P6 |
|---|---|---|---|
| R1 | Assuming LDraw step = instruction step | high (proven false) | No implicit mapping: without a valid mapping, synchronized mode is not offered |
| R2 | Ambiguous printed number (inserted sequences, successive models) | high (31009, 31040) | Step identified by its position and id, number = label; `DUPLICATE_LABEL` warning |
| R3 | Instructions of another edition (language, reprint): shifted pages | medium | Strict SHA-256 fingerprint of the PDF: explicit refusal, no "approximate" page |
| R4 | Modified MPD or another main model: different ids | medium | Fingerprint, `rootName` and number of occurrences checked; unknown ids = error |
| R5 | Parts in the instructions absent from the MPD (31009) | real | Note per step; the inventory remains "undetermined" (P5) |
| R6 | Forgotten or duplicate occurrences | high in manual input | Blocking validation, list of unassigned parts and duplicates in the editor |
| R7 | Physically impossible order (part placed before its support) | low | Not checked automatically (limit); the surface engine already allows "in the air" placement on the target |
| R8 | Badly split "2x" subassembly | medium | `REPEAT_MISMATCH` warning |
| R9 | Input cost (270 parts for 31009) | high | Aids: assign by click in 3D, assign a part/color group, import a whole LDraw step; PDF recognition excluded from P6 |
| R10 | Distribution of third-party data | low | The mapping only contains ids, numbers and fingerprints; real mappings kept outside the repository |

## 4. Components

```
src/domain/instructions/mapping.ts      schema, parse (untrusted input), validation, plan, pure editing
src/domain/build/engine.ts              + 'synced' mode, rewindToStep
src/domain/build/progress.ts            schema v2 (reads v1)
src/infra/persistence/local-mapping.ts  local mapping storage
src/components/pdf/                     multiple booklets, fingerprint, driven page
src/components/mapping/MappingEditor    editor (navigation, assignment, duplicates, export/import, validation)
src/components/BrickLabApp.tsx          3rd mode, synchronized step panel
```

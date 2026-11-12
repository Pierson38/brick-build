# 05 — Batches and validation gates

## P0 — Git preflight + feasibility audit (mandatory)

**Tasks**: check the git base and worktrees; read the docs; decide versions; test the real behavior of `LDrawLoader`; inspect the read output on the fixture and on a manually downloaded OMR model if available; verify that individual occurrences can be maintained.

**Output**: a 1–2 page technical note, a proposed structure, and reproducible commands. **GO** only if the parts/steps can be reconstructed or if a measured alternative is documented.

## P1 — LDraw structural parser

Implement MPD/LDR handling, section table, type 1, STEP, root, submodels, color inheritance, transformations, diagnostics, stable IDs.

**Proof**: unit tests on the fixtures `mini-4-pieces.mpd`, `nested-submodel.mpd`, `no-steps.ldr`, and invalid cases.

**GO**: part by part, composed transformations verified, error detection; no crash on malformed input.

## P2 — Minimal 3D viewer

Render 4 parts correctly with the local LDraw library, orbit/zoom interaction, display preview and diagnostic. Do not invent parts when a reference is missing.

**GO**: real rendering validated in a Mac browser + proof; not just a capture with dummy cubes.

## P3 — Build engine

Explicitly defined steps **and free mode without STEP**, list of occurrences to place, simplified drag, ghost target (optional in free mode), snap, validations, undo, completion. In free mode, the correct position is searched among the unplaced target occurrences compatible with the chosen reference/color.

**GO**: the 4 parts are placed in the right order, an already placed part cannot be placed a second time, the wrong location does not validate.

## P4 — Local PDF

Import a local PDF with PDF.js, zoom, navigation, errors, independence of PDF page / 3D step.

**GO**: instructions imported in session, no network request to LEGO and no error after changing page.

## P5 — Persistence and first real acceptance test

Save the model and progress (or hash + reimport request), resume. Then choose a simple real OMR file and run an acceptance test, reporting geometry/step discrepancies.

**GO**: progress round-trip, compatibility report of the real model, and documented tests.

## P6 — Only afterwards (outside the MVP)

- Manual step editor (definition/reclassification of occurrences and subassemblies);
- Multi-file model import and missing library;
- Advanced Technic modes, complex rotations, performance on large sets;
- `.io`/`.lxf` import after a study of the formats and licenses;
- Manual mapping of assembly step ↔ PDF page.

## End-of-batch discipline

Each batch delivers: goals achieved/not achieved, test commands, verifiable outputs, list of limitations, manual test plan, and GO/NO-GO decision. Do not stack P1 to P6 without an intermediate review.

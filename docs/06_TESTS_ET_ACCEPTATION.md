# 06 — Test strategy and acceptance testing

## Parser unit tests (Vitest)

- 1 LDR section without MPD, with `0 STEP` and valid type 1 lines.
- Multi-section MPD with `0 FILE`/`0 NOFILE`.
- Preservation of **distinct IDs** for two bricks with the same reference / color.
- `0 STEP` is an **end-of-step separator**; no empty first step is created.
- A file without STEP returns `NO_STEPS`, not an invented sequence.
- 2-level submodel; composition matrix correctly tested with non-trivial transformations.
- Inherited color `16` and explicit color.
- Unknown reference, missing submodel, cycle, empty/malformed file, non-finite numbers, excessive number of occurrences and depth limit.
- Internal file names containing spaces, case differences, and duplicates; reference name with `../` rejected according to policy.

## Game engine tests (Vitest)

- Can select an unplaced occurrence in the active step.
- Guided mode: cannot validate a part outside its step or already placed.
- Free mode without STEP: can select an existing reference/color and validate a compatible free final target; no artificial notion of an active step.
- Two identical parts: placing one occurrence does not exhaust the whole stock; no target can be placed twice.
- Snap valid when position **and** rotation are within tolerances; otherwise not.
- Undo removes exactly the last placed occurrence.
- Exact `N/M` progress; finishing the last step does not create a phantom new step.
- Idempotent serialization/reload; invalid hash = reimport requested, not restoration onto another model.

## E2E tests (Playwright)

1. Open the home page at `127.0.0.1:3000`.
2. Import `fixtures/mini-4-pieces.mpd` and read 4 occurrences / 2 steps.
3. Verify that the 3D view actually displays four bricks with LDraw geometry, with the local library configured.
4. Start guided mode; place the parts; verify counter, progress, and success message.
5. Refresh; reload the fixture if needed; recover the associated progress.
6. Import a freely distributed local test PDF (created for the tests); next/previous page works.
7. Import again with `fixtures/no-steps.ldr`: no fake guided building; **free building mode usable** and the two bricks can be placed in any order.

**Note**: do not include a LEGO instruction booklet in CI tests or in the repository. Use an original test PDF built by the project or generated in memory.

## Manual acceptance testing

- Test on Mac Chrome/Safari: orbit, drag, zoom, window switching, refresh.
- Resource check: small scenes, 100 then 300 parts; note measured performance and the test machine.
- Cut the network after installation; check that building and importing already-local files work.
- Real OMR import chosen manually: keep **in a report file** the name/reference, provenance URL, file license, number of expected/observed parts, errors, whether steps are usable or not.

## STOP criteria

- Source of truth for the parts lost during conversion to meshes.
- Rendering "OK" while some references are missing.
- Artificially invented steps, or steps claimed identical to the PDF instructions without proof.
- User files sent off the machine.
- Green tests obtained by mocks only while the real 3D engine is broken.
- Modification of `main` or of the protected worktree.

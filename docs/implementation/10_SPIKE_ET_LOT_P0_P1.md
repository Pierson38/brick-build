# 10 — Technical note: LDraw spike and first batch (minimal P0 → P4)

**Date:** 2026-11-03 — branch `feat/p0-p1-ldraw-parser-viewer`, base `origin/main` = `b019989`.

## Verified environment

| Item | Version |
|---|---|
| macOS | 26.6.2 (arm64) |
| Node / npm | 24.5.0 / 11.5.1 |
| Git | 2.50.1 |
| next | 16.4.5 (Turbopack) |
| react / react-dom | 19.3.1 |
| three / @types/three | 0.187.0 |
| @react-three/fiber / drei | 9.8.2 / 10.7.9 |
| pdfjs-dist | 6.5.438 |
| typescript | 6.0.3 (not 7.0: see decisions) |
| vitest / @playwright/test | 5.1.0 / 1.64.1 |

LDraw library: official `complete.zip` (library.ldraw.org, CC BY 4.0), 24,987 files in `parts/`, installed **outside the repository** in `~/Documents/brick-lab-data/ldraw`.

## What `LDrawLoader` (three 0.187.0) actually does

Verified by reading the source code and running it in Node on the fixtures (`scratchpad`, with an embedded dummy part):

1. **Hierarchy**: each type 1 line that is not a primitive becomes a child `Group` (`name` = file name, `userData.colorCode`, `userData.startingBuildingStep`). One brick = one group: occurrences remain separable.
2. **No provenance**: neither line number nor reference index. Only the order of the children links a group to its line.
3. **A missing part makes the ENTIRE model fail** (`Subobject "9999.dat" could not be loaded`, global rejection). This is blocking for real imports.
4. **`buildingStep`**: global counter incremented in depth-first traversal of the whole tree. For `nested-submodel.mpd` we get 0,1,2,3, mixing the steps of the root and of the submodels: this is an implicit, undocumented interpretation.
5. MPD: the first `0 FILE` section is the main model; `0 NOFILE` is not interpreted; an unknown line type throws an exception.
6. `setConditionalLineMaterial(LDrawConditionalLineMaterial)` must be called, otherwise an error occurs.
7. Parts are looked up by successive attempts (`parts/`, `p/`, `models/`, as is, relative, then lowercase): this produces normal 404s for primitives.

**Decision**: the in-house parser is the source of truth (occurrences, transformations, steps). `LDrawLoader` only loads geometry, **one part + color pair at a time**. The result is cached then cloned (shared geometry, verified) and placed with the parser's matrix. A missing part only invalidates its own occurrences.

## Structural parser (`src/domain/ldraw`)

- Sections `0 FILE` / `0 NOFILE` / `0 !DATA` (ignored), a lone `.ldr` = one section.
- Type 1 lines: color, 12 numbers, file name with spaces. Rejected: `../`, absolute paths, Windows drives, NaN/Infinity, invalid colors.
- `0 STEP` and `0 ROTSTEP` **end** a step. No empty step is created. Parts after the last STEP form the last step.
- **Column-major** matrices (`THREE.Matrix4.elements` order), LDraw frame (-Y up), `M_global = M_parent * M_local`. The axis flip is done only once, at display time.
- Color 16 = color inherited from the parent reference.
- Deterministic IDs per occurrence: `root#index/submodel#index`.
- Safeguards: size, lines, sections, occurrences (20,000: also stops the explosion of repeated submodels), depth (16), cycles, duplicate sections (case-insensitive comparison), missing submodel, unreferenced sections flagged as alternative models.

## Steps (`src/domain/build/build-plan.ts`)

- `NO_STEPS` if there is no STEP, or if there is only one usable step (case of a single final STEP). No step is invented.
- `ROOT_STEPS` if the model has no submodel.
- `FLATTENED_STEPS` as soon as there are submodels. Documented strategy: in each step, each referenced submodel is first built according to its own steps (recursively), then the parts placed directly in the step form a step. This strategy is **not** equivalent to the LEGO instruction booklet, and the UI says so.

## Build engine (`src/domain/build/engine.ts`)

- **Guided mode**: only the unplaced occurrences of the active step are offered.
- **Free building**: all unplaced occurrences are offered.
- Snap: we look for the closest compatible target (same reference and same color) under thresholds of **10 LDU** and **10°**. These initial thresholds are calibrated on the 2×4 brick; they are not physical values. A drop equidistant from two targets is refused (ambiguous).
- A placed occurrence cannot be placed a second time. Available functions: undo the last placement, reset the step, detect completion.
- Progress: `localStorage`, tied to the exact SHA-256 of the file, validated on load (schema, hash, known IDs, duplicates).

## 3D interaction (MVP choices)

- The held part follows the mouse on a horizontal plane, with a 10 LDU grid.
- The level is chosen automatically: it is the lowest one that still contains a compatible target (assisted placement). PageUp/PageDown changes level, R rotates by 90° around Y.
- Click confirms the placement; dragging rotates the camera.
- The "Poser à la position cible (aide)" (Place at target position (help)) button is for debugging and accessibility.
- Limits: no snap-fit physics, no rotation off the Y axis, no symmetry detection (a 2×4 brick rotated by 180° is refused).

## Measurements (Chrome, Claude browser panel, Mac arm64, dev server)

| Model | Parts | Part/color pairs | Geometry loading | Idle FPS | JS heap |
|---|---|---|---|---|---|
| mini-4-pieces | 4 | 4 | ~0.2–0.9 s (cold/warm cache) | — | — |
| synthetic 300 | 300 | 24 (6 refs) | 330 ms (including 87 local requests) | 120 | 36 MB |

These are indicative measurements on synthetic models. A real OMR MPD has not been tested yet.

## Reproducible commands

```bash
npm ci
npx playwright install chromium   # once
npm run check:ldraw               # checks LDRAW_LIBRARY_DIR
npm run dev                       # http://127.0.0.1:3000
npm run recette                   # typecheck + Vitest + Playwright
```

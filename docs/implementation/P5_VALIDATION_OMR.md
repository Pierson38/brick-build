# P5 — Validation on real LDraw OMR sets

**Date:** 2026-11-03 — branch `feat/p5-omr-validation`, base `origin/main` = `b21a520`.
**Machine:** Mac Apple M2 Pro (12 cores, 16 GB), macOS 26.6.2, Node 24.5.0, Chromium 156.

> The OMR files, the LEGO instructions and the screenshots showing them stay **outside the repository**, in `~/Documents/brick-lab-data/` (`models/`, `instructions/`, `proofs/p5/`). The repository only contains the code, the tests and this report: aggregated figures, with no model data or instruction excerpt.

## 1. Sources

| Set | OMR file (main model) | SHA-256 (prefix) | License read in the file | Author | Official instructions (lego.com, downloaded at the owner's request) |
|---|---|---|---|---|---|
| 31040-1 Desert Racers, 2015 | `library.ldraw.org/media/omr_models/503/31040-1.mpd` | `2036218e4555` | CCAL 2.0 (CC BY 2.0) | Philippe Hurbain [Philo] | 6145903.pdf, 32 pp., 3 models (3-in-1) |
| 31009-1 Small Cottage, 2013 | `library.ldraw.org/media/omr_models/1437/31009-1.mpd` | `97b83517b0e8` | CCAL 2.0 (CC BY 2.0) | Stefan Frenz [smf] | 6038244 / 6038252 / 6038254.pdf, 84 + 64 + 64 pp. |

Selection: 8 Creator candidates whose OMR page indicated "Missing Parts: No" were measured with `npm run compat-report`. 31049 and 31037 were discarded (non-rigid matrices of flexible parts, more than 120 ambiguous target pairs). 31040 was kept as the **simple** set: it contains an embedded unofficial part and non-axial rotations. 31009 was kept as the **medium** set: 270 parts, 12 submodels, 77 steps, one minifig.

## 2. Method (reproducible)

```bash
npm run compat-report -- ~/Documents/brick-lab-data/models/31040-1/31040-1.mpd   # offline analysis
npx playwright test tests/e2e/omr-validation.spec.ts                               # real build (dev, GPU)
npm run perf                                                                       # production build, 3 runs, median
```

- **Measure before fixing**: the `compat-report` of each model was produced with the code of `main`, before any fix, then after the fixes.
- **Scripted player without aid**: `tests/e2e/omr-validation.spec.ts` builds the model using only keyboard and mouse, like a player. For each part: click in the bar, level (PageUp/PageDown), orientation (O), quarter turn (R), hover then **pointer click** at the targeted location. The "Poser à la position cible (aide)" (Place at target position (help)) button is **never** used.
- **Symmetries**: every other placement is deliberately made in an *equivalent* but *different* orientation from the target matrix (part rotated by 180° or 90° when its real geometry allows it), to prove that the engine accepts it.

## 3. Incompatibilities measured before the fix (code of `main`)

| # | Measurement | 31040 | 31009 | Effect |
|---|---|---|---|---|
| I1 | Embedded unofficial part (`0 !LDRAW_ORG Unofficial_Part`) expanded like a submodel | 89 occurrences of which **28 false** (primitives); 148 "submodels" | — | Wrong count, parts impossible to place |
| I2 | Targets whose orientation is not a quarter turn around Y | 24/65 | 13/270 | Impossible to place with the mouse (R alone) |
| I3 | Symmetric parts refused in an equivalent orientation | 44 occurrences concerned | 182 occurrences concerned | Unjustified refusal |
| I4 | Click offset by 18–28 LDU (stale canvas size when resizing the parts bar) | 4/69 clicks | same | Random refusals |
| I5 | Targets more than 5 LDU from the 10 LDU move grid, often on a boundary | 0 | 6 | Placement impossible (e.g. part 57895 at z = −55) |
| I8 | (introduced then fixed during P5) The drop read the preview through a React state one render behind | — | — | Detected by the 6 P0/P1 E2E tests; fixed with a synchronous reference |
| I6 | `~Moved to` parts / aliases | 1 (3023) | 3 | Render OK through the relay file; reference identity to be monitored |
| I7 | Library requests returning 404 (LDrawLoader's trial-and-error lookup) | 167/332 | 288/560 | Slowness, no error |

## 4. Fixes (P5 scope only)

| # | Fix | Files |
|---|---|---|
| I1 | A `Part/Subpart/Primitive/Shortcut` section, or a `.dat` section with geometry, becomes a **leaf part**. Its text is passed to LDrawLoader (`s\` names normalized). | `parser.ts`, `expand.ts`, `analyze.ts`, `part-catalog.ts` |
| I2 | **O** key: we cycle through the orientations **present in the model** for this part and this color (deduplicated modulo R and symmetries). R applies on top. | `engine.ts` (`orientationChoices`, `heldPose`), `BrickLabApp.tsx` |
| I3 | Symmetries **measured on the loaded geometry** (`yQuarterTurnSymmetries`). The snap accepts any equivalent target. | `symmetry.ts`, `engine.ts`, `part-catalog.ts` |
| I4 | Parts bar with fixed height; the drop is made at the position **displayed** by the preview. | `globals.css`, `BuildCanvas.tsx` |
| I5 | Move grid changed to **5 LDU** (max deviation measured over 5 sets: 3.4 LDU). | `engine.ts` (`MOVE_GRID_LDU`) |
| I8 | Last hovered cell kept in a reference updated on every `pointermove`. | `BuildCanvas.tsx` |
| I6, I7 | Not fixed: measured and documented (limits). | — |

## 5. Compatibility matrix

| Criterion | 31040-1 Desert Racers | 31009-1 Small Cottage |
|---|---|---|
| File occurrences | **65** | **270** |
| Comparison with the official inventory (last page of the instructions) | **65 parts / 30 elements** = 65 occurrences / 30 part-color pairs: **exact match** | 271 parts / 90 elements against 270 occurrences / 92 pairs. **Unresolved deviation**: LDraw decomposes the minifig (10 occurrences for about 6 LEGO elements). Excluding the minifig, about 5 parts would be missing (spare parts or omission from the file?). A LEGO element → LDraw part table would be needed and is not available offline. |
| Missing / replaced references | 0 missing; 1 `~Moved to` (3023 → 3023b); 1 embedded unofficial (tire 92409) **rendered** | 0 missing; 3 aliases (`3023`, `2429c01`, `88422`) rendered |
| Colors | 11 | 18 |
| Submodels | 0 (+ 1 embedded part and its subfile) | 12 instances (Seat, Window ×n, Big Window, Roof, Skateboard, MiniFig1) |
| Non-rigid matrices | 0 | 0 |
| Orientations outside a Y quarter turn | 24 (23 axial, 1 arbitrary) → **reached with O** | 13 (6 axial, 7 arbitrary) → **reached with O** |
| Symmetric parts (measured on the geometry) | 19 references, 44 occurrences | 182 occurrences |
| `0 STEP` steps | 11 `ROOT_STEPS` steps (3–10 parts) | 77 `FLATTENED_STEPS` steps (1–10 parts) from Small Cottage (45), Roof (24), Seat (2); root without STEP |
| Steps compared with the instructions | **Different, with evidence**: the main model matches model 1 of the instructions (pp. 2–12, **21 steps**, visual comparison of p. 12 with the render), but the file only has 11. Overall order consistent (wheels last), different split. | **Spot match**: step 5 of the instructions (p. 8: 1 + 3 + 2 parts) matches step 5/77 (2412b ×1, 3069b ×3, 3622 ×2). Overall equivalence **not proven** (minifig placed last in the file, split into submodels). |
| Full mouse build, guided mode, no aid | **YES**: 65/65, 65 clicks, **0 refusals**, 19 placements in equivalent orientation accepted, 25 orientation changes (O), strictly increasing steps 1→11, 81 s | **YES**: 270/270, 270 clicks, **0 refusals**, 86 placements in equivalent orientation accepted, 15 orientation changes (O), 7 level changes, strictly increasing steps 1→77, 56 s |
| Free mode + official instructions open, arbitrary order | **YES**: 65/65 in reverse file order, instructions opened at page 5 and stayed on page 5, 0 refusals, 48 level changes | **YES**: 270/270 in reverse file order, booklet 1 opened at page 5 and stayed on page 5, 0 refusals; **1,194 PageUp/PageDown presses** (45 levels): ergonomics to improve |
| Resume after reload | **YES**: 12/65 restored, same step, next placement OK | **YES**: 12/270 restored, same step, next placement OK |
| Performance (prod, Metal GPU, median of 3) | import → 1st frame 1.08 s; geometry 0.31 s; 60 FPS idle / 60 FPS rotating (vsync cap); heap 28 MB | import → 1st frame 1.17 s; geometry 0.63 s; 60 / 60 FPS; heap 47 MB |

## 6. Remaining limits

- **Steps ≠ instructions**: demonstrated on 31040. The interface already says so ("ne correspondent pas forcément à la notice officielle" (do not necessarily match the official instructions)). For faithful guidance, a manual steps ↔ pages mapping would be needed (P6, out of scope).
- **Orientation with the O key**: it only offers the orientations present in the model for this part and this color. It is an aid comparable to the assisted level: it does not reveal *which* target is aimed at, but a real player does not freely orient in 3D.
- **31009 inventory**: about 5 parts of unexplained deviation (see matrix).
- **`~Moved to` aliases**: 3023 and 3023b would be two distinct entries in the bar if a model mixed both. Not encountered on these sets.
- **Library 404s**: about 50% of requests (LDrawLoader's trial-and-error lookup). No functional impact; a file table served by the local route would remove them.
- **E2E tests in software rendering** (default config, SwiftShader): building 270 parts takes more than 15 minutes. The OMR spec therefore uses the GPU.
- The "Modèle principal" (Main model) selector also lists submodels (31009): it is noise, but not blocking.
- **Level navigation**: in free mode on 31009 (45 levels), many PageUp/PageDown presses are needed. Placement "on the targeted surface" would be more natural (next batch).
- **Scripted-player validation**: the build is driven by Playwright with real mouse/keyboard events. It does not replace a manual acceptance test session on Mac (Chrome and Safari), not yet done.

## 7. Verdict (2026-11-03, before lifting the conditions)

**Conditional GO.**

What is demonstrated end to end, on two real OMR sets: faithful import (31040 identical to the official inventory), complete render with the real geometry (embedded unofficial part included), **complete** mouse build in guided mode **and** in free mode with the official instructions open, without any refusal and without the "Poser à la position cible" aid. In addition: equivalent rotations and symmetries accepted, non-axial orientation reachable, resume after reload and 60 FPS in production. No **structural** incompatibility of the engine or the import remains: the 6 measured incompatibilities were fixed or classified as non-blocking.

Conditions before declaring an unreserved **GO**:
1. **31009 fidelity**: explain the deviation of about 5 parts from the official inventory. Method: visual comparison of the inventory (booklet 1, pp. 79–80) with the report's part/color list. If the OMR file is incomplete, flag it in the UI rather than presenting it as faithful.
2. **Manual acceptance test** on Mac (Chrome and Safari) of at least one of the two sets, without the scripted player.
3. **Level ergonomics** in free mode (placement on the targeted surface): limited fix, but necessary for a human to finish 31009 in free mode without fatigue.

Outside the conditions: the LDraw steps **are not** those of the instructions (proven on 31040: 11 versus 21); the application does not claim otherwise.


---

## 8. Lifting of the conditions (2026-11-04)

### 8.1 Ergonomics: surface-assisted placement

**Principle** (`src/domain/build/surface.ts`). The engine and its validation rules (`tryPlace`) do not change. When a part is held:
1. **Compatible ghost hovered** (locations displayed): the part snaps into position there. The orientation is still checked.
2. **Pointed surface** (floor, or top of a placed part, by raycasting): the part is placed **on** this surface, at the pointed spot. Its height comes from the **real base of its geometry** in the current orientation, adjusted to the nearest compatible level (±6 LDU, stud tops count).
3. **Nothing valid under the pointer** (cantilevered part, attached sideways, placed before its support): compatible target **crossed by the ray**, at most 10 LDU away and not hidden behind a visible surface.
4. Otherwise, the part stays where the pointer puts it, and the click is refused with a message.

The preview only snaps onto a target if the engine would accept the placement ("emplacement trouvé, clic pour poser" (location found, click to place)). Never toward a distant target, never an already placed target. **PageUp/PageDown** remain as a fallback (manual mode, starting from the default level) and **A** returns to automatic mode. Click or tap with a slight slide (≤ 4 px): placement; beyond: camera rotation (mouse and trackpad).

**Level navigation measurement** (PageUp/PageDown presses for a complete pointer build). The old scheme is recomputed exactly by `scripts/level-baseline.ts`: it reproduces the measurements of 11-03, 1,194 and 48 in reverse order, 7 and 0 in guided.

| Scenario | Old scheme | Surfaces (real E2E) | Placements by pointing alone | Camera rotations |
|---|---|---|---|---|
| 31040 guided | 0 | **0** | 65/65 | 6 |
| 31040 free, natural order | 11 | **0** | 65/65 | 6 |
| 31040 free, reverse order | 48 | **0** | 65/65 | 10 |
| 31009 guided | 7 | **2** | 269/270 | 21 |
| 31009 free, natural order | 246 | **2** | 269/270 | 21 |
| 31009 free, reverse order (with instructions) | **1,194** | **0** | 270/270 | 4 |

0 placement refusals in the 6 complete builds (1,005 pointer placements). Tests added: 15 unit tests (`surface.test.ts`, including 1 on the inventory verdict) and 6 E2E tests on fixtures (`surface-placement.spec.ts`). The "two levels" test checks that **no key** is pressed during the whole build.

**Honesty of the measurement**: the scripted player knows *where* to point: the test hooks give it the screen position of the target, like eyes. On the other hand it places nothing itself: it is the application's surface logic that chooses the height and the real click that places. This measurement proves that the mechanism works, **not** that it is pleasant for a human. That is the purpose of the manual acceptance test.

**Performance after the change** (production build, Metal GPU, M2 Pro, median of 3, `npm run perf`):
- 31040: 1.16 s import → 1st frame, 60/60 FPS, 28 MB;
- 31009: 1.16 s, 60/60 FPS, 40 MB.

No regression compared with 11-03.

### 8.2 31009 inventory fidelity

Full analysis: [`P5_INVENTAIRE_31009.md`](P5_INVENTAIRE_31009.md). Exact balance: 271 (box) − 5 elements absent from the file + 4 (minifig decomposition) = 270.
- **Proven** discrepancies: 2 white 2×4 plates and 2 white 1×2 tiles.
- **Visual** discrepancy: 1 dark gray element (4211087).

Their belonging to the main model of a 3-in-1 set cannot be proven offline. **Verdict: UNDETERMINED.** The application displays a warning for this exact file. 31040: **CONSISTENT**. Any other file: "inventaire non comparé à la notice officielle" (inventory not compared with the official instructions).

### 8.3 Manual acceptance test

Protocol: [`RECETTE_HUMAINE_P5.md`](RECETTE_HUMAINE_P5.md) (Chrome and Safari, set 31040, guided then free with the instructions, heights, R/O, undo, reload, console). **Performed by the owner on 2026-11-04: OK** (detailed grid not sent, no KO reported).

### 8.4 Residual problems

- Hidden locations require rotating the camera (up to 21 rotations on 31009); no automatic camera aid.
- For 1 part of 31009, neither the surface nor the aiming is enough: PageUp/PageDown remain necessary.
- Orientation (`O`) remains a keyboard choice among the model's orientations.
- The performance of hover raycasting was not measured separately (FPS are measured idle and during camera rotation).
- 31009 inventory undetermined (see 8.2).
- LDraw steps ≠ instructions (31040: 11 versus 21), unchanged.

### 8.5 Final verdict

**GO** (2026-11-04). The three conditions are lifted:
- ✅ Level ergonomics: fixed and measured (1,194 → 0; 246 → 2), without engine regression.
- ✅ 31009 inventory: deviation localized down to the part, **undetermined** verdict documented and **displayed** in the UI (planned handling when the deviation cannot be resolved reliably).
- ✅ **Manual acceptance test Chrome + Safari**: performed by the owner, OK.

The 31009 inventory verdict remains **undetermined**: it is a documented limit flagged in the UI, not an engine defect.

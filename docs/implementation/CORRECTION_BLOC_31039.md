# Fitting of the beige block with a hole on 31039 — cause, fix, evidence

**Date:** 2026-11-08. Branch `fix/31039-block-snapping`, worktree `brick-build-worktrees/31039-block-snapping`, base `origin/main` = `a1309a4` (PR #9 merged). Owner's request during his real 31039 build: "a beige block with a side hole and black elements on top does not fit correctly with the neighboring parts, notably a gray part". The announced screenshot did not arrive (text only): the block was identified in **a copy** of his progress (see § 1), without deducing anything from the screenshot.

Complements [CONNEXIONS_FIABILISEES.md](CONNEXIONS_FIABILISEES.md) (connectors, magnet, assemblies); what changes is described here.

## 1. Identification on the copy of the real build

Isolated copy of `library/builds/b-mw5ag1wk-43084e0c/progress.json` (revision 745, 275 free parts, SHA-256 `a8302701…3f40` identical before and after the work) and of the model `31039-1.mpd`; the save history (`history/`) was read, nothing was written to the library.

| Role | LDraw ref. | LDraw title | Color | Owner's parts | Interfaces read |
|---|---|---|---|---|---|
| **The block** | 6541 | Technic Brick 1 x 1 with Hole | 19 (beige) | f238 (100, −30.59, 120), f239 (40, −30.59, 120), half-turn on Y | 1 stud, 1 receptacle, 1 pin hole along Z |
| Black elements above | 6536 ×3, 3706, 2780 ×2 | Technic Cross Block 1 x 2, Technic Axle 6, Technic Pin with Friction and Slots | 0 (black) | f230–f232, f228, f236/f237 | axle hole, pin hole; axle; pins |
| **The gray part** above the block | 2639 | Plate 4 x 4 Corner | 72 (dark gray) | f242 (10, −36.78, 110), f243 (130, −36.78, 110) | 12 studs, 12 receptacles |
| Under the block | 3020 | Plate 2 x 4 | 71 | f161 (70, −6.59, 130) | studs |

Comparison of each placed part with its official place (the owner's model is the official model translated by (40; 17.41; −230)): **26 parts are 1.81 LDU too low**, two symmetric columns of 13: inverted slope 4287 → plates 3020 → plates 3034 → plates 3020, tiles, 18677, 15068, 6558 → **gray plate 2639**. The 6541 block, for its part, is at the right height (it came with the mechanism placed on the 3020 f161, healthy column). The gray plate therefore could not take both its column (1.81 LDU lower) and the block's stud: it took its column and **crosses the top of the block by 1.81 LDU**, with no connection to it. That is the described defect.

Origin in the history: save r463 (19:26:53 UTC), the two 4287 are placed at y = −4.78 instead of −6.59, on the end of the inverted curved slope **41763** (itself at 17.81 instead of 17.41); everything placed on it afterwards inherits the offset.

## 2. Cause: two wrong primitive readings in `connectors.ts`

Real LDraw files (local library):

- **41763** is an alias (`=`) of **42023** "Slope Brick Curved 6 x 1 Inverted". Four `stud.dat` studs at y = 0; the two hollow studs of the thin end are `stud2a.dat` **stretched downward**: `0 9.2 -70 … 3.3 …` and `0 1.412 -90 … 1.353 …`. Their tip is at y = −4 like all studs, their drawn base at 9.2 and 1.41 (the cylinder goes down into the material). Its `stud3.dat` tube is scaled −4.9: it stops at **23.6** whereas the part's lower edge is at **24**.
- **4287** is a `~Moved to` toward **4287a** "Slope Brick 33 3 x 1 Inverted with Notch and Thick Front": a `stud.dat` at y = 0 and two stretched `stud2a.dat` (×4 at y = 12, ×1.5 at y = 2), tips at −4.

The engine took the **origin of the primitive** as the stud's base and **the end of the tubes** as the plane of the receptacles. Hence: 41763 placed on a plate 0.4 LDU too low, and a part placed on its end stud 1.41 LDU into the curve: **0.4 + 1.41 = 1.81 LDU**, exactly the measured offset.

Hypotheses of the request, checked one by one:

| Hypothesis | Verdict | Evidence |
|---|---|---|
| Missing or wrongly identified connector | **Yes**: stud position (stretched studs) and receptacle height (recessed tubes) | primitives above, red tests |
| Wrong translation computation | Consequence of the previous one: the translation is right for wrong connectors | Node bench: same proposal from the tray and on pick-up |
| Axle or pin hole | No: 6541 ↔ 2780 ↔ 6536 linked by pins in the real save | graph of the copy |
| Unsupported clip, bar, hinge | No for this block (none of these parts in the column) | inventory § 1 |
| Wrong connector orientation | No: −Y axes correct, only the heights were wrong | same |
| Wrong priority between proposals | No: the retained proposal was the nearest and valid for wrong connectors | Node bench |
| Preview / recorded pose offset | **Yes, in addition** (≤ 1e-14 LDU): the preview added the magnet's move without rounding, the save rounds to the hundredth; same for the marker of a receptacle in hand | E2E and acceptance test (−30.590000000000003 shown, −30.59 recorded) |
| Visually plausible but incompatible connection | No: the gray plate was not "connected" to the block in the graph; no false success displayed | graph of the copy |

## 3. Fix (architecture and shared detector unchanged)

`src/domain/ldraw/connectors.ts`:

1. **Stud drawn longer than a stud** (primitive over 4 LDU): the stud stands on the part's face **4 LDU under its tip** (`studBases`). Only if the part **has a face in that plane**, around the stud and within its 20 × 20 cell (a vertex more than 6.5 and less than 15.1 LDU from its axis), or around another stud of the same plane (2653, top drawn as edges near its middle studs). A real tall stud on a post (2680a "Stanchion with Tall Studs") has no face there: its drawn base is kept.
2. **Tubes recessed from the lower edge**: the receptacles, computed as before (same number and positions), are placed **at the height of the edge** (`rimUnder`) only if that edge is the lowest point of the whole part, at most 1 LDU under the end of the tubes, around each tube, **on the plate grid** (multiple of 8 LDU from the origin) whereas the end of the tubes is not. Elsewhere, nothing changes.

Rounding (`connections.ts`, `BrickLabApp.tsx`): the marker of a receptacle in hand is rounded like all connectors; the preview after the magnet is rounded to the hundredth, like the save (`poseToLDraw`): **recorded pose = preview**, digit for digit.

No per-reference metadata was needed: the geometry is read from the real files.

**Scope over the whole library** (24,985 `parts/` files, old code against new, bench outside the repository): studs modified in **67 parts** (inverted slopes and wedges, vehicle bases, 2653…), receptacles moved in height only in **69 parts** (0.25 to 1 LDU: 41763/42023, hinges 30388/53914, double 45 slopes, monorail bases…); **no** receptacle count changed, **no** pin, axle or hole touched.

## 4. Evidence

**Red then green tests** (full outputs in the PR report):

| Test | Before fix | After |
|---|---|---|
| `tests/unit/connectors-real.test.ts` "sunk studs and tubes short of the rim" (real library, original fixture [`pente-inversee-bloc.ldr`](../../tests/fixtures/pente-inversee-bloc.ldr)) | **7 failures**: studs of 41763 at 9.2 / 1.41, of 4287 at 12 / 2; receptacles at 23.6; 2653; chain 41763 → 4287 → 2639 → 6541 from the tray (3 offsets); owner's order: the plate only takes 1 stud | 16 / 16 |
| `tests/unit/connections.test.ts` marker of a receptacle in hand | −14.400000000000002 | −14.4 |
| `tests/e2e/free-sunk-studs.spec.ts` (Chrome, owner's order, everything from the tray) | 41763 at −23.6; 4287 at −38.4 instead of −48; preview ≠ pose (−38.400000000000006); the gray plate: "**1 tenon emboîté sur 1 pièce**" (1 stud fitted on 1 part) | "**2 tenon(s) emboîté(s) sur 2 pièce(s)**" (2 stud(s) fitted on 2 part(s)) (the slope and the block), exact poses, pose = preview, graph: block ↔ plate ↔ slope |

Screenshots, same angle: [before](preuves/connexions/bloc-6541-plaque-avant.png) (one marker, 4287 sunk into the curve, the plate crosses the block), [after](preuves/connexions/bloc-6541-plaque-apres.png) (two markers).

**Acceptance test on a copy of the real build** (`tests/recette/bloc-31039.spec.ts`, `playwright.recette-connexions.config.ts`, data frozen outside the repository, nothing written to the library):

| Step | Before fix | After |
|---|---|---|
| The beige 6541 block (f239 removed from the copy, with the column of 13 shifted parts above) taken **from the tray** and brought close to its place | right proposal, but preview −30.590000000000003 ≠ pose −30.59 | preview = pose = **(40; −30.59; 120)**, the owner's pose; 2 connections: stud on the 3020 f161, **pin f236 in its hole**; green markers = proposal before the click; no other part moved; recognized in the graph |
| A 4287 (column f157 removed from the copy) taken from the tray above the owner's 41763 f54 | **y = −4.78: exactly the pose of the owner's save** (1.41 LDU into the curve) | y = −6.19: flush with the top of its 41763 (itself 0.4 too low in his save, not realigned) |

Screenshots and log: `brick-lab-data/proofs/connexions-bloc/` (third-party set: outside the repository).

**31039 report** (`scripts/connections-report.ts`, finished model, 609 parts): connections **1,855 → 1,865** (+10 studs), parts picked up 3 LDU from their place brought back exactly **592 → 595**; 27 assemblies, the largest 493 (unchanged). Times (3 measurements each, machine loaded by the E2E suite): connector reading 63–82 ms before, 62–125 ms after; magnet P50 0.06 ms / P95 0.32–0.52 ms before, 0.06 / 0.33–0.40 ms after: no measurable difference.

## 5. Your existing build

**Nothing is realigned.** With the right connectors, the two columns of 13 parts shifted by 1.81 LDU are **no longer counted as fitted** on the 41763 (they are not: 1.41 LDU of play): "Assemblage" (Assembly) from one of them selects its 13 parts, no longer the rest of the fuselage (the largest assembly of the copy goes from 252 to 226 parts). To repair by hand, in this order: pick up each 41763 (f54, f55); then pick up each column of 13 ("Assemblage" from its 4287) and bring it close to the end of the 41763. **Verified on the engine** (Node bench on the copy, same functions as the workshop, parts shown 2 to 3 LDU beside): each 41763 is moved by −0.4 LDU (7 studs on the 3035 and the 4477); each column by −1.81 LDU (9 connections, including **the beige block** f239 / f238 and the 41763); afterwards the block is linked to its gray plate, the 4287 and the 2639 are on the official grid (−6.59 and −38.59). **Not played in the browser**: clicking the 41763 hidden under other parts was not automated.

## 6. Limits

- A stretched stud **without a visible face** in the plane of its seat (top drawn only as edges, with no other verified stud in that plane) keeps its drawn base: no deduction without geometry.
- The edge of a part off the plate grid (rounded parts, minifigures, hats) is never taken for the plane of the receptacles.
- Observed in passing in the same copy, **not handled here**: the cockpit's beige jumper plate 15573 (f276) still has no recognized receptacle (no tube, see CONNEXIONS_FIABILISEES § 3); it is placed 1 LDU beside its place and the gray clip tile 15712 (f277) could not fit onto it.
- Safari: covered by the existing WebKit tests of the E2E suite; the acceptance test on the real build and the new E2E test run under Chrome.

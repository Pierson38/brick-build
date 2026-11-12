# Reliable connections — magnet from the tray, Technic axles, hidden assemblies

**Date:** 2026-11-08. Branch `fix/free-building-connections`, worktree `brick-build-worktrees/free-building-connections`, base `origin/main` = `c55fbe4152792f8327d3bdcb1a70170162140efb` (PR #7 merged). Owner's requests after his real 31039 build: (1) a part taken from the tray does not always snap, whereas it snaps once placed then picked back up; (2) select with one click a whole mechanism linked by an inner black bar, hidden parts included. The two announced screenshots did not arrive (text only): see § 6.

Complements [MONTAGE_LIBRE_CONNEXIONS.md](MONTAGE_LIBRE_CONNEXIONS.md) (reading of the primitives, representation); what changes is described here.

## 1. Diagnosis: tray ≠ pick-up

**Reproduction.** Node bench on a copy of the 31039 build (101 parts) with the engine's real functions (`resolveFreeHover`, `proposeSnap`), same reference, color, orientation, ray and aimed point, scenario A (tray) against B (placed then picked back up), 8 references (3021, 3710, 3022, 3020, 15068, 3004, 2420, 3023): **identical results**. The pure engine was not at fault: pose matrices, orientations (`orientationChoices()[0]` = pose of the picked-up part), extracted connectors, connectors of the placed parts, `resolveFreeHover`, `proposeSnap` and magnet-model priority are the same in both paths.

**Exact cause** (`BrickLabApp.tsx`, before the fix):

```ts
const snapTargets = useMemo(() => {
  if (!freeMode || !held) return null;            // empty hand → null
  …
}, [freeMode, held?.moving, held?.group, placedPieces, peekConnectors, connectorsVersion]);
```

The connector index of the placed parts depended on `held?.moving` and `held?.group`, **not** on `held`. Empty hand → `null`. Taking a part **from the tray** leaves `moving` and `group` at `undefined`: no dependency changes, React returns the memoized value `null`, the magnet between parts does not run (`snapTargets &&` false) — no proposal, no green marker. **Picking back up** a placed part sets `held.moving`: the memo is recomputed, the magnet works. Hence also the "not always": after a first placement from the tray, the part stays in hand and the game changes (`placedPieces` changes) → the index is finally computed for the following parts from the same tray.

The existing test D (`free-3d.spec.ts`) **picked back up** an already placed part: it could not see the bug.

**Red then green test**: `tests/e2e/free-connections.spec.ts` "A/B" — failure before the fix (`snap()` = `null` from the tray, screenshot [avant-bac-apercu.png](preuves/connexions/avant-bac-apercu.png)), success after ([apres-bac-apercu.png](preuves/connexions/apres-bac-apercu.png)). Same fit on both sides: the owner's gray plate 30157 on his orange plate 3023 and his green support 99780 (poses taken from his 31039 build).

## 2. One detector, one path

- **One connector index per game state** (`connectorIndex`, recomputed when the game or the connectors read change — never as a function of the hand). Parts in hand (picked-up part, group) are **excluded at query time** (`exclude`): their old place counts neither as a target nor as an occupied connector.
- **Same function for all cases** (`domain/build/snap.ts` `snapHover`): tray part, picked-up part, group. It gives the magnet-between-parts proposal, the connections **verified at the exact pose shown** and, without proposal, the reason.
- The same index serves the graph, "Assemblage" (Assembly), the double-click, the test hooks and the computation of parts engaged on an axle (`connections.ts`: `joints()`, `connectionGraph`, `connectedAssembly`, `jointsBetween`). No second detector.
- The preview is recomputed when the part is picked (effect on `held`), when the position or orientation changes (pointer, R, X/Y/Z, height), and when the connectors become available (`connectorsVersion` → index → `updatePreview` → effect).
- **Green markers = connections validated by the engine at the preview pose** (`engaged.points`); the pose recorded on click is `previewPose` ("recorded pose = preview" test in E2E, including on the 31039 copy).

## 3. Connectors (`domain/ldraw/connectors.ts`)

| Interface | Reading | New |
|---|---|---|
| Stud | `stud*` primitives | unchanged |
| Receptacle | deduced under straight parts | **grid aligned on the studs** (otherwise the tubes, otherwise the outline of a tile); a point is kept only if it is **guaranteed**: stud just above, neighboring tube, or 1 × N part with a clean outline (single channel). No more receptacle "in the box": cut corners (2450, 2420, 2639), wings and wedges no longer receive any where there is no material. Jumper: that of 3794b gives its 2 receptacles through its tube; 15573 (no tube) none rather than a false one. Round 1 × 1 tile: the stud goes into its tube. |
| Pin | `connect*`, `confric*` | **the whole family** "Technic [Friction] Pin 1.0 / 0.5 / 2.0 / Middle" with its length (axle-pins 3749/43093, long pin 6558: 3 segments) |
| Pin hole | 2 collinear `peghole` | unchanged (the `beamhole`, `connhole` beam holes contain `peghole`) |
| **Axle** (male) | **pair of ends** `axleend*` "Technic Axle End" facing each other on the same line (drawn only at the ends of real axles); `axleend20` = 20 LDU of axle (axle-pins) | **new** |
| **Axle hole** | `axlehole`, `axl2hole`, `axl3hole`, `axl4hole`, `axlehol4`, `axlehol5` "Technic Axle Hole …" (y 0…1 × scale), collinear segments merged | **new** |
| Not recognized, reported | `axlehol8` "Axle Perimeter" and lone axle edges (common to the axle and the hole), axle end without counterpart (stop axles), clips, bars, hinges, ball joints, wheels, tires | `axleUnrecognised` = uncertain |

**Since 2026-11-08 ([CORRECTION_BLOC_31039.md](CORRECTION_BLOC_31039.md))**: a stud drawn longer than a stud (sunk into the material) stands on the face 4 LDU under its tip; when the tubes stop before the bottom edge, the receptacles are at the height of the edge.

**Checks on the real library** (tests `tests/unit/connectors-real.test.ts`, skipped without library): 77 "Technic Axle… / Technic Bush…" parts scanned → **no male axle seen as a hole, no bushing seen as an axle**; 13 axles reported uncertain (stop axles 87083, 24316, 15462, 55013, 8168; stud axle 6587; flexibles; adapters), none invented.

**Controlled metadata** (`domain/ldraw/connector-metadata.ts`): only when the primitives say nothing and the part has been verified. 11477 (2 × 1 curved slope: **one** receptacle under its flat part — the first version put two; the 31039 model contradicted it: a 3021 plate occupies the stud under the curve) and 54200 (1 × 1 slope). Test: each receptacle on the real lowest face, within the outline of **that face**, and no primitive already gave it.

**Compatibility** (`fits`): stud ↔ receptacle (same point within 0.6 LDU, same axis); pin ↔ pin hole, axle ↔ axle hole (**rigid**), axle ↔ round pin hole (**rotating**, `axle-turning`): parallel, on the same line within 0.6 LDU, and **real overlap** ≥ 8 LDU (or almost the whole hole if it is shorter: 10 LDU half bushing). Aligned beyond the end, beside, or crossing a part without a hole: **not** connected. Rotating links connect the parts in the graph without claiming that they are solidary; moving the selection remains a rigid move (editing operation).

## 4. Magnet between parts (`proposeSnap`)

| Rule | Detail |
|---|---|
| Nearest first | Candidate translations within ≤ 24 LDU; among those within **10 LDU** of the nearest, the most engaged (most simultaneous pairs), then the shortest, then a fixed order. A part is no longer pulled toward a distant complete fit when a partial fit is under the pointer. |
| Several connectors | All pairs engaged at the same time are counted (2 × 4 plate straddling two bricks: 4 + 4). |
| Occupied | A stud, a receptacle or a hole holds **one** part; an axle or a long pin passes through several. Parts in hand do not count as occupants. |
| Conflicts | Two studs (read from the primitives) or two segments at the same place = two parts at the same place: refused. Two (deduced) receptacles at the same point: that receptacle engages nothing, without veto (two wings 30355/30356 edge to edge in 31039). |
| Axles | Along an axle: by half studs counted **from the faces** of the holes, and only up to complete engagement. |
| Stability | The previous proposal is kept as long as it remains valid, at least as engaged, and the best new one is not **8 LDU** closer: no oscillation on small movements. |
| Diagnosis | Without proposal: "aucune connexion reconnue sur cette pièce" (no connection recognized on this part), "**axes non alignés — tourne la pièce**" (axes not aligned — rotate the part), "connecteurs déjà occupés" (connectors already occupied) (nothing when nothing is close). Never a false success. |
| Disable | "Aimant pièces" (Parts magnet) checkbox, ⌥ during the movement: unchanged. Manual height: only at that height. Gizmo, coordinates, direct drag: unchanged. |

**Priority of the two magnets** (clarified, PR #7 behavior kept): "Aimant modèle" (Model magnet) wins only if it finds the part's **official slot** within 9.5 LDU (P5 validation on 31040); everywhere else, "Aimant pièces". On an official slot, the green markers show the connections **verified** at that pose (none if the official slot fits nothing already placed). Both unchecked: free placement; green markers appear only if the pose really fits studs. Guided and synchronized modes: no magnet between parts (unchanged).

## 5. Selecting an assembly

"Assemblage" (and double-click) walks the graph of **real** connections from the chosen part, recursively: studs, pins, **axles** and holes, internal parts, hidden or behind others. Pure 3D computation, with no camera or visible ray casting: same result from every angle. Count displayed; move, rotation, group save and **a single undo**: existing mechanisms (`moveGroup`). **"Voir les connexions"** (See the connections): parts outside the selection become transparent and transparent to the pointer (display only, nothing is recorded).

## 6. The screenshot case (inner black bar)

Screenshot not received. In 31039, the only "long black bar" that crosses parts is the **Technic axle 6 (3706, black)** inside the fuselage, through three 6536 cross blocks and two 32123a half bushings, themselves linked by 2780 pins to 6541 bricks. The **original** fixture [`tests/fixtures/mecanisme-axe.ldr`](../../tests/fixtures/mecanisme-axe.ldr) reproduces this mechanism with these real references, in orange: black 3706 through three orange 6536 and two 32123a, two 2780 toward two orange 6541, a 3023 on one of them; traps: a 6536 aligned **beyond** the end of the axle, a 6541 whose hole is aligned **without** a pin, a 4519 axle that crosses a 3001 brick **without a hole**, a 3958 plate that **hides** everything without being fitted to it.

Results (unit tests on the real library + E2E): from **one** orange block, 11 parts, invisible axle included; the 5 traps excluded; identical from each of the 11 parts, under 3 camera angles, after X / Y / Z rotation and translation of the whole mechanism; moved and rotated as a block (relative distances kept), one undo, reloaded identically. From the angle where the plate hides the block, a click reaches the plate: its assembly is itself alone. Screenshots: [selection](preuves/connexions/assemblage-cache-selection.png), [other angle](preuves/connexions/assemblage-cache-autre-angle.png), [see the connections](preuves/connexions/assemblage-cache-voir-connexions.png).

On the **copy** of the owner's real build: his front wheel forms an 8-part assembly linked by his 3 red 32062 axles in the axle holes of the half beams ("axle" links); the 42610 rim and the 51011 tire are not recognized.

**To be confirmed by the owner**: if the screenshot showed another mechanism (other references), give them to me — the fixture and the test adapt to it.

## 7. 31039 inventory (134 references, 609 parts)

`npx tsx scripts/connections-report.ts <31039.mpd> --root "31039 - Blue Power Jet.ldr" [--progress <copy>]` (read-only).

- **Recognized: 127** (before: 117 out of 133 with at least one connector).
- **Uncertain: 1** — 32015 "Technic Angle Connector #5": its pin hole is read; its axle hole is drawn only with axle edges (common to the axle and the hole): not recognized.
- **No connector: 6** — 3937 hinge, 42610 rim, 51011 and 61254 tires (61254 built into the file), 92279 windshield, 48729 1.5L bar with clip.
- **Metadata**: 11477, 54200.

Technic references and their interfaces:

| Reference | LDraw title | Occ. | Recognized connectors |
|---|---|---|---|
| 2780 | Technic Pin with Friction and Slots | 10 | 2 pins |
| 3673 | Technic Pin | 2 | 2 pins |
| 6558 | Technic Pin Long with Friction and Slot | 2 | 3 pins |
| 3749 | Technic Axle Pin | 2 | 1 pin, 1 axle |
| 43093 | Technic Axle Pin with Friction | 2 | 1 pin, 1 axle |
| 3706 | Technic Axle 6 | 1 | 1 axle (120 LDU) |
| 59426 | Technic Axle 5.5 with Stop Type 2 | 1 | 1 axle (110 LDU) |
| 4519 | Technic Axle 3 | 2 | 1 axle |
| 32062 | Technic Axle 2 Notched | 3 | 1 axle |
| 6536 | Technic Cross Block 1 x 2 (Axle/Pin) | 3 | 1 axle hole, 1 pin hole |
| 32123a | Technic Bush 1/2 Smooth with Axle Hole Reduced | 2 | 1 axle hole (10 LDU) |
| 32064a | Technic Brick 1 x 2 with Axlehole | 1 | 2 studs, 2 receptacles, 1 axle hole |
| 30000 | Brick 2 x 2 with Pins and Axlehole | 1 | 4 studs, 4 receptacles, 2 pins, 1 axle hole |
| 32316 | Technic Beam 5 | 2 | 5 pin holes |
| 32449 | Technic Beam 4 x 0.5 Liftarm | 2 | 2 axle holes, 2 pin holes |
| 41677 | Technic Beam 2 x 0.5 Liftarm | 2 | 2 axle holes |
| 6632 | Technic Beam 3 x 0.5 Liftarm | 2 | 2 axle holes, 1 pin hole |
| 32018 | Technic Brick 1 x 14 with Holes | 4 | 14 studs, 14 receptacles, 13 pin holes |
| 3700 / 3701 / 6541 | Technic Brick 1 x 2 / 1 x 4 / 1 x 1 with Hole(s) | 2 / 2 / 2 | studs, receptacles, 1 / 3 / 1 pin holes |
| 56908 | Wheel Rim 26 x 43 with 6 Pegholes | 1 | 6 pin holes, 1 axle hole |
| 3960 | Dish 4 x 4 Inverted | 1 | 1 stud, 4 receptacles, 1 axle hole |
| 32124 | Technic Rotor 2 Blade with 4 Studs | 4 | 4 studs, 5 receptacles, 1 axle hole |
| 18677 | Plate 1 x 2 with Offset Peghole on Underside | 4 | 2 studs, 1 pin hole (receptacles: not deduced) |
| 2430 | Hinge Plate 1 x 4 Top | 2 | 2 studs, 2 receptacles, 1 "pin" (the hinge axis is drawn with a pin primitive; no female hinge part is recognized) |

Finished model (all parts in their place): **1,855 connections** (1,790 studs, 38 pins, 24 rigid axles, 3 rotating axles), 27 assemblies, the largest of 493 parts (the others are linked by hinges, clips, wheels: not recognized).

## 8. Performance (31039, 609 parts)

Measurements on the MacBook, machine at rest, 3 runs (`scripts/connections-report.ts`, ranges); and in the browser on the copy of the real build (`playwright.recette-connexions.config.ts`).

| Operation | When | Time |
|---|---|---|
| Reading the connectors of the 134 references (local LDraw files) | once per model | 66–189 ms (before: 213 ms) |
| Connector index, 609 parts | at each change of the build | 7–11 ms |
| Links + graph, 609 parts (1,855 links) | same, on first need | 6–17 ms |
| All assemblies of the finished model (27) | "Assemblage" | 0.5–1.3 ms |
| Magnet: a part in hand near its place (609 trials, warmed up) | at each pointer move | P50 0.06 ms · P95 0.31–0.38 ms · P99 0.9–1.1 ms · max 2–4 ms |
| Graph of the real build (101 parts) | same | 1.5–1.7 ms |
| Browser, real build, part in hand swept over the assembly (120 moves, move + 2 rendered frames) | pointer | P50 48 ms · P95 52 ms · max 57 ms (≈ 2 × 16.7 ms display + computation) |

Before optimization (all candidate translations evaluated): P95 3.5 ms, max 104 ms (large wings with 114 connectors) → the candidates are evaluated from nearest to farthest and the evaluation stops outside the "near" band. The display state is updated only if the proposal or the markers change.

Precision on the finished model: each part picked up 3 LDU beside its place → 597 proposals out of 609, **592 bring it back exactly to its place** (within 0.05 LDU: rotated submodels); the others have no recognized connection (rim, tires, hinges, windshield) or a tilted axle.

Acceptance test on the copy of the real build (101 parts, read-only, library verified unchanged: same SHA-256): an orange 3023 plate taken from the tray above the white plate f101 → "2 tenons sur f101" (2 studs on f101), markers = proposal before the click, recorded pose = preview, no other part moved; picked back up → same proposal, same pose; "Assemblage" from it → 87 parts (the large assembly of 86 + it). Screenshots in `brick-lab-data/proofs/connexions/` (third-party set: outside the repository).

## 9. Known limits

- Receptacles under slanted edges (wings, wedges): guaranteed by a neighboring tube, they can still protrude by one stud along a slanted edge; never in an empty corner. A point-in-polygon check of the underside face remains to be done.
- Clips, bars (Ø 3.18 mm), hinges, ball joints: not recognized (no male / female distinction demonstrated by the primitives). To study: `clip*` primitives (female) against bars, which have no dedicated primitive.
- Stop axles without an end primitive on the stop side: uncertain; to be added to the metadata catalog part by part, after verification, when a real build uses them.
- Magnet: the rotation remains the player's (the axes must be aligned); the engine says so, it does not rotate the part itself.

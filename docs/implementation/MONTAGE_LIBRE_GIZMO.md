# Free building — 3D manipulator (gizmo): design and report

**Date:** 2026-11-07. Branch `feat/true-free-building` (PR #7). Owner's request before the merge: a 3D manipulator on the selected part, as in Blender. Acceptance test: [RECETTE_HUMAINE_MONTAGE_LIBRE_GIZMO.md](RECETTE_HUMAINE_MONTAGE_LIBRE_GIZMO.md). Follows [MONTAGE_LIBRE_3D_RAPPORT.md](MONTAGE_LIBRE_3D_RAPPORT.md) and [MONTAGE_LIBRE_CONNEXIONS.md](MONTAGE_LIBRE_CONNEXIONS.md).

> Criterion: I select a brick, the three arrows appear immediately, then I can position it exactly in space by manipulating the axes directly with the mouse.

## 1. Behavior

| | |
|---|---|
| **Appearance** | Click on a placed part (free building): three arrows on the part, **X red, Y green (pointing up), Z blue**; no key needed. On a multiple selection or an assembly, at the group's pivot (center of the parts, lowest point). |
| **Arrows (W)** | Click-drag an arrow: the part (or group) moves **only** along that axis. |
| **Rings (E)** | Three X / Y / Z rings: click-drag to rotate around that axis, by the **rotation step** chosen in the bar (90°, 45°, 15°, 5° or 1°); vertical / horizontal mouse movement, with no limit to the model's orientations. |
| **Global / local axes (Q)** | Local: the arrows and rings follow the part's rotation (e.g. an upright axle: its red arrow is vertical). |
| **Step** | "½ tenon" (half stud) (10 LDU horizontally, one 8 LDU plate vertically), "tenon" (stud) (20 / 8), "1 LDU"; "Grille" (Grid) checkbox unchecked or **⌥ held during the drag**: free movement. |
| **Coordinates** | In real time: **X**, **Y = height above the model's ground**, **Z** (same direction as the arrows); numeric entry + "Appliquer" (Apply) (or Enter). |
| **Esc** during a drag | Cancels that drag (back to the starting position, selection kept). |
| **Undo** | Each drag or each entry = one action, undone in one go (even for 432 parts). |
| **Selection bar** | Compact (short labels, shortcuts in the tooltips): with the manipulator's controls it reached 174 px and covered the top of the 3D view — a Shift + click on a part hidden by it did not reach the scene (found by `free-height-group`); 138 px at 1280 × 800. |
| Kept | Direct drag of the part (with the magnet between parts), buttons and keys X / Y / Z ± one rotation step (90° by default), R, M, height, assembly, Shift + click. |

## 2. Implementation (reuse of `TransformControls`)

- **`TransformControls`** from three-stdlib, via drei (already installed) — no manipulator written from scratch. Only the **three arrows** and the **three rings** are kept: the central handle, the plane handles, the view ring and the free rotation sphere are removed (they covered the part, whose support is the direct drag with the magnet; found by tests B and D).
- **LDraw ↔ Three.js**: the manipulator acts on a **relay object whose pivot is placed INSIDE the LDraw group** (flipped 180° around X): its local matrix is in LDraw coordinates, `TransformControls` handles the rotated parent. The manipulator itself is rendered **next to the LDraw group, at the scene root**, because it works in world space (simple sibling element, no R3F portal). Result: green arrow = LDraw −Y (pointing up), blue arrow = LDraw −Z.
- **Relative steps, not absolute**: the built-in rounding of `TransformControls` rounds the **absolute position** (a part at y = 17.41 or x = 351.92 would have jumped to a round value). It is not used for translation: `snapAlong` splits the **movement since the start of the drag** into whole steps, **along the dragged axis only**; the other coordinates do not change (no surprising modification). Rotation uses the built-in step, which is relative to the starting angle.
- **During the drag**, the parts follow in **a single group** whose matrix = current relay × relay at start⁻¹ (one matrix per frame, no React render per part); the originals are hidden.
- **On release**: delta → `applyDelta` (cleaned rotations, coordinates at 0.01 LDU) → `moveGroup` (all or nothing) → one undo action.
- **Camera**: drei suspends OrbitControls during a handle drag. A press on a handle is never taken for the direct drag of a part; a press on a handle **released without movement** remains a click (Shift + click on a part under an arrow).
- **Keyboard during a manipulator drag**: Esc cancels it, the workshop's other keys are ignored (a selection cannot disappear in the middle of a drag); if the manipulator disappears anyway, the camera is re-enabled.
- **Magnet between parts**: never during a constrained drag (only the grid steps); it remains that of the direct drag.
- **Saves**: no format change (rigid poses v3); v1 / v2 / v3 read as before.
- **Guided and synchronized modes**: no manipulator (no selection), unchanged.

## 3. Tests

- **Unit** (+3, 289/289): `snapAlong` (step since the start, y = 17.41 → 9.41, off-axis drift ignored, free, local axis), `applyDelta` (exact group rotation around the pivot), displayed ↔ entered coordinates.
- **E2E** `free-gizmo.spec.ts` (5): arrows on selection (without M), X +40 / Y one plate / Z +20 exact, nothing else moves; 1 LDU; ⌥ free; one undo per drag; X ring: the red axle straightened with the mouse; local axes (its red arrow vertical); entered coordinates; identical positions after reload; 7-part assembly raised then rotated on its pivot, exact distances, stock unchanged, two undos; Esc cancels a drag; the press on the part remains the direct drag with the magnet (4 studs); **WebKit**. Pointer sent onto the handles computed from the manipulator's geometry.
- **Real acceptance test** (isolated folder, files copied read-only, server restarted) — part 4 on **your current 31039 build** (21 parts, copied): gray plate raised by exactly one plate, nothing else; your assembly (8 parts with the Technic brick 32018) moved on X and rotated 90° on Y, exact distances, restored by two undos; your wheel placed by entry (X = 360); identical positions after reload. Part 3: **432-part assembly** moved with the manipulator: 57 fps (worst frame 50 ms), each part exactly −8 in Y, the others intact.

## 4. Limits

- An arrow drawn over a neighboring part takes the press (as in Blender): drag elsewhere on the neighboring part, or Esc to deselect first.
- Rotations by steps of 90°, 45°, 15°, 5° or 1° (⌥ during a ring drag: free); a part rotated off the quarter turns can no longer be snapped by the magnet (axes not aligned).
- A group's pivot is its center at the level of the lowest point; no pivot choice.
- The selection bar covers the top of the 3D view (≈ 140 px on a 1280 px wide screen): a part hidden behind it is selected after rotating or moving the camera.
- No scaling (the manipulator only has translation and rotation).

## 5. Validation (2026-11-07, real outputs)

```
check:spec                                  exit 0
typecheck                                   OK
vitest                                      15 fichiers, 289/289
playwright (Chromium + WebKit), passage 1   78 passed (18.3m)
playwright (Chromium + WebKit), passage 2   78 passed (19.5m)
next build                                  ✓ Compiled successfully
recette réelle libre-reel.spec.ts           partie 1 1/1 ; redémarrage du serveur ; parties 2, 3, 4 3/3
```

- Part 3 (31039, 596 placed parts): opening 4.3 s; graph 13 ms (531 parts, 831 links); 432-part assembly in 175 ms; **manipulator drag on this assembly: 57 fps, worst frame 50 ms**, all other parts unchanged; drag with magnet and camera: 60 fps.
- Part 4 (your 31039 build copied, 21 parts): gray plate raised by one plate; 8-part assembly (f1, f6–f12) moved and rotated; axle f19 selected (local axes); wheel f20 placed at X = 360 by entry; identical after reload.
- Real data: SHA-256 fingerprints of `library.json` and of the `progress.json` files identical before and after the acceptance test.
- One failure found by the full suite during this batch (Shift + click refused in `free-height-group`) came from the enlarged selection bar covering the part; fixed (§ 1, "Selection bar").

## 6. Manual acceptance test (2026-11-08)

Chrome and Safari, by the owner: X / Y / Z arrows **OK**; rotations and local axes **OK**; precision and coordinates **OK**; connected assembly **OK**; non-regression and Safari **OK**. Verdict: **FINAL GO** (merge of PR #7 authorized). Detail and data state: [RECETTE_HUMAINE_MONTAGE_LIBRE_GIZMO.md](RECETTE_HUMAINE_MONTAGE_LIBRE_GIZMO.md) § 7.

## 6. Rotation to the degree (2026-11-10, branch `feat/rotation-degree`)

- Owner's request: be able to rotate a part to the degree.
- **A single rotation step** for the ± buttons, the X / Y / Z keys (Shift: opposite direction) and the rings: **90° (default), 45°, 15°, 5°, 1°**. It is chosen in the bar, next to the rotation buttons (`rot-step-<deg>`), for the part in hand as well as for the selection. The "Pas des anneaux" (Ring step) setting (90° / 15°) in the manipulation settings is replaced by this choice.
- Domain: `axisTurn(axis, degrees)` gives the exact quarter turn for multiples of 90° and a cos / sin rotation otherwise. `rotateOrientation(…, stepDeg)` takes the step. `cleanPose` re-orthonormalizes (Gram-Schmidt, a mirror stays a mirror, a non-rigid matrix stays intact) before rounding the ±1 / 0 coefficients. Result: 3,600 one-degree rotations do not drift, and a stored pose (rounded to 1e-6) stays rigid.
- Limit unchanged: off the quarter turns, the magnet no longer fits (axes not aligned); the part is placed freely.

# Manual acceptance test — 3D manipulator (Chrome then Safari)

> Criterion: I select a brick, the three arrows appear immediately, then I can position it exactly in space by manipulating the axes directly with the mouse. Detail: [MONTAGE_LIBRE_GIZMO.md](MONTAGE_LIBRE_GIZMO.md).

Estimated duration: 20 min, on the MacBook (trackpad), then Safari.

## 0. Before starting (prepared by Claude)

- Production server from the `true-free-building` worktree (head of PR #7), http://127.0.0.1:3000 (127.0.0.1 only).
- Verified backup of `library` + `mappings` just before; SHA-256 inventory.
- Your 31039 build (21 parts) as you left it; nothing is realigned on open. Save format unchanged (v3).

## 1. The arrows on selection

1. 31039 → **Reprendre** (Resume). Click on a **gray plate**: three arrows appear on it (X red, Y green pointing up, Z blue), without M. The bar shows "X … · Y … (hauteur) · Z …" (X … · Y … (height) · Z …).
2. Drag the **green arrow** upward: the plate moves only vertically, by plates (8 LDU); release. **Annuler** (Undo): it returns.
3. **Red** arrow, then **blue**: movement on a single axis, by half studs; the coordinates change live.
4. **Pas : 1 LDU** (Step: 1 LDU): fine adjustment. Hold **⌥** during a drag: no step at all.
5. During a drag, **Esc**: the part returns to where it was.

## 2. The rings

1. **Anneaux** (Rings) (E key): three rings replace the arrows.
2. Click on one of your **red axles**, **red** (X) or **blue** (Z) ring: drag along the ring, the axle tilts by quarter turns — vertical, horizontal. **15°** rotation if you want other angles.
3. **Locaux** (Local) (Q) then **Flèches** (Arrows) (W): on an upright axle, the red arrow follows the axle (vertical); **Globaux** (Global): the scene's axes again.

## 3. Entered coordinates

1. Select your **wheel**: type a value in **X** (or Y, Z), Enter or **Appliquer** (Apply): it is exactly there. Undo: it returns.

## 4. Assembly

1. Click on a part of your gray / orange / green assembly, **"Assemblage"** (Assembly) (or double-click): the manipulator is placed at the center of the whole.
2. Arrows and rings: the whole assembly moves and rotates as a block, without deforming; **one** undo per gesture.

## 5. What does not change

1. Press on the part itself (not on an arrow) and drag: the direct drag, with the magnet between parts.
2. X / Y / Z ±90° buttons, R, Monter / Descendre (Raise / Lower), M, Shift + click: as before.
3. 31040 (synchronized instructions): no manipulator, nothing changes.

## 6. Safari

In **Safari**: redo **1.1–1.3, 2.2 and 4.2**.

## 7. Results (owner, 2026-11-08)

Results transmitted by the owner as verdicts per theme (no numeric measurements transmitted); "Safari OK" covers the items of § 6.

| Item | Chrome | Safari | Remarks |
|---|---|---|---|
| 1. Arrows on selection, one axis at a time, step, 1 LDU, ⌥, Esc | OK | OK (§ 6) | "X / Y / Z arrows: OK" |
| 2. Rings, vertical / horizontal, local axes | OK | OK (§ 6) | "Rotations and local axes: OK" |
| 3. Live and entered coordinates | OK | — | "Precision and coordinates: OK" |
| 4. Assembly moved and rotated as a block, one undo | OK | OK (§ 6) | "Connected assembly: OK" |
| 5. Direct drag, magnet, buttons, 31040 unchanged | OK | — | "Non-regression and Safari: OK" |
| Criterion: select, see the arrows, place exactly with the mouse | OK | OK | "All functional conditions are lifted." Verdict: **FINAL GO** |

Data after the acceptance test (compared to the inventory `donnees-2026-11-07T23-44-37.sha256`): only the 31039 build changed — revision 254, **50 freely placed parts** (21 before), changes of 2026-11-08 between 15:45 and 16:01; 4 older history snapshots (r1, r4, r9, r16) removed by the normal rotation (30 at most, `MAX_HISTORY`, since P7), kept in the previous backups. 31040 (25/65, synchronized) and the rest: unchanged.

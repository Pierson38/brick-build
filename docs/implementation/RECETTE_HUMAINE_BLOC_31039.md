# Manual acceptance test — the beige block with a hole on 31039 and its gray plate

> **To be done by the owner.** Criterion: I take this block from the tray, bring it close to its assembly and directly get a correct fit, without adjusting coordinates.
>
> Technical detail: [CORRECTION_BLOC_31039.md](CORRECTION_BLOC_31039.md).

Estimated duration: 15 min, Chrome then Safari. Branch `fix/31039-block-snapping` (PR not merged).

## 0. Before starting

- **Backup** of your library (`library` + `mappings`) before opening the branch's server. Nothing is realigned on open, save format unchanged (v3).
- Stop the server already listening on port 3000 (the one from the `windows-support` worktree was running during this work), then in `brick-build-worktrees/31039-block-snapping`: `npm run build && npm run start` → http://127.0.0.1:3000.

## 1. What you will see on your current build

1. Open your 31039. Nothing has moved.
2. Click on a **4 × 4 corner gray plate** (2639) above a beige block with a hole, then "**Assemblage**" (Assembly): **13 parts** (the white inverted slope 4287, the plates placed on it… and this gray plate). Before the fix, these parts were counted with the whole fuselage: they are actually **1.81 LDU too low** and do not sit on the 41763 curved slope.

## 2. The criterion, on a new game (the simplest)

"Recommencer" (Start over) on a **copy** or another free building of 31039 (do not erase your build):

1. Place in this order, each part taken **from the tray**: the white inverted curved slope **41763** on its plate; the inverted slope **4287** on the **thin end** of the curve; the plates of the column; then the **beige 6541 block** (with its black pins toward the cross blocks) on its plate.
2. Each time: the bar says "aimant : … emboîté(s) …" (magnet: … fitted …), the **green markers** appear **before** the click, the part is placed **where the preview showed it**.
3. The 4287 is **flush** with the top of the curve (no longer sunk into it).
4. Take the **gray plate 2639** from the tray and bring it above the 4287 and the beige block: "**2 tenon(s) emboîté(s) sur 2 pièce(s)**" (2 stud(s) fitted on 2 part(s)) (or more if other studs are underneath), two green markers including one **on the beige block**. Click.
5. Click on the beige block → "Assemblage": the gray plate and the slope are part of it.

## 3. Repair your build (optional, up to you)

Nothing is realigned automatically. To put a column back at the right height:

1. Pick up the **41763** on that side (click, then M) and bring it close to its place: the magnet puts it back **0.4 LDU higher**, flush with the 3035 plate. Click.
2. Click on the **4287** on that side → "Assemblage" (13 parts) → M → bring it close to the end of the 41763: the magnet should propose the fit, and the gray plate take the beige block's stud. Click. **Annuler** (Undo) (⌘Z) if the result does not suit you.
3. Same on the other side.

> Verified on the engine with a copy of your build (41763: −0.4 LDU; column: −1.81 LDU, 9 connections including the beige block), **not played in the browser**: tell me if the magnet does not propose the fit.

## 4. Quick non-regression

- A 1 × 2 plate from the tray on a white plate: 2 studs, markers, pose = preview (like the 2026-11-08 acceptance test).
- X/Y/Z gizmo and rotations on the selection, one undo.
- Axles and pins: "Assemblage" from a black cross block of the fuselage selects the axle and the beige blocks.
- Guided and synchronized modes: unchanged (no magnet between parts).
- Safari: items 2.2 to 2.5.

## Result

To be completed: GO / NO-GO, browser, remarks.

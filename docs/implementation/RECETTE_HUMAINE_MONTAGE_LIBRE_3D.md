# Manual acceptance test — rotations, direct manipulation, assemblies, magnet (Chrome then Safari)

> Your four problems on 31039 (2026-11-07). Criterion: take a part, rotate it in every direction, place it easily on another thanks to the magnet, then grab and move a whole connected assembly as a single object. Report: [MONTAGE_LIBRE_3D_RAPPORT.md](MONTAGE_LIBRE_3D_RAPPORT.md).

Estimated duration: 25 min. On the MacBook screen, preferably with the trackpad.

## 0. Before starting (prepared by Claude)

- Production server from the `true-free-building` worktree (head of PR #7), http://127.0.0.1:3000 (127.0.0.1 only).
- Verified backup of `library` + `mappings` just before; SHA-256 inventory.
- Your 31039 build (14 free parts) is **as you left it**: nothing is realigned on open.
- Save format unchanged since your last acceptance test (v3); the current version of `main` cannot resume a v3 game — if you do not merge, I restore the backup at your request.

## 1. The red part upright (axle 32062)

1. 31039 → **Reprendre** (Resume). Click on the red axle: it is selected; the bar above the 3D view shows "Dessus : … · Avant : …" (Top: … · Front: …) and the **X / Y / Z** buttons.
2. **X +90°** (or X key): the axle stands up **in place**. Undo: it lies down again; X +90° again.
3. Drag it (press, move, release) elsewhere: it stays upright. During the drag, the three colored axes follow the part; **Z −90°** / **Y +90°** rotate it further.
4. **⌘R**: the axle is upright, at the same place.

## 2. Direct manipulation

1. Press on a placed part and drag: it follows the pointer; release: it is placed. No M needed.
2. A simple click (even with a slight trackpad slip) does not move it: it selects it.
3. Drag in empty space: the camera rotates, as before.
4. During a drag, **Esc**: the part returns to where it was.
5. Shift + click on two or three parts, then drag one of them: they move together.

## 3. The magnet — your gray, orange and green assembly

1. Drag a **gray plate** (30157) above the orange and green plates: it snaps; **green dots** mark the fitted studs; the bar says "aimant : 4 tenon(s) emboîté(s) sur 2 pièce(s)" (magnet: 4 stud(s) fitted on 2 part(s)). Release: it is placed exactly there (it goes down the 2 LDU that were missing).
2. Same for the second gray plate.
3. Take a part from the tray (a plate, a brick) and bring it close to another: it snaps onto its studs. Try beside, underneath (if it has studs), on the side face of the green brackets (side studs: first rotate the part with X or Z so that its receptacles face them).
4. Hold **⌥ (Option)** during the move: no more magnet, free placement. Uncheck "Aimant pièces" (Parts magnet): same.
5. A part with no recognized connection (red axle, pin near an axle…): no proposal, free placement.

## 4. Select and move the assembly

1. Click on a part of your assembly, then **"Sélectionner l'assemblage"** (Select the assembly) (or double-click on a part): all the fitted parts are selected (7 with the two gray plates snapped), not those that merely touch.
2. Drag it by one of its parts: it moves like an object; X / Y / Z rotate it without deforming it; Monter / Descendre (Raise / Lower).
3. Release: placed. **Annuler** (Undo) once: everything returns. Start again and keep it.
4. **⌘R**, then server restart (Ctrl-C in its tab, `npm run start`, or ask me): the assembly is at the same place.

## 5. Nothing has changed elsewhere

1. 31040 (synchronized instructions, 25/65) → Reprendre: no bar, no selection or drag of placed parts, a placement far from its place is refused. Do not place anything (or Undo).

## 6. Safari

In **Safari**: redo **1.2, 2.1, 2.3, 3.1 and 4.1–4.2**.

## 7. Results (to be filled in by the owner)

| Item | Chrome | Safari | Remarks |
|---|---|---|---|
| 1. Red axle upright (X/Y/Z, in place, after reload) | | | |
| 2. Direct drag, click without move, camera, Esc, selection | | | |
| 3. Magnet: gray plates snapped, other parts, ⌥, without connection | | | |
| 4. Assembly: selection, drag, rotation, undo, restart | | | |
| 5. 31040 unchanged | | — | |
| Criterion: rotate, snap, move an assembly like an object | | | |

Tell me what you leave placed: I will compare your data with the inventory from before this acceptance test and tell you exactly what changed.

## 8. Follow-up (2026-11-07)

No result of this acceptance test was transmitted: the owner asked for a 3D manipulator before the merge. Data: only his 31039 build changed (21 parts, revision 109: gray plates snapped, axles straightened, wheel and tire placed), 31040 and 31009 unchanged. Follow-up: [MONTAGE_LIBRE_GIZMO.md](MONTAGE_LIBRE_GIZMO.md), [RECETTE_HUMAINE_MONTAGE_LIBRE_GIZMO.md](RECETTE_HUMAINE_MONTAGE_LIBRE_GIZMO.md).

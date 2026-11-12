# Targeted manual acceptance test — free height and groups (Chrome then Safari)

> The two points of the 2026-11-06 NO-GO: (1) freely lower / raise a part, (2) move several parts together. Corrections: [MONTAGE_LIBRE_CORRECTIONS.md](MONTAGE_LIBRE_CORRECTIONS.md).
> Criterion: assemble several parts, move them together and freely adjust their height with precision.

Estimated duration: 20 min (Chrome 15, Safari 5). On the MacBook screen, preferably with the trackpad.

## 0. Before starting (prepared by Claude)

- Production server from the `true-free-building` worktree (head of PR #7), http://127.0.0.1:3000, listening on 127.0.0.1 only.
- Verified backup of `library` + `mappings` made just before (archive extracted and compared file by file); SHA-256 inventory.
- Your 31039 build (12 free parts from your first acceptance test) was left as is: you start from it.
- Format: unchanged since your first acceptance test (v3 as soon as there are free parts); the current version of `main` cannot resume a v3 game — if you do not merge, I restore the backup at your request.

## 1. Free height — your gray part on 31039

1. 31039 → **Reprendre** (Resume): your 12 parts, at the same places.
2. **Click** on the gray part (30157): it is **selected** (highlighted); a bar appears above the 3D view. **"Déplacer la sélection"** (Move selection) (or M): it is in hand.
3. Bring it above your orange and green assembly. **"▼ Descendre"** (Lower) (step "8 LDU"): it goes down one plate per click, **in place**, even through other parts. Choose **"1 LDU"** and adjust to the millimeter (▲ / ▼). The indication "bas à N LDU du sol" (bottom at N LDU from the ground) follows.
4. Move the mouse: the part keeps the chosen height while following the pointer. Aim at the part shown and **click**: it is placed exactly there.
5. **"Hauteur auto"** (Auto height) (or A) with another part in hand: back to automatic placement on the aimed surface.
6. Keyboard (optional): PageUp / PageDown = the chosen step; Shift + PageUp / PageDown = 1 LDU.
7. Also try a **long** part, a **side-axle** part (Technic pin) and a **small** part.

## 2. Groups — a small assembly moved as a block

1. Build a small assembly of 3 or 4 parts (or take yours).
2. **Click** on one part, then **Shift + click** on the others: they are all highlighted; "N pièce(s) sélectionnée(s)" (N part(s) selected). Shift + click on an already selected part removes it. A click without drag does not move the camera; a drag still rotates it.
3. **"Déplacer la sélection"**: the group is in hand, shown at its new position before placing it.
4. Move it, **R** (or "⟳ Tourner" (Rotate)): it rotates a quarter turn around its center, without deforming. **Monter / Descendre** (Raise / Lower): the whole group.
5. **Click**: placed. The parts keep exactly their spacings and orientations; the tray quantities do not change.
6. **Annuler** (Undo) (or ⌘Z): **once** is enough, the whole group returns to where it was.
7. Redo the move, then **⌘R**: the group is at its new place. (Server restart: Ctrl-C in the server's tab then `npm run start`, or ask me.)
8. Click in empty space, Esc or "Désélectionner" (Deselect): selection emptied. "Remettre dans le stock" (Put back in stock): the whole selection goes back to the tray (Undo puts it back).

## 3. Nothing has changed elsewhere

1. 31040 → **Reprendre** (synchronized instructions, 25/65): no height bar, a click on a placed brick does not select it, a placement far from its place is refused. Do not place anything (or Undo).

## 4. Safari

In **Safari**: redo **1.2 to 1.4** and **2.2 to 2.6**.

## 5. Results (to be filled in by the owner)

| Item | Chrome | Safari | Remarks |
|---|---|---|---|
| 1. Free height: 8 LDU, 1 LDU, preview, kept, auto, exact placement | | | |
| 1.7 Long, side-axle, small parts | | — | |
| 2. Group: selection (click, Shift+click), move, rotation, height | | | |
| 2.5–2.6 Spacings kept, stock unchanged, undo in one go | | | |
| 2.7 Group after reload / restart | | — | |
| 3. Synchronized 31040 unchanged | | — | |
| Criterion: assemble, move together, adjust height with precision | | | |

Tell me what you leave placed: I will compare your data with the inventory from before this acceptance test and tell you exactly what changed.

## 6. Result of the owner's acceptance test (2026-11-07)

**NO-GO** to merge PR #7 as is; **GO** to complete the engine. Four new problems on 31039 (two announced screenshots, not received by Claude): a red part impossible to put upright (axle 32062); a gray, orange and green assembly misaligned (plates 30157 2 LDU above the studs); having to go through M to move; no selection of a whole assembly nor magnet between parts. Data: only the 31039 build changed (14 free parts, revision 40), 31040 and 31009 unchanged. Follow-up: [MONTAGE_LIBRE_3D_RAPPORT.md](MONTAGE_LIBRE_3D_RAPPORT.md), acceptance test [RECETTE_HUMAINE_MONTAGE_LIBRE_3D.md](RECETTE_HUMAINE_MONTAGE_LIBRE_3D.md).

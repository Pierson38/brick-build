# Manual acceptance test — snapping from the tray, connections and hidden assemblies (31039)

> **Result (2026-11-08): GO.** Acceptance test done by the owner on the branch's production server (commit `7836b3d`), with his real library backed up just before (`backups-p8/library-2026-11-08T20-10-32-avant-recette-connexions.tar.gz`, inventory `donnees-2026-11-08T20-10-32.sha256`). Feedback: "ok tout est good" (all good). No anomaly reported.

> Criteria:
> 1. I take a part **from the tray**, bring it close to my assembly, the magnet immediately proposes a compatible connection, I see the **green markers**, then the part fits **exactly** at that place. I no longer have to place then pick back up the part.
> 2. I select a part of a mechanism, "**Assemblage**" (Assembly), and Brick Build selects everything that is linked — including through an **inner axle** and parts invisible from my camera.
>
> Technical detail: [CONNEXIONS_FIABILISEES.md](CONNEXIONS_FIABILISEES.md).

Estimated duration: 20 min, Chrome then Safari. Branch `fix/free-building-connections` (PR not merged).

## 0. Before starting

- Backup of your library (`library` + `mappings`) before opening the branch's server; nothing is realigned on open, save format unchanged (v3).
- Branch server on http://127.0.0.1:3000 (127.0.0.1 only): `npm run build && npm run start` in the `brick-build-worktrees/free-building-connections` worktree.

## 1. The bug: a part taken from the tray (31039 → Reprendre (Resume))

1. Part tray: click on an **orange 1 × 2 plate** (3023). Do not place anything first.
2. Bring it close to the top of your **white 2 × 4 plate**: as soon as it is above, the bar shows "**aimant : 2 tenon(s) emboîté(s) sur 1 pièce(s)**" (magnet: 2 stud(s) fitted on 1 part(s)) and **two green dots** appear on the studs — *before* any click.
3. Click: the plate is placed **where the preview showed it** (same place, same height).
4. **Annuler** (Undo); start again with a **gray plate 30157** above your orange plates + green support: "4 tenon(s) … sur 2 pièce(s)".
5. Pick the placed part back up (click then M) and bring it back to the same place: **same proposal** as in item 2.

## 2. A consistent magnet

1. Slowly move a part in hand above two neighboring slots: the proposal **does not jump** from one slot to the other at each small movement; it changes when you clearly move away.
2. Bring a part close to a place more than a stud and a half away: **no** distant attraction.
3. Rotate the part in hand with **X** (quarter turn) above the assembly: the bar says "**axes non alignés — tourne la pièce**" (axes not aligned — rotate the part), no green dot. Another 3 × X: the magnet returns.
4. Hold **⌥**: no more magnet (free placement). Uncheck **Aimant pièces** (Parts magnet): same.
5. **Aimant modèle** (Model magnet) alone: near the part's official place, it snaps there ("à sa place dans le modèle" (in its place in the model)); elsewhere, free placement. The green dots appear only if the pose shown **really** fits studs.
6. The manipulator (arrows, rings, coordinates) and the direct drag of a placed part: unchanged.

## 3. The assembly linked by an inner axle

1. Your **front wheel** (red axles 32062, gray half beams): click on a gray half beam, **Assemblage** → "**8 pièce(s) sélectionnée(s)**" (8 part(s) selected) (verified on a copy of your build: 3 red axles, 2 × 41677, 2 × 6632, 1 × 32449, linked by axles in the axle holes). The rim, the tire, the second 32449 and the two blue 43093 axle-pins are not part of it: rim and tire are not recognized; the other three are placed ~1 LDU from a real engagement (an axle beside a hole is not an axle in the hole). Pick them back up with the magnet: they fit, then Assemblage includes them.
2. **Voir les connexions** (See the connections): the other parts become transparent, the inside is visible; click again: back to normal (nothing is modified).
3. Rotate the camera and redo **Assemblage** from the same part: **same count**.
4. **M**, move, **R**, click: the whole moves as a block, without deforming; **Annuler** once: everything returns.

> Note: the wheel (42610), the tire (51011) and the hinges are **not** recognized by the LDraw library (neither connection primitive nor verified metadata): they are added only with Shift + click. This is intended (no invented connection), see the inventory.

## 4. What does not change

1. 31040 (synchronized instructions) and a set in guided mode: as before.
2. Your 31039 build reopened: each part exactly where you left it.

Expected feedback: GO / NO-GO per section, and any part that does not snap when it should (reference + color).

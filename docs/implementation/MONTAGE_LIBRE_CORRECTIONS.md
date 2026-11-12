# True free building — corrections after the manual acceptance test (free height, groups)

**Date:** 2026-11-06. Same branch `feat/true-free-building` (PR #7), same worktree. Verdict of the owner's acceptance test before these corrections: **NO-GO** (two limitations). Original architecture: [MONTAGE_LIBRE_ARCHITECTURE.md](MONTAGE_LIBRE_ARCHITECTURE.md) · report: [MONTAGE_LIBRE_RAPPORT.md](MONTAGE_LIBRE_RAPPORT.md) · targeted acceptance test: [RECETTE_HUMAINE_MONTAGE_LIBRE_CORRECTIONS.md](RECETTE_HUMAINE_MONTAGE_LIBRE_CORRECTIONS.md).

> Owner's criterion: assemble several parts, move them together and freely adjust their height with precision. The two screenshots mentioned by the owner were not received; the analysis relies on his description and on his real 31039 build (read without modification).

## 1. Height problem: cause

Owner's build (31039, 12 free parts): white plate 3034 on the ground, orange plates 3023 and green brackets 99780 on top (y = 25.41), and the "long gray part" **30157** (2 × 2 plate with wide wheel supports) left at y = 7.41, above the assembly.

| Where | What the code did | Effect |
|---|---|---|
| `free.ts` — `freePose()` (automatic placement) | The part rests on the aimed surface by its **lowest point** (`bottomExtent`: the lowest vertex of the whole geometry). | For 30157, this point is under the wheel supports, which protrude below the plate: the body always stays above the assembly. No pointer position can bring it closer. |
| `BrickLabApp.tsx` — PageUp / PageDown | The "manual" level cycled through the **model's official levels** (`layers` = the y's of the LDraw file's targets), even in free building. | Only the heights of the 31039 model were reachable, none matched. No visible button, no 1 LDU step. |
| `surface.ts` — `resolveHover()` (P5 magnet) | The free building magnet could substitute the height of a model target. | A chosen height could be replaced by the model's. |
| `BuildCanvas.tsx` | Nothing blocking; but a click on a placed part picked it back up immediately, one at a time. | No way to move several parts together. |

The guided and synchronized modes are not concerned and stay unchanged (model levels, validation by targets).

## 2. Free height

- **Monter / Descendre** (Raise / Lower) (buttons visible above the 3D view, usable on a trackpad; keyboard PageUp / PageDown): the height switches to **manual**, starting from the height shown, by steps of **8 LDU** (plate) or **1 LDU** ("1 LDU" button, or Shift + PageUp/PageDown). No bound taken from the model's levels.
- **Faithful preview**: the part shown is at the chosen height; after a height change it goes up or down in place (its horizontal position does not move as long as the pointer does not move). Indication "bas à N LDU du sol" (bottom at N LDU from the ground).
- **Height kept** during horizontal movements: the part follows the pointer on the horizontal plane at the chosen height.
- **Magnet**: in manual height, it only snaps to a model slot **at that height** (within 0.5 LDU); it never changes the chosen height.
- **"Hauteur auto"** (Auto height) (or A): back to automatic placement on the aimed surface.
- The recorded pose is exactly the pose shown (same format as before, coordinates at 0.01 LDU).

## 3. Selection and groups

| Gesture | Effect (free building) |
|---|---|
| Click on a placed part | Selects it (highlighted). A click elsewhere, Esc or "Désélectionner" (Deselect) empties the selection. |
| Shift + click | Adds / removes the part from the selection (without moving the camera: a click without drag is not a camera gesture). |
| "Déplacer la sélection" (Move selection) (M) | One part: picked back up as before. Several: **group** in hand, shown at its new position before the click. |
| R / "Tourner" (Rotate) | Quarter turn of the group around its **pivot**: horizontal center of the parts (on the half-stud grid), at the height of the group's lowest point. |
| Monter / Descendre | The whole group, same steps as for one part. |
| Click | The group is placed: **all poses or none** (`moveGroup` checks everything before writing: rigid pose, existing parts, no duplicate). |
| Undo / ⌘Z | A single action: all parts return to their previous poses. |
| Del / "Remettre dans le stock" (Put back in stock) | The whole selection (or the group in hand) goes back to the stock, in one action. |

Relative positions and orientations are preserved exactly (same rigid transformation applied to each part; exact quarter turn). The stock does not change during a move. No automatic deduction of connections, no physics.

## 4. Save compatibility

- **No schema change**: a manual height and a moved group are simple poses of free parts, already represented by the v3 format (12 numbers of an LDraw line per part). The v2 format is still written identically without free parts.
- **Stable identifiers**: a moved free part (alone or in a group) keeps its identifier (`f1`, `f2`…). Only an "anchored" part of an old game, once moved, becomes a free part with a new identifier (it had none).
- **Atomicity**: a group move produces a single new game, saved in a single write; an invalid pose or a missing part makes the whole move fail, nothing is written ("all or nothing" unit tests).
- **Old saves** (P5–P8, and the v3 of the first version of this batch, including your 31039 build): read unchanged.

## 5. Tests

- **Unit** (`free-building.test.ts`, +11; `library-store.test.ts`, +1): 8 and 1 LDU steps; manual height outside the model's levels kept while following the pointer; part lowered below the automatic height; vertical up/down in place; magnet never taking priority over the chosen height; pivot; three parts moved (identifiers, stock, one action); rotated group (relative distances and orientations); all or nothing; old part in a group; group saved then re-read; group re-read by a **new store** (server restart).
- **E2E** `free-height-group.spec.ts` (5, original fixtures): 30157 lowered onto a white plate + orange plate assembly, where automatic placement cannot go, 8 then 1 LDU, height kept while moving, keyboard, back to auto, pose = preview, reload; long parts (3460), side-axle parts (2780), small parts (3024), Technic with holes (3700), bracket (99780); three bricks selected (click, Shift + click, camera still), moved, rotated, raised, stock and identifiers unchanged, one undo, reload; guided mode unchanged (no bar, model levels, part not selectable); **WebKit**.
- **Adapted**: `free-building.spec.ts` (click selects, M picks up); `surface-placement.spec.ts`, manual levels test moved to guided mode (where they still apply); P5 scripted player (free height fallback in free building).
- **Real acceptance test** (§ 6).
- **Regression found by the full suite and fixed**: when adding selection, the "ghost" parts no longer reacted to clicks, including in the **mapping editor** (where a click on an unassigned part adds it to the step). `instructions-sync.spec.ts` (P6, unchanged) detected it; fix: ghosts are ignored only for the free building selection.

## 6. Real acceptance test 31009 and 31039 (isolated folder, server restarted between the two games)

| | 31009 | 31039 |
|---|---|---|
| Manual height on a long part | 3460 (1 × 8 plate): auto y = −24, placed at −19 (5 LDU lower) | 32018 (1 × 14 Technic brick): auto y = 1.81, placed at 6.81 |
| Group of 3 (click, Shift + click), moved, rotated, raised by one plate | distances kept, stock identical, identifiers f1/f4/f5 kept | same |
| One undo | the 3 original poses restored | same |
| 3D view while rotating the camera | 60 fps, worst frame 17 ms | 60 fps, worst frame 17 ms |
| After server restart | 11/270, same poses (identical fingerprint) | 11/609, same poses |

Screenshots (real sets, outside the repository): `~/Documents/brick-lab-data/proofs/libre/libre-*-hauteur-manuelle.png`, `libre-*-groupe-selection.png`, `libre-*-groupe-en-main.png`, `libre-*-groupe-pose.png`. Screenshots on original fixtures (in the repository): [manual height in hand](preuves/libre/hauteur-manuelle-en-main.png) · [placed, after reload](preuves/libre/hauteur-manuelle-posee-apres-rechargement.png) · [selection](preuves/libre/groupe-selection.png) · [group in hand, rotated and raised](preuves/libre/groupe-en-main-tourne-monte.png) · [group placed](preuves/libre/groupe-pose.png).

## 7. Validation output (final code, 2026-11-06)

```
check:spec   15 OK, 2 DÉCLARÉ (écarts antérieurs inchangés), 0 écart nouveau
typecheck    tsc --noEmit : 0 erreur
vitest       Test Files 14 passed (14) — Tests 271 passed (271)   [259 + 12]
playwright   passage 1 : 68 passed (18.7m), 0 ignoré, 0 échec
             passage 2 : 68 passed (17.0m), 0 ignoré, 0 échec     [63 + 5 free-height-group, dont WebKit]
recette réelle libre-reel.spec.ts (31009 + 31039) : partie 1 1/1, redémarrage du serveur, partie 2 1/1
npm run build   OK (production, 0 avertissement)
```

A first complete run (before the editor fix, § 5): 67/68, the failure being the regression described.

## 8. Limits

- No physics: collisions possible (intended, so that a part can be "lowered" through supports).
- Group rotation by quarter turns around the vertical axis; no O orientation for a group.
- After a height change, the part follows the pointer again as soon as it moves (on the plane of the chosen height): aim at the part shown to place it there.
- The undo history lives in the page; after a reload, "Annuler" (Undo) removes the last placed part.

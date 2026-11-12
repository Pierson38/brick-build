# True free building — architecture

**Date:** 2026-11-06. Branch `feat/true-free-building`, worktree `brick-build-worktrees/true-free-building`, base `origin/main` = `5272811626789264cc10e7d759944e832bb1ff6b` (UX batch merged).
**Owner decision (2026-11-06):** "in free mode, I must be able to pick a brick and place it wherever I want, even if it is not its place in the official LEGO model". Deliberate deviation from specification v1.0, which stays immutable (see [LIMITATION_MONTAGE_LIBRE.md](LIMITATION_MONTAGE_LIBRE.md)). No snap-fit physics; no P9.

## 1. Starting point (study of the existing code)

| Element | Today | Consequence |
|---|---|---|
| `engine.ts` — `tryPlace()` | A placement is accepted only within 10 LDU and 10° of the `targetMatrix` of a still-free occurrence (active step in guided / synchronized mode, all of them in `freeManual`). | "Free building" only frees the **order**. |
| `engine.ts` — `BuildSession` | `{ mode, placed: occurrenceId[] }`. A placed part **is** an occurrence: its position is derived from the `targetMatrix`. | Impossible to represent a part anywhere other than at its target. |
| `surface.ts` — `resolveHover()` | Height taken from the aimed surface, then search for a compatible target (ghost, target layer, ray); the preview "jumps" onto the target if the placement is acceptable. | Good placement aid, to keep as an **optional magnet**, no longer as a rule. |
| `BuildCanvas.tsx` | Draws the occurrences (solid / ghost / selection) at their `targetMatrix`; click = place the held part; with no held part, a click is only useful in the mapping editor. | Parts must be drawn at an arbitrary pose and it must be possible to pick one back up. |
| `progress.ts` (schema v2, P6) | `placedOccurrenceIds` + mode + page/booklet + mapping fingerprint. Validated on the client **and** the server (`restoreProgress`), rejected if it does not match the model. | The format must be extended without breaking v1/v2 saves (P5–P8). |
| Library (P7) | `putProgress` validates with `restoreProgress`, history of replaced versions, conflicts by revision; `game()` (build-store) decides whether a conflict concerns only the view (page) or the game. | Free parts are part of the **game**: they must enter `game()`, otherwise a conflict would overwrite them. |
| Browser ↔ library comparison (P7) | `save-compare.ts` compares mode, parts, page, booklet, mappings. | Add the "free parts" difference. |
| Collection status | `buildStatus(placed, total)`: `DONE` as soon as `placed ≥ total`. | An exhausted stock in free building does not mean "model finished". |
| Mode change | `switchMode()` keeps the placed parts; synchronized → free fallback if the mappings become invalid. | Free → guided/synchronized must be **explicit** if some parts are not at a place of the model. |

## 2. Principle: separate the model target from the player's placement

Two distinct notions, no longer conflated:

- **Target** (`BrickOccurrence.targetMatrix`): where the part is in the LDraw model. **Unchanged.** Sole reference of the guided and synchronized modes.
- **Player placement**: where the player actually placed a part. Recorded as is, never derived.

A game therefore contains two kinds of placed parts:

```ts
interface BuildSession {
  mode: BuildMode;
  /** "Anchored" parts: placed on a model target (guided / synchronized modes, old games). */
  placed: readonly string[];          // occurrenceId, placement order — unchanged
  /** Free parts: placed by the player in free building, at their actual pose. */
  free?: readonly FreePiece[];        // absent or empty outside free building
}
interface FreePiece {
  id: string;            // 'f1', 'f2'… unique within the game
  partKey: string;       // reference + color taken from the set's stock
  colorCode: string;
  pose: Matrix4Tuple;    // global LDraw pose actually chosen (rotation + translation)
}
```

- **Stock** of a reference/color pair = number of model occurrences − anchored parts − free parts of that pair. Never negative: a placement without stock is refused (`NO_STOCK`). Quantities and colors are therefore exactly those of the set.
- **Guided and synchronized modes**: `free` always empty; `tryPlace`, `resolveHover`, the steps and the messages are **unchanged**.
- **Free building** (`freeManual`, same recorded value as before): every new placement creates a `FreePiece` at the pose shown, **with no mandatory comparison** against a `targetMatrix`.
- **Match with the model** (`matchToModel`): computed on demand, never recorded. Each free part is matched, at most once, to a non-anchored occurrence of the same reference/color that it is within 10 LDU / 10° of (symmetries included, same rule as `tryPlace`), closest first. Used for information ("in its place in the model"), for end-of-game messages and for switching to a guided mode.

## 3. Free placement, snapping, picking a part back up

| Action | Behavior |
|---|---|
| Pick up a part | From the tray (stock > 0). Orientation: model's choice (O), quarter turns (R) — existing controls. |
| Move with the mouse | The pointer gives the pose (ray + aimed surface), as today. |
| "Model slot" magnet | If the aimed pose is within **9.5 LDU** and 10° of a free target of the same pair (the free pose itself, then the P5 `resolveHover` algorithm: layers, target aimed at in the air, ghost; already occupied targets excluded), the part snaps onto that target and the interface says so ("à sa place dans le modèle" (in its place in the model)). 9.5 LDU < grid step (10): a position offset by half a stud always remains possible. Value set by the P5 suite: a ray that grazes a stud puts the pointer 7 LDU from the target (6 LDU, the first value, missed this case). Can be disabled ("Aimant modèle" (Model magnet) checkbox). |
| "Grid" magnet (otherwise) | Height: the part rests on the aimed surface; studs do not count (a part aimed at on its top or on a stud is placed on the top of its body, where the pointer ray crosses that top); elsewhere, plate levels (8 LDU) above the model's ground. Horizontal position: half-stud step (10 LDU), aligned on the aimed part ("simple connection") or on the origin on the ground. Disabled (G or "Grille" (Grid) checkbox): 1 LDU, exact surface height. |
| Free height | "Monter" / "Descendre" (Raise / Lower) (PageUp / PageDown) by 8 LDU or 1 LDU, independently of the model's levels; "Hauteur auto" (Auto height) to go back (added after the manual acceptance test, see [MONTAGE_LIBRE_CORRECTIONS.md](MONTAGE_LIBRE_CORRECTIONS.md)). |
| Place | Click: the part is recorded at the pose shown. No refusal for "too far" in free building. |
| Pick a placed part back up | Click on a placed part (with no part in hand): it is **selected**; Shift + click adds others; "Déplacer la sélection" (Move selection) (M) picks it up with its rotation (several: a rigid group, see [MONTAGE_LIBRE_CORRECTIONS.md](MONTAGE_LIBRE_CORRECTIONS.md)). Click: placed back elsewhere (new pose). Esc: it stays where it was. **Del / ⌫** or button: removed, back to the stock. |
| Rotate a placed part | Pick it back up, R / O, place it again. |
| Undo | ⌘Z / button: undoes the last action (placement, move, removal) during the session; after a reload, removes the last placed part. |
| PDF instructions | Unchanged: freely viewable, page recorded. |

No physics: no collision detection, no check that the studs fit together; two parts can interpenetrate. Known limits: a part aimed at on a side face is placed at the plate level below the aimed point; stacking assumes the LDraw convention "origin at the top of the body" (bricks, plates, tiles) — parts that do not follow it (axles, Technic connectors, upside-down parts) stack approximately.

## 4. Save and compatibility

**Schema v3** (only when the game contains free parts):

```json
{ "schemaVersion": 3, "buildMode": "freeManual", "placedOccurrenceIds": ["…#3"],
  "freePieces": [{ "id": "f1", "partKey": "3001.dat", "colorCode": "4",
                   "pose": [x, y, z, a, b, c, d, e, f, g, h, i] }], "…": "v2 fields unchanged" }
```

- `pose`: the 12 numbers of an LDraw type 1 line (translation rounded to 0.01 LDU, rotation to 10⁻⁶). ≈ 80 bytes per part: 609 parts ≈ 50 KB (limits: 512 KB browser, 1 MB server).
- **Without free parts, writing stays in v2, byte for byte**: guided, synchronized and old free games do not change format (rollback possible on `main`).
- **Reading**: v1, v2 and v3. An old free game (v1/v2, identifiers only) is restored with its parts **anchored at their historical positions** (the targets where they were placed); no free position is invented. They become free only if the player picks them back up.
- **Validation** (client and server, untrusted data): `freePieces` only in `freeManual` and in v3; array bounded by the number of occurrences; unique identifiers (`f` + integer); reference/color pair present in the model; stock never exceeded (anchored + free ≤ quantity); 12 finite numbers, bounded translation (|t| ≤ 100,000 LDU), orthonormal rotation with determinant +1 (tolerance 10⁻³). Otherwise `MALFORMED`: the save is kept as is, never rewritten (P7 rule).
- **Library**: the game signature (`game()`) includes the free parts (a conflict on them is never resolved silently); the browser ↔ library comparison adds the "free parts" difference; the server summary counts anchored + free parts and the number of parts in their place in the model.
- No migration: nothing is rewritten on open.

## 5. Mode changes

| From → to | Rule |
|---|---|
| guided / synchronized → free | Anchored parts kept, no free part created. |
| free → guided / synchronized, all free parts at a place of the model | Converted into anchored parts on the matching occurrences; message "N parts recognized in their place". |
| free → guided / synchronized, some outside the model | **Explicit confirmation**: "K parts placed outside the official model will be put back in the stock (M recognized ones kept)" — "Retirer et passer en mode …" (Remove and switch to … mode) / "Rester en montage libre" (Stay in free building). Nothing is removed without this click. |
| synchronized without valid mappings → free (P6) | Unchanged. |

## 6. End of game

- Guided / synchronized: unchanged ("Modèle terminé" (Model finished) when all occurrences are placed on their target).
- Free building, stock exhausted: "Toutes les pièces du set sont posées (N). Montage libre : ta construction n'est pas comparée au modèle officiel — K pièce(s) à leur place dans le modèle." (All the set's parts are placed (N). Free building: your build is not compared to the official model — K part(s) in their place in the model.) The "model rebuilt" message appears only if all parts are in their place (anchored or recognized).
- Collection: status "Terminé" (Finished) only if all parts are in their place in the model; an exhausted stock in free building stays "En cours" (In progress) with the note "toutes les pièces posées (montage libre)" (all parts placed (free building)).

## 7. Files touched

| File | Change |
|---|---|
| `src/domain/build/free.ts` (new) | Stock, placing / moving / removing a free part, match with the model, switch to a guided mode, grid magnet. Pure functions. |
| `src/domain/build/engine.ts` | Optional `BuildSession.free`; `tray()` accounts for free parts. `tryPlace`, `resolveHover` and guided rules unchanged. |
| `src/domain/build/progress.ts` | Schema v3 (written only with free parts), v1–v3 reading, validation. |
| `src/domain/library/save-compare.ts`, `src/infra/persistence/build-store.ts`, `local-progress.ts` | Free parts in the comparison, the game signature and the count of recent sessions. |
| `src/server/library/store.ts`, `prepare.ts`, `src/domain/library/types.ts` | Counts and status (anchored + free, "in their place"). |
| `src/components/three/BuildCanvas.tsx` | Free parts drawn at their pose, pick-up on click, normal of the aimed face. |
| `src/components/BrickLabApp.tsx` | Free building branches: preview, placement, pick-up, removal, undo, mode change confirmation, end-of-game messages. |

## 8. Planned validation

Unit tests (stock, distant placement accepted in free mode and refused in guided mode, move, rotation, removal, quantities/colors, identical parts, match, mode switch, schema v1/v2/v3 and rejection of invalid data, status); E2E on fixtures (mouse, pick-up, undo, reload, library and server restart, old saves, synchronized mode unchanged, WebKit); real sets 31009 and 31039 (free placement, smoothness). The existing P5–P8 suites are replayed; the only tests modified will be those that verified the old rule "refusal far from a target in free building", replaced by the new rule **and** by the same check in guided mode.

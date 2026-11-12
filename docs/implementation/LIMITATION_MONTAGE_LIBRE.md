# Known limitation — "free building" is only free in the order

**Reported by:** the owner, during the manual acceptance test of the UX batch (2026-11-06).
**Status:** engine limitation **predating** the UX batch, **non-blocking** for PR #6. Dedicated workstream decided by the owner: branch `feat/true-free-building`.
**Follow-up:** handled by the `feat/true-free-building` branch — see [MONTAGE_LIBRE_ARCHITECTURE.md](MONTAGE_LIBRE_ARCHITECTURE.md) (awaiting manual acceptance test and merge).

## Finding

In the **Montage libre (avec notice)** (free building, with instructions) mode (`freeManual`), a part taken from the stock can only be placed **at the location of a still-free occurrence of the LDraw model**, with the same reference and the same color. Placed elsewhere, it is refused ("Trop loin de l'emplacement le plus proche" (Too far from the nearest location), "mauvaise orientation" (wrong orientation)).

This behavior does not match the owner's definition of free building: pick a brick and place it **wherever they want**, even if it is not its place in the official LEGO model.

## Origin

| Item | Detail |
|---|---|
| Rule | `tryPlace()` (`src/domain/build/engine.ts`): in `freeManual`, the candidates are all unplaced occurrences (instead of the active step); placement is accepted only within 10 LDU and 10° of the `targetMatrix` of one of them, otherwise refused. |
| Pointer aid | `resolveHover()` (`surface.ts`) snaps the part onto the model targets (ghost, target layer, ray). |
| Save | Progress only contains occurrence identifiers (`placedOccurrenceIds`): a placed part is **by construction** at the position of its occurrence. No free position can be saved. |
| Introduced | Engine of batch P0–P4 (`738db13`, 2026-11-03), unchanged on this point since (P5–P8). |
| Specification v1.0 | Behavior compliant with the initial specification, which defines free building as a free **order** and an imposed **final position**: `01_PRODUIT_ET_PERIMETRE.md` ("No validation of the official order, only of the final location"), `03_LDRAW_ET_ETAPES.md` ("placement on the matching remaining final target"), `04_UX_ET_PARCOURS.md`, `08_SCHEMA_DONNEES.md` § 5, `06_TESTS_ET_ACCEPTATION.md`. |
| UX batch | No file of `src/domain/build/` or of persistence modified (`git diff 727ba1c..a645b9d -- src/domain src/server`: only `src/domain/ui/panel-layout.ts`, new). The limitation is neither caused nor worsened by PR #6. |

## Consequence

True free building changes the **rule** and the **save format**: the model's target position (`targetMatrix`, unchanged, used by the guided and synchronized modes) must be distinguished from the position actually chosen by the player, and the latter must be recorded. This is a deliberate deviation from the v1.0 specification (which remains immutable), approved by the owner on 2026-11-06; it will be handled and documented in its own batch (architecture, P5–P8 save compatibility, acceptance test), without modifying the guided and synchronized modes.

# Free building — connections, transformations, snapping (architecture note)

> **Update 2026-11-08**: Technic axles and axle holes recognized, receptacles guaranteed by a stud or a tube, stable "nearest first" magnet, a single connector index (bug of the part taken from the tray) — see [CONNEXIONS_FIABILISEES.md](CONNEXIONS_FIABILISEES.md). What follows describes the state of 2026-11-07.

**Date:** 2026-11-07. Branch `feat/true-free-building` (PR #7). Owner's request after his acceptance test on 31039: rotations on 3 axes, direct manipulation, selection of a connected assembly, snapping between parts. The two announced screenshots were not received; analysis done on his real 31039 build (read without modification).

## 1. What the LDraw library makes it possible to know — and what it does not say

The LDraw library describes the **geometry** of parts (faces, edges, subfiles). It **does not describe connections**: no official metadata says "here a stud, there a receptacle, there an axle hole". What can be inferred demonstrably comes from the standard **primitives** that the part files reference, with their transformation:

| Primitive (official title) | Interpretation | Reliability |
|---|---|---|
| `stud.dat` "Stud", `stud2.dat` "Stud Open", logo variants, truncated studs (`stud10/13/15/17/26`, `stud6`) | **stud**: center of the base + axis (stud direction), in part coordinates | reliable |
| `stud4*.dat` "Stud Tube Open" (2-wide parts) | tube **between four receptacles**; gives the underside plane | reliable for bricks, plates, tiles |
| `stud3*.dat` "Stud Tube Solid" (1-wide parts) | tube **between two receptacles**, along the length | reliable for 1 × N parts |
| no tube, studs on top (1 × 1) | receptacle under the stud, on the lowest face | reliable for 1 × 1 |
| no tube or stud, standard title "Tile W x L" | grid of receptacles under the tile | reliable for rectangular tiles |
| `connect*.dat`, `confric*.dat` "Technic Pin …" | Technic **half-pin**: 20 LDU segment | reliable |
| `peghole.dat` "Peg Hole End" (×2, collinear, 10 to 40 LDU) | Technic **pin hole** between the two ends | reliable when both ends exist |
| `axle.dat`, `axleend*`, `axlehol*` | axle **or** axle hole — the same primitives draw the male axle (32062: `axlehol8` "Axle Perimeter") and the axle hole | **not recognized** (reported) |
| clips, bars, hinges, ball joints, wheels, Duplo, Scala, sloped faces without tube, windshields… | no usable connection primitive | **not recognized** |

The **receptacles** (where a stud goes in) have **no primitive**: they are **deduced** — points of the 20 LDU grid (aligned on the studs or on the tubes) within the outline of the underside face (base plane of the tubes, tolerance 1.6 LDU for recessed rims). This is a documented hypothesis, checked part by part (§ 5), not a reading.

**Measured coverage** (scan of all references in the files, 213 ms for 31039): 31039 — 133 distinct real parts, 117 with at least one connector, 107 with studs/receptacles, 15 with unrecognized axles, 16 without any connector (axles, axle-pins, bushings, hinges, clips, wheels, tires, "cheese slopes", curved slope, windshield); 31009 — 65 parts, 52 with studs/receptacles; 31040 — 31 parts, 21.

Accepted consequences: no **invented** connection. Two parts that touch or cross without a compatible pair of connectors **are not connected**; an unrecognized part does not snap (free placement, grid and manual height remain available) and enters an assembly only through manual selection (Shift + click).

## 2. Representation

- `src/domain/ldraw/connectors.ts` (pure): recursive reading of a part's files (injected file reader, each file read once), connectors in **part** coordinates: `stud`, `antistud` (position, axis), `pin`, `pinhole` (middle, axis, half-length). Cache **by LDraw reference** (`src/infra/ldraw/connector-catalog.ts`, same files as the rendering, served by `/api/ldraw/`, already in HTTP cache).
- **World coordinates**: connector of a placed part = `pose × connector` (same matrix as the rendering and the save); the axes follow the X/Y/Z rotations. Spatial index by cells of 20 LDU, rebuilt when the build changes.
- **Compatibility**: stud ↔ receptacle (same point within 0.6 LDU, same axis); half-pin ↔ hole (parallel axes, collinear within 0.6 LDU, overlap ≥ 8 LDU).

## 3. Transformations and rotations

- A pose stays an LDraw rigid matrix (3 × 3 rotation + translation), as in the v3 format (12 numbers of a type 1 line). **No schema change.**
- ±90° rotations around the **X, Y, Z** axes (LDraw: Y vertical) composed by matrix product; coefficients are brought back exactly to −1 / 0 / 1 when they are within 10⁻⁹ of it: no drift, even after hundreds of rotations. Orientations are no longer limited to those of the model (O remains available).
- Groups: a rotation of the group's frame, applied to each part (`frame × relative pose`); exact relative distances and orientations; the group then rests on the surface by its recomputed lowest point.
- Reorienting placed parts: the selection rotates in place (same lowest point), in one action.

## 4. Snapping and assemblies

- **Magnet between parts** (during an explicit manipulation only): for each connector of the part (or group) in hand and each compatible connector of a placed part within 24 LDU, a candidate translation that makes them coincide (the rotation stays the one chosen by the player: the axes must already be aligned). Deterministic score: number of fitted pairs (more = better), then distance to the aimed position, then order of translations. **Impossible proposals discarded from the connectors** (reliable rules): a stud that already holds a receptacle does not receive a second one; two studs (or two receptacles) at the same point and with the same axis = two parts at the same place. A first version also discarded proposals whose **bounding box** crossed another part: abandoned, because the box of a part with protrusions is wrong (the owner's 30157, with its wheel supports, "crossed" the white plate without touching it) — no approximate collision detection. With manual height, only proposals at that height. Preview at the proposed position + markers of the fitted connectors + text "Aimant : N tenons sur …" (Magnet: N studs on …). Can be disabled (checkbox), bypassed by holding ⌥ (Option) during the move.
- **Connected assembly**: graph of placed parts where two compatible connectors coincide; "Sélectionner l'assemblage" (Select the assembly) (and double-click) takes the connected component of the chosen part, then moved as a rigid group (existing), in one action. **Shift + double-click** (2026-11-10) adds the component of another part to the selection instead of replacing it: several assemblies move or rotate together. The first Shift + click of the double-click toggled the part, the union (`addToSelection`) puts it back; an already selected assembly is never removed.
- The magnet toward the **official model** remains available (separate "Aimant modèle" (Model magnet) checkbox): when it finds the part's official slot (within 9.5 LDU), it is kept; everywhere else, the magnet between parts applies. Unchecking "Aimant modèle" gives full control to the magnet between parts. (Found by the P5 validation on 31040: the magnet between parts moved a part from its official place to a neighboring fit.)

## 5. Impacts

| File | Change |
|---|---|
| `connectors.ts` (new), `connector-catalog.ts` (new) | connectors, cache by reference |
| `free.ts` | exact X/Y/Z rotations, 3D group rotation, graph and connected components, snapping proposals |
| `surface.ts`, `engine.ts` | unchanged (guided / synchronized rules) |
| `BrickLabApp.tsx` | X/Y/Z ±90° commands, orientation indicator, direct manipulation (drag), assembly, magnet between parts |
| `BuildCanvas.tsx` | drag a placed part (4 px threshold, camera suspended during the drag, pick-up otherwise), double-click, magnet markers, rotation axes |
| Saves v1/v2/v3 | unchanged; opening a game realigns nothing; the magnet acts only on an explicit manipulation |
| Stock, undo | unchanged: a move or rotation of placed parts is a single action (`moveGroup`, all or nothing) |

# Free building — 3-axis rotations, direct manipulation, assemblies, snapping: report

**Date:** 2026-11-07. Branch `feat/true-free-building` (PR #7), worktree `brick-build-worktrees/true-free-building`, base `origin/main` = `5272811`. Owner's decision: NO-GO for PR #7 as is, GO to complete the free building engine (four problems noted on 31039).
Architecture: [MONTAGE_LIBRE_CONNEXIONS.md](MONTAGE_LIBRE_CONNEXIONS.md) · manual acceptance test: [RECETTE_HUMAINE_MONTAGE_LIBRE_3D.md](RECETTE_HUMAINE_MONTAGE_LIBRE_3D.md).

> Owner's criterion: take a part, rotate it in every direction, place it easily on another thanks to the magnet, then grab and move a whole connected assembly as a single object. The two announced screenshots were not received: both cases were reconstructed from his real 31039 build (read without modification).

## 1. The owner's two cases

| Announced screenshot | What his data shows | Cause |
|---|---|---|
| "A red part that I cannot put upright" | Technic axle **32062** (red), lying down: its length (X axis of the file) points toward Z. | The orientations offered (O) were those of the model: 31039 uses the 32062 only lying down; R only rotated around the vertical. |
| "A gray, orange and green assembly misaligned" | Gray plates **30157** at y = 15.41 instead of 17.41 on the orange plates 3023 and green brackets 99780; in the plane, well centered. | **2 LDU too high**: its receptacles do not take the studs. Nothing could bring them there precisely (no magnet between parts). |

Before / after screenshots (original synthetic model with the same parts and the same poses as his 31039): [before — assembly](preuves/libre/avant-assemblage-gris-orange-vert.png) · [before — red axle](preuves/libre/avant-axe-rouge-pas-de-verticale.png) · [after — vertical axle](preuves/libre/apres-axe-rouge-vertical.png) · [after — magnet, preview](preuves/libre/apres-aimant-plaque-grise-apercu.png) · [after — aligned assembly](preuves/libre/apres-assemblage-aligne.png) · [after — selected assembly](preuves/libre/apres-assemblage-selectionne.png) · [after — assembly moved and rotated](preuves/libre/apres-assemblage-deplace.png).

## 2. The four improvements

| | What changes |
|---|---|
| **A — X / Y / Z rotations** | X, Y, Z buttons (−90° / +90°) above the 3D view, X / Y / Z keys (Shift: −90°, R = Y); rotation axes drawn around the part (X red, Y green, Z blue); indicator "Dessus : haut · Avant : −Z" (Top: up · Front: −Z). Rotations composed by matrix product, coefficients brought back exactly to −1/0/1: no drift (verified on 1,000 rotations). With no part in hand, the selection rotates **in place** (same lowest point), in one action. Groups: 3D rotation of the frame, placed back by their new lowest point. No more limit to the model's orientations (O remains available). |
| **B — Direct manipulation** | Press on a placed part and drag: it is picked up (with the whole selection if it belongs to it), release to place at the preview. 4 px threshold (the same as the existing click): a click, even with a slight trackpad slip, moves nothing. Camera suspended only during this drag; a drag in empty space still rotates it. Esc cancels. M remains a shortcut. P6 mapping editor unchanged. |
| **C — Connected assembly** | "Sélectionner l'assemblage" (Select the assembly) (and double-click): all parts linked to the chosen part by **recognized** connections (stud in receptacle, pin in hole), directly or through others; the group slides, rotates, goes up and down as a rigid object; one action, one undo. Two parts that touch or cross without a compatible connection are not linked. Shift + click remains available for the rest. |
| **D — Magnet between parts** | During a manipulation: compatible connectors within 24 LDU, candidate translations, deterministic score (fitted pairs, then smallest move), impossible proposals discarded (stud already taken, two parts at the same place), preview at the proposed position, green dots on the fitted connectors, text "aimant : N tenon(s) emboîté(s) sur M pièce(s)" (magnet: N stud(s) fitted on M part(s)). "Aimant pièces" (Parts magnet) checkbox; ⌥ held during the move to ignore it; in manual height, only at that height. The pose is exactly the preview. |

## 3. Recognized connections (summary — detail in the architecture note)

Studs (`stud*` primitives), receptacles deduced under bricks, plates, tiles (`stud3*` / `stud4*` tubes, 1 × 1, title "Tile W x L"), Technic half-pins (`connect*`, `confric*`), pin holes (pairs of `peghole`). **Not recognized** (reported, never invented): axles and axle holes (same primitives for male and female), clips, bars, hinges, wheels, slopes without tube, windshields… Coverage: 31039 — 117 parts out of 133 with at least one connector, 107 with studs/receptacles; 31009 — 52/65; 31040 — 21/31.

## 4. Compatibility and integrity

- **Save format unchanged** (v3, 12 numbers per free part): a 3D rotation or a moved group are rigid poses already representable. v1 / v2 unchanged.
- Opening a game realigns nothing: the magnet acts only on an explicit manipulation (his real 31039 build was left as it was).
- Guided and synchronized modes: rules unchanged (no bar, no selection, same levels, same refusal); synchronized 31040 replayed to the end by the suite.
- Stock: a move, a rotation or a group neither creates nor removes a part; a group is moved all or nothing (`moveGroup`).

## 5. Defects found during the batch and fixed

| Defect | Effect | Fix |
|---|---|---|
| Bounding boxes to rule out collisions | The 30157 (wheel supports) was judged "in collision" with the white plate: the magnet proposed nothing in its case | Approximate collision abandoned; reliable rules on connectors |
| R3F handlers called once per touched object | After a drag, the release click re-selected the part | Propagation stopped, flag kept until the next press |
| Re-created part (selected / not) placed at the origin until the next render | A fast double-click (or two clicks) went through the part and **emptied the selection** — for a human too | Matrix and world matrix computed on attach |
| Double-click measured at event processing | A slow frame separated the two clicks | Timestamp of the events themselves |
| Preview absent as long as the mouse no longer moves after the pick-up | The first drag showed nothing if the pointer stopped | The pointer is tracked before the pick-up |
| Rotation axes drawn with thick lines (drei `Line`) | 3D view slowed down (test: 52 s instead of 21 s) | Simple segments created once |
| Bar texts and buttons on the same line | The buttons moved when a text changed | Separate status line |
| R folded into the orientation in free building | The P5 scripted player (which counts R's quarter turns) looped: 31040 validation in free mode blocked for 40 min | R keeps its quarter turn in all modes; only the X / Y / Z buttons and keys compose the orientation |
| The magnet between parts took priority over the official slot | On 31040, a part snapped on its model slot was moved 10 LDU toward a neighboring fit | When "Aimant modèle" finds the official slot, it is kept; elsewhere the magnet between parts applies; a zero offset changes nothing |
| Test: two 2 × 4 bricks placed overlapping | The magnet (rightly) stacked the second on the first | Test fixed: bricks spaced apart |

## 6. Tests

- **Unit**: 286/286 (+15: rotations A 4, connections and magnet 11 — reading connectors on original miniature parts, graph, assemblies, pin/hole, proposals, determinism, height kept, unaligned axes, stud already taken, two parts at the same place).
- **E2E** `free-3d.spec.ts` (5, synthetic model with the owner's parts and poses): A — red axle vertical, placed, identical after reload, in-place rotation undone in one go; B — drag, click with 2 px slip, empty space = camera, Esc, selection dragged together, M; C — 7-part assembly (button, double-click), dragged and rotated as an object, one undo, neighboring part not taken; D — the two gray plates fitted exactly (4 studs each), ⌥, unrecognized axle without proposal; **WebKit**. Existing tests adapted: `free-building` (selection then M), `free-height-group` (time limit), scripted player unchanged since the previous fix.
- **Real acceptance test** (isolated folder, files copied read-only, server restarted between parts 1 and 2):

| | 31009 | 31039 |
|---|---|---|
| Magnet on real parts | 3010 (1 × 4 brick) on 3023: 2 studs, connected | 30157 on 32018: 2 studs, connected |
| Assembly selected, dragged, rotated on X | 2 parts, exact relative geometry | same |
| After restart | 13/270, same poses (identical fingerprint) | 13/609, same |
| Guided after "Retirer et changer de mode" (Remove and change mode) | distant placement refused ("Trop loin… 267 LDU" (Too far… 267 LDU)) | (no steps) |
| 3D view while rotating the camera | 60 fps | 60 fps |

**31039 performance with all its parts** (596 freely placed at their pose; 13 **mirror** parts of the OMR file excluded, a free part having to be rigid): opening 4.7 to 5.1 s; connection graph **12 to 16 ms** (531 linked parts, 831 links); selection of the main assembly (432 parts, display included) **113 to 454 ms** depending on the run; 60 fps at rest, **during a drag with the magnet**, while rotating the camera.

Real screenshots (outside the repository): `~/Documents/brick-lab-data/proofs/libre/libre-*-aimant-reel.png`, `libre-31039-1-609-pieces.png`, measurements `recette-libre.json`.

## 7. Validation output (final code, 2026-11-07)

```
check:spec   15 OK, 2 DÉCLARÉ (écarts antérieurs inchangés), 0 écart nouveau
typecheck    tsc --noEmit : 0 erreur
vitest       Test Files 15 passed (15) — Tests 286 passed (286)
playwright   passage 1 : 73 passed (23.2m), 0 ignoré, 0 échec        [68 + 5 free-3d, dont WebKit]
             passage 2 : 72 passed, 1 échec intermittent (WebKit de free-height-group : pièce
                         en main lue juste avant d'exister, WebKit sur WebGL logiciel) → le test
                         attend désormais la pièce (3 exécutions isolées réussies)
             passage 3 : 73 passed (24.9m), 0 ignoré, 0 échec (après cette correction de test)
recette réelle libre-reel.spec.ts (31009 + 31039) : partie 1, redémarrage, parties 2 et 3 : 3/3
npm run build   OK (production, 0 avertissement)
```

Before these runs, two complete executions had revealed two defects (R folded into the orientation, magnet priority, § 5): 65/67, fixed.

## 8. Limits

- Recognized connections limited (§ 3): axles, clips, hinges, wheels… do not snap and join an assembly only by Shift + click.
- The magnet does not rotate the part: it must be oriented (X/Y/Z) so that the axes match.
- No collision: two parts can interpenetrate outside the reliable cases ruled out.
- 24 LDU radius: beyond it, aim closer; with several equally good proposals, the nearest wins (deterministic).
- Mirror parts of a file (non-rigid pose): no free pose possible.
- Trackpad and Safari app: verified by the manual acceptance test (Playwright's WebKit here).

## 9. Verdict

**GO conditional on the manual acceptance test** ([RECETTE_HUMAINE_MONTAGE_LIBRE_3D.md](RECETTE_HUMAINE_MONTAGE_LIBRE_3D.md)), centered on the four problems. Merging remains subject to your explicit GO.

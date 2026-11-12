# True free building — report

**Date:** 2026-11-06. Branch `feat/true-free-building`, worktree `brick-build-worktrees/true-free-building`, base `origin/main` = `5272811626789264cc10e7d759944e832bb1ff6b` (UX batch merged, PR #6).
**Machine:** Mac Apple M2 Pro, macOS 26.6.2, Node 24.5.0, Chromium and WebKit (Playwright 1.64.1).
Architecture: [MONTAGE_LIBRE_ARCHITECTURE.md](MONTAGE_LIBRE_ARCHITECTURE.md) · manual acceptance test: [RECETTE_HUMAINE_MONTAGE_LIBRE.md](RECETTE_HUMAINE_MONTAGE_LIBRE.md) · origin: [LIMITATION_MONTAGE_LIBRE.md](LIMITATION_MONTAGE_LIBRE.md).

> Owner's criterion: in free building, pick a brick and place it wherever he wants, even if it is not its place in the official LEGO model. No snap-fit physics; no P9.

## 1. What changes

| Before (P0–P8) | Now |
|---|---|
| Free building = free order; a part is accepted only within 10 LDU / 10° of a model target ("Trop loin…" (Too far…)) | A stock part is **placed where you point**, at its actual pose, with no mandatory comparison against the model. Refusal only without stock. |
| A placed part can only be undone (the last one) | **Click on a placed part**: pick it back up → move, rotate (R / O), place again; Esc leaves it in place; Del puts it back in the stock. |
| Height and position dictated by the model's targets | It rests on the aimed surface (top of the body, studs ignored, aligned on the aimed part), half-stud grid and plate levels (G to remove them); **optional magnet** onto the model's slot within 9.5 LDU (< one grid step). |
| Save: occurrence identifiers | In addition, in free building: each free part with its **actual pose** (schema v3, only if there are any). |
| "Bravo, modèle terminé !" (Well done, model finished!) when everything is placed | Free building, stock exhausted: "Toutes les pièces du set sont posées (N/N). Montage libre : ta construction n'est pas comparée au modèle officiel — K pièce(s) à leur place dans le modèle." (All the set's parts are placed (N/N). Free building: your build is not compared to the official model — K part(s) in their place in the model.) Collection: "Terminé" (Finished) only if all parts are in their place. |
| Changing mode keeps the parts | Free → guided / synchronized: parts in their place in the model become model parts; if some remain outside the model, **explicit confirmation** ("Retirer et changer de mode" (Remove and change mode) / "Rester en montage libre" (Stay in free building)). |

**Unchanged**: guided and synchronized modes (`tryPlace`, `resolveHover`, steps, messages), LDraw parser, mappings, catalog, imports. A game without free parts is saved in v2 **byte for byte** as before. No migration.

## 2. Save compatibility

| Save | Restored |
|---|---|
| P5 (v1), P6–P8 (v2) guided / synchronized | identically (same rules) |
| Old free game (identifiers only) | parts at their **historical positions** (the targets where they were placed), no free position invented; a part leaves them only if the player picks it back up (it then becomes free) |
| v3 (free parts) | exact poses; validated in the browser and on the server (free mode only, stock never exceeded, unique identifiers, rigid and bounded pose), otherwise rejected and kept as is |
| Library | free parts count in the game signature (conflict between tabs never resolved silently) and in the browser ↔ library comparison |

Limit: the current version of `main` cannot resume a v3 game (it keeps it, without modifying it). Hence the prior backup and the rollback procedure in the manual acceptance test.

## 3. Tests

- **Unit** — `free-building.test.ts` (21): distant placement accepted in free mode and refused in guided mode; quantities and colors; identical bricks; move, rotation, removal, undo after reload; non-rigid pose refused; "in its place" recognition (guided tolerances, symmetries, never twice); explicit free → guided switch; collection status; v2 unchanged without free parts, v3 round trip, old free games restored at their positions, rejection of untrusted data (12 cases); browser ↔ library comparison; hover: ground, top of a part (stud grazed), magnet and grid. `library-store.test.ts` (+2): poses re-read by a **new store** (server restart), counts, status, incompatible v3 refused without writing anything; everything in place → "Terminé".
- **E2E fixtures** — `free-building.spec.ts` (6): place / pick up / move / rotate / remove / Esc / Undo / ⌘Z; identical parts, quantities, end message, reload; explicit mode change and strict guided mode; library (poses recorded in v3, reload, collection "En cours" when stock is exhausted); old free v2 game restored then part moved; **WebKit**.
- **Modified** (old rule "refusal far from a target in free building"): `surface-placement.spec.ts`, 2 tests rewritten — the new rule in free mode **and** the same refusal in guided mode. `scripted-player.ts` (P5 player): in free mode, it checks that the placement is indeed on the aimed slot, otherwise it undoes and starts over (otherwise a placement next to it would have been counted as successful).
- **Real acceptance test** `tests/recette/libre-reel.spec.ts` (opt-in, `playwright.recette-libre.config.ts`, isolated folder, owner's files **copied** read-only): § 4.

## 4. Real acceptance test 31009 and 31039 (isolated folder, server restarted between the two games)

| | 31009 Small Cottage | 31039 Blue Power Jet |
|---|---|---|
| Occurrences / part-color pairs | 270 / 92 | 609 / 165 |
| Opening the build (geometry) | 4.1 s | 6.3 s |
| 6 different parts placed on the ground around the model: distance to their closest slot | 93 to 320 LDU | 311 to 671 LDU |
| 3 identical parts | 3069b dark gray: stock 4 → 1 | 2780 black: stock 9 → 6 |
| Stacking (top of a free part) | tile on tile: y −8 → −16 (8 LDU, one tile) | 2780 on 2780: 7.8 LDU higher (Technic part, outside the "origin at the top" convention: approximate) |
| Moved + rotated | yes (≈ 530 LDU, rotation changed) | yes (≈ 1,000 LDU, rotation changed) |
| Removed then ⌘Z | yes | yes |
| 3D view at rest / while rotating the camera | 60 fps, worst frame 17 ms / 60 fps, 17 ms, 0 frames > 50 ms | same |
| Saved | v3, 10 free parts | v3, 10 free parts |
| **After server restart** | 10/270, same 10 poses (identical SHA-256 fingerprint), message "dont 10 posée(s) librement" (including 10 placed freely) | 10/609, same |
| Undo after reload | 10 → 9 | 10 → 9 |
| Switch to guided | confirmation "10 pièce(s) posée(s) hors du modèle officiel…" (10 part(s) placed outside the official model…); after "Retirer et changer de mode": 0/270, distant placement refused "Trop loin de l'emplacement le plus proche (267 LDU)" (Too far from the nearest slot (267 LDU)) | no steps in the OMR file: free building only |

Measurements and screenshots: `~/Documents/brick-lab-data/proofs/libre/` (`recette-libre.json`, `libre-*-partie1.png`, `libre-*-apres-redemarrage.png`). Your real library was never opened by these trials.

## 5. Validation output

Defects found by the tests during the batch and fixed: magnet at 6 LDU too strict (ray grazing a stud at 7 LDU, P5 suite) → 9.5 LDU; stacking offset by half a stud when the pointer grazes a stud → position taken on the top of the body.

On the final code (`npm run check:spec && npm run typecheck && npx vitest run`, then **two** complete Playwright runs, then `npm run build`), 2026-11-06:

```
check:spec   15 OK, 2 DÉCLARÉ (écarts antérieurs inchangés), 0 écart nouveau
typecheck    tsc --noEmit : 0 erreur
vitest       Test Files 14 passed (14) — Tests 259 passed (259)   [236 avant + 21 free-building + 2 library-store]
playwright   passage 1 : 63 passed (14.9m), 0 ignoré, 0 échec
             passage 2 : 63 passed (14.7m), 0 ignoré, 0 échec
  free-building.spec.ts           6/6   (nouveau, dont WebKit)
  surface-placement.spec.ts       6/6   (P5 ; 2 tests réécrits pour la nouvelle règle + refus en guidé)
  add-set 4/4 · atelier-ux 7/7 · atelier-ux-omr 3/3 · brick-lab 6/6 · instructions-sync 4/4 ·
  instructions-sync-omr 2/2 (31040 réel, synchronisé jusqu'au bout) · library 11/11 · library-webkit 1/1 ·
  library-omr 3/3 · omr-validation 10/10 (31040 + 31009 réels, joueur scripté)   — inchangés
recette réelle libre-reel.spec.ts : partie 1 1/1, redémarrage du serveur, partie 2 1/1
npm run build   OK (production, 0 avertissement)
```

## 6. Limits

- **No physics**: no collision, no stud snap-fit; two parts can interpenetrate.
- **Stacking** is reliable for parts that follow the LDraw convention "origin at the top of the body" (bricks, plates, tiles); approximate for axles, Technic connectors and upside-down parts. An aimed side face places the part at the plate level below the aimed point.
- **Orientations**: those the model uses for the part (O) and quarter turns (R); no free rotation with the mouse.
- **Undo**: the action history lives in the page; after a reload, "Annuler" (Undo) removes the last placed part.
- **"In its place" recognition on the server side** (collection status) without the parts' symmetries: may undercount, never overcount. The workshop, for its part, uses them.
- **v3 format** not readable by the current version of `main` (kept, not resumed): back up before the acceptance test.
- **Real Safari** and **trackpad**: not tested by Claude (Playwright's WebKit and scripted mouse) → manual acceptance test.

## 7. Verdict

**After the owner's manual acceptance test (2026-11-06): NO-GO**, two limitations (free height, groups), fixed on the same branch: [MONTAGE_LIBRE_CORRECTIONS.md](MONTAGE_LIBRE_CORRECTIONS.md) (cause, fixes, tests, real acceptance test, save compatibility), targeted acceptance test [RECETTE_HUMAINE_MONTAGE_LIBRE_CORRECTIONS.md](RECETTE_HUMAINE_MONTAGE_LIBRE_CORRECTIONS.md).

Verdict of the first version, before that acceptance test:

**GO conditional on the manual acceptance test** ([RECETTE_HUMAINE_MONTAGE_LIBRE.md](RECETTE_HUMAINE_MONTAGE_LIBRE.md)), in particular placement comfort with the mouse and trackpad, and the Safari app.

Demonstrated: in free building, a stock part is placed where you point, far from its official place (up to 671 LDU on 31039), picked back up, moved, rotated and removed; the set's quantities and colors respected, identical parts distinct; actual poses saved and restored after reload and **server restart**; old games restored unchanged; switch to guided explicit; guided and synchronized modes unchanged (P5–P8 suites replayed, same placement refused in guided mode). Merging remains subject to your explicit GO.

# Manual acceptance test — true free building (Chrome then Safari)

> Owner's main criterion: **in free building, pick a brick and place it wherever I want, even if it is not its place in the official LEGO model.**
> The automated tests drive the mouse by script; the trackpad, the Safari app and the judgment "it is pleasant to build with" remain human. Architecture: [MONTAGE_LIBRE_ARCHITECTURE.md](MONTAGE_LIBRE_ARCHITECTURE.md) · report: [MONTAGE_LIBRE_RAPPORT.md](MONTAGE_LIBRE_RAPPORT.md).

Estimated duration: 30–35 min (Chrome 25, Safari 10).

## 0. Before starting (prepared by Claude at your request)

- Production server from the `true-free-building` worktree, http://127.0.0.1:3000 (listening on 127.0.0.1 only), previous server stopped.
- **Verified backup** of `library` and `mappings` (archive extracted separately and compared file by file), and SHA-256 inventory of your data.
- **Save format**: a game that contains freely placed parts is saved in **v3 format**. As long as the PR is not merged, the current version of `main` cannot resume a v3 game (it keeps it without modifying it). If you do not merge: "Annuler" (Undo) until no freely placed part remains (the game returns to v2 format by itself), or I restore the backup at your request. Guided, synchronized and free-part-less games stay in v2, unchanged.
- Expected starting state: 31040 synchronized instructions 25/65 page 6; 31009 never started; 31039 free building 0/609 page 4.

Open http://127.0.0.1:3000 in **Chrome**, preferably on the MacBook screen (trackpad).

## 1. Place wherever I want — 31039 (free building, 609 parts)

1. "Ma collection" (My collection) → 31039 → **Reprendre** (Resume): free building, 0/609, page 4. The scene is empty (nothing is placed).
2. Take a brick from the tray, point **far from the plane** (anywhere on the grid), click: it is placed there. Message "Pièce posée librement (1/609)" (Part placed freely (1/609)). At the top: "1 posée(s) librement · 0 à leur place dans le modèle" (1 placed freely · 0 in their place in the model).
3. Place 4 or 5 different parts, at places of your choice; **stack** a brick on another (point at the top of the one below): it is placed on top, aligned on its studs.
4. **Identical parts**: take a part whose quantity is ×3 or more, place 3 of them: the quantity drops by 3; at 0, it disappears from the tray. The colors are those of the set.
5. **R**: quarter turn; **O**: other orientation (when the model uses several). **G** or "Grille" (Grid) checkbox: without the grid, the part follows the pointer to the nearest LDU.

## 2. Pick a placed part back up — move, rotate, remove

1. With no part in hand, **click on a placed part**: "Pièce reprise" (Part picked up). Move the mouse, **R** to rotate it, click: it is placed again elsewhere ("Pièce déplacée librement" (Part moved freely)).
2. Pick it up again, **Esc**: it stays where it was.
3. Pick it up again, **Del** (or "Remettre dans le stock" (Put back in stock) button): it goes back to the tray.
4. **Annuler** / **⌘Z**: undoes the last action (placement, move, removal).

## 3. Magnets

1. Check "Montrer les emplacements" (Show slots): the model's slots for the held part appear. Point at one: "à sa place dans le modèle, clic pour poser" (in its place in the model, click to place). Click: the part is counted "à sa place dans le modèle".
2. Place the same part **half a stud** from its slot: it is possible (the magnet only applies very close). Uncheck "Aimant modèle" (Model magnet): no more snapping onto the model.

## 4. Instructions and resume

1. **Notice PDF** (PDF instructions) tab while you build: the instructions can be freely viewed (pages, zoom), the build is not blocked.
2. **⌘R**: the same build comes back, parts at the same places and orientations; message "Progression restaurée : N/609 pièces posées, dont N posée(s) librement" (Progress restored: N/609 parts placed, including N placed freely).
3. **Server restart**: in the server's terminal tab, Ctrl-C then `npm run start` (or ask me), reload: identical. After reload, "Annuler" removes the last placed part.

## 5. Change mode — 31009 (never started)

1. 31009 → **Construire** (Build) → **Montage libre (avec notice)** (Free building (with instructions)); place a part far from the house.
2. **Mode** menu → "Guidé" (Guided): a confirmation explains that the part placed outside the model will be put back in the stock; **"Rester en montage libre"** (Stay in free building): nothing changes.
3. Mode → "Guidé" → **"Retirer et changer de mode"** (Remove and change mode): guided mode, step 1, the part is back in the stock. Try to place a part of the step far from its place: **refused** ("Trop loin…" (Too far…)), as before.
4. (Optional) "Abandonner" (Abandon) to leave 31009 "never started" (the game goes into the library history).

## 6. Nothing has changed elsewhere — 31040 (synchronized instructions)

1. 31040 → **Reprendre**: synchronized instructions, 25/65, page 6, as before.
2. Click on an already placed brick: nothing happens (a part is only picked back up in free building). A part placed far from its place is refused. Do not place anything, or "Annuler" what you place.

## 7. Smoothness, trackpad, Safari

1. On 31039 with your placed parts: rotate (drag) and zoom (two fingers) the view; it stays smooth. With the trackpad: a "pressed" click that slips a little still places; a drag rotates the view without placing.
2. Open http://127.0.0.1:3000 in **Safari**: redo **1.2, 1.3, 2.1, 2.3 and 4.2**.

## 8. End of stock (information)

With 609 parts, the end of stock is not practical to reach by hand; it is verified on fixtures: "Toutes les pièces du set sont posées (N/N). Montage libre : ta construction n'est pas comparée au modèle officiel — K pièce(s) à leur place dans le modèle." (All the set's parts are placed (N/N). Free building: your build is not compared to the official model — K part(s) in their place in the model.); in the collection, the set stays "En cours" (In progress) as long as not all parts are in their place.

## 9. Results (to be filled in by the owner)

| Item | Chrome | Safari | Remarks |
|---|---|---|---|
| 1. Place wherever I want, stack, identical parts, quantities and colors | | | |
| 2. Pick up: move, rotate, remove, undo | | | |
| 3. Magnets (model, grid) | | — | |
| 4. Free instructions, reload, server restart | | | |
| 5. Explicit mode change, guided still strict | | — | |
| 6. Synchronized 31040 unchanged | | — | |
| 7. Smoothness, trackpad | | | |

Tell me what you leave placed: I will compare your data with the pre-test inventory and tell you exactly what changed.

## 10. Result of the owner's acceptance test (2026-11-06)

**NO-GO** to merge PR #7 as is, two limitations reported (two announced screenshots, not received by Claude):

1. Impossible to lower a long gray part enough to fit it above an orange and green assembly (part 30157 of the 31039 build).
2. Impossible to move several bricks together.

Data after this test (compared to the 22:08 inventory): only the 31039 build changed — 12 freely placed parts (v3 format, revision 25), replaced versions kept in its history; 31040 (25/65) and 31009 unchanged. Corrections and targeted acceptance test: [MONTAGE_LIBRE_CORRECTIONS.md](MONTAGE_LIBRE_CORRECTIONS.md), [RECETTE_HUMAINE_MONTAGE_LIBRE_CORRECTIONS.md](RECETTE_HUMAINE_MONTAGE_LIBRE_CORRECTIONS.md).

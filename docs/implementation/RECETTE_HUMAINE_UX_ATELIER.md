# Manual acceptance test — workshop: resizable panels and part thumbnails (Chrome then Safari)

> The automated tests drive the mouse by script and Playwright's WebKit is not the Safari application. This batch changes neither the collection format, nor the progress, nor the mappings; only the chosen width is remembered, in the browser. Placing a part during the acceptance test saves the progress as usual ("Annuler" (Undo) removes it).

Estimated duration: 30 min (Chrome 20, Safari 10). Report: [UX_ATELIER_RAPPORT.md](UX_ATELIER_RAPPORT.md).

## 0. Preparation (done by Claude, 2026-11-06)

| Check | Result |
|---|---|
| Previous server | No server on 3000 / 3100 / 3200 / 3300, no `next` process |
| Head of PR #6 | `a645b9d` (section 6), identical locally, on `origin` and in the PR before launch |
| Data before the acceptance test | 61 files of `library/`, `models/`, `instructions/`, `mappings/` **identical** to the P8 closure inventory (19:19) |
| Verified backup | `backups-p8/library-2026-11-06T20-47-30-avant-recette-ux.tar.gz` (`library` + `mappings`, 23.3 MB, SHA-256 `6fdff829…5ab4f4`); extracted separately and compared: 39/39 files identical, none extra or missing. Manifest: `backups-p8/donnees-2026-11-06T20-47-30.sha256` |
| Acceptance test server | production (`npm run build` then `npm run start`), UX worktree, http://127.0.0.1:3000 |

**Starting state, to be found again at point 7** (index revision 3):

| Set | Mode | Progress | Instruction page | Revision |
|---|---|---|---|---|
| 31040-1 Desert Racers | synchronized instructions | 25 / 65 | 6 | 37 |
| 31009-1 Small Cottage | never started | — | — | — |
| 31039-1 Blue Power Jet | free building | 0 / 609 | 4 | 4 |

Opening 31009 in free building creates its first progress save (0 parts): this is expected.

## Flow (Chrome first, on the MacBook screen if possible)

Open http://127.0.0.1:3000 in **Chrome**. Note OK / KO and a free remark in the table of section 5.

### 1. Resizable panels — 31040

1. Ma collection (My collection) → 31040 → **Reprendre** (Resume): synchronized instructions, 25/65, page 6, as before. A vertical line with a handle separates the 3D view and the instructions.
2. Drag the line to the **left**, then to the **right** (mouse then trackpad): the instructions widen/narrow live, the page follows, then becomes sharp again. All the way left / all the way right: it stops (3D view ≥ ~320 px, instructions ≥ ~280 px).
3. Click the line, then ← / → (Shift = faster), Home / End: it moves with the keyboard, visible blue outline.
4. **⌘R**: the chosen width is kept. **Double-click** on the line: back to the original proportions.
5. Widen the instructions, then **place 2 parts**: the part follows the pointer exactly and is placed in the right spot. Resize again, place 1 part. Then **Annuler ×3** to return to 25/65 (optional).
6. **Correspondances** (Mappings) tab: the editor has its own width (wider); changing it does not change the workshop's.

### 2. Instructions: automatic width and manual zoom — 31040 then 31009

1. On 31040, the zoom shows **"Largeur"** (Width): whole page, no horizontal scrollbar, whatever the panel width.
2. **+** then **−**: fixed zoom in percent. Widen the panel at fixed zoom: the page keeps its zoom. **↔**: back to "Largeur", the page follows the panel again.
3. "← Ma collection" → 31009 → **Construire** (Build) → **Montage libre (avec notice)** (Free building (with instructions)) → Notice PDF tab: the instructions also open in "Largeur" (before the batch they overflowed by 196 px in free building).

### 3. Thumbnails — 31009 (free building)

1. Bottom bar: each part shows its **shape** in its **color**, with ×N; the reference is small. The 92 thumbnails appear in about a second (measured: ~950 ms on this Mac).
2. Compare with the open instruction page: do you recognize the parts by shape and color, without looking for the number?
3. Hover a part: tooltip reference · color · remaining/total.
4. Click a part: outlined in blue, "en main" (in hand); place it: its quantity drops. **Annuler** removes it.
5. Scroll the list: Annuler, Mode, Centrer… stay visible.

### 4. Free building of 31039 (609 parts) — real usability

1. "← Ma collection" → 31039 → **Reprendre**: free building, 0/609, page 4.
2. About **180 part/color pairs** (estimate from the file, ~2× 31009; **not measured**: count about 2 s for all the thumbnails).
3. With page 4 of the instructions next to it: find 3 or 4 parts of the step in the bar, by shape and color. How long does it take? Is the scrolling (2 rows visible at 1280×800) bearable?
4. Place 1 or 2, then **Annuler** to return to 0/609.
5. Personal verdict: usable as is / usable but to be improved (specify: thumbnail size, bar height, sorting, filter by step…) / unusable.

### 5. 3D view smoothness after resizing — 31039

1. While the thumbnails appear, rotate and zoom the model: the view stays smooth.
2. Move the divider 3 or 4 times, resize Chrome's window (smaller, larger, full screen): the 3D view stays sharp and smooth, without distortion, nothing overflows; a part held in hand still follows the pointer.

### 6. Safari

Open http://127.0.0.1:3000 in **Safari**:

1. 31040 → Reprendre: same progress; default width (the preference is specific to each browser).
2. Redo **1.2, 1.4, 1.5** (drag, ⌘R, place), **2.1–2.2** (Largeur, zoom), **3.1** (31009 thumbnails) and **5.1** (smoothness).

### 7. No regression of progress and instructions

Close the workshop, go back to "Ma collection", then reopen each set:

1. 31040: 25/65 (or the count you left), synchronized instructions on the right page.
2. 31039: 0/609 (if you undid), free building, page 4.
3. 31009: free building, parts you left.
4. Tell me what you left placed: I will then compare the files with the 20:47 manifest and tell you exactly what changed (expected: only the progress and pages you touched).

## 5. Results (declared by the owner, 2026-11-06)

Acceptance test carried out by the owner in Chrome and Safari, on the production server prepared above (head `a645b9d`). Results as reported, by theme (no per-browser detail or numeric measurement provided):

| Flow point | Declared result |
|---|---|
| 1. Panel resizing | **OK** |
| 2. PDF instructions (automatic width, manual zoom) | **OK** |
| 3. 31009 thumbnails | **OK** |
| 4. Free building 31039 — thumbnails | **OK** |
| 5. Placement and 3D smoothness | **OK** |
| 6. Chrome and Safari | **OK** |
| 7. Saves and progress | **OK** |

**Finding on the data after the acceptance test** (comparison with the 20:47 manifest, without further interpretation): a single new file, `library/builds/b-mw5ag1wk-43084e0c/thumbnail-81b99485f4adb7c5.png` (preview of build 31039, written when it was opened in the workshop); all other files identical. Index revision 3; 31040 synchronized 25/65, page 6, revision 37; 31039 free 0/609, page 4, revision 4; 31009 without progress. No placement was therefore saved in the library during the acceptance test (placement trials may have been done then undone outside the library, or in the standalone workshop): point 7 is corroborated (nothing lost or modified), the placement at point 5 rests on the owner's declaration and on the automated tests (sections 3–5 of the report).

**Limitation flagged during the acceptance test, out of scope of the batch**: in free building, a part can only be placed at a position of the LDraw model. Engine behavior earlier than this batch, documented in [LIMITATION_MONTAGE_LIBRE.md](LIMITATION_MONTAGE_LIBRE.md); non-blocking for the UX fixes.

In case of trouble: I can restore the 20:47 backup at your request (server stopped). To get back the original widths: double-click on the divider.

## 6. Tested head

Branch `fix/atelier-resizable-panels-part-previews`, head `a645b9d2a9e544b7d1e15f3d0d46e46bbee9a0e3` (code identical to `9e9c769`, validated by the full suite; only this document differs). Server `npm run build && npm run start`, http://127.0.0.1:3000, listening on 127.0.0.1 only.

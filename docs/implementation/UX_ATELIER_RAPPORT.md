# Workshop — resizable panels, fitted instructions, part thumbnails: report

**Date:** 2026-11-06. Branch `fix/atelier-resizable-panels-part-previews`, worktree `brick-build-worktrees/ux-resizable-panels`, base `origin/main` = `727ba1c67b438cf3c30d54421bcf38510c74cbb1` (P8 merged).
**Machine:** Mac Apple M2 Pro, macOS 26.6.2, Node 24.5.0, Chromium and WebKit (Playwright 1.64.1).
Manual acceptance test: [RECETTE_HUMAINE_UX_ATELIER.md](RECETTE_HUMAINE_UX_ATELIER.md).

> Targeted UX batch, requested after the P8 manual acceptance test. Unchanged: placement rules, LDraw parser, mappings, saved progress, catalog and imports, personal data. No P9.

## 1. Problems found and fixes

| Finding (P8 acceptance test) | Measurement before | Fix |
|---|---|---|
| 3D view and side panel with fixed proportions (400 px, 520 px in the editor) | — | Draggable **divider** (mouse, trackpad, stylus), keyboard accessible (← → 16 px, Shift 80 px, Home / End, Enter = default), double-click = default proportions. Width remembered **per context** (workshop, mappings editor), as a proportion of the window, in the browser's `localStorage` (local preference, never in the library). Minimums: panel 280 px, 3D view 320 px; on a small window the 3D view keeps priority. |
| In free building, the instructions open at 100% and overflow | **196 px** of horizontal scrolling on 31009, **230 px** on the test instructions (1280×800) | Instructions **fitted to width by default in all modes**; `ResizeObserver` on the page area: the page follows the panel immediately (CSS) then is redrawn sharp 120 ms after the end of the movement; a cancelled PDF render finishes before the next one starts (no concurrent render on the same canvas); stable scroll gutter. Manual zoom unchanged (+ / −, ↔ to return). **0 px** of overflow after. |
| Parts identified by their LDraw reference (`3069b`, "couleur 72" (color 72)) | — | **Isometric thumbnail** of each part/color pair, drawn from the **same LDraw template** as the 3D view (`trayKey` key, shared geometry and materials), same color pipeline (sRGB, ACES). Quantity ×N, small reference, tooltip "reference · LDConfig color name (code) · remaining/total", held part outlined and marked "en main" (in hand). Explicit fallback "forme indisponible" (shape unavailable) (color swatch) if rendering is impossible. Outlines hidden on large parts (a green 16×16 plate looked black). |
| — (found during the batch) | With 92 parts, the actions (Annuler (Undo), Mode, Centrer (Center)…) scrolled along with the list | The parts scroll in the bar, the actions stay visible; the bar keeps a **fixed height** (P5 constraint: a variable-height bar desynchronized the 3D pointer). |

**Three.js / raycasting**: the canvas follows its container via React Three Fiber's `ResizeObserver` (no delay); the divider only changes the column width. Verified by **pointer** placements after dragging, keyboard and window resizing (`sizeInSync`, exact placements).

**Performance**: a single WebGL rendering engine for all thumbnails (never one context per thumbnail), one image per template in cache (no new render on reopening), progressive rendering during the browser's idle time (slices of 8 ms at most), after the instructions, the resume and the 3D view.

## 2. Before / after screenshots

Original fixtures (in the repository): [before 1280×800](preuves/ux/avant-1280x800.png) · [after 1280×800](preuves/ux/apres-1280x800.png) · [before 1512×945](preuves/ux/avant-1512x945.png) · [after 1512×945](preuves/ux/apres-1512x945.png).
Real sets (outside the repository, the instructions are LEGO content): `~/Documents/brick-lab-data/proofs/ux/` — `avant-31009-*.png`, `apres-31009-*.png`, `apres-31009-1-notice-elargie.png`, `apres-31040-1-*.png`, measurements `mesures-ux.json`. Reproducible script: `npx tsx scripts/ux-captures.ts <url> <dossier> <libellé> [modèle] [notice]`.

## 3. Measurements (real sets, real GPU, 1280×800 window, `atelier-ux-omr.spec.ts`, final code, two passes of the full suite)

| | 31040 | 31009 |
|---|---|---|
| Part/color pairs (thumbnails) | 30 | **92** |
| First thumbnail | 133 – 146 ms | 143 – 157 ms |
| All thumbnails (rendered in browser idle time) | 241 – 334 ms | **946 – 950 ms** |
| Rendering one thumbnail: mean / maximum | 2.5 – 3.6 / 16 – 18 ms | 2.0 – 2.6 / 13 – 14 ms |
| 3D view without thumbnails | 60 fps, worst frame 17 ms | 60 fps, worst frame 17 ms |
| 3D view **during** thumbnail rendering | 60 fps, worst frame 17 ms, 0 frames > 50 ms | 60 fps, worst frame 17 ms, 0 frames > 50 ms |
| Widened instructions (+280 px): gap / overflow | 0 / 0 px | 0 / 0 px |
| Parts placed by pointer after 4 resizes | 8/8 (guided), 0 refusals, 0 keyboard fallbacks | 8/8 (guided), 0 refusals, 0 keyboard fallbacks |

Before the fix in section 5 (immediate rendering), 31009 drew its 92 thumbnails in 514 ms; moving to idle time doubles this total delay, the first thumbnail staying at ~150 ms and the 3D view at 60 fps.

## 4. Tests

- **unit** `atelier-ux.test.ts` (14): default widths, bounds on MacBook screens and narrow windows, proportion that follows the window, keyboard (arrows, Shift, Home/End, Enter, workshop shortcuts not intercepted), untrusted local preference (invalid JSON, out-of-bounds values, `__proto__`), isometric framing of thumbnails (brick, 16×16 plate, round 1×1, antenna).
- **E2E** `atelier-ux.spec.ts` (7, original fixtures): mouse, keyboard, memorization after reload, double-click, windows 1280×800 / 1440×900 / 1024×700 / 800×600 without overflow; instructions fitted and redrawn after resizing; zoom + / − / ↔; **pointer placements after several resizes** (guided then free); synchronized mode and editor (width per context, rotated page still fitted); thumbnails: 6 pairs including one part in two colors and two parts of the same color, **mean color of each thumbnail closer to its LDConfig color than to any other**, distinct images, quantities, tooltip, selection, single render (cache); "forme indisponible" fallback; **WebKit** (Safari's engine): divider, fitted instructions, thumbnails, placement.
- **Real E2E** `atelier-ux-omr.spec.ts` (3, skipped without the files): section 3.
- Modified: `brick-lab.spec.ts` (P0–P4), zoom check: the instructions now start in "Largeur" (Width); + goes to a fixed zoom above the fitted scale, ↔ returns.

## 5. Validation output

**Defect found by the full suite and fixed.** First full run: 2 intermittent failures (and 8 `library.spec` tests skipped because they depend on each other in series) — `instructions-sync-omr` (real 31040): an instruction page read late right after the reload at 30 parts; `library.spec` "two tabs": booklet not yet open in a tab after 5 s. Both specs passed alone (2 × 13/13). Retained cause: the thumbnail rendering, launched immediately, competed with the opening of the instructions and the resume on the test machines (software WebGL). Fix: rendering during the browser's idle time (`requestIdleCallback`, spaced slices as a fallback for Safari). The P6/P7 tests were not modified.

On the final code (`npm run check:spec && npm run typecheck && npx vitest run`, then **two** full Playwright runs, then `npm run build`), 2026-11-06:

```
check:spec   15 OK, 2 DÉCLARÉ (écarts P5 inchangés), 0 écart nouveau
typecheck    tsc --noEmit : 0 erreur
vitest       Test Files 13 passed (13) — Tests 236 passed (236)   [222 avant + 14 UX]
playwright   passage 1 : 57 passed (16.1m), 0 ignoré, 0 échec
             passage 2 : 57 passed (15.8m), 0 ignoré, 0 échec
  add-set.spec.ts                 4/4   (P8)
  atelier-ux.spec.ts              7/7   (UX, fixtures, dont WebKit)
  atelier-ux-omr.spec.ts          3/3   (UX, 31040 + 31009 réels)
  brick-lab.spec.ts               6/6   (P0–P4 ; contrôle du zoom adapté)
  instructions-sync.spec.ts       4/4   (P6)
  instructions-sync-omr.spec.ts   2/2   (P6, 31040 réel, mode synchronisé jusqu'au bout)
  library.spec.ts                11/11  (P7)
  library-webkit.spec.ts          1/1   (P7)
  library-omr.spec.ts             3/3   (P7, 31040 + 31009 réels)
  omr-validation.spec.ts         10/10  (P5, 31040 + 31009 réels)
  surface-placement.spec.ts       6/6   (P5)
npm run build   OK (production, 0 avertissement)
```

Not run: `npm run perf` (batch measurements done by `atelier-ux-omr.spec.ts`, section 3).

## 6. Limitations

- **Real Safari** not tested by Claude (Playwright's WebKit only) → manual acceptance test section 4.
- **Per-browser preference**: the width chosen in Chrome does not apply to Safari (browser local storage, deliberately outside the library).
- **Thumbnails**: single isometric view (no rotation); outlines hidden beyond a radius of 90 LDU; rendered in page memory (≈ 5 to 10 KB per thumbnail), redone each time the workshop is opened.
- **During dragging**, the instruction page is scaled by the browser (slightly blurry) until the sharp render, 120 ms after the stop.
- **Parts bar**: 2 rows visible at 1280×800; beyond that, scrolling within the bar.
- **Measurements** on an M2 Pro; an older Mac will be slower (rendering remains cut into 8 ms slices during idle time).

## 7. Verdict

**Manual acceptance test completed by the owner on 2026-11-06 (Chrome and Safari): the seven points are declared OK** — detail and findings on the data in [RECETTE_HUMAINE_UX_ATELIER.md](RECETTE_HUMAINE_UX_ATELIER.md) section 5. **Explicit GO to merge PR #6 given by the owner.**

Demonstrated: the instructions can be widened or narrowed with the mouse, trackpad or keyboard, the width is remembered, the page stays whole without horizontal scrolling in the three modes and the editor; placements stay exact after resizing; each part is shown by its real shape and color (same geometry as the 3D view), with its quantity, without slowing down building (60 fps during the rendering of the 92 thumbnails of 31009). No change to the placement rules, the parser, the mappings, the progress, the catalog or the imports; no personal data modified (after the acceptance test, only a preview of build 31039 was added).

Out of scope, flagged during the acceptance test: free building still imposes the positions of the LDraw model — an earlier engine limitation, non-blocking, documented in [LIMITATION_MONTAGE_LIBRE.md](LIMITATION_MONTAGE_LIBRE.md) and handled in a dedicated batch.

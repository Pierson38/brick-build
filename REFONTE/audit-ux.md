# UX audit — Brick Lab Local, before the redesign

Base: `origin/main` = `a1309a4`. References like `[X12]` point to `inventaire-fonctionnalites.md`. Screenshots: `REFONTE/avant/`.

## The app in 5 lines

1. Brick Lab Local rebuilds sets part by part, in 3D and 100% locally, from LDraw files (`.mpd`/`.ldr`) and the user's PDF instructions.
2. The **collection** (`/`) organizes sets and builds with progress and thumbnails; **Ajouter un set** (`/ajouter`) (Add a set) searches for a number locally, then on the OMR on click, or accepts a file drop.
3. Before any import, a **compatibility diagnostic** honestly says which modes are possible (guided, synced instructions, free building) and why.
4. The **workshop** combines a 3D scene, a parts tray, a side panel (model, PDF instructions, page ↔ step mapping editor) and a rich manipulation bar in free building (3-axis rotations, gizmo, snapping, assemblies).
5. Everything is saved (local library or browser), with conflict detection, SHA-256 fingerprint repair and history: nothing is ever silently overwritten.

## Summary

The app is **functionally very rich and rigorous about honesty** (diagnostics, explicit refusals, confirmations on data). Its weaknesses mostly come from the **stacking of batches P5→P8**: each batch added its controls wherever there was room. The result is a flat hierarchy (everything has the same visual weight), controls scattered across four areas of the workshop, shortcuts that can only be discovered through toasts, and a generic "admin form" style (blue-gray, all buttons identical) that does not frame the 3D scene.

Severities: **G1 blocking or risky** (data loss, likely error, critical info missed) · **G2 strong friction** (often slows down, requires hunting) · **G3 annoyance** (inconsistency, polish).

---

## 1. Friction

| # | Severity | Problem | Where | Effect on the user |
|---|---|---|---|---|
| U1 | **G1** | **"Abandonner" (Abandon) erases progress without confirmation in the standalone workshop**: the confirmation exists only in library mode. The button sits next to "Centrer" (Center) and "Annuler" (Cancel/Undo) in the tray bar. | [K10] [K11] `/atelier` | One unlucky click erases the session (localStorage) with no way back. |
| U2 | **G1** | **"Reprendre depuis cette étape" (Resume from this step)** (synced mode) removes the parts of the following steps without confirmation or a clear undo ("Annuler" does not restore the removed parts). | [I6] | Work lost on one click in the instructions banner. |
| U3 | G2 | The free-building **manipulation bar** (`manip-bar`) lines up to **20 controls** on 2–3 rows at the top of the 3D view (status, 2 segmented gizmo controls, 2 selects, 3 fields + "Appliquer" (Apply), "Déplacer" (Move), 6 rotation buttons, "Au stock" (To stock), "Assemblage" (Assembly), "Voir les connexions" (View connections), "Désélectionner" (Deselect)). At 1280 px it wraps to 3 rows and hides the top of the model. | [J2] [J11]–[J21] | Hard to read, the scene loses ~90 px of usable height; the useful action is drowned out. |
| U4 | G2 | The **free-building settings** (Grille (Grid), Aimant pièces (Part magnet), Aimant modèle (Model magnet)) are in the **tray** bar, at the bottom, while the part controls are at the **top** of the 3D view. | [J23] [J25] [J26] | Two areas to watch for a single manipulation. |
| U5 | G2 | **Mode choice** = a "Mode" `<select>` in the middle of the tray bar. To start: 3 stacked buttons in the Model tab, with no explanation of the difference between modes. | [G9]–[G11] [K7] | The guided ↔ free toggle, which is central, is not obvious; the initial choice requires knowing the app. |
| U6 | G2 | **Standalone workshop: resuming a session** = a text list "réimporte le fichier pour reprendre" (re-import the file to resume), not clickable, and import is only possible through the picker (no drag and drop, unlike `/ajouter`). | [N1] [N4] | Resuming requires finding the file in the Finder. |
| U7 | G2 | **Import on one long page** (`/ajouter`): Search, Resources, Selected files, Compatibility, Confirmation stack up and appear as they go; the final button is far below the fold and can move during analysis. | [D1]–[D23] | You don't know where you are or what is left to do. |
| U8 | G2 | **Set detail**: the info column has ~15 sections (files, instructions, mappings, compatibility, diagnostics, danger zone) with no grouping or collapsing; the main action ("Construire" (Build)) is at the top but the danger zone is stuck to the settings. | [C2]–[C20] | Long scrolling, risk of clicking "Retirer" (Remove) while looking for something else (mitigated by the confirmation). |
| U9 | G3 | The **mapping editor** shows 7 inline fields without aligned labels (Livret (Booklet), Page, = page affichée (= displayed page), N° imprimé (Printed no.), Encadré (Boxed), Multiplicateur (Multiplier), Vérifiée (Verified), Note) in a 520 px panel. | [M7] | Slow input, fields get confused. |
| U10 | G3 | **Toasts** never disappear (workshop: until the next message; detail: on click) and sometimes run to 3 lines of instructions. | [F12] [C21] | The toast hides the bottom of the scene and goes stale (outdated instruction displayed). |

## 2. Confused hierarchy

| # | Severity | Problem | Where |
|---|---|---|---|
| U11 | G2 | **All buttons look alike**: same gray border, same size; only color distinguishes "primary" (rare) and "danger" (pink border). In the tray bar, Annuler / Réinitialiser l'étape (Reset the step) / Centrer / Poser à la position cible (Place at target position) / Abandonner carry the same weight. | Everywhere |
| U12 | G2 | The **workshop topbar** mixes navigation, file name, step, instructions step, mode, progress, free-building detail and save state, all in text of the same size, pushed to the right. Progress has no bar (unlike the collection). | [F1]–[F7] |
| U13 | G2 | The **side panel** permanently shows the model diagnostic (useful before starting) during construction, above everything; the info about the part (step, parts of the step) is elsewhere. | [G1]–[G8] |
| U14 | G3 | The **workshop footer** contains the tray **and** 8–12 heterogeneous controls (actions, mode, checkboxes, help) that wrap at 1280 px. | [K1]–[K11] |
| U15 | G3 | On a **collection card**, the file status (3 lines), modes (chips), progress and problems have the same weight as the title. | [B6]–[B10] |

## 3. Hard-to-discover features

| # | Severity | Problem | Where |
|---|---|---|---|
| U16 | **G1** | **No shortcut help.** 21 keyboard shortcuts ([O1]–[O21]) and 12 mouse gestures ([P1]–[P12]) are described only in transient toasts and button `title` attributes. Double-click = assembly, direct drag, ⌥ to ignore the magnet, Q for local axes, G for the grid: nearly impossible to find. | Workshop |
| U17 | G2 | File **drag and drop**: only in the "Import local rapide" (Quick local import) area of `/ajouter`, not on the collection or in the standalone workshop. | [D3] |
| U18 | G2 | The panel **splitter** (8 px, gray handle) is only visible on hover; the double-click to return to the default width is hidden in a `title`. | [F10] |
| U19 | G2 | **Detection of data folder files** is a collapsed yellow link in the middle of the collection; the **workshop without a collection** is a small link in the topbar. | [B14] [B18] |
| U20 | G3 | The **side panel does not collapse**: impossible to give the full width to the 3D view without shrinking it to the minimum (280 px). | [F10] |

## 4. Visual inconsistencies

| # | Severity | Problem |
|---|---|---|
| U21 | G2 | **No design system**: only 8 CSS variables (`--bg`, `--accent`…), 40 distinct colors hardcoded in `globals.css` (`#fef3c7`, `#c7d6fe`, `#86efac`…) plus inline styles in the components, 7 different radii (2, 4, 6, 8, 10, 12, 14 px), ad hoc shadows. |
| U22 | G2 | **No dark theme**, no toggle. 3D scene background `#eef1f5` hardcoded in `BuildCanvas`. |
| U23 | G3 | **Inconsistent labels** for the same action: "Retirer" (Remove) / "Au stock" / "Remettre dans le stock (Suppr)" (Put back in stock (Del)); "Commencer — mode guidé" (Start — guided mode) vs "Montage libre (avec notice)" (Free building (with instructions)) (without "Commencer"); "Construire / Reprendre / Revoir" (Build / Resume / Review) vs "Commencer". |
| U24 | G3 | **Variable status colors**: the warning is sometimes amber text, sometimes an amber background (`.warn`), sometimes a border (`.discovery`); the "Analysable" (Analyzable) and "Affichable" (Displayable) quality levels share the same amber color although one is playable and the other is not. |
| U25 | G3 | **Icons**: Unicode characters (◀ ▶ ▲ ▼ ↔ ✓ ⚠ ✗ ↗) whose rendering varies by font; no icon library. |
| U26 | G3 | Different topbars depending on the page (collection: brand + "Ma collection" (My collection); add: back button + title; detail: text back link; workshop: back button + set link). |

## 5. Missing feedback

| # | Severity | Problem | Where |
|---|---|---|---|
| U27 | G2 | **Loading a heavy model**: text only ("Chargement des géométries LDraw locales…" (Loading local LDraw geometries…), "Vérification des fichiers…" (Checking files…)) with no activity indicator or progress; on a 600-part set it lasts several seconds and looks like a freeze. | [N3] [E1] [Q5] [Q6] |
| U28 | G2 | **Collection**: no loading state (blank page until the response); a raw "Chargement…" (Loading…) for each route. | [Q1] [Q2] |
| U29 | G2 | **Part snapped / rejected**: the main feedback is a line of text in `held-info` or a toast; no strong visual feedback (pulse, color) at placement time. The green connection dots exist but are small. | [J23] [H4] |
| U30 | G3 | **Saving in standalone mode**: static "Sauvegardé localement" (Saved locally), never updated (no "saving…" state or visible error except for the mappings). | [F7] |
| U31 | G3 | **Actions without confirmation but reversible** (Au stock, Delete an instructions step, Reset the step) offer no "Annuler" in the toast. | [J18] [M8] [H9] |

## 6. Accessibility

| # | Severity | Problem |
|---|---|---|
| U32 | G2 | **Visible focus**: no global `:focus-visible` style (only the splitter has one); buttons and links rely on the browser default outline, uneven between Chromium and WebKit. |
| U33 | G2 | **Contrast**: `--muted #667085` on `#f6f7f9` ≈ 4.6:1 (AA limit at 13 px); amber text `#92400e` on `#fef3c7` OK, but `.small` text at 9–11 px (part reference, "forme indisponible" (shape unavailable)) is below readable sizes; disabled buttons at 45% opacity are unreadable. |
| U34 | G2 | Panel **tabs**: `role=tab` without `aria-controls`, panels without `role=tabpanel`, no ←/→ navigation; collection **filters** as `role=radio` without arrow key handling. |
| U35 | G2 | **English/technical labels** in `aria-label` ("c14", "LDU") and many buttons without an explicit name outside their context ("◀", "−", "−1", "+1"). Some have one (`aria-label="Page précédente"`), others do not (instructions step ◀ ▶ in `SyncStepBanner`). |
| U36 | G3 | Toasts (`role=status`) announce very long instructions on every part pick-up; placement errors are in the same `role=status` (not `alert`). |
| U37 | G3 | No handling of `prefers-reduced-motion` (few animations today: future risk) nor of `prefers-color-scheme`. |
| U38 | G3 | Keyboard navigation outside the canvas is possible but long: no skip link, tab order topbar → 3D view (nothing) → splitter → tabs → panel → tray (up to 50 tiles) → actions. |

---

## 7. Findings confirmed by the screenshots (`REFONTE/avant/`)

| # | Severity | Problem | Screenshot |
|---|---|---|---|
| U39 | **G1** | **LDraw library missing**: the 3D area shows the home screen ("Brick Lab Local", "Importer un modèle" (Import a model)) while a model is loaded, with the error in red below; the panel says "Analysable" and "Visualisation seulement tant que des pièces manquent" (Viewing only while parts are missing), which suggests the file is at fault. Nothing says what to do (`.env.local`, `npm run check:ldraw`). | 28, 30 |
| U40 | G2 | At **1024 px**, the workshop topbar wraps to two rows ("← Ma / collection", "Montage / libre", "2/8 pièces / posées" (2/8 parts placed)); the manipulation bar takes 4 rows (~170 px) and hides a third of the scene. Nothing breaks, but readability collapses. | 17 |
| U41 | G2 | In free building, the footer action bar wraps to two rows at 1280 px ("Abandonner" alone underneath) and leaves a large gap below the tray tiles (fixed height 188 px, cf. R7). | 09, 16 |
| U42 | G3 | The **selected** part is rendered pale pink (amber emissive material over the original color): the brick's real color becomes unrecognizable. The material is defined in `src/infra/` (out of scope). | 16 |
| U43 | G3 | The browser console shows ~120 "404" errors each time a model is opened: these are `LDrawLoader`'s normal probes in the library subfolders (cf. `notFound` in the perf report), not failures. To be filtered for the phase 5 "no console errors" check. | — |

## What works well and must be preserved

- **Honesty**: quality badges, `missing-parts`, "Étapes non disponibles… aucune séquence n'est inventée" (Steps not available… no sequence is invented), end of free building that does not claim to have rebuilt the official model, LEGO instructions never downloaded, network only on click.
- **Confirmations on library data** (remove, unlink, resume a save) and systematic **history**.
- **Parts tray** with real thumbnails, quantities and highlighted part in hand.
- **Resizable splitter** accessible by keyboard, remembered per context.
- **Useful error messages**: most say what to do ("importe « x » (3 p.) pour voir la page 2" (import "x" (3 p.) to see page 2), "Réparer : choisir le fichier d'origine" (Repair: choose the original file)).

## Constraints noted for the redesign

- The **tray height must stay fixed** during a session (R7): a tray that changes size desynchronizes 3D picking.
- The **colors of the 3D variants** (blue ghost `#3b82f6`, amber selection, "voir les connexions" transparency) are defined in `src/infra/ldraw/part-catalog.ts`, **outside the authorized scope**: adapting them to the theme will require your approval (or passing the colors as a parameter from `src/components/`).
- The scene background and grid are in `BuildCanvas` (`src/components/three/`): modifiable.
- **233 E2E text assertions** and ~170 `data-testid` (see `dependances-e2e.md`): the labels listed there must only change with a test update in the same commit.

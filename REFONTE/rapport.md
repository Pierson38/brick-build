# UI/UX redesign report — Brick Lab Local

Branch `claude/brick-lab-ui-refonte-188be7`, worktree `.claude/worktrees/brick-lab-ui-refonte-188be7`, base `origin/main` = `314d5af` (rebase of 2026-11-09; the work had started on `a1309a4`). Nothing has been pushed or merged.

Goal: an interface that is more beautiful and simpler **without losing, breaking or changing** any feature. The domain (`src/domain/`), infra (`src/infra/`), server, API routes, data formats (`~/Documents/brick-lab-data/`, `.brick-mapping.json`), environment variables and 3D rendering logic have not been modified.

Redesign documents: [inventory](inventaire-fonctionnalites.md) (262 features), [UX audit](audit-ux.md) (U1–U43), [design proposal](proposition-design.md) (direction A "Établi" (Workbench), decisions A1–A11), [E2E dependencies](dependances-e2e.md), [acceptance test state before](etat-recette-avant.md), [before](avant/README.md) and [after](apres/README.md) screenshots.

## 1. Final verification result

Run on 2026-11-09 on the final code (Apple M2 Pro, macOS 25.6.0, Node 24.5.0, Chromium 156 / Playwright 1.64.1 WebKit).

**`npm run recette` — passed (exit code 0)**

| Step | Before (`a1309a4`) | After |
|---|---|---|
| `check:spec` | OK | OK |
| `typecheck` | OK | OK |
| `npm test` (Vitest) | 317 passed, 1 skipped | **336 passed, 1 skipped** (+ `design-tokens`, `demo-model`) |
| `npm run test:e2e` | 86 passed, 19.2 min | **97 passed**, 0 failed, 21.3 min (+ `filet-refonte`, + tests coming from `origin/main`) |

The real-set suites (31040, 31009, 31039) ran. An identical acceptance run on `044e815` (before the phase 5 fixes) was already green: 96/96 in 22.4 min.

**`npm run perf` — passed** (production build, average over 3 passes; details: `perf-avant.json`, `perf-apres.json`)

| Set | Import → first frame before | after | Deviation | FPS idle / orbit | JS heap before → after |
|---|---|---|---|---|---|
| 31040-1 | 1,131 ms | 1,073 ms | −5.1% | 60 / 60 | 26 → 31 MB |
| 31009-1 | 1,152 ms | 1,181 ms | +2.5% | 60 / 60 | 68 → 50 MB |

±10% threshold met; same LDraw requests (490 / 812, of which 171 / 293 normal 404 probes). The JS heap varies from one measurement to the next (garbage collector): no trend.

**Inventory**: 262 / 262 features verified and checked off ([inventory](inventaire-fonctionnalites.md)).

**Manual building** (real pointer via Playwright, script outside the repository, Chromium **and** WebKit, 4 / 4 scenarios in each browser, no console errors other than the LDraw probe 404s):

- mini-4-pieces in **guided mode** through to "Bravo, modèle terminé !" (Well done, model complete!); **camera**: wheel zoom and right-click-drag pan do move the view (P2, P3, which had no E2E);
- mini-4-pieces in **free building**: place, select, quarter turn, "Au stock" (To stock), "Annuler" (Cancel/Undo) restores the part;
- **PDF instructions**: a fake PDF shows "Fichier PDF invalide ou abîmé." (Invalid or damaged PDF file.) as an alert (Q16), then the real instructions are displayed;
- **synced instructions** (notice-sync-8 + generated PDF + imported mappings): 8 parts placed, the page follows the step (p. 2 then p. 3, including the boxed inset), "Bravo" ending;
- **keyboard**: "Importer un modèle" (Import a model) and "Importer une notice PDF" (Import a PDF instruction booklet) reached by keyboard with a focus ring.

Transient states not captured as images (loading E1, choice between two saves E3, conflict F8): covered by the `library` / `library-webkit` E2E tests, green.

**Screenshots after**: 40 screenshots in [`apres/`](apres/README.md) (01–30 comparable one-to-one with `avant/`, 31–40 new states: dark theme, confirmations, settings, help, 1024 px). The only console errors during the three runs: `LDrawLoader` probe "404"s (U43).

## 2. What changes, screen by screen

### Foundations (the whole application)

- **Design system**: `src/app/tokens.css` (colors, spacing, radii, shadows, system typography, durations) in light and dark themes; theme toggle in the app bar (browser preference, never sent anywhere). No more ~40 hardcoded colors (U21, U22). A unit test (`design-tokens`) checks that every token exists in both themes and that text/background pairs meet AA contrast.
- **Icons**: `lucide-react@1.61.0` (the only dependency added, validated in A2), embedded in the bundle: no network request. The characters ◀ ▶ ▲ ▼ ✓ ⚠ were replaced where they served as buttons (U25); ✓ / ✗ remain as text in the mode lists (tested texts).
- **Shared components** (`src/components/ui/`): app bar with breadcrumb (U26), native `Dialog` / `ConfirmDialog` (focus trapped and restored, Escape, "Annuler" button focused by default on destructive actions), menu, toasts with a close button, loading indicator (`role=status`), info / warning / error notes (`role=alert` for errors), empty state, LDraw setup screen.
- **Accessibility**: global `:focus-visible` identical in Chromium / WebKit (U32), AA contrast (U33), tabs with `aria-controls` / `tabpanel` and ←/→ arrows (U34), accessible names in French on all icon buttons (U35), `prefers-reduced-motion` and `prefers-color-scheme` honored (U37), 150–250 ms transitions.
- **Page titles**: "Ma collection — Brick Lab" (My collection — Brick Lab), "Ajouter un set — Brick Lab" (Add a set — Brick Lab), "Atelier — Brick Lab"… (A8); the "Non affilié à LEGO" (Not affiliated with LEGO) notice is kept.

### Ma collection (`/`)

- App bar: "Ajouter un set" as the primary action, "Atelier sans collection" (Workshop without a collection) and data folder detection accessible without clutter (U19).
- **Reprendre** (Resume) banner: the last saved build, resumed in one click.
- Cards with a dominant thumbnail: status and progress on the thumbnail, icon row (parts, instructions, mappings), problem always visible in red, "Réparer" (Repair) button on cards with no playable mode (A10) (U15).
- Filters as a radio group navigable with arrows; loading state and empty state with "Essayer la démo" (Try the demo) (embedded CC0 fixture, nothing added to the library, A4) (U28).

### Ajouter un set (`/ajouter`)

- A single page as a **step-by-step flow** 1 Fichiers (Files) → 2 Vérification (Check) → 3 Confirmation → 4 Prêt (Ready), current step computed (`aria-current="step"`) (U7).
- "Chercher en ligne" (Search online) and "Télécharger" (Download) marked with a globe and "contacte Internet, seulement sur ce clic" (contacts the Internet, only on this click); offline (`BRICK_LAB_ONLINE=0`), an explicit note and the full local import.
- Compatibility: one icon per row (ok / warning / error / info); the main action in a sticky bar that is always visible, with the reason if it is blocked.

### Atelier (`/atelier/[buildId]` and `/atelier`)

- **App bar**: breadcrumb, always-visible **segmented** mode selector (unavailable modes stay displayed, disabled, with their reason — A3), progress with bar, step and instructions step, save state, "?" help, theme. It fits on one row at 1280 and 1024 px (U5, U12, U40).
- **Start** (Modèle tab): explained mode cards, the recommended mode up front, then the model summary (U13).
- **Scene**: tool rail ("Centrer" (Center), slots, grid and magnets in free building — U4), HUD for the part in hand, **contextual caption** for instructions and toast reserved for results (A6, U10, U36), collapsible side panel (U20).
- **Tray**: prioritized action column (Annuler ⌘Z, orientation, place at target, reset the step, discreet abandon) (U11, U14, U41).
- **Confirmations** (A5): "Abandonner" (Abandon) and "Recommencer" (Start over) in a modal in both workshops (U1); a mode change that removes parts too (text unchanged).
- **"Raccourcis et gestes" (Shortcuts and gestures) help** (`?`): the 21 shortcuts and 12 gestures, previously hidden in tooltips (U16).
- **LDraw library missing**: a setup screen in the scene (`.env.local`, `npm run check:ldraw`) instead of the misleading home screen, and the cause in the panel (U39).
- **Workshop without a collection**: home with demo, file drop and resume (U6).

### Free building

- The manipulation bar (20 controls on 3–4 rows, U3) becomes a **one-row contextual bar at the top of the scene**, shown only with a part in hand or a selection: height (↑ ↓, 8 / 1 LDU, Auto), X Y Z quarter turns (− +), Au stock, "Lâcher" / "Laisser en place" (Drop / Leave in place); with a selection: "Flèches" / "Anneaux" (Arrows / Rings), "Globaux" / "Locaux" (Global / Local), "Déplacer" (Move), "Assemblage" (Assembly), Au stock, "Réglages" (Settings), ×. Labels spelled out, collapsed to icons when the scene is narrow (container query).
- Fine settings (arrow step, ring step, coordinates + "Appliquer" (Apply)) in a second "Réglages" row closed by default.
- Part or selection state in the HUD, which lets clicks through; "Voir les connexions" (View connections) in the tool rail.

### PDF instructions, synced instructions, mapping editor

- **Notice panel** (Instructions panel): compact bar (booklet, ‹ "PDF p. i / n" ›, zoom − / + / width), "Lecture du PDF…" (Reading the PDF…) as an indicator, errors as alerts, empty state with "Importer une notice PDF" and the unchanged privacy notice.
- **Synced step card**: step, booklet and page, step progress bar, viewing a completed step in amber; "Reprendre depuis cette étape" (Resume from this step) goes through a **modal that announces the number of parts removed** (U2).
- **Editor**: header (status, coverage, "Terminer l'édition" (Finish editing)), collapsible Booklets and Validation sections, step form as a grid with aligned labels (U9), named part chips, duplicates as alerts, "Tout effacer" (Clear all) in a modal (same "Confirmer l'effacement" (Confirm clearing) label).

### Set detail (`/sets/[setId]`)

- Shared app bar; loading, set not found (empty state + back) and library error (alert + "Réessayer" (Retry)).
- Header: number and name editable in place (Enter saves, Escape restores), "Enregistrer" (Save) + "Annuler".
- **Construction card**: problems as alerts at the top, browser save, progress, ✓/✗ modes with reasons, main button; then collapsible sections Files, Notices (Instructions), Mappings (open, state in the title) and Compatibility and diagnostics (collapsed unless a part is missing or there is an error) (U8).
- Separate **sensitive zone**; "Retirer le set / cette construction" (Remove the set / this build) confirms in a modal (same identifiers, same text).

## 3. Moved features

All features still exist; the "Nouvel emplacement" (New location) column of the [inventory](inventaire-fonctionnalites.md) gives the place of each of the 262 (all checked "Vérifié" (Verified)). The most visible moves:

| Feature | Before | After |
|---|---|---|
| Mode choice (K7, G9–G11) | "Mode" `<select>` in the tray bar; 3 stacked buttons in the Model tab | Segmented selector in the app bar; mode cards in the Model tab |
| Grid, Part magnet, Model magnet (J23, J25, J26) | Checkboxes in the tray bar | Scene tool rail (toggle buttons, same G and ⌥ keys) |
| Manipulation instructions (F12) | Toast | Scene contextual caption (identical texts) |
| Arrow step / ring step, coordinates (J13–J15) | Manipulation bar, always visible | "Réglages" row below the contextual bar, closed by default |
| "Voir les connexions" (J20) | Manipulation bar | Tool rail (with a selection) |
| Part in hand / selection state (J2, J10) | Start of the manipulation bar | HUD below the contextual bar |
| Progress, step, save (F1–F7) | Text at the top right | App bar (progress bar) |
| "Atelier sans collection" (B18) | Topbar link | Collection app bar menu and empty state |
| Model diagnostic (G1–G8) | At the top of the panel, permanently | Model tab, below the mode cards |
| Set compatibility and diagnostics (C12–C16) | Flat sections | Collapsible section (open by default when there is a problem) |
| Shortcut help (O1–O21, P1–P12) | Tooltips and toasts | "Raccourcis et gestes" dialog (`?`) |

## 4. Changed behaviors (all validated or recorded)

Recorded in `docs/implementation/JOURNAL_DECISIONS.md` ("refonte de l'interface" (interface redesign) section):

1. **New confirmations** (A5): Abandon / Start over (both workshops), Resume from this step, Clear all (mappings, already confirmed inline before), Remove a set / a build (already confirmed inline before). No result changes once confirmed.
2. **Unavailable modes shown disabled** instead of being absent (A3); never playable.
3. **Instructions in the caption**, toast for results (A6).
4. **Embedded demo** (A4): `fixtures/mini-4-pieces.mpd` (CC0), unit equality test.
5. **Scene background**: transparent canvas, background carried by the `--scene-bg` token (light / dark). New thumbnails are captured without a background; old ones keep theirs.
6. **Free-building bar at the top and not at the bottom** (deviation from proposal § 4): at the bottom, it hid the floor near the camera and the manipulator; two E2E tests showed it.

### Phase 5 fixes

- **"Importer… / Remplacer… / Associer… / Réparer…" buttons by keyboard** (10 buttons: model, PDF instructions, mappings, add files, repair, builds): the file input was hidden with `hidden` (already the case before the redesign), so neither Tab nor Enter reached it. It is now visually hidden but focusable; the surrounding button shows the focus ring (and its tooltip). The icon button "Ajouter / changer de livret" (Add / change booklet) gives the input its name. New test in `filet-refonte`; also verified in WebKit with ⌥ Tab (Safari only tabs through text fields with Tab alone, a system setting).
- **Tooltips of the tray actions** ("Annuler", "Poser à la position cible" (Place at target position)) aligned to the right edge: they overflowed the window (seen in screenshot 13).

### Modified tests (and why)

No assertion was weakened; the tested texts are unchanged. Tests were adapted where the interaction changes:

- `filet-refonte.spec.ts` (new, phase 3): redesign safety net, green before and after.
- `surface-placement`, `filet-refonte`: click on the abandon confirmation (A5).
- `instructions-sync`: targets "Étape précédente" (Previous step) (the ◀ arrow became an icon) and confirms the resume in the modal (including the announced number of parts).
- Mode selector driven by `data-value` (A3); "not offered" checked via `aria-disabled`.
- `free-gizmo`, `libre-reel` acceptance test: open "Réglages" before entering steps or coordinates (`manipSettings`).
- `instructions-sync-omr`: waits up to 3 s for the PDF page to follow the step (pre-existing failure under load, reproduced on the old code; a page that does not follow remains a deviation).
- `design-tokens`, `demo-model` (new unit tests); `filet-refonte`: keyboard test of the "Importer…" buttons (phase 5).

## 5. Points to decide

1. **Ghost and selection colors** (A8, U42): they are in `src/infra/ldraw/part-catalog.ts`, outside the granted scope. The selection renders the brick pale pink (real color unrecognizable) and the blue ghost does not follow the dark theme. Proposal: a lighter outline or emissive, driven by the theme — requires your approval on `src/infra/`.
2. **"Supprimer l'étape"** (Delete the step) in the mapping editor (M8, U31) stays **without confirmation and without "Annuler"**, as before. A deleted step can be recreated by hand; a confirmation (or an "Annuler" in the toast) would be consistent with A5.
3. **"Au stock" and "Réinitialiser l'étape"** (Reset the step) (J18, H9): reversible with ⌘Z, but the toast does not offer "Annuler" (U31). To be decided together with A7 (automatic toast dismissal, postponed).
4. **File drop on the collection** (A9, U17): postponed; drag-and-drop import stays in "Ajouter un set" and the home of the workshop without a collection.
5. **Free-building bar at the top** instead of the bottom (§ 4.6): to be confirmed.
6. **Browser save diff** (set detail): remains a banner in the card and not a modal; sufficient in practice but the text is long.

## 6. Remaining debt

- **Keyboard navigation in the scene**: nothing was added in the canvas itself (outside the "3D rendering logic" scope), the existing shortcuts remain the keyboard route; no skip link to the tray (U38).
- **`globals.css`** has grown (≈ +900 lines): splitting by screen (CSS modules or per-area files) to consider.
- **`BrickLabApp.tsx`** remains a large component (~1,500 lines); the contextual bar, the help, the mode selector and the start were extracted from it, the rest (tray, panel) could follow.
- **Placement feedback** (U29): no pulse or strong visual effect at placement time (touches the 3D scene).
- **Standalone save** (U30): "Sauvegardé localement" (Saved locally) remains static.
- **Console**: ~120 "404"s when opening a model, normal `LDrawLoader` probes (U43), unchanged.
- **Flakiness under load**: `free-height-group:271` (WebKit) failed once under heavy machine load during the redesign, then passed 3/3; to be monitored.

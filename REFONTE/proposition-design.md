# Phase 2 — Design proposal

Base `3e91174` (audit validated on 2026-11-09). Nothing in `src/` has been modified yet.

Files:

- `proposition/directions.html`: local static mockup, with no external resources; Direction A/B and Light/Dark toggles at the top of the page.
- `proposition/direction-{a,b}-{clair,sombre}.png`: the four renderings.
- `proposition/tokens.css`: tokens of the recommended direction (A), ready to become `src/app/tokens.css`.
- "Nouvel emplacement" (New location) column filled in `inventaire-fonctionnalites.md`: no empty row.

---

## 1. Two visual directions

Both keep the same architecture (§ 4): they differ only in styling. The 3D scene remains the largest surface on screen, on a neutral, pattern-free background. Floating controls there are translucent and grouped along the edges.

| | **A — "Établi" (Workbench)** (recommended) | **B — "Plan technique" (Technical drawing)** |
|---|---|---|
| Intent | A calm, bright workbench, where you work for a long time with the paper instructions next to you | A precision CAD-style tool, on a night background |
| Default theme | Light (dark via `prefers-color-scheme` or toggle) | Dark (light available) |
| Neutrals | Warm paper `#f6f4f0`, ink `#1e1b16`, slate `#5c564c` | Cool slate `#0f1216`, `#161a20`, text `#e6eaf0` |
| Accent | "Tool" green `#1e6b5c` (light) / `#4fbfa5` (dark): main action, progress, active tab | Signal amber `#f2a900` (dark text on top) |
| 3D / UI selection | Burnt orange `#c2410c` | Cyan `#38bdf8` |
| Typography | System font (SF Pro Text/Display, SF Mono): **0 KB**, identical native rendering in Chromium/WebKit | Self-hosted IBM Plex Sans + Plex Mono (`@fontsource`, OFL): **≈ 100 KB** woff2 (4 Latin weights) |
| Scale | 11 / 12 / 13 / 14 / 16 / 18 / 22 / 28 px | Same scale, labels in spaced small caps |
| Spacing | 4 px grid, comfortable density (32 px controls) | 4 px grid, dense (28 px controls) |
| Radii | 7 px (controls), 12 px (cards), 14 px (panels) | 4 px / 6 px / 6 px |
| Shadows | Soft and warm, 3 levels | Nearly absent: 1 px hairlines |
| Iconography | Lucide, 1.75 stroke, 16 px, always accompanied by a label except in the tool rail (tooltip + `aria-label`) | Lucide, 1.5 stroke, 16 px |
| What stands out | The colored bricks and the **white instruction pages**, which don't clash | The bricks on a dark background; the white instructions dazzle next to it |
| Risk | May look tame | Eye strain with a white PDF; 100 KB of fonts; further from the existing look (more visual changes to validate) |

**Recommendation: A.** The main use is with a white-background PDF open permanently next to the scene: a warm light theme lets them coexist without harsh contrast, and dark remains available. The system font costs nothing, makes no request and renders identically in Chromium and WebKit on Mac. It stands apart from a generic template through the warm paper instead of blue-gray, the single green accent and the tabular mono digits. **Borrowed from B**: tabular mono for digits, references and coordinates.

If you choose B, the tokens keep the same names; only the values in `tokens.css` change (they are in `directions.html`), and I add the two `@fontsource` packages.

## 2. Proposed dependencies

| Package | Version | License | Weight | Why |
|---|---|---|---|---|
| `lucide-react` | **1.61.0** (2026-10-21, > 2 weeks) | ISC | 38 MB in `node_modules`; **≈ 0.5 KB per icon in the bundle** (named import, tree-shaking), i.e. ≈ 20 KB min / ≈ 7 KB gzip for the forty or so planned icons | Required by the brief (icons embedded via npm); depends on `react` only |
| `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono` | 5.3.0 | OFL-1.1 | ≈ 100 KB woff2 served by Next from the bundle | **Only if direction B** |

Nothing else: no Radix, shadcn or Tailwind. Modals use the native `<dialog>` (focus trapping and Escape handled by the browser, identical in Chromium and WebKit). Tooltips, menus and popovers are small in-house components (< 150 lines each) tested by keyboard.

## 3. Design tokens (direction A)

Single source: `proposition/tokens.css`, which will become `src/app/tokens.css`. `globals.css` will no longer contain any hardcoded color, radius or duration.

- **Families**: `--font-*`, `--text-*` (11→28 px), `--space-*` (4 px), `--radius-*`, fixed sizes (`--control-h` 32, `--appbar-h` 52, **`--tray-h` 188 kept**, `--splitter-w` 8 = the domain's `SPLITTER`), `--z-*`, `--duration-*` 150/200/250 ms, set to 0 under `prefers-reduced-motion`.
- **Colors**: `--color-bg/surface/surface-2/surface-3/border/border-strong/border-control/ink/ink-2/ink-3`, `--color-accent*`, `--color-focus`, statuses `ok/warn/danger/info` (+ `-soft`), import quality `--quality-*`, scene `--scene-bg/grid/grid-center/ghost/select/snap/overlay-bg`, axes `--axis-x/y/z` (unchanged).
- **Theme**: light in `:root`; dark under `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` and under `:root[data-theme="dark"]`. The toggle writes `data-theme` on `<html>` and stores it in `localStorage` (`brick-lab:theme` = `system | light | dark`), like the panel width. A small inline script in `layout.tsx` applies it **before the first render** (no flash).
- **3D scene**: `BuildCanvas` reads `--scene-bg` and `--scene-grid*` once on mount and on each theme change (a `MutationObserver` on `data-theme` + the media query). Only `<color attach>` and the grid change; the bricks are not recreated.
- **Verified contrast** (WCAG AA, computed):

| Pair | Light | Dark |
|---|---|---|
| text / background | 15.6 | 15.6 |
| secondary `ink-2` / background | 6.6 | 7.5 |
| tertiary `ink-3` / `surface-2` (the worst case) | 5.0 | 5.3 |
| text on accent | 6.3 | 7.6 |
| statuses on their `-soft` background (ok, warn, danger, info) | 4.7 · 5.6 · 5.6 · 6.2 | 7.0 · 7.5 · 6.8 · 7.2 |
| field border `border-control` (≥ 3:1) | 3.6 | 3.5 |
| focus / background (≥ 3:1) | 5.8 | 9.8 |

- **Focus**: global `:focus-visible` = 2 px `--color-focus` ring, offset by 2 px, on all interactive elements.

## 4. Information architecture

The routes do not change (`/`, `/ajouter`, `/sets/[id]`, `/atelier`, `/atelier/[buildId]`): links, tests and resume depend on them.

**Shared app bar** on all pages (52 px). On the left, the "Brick Lab" brand (link to the collection) then the breadcrumb (*Ma collection › 90001-1 Maison de test › Atelier*). On the right, the page action, the Help `?` button and the theme toggle (System / Light / Dark). The "← Ma collection" label (← My collection) and `data-testid="back-to-collection"` are kept on the first breadcrumb link.

### 4.1 Collection `/`

| Before | After | Gain |
|---|---|---|
| Title + search + filters, then a grid of equal cards; data folder detection as a collapsed yellow link; browser sessions in a gray box at the bottom | **"Reprendre" (Resume) banner** at the top: the in-progress build modified last, large thumbnail, progress, one button. Compact toolbar (search, segmented filters, "Ajouter un set" (Add a set) as primary). Cards with a **dominant thumbnail**: status badge overlaid, progress bar at the bottom of the thumbnail, then number, name, a row of icons (parts, instructions, mappings) and the modes as neutral chips. **Problem always shown** in red under the title, and "Réparer" (Repair) replaces "Construire" (Build) when no mode is available (link to the detail). Detection and browser sessions: collapsible sections with a counter, below the grid. Empty collection: welcome screen (§ 5.1). Loading: card skeletons. | Resuming = **1 click** from the home page; the state reads from the thumbnail; problems stay as visible as today (red, `role=note`) |

### 4.2 Ajouter un set `/ajouter`: step-by-step flow, on a single page

| Before | After | Gain |
|---|---|---|
| 5 panels that appear as you go; the final button far below the fold | **Step indicator** at the top: *1. Fichiers (Files) → 2. Vérification (Check) → 3. Confirmation → 4. Prêt (Ready)*. The current step is highlighted, past steps are summarized and reopenable, following ones grayed out. **1. Files**: two paths side by side, "Par numéro" (By number) (local search then sources, with "Chercher en ligne" (Search online) marked with a globe icon and the note *contacte l'OMR* (contacts the OMR)) and "Depuis mes fichiers" (From my files) (large drop zone). **2. Check**: retained files and compatibility diagnostic, one card per build (quality badge, available modes, reasons). **3. Confirmation**: number, name, target (new set / existing set). **Sticky action bar at the bottom**: what is missing (`confirm-blocker`) and the main button, always visible. **4. Ready**: "Construire '…'" as primary. | You know where you are and what is missing; the main action no longer moves. Everything stays on one route, with no state loss. |

Offline (`BRICK_LAB_ONLINE=0`): the "Par numéro" path shows "Recherche en ligne désactivée (`BRICK_LAB_ONLINE=0`)" (Online search disabled) in place of the button, with a crossed-out globe icon. Local import remains complete.

### 4.3 Set detail `/sets/[id]`

| Before | After | Gain |
|---|---|---|
| Editable header, then per build: 3D preview + a column of ~15 sections | Header: editable number and name (pencil on hover, Enter / Escape). Per build, a **Construction card**: 3D preview, name, status, progress, ✓/✗ modes **with reasons**, **problems first** (red alert), main button. Then **collapsible sections**: Files (model, fingerprints, repair), Notices (Instructions), Mappings, Compatibility and diagnostics, and finally a separate **danger zone**. Browser save: alert banner at the top of the card when it differs. | Readable in 5 seconds, repair within reach, destructive actions isolated |

### 4.4 Workshop `/atelier/[id]` and `/atelier`

```
┌ App bar ─────────────────────────────────────────────────────────────────────┐
│ ← Ma collection › 90001-1 Maison de test    [Notice synchro|Guidé|Libre]    ▰▰▱▱ 2/8 pièces  ✓ Enregistré  ⌨ ◐ │
├──────────────────────────────────────────────┬─┬────────────────────────────┤
│ HUD (state of the part in hand / selection)   │ │ [Étape|Modèle] [Notice] [Corresp.]  ⇥ │
│                                    Tool rail  │ │                              │
│              3D SCENE                ⌖ ▢ ▦ ⊃ ◎ 👁 │ │ collapsible panel          │
│                                               │ │                              │
│        Contextual bar (hand / selection)      │ │                              │
│ Caption: clic poser · R tourner · ? aide      │ │                              │
├──────────────────────────────────────────────┴─┴────────────────────────────┤
│ Parts tray (fixed 188 px)                                    [↶ Annuler] [⋯] │
│                                                              [◎ Poser à la cible] │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Area | Before | After | Gain |
|---|---|---|---|
| App bar | Loose text on the right | Breadcrumb; **segmented mode selector in the center** (unavailable modes are grayed out, with the reason in a tooltip); **progress bar** and "x/y pièces" (x/y parts); step "Étape 1 / 2" (Step 1 / 2) or "Notice : Étape 2, p. 2" (Instructions: Step 2, p. 2) under the counter; save state (icon + text, red on error); `?` help; theme | Mode and progress always visible; the guided/free toggle becomes obvious |
| Start | Model card then 3 stacked buttons | **"Démarrer" (Start) tab** of the panel as long as no session is started: summary (quality badge, figures), then **three mode cards** with one explanatory sentence each; unavailable modes stay displayed with their reason ("Étapes non disponibles dans ce fichier : aucune séquence n'est inventée" (Steps not available in this file: no sequence is invented)). Detailed diagnostic collapsible below. | You understand the difference between modes; a non-buildable model shows no active button |
| HUD | `held-info` line in the tray (guided) or in the bar (free) | Translucent chip at the top left of the scene, in all modes: level/height, rotation, orientation, magnet ("4 tenons emboîtés" (4 studs snapped), in green), reason for a refusal (in amber) | A single place to look, near the part |
| Tool rail | Checkboxes in the tray + "Centrer" (Center) | Column of icons to the right of the scene: Center, Show slots, Grid (G), Part magnet, Model magnet, View connections, each with tooltip and shortcut, `aria-pressed` | Scene settings are near the scene |
| Contextual bar | 20-control `manip-bar` on 3 rows at the top | A bar at the bottom of the scene, **only when something is in hand or selected**. Part in hand: Up / Down / 8–1 LDU step / Auto height · X Y Z ±90° · Return to stock · Drop. Selection: Arrows / Rings · Global / Local · X Y Z · Move · Assembly · To stock · Deselect. **Settings ⚙** (popover): step, angle, X/Y/Z coordinates + Apply. Below 1200 px, labels become icons with a tooltip. | The scene gains ~90 px at the top; the essentials at a glance; fine settings one click away |
| Tray | Tray + 8 to 12 loose controls | Tray (unchanged fixed height) + action column: **Annuler** (Undo) (⌘Z), **Poser à la position cible** (Place at target position), **⋯ menu** (Reset the step, Abandon → confirmation) | One main action per area; the destructive action gets out of the way |
| Side panel | 3 tabs, not collapsible | Tabs *Démarrer/Étape*, *Notice*, *Correspondances* (Mappings); **collapse button** (⇥) that gives the full width back to the scene, remembered; splitter with visible handle. During a session, the "Étape" tab shows the current step (guided, synced) or the stock and the end (free); the model card remains as a collapsible section. | The scene can take all the space; the panel shows the session, no longer the import diagnostic |
| Toasts | Bottom left, persistent, long instructions | Stack at the bottom left, above the caption: **results** (placed, refused, moved) stay as today; **instructions** ("Pointe où tu veux…" (Point wherever you want…)) move to the **contextual caption** at the bottom of the scene. Close button; errors as `role=alert`. | Less text hiding the scene |
| Help | None | **`?`** key or ⌨ button: "Raccourcis et gestes" (Shortcuts and gestures) modal, by context (in hand / selection / guided / editor), which covers the 21 shortcuts and 12 gestures of the inventory | Discoverability (U16) |
| LDraw missing | Home screen + red text | **"Bibliothèque de pièces introuvable" (Parts library not found) screen** in the scene: exact reason, the 3 README steps (download `complete.zip`, create `.env.local`, `npm run check:ldraw`) with copyable commands, and "Réessayer" (Retry); the panel keeps the diagnostic and states "cause : bibliothèque LDraw, pas le fichier" (cause: LDraw library, not the file) | U39 fixed, without hiding the diagnostic |

### 4.5 PDF instructions and mapping editor

| Before | After | Gain |
|---|---|---|
| Bar of text buttons (◀ ▶ − + ↔), booklet in a select | Compact icon bar: booklet (select) · ◀ "p. 2 / 3" ▶ · − Width + ↔ · "Ajouter un livret" (Add a booklet); the contextual caption ("page indépendante des étapes 3D" (page independent of the 3D steps) / "pilotée par l'étape" (driven by the step)) under the page in small type; sync mode: **step card** above the page (step, page, step progress, viewing in amber, "Reprendre depuis cette étape" (Resume from this step) → confirmation) | Less noise, the page takes the height |
| Editor: 7 inline fields, stacked sections | Header (status, coverage, Finish); **step navigation** ◀ select ▶ + "Nouvelle étape" (New step); **two-column grid form** with aligned labels (Livret (Booklet), Page, N° imprimé (Printed no.), Encadré (Boxed), ×, Vérifiée (Verified), Note); step and unassigned parts as chips with a color dot; Booklets, Validation and Import/Export as collapsible sections; "Tout effacer" (Clear all) in a menu with confirmation | Faster, more readable input |

## 5. Flows

### 5.1 First launch
Empty collection, in three cases:
- **LDraw library configured**: home with two cards, *Ajouter mon premier set* (Add my first set) (link `/ajouter`) and *Essayer la démo* (Try the demo) (see decision A4).
- **Library missing**: the *Bibliothèque de pièces* (Parts library) card comes first, with the installation steps and "Réessayer". Adding a set remains possible, and its diagnostic will report "rendu indisponible" (rendering unavailable).
- **Files found in the data folder**: third card, *N sets trouvés dans ton dossier* (N sets found in your folder), which expands the detection.

### 5.2 Import
Collection → Add a set → 1. number or drop → 2. check (readable compatibility card) → 3. confirmation → 4. **Construire** → workshop on the *Démarrer* tab, where the recommended mode is pre-highlighted.

### 5.3 Guided building
*Démarrer* → "Guidé" (Guided) card → the panel switches to *Étape* → you pick a part from the tray (the HUD and the caption appear) → the magnet indicates the target (green HUD) → click → toast "Pièce posée (1/4)" (Part placed (1/4)) → the app bar advances → end: end screen in the panel, "Recommencer" (Start over) (confirmed).

### 5.4 Free building
Mode selector → *Libre* (Free) (if parts are outside the model: the current confirmation, in a modal) → you pick a part (the "in hand" contextual bar appears) → click → you click a placed part ("selection" contextual bar and gizmo) → double-click: assembly → drag.

### 5.5 Instructions and mappings
*Notice* tab → import a PDF → *Correspondances* (the panel widens to the "editor" context) → … → *Terminer* (Finish) → on the *Démarrer* card, "Notice synchronisée" (Synced instructions) becomes available.

## 6. Points to decide before phase 3

| # | Topic | Proposal | Impact |
|---|---|---|---|
| **A1** | Visual direction | **A "Établi"** | — |
| **A2** | Icon dependency | `lucide-react@1.61.0` | +1 dependency (≈ 7 KB gzip in the bundle) |
| **A3** | **Mode selector**: segmented control (`role=radiogroup`) in place of the `<select data-testid="mode-select">` | Segmented, with the same `data-testid` on the group and `data-value` attributes; the ~30 `selectOption(...)` calls in the tests go through a `chooseMode(page, mode)` helper, updated in the same commit | Modifies tests (not their assertions). Alternative: keep a restyled native `<select>` (0 tests touched, less readable) |
| **A4** | **"Essayer la démo"** on first launch | Embed `fixtures/mini-4-pieces.mpd` (CC0) as a constant in `src/components/demo/`, with a unit test that checks byte-for-byte equality with the fixture; opens `/atelier?demo=mini-4` (local import, nothing written to the library) | Small functional addition; no API route, no network access |
| **A5** | **Confirmation for "Abandonner" in the standalone workshop** (today immediate erasure) and for **"Reprendre depuis cette étape"** | Confirmation in both cases (cross-cutting requirement of the brief) | Changes a behavior: `surface-placement.spec.ts:67` clicks "Abandonner" and expects the erasure; confirmation click added in the same commit |
| **A6** | **Instructions out of the toast**: pick-up instructions (`pick`, `take`, `moveSelection`, drag), selection (`select`) and mode entry (`MODE_HINT`) go into the contextual caption; the toast keeps results, including the *info* messages that are results (assembly selected or not, parts recognized on mode change, progress restored, "Pièce laissée où elle était." (Part left where it was.)) | Yes; the texts do not change | Checked by `grep`: no E2E assertion targets the moved instructions; the asserted info messages ("visibles ou cachées", "Aucune autre pièce reliée", "reconnue(s) à leur place", "Pièce laissée où elle était.") stay in `message` |
| **A7** | **Automatic dismissal of success toasts** (5 s) | Not for now: manual dismissal (×), the last message replaces the previous one as today | Avoids unstable tests; to revisit after phase 4 |
| **A8** | **Colors of the ghosts, the selection and the "voir les connexions" mode**: they are defined in `src/infra/ldraw/part-catalog.ts` (forbidden) | Either your approval to read the `--scene-ghost` / `--scene-select` tokens there (3 constants), or keep them as is (blue `#3b82f6`, emissive amber) | Without approval, the pale pink of the selection (U42) remains |
| **A9** | **File drop on the collection** (global drop that opens `/ajouter` with the files) | Postpone: a new entry point, not essential | — |
| **A10** | **"Réparer" button** on a card without a mode (link to the detail) | Yes (today the card only has "Détails" (Details)) | Presentation addition |
| **A11** | Features of doubtful usefulness (flagged in phase 1): non-clickable recent sessions (N4), standalone workshop (A5) | Kept. N4 becomes a "Reprendre en réimportant" (Resume by re-importing) list with the drop zone next to it | — |

## 7. Technical safeguards

- **R3F canvas**: no new React context above `BrickLabApp`. The theme goes through CSS and a single observer in `BuildCanvas`. The new sub-components (app bar, HUD, rail, contextual bar, tray actions) are sibling children of the `<Canvas>`, so their renders do not recreate the scene; the props passed to `BuildCanvas` stay the same. `npm run perf` after each screen.
- **Picking**: the tray keeps 188 px; the HUD, the rail and the contextual bar are **overlays** (absolute position) that never resize the canvas; panel collapse goes through the same grid as the splitter (a `ResizeObserver` and `sizeInSync` are already tested).
- **Tests**: all `data-testid` attributes, accessible names and texts listed in `dependances-e2e.md` are kept. Icon buttons keep their name via `aria-label` ("Centrer", "Page suivante"…), and `.tray-item`, `.count`, `.ref`, `.held-badge`, `data-thumb`, `main.workspace[data-side-width]`, `.pdf-scroll` and `aside input[accept=".ldr,.mpd"]` remain.
- **1024 px**: panel at 280 px minimum, contextual bar in icons, breadcrumb truncated with a tooltip; nothing wraps in the app bar.
- **WebKit**: `color-mix()` and `backdrop-filter` are supported by Safari ≥ 16.4 and 18; an opaque fallback is planned.

## 8. Next (phases 3 and 4)

1. **Phase 3, safety net** (before any UI): E2E for offline in `/ajouter` (Q11), LDraw library missing (Q10), standalone and library abandon (K10), removing a build or a set (C19), verifying fingerprints (C11), G and Q shortcuts (O14, O16), editor move up/down/delete and clear all/restore (M8, M18, M19). They must pass on the current version.
2. **Phase 4, foundations**: `tokens.css`, theme and toggle, `:focus-visible`, components `Button`, `IconButton`, `Segmented`, `Field`, `Badge`/`QualityBadge`, `Card`, `Section` (collapsible), `Dialog`, `Toast`, `Tooltip`, `Menu`, `EmptyState`, `Skeleton`, `Kbd`, `ProgressBar`, `AppBar`.
3. Then the screens in order: collection → add → workshop (start, guided, free) → instructions and editor. One commit per screen, with `npm test`, `test:e2e` and `perf` each time.

## 9. Decisions validated (2026-11-09)

The owner approved the proposal as is ("Approve A as proposed"):

| # | Decision |
|---|---|
| A1 | Direction **A "Établi"**; tokens from `proposition/tokens.css` |
| A2 | `lucide-react@1.61.0`, no other UI library; no font added |
| A3 | **Segmented** mode selector; tests via a `chooseMode` helper, assertions unchanged |
| A4 | "Essayer la démo" with the embedded CC0 fixture and an equality test against `fixtures/mini-4-pieces.mpd` |
| A5 | Confirmation for "Abandonner" (standalone workshop included) and "Reprendre depuis cette étape"; `surface-placement.spec.ts` and `filet-refonte.spec.ts` follow in the same commit |
| A6 | Instructions in the contextual caption, results in the toast |
| A7 | No automatic toast dismissal for now |
| A8 | **No modification of `src/infra/`**: the proposal offered two options without choosing one, so the current materials (blue ghost, amber selection) are kept until approval is explicitly given |
| A9 | File drop on the collection postponed |
| A10 | "Réparer" button on cards without a mode |
| A11 | Flagged features kept |

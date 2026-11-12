# Feature inventory — state before the redesign

Base: `origin/main` = `a1309a4` (2026-11-09). Inventory built by reading `src/app/` and `src/components/` line by line, then cross-checked with the E2E specs (`tests/e2e`, `tests/recette`, `tests/perf`).

**Conventions**

- `ID`: stable identifier, reused in the audit, the report and the commits.
- **E2E**: spec that exercises the feature today (`—` = no E2E coverage, to be handled in phase 3 if the flow is critical). Abbreviations: `brick` = brick-lab, `add` = add-set, `lib` = library, `lib-omr` = library-omr, `lib-wk` = library-webkit, `sync` = instructions-sync, `sync-omr` = instructions-sync-omr, `ux` = atelier-ux, `ux-omr` = atelier-ux-omr, `surf` = surface-placement, `fb` = free-building, `f3d` = free-3d, `fh` = free-height-group, `fc` = free-connections, `fg` = free-gizmo, `fah` = free-assembly-hidden, `omr` = omr-validation, `perf` = omr-perf, `filet` = filet-refonte (phase 3).
- **Nouvel emplacement** (New location): filled in during phase 2 for all 262 rows, based on `proposition-design.md` § 4 (vocabulary: app bar, HUD, tool rail, contextual bar, tray actions, ⋯ menu, Démarrer/Étape tab, steps 1–4 of the add flow…). The references A3, A5, A6, A10 designate the decisions in § 6.
- **Vérifié** (Verified): box checked in phase 4 after the screen was redesigned and the tests passed.
- `BrickLabApp` = `src/components/BrickLabApp.tsx` (workshop, 1,433 lines); the workshop serves both `/atelier` (standalone, browser storage) and `/atelier/[buildId]` (library, via `LibraryAtelier`).
- Quoted labels are the app's French UI strings, kept verbatim with an English gloss at first appearance.

---

## A. Routes and global navigation

| ID | Feature | Current location | Trigger | What it does | Special cases | E2E | New location | Verified |
|---|---|---|---|---|---|---|---|---|
| A1 | Home = Ma collection (My collection) | `/` → `CollectionView` | URL | Lists the sets of the local library | Client-side rendering only (`dynamic(..., { ssr: false })`), shows "Chargement…" (Loading…) while the chunk is imported | lib, add | `/` unchanged; "Chargement…" with an activity indicator (role=status) while the view loads | ☑ |
| A2 | Add a set | `/ajouter` → `AddSetPage` | "Ajouter un set" (Add a set) button (collection topbar, `data-testid=add-set`) | Search → resources → compatibility → confirmation flow | — | add, lib-omr | `/ajouter` unchanged; primary "Ajouter un set" button in the collection toolbar (same `add-set`) | ☑ |
| A3 | Set detail | `/sets/[setId]` → `SetDetail` | Thumbnail, title or "Détails" (Details) button of a card | Management of the set, its builds and files | Nonexistent set: message + back link | lib | `/sets/[id]` unchanged; card thumbnail, title and "Détails" | ☑ |
| A4 | Workshop of a build | `/atelier/[buildId]` → `LibraryAtelier` → `BrickLabApp` | "Construire / Reprendre / Revoir" (Build / Resume / Review) (card, detail, end of import) | Opens the build with verified files, progress and instructions | `key={buildId}`: remounts the workshop on every build change | lib, lib-omr, add | `/atelier/[buildId]` unchanged; Reprendre banner, card button, Construction card of the detail, step 4 of the add flow | ☑ |
| A5 | Workshop without a collection | `/atelier` → `StandaloneAtelier` | "Atelier sans collection" (Workshop without a collection) link (collection topbar) | P5/P6 workshop: manual import, progress in the browser | Topbar: "← Ma collection" (← My collection) + "Atelier sans collection" | brick, sync, ux, surf, fb… | `/atelier` unchanged; "Atelier sans collection" link in the menu of the collection app bar and on the home screen | ☑ |
| A6 | Back to the collection | Topbar of `/ajouter`, `/sets/…` (`back-to-collection`), `/atelier/…` (`back-to-collection`), `/atelier` | "← Ma collection" link | Navigation to `/` | In the workshop: `pagehide` + unmount → `store.flush()` (last change sent) | lib | App bar › first breadcrumb item "← Ma collection" (`back-to-collection` kept); flush on exit unchanged | ☑ |
| A7 | Link to the set from the workshop | Topbar `/atelier/[id]` | "**no.** name · build" link | Navigation to `/sets/[setId]` | Build label shown only if it differs from the set name | — | App bar › breadcrumb (2nd segment: set number + name) | ☑ |
| A8 | Page title/description | `layout.tsx` | — | `title` "Brick Lab Local", non-affiliation with LEGO notice, `lang="fr"` | Same title on all routes | — | `layout.tsx`: title template "%s — Brick Lab"; title per page (Ma collection, Ajouter un set, Atelier sans collection, Atelier, Détail du set (Set detail)); "Non affilié à LEGO" (Not affiliated with LEGO) description kept | ☑ |

## B. Ma collection (`/`)

| ID | Feature | Current location | Trigger | What it does | Special cases | E2E | New location | Verified |
|---|---|---|---|---|---|---|---|---|
| B1 | Grid of sets | `CollectionView` `.grid` | Page load (`libraryApi.view()`) | One card per set (`set-card-<n°>`) | Read error → `library-error` banner (role=alert) | lib | Collection › grid of cards with a dominant thumbnail; error → alert banner | ☑ |
| B2 | Text search | `.collection-head` input `search` | Typing | Filters by number or name (`filterSets`) | No result → "Aucun set ne correspond à cette recherche." (No set matches this search.) (`no-result`) | lib | Collection › toolbar (search field with icon); "no result" as an empty state | ☑ |
| B3 | Status filters | Chips `role=radiogroup`: Tous / En cours / Terminés / Non commencés (All / In progress / Completed / Not started) | Click | Filters by status (`setStatus`) | Custom radios (buttons `role=radio`, no arrow-key navigation) | lib | Collection › toolbar, segmented control (`role=radiogroup`, ←/→ arrows) | ☑ |
| B4 | Set thumbnail | Card → `Thumbnail` | Auto | Image `/api/library/builds/<id>/thumbnail?v=` | Missing/error → striped placeholder "N pièces" (N parts); link to the detail | lib | Collection › card, full-width thumbnail; illustrated placeholder | ☑ |
| B5 | Generation of missing thumbnails | Offscreen `ThumbnailMaker` (`.offscreen`) | Auto, one build at a time | Local WebGL rendering of the finished model, cropping, PNG sent to the server | Failure or empty geometry → marked "tried", moves on to the next; never external network | lib (indirect) | Unchanged (offscreen rendering); thumbnail skeleton during generation | ☑ |
| B6 | Card info | Card: no., name, part count or "N constructions (a / b pièces)" (N builds (a / b parts)) | — | Summary of the set | Multi-build: the card shows the main build (most recent in progress, otherwise the 1st) | lib | Collection › card, below the thumbnail: no. (mono), name, row of icons | ☑ |
| B7 | File state on the card | `ul.files`: "Modèle 3D ✓/⚠" (3D model), "N notice(s) / Pas de notice" (N instruction booklet(s) / No instructions), "Correspondances ✓ / (brouillon) / Pas de correspondances" (Mappings ✓ / (draft) / No mappings) | — | Availability of resources | Colors ok/error/muted | lib | Collection › card, row of icons with labels (Modèle ✓/⚠, notices, correspondances) | ☑ |
| B8 | Available modes | `ModeChips` | — | Chips "Notice synchronisée / Guidé / Montage libre" (Synced instructions / Guided / Free building) | No mode → "Aucun mode : fichier à réparer" (No mode: file to repair) (red) | lib | Collection › card, neutral mode chips; "Aucun mode : fichier à réparer" kept in red | ☑ |
| B9 | Progress on the card | `ProgressBar` (role=progressbar) + `card-progress` + `StatusBadge` | — | "x/y pièces posées" (x/y parts placed) (+ "(montage libre)" (free building) if free parts), status Jamais commencé / En cours / Terminé (Never started / In progress / Completed) | Status aggregated over all builds of the set | lib, fb | Collection › card: status badge on the thumbnail + progress bar at the bottom of the thumbnail + `card-progress` under the title; Reprendre banner | ☑ |
| B10 | Problems on the card | `p.error role=note` | — | First problem + "(+N)" | E.g. file modified/not found | lib | Collection › card, red alert row under the title (`role=note`), always visible | ☑ |
| B11 | **One-click resume** | Primary button `card-build` | Click | Opens `/atelier/<build>`; label "Construire" / "Reprendre" / "Revoir" (+ "'Modèle B'" if several builds) | Hidden if no mode (file to repair) | lib, lib-omr | Collection › "Reprendre" banner (last build in progress) + primary button of each card (`card-build`); "Réparer" (Repair) if no mode (A10) | ☑ |
| B12 | Details | Secondary button "Détails" | Click | Opens `/sets/<id>` | — | lib | Collection › card, secondary "Détails" button | ☑ |
| B13 | Empty collection | `.empty-state` | No set | Help text + "Ajoute un set" (Add a set) link | Also mentions resuming files from the data folder | lib | Collection › first-launch welcome screen (Add / Demo / LDraw library cards), "Ta collection est vide" (Your collection is empty) kept | ☑ |
| B14 | Detection of data folder files | `DiscoveryPanel` (`discovery`) | Auto; collapsed link-button "N set(s) trouvé(s)… ▾" (N set(s) found…) | Lists the sets present in `models/`, `instructions/`, `mappings/` not yet in the collection | Error → "Détection des fichiers existants indisponible : …" (Detection of existing files unavailable: …); nothing found → panel absent; ignored files in a `<details>` | lib-omr | Collection › detection panel (expandable) below the grid | ☑ |
| B15 | Adoption of a detected set | `Candidate`: Numéro / Nom (Number / Name) fields, checkboxes for instructions, radios for mappings, "Ajouter à ma collection (fichiers laissés en place)" (Add to my collection (files left in place)) button | Click | `libraryApi.adopt` without copying the files; most verified mapping pre-checked | Button disabled without name/number; "Ajout…" (Adding…) during the call; inline error role=alert | lib-omr | Collection › Detection section, one card per set found (fields, instructions, mappings, primary button) | ☑ |
| B16 | Inherited browser saves | `.legacy` (`legacy-saves`) | Auto (localStorage P5/P6) | Lists browser sessions: resumed automatically / to compare (link to the detail) / orphaned ("ajoute ce modèle…" (add this model…)) | Never modified or erased | lib | Collection › collapsible section "Parties enregistrées dans ce navigateur" (Sessions saved in this browser) | ☑ |
| B17 | Footer | `.footer-note` | — | Data folder path, "tout reste sur ce Mac" (everything stays on this Mac), not affiliated with LEGO | — | — | Collection › footer | ☑ |
| B18 | Access to the standalone workshop | Topbar, "Atelier sans collection" link | Click | `/atelier` | Discreet link (small) | — | Collection app bar, discreet "Atelier sans collection" link (tooltip) | ☑ |

## C. Set detail (`/sets/[setId]`)

| ID | Feature | Current location | Trigger | What it does | Special cases | E2E | New location | Verified |
|---|---|---|---|---|---|---|---|---|
| C1 | Rename the set (no. and name) | `.detail-head` inline inputs `detail-number`, `detail-name` + "Enregistrer" (Save) (`detail-save-name`) | Edit then click | `updateSet`; progress and mappings kept | Button visible only if modified; success/error toast | lib | Detail › header: editable no. and name (pencil on hover, Enter saves, Escape restores), "Enregistrer" kept + "Annuler" (Cancel) | ☑ |
| C2 | Panel per build | `BuildPanel` (`build-<id>`) | — | 3D preview + info; one section per build | — | lib | Detail › one Construction card per build | ☑ |
| C3 | 3D preview of the finished model | `ModelPreview` (orbit) | Auto | Full model rendered locally; generates the thumbnail if missing | Loading / error / "Aperçu indisponible : <LDraw reason>" (Preview unavailable: <LDraw reason>) | lib (indirect) | Detail › Construction card, left column (3D preview) | ☑ |
| C4 | Rename a build | Inline input "Nom de la construction" (Build name) + "Enregistrer" | Edit then click | `updateBuild({label})` | Progress kept | lib | Detail › Construction card, editable name (pencil, Enter / Escape) + "Enregistrer" | ☑ |
| C5 | Status + progress | `StatusBadge`, `ProgressBar`, `detail-progress`, mode + date, `detail-free` | — | "x/y pièces posées · mode · date"; in free mode: "N posée(s) librement, a/y à leur place dans le modèle" (N placed freely, a/y in place in the model) | — | lib, fb | Detail › Construction card: status, progress bar, mode, date, free-building detail | ☑ |
| C6 | Build / Resume / Review | Primary button `detail-build` | Click | `/atelier/<id>` | Without a mode: "Construction impossible tant que le modèle 3D n'est pas réparé." (Building impossible until the 3D model is repaired.) | lib | Detail › Construction card, primary button | ☑ |
| C7 | Build modes | `detail-modes` | — | ✓/✗ per mode + reason (sync unavailable: `syncBlocker`; guided: "pas d'étapes dans le fichier" (no steps in the file)) | — | lib | Detail › Construction card, list of ✓/✗ modes with reasons | ☑ |
| C8 | Problems | `detail-problems` role=alert | — | List of problems (different fingerprint, missing file…) | — | lib | Detail › Construction card, red alert under the name (before everything else) | ☑ |
| C9 | Model file + state | `FileLine` (`file-model`, `file-state`) | — | Name, size, "laissé en place / copie de la bibliothèque" (left in place / library copy), state (available / not found / modified size / modified fingerprint / unreadable) | Green/red border; states recomputed from the full SHA-256 | lib | Detail › Files section | ☑ |
| C10 | Repair a file | `RepairInput` (`repair-<sha8>`) | File choice | Accepted only if the SHA-256 is identical; otherwise explicit refusal | Model and instructions | lib | Detail › Files and Notices sections, "Réparer : choisir le fichier d’origine" (Repair: choose the original file) button on the relevant row | ☑ |
| C11 | Verify fingerprints | `detail-check` button + `check-result` | Click | Re-hash of all files | Text result | filet | Detail › Files section, "Vérifier les empreintes" (Verify fingerprints) button | ☑ |
| C12 | Instructions: list, replace, unlink | `FileLine` per booklet + "Remplacer" (Replace) (input) + `ConfirmButton` "Dissocier" (Unlink) | Click | Upload + association; confirmed unlinking (file not deleted) | Two-click confirmation | lib | Detail › Notices (Instructions) section, row actions "Remplacer" and "Dissocier" (inline confirmation kept) | ☑ |
| C13 | Link instructions | `detail-add-pdf` (multiple) | File choice | Upload + association | — | lib | Detail › Notices section, "Associer des notices" (Link instructions) button | ☑ |
| C14 | Mappings: state | `detail-mapping` | — | Valid/draft, steps, verified, assigned parts, linked booklets ✓/✗ | None: help text ("crée-les dans l'atelier" (create them in the workshop)) | lib | Detail › Correspondances (Mappings) section | ☑ |
| C15 | Export the mappings | "Exporter (.json)" (Export (.json)) button | Click | Local download `.brick-mapping.json` | — | filet | Detail › Mappings section, "Exporter (.json)" | ☑ |
| C16 | Import / replace the mappings | `detail-mapping-input` | File choice | Refused if another model (fingerprint, main model, part count); previous version kept in the history | — | lib | Detail › Mappings section, "Importer / Remplacer" (Import / Replace) | ☑ |
| C17 | Compatibility | `dl.facts` + inventory + missing parts + diagnostics `<details>` | — | Parts, references/colors, LDraw steps (type), main model, quality (`detail-quality`), inventory verdict, parts missing from the LDraw library, diagnostics | — | lib (partial) | Detail › collapsible section Compatibilité et diagnostics (Compatibility and diagnostics) (quality in its title; collapsed unless a part is missing or there is an error); missing parts always visible above | ☑ |
| C18 | Save from this browser | `BrowserSavePanel` (`browser-save`) | Auto if different | Differences table (`save-diff`, `diff-*` rows marked `differs`), checkbox "reprendre aussi les correspondances" (also resume the mappings), "Reprendre la sauvegarde de ce navigateur" (Resume the save from this browser) → confirmation | The library version goes to the history | lib | Detail › alert banner under the build name (differences table and inline confirmation, unchanged) | ☑ |
| C19 | Remove the build / the set | `danger-zone` `ConfirmButton` (`detail-remove`, `detail-remove-confirm`) | Two clicks | Progress and mappings → `library/trash`; files kept; back to `/` if last build | Label depends on the number of builds | filet | Detail › sensitive zone at the bottom of the card, confirmation in a modal (`detail-remove`, `detail-remove-confirm`) | ☑ |
| C20 | Add an alternative model | `.add-build`: name + `detail-add-build` | File choice | New build (Model B, C…) with its own progress | File without parts refused | lib, filet | Detail › "Ajouter un modèle alternatif" (Add an alternative model) card after the builds | ☑ |
| C21 | Toasts | `.toast.fixed` (`detail-message`) | Actions | Ok/error message; click to dismiss | Does not disappear on its own | lib | Shared toasts (bottom of the page, × to close), `detail-message` kept | ☑ |

## D. Ajouter un set (Add a set) (`/ajouter`)

| ID | Feature | Current location | Trigger | What it does | Special cases | E2E | New location | Verified |
|---|---|---|---|---|---|---|---|---|
| D1 | Search by number (local) | `search-number` + `search-submit` (form, autofocus) | Enter / click | Normalizes (`31040` → `31040-1`), searches the data folder and the collection | Invalid number → `add-errors` "n'est pas un numéro de set" (is not a set number); "Recherche…" (Searching…) in the topbar (`busy`) | add | Add › Step 1 Fichiers (Files), "Par numéro" (By number) path | ☑ |
| D2 | Variant note | `variant-note` | Number without variant | "Lu comme 90021-1 (variante -1 supposée…)" (Read as 90021-1 (variant -1 assumed…)) | — | add | Add › Step 1, under the number field | ☑ |
| D3 | Quick local import (drag and drop) | `dropzone` (normal / `over` states) | File drop | Stages (`stage`) `.mpd`, `.ldr`, `.pdf`, `.json` without Internet | Refused formats listed ("format non pris en charge" (unsupported format)); progress "Préparation des fichiers (i/n)…" (Preparing files (i/n)…) | add | Add › Step 1, "Depuis mes fichiers" (From my files) path: large drop zone | ☑ |
| D4 | Quick local import (picker) | `quick-input` (multiple) | File choice | Same as D3 | — | add, lib | Add › Step 1, "Choisir des fichiers" (Choose files) button in the drop zone | ☑ |
| D5 | Resources: data folder | `SourcesPanel` `source-local` | After search | "N modèle(s) 3D et N notice(s) trouvés (laissés en place, ajoutés à la sélection)" (N 3D model(s) and N instruction booklet(s) found (left in place, added to the selection)) / "rien pour ce numéro…" (nothing for this number…) | — | add | Add › Step 1, list of sources (Data folder) | ☑ |
| D6 | **Search online (OMR, Rebrickable)** | `search-online` | **Explicit click** | Contacts the OMR (and Rebrickable if a key is set) via the server | Dynamic label "(OMR, Rebrickable)"; "Recherche en ligne…" (Searching online…); absent if offline → "Accès Internet désactivé." (Internet access disabled.) or "Numéro non LEGO : pas de recherche OMR." (Non-LEGO number: no OMR search.) | add, filet | Add › Step 1, sources: "Chercher en ligne" (Search online) button with a globe icon and the note "contacte Internet, seulement sur ce clic" (contacts the Internet, only on this click); offline: note "Accès Internet désactivé… (BRICK_LAB_ONLINE=0)" | ☑ |
| D7 | OMR status | `omr-status` | After D6 | Message (n models including alternatives / none / unavailable 503…) | — | add | Add › Step 1, sources (OMR) | ☑ |
| D8 | **Download an OMR model** | `omr-download-<fichier>` per model | **Explicit click** | Downloads, adds to the selection; "téléchargé ✓" (downloaded ✓) | One download at a time; error "Téléchargement impossible" (Download impossible) | add | Add › Step 1, sources (OMR): "Télécharger" (Download) with a globe icon | ☑ |
| D9 | OMR page link | "Ouvrir la page de l'OMR ↗" (Open the OMR page) | Click | New external tab (set page or search) | — | add | Add › Step 1, sources (OMR), external link ↗ | ☑ |
| D10 | LEGO instructions (manual) | `source-lego` + `lego-link` | Click | Explains the manual download, opens the official page | No automatic retrieval | add | Add › Step 1, sources (Notices LEGO (LEGO instructions)), external link ↗ | ☑ |
| D11 | Rebrickable (optional metadata) | `source-rebrickable` | After D6 | Name, year, announced part count (indicative) or "non configuré" (not configured) | Without an API key: message | add | Add › Step 1, sources (Rebrickable) | ☑ |
| D12 | Nothing found | `nothing-found` | Empty OMR and no file | "Aucun modèle 3D trouvé… import rapide" (No 3D model found… quick import) | — | add | Add › Step 1, empty state of the search | ☑ |
| D13 | Selected files: models | `ResourcesPanel` `model-card` | After staging | Name, size, origin, author, license, source link, "déjà dans la bibliothèque" (already in the library); "Retirer" (Remove) button | — | add | Add › Step 2 Vérification (Check), model file cards | ☑ |
| D14 | Choice of builds | `build-choice`: checkbox `build-check`, name `build-label`, parts/steps/submodels | Edit | Checks/names each root model | Already in the collection → checkbox disabled + `already-in-collection` ("Ouvrir" (Open) link); unreferenced model: note "construction alternative possible" (alternative build possible); parts missing from the library (first 6) | add | Add › Step 2, choice of builds in the model card | ☑ |
| D15 | Advanced details | Model `<details>` | Click | SHA-256, stats per root, diagnostics; "Construire un autre modèle du fichier" (Build another model from the file) (`extra-root`) | — | — | Add › Step 2, collapsible section "Détails avancés" (Advanced details) | ☑ |
| D16 | PDF instructions and associations | `pdf-card`, `pdf-row`, `pdf-assoc` checkboxes | Edit | Associate each booklet with one or more builds; "proposée, non vérifiée" (proposed, unverified) / "liée par les correspondances" (linked by the mappings) | Invalid PDF → inline problem; message "Plusieurs constructions…" (Several builds…) | add | Add › Step 2, PDF instructions card | ☑ |
| D17 | Mappings found | `mapping-card` radios (`mapping-<nom>`) | Choice | Recognized by the model's exact fingerprint; state valid / incomplete | "Aucune" (None) possible | add | Add › Step 2, Mappings card | ☑ |
| D18 | Refused files | `rejected` | Auto | List of name + reason (e.g. "concernent un autre modèle" (concern another model)) | — | add | Add › Step 2, "Fichiers refusés" (Refused files) list (alert) | ☑ |
| D19 | **Compatibility diagnostic** | `compatibility` → `compat-card`: name, parts, modes, `compat-headline`, ok/warn/error/info rows | Auto | Card per checked build: available modes and why | — | add | Add › Step 2, one compatibility card per build (quality badge, modes, reasons) | ☑ |
| D20 | Instructions without a model | `pdf-only` | Only PDFs | "Notice trouvée sans modèle 3D : pas de construction interactive disponible." (Instructions found without a 3D model: no interactive build available.) | — | add | Add › Step 2, "Notice sans modèle 3D" (Instructions without a 3D model) alert | ☑ |
| D21 | Set already in the collection | `existing-set` radios `target-existing` / `target-new` | Auto | Add to the existing set (alternative) or create a second set | Existing progress untouched | add | Add › Step 3 Confirmation, choice of the target | ☑ |
| D22 | Confirmation | `confirm`: `confirm-number`, `confirm-name`, local notice, `confirm-blocker`, `import-submit` | Click | Adds to the collection (copy into `library/`, SHA-256) | Blockers: "Coche au moins une construction" (Check at least one build), "Donne un nom…" (Give a name…), "Saisis le numéro du set" (Enter the set number); number read-only if it comes from the search; default name Rebrickable → OMR → existing set → model title | add | Add › Step 3 + sticky action bar at the bottom (blocker + primary `import-submit` button) | ☑ |
| D23 | Result | `import-done`: title, `already-present`, mappings kept, files added/reused, `import-build`, "Voir le set" (View the set), "Ma collection", `add-another` | After confirmation | Direct links to the workshop (4 max) | "Ajouter un autre set" (Add another set) resets everything | add | Add › Step 4 Prêt (Ready) ("Construire '…'" as primary) | ☑ |
| D24 | Activity indicator | Topbar `busy` (role=status) | Any operation | Status text (Analyse des fichiers… (Analyzing files…), Ajout à la collection… (Adding to the collection…)) | Search button disabled during | add | `/ajouter` app bar (`busy`, `role=status`) + activity indicator in the current step | ☑ |
| D25 | Errors | `add-errors` role=alert | Failures | List of errors | — | add | Add › Step 1, alert under the two inputs (`add-errors`) | ☑ |

## E. Opening a library build (`/atelier/[buildId]`)

| ID | Feature | Current location | Trigger | What it does | Special cases | E2E | New location | Verified |
|---|---|---|---|---|---|---|---|---|
| E1 | Loading steps | `LibraryAtelier` `.atelier-wait` | Opening | "Vérification des fichiers…" (Checking files…) → "Chargement du modèle…" (Loading the model…) → "Lecture de la progression…" (Reading progress…) → "Chargement des notices (i/n)…" (Loading instruction booklets (i/n)…) | Text only, no visual indicator | lib | Workshop › loading screen: activity indicator + list of steps (current step in bold) | ☑ |
| E2 | Blocking error | `atelier-error` (role=alert) | Invalid/missing model file/fingerprint | "Impossible d'ouvrir cette construction" (Unable to open this build), reason, "Rien n'a été chargé à la place…" (Nothing was loaded in its place…), "Réparer depuis le détail du set" (Repair from the set detail) link | No substitute loaded | lib | Workshop › error screen (illustration, reason, "Réparer depuis le détail du set" as primary) | ☑ |
| E3 | Choice between two saves | `ChoiceScreen` (`progress-choice`): `save-diff` table, `choice-with-mapping` checkbox, `choice-library` / `choice-browser` | Diverging saves | Explicit choice, the other one kept | Variant "library save no longer matches" | lib | Workshop › choice screen: two cards side by side (Bibliothèque (Library) / Ce navigateur (This browser)) + differences table | ☑ |
| E4 | Opening notes | `atelier-notes` banner + "OK" | Migration/choice/instructions not loaded | Explains what was or was not resumed | Dismissible | lib | Workshop › information banner under the app bar, dismissible | ☑ |
| E5 | Automatic opening of model + instructions | `BrickLabApp initial` | Auto | Model and booklets loaded from the library; last booklet shown at the saved page | No manual import possible in this context | lib, lib-omr | Unchanged (automatic loading) | ☑ |

## F. Workshop — common frame

| ID | Feature | Current location | Trigger | What it does | Special cases | E2E | New location | Verified |
|---|---|---|---|---|---|---|---|---|
| F1 | Workshop topbar | `header.topbar` | — | Navigation (nav), file name (standalone workshop), session indicators | — | all | Workshop › App bar (breadcrumb, mode, progress, save, help, theme) | ☑ |
| F2 | Step indicator | `step-indicator` | Guided and synced modes | "Étape i / n" (Step i / n) | — | brick, sync | Workshop › App bar, under the progress counter | ☑ |
| F3 | Instructions step | `notice-step` | Synced mode | "Notice : Étape 2 (×2), p. 2" (Instructions: Step 2 (×2), p. 2) | — | sync | Workshop › App bar, under the counter (sync mode) + step card of the Notice panel | ☑ |
| F4 | Current mode | "Montage libre" text | Free mode | Indicates the mode | Guided/sync: no mode label in the topbar | — | Workshop › App bar, segmented mode selector (active mode) | ☑ |
| F5 | **Progress** | `progress` | Session in progress | "x/y pièces posées" | Always visible during a session | all | Workshop › App bar, progress bar + "x/y pièces posées" (`progress`) | ☑ |
| F6 | Free-building detail | `free-info` | Free parts | "N posée(s) librement · a à leur place dans le modèle" (N placed freely · a in place in the model) | — | fb | Workshop › App bar, under the counter (`free-info`) | ☑ |
| F7 | Save state | `save-state` (library) / "Sauvegardé localement" (Saved locally) (standalone) | Auto | Enregistrement… / Enregistré dans la bibliothèque / Non enregistré : … (Saving… / Saved in the library / Not saved: …) (role=alert) | Error and conflict in red | lib | Workshop › App bar, save state (icon + text; error in red, `role=alert`) | ☑ |
| F8 | Save conflict | `save-conflict` banner + "Recharger" (Reload) | Another tab wrote | Explains and offers to reload | — | lib | Workshop › alert banner under the app bar + "Recharger" | ☑ |
| F9 | Library banner | `banner` (notes E4) | — | Under the topbar | — | lib | Workshop › banner under the app bar | ☑ |
| F10 | Resizable splitter | `Splitter` (`splitter`, role=separator) | Drag / double-click / ← → (Shift ×5) / Home / End / Enter | Width of the side panel, remembered per context (workshop/editor) in localStorage, as a proportion | Limits: panel ≥ 280 px, 3D view ≥ 320 px; during drag the 3D view ignores the pointer | ux | Workshop › splitter (visible handle) + panel collapse button | ☑ |
| F11 | Panel tabs | `nav.tabs role=tablist`: Modèle / Notice PDF / Correspondances (Model / PDF instructions / Mappings) | Click | Changes the panel content | "Correspondances" only if a model is loaded; no arrow-key navigation; sync mode switches automatically to Notice | sync, ux | Workshop › panel, tabs Démarrer/Étape · Notice · Correspondances (`role=tablist`, ←/→ arrows, `tabpanel`) | ☑ |
| F12 | Workshop toast | `message` (role=status), at the bottom left of the 3D view | Every action | Instructions, success (green), errors (red) | Persistent until the next message; `pointer-events:none`; can be long (full shortcut instructions) | all | Workshop › toast at the bottom left of the scene (results, × to close); instructions → scene caption (A6) | ☑ |
| F13 | Recenter the camera | "Centrer" (Center) button (tray bar) | Click | Puts the camera back on the model | — | ux, brick | Workshop › scene tool rail, "Centrer" icon (`aria-label`) | ☑ |

## G. Workshop — Model panel, diagnostic and mode choice

| ID | Feature | Current location | Trigger | What it does | Special cases | E2E | New location | Verified |
|---|---|---|---|---|---|---|---|---|
| G1 | Model summary | `ModelSummary`: title, `quality`, parts (`occurrence-count`), references, colors, submodels, steps (`step-count` + type), author, license | After import | Model card | — | brick | Workshop › Model tab: mode cards first, then the model summary | ☑ |
| G2 | **Quality badge** | `quality` (`q-INVALID / ANALYSABLE / RENDERABLE / MANUAL_ONLY / GUIDED_PLAYABLE`) | — | Invalide / Analysable (incomplete or unverified rendering) / Affichable / Montage libre uniquement / Jouable avec étapes 3D (Invalid / Analyzable / Displayable / Free building only / Playable with 3D steps) | Red/amber/blue/green colors | brick | Workshop › Démarrer tab, quality badge (`QualityBadge`) | ☑ |
| G3 | Choice of the main model | "Modèle principal" (Main model) select | Several candidates (standalone) | Re-analysis with the chosen root | Library: text only (frozen identity) | — | Workshop › Démarrer tab, "Modèle principal" selector | ☑ |
| G4 | Rendering state | `render-status` | — | "Géométrie LDraw : N combinaison(s), M référence(s) manquante(s), t ms" (LDraw geometry: N combination(s), M missing reference(s), t ms) or "Rendu indisponible : <raison>" (Rendering unavailable: <reason>) | — | brick | Workshop › Démarrer tab, rendering state line | ☑ |
| G5 | **Missing parts** | `missing-parts` | Parts not found | List of references absent from the local library | — | brick | Workshop › Démarrer tab, "Pièces absentes" (Missing parts) alert (red) | ☑ |
| G6 | **Inventory check** | `inventory-check` (role=note if not consistent) | — | ✓ consistent / ⚠ undetermined / incomplete / not verified against the official instructions | — | omr | Workshop › Démarrer tab, inventory line | ☑ |
| G7 | Classification reasons | `ul.reasons` | — | Grounds for the quality classification | — | — | Workshop › Démarrer tab, reasons under the badge | ☑ |
| G8 | Detailed diagnostics | `<details>` "Diagnostics (n problème(s), m info(s))" (n problem(s), m info(s)) | Click | List [severity] message (line) — 200 max | — | — | Workshop › Démarrer tab, collapsible Diagnostics section | ☑ |
| G9 | **Start — synced instructions** | Primary button | Click | `start('synced')`, switches to the Notice tab | Shown only if valid mappings | sync | Workshop › Model tab, "Notice synchronisée" (Synced instructions) card ("Commencer — notice synchronisée" (Start — synced instructions) button) | ☑ |
| G10 | **Start — guided mode** | Button (primary if no sync) | Click | `start('guided')` | Shown only if the file has steps | brick | Workshop › Model tab, "Mode guidé" (Guided mode) card ("Commencer — mode guidé" (Start — guided mode) button) | ☑ |
| G11 | **Free building (with instructions)** | Secondary button | Click | `start('freeManual')` | Always offered if playable | brick, fb | Workshop › Model tab, "Montage libre" (Free building) card ("Montage libre (avec notice)" (Free building (with instructions)) button) | ☑ |
| G12 | **Steps not available** | Text under the buttons | `plan.kind === 'NO_STEPS'` | "Étapes non disponibles dans ce fichier : aucune séquence n'est inventée." (Steps not available in this file: no sequence is invented.) | — | brick | Workshop › Model tab, "Mode guidé" card without a button, with this text; info in the mode selector | ☑ |
| G13 | **Sync availability** | `sync-availability` | Playable model | "Notice synchronisée disponible : N étape(s)…" (Synced instructions available: N step(s)…) or "indisponible : <raison>" (unavailable: <reason>) + "Créer / Modifier les correspondances" (Create / Edit the mappings) button | — | sync | Workshop › Model tab: "Notice synchronisée" card (reason if unavailable) + `sync-availability` line and Create/Edit the mappings button | ☑ |
| G14 | **Viewing only** | Text | Not playable (ANALYSABLE) | "Visualisation seulement tant que des pièces manquent." (Viewing only while parts are missing.) | No start button | brick, filet | Workshop › Model tab: note "Visualisation seulement…" (+ LDraw library cause) in place of the cards | ☑ |
| G15 | Import another model | Label-button (standalone workshop) | File choice | Replaces the current model | Absent in library | brick | Workshop › Démarrer tab, secondary "Importer un autre modèle" (Import another model) button (input in the `<aside>`) | ☑ |
| G16 | No model | "Aucun modèle importé." (No model imported.) text | Empty Model tab | — | — | — | Workshop › scene: home screen of the standalone workshop; Model tab: "Aucun modèle importé." | ☑ |

## H. Guided mode (LDraw steps)

| ID | Feature | Current location | Trigger | What it does | Special cases | E2E | New location | Verified |
|---|---|---|---|---|---|---|---|---|
| H1 | Slots of the step | Scene: blue ghosts | Guided mode, "Montrer les emplacements" (Show the slots) checked by default | Displays the targets of the active step | — | brick | Workshop › scene (ghosts); tool rail "Montrer les emplacements" | ☑ |
| H2 | Pick up a part | Tray → click on a part | Click | Part in hand, follows the pointer; instruction in the toast | Default orientation = 1st target orientation | brick | Workshop › tray | ☑ |
| H3 | Snapping to the target | Scene | Hover | The part sits on the targeted surface; target found → `target-found` "emplacement trouvé, clic pour poser" (slot found, click to place) | — | brick, surf | Workshop › scene + HUD ("emplacement trouvé", green) | ☑ |
| H4 | Place | Click in the scene | Click | `tryPlace`; success "Pièce posée (x/y)" (Part placed (x/y)); explicit refusal ("Trop loin" (Too far), orientation…) | Click with drag ≤ 4 px = click; > 4 px = orbit | brick, surf | Workshop › scene; result as a toast | ☑ |
| H5 | Move to the next step | Auto | Step complete | `step-indicator` advances | — | brick | Workshop › App bar (step) + panel, Étape tab | ☑ |
| H6 | End of model | Footer: "Modèle terminé : y/y pièces." (Model complete: y/y parts.) + "Recommencer" (Start over); toast "Bravo, modèle terminé !" (Well done, model complete!) | Last part | — | "Recommencer" asks for confirmation in the library | brick | Workshop › end block in the tray area ("Recommencer" → confirmation modal) | ☑ |
| H7 | Manual level | PageUp/PageDown; `held-info` "Niveau manuel i/n (A : auto)" (Manual level i/n (A: auto)); A = auto | Keyboard | Chooses a level of the model when the surface is not enough | — | surf | Workshop › HUD ("Niveau manuel i/n"); contextual caption | ☑ |
| H8 | Info on the part in hand | `held-info` in the tray bar | Part in hand | Level, rotation, orientation i/n, target found | — | brick | Workshop › HUD | ☑ |
| H9 | Reset the step | "Réinitialiser l'étape" (Reset the step) button | Click | Removes the parts of the active step | No confirmation | filet | Workshop › tray action column, discreet "Réinitialiser l’étape" button | ☑ |
| H10 | Placed part not selectable | Scene | — | In guided mode, a click on a placed part does nothing | — | fh | Unchanged | ☑ |

## I. Synced instructions (`synced` mode)

| ID | Feature | Current location | Trigger | What it does | Special cases | E2E | New location | Verified |
|---|---|---|---|---|---|---|---|---|
| I1 | Page driven by the step | `PdfPanel` + `showStepPage` effect | Step change | The booklet page of the step is displayed | Caption "page pilotée par l'étape de notice en cours" (page driven by the current instructions step) | sync | Workshop › Notice panel | ☑ |
| I2 | Step banner | `SyncStepBanner` (`sync-banner`): `sync-step`, booklet, `sync-page`, position on the page ("1re étape imprimée sur 2" (1st printed step of 2)), parts of the step | Auto | Context of the step above the PDF | "Viewing" state (amber) | sync | Workshop › Notice panel, step card above the page | ☑ |
| I3 | Booklet not open | `sync-missing-booklet` | Expected booklet missing | "Livret non ouvert : importe « x » (n p.)… Un autre PDF ne sera pas utilisé à sa place." (Booklet not open: import "x" (n p.)… Another PDF will not be used in its place.) | — | sync | Workshop › step card, "Livret non ouvert" alert | ☑ |
| I4 | Off-step page | `sync-off-page` + "Revenir à la p. N" (Back to p. N) | Manual navigation | Warns and offers to go back | — | sync | Workshop › step card, alert + "Revenir à la p. N" | ☑ |
| I5 | View a past step | "◀ Étape précédente" (Previous step), "Étape suivante ▶" (Next step), "Revenir à l'étape en cours" (Back to the current step) | Click | Highlights the parts of the viewed step | Part in hand released | sync | Workshop › step card, ◀ ▶ navigation + "Revenir à l'étape en cours" | ☑ |
| I6 | Resume from a step | `sync-rewind` | Click | Removes the parts of the following steps; explanatory toast | **Destructive without confirmation** (reversible with Annuler? not verified) | sync | Workshop › step card, "Reprendre depuis cette étape" (Resume from this step) → confirmation (A5) | ☑ |
| I7 | Only the parts of the step | Tray | Auto | The tray offers only the step | — | sync | Workshop › tray | ☑ |
| I8 | Automatic advance | Auto | Step finished | Toast "Étape 1 terminée ! Suivante : Étape 2 (×2), p. 2." (Step 1 finished! Next: Step 2 (×2), p. 2.) | — | sync | Workshop › toast + app bar | ☑ |
| I9 | Fallback if mappings are invalid | Auto | Mapping erased/invalid, or resume without a valid mapping | Switches to free building, parts kept, explicit error toast | — | sync | Workshop › error toast + mode selector | ☑ |

## J. Free building

| ID | Feature | Current location | Trigger | What it does | Special cases | E2E | New location | Verified |
|---|---|---|---|---|---|---|---|---|
| J1 | Placement at the pointer | Scene | Hover + click | The part sits on the targeted surface (½-stud grid); "pose libre" / "à sa place dans le modèle" (free placement / in place in the model) | — | fb, surf | Workshop › scene + HUD ("pose libre" / "à sa place") | ☑ |
| J2 | Manipulation bar (part in hand) | `manip-bar` at the top of the 3D view | Part in hand | Status line (`held-info`, `height-info` "bas à N LDU du sol" (bottom N LDU above the floor), `orientation-info` "Dessus : … · Avant : …" (Top: … · Front: …)) + controls | — | fh, f3d | Workshop › HUD at the top left of the scene (`held-info`, `height-info`, `orientation-info`) + "in hand" contextual bar at the top of the scene | ☑ |
| J3 | Free height | `lift-up` "▲ Monter" (Up), `lift-down` "▼ Descendre" (Down); PageUp/PageDown | Click/keyboard | Moves up/down by one step | Shift: 1 LDU | fh | Workshop › "in hand" contextual bar (top of the scene), ↑ ↓ arrows (Page ↑ / Page ↓) | ☑ |
| J4 | Height step | Segmented `step-8` / `step-1` (8 LDU / 1 LDU) | Click | Chooses the step | — | fh | Workshop › "in hand" contextual bar, segmented 8 LDU / 1 LDU | ☑ |
| J5 | Auto height | `height-auto` (A) | Click/keyboard | Returns to the surface | Disabled if already auto | fh | Workshop › "in hand" contextual bar, "Auto" button (A) | ☑ |
| J6 | X/Y/Z rotations | "Rotations" group: `rot-step-90/45/15/5/1` (rotation step, 90° by default); `rot-x-minus/plus`, `rot-y-…`, `rot-z-…` (± one step); X/Y/Z (Shift: reverse direction); R = Y | Click/keyboard | Rotates the part in hand, or the selection in place | Colored axes (X red, Y green, Z blue) drawn on the part in hand. Guided / synced modes: reduced "in hand" bar (`manip-bar`: X/Y/Z ± 90°, no step choice, and "Lâcher" (Drop)); an orientation absent from the model is flagged "orientation hors modèle" (orientation outside the model) in `held-info`, O goes back to those of the model | f3d, brick | Workshop › contextual bar (in hand and selection), group of steps 90° 45° 15° 5° 1° · X − + · Y − + · Z − + | ☑ |
| J7 | Next orientation | O; "Orientation suivante (O)" (Next orientation (O)) button (tray bar) | Keyboard/click | Cycles through the model's target orientations | Button only if there is > 1 orientation; inactive for a group | surf | Workshop › tray action column ("Orientation suivante"); O key | ☑ |
| J8 | Put back in stock (in hand) | `remove-piece` "Remettre dans le stock (Suppr)" (Put back in stock (Del)) | Click / Del / ⌫ | Removes the picked-up part or group | — | fb | Workshop › "in hand" contextual bar, "Au stock" (To stock) (Del) | ☑ |
| J9 | Drop / leave in place | `cancel-held` "Lâcher (Échap)" (Drop (Esc)) / "Laisser en place (Échap)" (Leave in place (Esc)) | Click / Esc | Cancels the pick-up | — | fb | Workshop › "in hand" contextual bar, "Lâcher" / "Laisser en place" (Esc) | ☑ |
| J10 | Selection | Click on a placed part; Shift+click adds/removes; click in empty space clears the selection | Mouse | Highlighted selection (amber); instruction toast | — | fh, f3d | Workshop › scene; HUD "N pièce(s) sélectionnée(s)" (N part(s) selected) | ☑ |
| J11 | Manipulation bar (selection) | `manip-bar`: `selection-info`, `orientation-info`, `gizmo-coords` | Non-empty selection | State + selection controls | — | fg | Workshop › HUD (`selection-info`, orientation, `gizmo-coords`) + "selection" contextual bar at the top of the scene | ☑ |
| J12 | Manipulator: arrows/rings | Segmented `gizmo-translate` "Flèches" (Arrows) (W) / `gizmo-rotate` "Anneaux" (Rings) (E) | Click/keyboard | Gizmo mode | — | fg | Workshop › "selection" contextual bar, segmented Flèches / Anneaux (icons, W / E) | ☑ |
| J13 | Manipulator: axes | Segmented `gizmo-world` "Globaux" (Global) / `gizmo-local` "Locaux" (Local) (Q toggles) | Click/keyboard | Gizmo reference frame | — | fg | Workshop › "selection" contextual bar, segmented Globaux / Locaux (icons, Q) | ☑ |
| J14 | Manipulator: step | `gizmo-step` select (½ stud / stud / 1 LDU) ; rings: the rotation step from J6 | Choice | Step of the arrows and rings | ⌥ during drag: no step; grid disabled → free step | fg | Workshop › "selection" contextual bar, "Réglages" (Settings) row (`manip-settings`): arrow step | ☑ |
| J15 | Typed coordinates | `gizmo-x/y/z` fields + `gizmo-apply` (Enter) | Typing | Moves the selection to the typed point (Y = height above the floor) | Comma accepted; invalid → "Coordonnées invalides." (Invalid coordinates.) | fg | Workshop › "Réglages" row of the "selection" bar: X Y Z coordinates + "Appliquer" (Apply) (Enter) | ☑ |
| J16 | Gizmo drag | Scene: arrows and rings | Drag | Moves/rotates by steps from the start of the drag; a single Undo | Esc during drag: cancels; other keys ignored during drag | fg | Workshop › scene (gizmo); unchanged | ☑ |
| J17 | Move the selection | `move-selection` "Déplacer (M)" (Move (M)); M | Click/keyboard | Picks up the selection (rigid group) | — | fh | Workshop › "selection" contextual bar, "Déplacer" (M) | ☑ |
| J18 | Selection to stock | `remove-selection` "Au stock" (To stock); Del/⌫ | Click/keyboard | Puts the selected parts back in the stock | No confirmation; undoable | fb | Workshop › "selection" contextual bar, "Au stock" (Del) | ☑ |
| J19 | Select the assembly | `select-assembly` "Assemblage" (Assembly); double-click on a part; Shift + double-click | Click / double-click (< 400 ms) | Selects all parts linked by recognized connections, even hidden ones; with Shift, adds them to the selection (several assemblies together) | None → explanatory toast (clips, bars, hinges not recognized) | f3d, fah | Workshop › "selection" contextual bar, "Assemblage"; double-click in the scene | ☑ |
| J20 | View connections | `xray` (aria-pressed) | Toggle | Other parts transparent (display only) | Active only with a selection and nothing in hand | f3d | Workshop › tool rail, "Voir les connexions" (View connections) button (present with a selection and nothing in hand) | ☑ |
| J21 | Deselect | `clear-selection`; Esc | Click/keyboard | Clears the selection | — | fh | Workshop › "selection" contextual bar, × button (Esc) | ☑ |
| J22 | Direct drag of a placed part | Scene | Press + move > 4 px | Picks up the part (or the selection if it is part of it; Shift at the start adds it) and places it on release | Camera suspended during the drag; Esc cancels | f3d | Workshop › scene; unchanged | ☑ |
| J23 | Part magnet (studs/receptacles, pins/holes, axles) | `snap-pieces` checkbox "Aimant pièces" (Part magnet); holding ⌥ ignores it | Hover | Suggests the fit; `snap-info` "aimant : N tenon(s) emboîté(s) sur k pièce(s) (⌥ : ignorer)" (magnet: N stud(s) snapped onto k part(s) (⌥: ignore)); green dots on the connectors | — | fc, f3d | Workshop › tool rail ("Aimant pièces", `aria-pressed`) + HUD (`snap-info`) | ☑ |
| J24 | Explanation of missing magnet | `snap-miss` | Hover | "aucune connexion reconnue…" (no connection recognized…), "axes non alignés — tourne la pièce" (axes not aligned — rotate the part), "connecteurs déjà occupés" (connectors already occupied) | — | fc | Workshop › HUD (`snap-miss`, amber) | ☑ |
| J25 | Model magnet | `snap-model` checkbox "Aimant modèle" (Model magnet) | Toggle | The part snaps to its official place when it is close | — | fc | Workshop › tool rail ("Aimant modèle") | ☑ |
| J26 | Grid | `snap-grid` checkbox "Grille" (Grid); G | Toggle | ½-stud grid and plate levels | — | — | Workshop › tool rail ("Grille", G) | ☑ |
| J27 | Picked-up part | Click on a placed part then… (see J22); `held-info` "Pièce reprise · …" (Part picked up · …) | — | Move/rotate/remove a placed part | — | fb | Workshop › scene + HUD ("Pièce reprise") | ☑ |
| J28 | Move a group | Group in hand | Click to place | All or nothing, a single Undo; "Groupe de N pièces déplacé" (Group of N parts moved) | — | fh, fah | Workshop › scene + toast | ☑ |
| J29 | End of stock | Footer `free-done` | All parts placed | "Toutes les pièces sont posées (y/y). Montage libre : ta construction n'est pas comparée au modèle officiel — a pièce(s) à leur place" (All parts are placed (y/y). Free building: your build is not compared to the official model — a part(s) in place) or "modèle reconstruit" (model rebuilt) | Honesty: never presented as the official model | fb | Workshop › panel, free-building end screen (text unchanged) + tray area | ☑ |
| J30 | Leave free building | `mode-select` select | Change | Parts in place are kept; parts outside the model → `mode-switch-confirm` confirmation ("Retirer et changer de mode" (Remove and change mode) / "Rester en montage libre" (Stay in free building)) | Guided stays strict | fb | Workshop › mode selector; confirmation in a modal (`mode-switch-confirm`) | ☑ |

## K. Parts tray and action bar (workshop footer)

| ID | Feature | Current location | Trigger | What it does | Special cases | E2E | New location | Verified |
|---|---|---|---|---|---|---|---|---|
| K1 | Parts tray | `PartsTray` `ul.tray-items` (fixed height 188 px, internal scrolling) | Session in progress | One tile per reference/color: thumbnail, "×remaining", reference | Fixed height so as not to desynchronize 3D picking | ux, brick | Workshop › tray (fixed 188 px height kept) | ☑ |
| K2 | Real part thumbnails | `PartThumb` | Auto | Local rendering of the LDraw geometry | Loading (color dot); missing → "forme indisponible" (shape unavailable) (`data-thumb=missing`) | ux | Workshop › tray, tiles | ☑ |
| K3 | Part in hand in the tray | `.tray-item.held` + "en main" (in hand) badge; `aria-pressed` | Pick-up | Indicates the held part | — | ux | Workshop › tray, tile in hand (accent outline + badge) | ☑ |
| K4 | Tooltip and label of the tiles | `title`, `aria-label` | Hover / screen reader | "3001 · Red (4) · 2/4 à poser" (2/4 to place); "Pièce 3001, Red, 2 à poser" | — | ux | Unchanged (`title`, `aria-label`) | ☑ |
| K5 | No part | "Aucune pièce à placer." (No part to place.) | Empty tray | — | — | — | Workshop › tray, empty state | ☑ |
| K6 | **Undo** | "Annuler" button; ⌘Z / Ctrl+Z | Click/keyboard | Guided/sync: last placement; free: last change (history of 200, lost on reload), otherwise last part | Disabled if nothing to undo | all | Workshop › tray actions, "Annuler" button (⌘Z shown) | ☑ |
| K7 | Change mode | `mode-select` select (`Mode`) | Choice | Switches while keeping the parts (see J30) | Options filtered by availability | brick, fb, sync | Workshop › app bar, segmented selector (A3); unavailable modes disabled with their reason | ☑ |
| K8 | Show the slots | "Montrer les emplacements" checkbox | Toggle | Ghosts of the targets (all in guided; in free, those of the held part) | Checked by default in guided/sync | filet | Workshop › tool rail ("Montrer les emplacements") | ☑ |
| K9 | Place at the target position (assist) | `assist-place` | Click (part in hand) | Places the part at the nearest free slot (accessibility) | Disabled without a part in hand | surf, brick | Workshop › tray actions, "Poser à la position cible (aide)" (Place at the target position (assist)) | ☑ |
| K10 | **Abandon** | "Abandonner" (Abandon) button → `confirm-restart` "Confirmer l'abandon" (Confirm abandoning) / "Annuler" | Click | Erases progress (library: copy into the history) | **Standalone workshop: no confirmation** (immediate erasure of localStorage) | filet | Workshop › tray action column, "Abandonner" (discreet, red) → confirmation modal, standalone workshop included (A5) | ☑ |
| K11 | Start over (end) | Button in `.done` | Click | Same effect as K10; "Confirmer : recommencer" (Confirm: start over) in the library | — | — | Workshop › end block of the tray area → same confirmation modal | ☑ |

## L. PDF instructions

| ID | Feature | Current location | Trigger | What it does | Special cases | E2E | New location | Verified |
|---|---|---|---|---|---|---|---|---|
| L1 | Import instructions | `pdf-input` ("Importer une notice PDF" (Import a PDF instruction booklet) / "Ajouter / changer de livret" (Add / change booklet)) | File choice | Local reading (File API), SHA-256, nothing sent | > 300 MB, protected, invalid → error role=alert; 6 booklets max in memory | brick, sync | Workshop › Notice panel, empty state (import button) then "Ajouter un livret" icon | ☑ |
| L2 | Several booklets | `pdf-booklet` select | Choice | Changes booklet (page 1) | Visible if > 1 booklet | sync | Workshop › Notice panel, booklet select in the bar | ☑ |
| L3 | Navigation | "◀" / "▶" (Page précédente/suivante (Previous/Next page)), `pdf-page` "PDF p. i / n" | Click | Page independent of the 3D steps (outside sync) | Disabled at the limits | brick | Workshop › Notice panel, bar: ‹ "PDF p. i / n" › (icons, names "Page précédente" / "Page suivante") | ☑ |
| L4 | Zoom | "−" / "+", `pdf-zoom` ("Largeur" (Width) or "N %"), "↔" Ajuster à la largeur (Fit to width) | Click | Fit to width by default; fixed zooms 50–300% | — | ux, brick | Workshop › Notice panel, bar: zoom − "Largeur" + and ↔ (icons) | ☑ |
| L5 | Fit to the panel | ResizeObserver | Resize | Sharp re-render after 120 ms | Serialized rendering (no concurrent rendering) | ux | Unchanged | ☑ |
| L6 | Contextual caption | `p.muted` | — | "page PDF indépendante des étapes 3D" (PDF page independent of the 3D steps) / "pilotée par l'étape" (driven by the step) / "page de l'étape éditée" (page of the edited step) | — | — | Workshop › Notice panel, one-line caption above the page (file — context) | ☑ |
| L7 | Privacy reassurance | Text without a PDF | — | "Ta notice reste sur ce Mac… n'est pas sauvegardée." (Your instruction booklet stays on this Mac… is not saved.) | Standalone workshop; in the library the booklets come from the library | — | Workshop › Notice panel, empty state | ☑ |
| L8 | Reading in progress | "Lecture du PDF…" (Reading the PDF…) | Opening | — | — | — | Workshop › Notice panel, "Lecture du PDF…" indicator (role=status) | ☑ |
| L9 | Rendering error | role=alert "Erreur de rendu de la page N." (Rendering error on page N.) | Failure | — | — | — | Workshop › Notice panel, alert | ☑ |
| L10 | Resizable panel | See F10 | — | — | — | ux | Workshop › splitter + panel collapse | ☑ |
| L11 | LEGO.com link | Standalone workshop home | Click | Opens the official page (no automatic download) | — | — | Workshop › standalone workshop home screen + Add › Step 1 (sources) | ☑ |

## M. Mapping editor (pages ↔ steps)

| ID | Feature | Current location | Trigger | What it does | Special cases | E2E | New location | Verified |
|---|---|---|---|---|---|---|---|---|
| M1 | Open the editor | "Correspondances" tab or "Créer / Modifier les correspondances" button | Click | Creates an empty mapping if needed; panel widened ("editor" context, 520 px); compact PDF | Part in hand released; tray hidden | sync | Workshop › Correspondances tab (widened panel); link from the "Notice synchronisée" card of the Démarrer tab | ☑ |
| M2 | Status and coverage | `mapping-status` (Valide / Brouillon : n bloquant(s) (Valid / Draft: n blocking)), `mapping-coverage` | — | — | — | sync | Workshop › editor, header | ☑ |
| M3 | Finish editing | "Terminer l'édition" (Finish editing) button | Click | Back to the Notice tab (sync) or Model | — | sync | Workshop › editor, header ("Terminer l'édition" button) | ☑ |
| M4 | Booklets | `<details>` "Livrets (n)" (Booklets (n)): rename, state (open / to re-import), "Lier au PDF affiché" (Link to the displayed PDF), "Retirer", `add-booklet` "Ajouter le PDF affiché comme livret" (Add the displayed PDF as a booklet) | Click | Management of booklets linked by fingerprint | Removal refused if used by steps | sync | Workshop › editor, collapsible Livrets section | ☑ |
| M5 | Navigation between steps | "◀" / `mapping-step-select` select / "▶" | Click/choice | Changes the edited step; the PDF follows its page | Option: "i. Étape — livret p. N (k) ✓" (i. Step — booklet p. N (k) ✓) | sync | Workshop › editor, step navigation bar | ☑ |
| M6 | New step | `mapping-new-step` "+ Nouvelle étape" (+ New step) | Click | Inserts after the current step, at the displayed booklet/page | Without a booklet → message | sync | Workshop › editor, navigation bar ("+ Nouvelle étape") | ☑ |
| M7 | Step fields | Livret (Booklet), `mapping-page`, "= page affichée (N)" (= displayed page (N)), `mapping-printed` (N° imprimé (Printed no.)), `mapping-callout` (encadré (boxed)), `mapping-repeat` (×), `mapping-verified`, note | Edit | Immediate update + save | — | sync | Workshop › editor, step form as a grid with aligned labels | ☑ |
| M8 | Move up / down / delete the step | Buttons "↑ Monter" (Move up), "↓ Descendre" (Move down), "Supprimer l'étape" (Delete the step) | Click | Reorders / deletes (parts become unassigned again) | Deletion without confirmation | filet | Workshop › editor, under the form: "↑ Monter", "↓ Descendre", "Supprimer l’étape" (red, no confirmation: unchanged, to be decided) | ☑ |
| M9 | Assign in 3D | Click on a ghost part (assign) or a highlighted one (remove); ⌥-click: move from another step | Mouse | Toast "ajoutée à / retirée de / déplacée dans" (added to / removed from / moved to); "déjà dans … : ⌥-clic pour la déplacer ici" (already in …: ⌥-click to move it here) | 3D preview: built up to the step, step highlighted, unassigned as ghosts | sync | Workshop › scene; instruction (click icon) above the parts of the step | ☑ |
| M10 | Parts of the step | Chips + "−1" (`step-remove-<clé>`) | Click | Removes a part | — | sync | Workshop › editor, "Pièces de cette étape" (Parts of this step) chips | ☑ |
| M11 | Unassigned parts | Chips + "+1" (`unassigned-add-<clé>`), "+N" | Click | Adds the 1st free part (file order) or all | — | sync | Workshop › editor, "Non affectées" (Unassigned) chips | ☑ |
| M12 | LDraw steps helper | "Étape LDraw" (LDraw step) select + `assign-ldraw-step` | Click | Adds the free parts of an LDraw step | Warns that the split differs from the instructions | sync | Workshop › editor, "Aide : étapes LDraw" (Help: LDraw steps) box | ☑ |
| M13 | Duplicates | `mapping-duplicates` + "Garder la première étape" (Keep the first step) | Click | Resolves duplicates | — | sync | Workshop › editor, Duplicates alert | ☑ |
| M14 | Validation | `<details>` "Validation (n remarque(s))" (Validation (n remark(s))) `mapping-issues` + "voir" (see) links | — | Blocking / warning / info | Open by default if draft | sync | Workshop › editor, collapsible Validation section | ☑ |
| M15 | Ghosts of the following steps | "Montrer en fantôme les pièces des étapes suivantes" (Show the parts of the following steps as ghosts) checkbox | Toggle | 3D preview | — | sync | Workshop › editor, checkbox under the Validation section | ☑ |
| M16 | Export | `mapping-export` "Exporter (.json)" | Click | Downloads `.brick-mapping.json` (identifiers, pages, fingerprints only) | — | sync | Workshop › editor, footer: "Exporter (.json)" | ☑ |
| M17 | Import | `mapping-import` "Importer un fichier de correspondances" (Import a mappings file) | Choice | Refused if another model; otherwise replaces (old one restorable) | — | sync | Workshop › editor, footer: "Importer un fichier de correspondances" | ☑ |
| M18 | Clear all | "Tout effacer" (Clear all) → "Confirmer l'effacement" (Confirm clearing) | Two clicks | Empties the mappings (restorable) | — | filet | Workshop › editor, footer: "Tout effacer" → confirmation modal ("Confirmer l’effacement") | ☑ |
| M19 | Restore the previous ones | "Correspondances précédentes remplacées. Les restaurer" (Previous mappings replaced. Restore them) | Click | Undoes an import or a clearing | — | filet | Workshop › editor, notice "Correspondances précédentes remplacées" + "Les restaurer" link | ☑ |
| M20 | Privacy notice | Text at the bottom of the editor | — | "Sauvegarde locale automatique… aucun contenu de la notice." (Automatic local save… no content of the instruction booklet.) | — | — | Workshop › editor, section footer | ☑ |

## N. Workshop without a collection — manual import and resume

| ID | Feature | Current location | Trigger | What it does | Special cases | E2E | New location | Verified |
|---|---|---|---|---|---|---|---|---|
| N1 | Workshop home screen | `.home` in the 3D view | No model | Title, pitch, "Importer un modèle (.mpd / .ldr)" (Import a model (.mpd / .ldr)) (`model-input`), LEGO.com link | No drag and drop here | brick | Workshop › scene, standalone home screen: "Importer un modèle" (`model-input`), "Essayer la démo" (Try the demo), file drop | ☑ |
| N2 | File checks | `onModelFile` | Import | Refused > 8 MB; refused outside `.ldr`/`.mpd` ("pas .io ni .lxf" (not .io or .lxf)) | Messages in the toast | — | Error toast (unchanged) | ☑ |
| N3 | Analysis and loading | `busy`: "Analyse du modèle…" (Analyzing the model…), "Chargement des géométries LDraw locales…" (Loading local LDraw geometries…) | Import | Text under the button | No progress bar | brick | Workshop › scene, loading screen with activity indicator | ☑ |
| N4 | Recent sessions | `section.recent` | Browser saves | "nom — x/y pièces · réimporte le fichier pour reprendre" (name — x/y parts · re-import the file to resume) | No button; you must re-import | brick | Workshop › standalone home screen, "Sessions récentes de ce navigateur" (Recent sessions of this browser) (re-import to resume) | ☑ |
| N5 | Resume by fingerprint | `importText` → `restoreProgress` | Re-import of the same file | "Progression restaurée : x/y pièces posées (dont N posée(s) librement)." (Progress restored: x/y parts placed (including N placed freely).) | Mapping changed → step recomputed; sync without mapping → free | brick, sync | Toast (unchanged) | ☑ |
| N6 | Unreadable mappings | Error toast | Corrupted stored mapping | "Correspondances enregistrées illisibles, ignorées : …" (Saved mappings unreadable, ignored: …) | — | — | Error toast (unchanged) | ☑ |

## O. Keyboard shortcuts (workshop)

Ignored when focus is in an `input` or a `select` (not in a `textarea`, nor in a button).

| ID | Key | Context | Effect | E2E | New location | Verified |
|---|---|---|---|---|---|---|
| O1 | ⌘Z / Ctrl+Z | Session in progress | Undo | fb, fh | Help `?` › Partie (Session); Annuler button (⌘Z shown) | ☑ |
| O2 | R / Shift+R | Part in hand | Y quarter turn (+/−) | surf | Help `?` › En main (In hand); contextual caption | ☑ |
| O3 | R / Shift+R | Free, selection, nothing in hand | Y rotation of the selection in place | f3d | Help `?` › Sélection (Selection); X/Y/Z tooltips | ☑ |
| O4 | X / Y / Z (Shift: reverse direction) | Free, part in hand or selection; guided/sync, part in hand | Rotation ± one step (90° by default, down to 1°) around the axis; quarter turn in guided/sync | f3d, brick | Help `?` › En main / Sélection; contextual bar tooltips | ☑ |
| O5 | O | Part in hand (not a group) | Next orientation | surf | Help `?` › En main; contextual bar | ☑ |
| O6 | Esc | Part in hand | Drop / leave in place | fb | Help `?` › En main; caption | ☑ |
| O7 | Esc | Free, selection | Deselect | fh | Help `?` › Sélection; caption | ☑ |
| O8 | Esc | Gizmo drag | Cancels the drag | fg | Help `?` › Manipulateur (Manipulator) | ☑ |
| O9 | Del / ⌫ | Free, picked-up part or group in hand | Put back in stock | fb | Help `?` › En main; tooltip "Remettre au stock" (Put back in stock) | ☑ |
| O10 | Del / ⌫ | Free, selection | Put the selection back in stock | fb | Help `?` › Sélection; tooltip "Au stock" (To stock) | ☑ |
| O11 | A | Part in hand | Auto height / level | surf | Help `?` › En main; tooltip "Hauteur auto" (Auto height) | ☑ |
| O12 | PageUp / PageDown | Free, part in hand | Up / down one step (Shift: 1 LDU) | fh | Help `?` › En main; Monter/Descendre (Up/Down) tooltips | ☑ |
| O13 | PageUp / PageDown | Guided/sync, part in hand | Upper / lower model level | surf | Help `?` › Guidé (Guided) | ☑ |
| O14 | G | Free | Grid on/off | filet | Help `?` › Scène (Scene); rail tooltip "Grille (G)" (Grid (G)) | ☑ |
| O15 | W / E | Free, selection, nothing in hand | Gizmo arrows / rings | fg | Help `?` › Sélection; Flèches/Anneaux (Arrows/Rings) tooltips | ☑ |
| O16 | Q | Free, selection, nothing in hand | Global ↔ local axes | filet | Help `?` › Sélection; Globaux/Locaux (Global/Local) tooltip | ☑ |
| O17 | M | Free, selection, nothing in hand | Move the selection | fh | Help `?` › Sélection; Déplacer (Move) tooltip | ☑ |
| O18 | ⌥ held | Free, part in hand / gizmo drag | Ignore the part magnet / drag without step | fc, fg | Help `?` › En main / Manipulateur; HUD "(⌥ : ignorer)" ((⌥: ignore)) | ☑ |
| O19 | Enter | Coordinates field | Apply the coordinates | fg | Manipulation settings (popover) | ☑ |
| O20 | ← → / Shift / Home / End / Enter | Focused splitter | Resize / default | ux | Help `?` › Panneaux (Panels); splitter tooltip | ☑ |
| O21 | Enter | Number field (`/ajouter`) | Search | add | Add › Step 1 | ☑ |

No built-in help lists these shortcuts: they appear only in the instruction toasts and the buttons' `title` attributes.

## P. Mouse and trackpad in the 3D scene

| ID | Gesture | Context | Effect | E2E | New location | Verified |
|---|---|---|---|---|---|---|
| P1 | Drag (empty space) | Always | Camera orbit (OrbitControls, no inertia) | surf | Help `?` › Caméra (Camera); contextual caption | ☑ |
| P2 | Wheel / pinch | Always | Zoom | — | Help `?` › Caméra | ☑ |
| P3 | Right-click drag / two fingers | Always | Pan (OrbitControls default) | — | Help `?` › Caméra | ☑ |
| P4 | Hover | Part in hand | Placement preview (targeted surface, compatible ghost, floor) | surf | Help `?` › En main; HUD | ☑ |
| P5 | Click (≤ 4 px drag) | Part in hand | Place | surf | Help `?` › En main; caption | ☑ |
| P6 | Click on a placed part | Free, nothing in hand | Select; Shift+click: add/remove | fh | Help `?` › Libre (Free); caption | ☑ |
| P7 | Click in empty space | Free, nothing in hand | Clear the selection | fh | Help `?` › Libre | ☑ |
| P8 | Double-click on a part | Free | Select the connected assembly | f3d | Help `?` › Libre; caption "Double-clic : assemblage" (Double-click: assembly) | ☑ |
| P8b | Shift + double-click on a part | Free | Add its assembly to the selection | f3d (C2) | Help `?` › Libre — sélection; tooltip "Assemblage" | ☑ |
| P9 | Press + drag on a placed part | Free, nothing in hand | Direct drag (camera suspended); Shift at the start: add to the selection | f3d | Help `?` › Libre | ☑ |
| P10 | Drag an arrow / a ring | Free, selection | Gizmo (see J16) | fg | Help `?` › Manipulateur | ☑ |
| P11 | Click on a part | Mapping editor | Assign/remove; ⌥-click: move | sync | Help `?` › Éditeur (Editor); editor caption | ☑ |
| P12 | Visual cues | Free | X/Y/Z axes on the part in hand; green connection dots; floor grid | fc | Scene, unchanged; Help `?` describes them | ☑ |

## Q. Cross-cutting states

| ID | State | Where | Current rendering | E2E | New location | Verified |
|---|---|---|---|---|---|---|
| Q1 | Loading a view (chunk) | All routes | Raw "Chargement…" (24 px padding) | — | Loading indicator (spinner + text) while each view loads | ☑ |
| Q2 | Loading the collection | `/` | Nothing until the response (no empty state or skeleton) | — | Collection › card skeletons | ☑ |
| Q3 | Empty collection | `/` | B13 | lib, filet | Collection › first-launch welcome screen | ☑ |
| Q4 | Library error | `/`, `/sets/…` | Red banner role=alert | — | Alert banner with "Réessayer" (Retry) | ☑ |
| Q5 | Loading a model (standalone workshop) | `/atelier` | `busy` text | brick | Workshop › loading screen (indicator + current step) | ☑ |
| Q6 | Loading a build | `/atelier/[id]` | E1 (text) | lib | Workshop › loading screen (listed steps) | ☑ |
| Q7 | Invalid model | Workshop | "Invalide" (Invalid) badge, reasons, diagnostics, no start button | — | Workshop › Démarrer tab: Invalid badge + reasons, no active mode card | ☑ |
| Q8 | Analyzable model, missing geometry | Workshop | Amber badge, `missing-parts`, G14 | brick, filet | Workshop › Démarrer tab: badge, Missing parts alert, "Visualisation seulement" | ☑ |
| Q9 | Model without steps | Workshop | "Montage libre uniquement" (Free building only) badge, G12 | brick | Workshop › Démarrer tab: Guided card disabled with the reason | ☑ |
| Q10 | **LDraw library missing or misconfigured** | Workshop, previews | "Rendu indisponible : Variable LDRAW_LIBRARY_DIR absente." (Rendering unavailable: LDRAW_LIBRARY_DIR variable missing.) / "LDConfig.ldr introuvable…" (LDConfig.ldr not found…) / "Dossier de bibliothèque illisible." (Library folder unreadable.) / "Serveur local injoignable." (Local server unreachable.) in red in the 3D area and `render-status`; previews: "Aperçu indisponible : …" | filet | Workshop › scene: "Bibliothèque de pièces introuvable" (Parts library not found) screen (reason, installation steps, Retry); collection: welcome card; previews: same message | ☑ |
| Q11 | **Offline mode** (`BRICK_LAB_ONLINE=0`) | `/ajouter` | "Chercher en ligne" button absent, replaced by "Accès Internet désactivé." (Internet access disabled.); local import stays complete | filet | Add › Step 1: note "Accès Internet désactivé. Recherche en ligne et téléchargements coupés (BRICK_LAB_ONLINE=0) ; l’import local reste complet." (Internet access disabled. Online search and downloads turned off (BRICK_LAB_ONLINE=0); local import remains complete.), crossed-out Wi-Fi icon | ☑ |
| Q12 | Rebrickable not configured | `/ajouter` | Message in `source-rebrickable` | add | Add › Step 1, Rebrickable source | ☑ |
| Q13 | Online source unavailable | `/ajouter` | `omr-status` (e.g. 503) | add | Add › Step 1, OMR source (error status) | ☑ |
| Q14 | Saving / saved / error / conflict | Library workshop | F7, F8 | lib | Workshop › App bar (save state) + conflict banner | ☑ |
| Q15 | Browser storage full | Standalone workshop | Toast "Sauvegarde locale des correspondances impossible…" (Local save of the mappings impossible…) | — | Error toast | ☑ |
| Q16 | PDF too large / protected / invalid | Notice panel | Error role=alert | — | Workshop › Notice panel, alert | ☑ |
| Q17 | Session finished | Workshop | H6 / J29 | brick, fb | Workshop › end block in the tray area | ☑ |
| Q18 | Nonexistent set | `/sets/…` | Text + back link | — | Detail › empty state "Ce set n’est pas (ou plus) dans ta collection." (This set is not (or no longer) in your collection.) + "Retour à la collection" (Back to the collection) | ☑ |

## R. Invisible behaviors to preserve (not UI but triggered by the UI)

| ID | Behavior | Where | Note | New location | Verified |
|---|---|---|---|---|---|
| R1 | Save after every change of session or PDF page | `BrickLabApp` `saveProgress` effect | Depends on `session`, `notice.view`, `mapping` | Unchanged | ☑ |
| R2 | Flush on exit (`pagehide`, unmount) | `BrickLabApp` | — | Unchanged | ☑ |
| R3 | `window.__brickLab*` test hooks | `BrickLabApp`, `BuildCanvas` (dev only) | Essential to the E2E "scripted player" | Unchanged (kept) | ☑ |
| R4 | Panel width remembered per context | `localStorage` `LAYOUT_STORAGE_KEY` | Browser preference | Unchanged (+ collapsed state of the panel) | ☑ |
| R5 | "Keep the library" remembered per build | `localStorage` `brick-lab:library-kept:` | — | Unchanged | ☑ |
| R6 | The pointer over the 3D view re-renders the workshop only if the magnet changes | `updatePreview` (`snapInfoKey`) | Performance: do not break | Unchanged (no UI state added on hover) | ☑ |
| R7 | Fixed tray size (188 px) | CSS `.tray` | A tray that changes size desynchronizes 3D picking (P5) | Unchanged (`--tray-h`) | ☑ |
| R8 | No outgoing request outside actions D6/D8 | — | Verified by `brick` (PDF) | Unchanged | ☑ |

---

### Features whose usefulness is to be confirmed (flagged, **not removed**)

- **N4 Recent sessions** of the standalone workshop: non-clickable list (you must re-import the file); overlaps B16.
- **A5 / B18 Workshop without a collection**: partial duplicate of the library flow, kept as a "sandbox" and used by most of the E2E tests.
- **K9 "Poser à la position cible (aide)"**: accessibility button required by `docs/04`; to keep, but it could live in a "Help / accessibility" menu.

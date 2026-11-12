# Implementation decision log

This log **extends** `docs/09_DECISIONS_ET_RISQUES.md`, which remains frozen in its v1.0 specification version (traceability via `DOSSIER_MANIFEST.json`). Any specification assumption that changes is recorded here, with its evidence.

## Journal — 2026-11-03, batch P0/P1 (LDraw spike)

| Initial assumption | Finding / decision | Evidence |
|---|---|---|
| `LDrawLoader` could provide occurrences and steps | One group per brick, but without line provenance; **a missing part makes the whole model fail**; `buildingStep` = global counter that mixes root and submodels. → Loader used **per part+color** only; in-house parser = source of truth. | `docs/implementation/10_SPIKE_ET_LOT_P0_P1.md`, E2E test "missing part" |
| Submodel steps | `FLATTENED_STEPS` strategy documented (submodel built before the step's direct parts, each copy separately); never presented as the instructions. | `tests/unit/parser.test.ts` |
| A single final `0 STEP` = steps | No: classified `NO_STEPS` (free building). | `tests/unit/parser.test.ts` |
| Free 3D drag | MVP: horizontal plane + 10 LDU grid + assisted level (floors deduced from targets), R = 90° around Y. No off-axis rotation or symmetries. | Real pointer E2E |
| Snap thresholds | 10 LDU / 10° (calibrated on 2×4), to be revisited on a real model. | `tests/unit/engine.test.ts` |
| TypeScript 7.0 (latest) | TypeScript 6.0.3 kept: TS 7 (native compiler) is not validated with the Next/Vitest tooling. | `package.json` |
| LDraw library | Outside the repository, via `LDRAW_LIBRARY_DIR` (`.env.local`, ignored by Git), served by a validated local route (no `..`, `.dat/.ldr` extensions, realpath within the root). | `src/infra/ldraw/library-path.ts` |
| Git repository | It did not exist: `git init` + commit of the spec, **private** GitHub repository `Pierson38/brick-build` created with approval, `main` pushed once; work on a dedicated worktree. | `git log` |
| `next dev` generates `AGENTS.md` | Disabled (`agentRules: false`). | `next.config.ts` |
| Journal in `docs/09` | The implementation journal lives here, not in `docs/09`, so as not to alter the v1.0 specification tracked by checksum (`CLAUDE.md` rule applied by documented delegation, to be confirmed). | `docs/implementation/ECARTS_SPECIFICATION.md` |

## Journal — 2026-11-03, batch P5 (validation on real OMR sets)

| Assumption | Measured finding / decision | Evidence |
|---|---|---|
| Every referenced MPD section is a submodel | **False**: OMR files embed unofficial parts (`!LDRAW_ORG Unofficial_Part`, 31040 and 31045). Expanded, they produced 28 and 99 false "parts" made of primitives. → A `Part/Subpart/Primitive/Shortcut` section, or a `.dat` section with geometry, is a **leaf part**. Its text is passed to LDrawLoader. | `tests/unit/omr-structures.test.ts`, 31040 report: 89 → 65 occurrences |
| R (90° around Y) is enough to orient parts | **False**: 24/65 targets of 31040 and 13/270 of 31009 have another orientation (flipped part, placed on its side, arbitrary angle). → **O** key: we cycle through the orientations **present in the model** for this part and this color, without revealing which one is expected; R applies on top. | Pointer E2E 31040/31009 |
| Exact rotation required | Symmetric parts (2×4 at 180°, 2×2 at 90°) were refused in a physically identical orientation. → Symmetries **measured on the loaded geometry** (`yQuarterTurnSymmetries`) and accepted by the snap. | unit tests, 19 equivalent placements accepted on 31040 |
| The click places where the ray hits the plane | Measured: the parts bar changed height, so the canvas too, and R3F used a stale size for the ray (18–28 LDU offset on about 5% of clicks). → Parts bar with fixed height; the drop uses the **displayed** position of the preview. | E2E: 4 refusals/69 → 0/65 |
| Adding an npm dependency | `npm i <package>` removes rolldown's optional native bindings from the lockfile (npm/cli bug #4828). → To add a dependency: `rm -rf node_modules package-lock.json && npm i`, then check `node_modules/@rolldown/binding-*`. | P5 lockfile |
| Deviations declared to the manifest | The old check only verified the original hash: a second modification of an already declared file got through. → `currentSha256` mandatory, checked on every acceptance run. | `npm run check:spec` |
| Journal in `docs/09` | Owner decision: `docs/09` remains frozen (v1.0), the journal lives here; `CLAUDE.md` corrected and declared as a deviation. | `spec-deviations.json` |

## Journal — 2026-11-04, lifting of P5 conditions

| Assumption | Measured finding / decision | Evidence |
|---|---|---|
| Choose the level with the keyboard (default: the lowest compatible one) | Cost measured, reproduced exactly by `scripts/level-baseline.ts`: 31009 free = 1,194 presses (reverse order) / 246 (natural order); guided = 7. → **Surface placement**: the part is placed **on** the pointed surface (floor or top of a part), at the height of the nearest compatible level (±6 LDU, real base of the geometry). PageUp/PageDown remain as a fallback (manual mode, `A` to return). | `surface.ts`, `tests/unit/surface.test.ts`, `tests/e2e/surface-placement.spec.ts` |
| The surface under the center is enough | False for cantilevered parts, attached sideways or placed before their support: 15 to 56 manual fallbacks measured on 31040. → Fallback: compatible target **crossed by the ray** (≤ 10 LDU), unless it is hidden behind a visible surface. The preview visibly snaps onto it; nothing is placed without a click. | OMR E2E v3 |
| Snapping | Only on a **compatible** hovered ghost, or if the placement would be accepted by the engine; never toward a target far from the pointer. Rotation always checked. | unit tests "far", "wrong orientation" |
| 31009 inventory fidelity | Comparison by reference and color: 31 decoded elements identical, 2 proven discrepancies (+2 white `3020`, +2 white `3069` in the box), 1 element without equivalent (4211087, visual), minifig decomposed (+4). Exact balance 271 − 5 + 4 = 270. Belonging to the main model **not proven** → verdict **UNDETERMINED**, warning in the UI. | `P5_INVENTAIRE_31009.md` |
| Display an inventory verdict without a catalog | Local registry of hand-made validations, indexed by SHA-256 of the exact file (2 entries); any other file = "not verified". Nothing is downloaded or listed. | `known-validations.ts` |

## Journal — 2026-11-04, batch P6 (instructions ↔ 3D synchronized)

| Assumption | Measured finding / decision | Evidence |
|---|---|---|
| An LDraw step, a PDF page or a printed number identifies an instruction step | **False.** 31040: 11 LDraw steps against 21 printed steps on 11 pages, and 3 models in the same booklet, each numbered from 1. 31009: a 1–25 sequence is inserted between steps 36 and 37 of booklet 1. → An instruction step is an **ordered entry** (booklet, PDF page, printed number, possible callout, multiplier). The number is only a label. | `P6_ARCHITECTURE_NOTICE_SYNC.md` § 1 |
| 3-in-1 and several booklets | 31040: 1 PDF, 3 models. 31009: 1 PDF per alternative model (verified on the covers). → The mapping links **one** MPD (fingerprint and main model) to an ordered list of booklets; only the pages of the relevant model are referenced. | same |
| Recognize the steps in the PDF | Excluded from P6, as requested. The text layer does expose the numbers (`pdftotext`), but no automatic aid is delivered: input is **manual**, with provenance `manual` or `verified`. | `mapping.ts` |
| Synchronized mode = new engine | No: it is the existing engine with a `StepPlan` of type `INSTRUCTION_STEPS` and the `synced` mode (candidates = active step). The placement rules do not change. The active step remains **derived** from the placed parts, which protects against corruption when going back. | `engine.ts`, unit tests |
| PDF fingerprint | SHA-256 of the exact bytes, checked on every opening. Another PDF (another edition) is never used in place of the booklet. The bytes are not stored. | E2E "booklet change" |
| Hidden locations in synchronized mode | Measured on 31040: without ghosts, the scripted player fails at the 52nd part (tile placed on the back face, hidden). → Step locations **displayed by default** as in guided mode, checkbox still uncheckable. | real 31040 trial |
| Reading the page in a 400 px panel | At 100%, a 31040 page (419 pt) was cut off. → Fit to width by default in synchronized mode and in the editor; free mode keeps the P5 zoom (100%). | screenshot `31040-1-synced-step8.png` (outside the repository) |
| "2e étape sur 3 de la page" (2nd step of 3 on the page) | Callouts were counted as printed steps. → Position computed on the distinct printed numbers of the page. | `mapping.test.ts` |
| P5 progress v1 | Schema v2: `synced` mode, displayed booklet, mapping fingerprint. v1 is still read, and a v1 cannot declare the `synced` mode. | unit and E2E tests "P5 progress (schema v1)" |
| P6 fixtures | `fixtures/` is part of the frozen spec: the P6 fixture (original, CC0) lives in `tests/fixtures/`. The real 31040 mapping stays outside the repository (`brick-lab-data/mappings/`). | `tests/fixtures/README.md` |

## Journal — 2026-11-05, batch P7 (personal library)

| Assumption | Finding / decision | Evidence |
|---|---|---|
| Progress and mapping can stay in `localStorage` | **No** for the goal: per-browser storage, Chrome and Safari share nothing, and MPDs/PDFs had to be re-imported. → **Local server-side** storage (Node `fs`) in `~/Documents/brick-lab-data/library/`, JSON index + files addressed by SHA-256. SQLite, IndexedDB/OPFS and File System Access ruled out (justification: `P7_ARCHITECTURE_BIBLIOTHEQUE.md` § 2). | `src/server/library/store.ts`, unit tests `library-store` |
| The set number identifies a model | **False** (3-in-1, several main models in one MPD). → Set (editable, non-unique number and name) ⊃ builds identified by an id and validated by (model SHA-256, main model). | unit tests "alternative models", E2E |
| 31040/31009 must be re-imported into the library | No: **read-only** discovery of `models/`, `instructions/`, `mappings/`; files referenced in place (re-hashed on every use), mapping recognized by the fingerprint of the model it contains. The mapping is copied into the build (it becomes editable). | `discovery.ts`, E2E `library-omr` |
| The catalog must recompute progress and modes | No: `BrickLabApp` receives a `BuildStore`; restoration, validation and P5/P6 fallback unchanged. The server reuses the parser to refuse a progress or mapping from another model. | `build-store.ts`, P5/P6 E2E rerun |
| Automatic save on every change | Opening a build rewrote the same progress; two open tabs conflicted without doing anything. → No write if the content (excluding date) has not changed; the saved PDF position (page **and** booklet) is kept as long as the booklet is not reopened (also fixes a loss of the booklet fingerprint in P6 before re-import). | E2E "two tabs" |
| One revision per index modification | Importing instructions then associating them from the same page was refused as a conflict. → Adding a file (additive, content-addressed) does not change the revision; modifications of sets and builds do. | unit test "importing a file does not invalidate" |
| Repair of a same-size modified file | The quick check (size) does not see it. → The model is always hashed (it is analyzed); a set's detail hashes all its files; opening a build does too. | E2E "modified or missing" |
| E2E tests on the real library | Forbidden: the Playwright server uses a temporary folder (`BRICK_LAB_DATA_DIR`), and the suites refuse to run if the server points elsewhere. | `playwright.config.ts`, suites' `beforeAll` |
| Safari | Playwright WebKit (Safari's engine) tested on the same library as Chromium; the Safari application remains for the manual acceptance test. | `library-webkit.spec.ts` |
| Reload loop in `next dev` during E2E | First hypothesis (`headers()` rule in `next.config.ts`) **refuted** by a second failing acceptance run. Measurement: HMR messages "Next entry chunk: restart" then `reloadPage: HMR hash mismatch` on every connection; same code and same configuration: 733 / 640 navigations in 20 s with the existing Turbopack `.next/dev` cache, **2** (5 trials out of 5) after deleting it, with or without `headers()`; P6 code with its own cache: 2. → The E2E server starts with a fresh dev cache (`rm -rf .next/dev && npm run dev`); the headers stay in production only. The production server (`next start`, no HMR) is not affected. | reproduction script (navigations and HMR messages counted), acceptance run rerun |
| Resume the browser save if it is more recent (owner review, 11-05) | **Insufficient**: an old P6 game, older than the 12/65 parts placed during the trials, would never have been offered. → Comparison of the relevant differences (mode, placed parts, page, booklet, mapping fingerprint); explicit choice as soon as they differ, whatever the date; recovery possible later from the set detail; replaced library version always copied into the history (even within the minute, unlike automatic saves); browser mappings recoverable with the game. | `save-compare.ts`, unit tests `save-compare` (11) and "explicit browser recovery", E2E "OLDER browser save", "another mapping" |
| Any revision conflict blocks saving | Two tabs (or Chrome + Safari) open together each re-save the instructions page on load: the second was blocked without any part having changed (intermittent failure of the E2E "deux onglets"). → On a 409, the library version is re-read: if the **game** (mode, placed parts, played mappings) is the same as the one the tab is based on, only the view changed (page, booklet) and the save is redone on the new revision; otherwise, stop and message "Recharger" (Reload), nothing is overwritten. The position in the instructions therefore follows the last tab that changed it. | `build-store.ts`, E2E "two tabs" made deterministic (stale page forced) |

## Journal — 2026-11-06, batch P8 (simplified import)

| Assumption | Finding / decision | Evidence |
|---|---|---|
| The OMR has an API to find a set's models | **No** (site's public code: `routes/api.php` empty). One page per number exists (`/omr/set/<n>`, undocumented). → Read **once per click**, only the `.mpd` links of that number, download file by file on click; if the page changes: message, link to the OMR, manual import. | `P8_ARCHITECTURE_IMPORT.md` § 2.1, unit tests `online-sources` |
| LEGO instructions can be retrieved automatically | **No**: no API, PDF identifiers differ by language, restrictive terms of use (automated systems). → Link to the official page, PDF dropped by the user. | § 2.2 |
| Rebrickable is necessary | No: optional (local key), indicative metadata; `/alternates/` (MOC) not used. | § 2.3 |
| Downloading through the server is compatible with the v1.0 spec | **Deviation**: README and `docs/07` require that downloading stay on the user side. The choice remains with the user (one click per file, nothing in the background), the transfer is done by the local server. `BRICK_LAB_ONLINE=0` disables all Internet access. → **Approved** on 2026-11-06 (next line). | § 3 |
| **Owner authorization (2026-11-06)** | Explicit GO for the deviation "download of LDraw OMR models by the local server". Framework approved by the owner on 2026-11-06: online search triggered by a user action; individual download of an explicitly chosen model; HTTPS, closed list of hosts, address verification and SSRF protection; no bulk download or background network task; retention of the author, license, source URL and file fingerprint; offline mode kept via `BRICK_LAB_ONLINE=0`; no automated download of official LEGO instructions. v1.0 specification unchanged. Merge of PR #5 **not** authorized at this stage (final GO after the manual acceptance test). | owner's message; `P8_ARCHITECTURE_IMPORT.md` § 3 |
| An outgoing address is checked at URL validation | Insufficient (DNS rebinding). → Address check **at connection time** (`lookup` of `https.request`). Node's `BlockList` applies a `::ffff:0:0/96` rule to all IPv4 addresses: rule removed, mapped IPv4s are converted and checked as IPv4 (dotted and hexadecimal forms). | unit tests "address", "DNS rebinding" |
| Files can be entered in the index before confirmation (P7) | A cancellation left entries and each upload an index backup. → `library/staging/` outside the index, one index write at confirmation, import replayable without duplicates. | unit tests `import-p8` |
| `commit()` can write the backup before the index | **Defect found**: a very first interrupted write left a backup without `library.json`, and the library then refused to start. → Index first, copy afterwards. | unit test "interrupted index write" |
| A set's instructions go with all its builds | False for a 3-in-1 (one booklet per model). → Association offered only for a single build ("proposée, non vérifiée" (proposed, not verified)) or when a mapping names the booklet; otherwise ticked by the user. | E2E `add-set` |

## Journal — 2026-11-06, workshop UX batch (panels, instructions, thumbnails)

| Assumption | Finding / decision | Evidence |
|---|---|---|
| A fixed side panel width is enough | No (P8 acceptance test): the instructions lack space. → Separator; width kept as a **proportion** of the space, per context (workshop, editor), in the browser's `localStorage` (display preference, not library data). The 3D view keeps priority on small screens (320 px minimum, 280 px panel). | `panel-layout.ts`, unit tests `atelier-ux` |
| Resizing the canvas breaks the pointer | No, as long as the size follows the container: React Three Fiber measures without delay; verified by pointer placements after drag, keyboard and window change. The parts bar keeps a **fixed** height (cause of the P5 offset). | E2E "3D picking stays exact", real 31040/31009 |
| Zoom at 100% suits free building | No: 196 px overflow on 31009 at 1280×800. → Fit to width by default in all modes, tracked by `ResizeObserver`, serialized renders (pdf.js refuses two simultaneous renders on a canvas). | E2E "separator and notice" |
| One thumbnail = one WebGL canvas | Ruled out (browser WebGL context limit, memory). → One shared engine, image cached per template, rendering in small slices. 31009 measurement: 92 thumbnails, 60 fps maintained (delays in the report). | `part-thumbnails.ts`, `mesures-ux.json` |
| Show LDraw outlines on all thumbnails | A green 16×16 plate looked black (stud outlines). → Outlines hidden beyond a radius of 90 LDU. | 31009 before/after screenshot |
| The LDConfig color name is usable as is | It starts with a space in `LDrawLoader`'s material ("␣Red"): found by the tooltip test, cleaned. | E2E "part thumbnails" |
| Thumbnails can be drawn as soon as the bar is displayed | No: on software WebGL, the full suite showed 2 intermittent P6/P7 failures (instructions page late after reload, booklet slow to open with two tabs). → Rendering during the browser's idle time; P6/P7 tests unchanged; 2 full runs afterwards without failure. Cost: 92 thumbnails in ~950 ms instead of 514 ms, first at ~150 ms. | `part-thumbnails.ts`, `UX_ATELIER_RAPPORT.md` § 5 |
| Manual acceptance test of the batch (owner, Chrome and Safari) | 2026-11-06: panels, instructions, 31009 and 31039 thumbnails, placement and fluidity, Chrome and Safari, saves and progress: **OK** (declared). Data: only a 31039 build preview added, progress revisions unchanged. **Merge GO for PR #6** by the owner. | `RECETTE_HUMAINE_UX_ATELIER.md` § 5 |
| "Free building" lets you place a part wherever you want | No: it only frees the **order**; placement is still validated against the `targetMatrix` of an occurrence (10 LDU, 10°) and the save only contains occurrence identifiers. Compliant with the v1.0 specification (P0–P4), contrary to the owner's definition. → Prior limitation, non-blocking for the UX; workstream `feat/true-free-building` decided by the owner (deliberate deviation from the specification, which remains immutable). | `LIMITATION_MONTAGE_LIBRE.md` |

## Journal — 2026-11-06, true free building

| Assumption | Finding / decision | Evidence |
|---|---|---|
| A placed part = an occurrence of the model | Not in free building (owner's decision): the model's **target** (`targetMatrix`, unchanged, sole reference of the guided and synchronized modes) and the **player's placement** are separated. A game has "anchored" parts (occurrence identifiers) and, in free building only, free parts (reference, color, real pose). Deliberate deviation from the v1.0 specification, which remains immutable. | `MONTAGE_LIBRE_ARCHITECTURE.md`, `free.ts` |
| Old saves must be migrated | No: no migration, nothing is rewritten on opening. Format v3 written **only** with free parts; otherwise v2 byte for byte. An old free game (identifiers only) takes its parts back at their historical positions; they only become free if the player picks them up. | unit tests `free-building`, E2E "older free build" |
| Free parts are a simple view | No: they are part of the **game**: conflict signature (two tabs), browser ↔ library comparison, counts and status. Otherwise a conflict would have silently overwritten them. | `build-store.ts`, `save-compare.ts` |
| Exhausted stock = model complete | No: "Terminé" (Done) only when all parts are at their place in the model (anchored or recognized within ≤ 10 LDU / 10°); otherwise explicit end message. Server-side, recognition is done without the parts' symmetries (known with the geometry): it can undercount, never overcount. | unit tests `library-store` |
| Magnet on the model at 6 LDU | Too strict: the P5 suite showed a ray grazing a stud 7 LDU from the target. → 9.5 LDU (still < the 10 grid step: a half-stud offset remains possible). | E2E `surface-placement` |
| The aimed point is enough to stack | No: aiming at the center of a brick often hits the side of a stud (half-stud offset). → On top of a part, the position is taken where the ray crosses the top of the body. | unit test "stud grazed", E2E "identical bricks" |
| The P5 scripted player always validates the placement | No longer in free building (any placement is accepted): it now checks that the placement is on the targeted location (`targetId`), otherwise it undoes and retries. | `scripted-player.ts` |
| Automatic placement is enough for height in free building | No (manual acceptance test, NO-GO): the part rests on its lowest point (30157: wheel supports under the plate) and PageUp/PageDown only went through the model's levels. → Free manual height, 8 / 1 LDU, visible buttons, kept while following the pointer, magnet subordinate to the chosen height; guided and synchronized modes unchanged. | `MONTAGE_LIBRE_CORRECTIONS.md` § 1–2 |
| A click on a placed part must pick it up | Replaced: the click **selects** (Shift + click: add / remove), "Déplacer la sélection" (Move the selection) takes the part or the **group** (pivot: center on the grid, lowest point), all-or-nothing move and undone in one action. No schema change: these are free-part placements. | `MONTAGE_LIBRE_CORRECTIONS.md` § 3–4 |
| The model's orientations are enough in free building | No (31039 acceptance test: axle 32062 impossible to straighten). → ±90° rotations around X, Y, Z composed by matrices, exact coefficients (no drift); the selection rotates in place; groups rotated in 3D. | `MONTAGE_LIBRE_3D_RAPPORT.md` § 2 |
| The LDraw library describes connections | No: only the geometry. Connections **deduced** from standard primitives (studs, tubes, pins, hole ends); receptacles deduced under bricks/plates/tiles; axles, clips, hinges not recognized and flagged. Assembly graph and magnet based on this subset; nothing invented. | `MONTAGE_LIBRE_CONNEXIONS.md` |
| A bounding box is enough to rule out impossible fits | No: the 30157 (wheel supports) "went through" the white plate without touching it. → Safe rules on connectors (stud already taken, two parts at the same place); no approximate collision. | `MONTAGE_LIBRE_3D_RAPPORT.md` § 5 |
| An R3F click on a group calls its handler only once | No: once per touched object; and a re-created part is only "visible" to the pointer at the next render. → Propagation stopped, matrices computed as soon as attached (prevents a double-click from emptying the selection). | E2E `free-3d` C |
| Write a 3D manipulator | No: `TransformControls` (three-stdlib via drei) on a pivot relay placed in the LDraw group, rendered at the scene root; only arrows and rings kept (the other handles covered the part and prevented direct drag). | `MONTAGE_LIBRE_GIZMO.md` § 2 |
| `TransformControls`' built-in step is enough | Not for translation: it rounds the **absolute** position (17.41 → 16). → Steps counted from the start of the drag, along the dragged axis only (`snapAlong`); rotation: built-in step (relative). | unit tests "transform gizmo" |
| An arrow does not get in the way of the rest | It does: drawn over a neighboring part it takes the press; Esc during its drag emptied the selection mid-gesture. → Esc cancels the drag, other keys ignored meanwhile, press without movement = click, reduced size. | E2E `free-3d` B, `free-gizmo` |
| The manipulator controls fit in the existing selection bar | No: the bar went to 4 rows (174 px) and covered the top of the 3D view; a click on a part hidden by it did not reach the scene. → Short labels, shortcuts in tooltips, narrower fields (138 px). | E2E `free-height-group` |

## Journal — 2026-11-08, reliable connections (`fix/free-building-connections`)

| Assumption | Finding / decision | Evidence |
|---|---|---|
| The magnet did not work from the tray because of matrices, connectors or the model magnet's priority | No: for an identical pose the pure engine gives the same result. Cause: a `useMemo` of the connector index kept `null` (dependencies `held.moving` / `held.group`, unchanged for a tray part). → One index per game state, held parts excluded at query time; one single function (`snapHover`) for tray, pick-up and group. | E2E `free-connections` A/B (red then green) |
| Axles and axle holes indistinguishable in the primitives | False for most: the `axleend*` ends are only drawn at the end of real axles, full holes have their primitives (`axlehole`, `axl2hole`…). Only `axlehol8` remains ambiguous. 77 library parts: no confusion; 13 uncertain axles flagged. | `connectors-real.test.ts` |
| Grid receptacles under the bottom outline are real | No for non-rectangular parts: cut corners, wings, wedges received some in the void, and two edge-to-edge wings of 31039 shared them. → A receptacle only if guaranteed (stud above, neighboring tube, 1 × N part); a duplicate receptacle does not forbid a placement. | `connectors-real.test.ts`, 31039 report |
| A part's metadata can be deduced from its box | No: 11477 received two receptacles, the 31039 model contradicted one (its curve). → Metadata checked against the real bottom face, and against a real model. | `connector-metadata.ts`, test "controlled metadata" |
| More engaged studs = better proposal | No: it pulled a part toward a distant full fit. → Nearest first (10 LDU band), then most engaged; previous proposal kept (8 LDU) against oscillations. | unit tests "near first", "no oscillation" |
| An axle engaged in a hole is "occupied" | No: an axle goes through several parts. Studs, receptacles and holes: one part; axles and long pins: several. | unit test "axles", fixture `mecanisme-axe.ldr` |

## Journal — 2026-11-08, Windows support (branch `feat/windows-support`)

The v1.0 specification targets macOS. Owner's request: make the application usable on Windows. **No execution on a real Windows machine**: Windows-specific rules are tested with an explicit platform, on macOS.

| Assumption | Finding / decision | Evidence |
|---|---|---|
| npm scripts work everywhere | No: `NEXT_TELEMETRY_DISABLED=1 next …` and `rm -rf .next/dev` are POSIX syntax, refused by `cmd.exe` (npm's and Playwright's shell on Windows). → `scripts/run-next.mjs` launches Next with telemetry off and `--fresh-dev-cache` empties `.next/dev`; no dependency added (`cross-env`). | unit test "run-next", 20 E2E specs launched by this script |
| The `DOSSIER_MANIFEST.json` hashes are stable | Not on Windows: Git for Windows converts to CRLF at checkout by default, the SHA-256s change and `check:spec` fails. → `.gitattributes`: `* text=auto eol=lf` (PNG and PDF binary). Renormalization: no file modified. | `git add --renormalize .` |
| A rename always replaces the target | Not on Windows if an antivirus, the indexer or OneDrive holds the file: EPERM / EACCES / EBUSY. → Short retry (6 attempts, ~1.6 s) **on Windows only** (elsewhere these codes are real errors): atomic writes, move to trash, reset. | unit tests `retryBusy` |
| Hard links are always available | No (FAT/exFAT, some network shares; variable error code). → Copy next to the target then rename: never a partial file; exclusivity guaranteed within the process (library Mutex), no longer between two processes. | unit tests "volume without hard links" |
| Every name accepted by `SEGMENT_RE` is an ordinary file | Not on Windows: `con`, `nul.ldr`, `com1.dat`… open a device, a trailing dot or space is stripped (two names → one file). → Refused in data paths and in the LDraw library, **on Windows only**, so as not to make an existing macOS library unreadable. | unit tests "file names on Windows" |
| `~/Documents/brick-lab-data` suits everywhere | Not on Windows: Documents is often moved into OneDrive (different location than expected, files locked by sync). → `~/brick-lab-data` by default on Windows; macOS unchanged; `BRICK_LAB_DATA_DIR` always takes precedence. The real-set tests read the same default. | unit test "default data folder" |
| Library files are private (`0o600`) | On Windows the mode is ignored: files inherit the rights of the profile folder. Accepted, documented. | — |

## Journal — 2026-11-08, fit of the beige block with a hole on the 31039 (`fix/31039-block-snapping`)

Detail: [CORRECTION_BLOC_31039.md](CORRECTION_BLOC_31039.md).

| Assumption | Finding / decision | Evidence |
|---|---|---|
| A stud's base is the origin of its primitive | False for hollow studs **stretched** into the material (42023 = 41763, 4287a = 4287; 67 library parts): their tip is at the usual height, their drawn base 1.4 to 12 LDU lower. → Base = tip − 4 LDU, only if the part has a face in that plane (or another verified stud in the same plane); otherwise drawn base (tall studs on post, 2680a). | `connectors-real.test.ts`, 26 parts of the owner's 31039 1.81 LDU too low |
| The receptacle plane is the end of the tubes | False when the tubes stop before the edge (42023: 23.6 against 24; 69 parts). → Edge height, only if it is the part's lowest point, within ≤ 1 LDU, around the tubes, on the plate grid while the tube end is not; number and positions of receptacles unchanged. | same; 4180c01 (wheels underneath) unchanged |
| The offset comes from the translation or from the magnet's priority | No: with wrong connectors, translation right. The 4287 taken from the tray onto the owner's 41763 falls at −4.78, exactly the pose of their save. | acceptance test `bloc-31039.spec.ts` |
| The displayed pose and the saved pose are identical | Only to within 1e-14: the preview added the magnet's displacement without rounding, the save rounds to the hundredth. → Preview rounded to the hundredth; marker of a held receptacle rounded like other connectors. | E2E `free-sunk-studs`, unit test "markers … rounded" |
| Fixing the engine realigns the builds | No, and not wanted: saved poses do not change. The offset parts are simply no longer counted as fitted. | 31039 report on the copy (252 → 226) |

## Journal — 2026-11-09, interface redesign (branch `claude/brick-lab-ui-refonte-188be7`)

Redesign of the presentation and flows, without changing what the application does; audit, inventory and trade-offs in `REFONTE/` (decisions A1 to A11 validated by the owner on 2026-11-09, `REFONTE/proposition-design.md` § 9). Only the points below change a visible behavior.

| Assumption | Finding / decision | Evidence |
|---|---|---|
| "Abandonner" (Abandon) without confirmation is acceptable in the workshop without a collection | No: one click erased the browser's game with no way back (audit U1). → Confirmation in a modal in both workshops (A5); "Annuler" (Cancel) keeps everything. `surface-placement` and `filet-refonte` click the confirmation. | E2E `filet-refonte`, `surface-placement` |
| An unavailable mode must disappear from the selector | For readability, it stays displayed, disabled, with its reason (A3); it is never playable. The tests check "not offered" through `aria-disabled` instead of the absence of the option. | E2E `instructions-sync` (synchronized mode not offered) |
| Manipulation instructions belong in the toast | No: they hid the results and became stale (U10). → Instructions computed in a scene caption, toast reserved for results; texts unchanged (A6). No E2E assertion concerned the moved instructions. | E2E `filet-refonte` (caption / toast) |
| The demo requires a user file | "Essayer la démo" (Try the demo) opens the embedded `fixtures/mini-4-pieces.mpd` (CC0), in the workshop without a collection: nothing is added to the library, no request (A4). | unit test `demo-model`, E2E `filet-refonte` |
| The 3D scene background is a render color | The canvas is now transparent; the background comes from the container's `--scene-bg` token (light/dark theme). New thumbnails are captured without grid or background; existing thumbnails keep their old background. | E2E `atelier-ux` (sizeInSync), perf unchanged |
| Ghost and selection colors follow the theme | Not yet: they are in `src/infra/ldraw/part-catalog.ts`, outside the granted scope (A8). | — |
| "Reprendre depuis cette étape" (Resume from this step) can act without confirmation (synchronized instructions) | No: it removes the placed parts of the viewed step and the following ones, and "Annuler" (which only removes the last placed part) cannot put them back (audit U2). → Confirmation modal announcing the number of parts removed (A5). "Tout effacer" (Clear all) of the mappings also goes to a modal (same label "Confirmer l’effacement" (Confirm clearing), restoration unchanged). `instructions-sync` clicks the confirmation and targets "Étape précédente" (Previous step) without the ◀ arrow which became an icon. | E2E `instructions-sync`, `filet-refonte` |
| A set's detail remains a flat column of sections | No (audit U8): Build card with problems at the top, modes ✓/✗ with reasons and main button, then collapsible sections Files, Instructions, Mappings (open) and Compatibility and diagnostics (collapsed unless a part is missing or on error); sensitive zone separated. "Retirer…" (Remove…) now confirms in a modal (same `detail-remove` / `detail-remove-confirm`, same text); "Dissocier" (Unlink) keeps its inline confirmation. Rename: Enter saves, Esc restores. Page titles per screen ("Détail du set — Brick Lab" (Set detail — Brick Lab)…). | E2E `filet-refonte`, `library` |
| The free building contextual bar goes at the bottom of the scene (proposal § 4) | No: at the bottom, it hid the floor near the camera, where you place, and the settings popover covered the manipulator (two E2E tests showed it: placement click and X handle intercepted). → One-line bar at the **top** of the scene (far background), settings (step, angle, coordinates) on a collapsible second line "Réglages" (Settings), HUD just below that lets clicks through; "Voir les connexions" (View connections) in the tool rail. Controls, keys and identifiers unchanged; the tests open "Réglages" before entering step or coordinates. | E2E `free-*`, `surface-placement`, acceptance test `libre-reel` |

## Journal — 2026-11-09, opening to contributions (branch `chore/community-files`)

Owner's request: prepare the public repository to receive issues and pull requests. Additions: `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue and PR templates (`.github/`), CI workflow; "Contribuer" (Contributing) section of the README (specification deviation declared).

| Assumption | Finding / decision | Evidence |
|---|---|---|
| No CI until proof that it is necessary (`CLAUDE.md`) | The proof exists: fork PRs would be checked by nothing, and Windows has never been run on a real machine. → **Lightweight** CI: `check:spec`, `typecheck`, unit tests, on macOS and Windows, on every PR and push to `main`. Read-only token, actions pinned by SHA, Git credentials not persisted. | `.github/workflows/ci.yml`, run on the PR |
| E2E tests can run in CI | Not without the LDraw library (download on every run, outgoing request outside normal use): they stay local (`npm run recette`), documented in `CONTRIBUTING.md`. | — |
| Contributors know the "no third-party content" rule | Nothing reminded them of it. → Reminder in `CONTRIBUTING.md`, mandatory checkbox in the bug template, checkbox in the PR template; blank issues disabled so that every issue goes through a template. | `.github/ISSUE_TEMPLATE/` |
| A vulnerability can be reported in an issue | No: GitHub private reporting ("Report a vulnerability"), to be enabled in the repository settings. Scope: untrusted files, local routes (`guard.ts`), network access (`safe-fetch.ts`). | `SECURITY.md` |
| Unit tests pass on Windows | Not all: first run on a real Windows machine (GitHub runner), 4 failures, **all in the tests**, none in the application. `npx` launched by `execFileSync` (it is `npx.cmd` on Windows) → Node itself with `--import tsx`. Folder made read-only by `chmod 0o500`: Windows ignores a folder's mode → the 2 tests concerned are skipped on Windows (the "read-only folder" case is therefore not covered there). First PDF.js load: 6.5 s on the runner against ~1 s on macOS → 30 s timeout for this single test. | PR CI, run 42690982650 |


## Journal — 2026-11-12, bilingual French / English interface (branch `feat/i18n-fr-en`)

Conventions and limits: [`src/i18n/README.md`](../../src/i18n/README.md).

| Assumption | Finding / decision | Evidence |
|---|---|---|
| An i18n library (next-intl, i18next) is needed | No: two languages, no per-language routing wanted (the URLs `/ajouter`, `/sets/…` stay), no dependency added. → Home-made layer without dependencies: TypeScript catalogs `fr` (reference, `Messages = typeof fr`) and `en` typed `Messages`; a missing or extra key or a different parameter is a **compile error**. Parameterized messages = functions (plurals decided per language). | `npm run typecheck`, `i18n` unit test (key and parameter parity) |
| The existing French can be reworded along the way | No: French remains the reference language, **byte for byte**; the E2E suites select by French labels and run with the language pinned (`locale: 'fr-FR'` in the Playwright configs). | Existing E2E unchanged |
| The language is chosen in the URL | No: explicit choice in a `brick-lab-locale` cookie (same origin, no outgoing request, no telemetry), otherwise the browser's `Accept-Language` (= `navigator.languages`); no header → French; only unsupported languages → English. FR/EN toggle in the top bar, applied without reload; `<html lang>` and page titles follow (`router.refresh()`). | `i18n` unit test, `i18n` E2E |
| Domain and server messages can stay in French | No: diagnostics, compatibility card, library errors are visible. → `msgs()` reads the current language: browser = interface language; server = request language (cookie / `Accept-Language`), set by `guard()` in an `AsyncLocalStorage`; unit tests and scripts = French. Error codes, HTTP statuses and formats unchanged. | `i18n-server` unit test, `i18n` E2E (API error in English) |
| Stored diagnostics follow the language | No: the parser's diagnostics are frozen in the `library.json` snapshot at import; they stay in the import language (documented limit, no data schema change). | — |

## Journal — 2026-11-12, documentation in English (branch `claude/docs-texts-english-e95274`)

Owner's request: all documentation and texts visible on GitHub in English, with a more recent screenshot in the README.

| Assumption | Finding / decision | Evidence |
|---|---|---|
| The v1.0 specification (`docs/01…09`, `CLAUDE.md`, `PROMPT_CLAUDE_CODE.md`, `fixtures/README.md`) cannot change | It stays frozen in meaning: the translation is declared file by file in `spec-deviations.json`; the French originals remain in the manifest version (`b019989`). File names are kept, so the manifest paths and every existing link still work. | `npm run check:spec` |
| UI labels quoted in the docs can be translated | No: the batch notes record the French interface as it was tested (French remains the reference language of the bilingual interface), so exact labels are kept verbatim with an English gloss on first use. Captured program output is left verbatim. | — |
| The README screenshot shows the current app | It predated the interface redesign. → New capture, English interface, reproducible from original CC0 fixtures only: `npx tsx scripts/readme-screenshot.ts <baseUrl> docs/images/workshop-free-building.png` (`next dev` on an empty `BRICK_LAB_DATA_DIR`). | `docs/images/workshop-free-building.png` |

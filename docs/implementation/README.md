# Implementation documentation

The repository contains two families of documents:

| Family | Location | Status |
|---|---|---|
| **Initial specification v1.0** | `README.md`, `CLAUDE.md`, `PROMPT_CLAUDE_CODE.md`, `docs/01…09`, `fixtures/`, `.gitignore` | Reference, frozen. Each file is tracked by SHA-256 in `DOSSIER_MANIFEST.json`, checked by `npm run check:spec`. |
| **Implementation** | `docs/implementation/` | Evolves with the code: batch notes, decision log, deviations, evidence. |

- [Technical note on the spike and the P0/P1 batch](10_SPIKE_ET_LOT_P0_P1.md)
- [Implementation decision log](JOURNAL_DECISIONS.md) (extends `docs/09`)
- [Deviations from the specification manifest](ECARTS_SPECIFICATION.md)
- [P0/P1 batch evidence](preuves/lot-p0-p1/)
- [P5 validation on real OMR sets](P5_VALIDATION_OMR.md)
- [31009 inventory against the official instructions](P5_INVENTAIRE_31009.md)
- [P5 manual acceptance test (to be done by the owner)](RECETTE_HUMAINE_P5.md)
- [P6 — synchronized instructions ↔ 3D: architecture and risks](P6_ARCHITECTURE_NOTICE_SYNC.md)
- [P6 — report, real 31040 trial, verdict](P6_RAPPORT.md)
- [P6 manual acceptance test (to be done by the owner)](RECETTE_HUMAINE_P6.md)
- [P7 — personal library: architecture, security, backup and restore](P7_ARCHITECTURE_BIBLIOTHEQUE.md)
- [P7 — report, real 31040/31009 acceptance test, limits, verdict](P7_RAPPORT.md)
- [P7 manual acceptance test (to be done by the owner)](RECETTE_HUMAINE_P7.md)
- [P8 — simplified import: sources, permissions, strategy and risks](P8_ARCHITECTURE_IMPORT.md)
- [P8 — report, real acceptance test, limits, verdict](P8_RAPPORT.md)
- [P8 manual acceptance test (to be done by the owner)](RECETTE_HUMAINE_P8.md)
- [Workshop — resizable panels, fitted instructions, part thumbnails: report](UX_ATELIER_RAPPORT.md)
- [Manual acceptance test of the workshop UX batch (done by the owner, 2026-11-06)](RECETTE_HUMAINE_UX_ATELIER.md)
- [Known limitation: free building is only free in the order](LIMITATION_MONTAGE_LIBRE.md)
- [True free building: architecture (model target ≠ player placement)](MONTAGE_LIBRE_ARCHITECTURE.md)
- [True free building: report, tests, measurements, verdict](MONTAGE_LIBRE_RAPPORT.md)
- [Manual acceptance test of true free building (done: NO-GO, two limitations)](RECETTE_HUMAINE_MONTAGE_LIBRE.md)
- [Fixes: free height and groups (cause, tests, compatibility)](MONTAGE_LIBRE_CORRECTIONS.md)
- [Targeted manual acceptance test of the fixes (done: NO-GO, four problems)](RECETTE_HUMAINE_MONTAGE_LIBRE_CORRECTIONS.md)
- [Connections, transformations and snapping: architecture note](MONTAGE_LIBRE_CONNEXIONS.md)
- [3-axis rotations, direct manipulation, assemblies, magnet: report](MONTAGE_LIBRE_3D_RAPPORT.md)
- [Manual acceptance test of the four problems (no result reported; next: 3D manipulator)](RECETTE_HUMAINE_MONTAGE_LIBRE_3D.md)
- [3D manipulator (gizmo): design and report](MONTAGE_LIBRE_GIZMO.md)
- [Manual acceptance test of the 3D manipulator (to be done by the owner)](RECETTE_HUMAINE_MONTAGE_LIBRE_GIZMO.md)
- [Reliable connections: magnet from the tray, Technic axles, hidden assemblies — diagnosis, rules, 31039 inventory, performance](CONNEXIONS_FIABILISEES.md)
- [Manual acceptance test of the connections (done by the owner: GO, 2026-11-08)](RECETTE_HUMAINE_CONNEXIONS.md)
- [Fit of the beige block with a hole on the 31039: identification, cause (stretched studs, recessed tubes), fix, evidence](CORRECTION_BLOC_31039.md)
- [Manual acceptance test of the beige block (to be done by the owner)](RECETTE_HUMAINE_BLOC_31039.md)

## Developer quick start

Prerequisites: macOS, Node ≥ 20.9 (tested 24.5), npm. Windows: preview, see the root README (§ Windows) and the [journal](JOURNAL_DECISIONS.md#journal--2026-11-08-windows-support-branch-featwindows-support).

1. LDraw parts library (once, outside the repository): download `complete.zip` from https://library.ldraw.org/library/updates/complete.zip, unzip it for example into `~/Documents/brick-lab-data/` (`ldraw/` folder), then create `.env.local` at the project root:
   ```
   LDRAW_LIBRARY_DIR=/Users/<toi>/Documents/brick-lab-data/ldraw
   ```
   License: CC BY 4.0, see `CAreadme.txt` in the library. Never commit it.
2. `npm ci` puis `npx playwright install chromium`.
3. `npm run check:ldraw` checks the library.
4. `npm run dev` → http://127.0.0.1:3000 (listens on 127.0.0.1 only, Next telemetry disabled). The home page is "Ma collection" (My collection); "Ajouter un set" (Add a set) is at `/ajouter`; the P5/P6 workshop without a collection is at `/atelier`.
   Optional (P8): `REBRICKABLE_API_KEY=<your key>` in `.env.local` to display the name, year and advertised part count; `BRICK_LAB_ONLINE=0` to forbid any Internet access (local import remains complete).
5. Acceptance tests: `npm run recette` (typecheck + Vitest + Playwright).

Technical note on the spike and limits: [10_SPIKE_ET_LOT_P0_P1.md](10_SPIKE_ET_LOT_P0_P1.md).

## Validation on real sets (P5)

OMR models and instructions stay outside the repository, in `~/Documents/brick-lab-data/` (or `$BRICK_LAB_DATA`):
`models/<set>/<set>.mpd`, `instructions/<set>/<set>_notice_<id>.pdf`. Without them, the `omr-validation` spec is skipped.

```bash
npm run compat-report -- ~/Documents/brick-lab-data/models/31040-1/31040-1.mpd
npx playwright test tests/e2e/omr-validation.spec.ts   # GPU, scripted pointer/keyboard player
npm run perf                                           # production build, 3 runs, median
npx tsx scripts/level-baseline.ts <model.mpd>          # PageUp/PageDown presses of the old scheme (reference)
```

To add an npm dependency: `rm -rf node_modules package-lock.json && npm i`, then check that `node_modules/@rolldown/binding-*` exists (npm bug with optional dependencies).

## Synchronized instructions (P6)

Instructions ↔ 3D mappings are entered in the **Correspondances** (Mappings) tab. They are saved locally and can be exported as `<model>.brick-mapping.json`. The real 31040 mapping stays outside the repository, in `$BRICK_LAB_DATA/mappings/31040-1.brick-mapping.json`. Without it, the `instructions-sync-omr` spec is skipped.

```bash
npx vitest run tests/unit/mapping.test.ts
npx playwright test tests/e2e/instructions-sync.spec.ts        # synthetic fixtures
npx playwright test tests/e2e/instructions-sync-omr.spec.ts    # real 31040 trial (GPU)
```


## Personal library (P7)

Data in `~/Documents/brick-lab-data/library/` (or `$BRICK_LAB_DATA_DIR/library/`). Backup and restore: [P7_ARCHITECTURE_BIBLIOTHEQUE.md § 7](P7_ARCHITECTURE_BIBLIOTHEQUE.md#7-startup-backup-restore).

```bash
npx vitest run tests/unit/library-store.test.ts tests/unit/library-api.test.ts
npx playwright test tests/e2e/library.spec.ts          # original fixtures, temporary folder
npx playwright test tests/e2e/library-webkit.spec.ts   # Chromium ↔ WebKit (npx playwright install webkit)
npx playwright test tests/e2e/library-omr.spec.ts      # real 31040/31009 trial (skipped without the files)
```

The E2E suites start their server on a temporary folder and refuse a server already running on another folder: stop `npm run dev`/`npm run start` before `npm run recette`.

# Initial state of the acceptance test (before the redesign)

- Branch `claude/brick-lab-ui-refonte-188be7`, worktree `.claude/worktrees/brick-lab-ui-refonte-188be7`, base `a1309a4` = `origin/main` (fetched 2026-11-09).
- Machine: macOS 25.6.0, Apple M2 Pro, Node 24.5.0, Chromium 156 (Playwright 1.64.1).
- LDraw library: `~/Documents/brick-lab-data/ldraw` (`.env.local` created in the worktree per the README, not versioned; `npm run check:ldraw` OK).

## `npm run recette` — passed (exit code 0)

| Step | Result |
|---|---|
| `check:spec` | OK (specification manifest intact) |
| `typecheck` | OK |
| `npm test` (Vitest) | 17 files, **317 passed, 1 skipped** (318) |
| `npm run test:e2e` (Playwright, Chromium + WebKit contexts) | **86 passed**, 0 failed, 0 skipped, 19.2 min |

The real-set suites (`*-omr.spec.ts`) ran: the files for 31040, 31009, 31039 are present in the data folder. No pre-existing failures to report.

## `npm run perf` — passed (production build, port 3100)

| Set | Import → first frame | Geometry | FPS idle / orbit | JS heap | LDraw requests (of which 404) |
|---|---|---|---|---|---|
| 31040-1 | 1,131 ms | 546 ms | 60 / 60 | 26 MB | 490 (171) |
| 31009-1 | 1,152 ms | 736 ms | 60 / 60 | 68 MB | 812 (293) |

Average over 3 passes, ANGLE Metal (M2 Pro). Full details: `REFONTE/perf-avant.json`. The test also writes `~/Documents/brick-lab-data/proofs/p5/perf.json` (overwritten by this run; the 2026-11-04 version was copied aside beforehand, outside the repository).

**Non-regression threshold adopted for phase 5**: import → first frame ≤ ~1.2 s (± 10%) and 60 FPS at idle and in orbit on both sets.

## Missing E2E coverage of inventory flows

Phase 3: covered by `tests/e2e/filet-refonte.spec.ts` (6 tests, green on the old UI), except camera pan and zoom (P2, P3), checked by hand in phase 5 (the wheel gesture has no stable observable effect without instrumenting the camera).


- Offline mode `BRICK_LAB_ONLINE=0` in the UI (Q11): tested only at unit level.
- LDraw library missing (Q10): no E2E.
- Abandoning in the standalone workshop (K10) and in the library workshop (confirmation): only indirect.
- Removing a build / a set (C19), verifying fingerprints (C11), exporting the mappings from the detail page (C15).
- G (grid) and Q (local axes) shortcuts (O14, O16), camera pan/zoom (P2, P3).
- Editor: delete/move up/move down a step (M8), clear all + restore (M18, M19).

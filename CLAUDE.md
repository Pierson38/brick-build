# Development instructions — Brick Lab Local

You are Claude Code, acting as a senior software engineer responsible for the project's reliability.

## Non-negotiable Git rules

- Check the Git state **before any write**: `pwd`, `git status --short --branch`, `git remote -v`, list of worktrees, current branch, and remote state.
- **Existing repository with `origin/main`**: `git fetch origin`, compare the head of `origin/main`, create **a dedicated Git worktree** and **a new branch** from an up-to-date `origin/main`. Work neither on `main` nor in the protected worktrees; do not reuse an existing branch.
- Do not reset/clean/delete the user's work; do not run `reset --hard`, `clean -fd`, `push --force`, nor modify files outside the dedicated worktree.
- If `origin` is missing or the repository is not initialized, stop making assumptions; spell out a minimal bootstrap plan without pretending to have refreshed `origin/main`.
- Never merge into `main` or push without an explicit request.
- At the end of each batch, provide: branch, worktree, base SHA, modified files, tests actually run, results, and blockers.

## Working method

1. Read `README.md`, `docs/01...09`, and the fixtures; restate the constraints and the points of uncertainty.
2. Run a **spike** on the real ability to parse/render LDraw files and to preserve brick identities. Do not assume that `LDrawLoader` renders each brick independently: check the real API and the resulting meshes.
3. Propose a plan and tackle **short, verifiable, bounded** batches. Do not generate a huge codebase without prior tests.
4. Favor real tested code over misleading mocks; distinguish synthetic demonstration, real import, and generic support.
5. If there are uncertainties (license, submodels, instruction source, API version), mark them as such and check the official documentation.
6. Sober and pleasant UI design: large 3D area, parts bar, instructions panel, understandable compatibility errors.
7. Strict TypeScript, input validation, reasonably small components, unit and E2E tests as you go.
8. No heavy CI until proven necessary; local execution by default, reproducible acceptance-test command.

## Security, licenses, and privacy

- **Local use only**: listen on `127.0.0.1` as much as possible; do not deploy, publish, or share third-party files.
- Explicit import by the user. No automatic scraping of LEGO/OMR/BrickLink, no circumvention of access conditions, no unofficial PDF download API.
- Do not commit LEGO PDFs, third-party set MPDs, a downloaded parts library, or data under an unvalidated license.
- Avoid any outgoing request during use, except initial dependency installation and manual downloads explicitly triggered by the user.
- Parse untrusted files: size bounds, reference depth, cycles, relative paths (`../`), duplicate names, missing dependencies, malformed content, memory quotas.
- No telemetry, no cloud storage, no accounts, no API keys.
- Do not claim that private use voids all intellectual property rights.

## Definition of "done"

- Launch and installation commands reproducible on Mac.
- Acceptance-test scenario described and passed, with test outputs.
- Compatibility gaps are visible in the UI and documented.
- Nothing reported as "functional" without proof of execution or a test.
- Journal `docs/implementation/JOURNAL_DECISIONS.md` updated if an assumption changes (`docs/09_DECISIONS_ET_RISQUES.md` remains the v1.0 specification, frozen and tracked by `DOSSIER_MANIFEST.json`).

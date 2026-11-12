# Contributing to Brick Lab Local

Thanks for your interest! Brick Lab Local is a personal project maintained in spare time, so replies may take a few days. This guide explains how to report a problem, suggest an idea, or send a change without wasting time on either side.

By participating, you agree to the [code of conduct](CODE_OF_CONDUCT.md).

## Language

The documentation is in **English**; the interface is available in French (reference language) and English. Issues and PRs are welcome in English or French.

## The golden rule: no third-party content

The repository must **never** contain, whether in the code, an issue or a PR:

- a LEGO **instruction booklet** (PDF, screenshots or page excerpts);
- a **third-party set file** (`.mpd`, `.ldr`), including those from the [LDraw OMR](https://library.ldraw.org/omr): give the **set number** and the **link** to its page instead;
- the **LDraw parts library** or any part of it;
- an API key (Rebrickable or other) or the contents of your `.env.local`.

To reproduce a problem, a small `.ldr` file **written by you** (a few parts, original positions) is ideal: it can become a CC0 fixture in `tests/fixtures/`.

## Reporting a bug

Open an [issue](https://github.com/Pierson38/brick-lab-ldraw/issues/new/choose) with the "Bug" template. The information that saves the most time:

- system (macOS, Windows in preview), browser and Node.js version (`node --version`);
- commit used (`git rev-parse --short HEAD`);
- output of `npm run check:ldraw`;
- set number and file source, steps to reproduce, expected and actual result;
- screenshot of the application if useful (with no instruction booklet page visible).

**A security vulnerability is not reported in a public issue**: see [SECURITY.md](SECURITY.md).

## Suggesting an improvement

Open an "Improvement" issue **before** coding anything substantial: we check together that the idea fits the scope (see [`docs/01_PRODUIT_ET_PERIMETRE.md`](docs/01_PRODUIT_ET_PERIMETRE.md)) and respects the project's principles:

- **local only**: server on `127.0.0.1`, no account, no telemetry, no cloud storage;
- **minimal, explicit network use**: no outgoing request without a user action, allowed hosts listed, bounded sizes and timeouts;
- **no automatic download** of instruction booklets, no scraping of LEGO, BrickLink or the OMR;
- **honesty about limits**: an incomplete model is flagged as such, never presented as buildable.

Typo fixes, documentation fixes and small bug fixes can go straight to a PR.

## Setting up the environment

Follow the [Installation](README.md#installation) section of the README (Node.js ≥ 20.9, LDraw library, `.env.local`), then:

```bash
npx playwright install chromium
```

```bash
npm run recette
```

`recette` chains the spec check, `tsc --noEmit`, the unit tests and the E2E tests. Stop `npm run dev` first: the E2E tests start their own server on port 3000.

## Sending a pull request

1. Fork the repository and create a branch from an up-to-date `main`, named after its purpose: `feat/…`, `fix/…`, `docs/…`, `chore/…`.
2. Keep the PR **short and focused on a single topic**; a large change is split into several PRs.
3. Add or adapt the **tests**: unit tests (`tests/unit/`, Vitest) for logic, E2E tests (`tests/e2e/`, Playwright) for a user flow. A bug fix comes with a test that failed before.
4. Run `npm run recette` and state in the PR what you actually ran and on which system.
5. For a visible change, attach before/after screenshots.
6. Write commits in the format `type(scope): summary`, in English or French, for example `fix(free-building): snapping works for a part taken from the tray`.

CI (GitHub Actions) reruns the spec check, the typecheck and the unit tests on macOS and Windows. The E2E tests do not run in CI: they need the LDraw library, which must be installed locally.

## Code landmarks

- `src/domain/`: LDraw parser, build engine, connections, import. **No Three.js or React**, testable in isolation.
- `src/infra/`, `src/server/`: file access, persistence, constrained network access (`src/server/net/safe-fetch.ts`), local routes protected by `src/server/http/guard.ts`.
- `src/components/`, `src/app/`: interface (Next.js App Router, React, `@react-three/fiber`).
- **Strict** TypeScript; any input coming from a file or a request is validated and bounded (size, depth, cycles, `../` paths, duplicate names).
- No new dependency without justification in the PR: every package must work offline and send nothing.

## Frozen specification and decision log

The v1.0 specification files (`docs/01…09`, `fixtures/`, `README.md`, `CLAUDE.md`, `PROMPT_CLAUDE_CODE.md`, `.gitignore`) are tracked by SHA-256 fingerprint in `DOSSIER_MANIFEST.json` and checked by `npm run check:spec`. To change one, declare the deviation in `docs/implementation/spec-deviations.json` (including the current fingerprint) and in [`docs/implementation/ECARTS_SPECIFICATION.md`](docs/implementation/ECARTS_SPECIFICATION.md).

When a project assumption changes, add an entry to [`docs/implementation/JOURNAL_DECISIONS.md`](docs/implementation/JOURNAL_DECISIONS.md).

## AI-assisted contributions

The project is developed with Claude Code; [`CLAUDE.md`](CLAUDE.md) contains the instructions given to the assistant. Contributions written with an AI are welcome, provided that you have **reviewed, understood and tested** them yourself: you remain the author of your PR.

## License of contributions

By submitting a contribution, you agree that it will be published under the project's [MIT license](LICENSE). Any fixtures you add must be original creations, published under CC0-1.0.

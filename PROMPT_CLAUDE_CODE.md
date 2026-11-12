# STARTUP PROMPT — TO GIVE TO CLAUDE CODE

You are my lead full-stack/3D developer. I want to create **Brick Lab Local**, a personal website, run only locally on my Mac, to **virtually rebuild real LEGO sets piece by piece**.

I have provided you with a specification folder. Start by reading in full:

- `CLAUDE.md`
- `README.md`
- `docs/01_PRODUIT_ET_PERIMETRE.md`
- `docs/02_ARCHITECTURE.md`
- `docs/03_LDRAW_ET_ETAPES.md`
- `docs/04_UX_ET_PARCOURS.md`
- `docs/05_PLAN_DE_REALISATION.md`
- `docs/06_TESTS_ET_ACCEPTATION.md`
- `docs/07_DROITS_ET_SOURCES.md`
- `docs/08_SCHEMA_DONNEES.md`
- `docs/09_DECISIONS_ET_RISQUES.md`
- `fixtures/`

## User goal

I choose or import an existing LEGO set via an LDraw-compatible `.mpd` / `.ldr` file, then I can build it virtually: select the right bricks, move them, snap them to their location, see my progress, and resume my build.

Two modes are eventually essential:

1. **3D steps mode**: display and play the steps *actually present* in the LDraw file, when they are usable; do not invent an exact correspondence with the LEGO instructions.
2. **PDF instructions and free building mode**: locally import my official LEGO PDF, display the pages in a panel, and allow 3D building alongside **even without `0 STEP`**. The user chooses a reference/color from the remaining stock and places it at a compatible final location; the order comes from the PDF, followed by a human. Independent PDF navigation, unless a manual mapping is confirmed.

The MVP must not block on the ability to automatically reconstruct the PDF instructions: this is not a requested feature for the first batch.

## Constraints

- Personal and local use, no SaaS, no account, no public server, no automatically downloaded catalog.
- Do not automatically fetch or distribute third-party PDFs or set files. The user provides their own files.
- Preferred stack: Next.js, strict TypeScript, React Three Fiber, Three.js / LDrawLoader, PDF.js, Vitest, Playwright.
- Preserve each brick occurrence and its target transformation; identical bricks remain distinct entities.
- Plan for subassemblies, models without steps, and missing parts; degrade gracefully.
- Smooth 3D rendering on Mac, without overengineering and without cloud infrastructure.

## Git mandatory

Start from an `origin/main` that is actually up to date (`git fetch origin`), **new branch + dedicated worktree**, never work on `main` or a protected worktree. If the repository does not exist or `origin` is missing, state it explicitly and propose a safe repository initialization; do not invent a remote or a SHA. Do not merge/push anything without my GO.

## First mission: PREFLIGHT + SPIKE, then first batch

1. Check the Mac environment, Node, npm/pnpm, Git, worktrees, and library versions.
2. Examine the fixtures and the LDraw specification. Verify what the chosen version of `LDrawLoader` actually returns: hierarchy, `buildingStep`, association between geometry and original part, brick dependencies.
3. Implement a testable **structural** parser for `.mpd/.ldr` (`0 FILE` sections, type 1 references, `0 STEP`, subfiles), with stable IDs and composed transformations. Do not use Three.js rendering alone as the source of steps.
4. Display the synthetic model in a minimal 3D scene. If an official LDraw parts library is needed, document its local installation without bundling the downloaded files into the repository.
5. Expose a first progression over the steps and a simple snap to the target location. Also plan a free building mode for `no-steps.ldr`, with target matching by reference/color/position and without an invented step. Do not claim to support all of Technic.
6. Then add a PDF panel for the local file, with previous/next page and zoom; do not automatically couple the PDF page and the 3D step.
7. Targeted unit and E2E tests; have what works and what is still blocked observed.

Before each major implementation, show the trade-offs and risks. Do not settle for a visual skeleton. A minimal result that is **actually playable** is worth more than 20 half-implemented features.

## Expected report format

- Git preflight: branch/worktree/base SHA.
- What you verified in the sources and the code.
- Files created/modified.
- Tests actually run with commands and results.
- Screenshot or proof of rendering, if possible.
- Known limits: import, steps, performance, instructions.
- Recommended next batch, with a reasoned GO/NO-GO.

Start now with the preflight and the spike. You are authorized to create code **in the new worktree**, not to modify `main`.

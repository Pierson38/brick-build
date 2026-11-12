# 01 — Product requirements

## Vision

A local 3D building game where the user reproduces **real LEGO sets** from imported files, choosing and placing bricks as from a real box.

## User and platform

- Single user: the owner of the Mac, French-language interface.
- Modern desktop browsers, Chrome/Safari on Mac first; keyboard + mouse/trackpad.
- First target: simple sets, from a few dozen to ~300 parts, and artificial fixtures. Large Technic sets (>1,000 parts) remain out of the initial target.
- No sign-up, LEGO account, or Internet needed during sessions once the dependencies and the local library are installed.

## Priority features (MVP)

**MVP-01 — Local model import**
- Select a `.ldr` or `.mpd` file; display the name, number of part occurrences, colors, sections, subassemblies, detected steps, unknown parts.
- Categorized result: `ANALYSABLE` / `RENDERABLE` / `GUIDED_PLAYABLE` / `MANUAL_ONLY`, with precise reasons.
- The player chooses the main model if an MPD contains several candidates.

**MVP-02 — 3D scene**
- Rotation, zoom, recentering, ergonomic camera.
- Full model as a preview; during play, only the parts already validated appear solid.
- The next target area appears as a ghost; the parts to place are highlighted.

**MVP-03 — Placement game**
- Each brick occurrence has a distinct ID, an LDraw reference, a color, a target transformation, and optionally a step.
- The player takes a part from the step's list; moves the part to the scene; it snaps if close enough; visual and optional audio confirmation (disabled by default).
- Simplified part rotation or an "assisted placement" mode; tolerances documented in LDraw units/degrees.
- Prevent using the same occurrence twice; undo a placement, reset a step.

**MVP-04 — Available 3D steps**
- Use `0 STEP` when present and correctly interpretable.
- If absent or ambiguous, display "Étapes non disponibles" (Steps unavailable) and offer **the instructions / free building mode**: all unplaced occurrences are candidates, the user follows their PDF and chooses the order. No validation of the official order, only of the final location.
- Never claim that the steps are identical to the official PDF's if that has not been verified.

**MVP-04b — Free building with instructions (even without STEP)**
- Show the stock of available occurrences by reference/color; select a brick and place it.
- On snap, look for a **compatible remaining target occurrence** (reference/color and transformation), then assign its unique ID. Visually identical bricks must not duplicate state.
- The order is not certified as physically buildable: the user follows it with their instructions. If the engine cannot render a part or a placement is ambiguous, display a diagnostic and allow recovery.

**MVP-05 — Local PDF instructions**
- Import a `.pdf` file from the computer, display one page at a time with navigation and zoom; split instructions/3D interface.
- The PDF page number is independent of the build step index.
- No OCR or automatic extraction of assembly sequences in the MVP.

**MVP-06 — Saving**
- Save locally the model identity (hash), the schema version, the validated occurrences, and the visual progress state.
- If the model is not durably stored locally, offer to reimport it after reload and restore its progress by hash.
- PDF: it can be imported again; do not save the bytes by default.

## Initial out of scope

- Centralized set catalog, official box images, LEGO search engine, scraping.
- Downloading LEGO instructions inside the app.
- Vision/AI analysis of PDFs, automatic export of instructions, automatic page→step alignment.
- Realistic fitting physics, Technic flex parts, moving mechanisms, detailed stickers, advanced minifigures.
- Multiplayer, AR/VR, scores, payment, cloud sync, online deployment.

## MVP success indicators

- Import of a synthetic fixture with 4 parts / 2 steps and correct display.
- Selection and placement validated for all occurrences of at least one fixture, without duplicating parts.
- Saving and resuming after refresh.
- PDF instructions imported and navigable independently.
- Import of a real OMR MPD, **tested**, with a transparent compatibility report; "playable" only if the build order and rendering are actually validated.

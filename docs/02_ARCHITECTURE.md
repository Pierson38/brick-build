# 02 — Proposed architecture

## Technical choices

- **UI**: Next.js (App Router) + React + strict TypeScript; client components for WebGL/PDF.
- **3D**: Three.js + `@react-three/fiber`; `@react-three/drei` for camera/controls if relevant.
- **Geometry reading**: official `LDrawLoader` (`three/addons/loaders/LDrawLoader.js`), **to be verified by a spike** for individual occurrences. It may create an aggregated scene: do not equate meshes with a type 1 line.
- **Structural parser**: in-house TS code, isolated and testable, without Three.js; reads type 1 lines, MPD, STEP, submodels, inherited color.
- **PDF**: PDF.js (`pdfjs-dist`) client-only, worker configured correctly for the version actually installed; no request to the LEGO server.
- **State**: Zustand or lightweight React state; do not impose Redux.
- **Persistence**: IndexedDB if needed for large structured data, or localStorage for small progress state, with schema version, file hash, and size checks.
- **Tests**: Vitest (parser and progression rules), Playwright (import and game flows), targeted manual visual tests.

## Domains

1. `model-import`: File API, validation, root model selection, diagnostics.
2. `ldraw-parser`: semantic representation of occurrences (renders nothing).
3. `geometry-catalog`: LDraw parts and geometries; handling of missing references.
4. `build-plan`: playable steps or absence of steps, preserved order, subassemblies.
5. `build-engine`: part choice, placement state, snap / tolerances, undo, completion; two distinct strategies `guided` (active step) and `freeManual` (all remaining compatible targets).
6. `viewer-3d`: scene, camera, ghost piece, interactions.
7. `pdf-viewer`: local preview, pages, zoom, page memory.
8. `persistence`: serialization, migration, hash, resume.

## Data flow

```text
User imports a .mpd/.ldr file
  → validation and hash
  → structural parser: MPD, type-1, STEP, hierarchy
  → resolution of references against the local part library
  → completeness diagnostic + step preparation
  → 3D renderer + game engine

User imports PDF
  → local PDF validation
  → PDF.js, instructions panel
  → independent page navigation

Game engine
  → list of placed occurrences + progress
  → local storage tied to the model hash
```

## Proposed application tree

```text
src/
  app/page.tsx
  components/import/ModelImporter.tsx
  components/build/BuildWorkspace.tsx
  components/build/PartsTray.tsx
  components/build/StepNavigator.tsx
  components/three/BuildCanvas.tsx
  components/pdf/PdfPanel.tsx
  domain/ldraw/parser.ts
  domain/ldraw/normalize.ts
  domain/ldraw/types.ts
  domain/build/build-plan.ts
  domain/build/snap.ts
  domain/build/progress.ts
  infra/ldraw/part-library.ts
  infra/persistence/local-progress.ts
  tests/...
```

This is a proposal; adapt it to existing conventions. Avoid unnecessary server dependencies.

## Essential note on rendering

The groups returned by `LDrawLoader` do not automatically guarantee a 1 group = 1 brick mapping. To make bricks individually manipulable, run **an experimental spike**: identify the capabilities of the modern loader or assemble geometries per occurrence from the parser. Steps are provided by the parser, never naively deduced from the number of meshes.

The occurrence model is the source of truth for gameplay; Three.js is only used for display and interaction.

## Performance and safety

- Start with 4 parts, then 50, then 300; measure import time, first render, FPS, memory.
- Reuse geometries for identical references; `InstancedMesh` if the selection/ghosting mode allows it, otherwise simplify for V1.
- Bound upload sizes, the number of sections, the number of parts, the submodel depth, and main-thread work.
- Do not build a remote API or expose the server on `0.0.0.0` by default.

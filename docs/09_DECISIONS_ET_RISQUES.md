# 09 — Decisions, risks, and questions to settle

## Decisions already made

- Personal, single-user project, local on Mac.
- The targeted sets are real LEGO references, imported by the user.
- PDF instructions are imported manually; do not set up any automatic download.
- Two modes: guided 3D steps from an available structure + free building accompanied by a local PDF instruction booklet when steps are missing.
- Absolute priority on **playability**: picking/placing bricks, not just scrolling through steps.
- Develop the engine before the catalog.
- TS / Next.js / Three.js / R3F / PDF.js stack, subject to documented compatibility.

## Risks and mitigations

| Risk | Impact | Mitigation / guard |
|---|---|---|
| OMR without `0 STEP` | High | Diagnostic + non-guided mode, future editor |
| Submodel = group rather than brick | High | Separate structural parser, path-based IDs, spike |
| `LDrawLoader` merges geometries | High | Verification of the real API, independent rendering per occurrence |
| PDF and model have different steps | High | Independent navigation, no fake sync |
| Missing parts/variants | Medium | Precise diagnostic, do not mark rendering complete |
| Complex Technic and flex parts | Medium | Outside MVP, targeted tests later |
| Malformed imported files | High | Quotas, depth limits, validation and errors |
| Rights confusion on sets/instructions | High | Local use, manual import, no redistribution |
| Save tied to the wrong model | High | Hash + versioning + restoration tests |
| Overinvestment before proof of feasibility | High | Short batches, GO/NO-GO and demonstration at each phase |

## Points to verify in the spike (do not assume)

- Current version of `three` and precise `LDrawLoader` API, notably the exposure of steps/occurrences.
- Strategy that actually works for loading the LDraw library locally in Next.js, without network at runtime.
- Matrix/axes and submodel composition according to test files.
- Practical performance of separate geometries and placement modes.
- Quality of a **real OMR MPD chosen and provided by the user**: all references resolved? steps? number of occurrences?
- Chrome and Safari behavior with PDF.js/worker locally.

## Questions deferred until after the POC

- Do you want us to create an assembly sequence editor for MPDs without steps?
- Should the MPD and PDF files themselves be durably saved in IndexedDB, or should their reimport be requested?
- What is the first real validation set, after the synthetic fixtures succeed?
- Which manipulation mode should take priority: free drag-and-drop, or part selection then "place" with automatic adjustment?

These questions must not block the initial spike.

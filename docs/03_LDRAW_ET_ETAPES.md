# 03 — LDraw, import, and step handling

## Sources and formats

- LDraw: `.ldr` (text model), `.mpd` (several logical files in a text container), `.dat` (part definition); UTF-8 encoding in the specification.
- OMR: community replicas of real LEGO sets, **not official LEGO 3D files**.
- The part geometry library must be installed locally by the user or via an explicit procedure compliant with the licenses; do not commit it.
- In the MVP, `.io` (BrickLink Studio) and `.lxf` remain **out of scope**; do not advertise them as imported.

## Reading the lines that matter

```text
0 FILE exemple.mpd
0 Name: exemple.mpd
1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat
0 STEP
1 14 0 -24 0 1 0 0 0 1 0 0 0 1 3001.dat
0 STEP
0 NOFILE
```

- `0 FILE <name>`: new section in an MPD.
- `0 NOFILE`: end of section (when present).
- `1 <color> <x y z> <a b c d e f g h i> <file>`: referenced occurrence, translation and 3×3 matrix.
- `0 STEP`: marks the **end** of a step, not the start.
- `0 ROTSTEP` and other meta-commands: keep/ignore explicitly depending on support, document the limits.
- Subfile names may contain spaces: parse robustly, keeping the rest of the line for the reference.

## Recommended algorithm

1. Read the text file and isolate the MPD sections; for a standalone `.ldr`, create a single section.
2. Determine the root section from the convention/metadata, or ask the user if ambiguous.
3. Build the table of internal subfiles, without collisions or destructive normalization.
4. Parse each section, keeping order, `0 STEP`, type 1, and useful metadata.
5. Detect cycles, missing subfiles, excessive depth, `../` references, quota overruns.
6. Recursively resolve each submodel reference with composition of transformations: `M_global = M_parent * M_local`.
7. Resolve the inherited color (`16` = current color in LDraw, depending on context); do not arbitrarily overwrite children's colors.
8. Assign a deterministic ID **per occurrence**, with an occurrence path (`root/3/submodel/2/...`) and a part reference, to distinguish two identical bricks.
9. Expose final parts, subassemblies, known and unknown steps, quality diagnostic, and model source.
10. Prepare a `buildPlan` whose steps come **only from the model's real data or from an edited mapping**, never from a supposed automatic reading of the instructions.

## Step complexity

Submodels may contain their own `STEP`s. A root-level `0 STEP` does not guarantee a physical placement sequence for all bricks. A submodel reference may represent an entire subassembly. A distinction is therefore needed:

- **ROOT_STEPS**: order of references in the main section; may include entire groups.
- **NESTED_STEPS**: information present in submodels, sometimes usable separately.
- **FLATTENED_STEPS**: placement order at the final-part level, obtained by an explicitly documented and tested strategy, not automatically equivalent to the official instructions.
- **NO_STEPS**: finished model only; in the MVP, **free building mode**: stock of available parts, choice by reference/color, placement on the matching remaining final target. No order-based guidance and no claim of fidelity to the instructions.

LEGO PDF instructions do not contain directly usable coordinates. Do not announce PDF/MPD synchronization without a verified mapping. For the MVP, PDF and 3D are two **parallel** views.

## Compatibility cases to detect

- Valid `.mpd` but only an assembled model without `0 STEP`.
- A positive number of `STEP`s but ambiguous steps due to nested submodels.
- An LDraw part is missing from the local library.
- MPD file with several alternative models.
- Circular reference `A → B → A`.
- `0 FILE` whose name contains spaces or case differences.
- Repetition of the same part reference at several positions/colors.
- Part with a non-trivial rotation matrix, mirroring, invalid scale.
- Large or malformed file; no processing without bounds.

## Reference sources

- LDraw specification: https://www.ldraw.org/article/218.html
- OMR: https://library.ldraw.org/omr
- OMR standard: https://library.ldraw.org/documentation/official-model-repository-omr-standards/official-model-repository-omr-specification
- Three.js LDrawLoader: https://threejs.org/docs/pages/LDrawLoader.html
- Demo: https://threejs.org/examples/webgl_loader_ldraw.html

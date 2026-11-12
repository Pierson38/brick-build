# Synthetic LDraw fixtures

These three files were written for the project; they are **not official LEGO sets** and **include no geometry** of LDraw parts. They only reference `3001.dat` (standard 2×4 brick), which must be loaded from a locally installed LDraw parts library.

- `mini-4-pieces.mpd`: 4 occurrences of `3001.dat`, 2 steps, two colors per layer.
- `nested-submodel.mpd`: 2 occurrences of a 2-part submodel (4 final bricks); the occurrences must have unique identifiers despite the repetition.
- `no-steps.ldr`: 2 occurrences without a `0 STEP` command, expected `NO_STEPS`.

Usage: structural tests, then rendering tests once the local library is configured. The transformations are compilation/parser examples; do not infer from their simplicity a universal support for LEGO Technic geometries.

# 08 — Proposed data contracts (to be refined during the spike)

The TypeScript code below is **indicative**, not an already validated API.

```ts
type ImportQuality =
  | 'INVALID'
  | 'ANALYSABLE'
  | 'RENDERABLE'
  | 'MANUAL_ONLY'
  | 'GUIDED_PLAYABLE';

type StepProvenance = 'LDRAW_ROOT' | 'LDRAW_NESTED' | 'USER_EDITED' | 'NONE';
type BuildMode = 'guided' | 'freeManual';

type Matrix4Tuple = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

interface BrickOccurrence {
  occurrenceId: string;          // stable path in the hierarchy
  partRef: string;               // e.g. "3001.dat"
  colorCode: string;
  targetMatrix: Matrix4Tuple;    // in a documented global frame
  sourcePath: string;            // MPD section + reference index
  ancestorSubmodels: readonly string[];
  renderable: boolean;
}

interface BuildStep {
  id: string;
  index: number;
  occurrenceIds: readonly string[];
  provenance: StepProvenance;
  note?: string;                 // do not claim PDF page == index
}

interface ImportedModel {
  contentHash: string;          // SHA-256 or strong equivalent
  displayName: string;
  rootModelName: string;
  occurrences: readonly BrickOccurrence[];
  steps: readonly BuildStep[];
  quality: ImportQuality;
  diagnostics: readonly string[];
  provenance?: { sourceUrl?: string; licenseNotice?: string; author?: string };
}

interface LocalBuildProgress {
  schemaVersion: number;
  modelContentHash: string;
  buildMode: BuildMode;
  placedOccurrenceIds: readonly string[];
  activeStepIndex: number;
  lastPdfPage?: number;
  updatedAtIso: string;
}
```

## Invariants

- `occurrenceId` is unique within an import, including when the same submodel is repeated.
- `targetMatrix` is expressed in **a consistent reference frame** and a documented multiplication order; rendering must not silently invert the Y axis.
- All occurrences of a step exist in the model.
- An occurrence is not implicitly "a physical part" if it references a subassembly; expansion must be explicit.
- No `BuildStep` is invented when `steps` is absent; the engine may offer a separate manual flow, clearly named.
- Restoring a save applies only to the exact model hash and a compatible schema version.
- Differentiate `analyzable`, `renderable`, and `playable` to avoid false successes.

## Snap plan

1. Compute the target transformation of the selected part.
2. Compare the transform of the manipulated part with the target, in **the same frame**.
3. Validate only if the distance and angular deviation meet the configured thresholds.
4. On success, replace the temporary transformation with the exact target transformation; mark only this occurrence as placed.
5. In guided mode, limit targets to the active step; in free mode, search only among unplaced occurrences compatible with the chosen reference/color, then pick the closest under the threshold, without duplicating the ID.
6. Display an explicit message when the part is far from the target location or incompatible with the step.

The numeric thresholds are to be **calibrated on a fixture** during P3; do not invent "physical" values.

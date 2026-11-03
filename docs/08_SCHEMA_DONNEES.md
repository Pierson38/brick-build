# 08 — Contrats de données proposés (à affiner pendant le spike)

Le code TypeScript ci-dessous est **indicatif**, pas une API déjà validée.

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
  occurrenceId: string;          // chemin stable dans la hiérarchie
  partRef: string;               // ex. "3001.dat"
  colorCode: string;
  targetMatrix: Matrix4Tuple;    // dans un repère global documenté
  sourcePath: string;            // MPD section + index de référence
  ancestorSubmodels: readonly string[];
  renderable: boolean;
}

interface BuildStep {
  id: string;
  index: number;
  occurrenceIds: readonly string[];
  provenance: StepProvenance;
  note?: string;                 // ne pas prétendre page PDF == index
}

interface ImportedModel {
  contentHash: string;          // SHA-256 ou équivalent fort
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

- `occurrenceId` unique dans un import, y compris lorsque le même sous-modèle est répété.
- `targetMatrix` exprimée dans **un référentiel cohérent** et un ordre de multiplication documenté ; le rendu ne peut pas silencieusement inverser l'axe Y.
- Toutes les occurrences d'une étape existent dans le modèle.
- Une occurrence n'est pas implicitement « une pièce physique » si elle référence un sous-assemblage ; l'expansion doit être explicite.
- Aucun `BuildStep` inventé quand `steps` est absent ; le moteur peut offrir un parcours manuel séparé, nommé clairement.
- La restauration d'une sauvegarde s'applique seulement au hash exact du modèle et à une version de schéma compatible.
- Différencier `analyzable`, `renderable` et `playable` afin d'éviter les faux succès.

## Plan du snap

1. Calculer la transformation cible de la pièce sélectionnée.
2. Comparer transform de la pièce manipulée à la cible, dans **le même repère**.
3. Valider uniquement si la distance et l'écart angulaire respectent les seuils configurés.
4. En cas de réussite, remplacer la transformation temporaire par la transformation cible exacte ; marquer uniquement cette occurrence posée.
5. En mode guidé, limiter les cibles à l'étape active ; en mode libre, chercher uniquement parmi les occurrences non posées compatibles avec la référence/couleur choisie, puis choisir la plus proche sous seuil, sans doublonner l'ID.
6. Afficher un message explicite lorsque la pièce est loin de l'emplacement cible ou incompatible avec l'étape.

Les seuils numériques sont à **calibrer sur fixture** lors du P3 ; ne pas inventer de valeurs « physiques ».

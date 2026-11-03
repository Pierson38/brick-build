# 02 — Architecture proposée

## Choix techniques

- **UI** : Next.js (App Router) + React + TypeScript strict ; composants client pour WebGL/PDF.
- **3D** : Three.js + `@react-three/fiber`; `@react-three/drei` pour caméra/contrôles si pertinent.
- **Lecture géométrique** : `LDrawLoader` officiel (`three/addons/loaders/LDrawLoader.js`), **à vérifier par spike** pour les occurrences individuelles. Il peut créer une scène agrégée : ne pas assimiler les meshes à une ligne type 1.
- **Parser structurel** : code TS maison isolé et testable, sans Three.js ; lecture des lignes type 1, MPD, STEP, sous-modèles, couleur héritée.
- **PDF** : PDF.js (`pdfjs-dist`) en client-only, worker correctement configuré selon la version réellement installée ; pas de requête au serveur LEGO.
- **État** : Zustand ou React state léger ; ne pas imposer Redux.
- **Persistance** : IndexedDB si nécessaire pour données structurées volumineuses, ou localStorage pour petit état de progression, avec version de schéma, hash du fichier et contrôles de taille.
- **Tests** : Vitest (parseur et règles de progression), Playwright (parcours import et jeu), tests visuels manuels ciblés.

## Domaines

1. `model-import`: File API, validation, sélection du modèle racine, diagnostics.
2. `ldraw-parser`: représentation sémantique des occurrences (ne rend rien).
3. `geometry-catalog`: pièces LDraw et géométries ; gestion des références manquantes.
4. `build-plan`: étapes jouables ou absence d'étapes, ordre conservé, sous-assemblages.
5. `build-engine`: choix de pièce, état de pose, snap / tolérances, undo, complétion ; deux stratégies distinctes `guided` (étape active) et `freeManual` (toutes les cibles restantes compatibles).
6. `viewer-3d`: scène, caméra, ghost piece, interactions.
7. `pdf-viewer`: aperçu local, pages, zoom, mémoire de page.
8. `persistence`: sérialisation, migration, hash, reprise.

## Flux de données

```text
Utilisateur importe un fichier .mpd/.ldr
  → validation et hash
  → parser structurel : MPD, type-1, STEP, hiérarchie
  → résolution des références vers la bibliothèque de pièces locale
  → diagnostic de complétude + préparation des étapes
  → renderer 3D + moteur de jeu

Utilisateur importe PDF
  → validation PDF locale
  → PDF.js, panneau notice
  → navigation pages indépendante

Moteur de jeu
  → liste des occurrences posées + progression
  → stockage local lié au hash du modèle
```

## Proposition d'arborescence de l'application

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

Ceci est une proposition ; adapter aux conventions existantes. Éviter les dépendances serveurs inutiles.

## Note essentielle sur le rendu

Les groupes renvoyés par `LDrawLoader` ne garantissent pas automatiquement une correspondance 1 groupe = 1 brique. Pour rendre les briques manipulables séparément, faire **un spike expérimental** : identifier les capacités du loader moderne ou assembler les géométries par occurrence à partir du parser. Les étapes sont fournies par le parser, jamais déduites naïvement du nombre de meshes.

Le modèle d'occurrences est la source de vérité pour le gameplay ; Three.js ne sert qu'à l'affichage et à l'interaction.

## Performance et sûreté

- Commencer avec 4 pièces, puis 50, puis 300 ; mesurer temps d'import, premier rendu, FPS, mémoire.
- Réutiliser les géométries des références identiques ; `InstancedMesh` si le mode sélection/ghosting le permet, sinon simplifier pour la V1.
- Borner les tailles d'uploads, le nombre de sections, le nombre de pièces, la profondeur de sous-modèles, et le travail sur thread principal.
- Ne pas construire une API distante ou exposer le serveur sur `0.0.0.0` par défaut.

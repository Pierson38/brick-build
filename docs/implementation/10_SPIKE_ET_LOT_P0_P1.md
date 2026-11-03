# 10 — Note technique : spike LDraw et premier lot (P0 → P4 minimal)

**Date :** 03/11/2026 — branche `feat/p0-p1-ldraw-parser-viewer`, base `origin/main` = `b019989`.

## Environnement vérifié

| Élément | Version |
|---|---|
| macOS | 26.6.2 (arm64) |
| Node / npm | 24.5.0 / 11.5.1 |
| Git | 2.50.1 |
| next | 16.4.5 (Turbopack) |
| react / react-dom | 19.3.1 |
| three / @types/three | 0.187.0 |
| @react-three/fiber / drei | 9.8.2 / 10.7.9 |
| pdfjs-dist | 6.5.438 |
| typescript | 6.0.3 (pas 7.0 : voir décisions) |
| vitest / @playwright/test | 5.1.0 / 1.64.1 |

Bibliothèque LDraw : `complete.zip` officiel (library.ldraw.org, CC BY 4.0), 24 987 fichiers dans `parts/`, installée **hors dépôt** dans `~/Documents/brick-lab-data/ldraw`.

## Ce que `LDrawLoader` (three 0.187.0) fait réellement

Vérifié en lisant le code source et en l'exécutant dans Node sur les fixtures (`scratchpad`, avec une pièce factice embarquée) :

1. **Hiérarchie** : chaque ligne type 1 qui n'est pas une primitive devient un `Group` enfant (`name` = nom de fichier, `userData.colorCode`, `userData.startingBuildingStep`). Une brique = un groupe : les occurrences restent séparables.
2. **Aucune provenance** : ni numéro de ligne ni index de référence. Seul l'ordre des enfants relie un groupe à sa ligne.
3. **Une pièce manquante fait échouer TOUT le modèle** (`Subobject "9999.dat" could not be loaded`, rejet global). C'est bloquant pour des imports réels.
4. **`buildingStep`** : compteur global incrémenté en parcours profondeur de tout l'arbre. Pour `nested-submodel.mpd` on obtient 0,1,2,3 en mêlant les étapes de la racine et des sous-modèles : c'est une interprétation implicite, non documentée.
5. MPD : la première section `0 FILE` est le modèle principal ; `0 NOFILE` n'est pas interprété ; un type de ligne inconnu lève une exception.
6. Il faut appeler `setConditionalLineMaterial(LDrawConditionalLineMaterial)`, sinon erreur.
7. Les pièces sont cherchées par essais successifs (`parts/`, `p/`, `models/`, tel quel, relatif, puis en minuscules) : cela produit des 404 normaux pour les primitives.

**Décision** : le parser maison est la source de vérité (occurrences, transformations, étapes). `LDrawLoader` ne charge que la géométrie, **une paire pièce + couleur à la fois**. Le résultat est mis en cache puis cloné (géométrie partagée, vérifiée) et placé avec la matrice du parser. Une pièce absente n'invalide que ses occurrences.

## Parser structurel (`src/domain/ldraw`)

- Sections `0 FILE` / `0 NOFILE` / `0 !DATA` (ignorées), `.ldr` seul = une section.
- Lignes type 1 : couleur, 12 nombres, nom de fichier avec espaces. Sont refusés : `../`, chemins absolus, lecteurs Windows, NaN/Infinity, couleurs invalides.
- `0 STEP` et `0 ROTSTEP` **terminent** une étape. Aucune étape vide n'est créée. Les pièces après le dernier STEP forment la dernière étape.
- Matrices **column-major** (ordre `THREE.Matrix4.elements`), repère LDraw (-Y vers le haut), `M_global = M_parent * M_local`. Le retournement d'axe n'est fait qu'une seule fois, à l'affichage.
- Couleur 16 = couleur héritée de la référence parente.
- IDs déterministes par occurrence : `racine#index/sous-modele#index`.
- Garde-fous : taille, lignes, sections, occurrences (20 000 : stoppe aussi l'explosion de sous-modèles répétés), profondeur (16), cycles, sections dupliquées (comparaison sans casse), sous-modèle absent, sections non référencées signalées comme modèles alternatifs.

## Étapes (`src/domain/build/build-plan.ts`)

- `NO_STEPS` si aucun STEP, ou si une seule étape exploitable (cas d'un unique STEP final). Aucune étape n'est inventée.
- `ROOT_STEPS` si le modèle n'a pas de sous-modèle.
- `FLATTENED_STEPS` dès qu'il y a des sous-modèles. Stratégie documentée : dans chaque étape, chaque sous-modèle référencé est d'abord construit selon ses propres étapes (récursivement), puis les pièces posées directement dans l'étape forment une étape. Cette stratégie **n'est pas** équivalente à la notice LEGO, et l'UI le dit.

## Moteur de construction (`src/domain/build/engine.ts`)

- **Mode guidé** : seules les occurrences non posées de l'étape active sont proposées.
- **Montage libre** : toutes les occurrences non posées sont proposées.
- Snap : on cherche la cible compatible (même référence et même couleur) la plus proche, sous les seuils de **10 LDU** et **10°**. Ces seuils initiaux sont calibrés sur la brique 2×4 ; ce ne sont pas des valeurs physiques. Un dépôt à égale distance de deux cibles est refusé (ambigu).
- Une occurrence posée ne peut pas l'être une seconde fois. Fonctions disponibles : annuler la dernière pose, réinitialiser l'étape, détecter la fin.
- Progression : `localStorage`, liée au SHA-256 exact du fichier, validée au chargement (schéma, hash, IDs connus, doublons).

## Interaction 3D (choix MVP)

- La pièce tenue suit la souris sur un plan horizontal, avec une grille de 10 LDU.
- Le niveau est choisi automatiquement : c'est le plus bas qui contient encore une cible compatible (placement assisté). PageUp/PageDown change de niveau, R tourne de 90° autour de Y.
- Le clic valide la pose ; un glisser fait tourner la caméra.
- Le bouton « Poser à la position cible (aide) » sert au debug et à l'accessibilité.
- Limites : pas de physique d'emboîtement, pas de rotation hors axe Y, pas de détection des symétries (une brique 2×4 tournée de 180° est refusée).

## Mesures (Chrome, panneau navigateur Claude, Mac arm64, serveur dev)

| Modèle | Pièces | Paires pièce/couleur | Chargement géométrie | FPS au repos | Tas JS |
|---|---|---|---|---|---|
| mini-4-pieces | 4 | 4 | ~0,2–0,9 s (cache froid/chaud) | — | — |
| synthétique 300 | 300 | 24 (6 réf.) | 330 ms (dont 87 requêtes locales) | 120 | 36 Mo |

Ce sont des mesures indicatives sur des modèles synthétiques. Un vrai MPD OMR n'a pas encore été testé.

## Commandes reproductibles

```bash
npm ci
npx playwright install chromium   # une fois
npm run check:ldraw               # vérifie LDRAW_LIBRARY_DIR
npm run dev                       # http://127.0.0.1:3000
npm run recette                   # typecheck + Vitest + Playwright
```

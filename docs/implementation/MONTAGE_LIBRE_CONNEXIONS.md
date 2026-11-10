# Montage libre — connexions, transformations, aimantation (note d'architecture)

> **Mise à jour 08/11/2026** : axes et trous d'axe Technic reconnus, réceptacles garantis par un tenon ou un tube, aimant « près d'abord » stable, un seul index des connecteurs (bug de la pièce prise dans le bac) — voir [CONNEXIONS_FIABILISEES.md](CONNEXIONS_FIABILISEES.md). Ce qui suit décrit l'état du 07/11/2026.

**Date :** 07/11/2026. Branche `feat/true-free-building` (PR #7). Demande du propriétaire après sa recette sur 31039 : rotations sur 3 axes, manipulation directe, sélection d'un assemblage connecté, aimantation entre pièces. Les deux captures annoncées n'ont pas été reçues ; analyse faite sur sa construction réelle 31039 (lue sans modification).

## 1. Ce que la bibliothèque LDraw permet de savoir — et ce qu'elle ne dit pas

La bibliothèque LDraw décrit la **géométrie** des pièces (faces, arêtes, sous-fichiers). Elle **ne décrit pas les connexions** : aucune métadonnée officielle ne dit « ici un tenon, là un réceptacle, là un trou d'axe ». Ce que l'on peut en déduire de façon démontrable vient des **primitives** standard que les fichiers de pièces référencent, avec leur transformation :

| Primitive (titre officiel) | Interprétation | Fiabilité |
|---|---|---|
| `stud.dat` « Stud », `stud2.dat` « Stud Open », variantes à logo, tenons tronqués (`stud10/13/15/17/26`, `stud6`) | **tenon** : centre de la base + axe (direction du tenon), en coordonnées de la pièce | sûre |
| `stud4*.dat` « Stud Tube Open » (pièces de 2 de large) | tube **entre quatre réceptacles** ; donne le plan du dessous | sûre pour briques, plaques, tuiles |
| `stud3*.dat` « Stud Tube Solid » (pièces de 1 de large) | tube **entre deux réceptacles**, dans la longueur | sûre pour pièces 1 × N |
| aucun tube, tenons dessus (1 × 1) | réceptacle sous le tenon, sur la face la plus basse | sûre pour 1 × 1 |
| aucun tube ni tenon, titre standard « Tile W x L » | grille de réceptacles sous la tuile | sûre pour les tuiles rectangulaires |
| `connect*.dat`, `confric*.dat` « Technic Pin … » | **demi-goupille** Technic : segment de 20 LDU | sûre |
| `peghole.dat` « Peg Hole End » (×2, colinéaires, 10 à 40 LDU) | **trou de goupille** Technic entre les deux extrémités | sûre quand les deux extrémités existent |
| `axle.dat`, `axleend*`, `axlehol*` | axe **ou** trou d'axe — les mêmes primitives dessinent l'axe mâle (32062 : `axlehol8` « Axle Perimeter ») et le trou d'axe | **non reconnue** (signalée) |
| clips, barres, charnières, rotules, roues, Duplo, Scala, faces inclinées sans tube, pare-brise… | pas de primitive de connexion exploitable | **non reconnue** |

Les **réceptacles** (où un tenon entre) n'ont **aucune primitive** : ils sont **déduits** — points de la grille de 20 LDU (alignée sur les tenons ou sur les tubes) dans le contour de la face du dessous (plan de base des tubes, tolérance 1,6 LDU pour les rebords en retrait). C'est une hypothèse documentée, vérifiée pièce par pièce (§ 5), pas une lecture.

**Couverture mesurée** (scan de toutes les références des fichiers, 213 ms pour 31039) : 31039 — 133 pièces réelles distinctes, 117 avec au moins un connecteur, 107 avec tenons/réceptacles, 15 avec axes non reconnus, 16 sans aucun connecteur (axes, axes-goupilles, bagues, charnières, clips, roues, pneus, « cheese slopes », pente courbe, pare-brise) ; 31009 — 65 pièces, 52 avec tenons/réceptacles ; 31040 — 31 pièces, 21.

Conséquences assumées : pas de connexion **inventée**. Deux pièces qui se touchent ou se croisent sans paire de connecteurs compatible **ne sont pas connectées** ; une pièce non reconnue ne s'aimante pas (pose libre, grille et hauteur manuelle restent disponibles) et n'entre dans un assemblage que par sélection manuelle (Maj + clic).

## 2. Représentation

- `src/domain/ldraw/connectors.ts` (pur) : lecture récursive des fichiers d'une pièce (lecteur de fichiers injecté, chaque fichier lu une fois), connecteurs en coordonnées **de la pièce** : `stud`, `antistud` (position, axe), `pin`, `pinhole` (milieu, axe, demi-longueur). Cache **par référence LDraw** (`src/infra/ldraw/connector-catalog.ts`, mêmes fichiers que le rendu, servis par `/api/ldraw/`, déjà en cache HTTP).
- **Coordonnées du monde** : connecteur d'une pièce posée = `pose × connecteur` (même matrice que le rendu et la sauvegarde) ; les axes suivent les rotations X/Y/Z. Index spatial par cellules de 20 LDU, reconstruit quand la construction change.
- **Compatibilité** : tenon ↔ réceptacle (même point à 0,6 LDU, même axe) ; demi-goupille ↔ trou (axes parallèles, colinéaires à 0,6 LDU, recouvrement ≥ 8 LDU).

## 3. Transformations et rotations

- Une pose reste une matrice rigide LDraw (rotation 3 × 3 + translation), comme dans le format v3 (12 nombres d'une ligne de type 1). **Aucun changement de schéma.**
- Rotations de ±90° autour des axes **X, Y, Z** (LDraw : Y vertical) composées par produit de matrices ; les coefficients sont ramenés exactement à −1 / 0 / 1 quand ils en sont à 10⁻⁹ près : aucune dérive, même après des centaines de rotations. Les orientations ne sont plus limitées à celles du modèle (O reste disponible).
- Groupes : une rotation du repère du groupe, appliquée à chaque pièce (`repère × pose relative`) ; distances et orientations relatives exactes ; le groupe repose ensuite sur la surface par son point le plus bas recalculé.
- Réorienter des pièces posées : la sélection tourne sur place (même point le plus bas), en une action.

## 4. Aimantation et assemblages

- **Aimant entre pièces** (pendant une manipulation explicite seulement) : pour chaque connecteur de la pièce (ou du groupe) en main et chaque connecteur compatible d'une pièce posée à moins de 24 LDU, translation candidate qui les fait coïncider (la rotation reste celle choisie par le joueur : il faut des axes déjà alignés). Score déterministe : nombre de paires emboîtées (plus = mieux), puis distance à la position visée, puis ordre des translations. **Propositions impossibles écartées à partir des connecteurs** (règles sûres) : un tenon qui tient déjà un réceptacle n'en reçoit pas un second ; deux tenons (ou deux réceptacles) au même point et de même axe = deux pièces au même endroit. Une première version écartait aussi les propositions dont la **boîte englobante** traversait une autre pièce : abandonnée, car la boîte d'une pièce à excroissances est fausse (la 30157 du propriétaire, avec ses supports de roues, « traversait » la plaque blanche sans la toucher) — pas de détection de collision approximative. En hauteur manuelle, seules les propositions à cette hauteur. Aperçu à la position proposée + repères des connecteurs emboîtés + texte « Aimant : N tenons sur … ». Désactivable (case), contournable en maintenant ⌥ (Option) pendant le déplacement.
- **Assemblage connecté** : graphe des pièces posées dont deux connecteurs compatibles coïncident ; « Sélectionner l'assemblage » (et double-clic) prend la composante connexe de la pièce choisie, déplacée ensuite comme un groupe rigide (existant), en une action. **Maj + double-clic** (10/11/2026) ajoute la composante d'une autre pièce à la sélection au lieu de la remplacer : plusieurs assemblages se déplacent ou tournent ensemble. Le premier Maj + clic du double-clic a basculé la pièce, l'union (`addToSelection`) la remet ; un assemblage déjà sélectionné n'est jamais retiré.
- L'aimant vers le **modèle officiel** reste disponible (case séparée « Aimant modèle ») : quand il trouve la place officielle de la pièce (à ≤ 9,5 LDU), elle est gardée ; partout ailleurs, l'aimant entre pièces s'applique. Décocher « Aimant modèle » donne toute la main à l'aimant entre pièces. (Trouvé par la validation P5 sur 31040 : l'aimant entre pièces déplaçait une pièce de sa place officielle vers un emboîtement voisin.)

## 5. Impacts

| Fichier | Changement |
|---|---|
| `connectors.ts` (nouveau), `connector-catalog.ts` (nouveau) | connecteurs, cache par référence |
| `free.ts` | rotations X/Y/Z exactes, rotation de groupe 3D, graphe et composantes connexes, propositions d'aimantation |
| `surface.ts`, `engine.ts` | inchangés (règles guidé / synchronisé) |
| `BrickLabApp.tsx` | commandes X/Y/Z ±90°, indicateur d'orientation, manipulation directe (glisser), assemblage, aimant entre pièces |
| `BuildCanvas.tsx` | glisser une pièce posée (seuil de 4 px, caméra suspendue pendant le glisser, reprise sinon), double-clic, repères de l'aimant, axes de rotation |
| Sauvegardes v1/v2/v3 | inchangées ; ouvrir une partie ne réaligne rien ; l'aimant n'agit que sur une manipulation explicite |
| Stock, annulation | inchangés : un déplacement ou une rotation de pièces posées est une seule action (`moveGroup`, tout ou rien) |

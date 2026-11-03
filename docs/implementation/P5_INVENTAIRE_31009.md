# Inventaire de 31009-1 Small Cottage : fichier OMR contre inventaire officiel

**Sources (hors dépôt)** : fichier OMR `31009-1.mpd` (SHA-256 `97b83517…333d`) ; inventaire officiel en dernières pages du livret 1 de la notice LEGO (6038244.pdf, p. 79–80).
**Méthode** : extraction du texte PDF (quantité « Nx » + numéro d'élément LEGO) ; décodage des anciens numéros d'élément à 6 chiffres sous la forme *numéro de pièce + code couleur LEGO* ; conversion couleur LEGO → LDraw par les commentaires `LEGOID` de `LDConfig.ldr`. Les numéros à 7 chiffres ne sont pas décodables hors ligne : leur identification est **visuelle** (vignettes de l'inventaire rendues à 300 %), donc moins sûre.

## Totaux

| | Inventaire officiel (boîte) | Fichier OMR |
|---|---|---|
| Pièces | 271 | 270 occurrences |
| Lignes | 90 éléments | 92 paires pièce/couleur |
| Classement côté fichier | — | 258 pièces de construction, 10 pièces de minifig, 2 sous-assemblages (`2429c01` charnières ×2) |

## 1. Correspondances vérifiables (numéro d'élément décodé)

33 éléments / 119 pièces décodés :
- **31 identiques** au fichier (référence, couleur, quantité) ;
- **2 divergences prouvées** :

| Élément | Pièce | Couleur | Inventaire | Fichier | Écart |
|---|---|---|---|---|---|
| 302001 | 3020 Plaque 2×4 | blanc | 4 | 2 | **+2 dans la boîte** |
| 306901 | 3069 Tuile 1×2 | blanc | 6 | 4 (`3069b`) | **+2 dans la boîte** |

Contrôle : aucune de ces pièces n'apparaît ailleurs dans le fichier dans une autre couleur. Les `3020` vertes et les `3069b` gris foncé et bleu moyen correspondent à leurs propres lignes d'inventaire. Ce n'est donc **pas** une erreur de couleur du fichier.

## 2. Identification visuelle (numéros à 7 chiffres, 57 éléments / 152 pièces)

56 éléments ont un équivalent dans le fichier, avec la **même quantité** (hors minifig, voir plus bas) et une forme et une couleur cohérentes à l'œil (ex. 4199519 → `3958` plaque 6×6 bleue ×1 ; 4578094 → `3037` pente 2×4 bleu foncé ×10 ; 4211428 → `3622` brique 1×3 gris clair ×7 ; 4611777 → `91405` plaque 16×16 vert clair ×1). Ambiguïtés internes sans effet sur les totaux : 4578099 / 4568711 contre `3046` / `3038` (bleu foncé, 4 chacun), et 4211087 / 4611703 contre `88072` (gris foncé).

**Minifig** : la boîte compte 6 éléments (jambes assemblées 4107623, torse avec bras et mains 4275813, tête, cheveux, porte-barre 48729b, accessoire 4520952). Le fichier les représente en **10** occurrences : `3815c01`, `973`, `3818`, `3819`, `3820` ×2, `3626cp8k`, `62810`, `48729b`, `33078`. L'écart de 4 est une **différence de représentation**, pas une pièce manquante.

Contrôle arithmétique : 152 pièces d'inventaire non décodées contre 155 occurrences du fichier non appariées, soit 155 − 152 = 3 = +4 (minifig) − 1 (élément ci-dessous).

**Sans équivalent dans le fichier** : **1 élément**, 4211087 ×1, gris foncé (brique 1×2 avec élément latéral, identification visuelle approximative).

## 3. Bilan

| Poste | Pièces |
|---|---|
| Boîte | 271 |
| − éléments absents du fichier (2 × `3020` blanc, 2 × `3069` blanc, 1 × 4211087) | −5 |
| + décomposition de la minifig (10 occurrences pour 6 éléments) | +4 |
| **= fichier** | **270** ✓ |

L'écart de 270 contre 271 est donc **entièrement localisé** : 5 éléments de la boîte n'existent pas dans le fichier, dont 4 identifiés avec certitude et 1 visuellement. La différence de représentation de la minifig compense en partie.

## 4. Ce qui n'est PAS prouvé

31009 est un set 3-en-1 : l'inventaire décrit le **contenu de la boîte**, pas les pièces du seul modèle principal. Les 5 éléments absents peuvent être :
- (a) des pièces que le modèle principal n'utilise pas (réservées aux modèles alternatifs, ou pièces de rechange) : le fichier serait alors **complet** ;
- (b) des pièces du modèle principal oubliées par le fichier : il serait alors **incomplet**.

La somme des quantités annoncées dans les encadrés d'étape du livret 1 (modèle principal) vaut 267, contre 266 équivalents-éléments dans le fichier. Mais ces encadrés peuvent contenir des multiplicateurs de sous-ensembles (« 2x »), ce qui rend ce contrôle **non concluant**. Il faudrait vérifier visuellement les étapes du livret 1 qui utilisent des plaques 2×4 et des tuiles 1×2 blanches.

## Verdict

**INDÉTERMINÉ.** L'écart est localisé et chiffré, mais on ne peut pas prouver hors ligne si ces 5 éléments appartiennent au modèle principal. L'application affiche un **avertissement de compatibilité** pour ce fichier exact (registre local `src/domain/import/known-validations.ts`, indexé par SHA-256). Pour 31040 : **COHÉRENT** (65/65, 30/30, concordance exacte).

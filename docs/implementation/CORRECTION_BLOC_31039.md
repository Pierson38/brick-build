# Emboîtement du bloc beige à trou sur le 31039 — cause, correction, preuves

**Date :** 08/11/2026. Branche `fix/31039-block-snapping`, worktree `brick-build-worktrees/31039-block-snapping`, base `origin/main` = `a1309a4` (PR #9 fusionnée). Demande du propriétaire pendant sa construction réelle du 31039 : « un bloc beige avec un trou latéral et des éléments noirs sur le dessus ne s'emboîte pas correctement avec les pièces voisines, notamment une pièce grise ». La capture annoncée n'est pas parvenue (texte seul) : le bloc a été identifié dans **une copie** de sa progression (voir § 1), sans rien déduire de la capture.

Complète [CONNEXIONS_FIABILISEES.md](CONNEXIONS_FIABILISEES.md) (connecteurs, aimant, assemblages) ; ce qui change est décrit ici.

## 1. Identification sur la copie de la construction réelle

Copie isolée de `library/builds/b-mw5ag1wk-43084e0c/progress.json` (révision 745, 275 pièces libres, SHA-256 `a8302701…3f40` identique avant et après le travail) et du modèle `31039-1.mpd` ; l'historique des sauvegardes (`history/`) a été lu, rien n'a été écrit dans la bibliothèque.

| Rôle | Réf. LDraw | Titre LDraw | Couleur | Pièces du propriétaire | Interfaces lues |
|---|---|---|---|---|---|
| **Le bloc** | 6541 | Technic Brick 1 x 1 with Hole | 19 (beige) | f238 (100, −30,59, 120), f239 (40, −30,59, 120), demi-tour en Y | 1 tenon, 1 réceptacle, 1 trou de goupille selon Z |
| Éléments noirs au-dessus | 6536 ×3, 3706, 2780 ×2 | Technic Cross Block 1 x 2, Technic Axle 6, Technic Pin with Friction and Slots | 0 (noir) | f230–f232, f228, f236/f237 | trou d'axe, trou de goupille ; axe ; goupilles |
| **La pièce grise** au-dessus du bloc | 2639 | Plate 4 x 4 Corner | 72 (gris foncé) | f242 (10, −36,78, 110), f243 (130, −36,78, 110) | 12 tenons, 12 réceptacles |
| Sous le bloc | 3020 | Plate 2 x 4 | 71 | f161 (70, −6,59, 130) | tenons |

Comparaison de chaque pièce posée avec sa place officielle (le modèle du propriétaire est le modèle officiel translaté de (40 ; 17,41 ; −230)) : **26 pièces sont 1,81 LDU trop bas**, deux colonnes symétriques de 13 : pente inversée 4287 → plaques 3020 → plaques 3034 → plaques 3020, tuiles, 18677, 15068, 6558 → **plaque grise 2639**. Le bloc 6541, lui, est à la bonne hauteur (il est venu avec le mécanisme posé sur la 3020 f161, colonne saine). La plaque grise ne pouvait donc pas prendre à la fois sa colonne (1,81 LDU plus bas) et le tenon du bloc : elle a pris sa colonne et **traverse le dessus du bloc de 1,81 LDU**, sans connexion avec lui. C'est le défaut décrit.

Origine dans l'historique : sauvegarde r463 (19:26:53 UTC), les deux 4287 sont posées à y = −4,78 au lieu de −6,59, sur le bout de la pente courbe inversée **41763** (elle-même à 17,81 au lieu de 17,41) ; tout ce qui est posé ensuite dessus hérite du décalage.

## 2. Cause : deux lectures de primitives fausses dans `connectors.ts`

Fichiers LDraw réels (bibliothèque locale) :

- **41763** est un alias (`=`) de **42023** « Slope Brick Curved 6 x 1 Inverted ». Quatre tenons `stud.dat` à y = 0 ; les deux tenons creux du bout mince sont des `stud2a.dat` **étirés vers le bas** : `0 9.2 -70 … 3.3 …` et `0 1.412 -90 … 1.353 …`. Leur pointe est à y = −4 comme tous les tenons, leur base dessinée à 9,2 et 1,41 (le cylindre descend dans la matière). Son tube `stud3.dat` est mis à l'échelle −4,9 : il s'arrête à **23,6** alors que le bord inférieur de la pièce est à **24**.
- **4287** est un `~Moved to` vers **4287a** « Slope Brick 33 3 x 1 Inverted with Notch and Thick Front » : un `stud.dat` à y = 0 et deux `stud2a.dat` étirés (×4 à y = 12, ×1,5 à y = 2), pointes à −4.

Le moteur prenait **l'origine de la primitive** comme base du tenon et **le bout des tubes** comme plan des réceptacles. D'où : 41763 posée sur une plaque 0,4 LDU trop bas, et une pièce posée sur son tenon du bout 1,41 LDU dans la courbe : **0,4 + 1,41 = 1,81 LDU**, exactement l'écart mesuré.

Hypothèses de la demande, vérifiées une à une :

| Hypothèse | Verdict | Preuve |
|---|---|---|
| Connecteur manquant ou mal identifié | **Oui** : position du tenon (tenons étirés) et hauteur du réceptacle (tubes en retrait) | primitives ci-dessus, tests rouges |
| Mauvais calcul de translation | Conséquence de la précédente : la translation est juste pour des connecteurs faux | banc Node : même proposition depuis le bac et en reprise |
| Trou d'axe ou de goupille | Non : 6541 ↔ 2780 ↔ 6536 reliés par goupilles dans la sauvegarde réelle | graphe de la copie |
| Clip, barre, charnière non pris en charge | Non pour ce bloc (aucune de ces pièces dans la colonne) | inventaire § 1 |
| Mauvaise orientation des connecteurs | Non : axes −Y corrects, seules les hauteurs étaient fausses | idem |
| Mauvaise priorité entre propositions | Non : la proposition retenue était la plus proche et valide pour des connecteurs faux | banc Node |
| Décalage aperçu / pose enregistrée | **Oui, en plus** (≤ 1e-14 LDU) : l'aperçu ajoutait le déplacement de l'aimant sans arrondi, la sauvegarde arrondit au centième ; même chose pour le repère d'un réceptacle en main | E2E et recette (−30,590000000000003 montré, −30,59 enregistré) |
| Connexion visuellement plausible mais incompatible | Non : la plaque grise n'était pas « connectée » au bloc dans le graphe ; aucun faux succès affiché | graphe de la copie |

## 3. Correction (architecture et détecteur partagé inchangés)

`src/domain/ldraw/connectors.ts` :

1. **Tenon dessiné plus long qu'un tenon** (primitive de plus de 4 LDU) : le tenon se tient sur la face de la pièce **4 LDU sous sa pointe** (`studBases`). Seulement si la pièce **a une face dans ce plan**, autour du tenon et dans sa case de 20 × 20 (un sommet à plus de 6,5 et moins de 15,1 LDU de son axe), ou autour d'un autre tenon du même plan (2653, dessus dessiné en arêtes près de ses tenons du milieu). Un vrai tenon haut sur un poteau (2680a « Stanchion with Tall Studs ») n'a pas de face là : sa base dessinée est gardée.
2. **Tubes en retrait du bord inférieur** : les réceptacles, calculés comme avant (mêmes nombre et positions), sont placés **à la hauteur du bord** (`rimUnder`) seulement si ce bord est le point le plus bas de toute la pièce, à au plus 1 LDU sous le bout des tubes, autour de chaque tube, **sur la grille des plaques** (multiple de 8 LDU depuis l'origine) alors que le bout des tubes ne l'est pas. Ailleurs, rien ne change.

Arrondis (`connections.ts`, `BrickLabApp.tsx`) : le repère d'un réceptacle en main est arrondi comme tous les connecteurs ; l'aperçu après l'aimant est arrondi au centième, comme la sauvegarde (`poseToLDraw`) : **pose enregistrée = aperçu**, chiffre pour chiffre.

Aucune métadonnée par référence n'a été nécessaire : la géométrie est lue dans les fichiers réels.

**Portée sur toute la bibliothèque** (24 985 fichiers `parts/`, ancien code contre nouveau, banc hors dépôt) : tenons modifiés dans **67 pièces** (pentes et cales inversées, bases de véhicules, 2653…), réceptacles déplacés en hauteur seulement dans **69 pièces** (0,25 à 1 LDU : 41763/42023, charnières 30388/53914, pentes 45 doubles, bases de monorail…) ; **aucun** nombre de réceptacles changé, **aucune** goupille, axe ou trou touché.

## 4. Preuves

**Tests rouges puis verts** (sorties complètes dans le rapport de PR) :

| Test | Avant correction | Après |
|---|---|---|
| `tests/unit/connectors-real.test.ts` « sunk studs and tubes short of the rim » (bibliothèque réelle, fixture originale [`pente-inversee-bloc.ldr`](../../tests/fixtures/pente-inversee-bloc.ldr)) | **7 échecs** : tenons de 41763 à 9,2 / 1,41, de 4287 à 12 / 2 ; réceptacles à 23,6 ; 2653 ; chaîne 41763 → 4287 → 2639 → 6541 depuis le bac (3 décalages) ; ordre du propriétaire : la plaque ne prend qu'1 tenon | 16 / 16 |
| `tests/unit/connections.test.ts` repère d'un réceptacle en main | −14,400000000000002 | −14,4 |
| `tests/e2e/free-sunk-studs.spec.ts` (Chrome, ordre du propriétaire, tout depuis le bac) | 41763 à −23,6 ; 4287 à −38,4 au lieu de −48 ; aperçu ≠ pose (−38,400000000000006) ; la plaque grise : « **1 tenon emboîté sur 1 pièce** » | « **2 tenon(s) emboîté(s) sur 2 pièce(s)** » (la pente et le bloc), poses exactes, pose = aperçu, graphe : bloc ↔ plaque ↔ pente |

Captures, même angle : [avant](preuves/connexions/bloc-6541-plaque-avant.png) (un repère, 4287 enfoncée dans la courbe, la plaque traverse le bloc), [après](preuves/connexions/bloc-6541-plaque-apres.png) (deux repères).

**Recette sur une copie de la construction réelle** (`tests/recette/bloc-31039.spec.ts`, `playwright.recette-connexions.config.ts`, données figées hors dépôt, rien d'écrit dans la bibliothèque) :

| Étape | Avant correction | Après |
|---|---|---|
| Le bloc 6541 beige (f239 retiré de la copie, avec la colonne de 13 pièces décalées au-dessus) pris **dans le bac** et approché de sa place | proposition juste, mais aperçu −30,590000000000003 ≠ pose −30,59 | aperçu = pose = **(40 ; −30,59 ; 120)**, la pose du propriétaire ; 2 connexions : tenon sur la 3020 f161, **goupille f236 dans son trou** ; repères verts = proposition avant le clic ; aucune autre pièce déplacée ; reconnu dans le graphe |
| Une 4287 (colonne f157 retirée de la copie) prise dans le bac au-dessus de la 41763 f54 du propriétaire | **y = −4,78 : exactement la pose de la sauvegarde du propriétaire** (1,41 LDU dans la courbe) | y = −6,19 : à fleur du dessus de sa 41763 (elle-même 0,4 trop bas dans sa sauvegarde, non réalignée) |

Captures et journal : `brick-lab-data/proofs/connexions-bloc/` (set tiers : hors du dépôt).

**Rapport 31039** (`scripts/connections-report.ts`, modèle fini, 609 pièces) : connexions **1 855 → 1 865** (+10 tenons), pièces reprises à 3 LDU de leur place ramenées exactement **592 → 595** ; 27 assemblages, le plus grand 493 (inchangés). Temps (3 mesures chacun, machine chargée par la suite E2E) : lecture des connecteurs 63–82 ms avant, 62–125 ms après ; aimant P50 0,06 ms / P95 0,32–0,52 ms avant, 0,06 / 0,33–0,40 ms après : pas d'écart mesurable.

## 5. Ta construction existante

**Rien n'est réaligné.** Avec les connecteurs justes, les deux colonnes de 13 pièces décalées de 1,81 LDU **ne sont plus comptées comme emboîtées** sur la 41763 (elles ne le sont pas : 1,41 LDU de jeu) : « Assemblage » depuis l'une d'elles sélectionne ses 13 pièces, plus le reste du fuselage (le plus grand assemblage de la copie passe de 252 à 226 pièces). Pour réparer à la main, dans cet ordre : reprendre chaque 41763 (f54, f55) ; puis reprendre chaque colonne de 13 (« Assemblage » depuis sa 4287) et l'approcher du bout de la 41763. **Vérifié sur le moteur** (banc Node sur la copie, mêmes fonctions que l'atelier, pièces montrées 2 à 3 LDU à côté) : chaque 41763 est déplacée de −0,4 LDU (7 tenons sur la 3035 et la 4477) ; chaque colonne de −1,81 LDU (9 connexions, dont **le bloc beige** f239 / f238 et la 41763) ; ensuite le bloc est relié à sa plaque grise, la 4287 et la 2639 sont sur la grille officielle (−6,59 et −38,59). **Non joué dans le navigateur** : cliquer la 41763 cachée sous d'autres pièces n'a pas été automatisé.

## 6. Limites

- Un tenon étiré **sans face visible** dans le plan de son siège (dessus dessiné seulement en arêtes, sans autre tenon vérifié dans ce plan) garde sa base dessinée : pas de déduction sans géométrie.
- Le bord d'une pièce hors de la grille des plaques (pièces arrondies, figurines, chapeaux) n'est jamais pris pour plan des réceptacles.
- Observé en passant dans la même copie, **non traité ici** : la plaque jumper 15573 beige du cockpit (f276) n'a toujours aucun réceptacle reconnu (sans tube, cf. CONNEXIONS_FIABILISEES § 3) ; elle est posée 1 LDU à côté de sa place et la tuile à clip 15712 grise (f277) n'a pas pu s'y emboîter.
- Safari : couvert par les tests WebKit existants de la suite E2E ; la recette sur la construction réelle et le nouveau test E2E tournent sous Chrome.

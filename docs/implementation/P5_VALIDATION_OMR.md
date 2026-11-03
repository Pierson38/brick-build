# P5 — Validation sur de vrais sets LDraw OMR

**Date :** 03/11/2026 — branche `feat/p5-omr-validation`, base `origin/main` = `b21a520`.
**Machine :** Mac Apple M2 Pro (12 cœurs, 16 Go), macOS 26.6.2, Node 24.5.0, Chromium 156.

> Les fichiers OMR, les notices LEGO et les captures qui les montrent restent **hors dépôt**, dans `~/Documents/brick-lab-data/` (`models/`, `instructions/`, `proofs/p5/`). Le dépôt ne contient que le code, les tests et ce rapport : des chiffres agrégés, sans données de modèle ni extrait de notice.

## 1. Sources

| Set | Fichier OMR (modèle principal) | SHA-256 (préfixe) | Licence lue dans le fichier | Auteur | Notice officielle (lego.com, téléchargée à la demande du propriétaire) |
|---|---|---|---|---|---|
| 31040-1 Desert Racers (Les bolides du désert), 2015 | `library.ldraw.org/media/omr_models/503/31040-1.mpd` | `2036218e4555` | CCAL 2.0 (CC BY 2.0) | Philippe Hurbain [Philo] | 6145903.pdf, 32 p., 3 modèles (3-en-1) |
| 31009-1 Small Cottage (La petite maison), 2013 | `library.ldraw.org/media/omr_models/1437/31009-1.mpd` | `97b83517b0e8` | CCAL 2.0 (CC BY 2.0) | Stefan Frenz [smf] | 6038244 / 6038252 / 6038254.pdf, 84 + 64 + 64 p. |

Sélection : 8 candidats Creator dont la fiche OMR indiquait « Missing Parts: No » ont été mesurés avec `npm run compat-report`. 31049 et 31037 ont été écartés (matrices non rigides de pièces flexibles, plus de 120 paires de cibles ambiguës). 31040 a été retenu comme set **simple** : il contient une pièce non officielle embarquée et des rotations non axiales. 31009 a été retenu comme set **moyen** : 270 pièces, 12 sous-modèles, 77 étapes, une minifig.

## 2. Méthode (reproductible)

```bash
npm run compat-report -- ~/Documents/brick-lab-data/models/31040-1/31040-1.mpd   # analyse hors ligne
npx playwright test tests/e2e/omr-validation.spec.ts                               # construction réelle (dev, GPU)
npm run perf                                                                       # build de production, 3 passages, médiane
```

- **Mesurer avant de corriger** : le rapport `compat-report` de chaque modèle a été produit avec le code de `main`, avant toute correction, puis après les corrections.
- **Joueur scripté sans aide** : `tests/e2e/omr-validation.spec.ts` construit le modèle uniquement au clavier et à la souris, comme un joueur. Pour chaque pièce : clic dans la barre, niveau (PageUp/PageDown), orientation (O), quart de tour (R), survol puis **clic pointeur** à l'emplacement visé. Le bouton « Poser à la position cible (aide) » n'est **jamais** utilisé.
- **Symétries** : une pose sur deux est faite volontairement dans une orientation *équivalente* mais *différente* de la matrice cible (pièce tournée de 180° ou 90° quand sa géométrie réelle le permet), pour prouver que le moteur l'accepte.

## 3. Incompatibilités mesurées avant correction (code de `main`)

| # | Mesure | 31040 | 31009 | Effet |
|---|---|---|---|---|
| I1 | Pièce non officielle embarquée (`0 !LDRAW_ORG Unofficial_Part`) expansée comme un sous-modèle | 89 occurrences dont **28 fausses** (primitives) ; 148 « sous-modèles » | — | Comptage faux, pièces impossibles à poser |
| I2 | Cibles dont l'orientation n'est pas un quart de tour autour de Y | 24/65 | 13/270 | Impossibles à poser à la souris (R seul) |
| I3 | Pièces symétriques refusées dans une orientation équivalente | 44 occurrences concernées | 182 occurrences concernées | Refus injustifié |
| I4 | Clic décalé de 18–28 LDU (taille de canevas périmée lors du redimensionnement de la barre de pièces) | 4/69 clics | idem | Refus aléatoires |
| I5 | Cibles à plus de 5 LDU de la grille de déplacement de 10 LDU, souvent sur une frontière | 0 | 6 | Pose impossible (ex. pièce 57895 à z = −55) |
| I8 | (introduit puis corrigé pendant P5) Le dépôt lisait l'aperçu via un état React en retard d'un rendu | — | — | Détecté par les 6 E2E de P0/P1 ; corrigé avec une référence synchrone |
| I6 | Pièces `~Moved to` / alias | 1 (3023) | 3 | Rendu OK via le fichier relais ; identité de référence à surveiller |
| I7 | Requêtes de bibliothèque en 404 (recherche par essais de LDrawLoader) | 167/332 | 288/560 | Lenteur, pas d'erreur |

## 4. Corrections (périmètre P5 uniquement)

| # | Correction | Fichiers |
|---|---|---|
| I1 | Une section `Part/Subpart/Primitive/Shortcut`, ou une section `.dat` avec géométrie, devient une **pièce feuille**. Son texte est transmis à LDrawLoader (noms `s\` normalisés). | `parser.ts`, `expand.ts`, `analyze.ts`, `part-catalog.ts` |
| I2 | Touche **O** : on parcourt les orientations **présentes dans le modèle** pour cette pièce et cette couleur (dédoublonnées modulo R et symétries). R s'applique par-dessus. | `engine.ts` (`orientationChoices`, `heldPose`), `BrickLabApp.tsx` |
| I3 | Symétries **mesurées sur la géométrie chargée** (`yQuarterTurnSymmetries`). Le snap accepte toute cible équivalente. | `symmetry.ts`, `engine.ts`, `part-catalog.ts` |
| I4 | Barre de pièces à hauteur fixe ; le dépôt se fait à la position **affichée** par l'aperçu. | `globals.css`, `BuildCanvas.tsx` |
| I5 | Grille de déplacement passée à **5 LDU** (écart max mesuré sur 5 sets : 3,4 LDU). | `engine.ts` (`MOVE_GRID_LDU`) |
| I8 | Dernière case survolée gardée dans une référence mise à jour à chaque `pointermove`. | `BuildCanvas.tsx` |
| I6, I7 | Non corrigés : mesurés et documentés (limites). | — |

## 5. Matrice de compatibilité

| Critère | 31040-1 Desert Racers | 31009-1 Small Cottage |
|---|---|---|
| Occurrences du fichier | **65** | **270** |
| Comparaison avec l'inventaire officiel (dernière page de la notice) | **65 pièces / 30 éléments** = 65 occurrences / 30 paires pièce-couleur : **concordance exacte** | 271 pièces / 90 éléments contre 270 occurrences / 92 paires. **Écart non résolu** : LDraw décompose la minifig (10 occurrences pour environ 6 éléments LEGO). Hors minifig, il manquerait environ 5 pièces (pièces de rechange ou omission du fichier ?). Une table élément LEGO → pièce LDraw serait nécessaire et n'est pas disponible hors ligne. |
| Références manquantes / remplacées | 0 manquante ; 1 `~Moved to` (3023 → 3023b) ; 1 non officielle embarquée (pneu 92409) **rendue** | 0 manquante ; 3 alias (`3023`, `2429c01`, `88422`) rendus |
| Couleurs | 11 | 18 |
| Sous-modèles | 0 (+ 1 pièce embarquée et son sous-fichier) | 12 instances (Seat, Window ×n, Big Window, Roof, Skateboard, MiniFig1) |
| Matrices non rigides | 0 | 0 |
| Orientations hors quart de tour Y | 24 (23 axiales, 1 quelconque) → **atteintes avec O** | 13 (6 axiales, 7 quelconques) → **atteintes avec O** |
| Pièces symétriques (mesurées sur la géométrie) | 19 références, 44 occurrences | 182 occurrences |
| Étapes `0 STEP` | 11 étapes `ROOT_STEPS` (3–10 pièces) | 77 étapes `FLATTENED_STEPS` (1–10 pièces) issues de Small Cottage (45), Roof (24), Seat (2) ; racine sans STEP |
| Étapes comparées à la notice | **Différentes, preuve à l'appui** : le modèle principal correspond au modèle 1 de la notice (p. 2–12, **21 étapes**, comparaison visuelle de la p. 12 avec le rendu), mais le fichier n'en a que 11. Ordre global cohérent (roues en dernier), découpage différent. | **Concordance ponctuelle** : l'étape 5 de la notice (p. 8 : 1 + 3 + 2 pièces) correspond à l'étape 5/77 (2412b ×1, 3069b ×3, 3622 ×2). Équivalence globale **non prouvée** (minifig placée en dernier dans le fichier, découpage en sous-modèles). |
| Construction complète à la souris, mode guidé, sans aide | **OUI** : 65/65, 65 clics, **0 refus**, 19 poses en orientation équivalente acceptées, 25 changements d'orientation (O), étapes strictement croissantes 1→11, 81 s | **OUI** : 270/270, 270 clics, **0 refus**, 86 poses en orientation équivalente acceptées, 15 changements d'orientation (O), 7 changements de niveau, étapes strictement croissantes 1→77, 56 s |
| Mode libre + notice officielle ouverte, ordre quelconque | **OUI** : 65/65 en ordre inverse du fichier, notice ouverte page 5 et restée en page 5, 0 refus, 48 changements de niveau | **OUI** : 270/270 en ordre inverse du fichier, livret 1 ouvert page 5 et resté en page 5, 0 refus ; **1 194 appuis PageUp/PageDown** (45 niveaux) : ergonomie à améliorer |
| Reprise après rechargement | **OUI** : 12/65 restaurés, même étape, pose suivante OK | **OUI** : 12/270 restaurés, même étape, pose suivante OK |
| Performances (prod, GPU Metal, médiane de 3) | import → 1re image 1,08 s ; géométrie 0,31 s ; 60 FPS au repos / 60 FPS en rotation (plafond vsync) ; tas 28 Mo | import → 1re image 1,17 s ; géométrie 0,63 s ; 60 / 60 FPS ; tas 47 Mo |

## 6. Limites restantes

- **Étapes ≠ notice** : démontré sur 31040. L'interface le dit déjà (« ne correspondent pas forcément à la notice officielle »). Pour un guidage fidèle, il faudrait une correspondance manuelle étapes ↔ pages (P6, hors périmètre).
- **Orientation par la touche O** : elle ne propose que les orientations présentes dans le modèle pour cette pièce et cette couleur. C'est une aide comparable au niveau assisté : elle ne révèle pas *quelle* cible est visée, mais un vrai joueur n'oriente pas librement en 3D.
- **Inventaire de 31009** : environ 5 pièces d'écart non expliquées (voir matrice).
- **Alias `~Moved to`** : 3023 et 3023b seraient deux entrées distinctes de la barre si un modèle mélangeait les deux. Non rencontré sur ces sets.
- **404 de bibliothèque** : environ 50 % des requêtes (recherche par essais de LDrawLoader). Aucun impact fonctionnel ; une table de fichiers servie par la route locale les supprimerait.
- **Tests E2E en rendu logiciel** (config par défaut, SwiftShader) : construire 270 pièces prend plus de 15 minutes. La spec OMR utilise donc le GPU.
- Le sélecteur « Modèle principal » liste aussi les sous-modèles (31009) : c'est du bruit, mais ce n'est pas bloquant.
- **Navigation par niveaux** : en mode libre sur 31009 (45 niveaux), il faut de nombreux PageUp/PageDown. Une pose « sur la surface visée » serait plus naturelle (lot suivant).
- **Validation par joueur scripté** : la construction est pilotée par Playwright avec de vrais événements souris/clavier. Elle ne remplace pas une séance de recette humaine sur Mac (Chrome et Safari), pas encore faite.

## 7. Verdict (03/11/2026, avant levée des conditions)

**GO sous conditions.**

Ce qui est démontré de bout en bout, sur deux vrais sets OMR : import fidèle (31040 identique à l'inventaire officiel), rendu complet avec la vraie géométrie (pièce non officielle embarquée comprise), construction **complète** à la souris en mode guidé **et** en mode libre avec la notice officielle ouverte, sans aucun refus et sans l'aide « Poser à la position cible ». S'y ajoutent les rotations équivalentes et les symétries acceptées, l'orientation non axiale atteignable, la reprise après rechargement et 60 FPS en production. Aucune incompatibilité **structurelle** du moteur ou de l'import ne reste : les 6 incompatibilités mesurées ont été corrigées ou classées non bloquantes.

Conditions avant de déclarer un **GO** sans réserve :
1. **Fidélité de 31009** : expliquer l'écart d'environ 5 pièces avec l'inventaire officiel. Méthode : comparaison visuelle de l'inventaire (livret 1, p. 79–80) avec la liste pièce/couleur du rapport. Si le fichier OMR est incomplet, le signaler dans l'UI plutôt que de le présenter comme fidèle.
2. **Recette humaine** sur Mac (Chrome et Safari) d'au moins un des deux sets, sans le joueur scripté.
3. **Ergonomie des niveaux** en mode libre (pose sur la surface visée) : correction limitée, mais nécessaire pour qu'un humain termine 31009 en mode libre sans fatigue.

Hors conditions : les étapes LDraw **ne sont pas** celles de la notice (prouvé sur 31040 : 11 contre 21) ; l'application ne le prétend pas.


---

## 8. Levée des conditions (04/11/2026)

### 8.1 Ergonomie : placement assisté par les surfaces

**Principe** (`src/domain/build/surface.ts`). Le moteur et ses règles de validation (`tryPlace`) ne changent pas. Quand une pièce est tenue :
1. **Fantôme compatible survolé** (emplacements affichés) : la pièce s'y cale en position. L'orientation reste vérifiée.
2. **Surface pointée** (sol, ou dessus d'une pièce posée, par raycasting) : la pièce se pose **sur** cette surface, à l'endroit pointé. Sa hauteur vient de la **base réelle de sa géométrie** dans l'orientation courante, ajustée au niveau compatible le plus proche (±6 LDU, les sommets de tenons comptent).
3. **Rien de valable sous le pointeur** (pièce en porte-à-faux, fixée de côté, posée avant son support) : cible compatible **traversée par le rayon**, à 10 LDU au plus et non cachée derrière une surface visible.
4. Sinon, la pièce reste là où le pointeur la place, et le clic est refusé avec un message.

L'aperçu ne se cale sur une cible que si le moteur accepterait la pose (« emplacement trouvé, clic pour poser »). Jamais vers une cible éloignée, jamais une cible déjà posée. **PageUp/PageDown** restent en secours (mode manuel, à partir du niveau par défaut) et **A** revient au mode automatique. Clic ou tap avec un léger glissement (≤ 4 px) : pose ; au-delà : rotation de caméra (souris et trackpad).

**Mesure de navigation entre niveaux** (appuis PageUp/PageDown pour une construction complète au pointeur). L'ancien schéma est recalculé exactement par `scripts/level-baseline.ts` : il reproduit les mesures du 03/11, 1 194 et 48 en ordre inverse, 7 et 0 en guidé.

| Scénario | Ancien schéma | Surfaces (E2E réel) | Poses par pointage seul | Rotations de caméra |
|---|---|---|---|---|
| 31040 guidé | 0 | **0** | 65/65 | 6 |
| 31040 libre, ordre naturel | 11 | **0** | 65/65 | 6 |
| 31040 libre, ordre inverse | 48 | **0** | 65/65 | 10 |
| 31009 guidé | 7 | **2** | 269/270 | 21 |
| 31009 libre, ordre naturel | 246 | **2** | 269/270 | 21 |
| 31009 libre, ordre inverse (avec notice) | **1 194** | **0** | 270/270 | 4 |

0 refus de pose dans les 6 constructions complètes (1 005 poses au pointeur). Tests ajoutés : 15 unitaires (`surface.test.ts`, dont 1 sur le verdict d’inventaire) et 6 E2E sur fixtures (`surface-placement.spec.ts`). Le test « deux niveaux » vérifie qu'**aucune touche** n'est pressée pendant toute la construction.

**Honnêteté de la mesure** : le joueur scripté sait *où* pointer : les crochets de test lui donnent la position écran de la cible, comme des yeux. En revanche il ne pose rien lui-même : c'est la logique de surface de l'application qui choisit la hauteur et le clic réel qui pose. Cette mesure prouve que la mécanique fonctionne, **pas** qu'elle est agréable pour un humain. C'est l'objet de la recette humaine.

**Performances après changement** (build de production, GPU Metal, M2 Pro, médiane de 3, `npm run perf`) :
- 31040 : 1,16 s import → 1re image, 60/60 FPS, 28 Mo ;
- 31009 : 1,16 s, 60/60 FPS, 40 Mo.

Pas de régression par rapport au 03/11.

### 8.2 Fidélité d'inventaire de 31009

Analyse complète : [`P5_INVENTAIRE_31009.md`](P5_INVENTAIRE_31009.md). Bilan exact : 271 (boîte) − 5 éléments absents du fichier + 4 (décomposition de la minifig) = 270.
- Divergences **prouvées** : 2 plaques 2×4 blanches et 2 tuiles 1×2 blanches.
- Divergence **visuelle** : 1 élément gris foncé (4211087).

Leur appartenance au modèle principal d'un set 3-en-1 n'est pas prouvable hors ligne. **Verdict : INDÉTERMINÉ.** L'application affiche un avertissement pour ce fichier exact. 31040 : **COHÉRENT**. Tout autre fichier : « inventaire non comparé à la notice officielle ».

### 8.3 Recette humaine

Protocole : [`RECETTE_HUMAINE_P5.md`](RECETTE_HUMAINE_P5.md) (Chrome et Safari, set 31040, guidé puis libre avec la notice, hauteurs, R/O, annuler, rechargement, console). **Non réalisée à ce jour : condition ouverte.**

### 8.4 Problèmes résiduels

- Les emplacements masqués exigent de tourner la caméra (jusqu'à 21 rotations sur 31009) ; aucune aide automatique de caméra.
- Pour 1 pièce de 31009, ni la surface ni la visée ne suffisent : PageUp/PageDown restent nécessaires.
- L'orientation (`O`) reste un choix au clavier parmi les orientations du modèle.
- La performance du raycasting au survol n'a pas été chiffrée à part (les FPS sont mesurés au repos et en rotation de caméra).
- Inventaire 31009 indéterminé (voir 8.2).
- Étapes LDraw ≠ notice (31040 : 11 contre 21), inchangé.

### 8.5 Nouveau verdict

**GO sous conditions** : une seule condition reste ouverte.
- ✅ Ergonomie des niveaux : corrigée et mesurée (1 194 → 0 ; 246 → 2), sans régression du moteur.
- ✅ Inventaire de 31009 : écart localisé à la pièce près, verdict **indéterminé** documenté et **affiché** dans l'UI (traitement prévu quand l'écart n'est pas résoluble de façon fiable).
- ⏳ **Recette humaine Chrome + Safari** : à faire par le propriétaire ; seule condition avant un GO sans réserve.

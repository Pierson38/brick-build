# Connexions fiabilisées — aimant depuis le bac, axes Technic, assemblages cachés

**Date :** 08/11/2026. Branche `fix/free-building-connections`, worktree `brick-build-worktrees/free-building-connections`, base `origin/main` = `c55fbe4152792f8327d3bdcb1a70170162140efb` (PR #7 fusionnée). Demandes du propriétaire après sa construction réelle du 31039 : (1) une pièce prise dans le bac ne s'aimante pas toujours, alors qu'elle s'aimante une fois posée puis reprise ; (2) sélectionner d'un clic tout un mécanisme relié par une barre noire intérieure, pièces invisibles comprises. Les deux captures annoncées ne sont pas parvenues (texte seul) : voir § 6.

Complète [MONTAGE_LIBRE_CONNEXIONS.md](MONTAGE_LIBRE_CONNEXIONS.md) (lecture des primitives, représentation) ; ce qui change est décrit ici.

## 1. Diagnostic : bac ≠ reprise

**Reproduction.** Banc Node sur une copie de la construction 31039 (101 pièces) avec les vraies fonctions du moteur (`resolveFreeHover`, `proposeSnap`), même référence, couleur, orientation, rayon et point visé, scénario A (bac) contre B (posée puis reprise), 8 références (3021, 3710, 3022, 3020, 15068, 3004, 2420, 3023) : **résultats identiques**. Le moteur pur n'était pas en cause : matrices de pose, orientations (`orientationChoices()[0]` = pose de la pièce reprise), connecteurs extraits, connecteurs des pièces posées, `resolveFreeHover`, `proposeSnap` et priorité de l'aimant modèle sont les mêmes dans les deux parcours.

**Cause exacte** (`BrickLabApp.tsx`, avant correction) :

```ts
const snapTargets = useMemo(() => {
  if (!freeMode || !held) return null;            // main vide → null
  …
}, [freeMode, held?.moving, held?.group, placedPieces, peekConnectors, connectorsVersion]);
```

L'index des connecteurs des pièces posées dépendait de `held?.moving` et `held?.group`, **pas** de `held`. Main vide → `null`. Prendre une pièce **dans le bac** laisse `moving` et `group` à `undefined` : aucune dépendance ne change, React rend la valeur mémorisée `null`, l'aimant entre pièces ne s'exécute pas (`snapTargets &&` faux) — ni proposition, ni repère vert. **Reprendre** une pièce posée met `held.moving` : le mémo est recalculé, l'aimant fonctionne. D'où aussi le « pas toujours » : après une première pose depuis le bac, la pièce reste en main et la partie change (`placedPieces` change) → l'index est enfin calculé pour les pièces suivantes du même bac.

Le test D existant (`free-3d.spec.ts`) **reprenait** une pièce déjà posée : il ne pouvait pas voir le bug.

**Test rouge puis vert** : `tests/e2e/free-connections.spec.ts` « A/B » — échec avant correction (`snap()` = `null` depuis le bac, capture [avant-bac-apercu.png](preuves/connexions/avant-bac-apercu.png)), succès après ([apres-bac-apercu.png](preuves/connexions/apres-bac-apercu.png)). Même emboîtement des deux côtés : la plaque grise 30157 du propriétaire sur sa plaque orange 3023 et son support vert 99780 (poses relevées dans sa construction 31039).

## 2. Un seul détecteur, un seul parcours

- **Un index des connecteurs par état de la partie** (`connectorIndex`, recalculé quand la partie ou les connecteurs lus changent — jamais en fonction de la main). Les pièces en main (pièce reprise, groupe) sont **exclues à la requête** (`exclude`) : leur ancienne place ne compte ni comme cible ni comme connecteur occupé.
- **Même fonction pour tous les cas** (`domain/build/snap.ts` `snapHover`) : pièce du bac, pièce reprise, groupe. Elle donne la proposition de l'aimant entre pièces, les connexions **vérifiées à la pose exacte montrée** et, sans proposition, la raison.
- Le même index sert au graphe, à « Assemblage », au double-clic, aux crochets de test et au calcul des pièces engagées sur un axe (`connections.ts` : `joints()`, `connectionGraph`, `connectedAssembly`, `jointsBetween`). Aucun second détecteur.
- L'aperçu est recalculé quand la pièce est prise (effet sur `held`), quand la position ou l'orientation change (pointeur, R, X/Y/Z, hauteur), et quand les connecteurs deviennent disponibles (`connectorsVersion` → index → `updatePreview` → effet).
- **Repères verts = connexions validées par le moteur à la pose de l'aperçu** (`engaged.points`) ; la pose enregistrée au clic est `previewPose` (test « pose enregistrée = aperçu » en E2E, y compris sur la copie de 31039).

## 3. Connecteurs (`domain/ldraw/connectors.ts`)

| Interface | Lecture | Nouveau |
|---|---|---|
| Tenon | primitives `stud*` | inchangé |
| Réceptacle | déduit sous les pièces droites | **grille alignée sur les tenons** (sinon les tubes, sinon le contour d'une tuile) ; un point n'est gardé que s'il est **garanti** : tenon juste au-dessus, tube voisin, ou pièce 1 × N à contour net (canal unique). Plus de réceptacle « dans la boîte » : coins coupés (2450, 2420, 2639), ailes et cales n'en reçoivent plus là où il n'y a pas de matière. Jumper : celui de 3794b donne ses 2 réceptacles par son tube ; 15573 (sans tube) aucun plutôt qu'un faux. Tuile ronde 1 × 1 : le tenon entre dans son tube. |
| Goupille | `connect*`, `confric*` | **toute la famille** « Technic [Friction] Pin 1.0 / 0.5 / 2.0 / Middle » avec sa longueur (axe-goupilles 3749/43093, goupille longue 6558 : 3 segments) |
| Trou de goupille | 2 `peghole` colinéaires | inchangé (les trous de poutres `beamhole`, `connhole` contiennent des `peghole`) |
| **Axe** (mâle) | **paire d'extrémités** `axleend*` « Technic Axle End » se faisant face sur une même ligne (dessinées seulement au bout des vrais axes) ; `axleend20` = 20 LDU d'axe (axes-goupilles) | **nouveau** |
| **Trou d'axe** | `axlehole`, `axl2hole`, `axl3hole`, `axl4hole`, `axlehol4`, `axlehol5` « Technic Axle Hole … » (y 0…1 × échelle), segments colinéaires fusionnés | **nouveau** |
| Non reconnu, signalé | `axlehol8` « Axle Perimeter » et bords d'axe seuls (communs à l'axe et au trou), extrémité d'axe sans vis-à-vis (axes à butée), clips, barres, charnières, rotules, roues, pneus | `axleUnrecognised` = incertain |

**Depuis le 08/11/2026 ([CORRECTION_BLOC_31039.md](CORRECTION_BLOC_31039.md))** : un tenon dessiné plus long qu'un tenon (enfoncé dans la matière) se tient sur la face 4 LDU sous sa pointe ; quand les tubes s'arrêtent avant le bord inférieur, les réceptacles sont à la hauteur du bord.

**Vérifications sur la bibliothèque réelle** (tests `tests/unit/connectors-real.test.ts`, ignorés sans bibliothèque) : 77 pièces « Technic Axle… / Technic Bush… » scannées → **aucun axe mâle vu comme trou, aucune bague vue comme axe** ; 13 axes signalés incertains (axes à butée 87083, 24316, 15462, 55013, 8168 ; axe à tenon 6587 ; flexibles ; adaptateurs), aucun inventé.

**Métadonnées contrôlées** (`domain/ldraw/connector-metadata.ts`) : seulement quand les primitives ne disent rien et que la pièce a été vérifiée. 11477 (pente courbe 2 × 1 : **un** réceptacle sous sa partie plate — la première version en mettait deux ; le modèle 31039 l'a contredite : une plaque 3021 occupe le tenon sous la courbe) et 54200 (pente 1 × 1). Test : chaque réceptacle sur la face la plus basse réelle, dans le contour de **cette face**, et aucune primitive ne le donnait déjà.

**Compatibilité** (`fits`) : tenon ↔ réceptacle (même point à 0,6 LDU, même axe) ; goupille ↔ trou de goupille, axe ↔ trou d'axe (**rigide**), axe ↔ trou de goupille rond (**tournant**, `axle-turning`) : parallèles, sur la même ligne à 0,6 LDU, et **recouvrement réel** ≥ 8 LDU (ou presque tout le trou s'il est plus court : demi-bague de 10 LDU). Aligné au-delà du bout, à côté, ou traversant une pièce sans trou : **pas** connecté. Les liaisons tournantes relient les pièces dans le graphe sans prétendre qu'elles sont solidaires ; déplacer la sélection reste un déplacement rigide (opération d'édition).

## 4. Aimant entre pièces (`proposeSnap`)

| Règle | Détail |
|---|---|
| Près d'abord | Translations candidates à ≤ 24 LDU ; parmi celles à moins de **10 LDU** de la plus proche, la plus engagée (le plus de paires simultanées), puis la plus courte, puis un ordre fixe. Une pièce n'est plus tirée vers un emboîtement complet lointain quand un emboîtement partiel est sous le pointeur. |
| Plusieurs connecteurs | Toutes les paires engagées en même temps sont comptées (plaque 2 × 4 à cheval sur deux briques : 4 + 4). |
| Occupé | Un tenon, un réceptacle ou un trou tient **une** pièce ; un axe ou une goupille longue en traverse plusieurs. Les pièces en main ne comptent pas comme occupantes. |
| Conflits | Deux tenons (lus dans les primitives) ou deux segments au même endroit = deux pièces au même endroit : refusé. Deux réceptacles (déduits) au même point : ce réceptacle n'engage rien, sans veto (deux ailes 30355/30356 bord à bord dans 31039). |
| Axes | Le long d'un axe : par demi-tenons comptés **depuis les faces** des trous, et seulement jusqu'à l'engagement complet. |
| Stabilité | La proposition précédente est gardée tant qu'elle reste valable, au moins aussi engagée, et que la meilleure nouvelle n'est pas **8 LDU** plus proche : pas d'oscillation sur les petits mouvements. |
| Diagnostic | Sans proposition : « aucune connexion reconnue sur cette pièce », « **axes non alignés — tourne la pièce** », « connecteurs déjà occupés » (rien quand rien n'est proche). Jamais de faux succès. |
| Désactiver | Case « Aimant pièces », ⌥ pendant le mouvement : inchangés. Hauteur manuelle : seulement à cette hauteur. Gizmo, coordonnées, glisser direct : inchangés. |

**Priorité des deux aimants** (clarifiée, comportement de la PR #7 conservé) : « Aimant modèle » gagne seulement s'il trouve la **place officielle** de la pièce à ≤ 9,5 LDU (validation P5 sur 31040) ; partout ailleurs, « Aimant pièces ». Sur une place officielle, les repères verts montrent les connexions **vérifiées** à cette pose (aucune si la place officielle n'emboîte rien de déjà posé). Les deux décochés : pose libre ; des repères verts n'apparaissent que si la pose emboîte réellement des tenons. Modes guidé et synchronisé : aucun aimant entre pièces (inchangé).

## 5. Sélection d'un assemblage

« Assemblage » (et double-clic) parcourt le graphe des connexions **réelles** à partir de la pièce choisie, récursivement : tenons, goupilles, **axes** et trous, pièces internes, cachées ou derrière d'autres. Calcul en 3D pur, sans caméra ni lancer de rayon visible : même résultat sous tous les angles. Nombre affiché ; déplacement, rotation, sauvegarde du groupe et **une seule annulation** : mécanismes existants (`moveGroup`). **« Voir les connexions »** : les pièces hors sélection deviennent transparentes et transparentes au pointeur (affichage seulement, rien n'est enregistré).

## 6. Le cas de la capture (barre noire intérieure)

Capture non reçue. Dans le 31039, la seule « longue barre noire » qui traverse des pièces est l'**axe Technic 6 (3706, noir)** à l'intérieur du fuselage, à travers trois blocs croisés 6536 et deux demi-bagues 32123a, eux-mêmes reliés par goupilles 2780 à des briques 6541. La fixture **originale** [`tests/fixtures/mecanisme-axe.ldr`](../../tests/fixtures/mecanisme-axe.ldr) reproduit ce mécanisme avec ces références réelles, en orange : 3706 noir à travers trois 6536 orange et deux 32123a, deux 2780 vers deux 6541 orange, une 3023 sur l'une ; pièges : un 6536 aligné **au-delà** du bout de l'axe, une 6541 dont le trou est aligné **sans** goupille, un axe 4519 qui traverse une brique 3001 **sans trou**, une plaque 3958 qui **cache** tout sans y être emboîtée.

Résultats (unitaires sur la bibliothèque réelle + E2E) : depuis **un** bloc orange, 11 pièces, axe invisible compris ; les 5 pièges exclus ; identique depuis chacune des 11 pièces, sous 3 angles de caméra, après rotation X / Y / Z et translation de tout le mécanisme ; déplacé et tourné d'un bloc (distances relatives conservées), une annulation, rechargé à l'identique. Depuis l'angle où la plaque cache le bloc, un clic atteint la plaque : son assemblage est elle seule. Captures : [sélection](preuves/connexions/assemblage-cache-selection.png), [autre angle](preuves/connexions/assemblage-cache-autre-angle.png), [voir les connexions](preuves/connexions/assemblage-cache-voir-connexions.png).

Sur la **copie** de la construction réelle du propriétaire : sa roue avant forme un assemblage de 8 pièces relié par ses 3 axes rouges 32062 dans les trous d'axe des demi-poutres (liaisons « axe ») ; la jante 42610 et le pneu 51011 ne sont pas reconnus.

**À confirmer par le propriétaire** : si la capture montrait un autre mécanisme (autres références), me les donner — la fixture et le test s'y adaptent.

## 7. Inventaire 31039 (134 références, 609 pièces)

`npx tsx scripts/connections-report.ts <31039.mpd> --root "31039 - Blue Power Jet.ldr" [--progress <copie>]` (lecture seule).

- **Reconnues : 127** (avant : 117 sur 133 avec au moins un connecteur).
- **Incertaine : 1** — 32015 « Technic Angle Connector #5 » : son trou de goupille est lu ; son trou d'axe est dessiné seulement avec des bords d'axe (communs à l'axe et au trou) : non reconnu.
- **Aucun connecteur : 6** — 3937 charnière, 42610 jante, 51011 et 61254 pneus (61254 intégré au fichier), 92279 pare-brise, 48729 barre 1,5L à clip.
- **Métadonnées** : 11477, 54200.

Références Technic et leurs interfaces :

| Référence | Titre LDraw | Occ. | Connecteurs reconnus |
|---|---|---|---|
| 2780 | Technic Pin with Friction and Slots | 10 | 2 goupilles |
| 3673 | Technic Pin | 2 | 2 goupilles |
| 6558 | Technic Pin Long with Friction and Slot | 2 | 3 goupilles |
| 3749 | Technic Axle Pin | 2 | 1 goupille, 1 axe |
| 43093 | Technic Axle Pin with Friction | 2 | 1 goupille, 1 axe |
| 3706 | Technic Axle 6 | 1 | 1 axe (120 LDU) |
| 59426 | Technic Axle 5.5 with Stop Type 2 | 1 | 1 axe (110 LDU) |
| 4519 | Technic Axle 3 | 2 | 1 axe |
| 32062 | Technic Axle 2 Notched | 3 | 1 axe |
| 6536 | Technic Cross Block 1 x 2 (Axle/Pin) | 3 | 1 trou d'axe, 1 trou de goupille |
| 32123a | Technic Bush 1/2 Smooth with Axle Hole Reduced | 2 | 1 trou d'axe (10 LDU) |
| 32064a | Technic Brick 1 x 2 with Axlehole | 1 | 2 tenons, 2 réceptacles, 1 trou d'axe |
| 30000 | Brick 2 x 2 with Pins and Axlehole | 1 | 4 tenons, 4 réceptacles, 2 goupilles, 1 trou d'axe |
| 32316 | Technic Beam 5 | 2 | 5 trous de goupille |
| 32449 | Technic Beam 4 x 0.5 Liftarm | 2 | 2 trous d'axe, 2 trous de goupille |
| 41677 | Technic Beam 2 x 0.5 Liftarm | 2 | 2 trous d'axe |
| 6632 | Technic Beam 3 x 0.5 Liftarm | 2 | 2 trous d'axe, 1 trou de goupille |
| 32018 | Technic Brick 1 x 14 with Holes | 4 | 14 tenons, 14 réceptacles, 13 trous de goupille |
| 3700 / 3701 / 6541 | Technic Brick 1 x 2 / 1 x 4 / 1 x 1 with Hole(s) | 2 / 2 / 2 | tenons, réceptacles, 1 / 3 / 1 trous de goupille |
| 56908 | Wheel Rim 26 x 43 with 6 Pegholes | 1 | 6 trous de goupille, 1 trou d'axe |
| 3960 | Dish 4 x 4 Inverted | 1 | 1 tenon, 4 réceptacles, 1 trou d'axe |
| 32124 | Technic Rotor 2 Blade with 4 Studs | 4 | 4 tenons, 5 réceptacles, 1 trou d'axe |
| 18677 | Plate 1 x 2 with Offset Peghole on Underside | 4 | 2 tenons, 1 trou de goupille (réceptacles : non déduits) |
| 2430 | Hinge Plate 1 x 4 Top | 2 | 2 tenons, 2 réceptacles, 1 « goupille » (l'axe de charnière est dessiné avec une primitive de goupille ; aucune pièce femelle de charnière n'est reconnue) |

Modèle fini (toutes les pièces à leur place) : **1 855 connexions** (1 790 tenons, 38 goupilles, 24 axes rigides, 3 axes tournants), 27 assemblages, le plus grand de 493 pièces (les autres sont reliés par charnières, clips, roues : non reconnus).

## 8. Performances (31039, 609 pièces)

Mesures sur le MacBook, machine au repos, 3 exécutions (`scripts/connections-report.ts`, fourchettes) ; et dans le navigateur sur la copie de la construction réelle (`playwright.recette-connexions.config.ts`).

| Opération | Quand | Temps |
|---|---|---|
| Lecture des connecteurs des 134 références (fichiers LDraw locaux) | une fois par modèle | 66–189 ms (avant : 213 ms) |
| Index des connecteurs, 609 pièces | à chaque changement de la construction | 7–11 ms |
| Liaisons + graphe, 609 pièces (1 855 liaisons) | idem, au premier besoin | 6–17 ms |
| Tous les assemblages du modèle fini (27) | « Assemblage » | 0,5–1,3 ms |
| Aimant : une pièce en main près de sa place (609 essais, échauffé) | à chaque mouvement du pointeur | P50 0,06 ms · P95 0,31–0,38 ms · P99 0,9–1,1 ms · max 2–4 ms |
| Graphe de la construction réelle (101 pièces) | idem | 1,5–1,7 ms |
| Navigateur, construction réelle, pièce en main balayée sur l'assemblage (120 mouvements, mouvement + 2 images rendues) | pointeur | P50 48 ms · P95 52 ms · max 57 ms (≈ 2 × 16,7 ms d'affichage + calcul) |

Avant optimisation (toutes les translations candidates évaluées) : P95 3,5 ms, max 104 ms (grandes ailes à 114 connecteurs) → les candidates sont évaluées de la plus proche à la plus lointaine et l'évaluation s'arrête hors de la bande « proche ». L'état d'affichage n'est mis à jour que si la proposition ou les repères changent.

Précision sur le modèle fini : chaque pièce reprise 3 LDU à côté de sa place → 597 propositions sur 609, **592 la ramènent exactement à sa place** (à 0,05 LDU près : sous-modèles tournés) ; les autres n'ont aucune connexion reconnue (jante, pneus, charnières, pare-brise) ou un axe incliné.

Recette sur la copie de la construction réelle (101 pièces, lecture seule, bibliothèque vérifiée inchangée : même SHA-256) : une plaque orange 3023 prise dans le bac au-dessus de la plaque blanche f101 → « 2 tenons sur f101 », repères = proposition avant le clic, pose enregistrée = aperçu, aucune autre pièce déplacée ; reprise → même proposition, même pose ; « Assemblage » depuis elle → 87 pièces (le grand assemblage de 86 + elle). Captures dans `brick-lab-data/proofs/connexions/` (set tiers : hors du dépôt).

## 9. Limites connues

- Réceptacles sous les bords en biais (ailes, cales) : garantis par un tube voisin, ils peuvent encore dépasser d'un tenon le long d'un bord en biais ; jamais dans un coin vide. Un contrôle point-dans-le-polygone de la face du dessous reste à faire.
- Clips, barres (Ø 3,18 mm), charnières, rotules : non reconnus (pas de distinction mâle / femelle démontrée par les primitives). À étudier : primitives `clip*` (femelle) face aux barres, qui n'ont pas de primitive dédiée.
- Axes à butée sans primitive d'extrémité côté butée : incertains ; à ajouter au catalogue de métadonnées pièce par pièce, après vérification, quand une construction réelle les utilise.
- Aimant : la rotation reste celle du joueur (il faut des axes alignés) ; le moteur le dit, il ne tourne pas la pièce lui-même.

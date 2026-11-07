# Montage libre — rotations 3 axes, manipulation directe, assemblages, aimantation : rapport

**Date :** 07/11/2026. Branche `feat/true-free-building` (PR #7), worktree `brick-build-worktrees/true-free-building`, base `origin/main` = `5272811`. Décision du propriétaire : NO-GO de la PR #7 en l'état, GO pour compléter le moteur du montage libre (quatre problèmes relevés sur 31039).
Architecture : [MONTAGE_LIBRE_CONNEXIONS.md](MONTAGE_LIBRE_CONNEXIONS.md) · recette humaine : [RECETTE_HUMAINE_MONTAGE_LIBRE_3D.md](RECETTE_HUMAINE_MONTAGE_LIBRE_3D.md).

> Critère du propriétaire : prendre une pièce, la tourner dans tous les sens, la placer facilement sur une autre grâce à l'aimant, puis saisir et déplacer tout un assemblage connecté comme un seul objet. Les deux captures annoncées n'ont pas été reçues : les deux cas ont été reconstitués à partir de sa construction réelle 31039 (lue sans modification).

## 1. Les deux cas du propriétaire

| Capture annoncée | Ce que montrent ses données | Cause |
|---|---|---|
| « Une pièce rouge que je ne peux pas mettre à la verticale » | Axe Technic **32062** (rouge), couché : sa longueur (axe X du fichier) va vers Z. | Les orientations proposées (O) étaient celles du modèle : 31039 n'utilise le 32062 que couché ; R ne tournait qu'autour de la verticale. |
| « Un assemblage gris, orange et vert mal aligné » | Plaques grises **30157** à y = 15,41 au lieu de 17,41 sur les plaques orange 3023 et les équerres vertes 99780 ; dans le plan, bien centrées. | **2 LDU trop haut** : ses réceptacles ne prennent pas les tenons. Rien ne pouvait les y amener précisément (pas d'aimant entre pièces). |

Captures avant / après (modèle synthétique original avec les mêmes pièces et les mêmes poses que son 31039) : [avant — assemblage](preuves/libre/avant-assemblage-gris-orange-vert.png) · [avant — axe rouge](preuves/libre/avant-axe-rouge-pas-de-verticale.png) · [après — axe vertical](preuves/libre/apres-axe-rouge-vertical.png) · [après — aimant, aperçu](preuves/libre/apres-aimant-plaque-grise-apercu.png) · [après — assemblage aligné](preuves/libre/apres-assemblage-aligne.png) · [après — assemblage sélectionné](preuves/libre/apres-assemblage-selectionne.png) · [après — assemblage déplacé et tourné](preuves/libre/apres-assemblage-deplace.png).

## 2. Les quatre améliorations

| | Ce qui change |
|---|---|
| **A — Rotations X / Y / Z** | Boutons X, Y, Z (−90° / +90°) au-dessus de la vue 3D, touches X / Y / Z (Maj : −90°, R = Y) ; axes de rotation dessinés autour de la pièce (X rouge, Y vert, Z bleu) ; indicateur « Dessus : haut · Avant : −Z ». Rotations composées par produit de matrices, coefficients ramenés exactement à −1/0/1 : aucune dérive (vérifié sur 1 000 rotations). Sans pièce en main, la sélection tourne **sur place** (même point le plus bas), en une action. Groupes : rotation 3D du repère, reposés par leur nouveau point le plus bas. Plus de limite aux orientations du modèle (O reste disponible). |
| **B — Manipulation directe** | Appuyer sur une pièce posée et glisser : elle est prise (avec toute la sélection si elle en fait partie), relâcher la pose à l'aperçu. Seuil de 4 px (le même que le clic existant) : un clic, même avec un léger glissement du trackpad, ne déplace rien. Caméra suspendue seulement pendant ce glisser ; un glisser dans le vide la fait toujours tourner. Échap annule. M reste un raccourci. Éditeur de correspondances P6 inchangé. |
| **C — Assemblage connecté** | « Sélectionner l'assemblage » (et double-clic) : toutes les pièces reliées à la pièce choisie par des connexions **reconnues** (tenon dans réceptacle, goupille dans trou), directement ou par d'autres ; le groupe se glisse, tourne, monte, descend comme un objet rigide ; une seule action, une seule annulation. Deux pièces qui se touchent ou se croisent sans connexion compatible ne sont pas reliées. Maj + clic reste disponible pour le reste. |
| **D — Aimant entre pièces** | Pendant une manipulation : connecteurs compatibles à moins de 24 LDU, translations candidates, score déterministe (paires emboîtées, puis plus petit déplacement), propositions impossibles écartées (tenon déjà pris, deux pièces au même endroit), aperçu à la position proposée, points verts sur les connecteurs emboîtés, texte « aimant : N tenon(s) emboîté(s) sur M pièce(s) ». Case « Aimant pièces » ; ⌥ maintenu pendant le déplacement pour l'ignorer ; en hauteur manuelle, seulement à cette hauteur. La pose est exactement l'aperçu. |

## 3. Connexions reconnues (résumé — détail dans la note d'architecture)

Tenons (primitives `stud*`), réceptacles déduits sous les briques, plaques, tuiles (tubes `stud3*` / `stud4*`, 1 × 1, titre « Tile W x L »), demi-goupilles Technic (`connect*`, `confric*`), trous de goupille (paires de `peghole`). **Non reconnus** (signalés, jamais inventés) : axes et trous d'axe (mêmes primitives pour le mâle et le femelle), clips, barres, charnières, roues, pentes sans tube, pare-brise… Couverture : 31039 — 117 pièces sur 133 avec au moins un connecteur, 107 avec tenons/réceptacles ; 31009 — 52/65 ; 31040 — 21/31.

## 4. Compatibilité et intégrité

- **Format de sauvegarde inchangé** (v3, 12 nombres par pièce libre) : une rotation 3D ou un groupe déplacé sont des poses rigides déjà représentables. v1 / v2 inchangés.
- Ouvrir une partie ne réaligne rien : l'aimant n'agit que sur une manipulation explicite (sa construction 31039 réelle est restée telle quelle).
- Modes guidé et synchronisé : règles inchangées (pas de barre, pas de sélection, mêmes niveaux, même refus) ; 31040 synchronisé rejoué jusqu'au bout par la suite.
- Stock : un déplacement, une rotation ou un groupe ne crée ni ne retire de pièce ; un groupe est déplacé tout ou rien (`moveGroup`).

## 5. Défauts trouvés pendant le lot et corrigés

| Défaut | Effet | Correction |
|---|---|---|
| Boîtes englobantes pour écarter les collisions | La 30157 (supports de roues) était jugée « en collision » avec la plaque blanche : l'aimant ne proposait rien sur son cas | Collision approximative abandonnée ; règles sûres sur les connecteurs |
| Gestionnaires R3F appelés une fois par objet touché | Après un glisser, le clic de relâche re-sélectionnait la pièce | Propagation arrêtée, drapeau conservé jusqu'à l'appui suivant |
| Pièce re-créée (sélectionnée / non) placée à l'origine jusqu'au rendu suivant | Un double-clic rapide (ou deux clics) passait à travers la pièce et **vidait la sélection** — aussi pour un humain | Matrice et matrice monde calculées dès l'attachement |
| Double-clic mesuré au traitement des événements | Une image lente séparait les deux clics | Horodatage des événements eux-mêmes |
| Aperçu absent tant que la souris ne bouge plus après la prise | Le premier glisser n'affichait rien si le pointeur s'arrêtait | Le pointeur est suivi avant la prise |
| Axes de rotation dessinés avec des lignes épaisses (drei `Line`) | Vue 3D ralentie (test : 52 s au lieu de 21 s) | Segments simples créés une fois |
| Textes de la barre et boutons sur la même ligne | Les boutons bougeaient quand un texte changeait | Ligne d'état séparée |
| R replié dans l'orientation en montage libre | Le joueur scripté P5 (qui compte les quarts de tour de R) bouclait : validation 31040 en libre bloquée 40 min | R garde son quart de tour dans tous les modes ; seuls les boutons et touches X / Y / Z composent l'orientation |
| L'aimant entre pièces passait avant la place officielle | Sur 31040, une pièce calée sur sa place du modèle était déplacée de 10 LDU vers un emboîtement voisin | Quand « Aimant modèle » trouve la place officielle, elle est gardée ; ailleurs l'aimant entre pièces s'applique ; un décalage nul ne change rien |
| Test : deux briques 2 × 4 posées en se chevauchant | L'aimant (à raison) empilait la seconde sur la première | Test corrigé : briques écartées |

## 6. Tests

- **Unitaires** : 286/286 (+15 : rotations A 4, connexions et aimant 11 — lecture des connecteurs sur des pièces miniatures originales, graphe, assemblages, goupille/trou, propositions, déterminisme, hauteur conservée, axes non alignés, tenon déjà pris, deux pièces au même endroit).
- **E2E** `free-3d.spec.ts` (5, modèle synthétique avec les pièces et poses du propriétaire) : A — axe rouge vertical, posé, identique après rechargement, rotation sur place annulée en une fois ; B — glisser, clic avec glissement de 2 px, vide = caméra, Échap, sélection glissée ensemble, M ; C — assemblage de 7 pièces (bouton, double-clic), glissé et tourné comme un objet, une annulation, pièce voisine non prise ; D — les deux plaques grises emboîtées exactement (4 tenons chacune), ⌥, axe non reconnu sans proposition ; **WebKit**. Tests existants adaptés : `free-building` (sélection puis M), `free-height-group` (temps limite), joueur scripté inchangé depuis la correction précédente.
- **Recette réelle** (dossier isolé, fichiers copiés en lecture seule, serveur redémarré entre les parties 1 et 2) :

| | 31009 | 31039 |
|---|---|---|
| Aimant sur pièces réelles | 3010 (brique 1 × 4) sur 3023 : 2 tenons, connectées | 30157 sur 32018 : 2 tenons, connectées |
| Assemblage sélectionné, glissé, tourné sur X | 2 pièces, géométrie relative exacte | idem |
| Après redémarrage | 13/270, mêmes poses (empreinte identique) | 13/609, idem |
| Guidé après « Retirer et changer de mode » | pose loin refusée (« Trop loin… 267 LDU ») | (pas d'étapes) |
| Vue 3D en tournant la caméra | 60 i/s | 60 i/s |

**Performance 31039 avec toutes ses pièces** (596 posées librement à leur pose ; 13 pièces **miroir** du fichier OMR exclues, une pièce libre devant être rigide) : ouverture 4,7 à 5,1 s ; graphe des connexions **12 à 16 ms** (531 pièces reliées, 831 liaisons) ; sélection de l'assemblage principal (432 pièces, affichage compris) **113 à 454 ms** selon l'exécution ; 60 i/s au repos, **pendant un glisser avec l'aimant**, en tournant la caméra.

Captures réelles (hors dépôt) : `~/Documents/brick-lab-data/proofs/libre/libre-*-aimant-reel.png`, `libre-31039-1-609-pieces.png`, mesures `recette-libre.json`.

## 7. Sortie de la validation (code final, 07/11/2026)

```
check:spec   15 OK, 2 DÉCLARÉ (écarts antérieurs inchangés), 0 écart nouveau
typecheck    tsc --noEmit : 0 erreur
vitest       Test Files 15 passed (15) — Tests 286 passed (286)
playwright   passage 1 : 73 passed (23.2m), 0 ignoré, 0 échec        [68 + 5 free-3d, dont WebKit]
             passage 2 : 72 passed, 1 échec intermittent (WebKit de free-height-group : pièce
                         en main lue juste avant d'exister, WebKit sur WebGL logiciel) → le test
                         attend désormais la pièce (3 exécutions isolées réussies)
             passage 3 : 73 passed (24.9m), 0 ignoré, 0 échec (après cette correction de test)
recette réelle libre-reel.spec.ts (31009 + 31039) : partie 1, redémarrage, parties 2 et 3 : 3/3
npm run build   OK (production, 0 avertissement)
```

Avant ces passages, deux exécutions complètes avaient révélé deux défauts (R replié dans l'orientation, priorité des aimants, § 5) : 65/67, corrigés.

## 8. Limites

- Connexions reconnues limitées (§ 3) : axes, clips, charnières, roues… ne s'aimantent pas et ne rejoignent un assemblage que par Maj + clic.
- L'aimant ne tourne pas la pièce : il faut l'orienter (X/Y/Z) pour que les axes correspondent.
- Pas de collision : deux pièces peuvent s'interpénétrer hors des cas sûrs écartés.
- Rayon de 24 LDU : au-delà, viser plus près ; avec plusieurs propositions également bonnes, la plus proche gagne (déterministe).
- Pièces miroir d'un fichier (pose non rigide) : pas de pose libre possible.
- Trackpad et application Safari : vérifiés par la recette humaine (WebKit de Playwright ici).

## 9. Verdict

**GO sous condition de la recette humaine** ([RECETTE_HUMAINE_MONTAGE_LIBRE_3D.md](RECETTE_HUMAINE_MONTAGE_LIBRE_3D.md)), centrée sur les quatre problèmes. La fusion reste soumise à ton GO explicite.

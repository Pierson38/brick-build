# Montage libre — manipulateur 3D (gizmo) : conception et rapport

**Date :** 07/11/2026. Branche `feat/true-free-building` (PR #7). Demande du propriétaire avant la fusion : un manipulateur 3D sur la pièce sélectionnée, comme dans Blender. Recette : [RECETTE_HUMAINE_MONTAGE_LIBRE_GIZMO.md](RECETTE_HUMAINE_MONTAGE_LIBRE_GIZMO.md). Suite de [MONTAGE_LIBRE_3D_RAPPORT.md](MONTAGE_LIBRE_3D_RAPPORT.md) et [MONTAGE_LIBRE_CONNEXIONS.md](MONTAGE_LIBRE_CONNEXIONS.md).

> Critère : je sélectionne une brique, les trois flèches apparaissent immédiatement, puis je peux la positionner exactement dans l'espace en manipulant les axes directement avec la souris.

## 1. Comportement

| | |
|---|---|
| **Apparition** | Clic sur une pièce posée (montage libre) : trois flèches sur la pièce, **X rouge, Y verte (vers le haut), Z bleue** ; aucune touche nécessaire. Sur une sélection multiple ou un assemblage, au pivot du groupe (centre des pièces, point le plus bas). |
| **Flèches (W)** | Cliquer-glisser une flèche : la pièce (ou le groupe) ne bouge **que** le long de cet axe. |
| **Anneaux (E)** | Trois anneaux X / Y / Z : cliquer-glisser pour tourner autour de cet axe, par pas de 90° (ou 15°) ; vertical / horizontal à la souris, sans limite aux orientations du modèle. |
| **Axes globaux / locaux (Q)** | Locaux : les flèches et anneaux suivent la rotation de la pièce (ex. un axe redressé : sa flèche rouge est verticale). |
| **Pas** | « ½ tenon » (10 LDU à l'horizontale, une plaque de 8 LDU à la verticale), « tenon » (20 / 8), « 1 LDU » ; case « Grille » décochée ou **⌥ maintenu pendant le glisser** : déplacement libre. |
| **Coordonnées** | En temps réel : **X**, **Y = hauteur au-dessus du sol du modèle**, **Z** (même sens que les flèches) ; saisie numérique + « Appliquer » (ou Entrée). |
| **Échap** pendant un glisser | Annule ce glisser (retour à la position de départ, sélection gardée). |
| **Annuler** | Chaque glisser ou chaque saisie = une action, annulée d'un coup (même pour 432 pièces). |
| **Barre de sélection** | Compacte (libellés courts, raccourcis dans les infobulles) : avec les commandes du manipulateur elle passait à 174 px et couvrait le haut de la vue 3D — un Maj + clic sur une pièce cachée par elle n'arrivait pas à la scène (trouvé par `free-height-group`) ; 138 px à 1280 × 800. |
| Conservé | Glisser direct de la pièce (avec l'aimant entre pièces), boutons et touches X / Y / Z ±90°, R, M, hauteur, assemblage, Maj + clic. |

## 2. Implémentation (réutilisation de `TransformControls`)

- **`TransformControls`** de three-stdlib, via drei (déjà installé) — pas de manipulateur écrit de zéro. Seuls les **trois flèches** et les **trois anneaux** sont gardés : la poignée centrale, les poignées de plan, l'anneau de vue et la sphère de rotation libre sont retirées (elles couvraient la pièce, dont l'appui est le glisser direct avec l'aimant ; trouvé par les tests B et D).
- **LDraw ↔ Three.js** : le manipulateur agit sur un **objet relais au pivot placé DANS le groupe LDraw** (retourné de 180° autour de X) : sa matrice locale est en coordonnées LDraw, `TransformControls` gère le parent tourné. Le manipulateur lui-même est rendu **à côté du groupe LDraw, à la racine de la scène**, car il travaille en espace monde (simple élément frère, sans portail R3F). Résultat : flèche verte = −Y LDraw (vers le haut), flèche bleue = −Z LDraw.
- **Pas relatifs, pas absolus** : l'arrondi intégré de `TransformControls` arrondit la **position absolue** (une pièce à y = 17,41 ou x = 351,92 aurait sauté à une valeur ronde). Il n'est pas utilisé pour la translation : `snapAlong` découpe le **déplacement depuis le début du glisser** en pas entiers, **le long de l'axe tiré seulement** ; les autres coordonnées ne changent pas (aucune modification surprise). La rotation utilise le pas intégré, qui est relatif à l'angle de départ.
- **Pendant le glisser**, les pièces suivent dans **un seul groupe** dont la matrice = relais actuel × relais au départ⁻¹ (une matrice par image, aucun rendu React par pièce) ; les originales sont masquées.
- **Au relâchement** : delta → `applyDelta` (rotations nettoyées, coordonnées à 0,01 LDU) → `moveGroup` (tout ou rien) → une action d'annulation.
- **Caméra** : drei suspend OrbitControls pendant le glisser d'une poignée. Un appui sur une poignée n'est jamais pris pour le glisser direct d'une pièce ; un appui sur une poignée **relâché sans mouvement** reste un clic (Maj + clic sur une pièce sous une flèche).
- **Clavier pendant un glisser du manipulateur** : Échap l'annule, les autres touches de l'atelier sont ignorées (une sélection ne peut pas disparaître en plein glisser) ; si le manipulateur disparaît quand même, la caméra est réactivée.
- **Aimant entre pièces** : jamais pendant un glisser contraint (seulement les pas de grille) ; il reste celui du glisser direct.
- **Sauvegardes** : aucun changement de format (poses rigides v3) ; v1 / v2 / v3 lues comme avant.
- **Modes guidé et synchronisé** : aucun manipulateur (pas de sélection), inchangés.

## 3. Tests

- **Unitaires** (+3, 289/289) : `snapAlong` (pas depuis le départ, y = 17,41 → 9,41, dérive hors axe ignorée, libre, axe local), `applyDelta` (rotation de groupe exacte autour du pivot), coordonnées affichées ↔ saisies.
- **E2E** `free-gizmo.spec.ts` (5) : flèches à la sélection (sans M), X +40 / Y une plaque / Z +20 exacts, rien d'autre ne bouge ; 1 LDU ; ⌥ libre ; une annulation par glisser ; anneau X : l'axe rouge redressé à la souris ; axes locaux (sa flèche rouge verticale) ; coordonnées saisies ; positions identiques après rechargement ; assemblage de 7 pièces monté puis tourné sur son pivot, distances exactes, stock inchangé, deux annulations ; Échap annule un glisser ; l'appui sur la pièce reste le glisser direct avec l'aimant (4 tenons) ; **WebKit**. Pointeur envoyé sur les poignées calculées à partir de la géométrie du manipulateur.
- **Recette réelle** (dossier isolé, fichiers copiés en lecture seule, serveur redémarré) — partie 4 sur **ta construction 31039 actuelle** (21 pièces, copiée) : plaque grise montée d'une plaque exactement, rien d'autre ; ton assemblage (8 pièces avec la brique Technic 32018) déplacé sur X et tourné de 90° sur Y, distances exactes, rétabli par deux annulations ; ta roue placée par saisie (X = 360) ; positions identiques après rechargement. Partie 3 : **assemblage de 432 pièces** déplacé au manipulateur : 57 i/s (pire image 50 ms), chaque pièce exactement −8 en Y, les autres intactes.

## 4. Limites

- Une flèche dessinée par-dessus une pièce voisine prend l'appui (comme dans Blender) : glisser ailleurs sur la pièce voisine, ou Échap pour désélectionner d'abord.
- Rotations à la souris par pas de 90° ou 15° (⌥ : libre) ; une pièce tournée hors des quarts de tour n'est plus emboîtable par l'aimant (axes non alignés).
- Le pivot d'un groupe est son centre au ras du point le plus bas ; pas de choix de pivot.
- La barre de sélection couvre le haut de la vue 3D (≈ 140 px sur un écran de 1280 px de large) : une pièce cachée derrière elle se sélectionne après avoir tourné ou déplacé la caméra.
- Pas de mise à l'échelle (le manipulateur n'a que déplacement et rotation).

## 5. Validation (07/11/2026, sorties réelles)

```
check:spec                                  exit 0
typecheck                                   OK
vitest                                      15 fichiers, 289/289
playwright (Chromium + WebKit), passage 1   78 passed (18.3m)
playwright (Chromium + WebKit), passage 2   78 passed (19.5m)
next build                                  ✓ Compiled successfully
recette réelle libre-reel.spec.ts           partie 1 1/1 ; redémarrage du serveur ; parties 2, 3, 4 3/3
```

- Partie 3 (31039, 596 pièces posées) : ouverture 4,3 s ; graphe 13 ms (531 pièces, 831 liaisons) ; assemblage de 432 pièces en 175 ms ; **glisser du manipulateur sur cet assemblage : 57 i/s, pire image 50 ms**, toutes les autres pièces inchangées ; glisser avec aimant et caméra : 60 i/s.
- Partie 4 (ta construction 31039 copiée, 21 pièces) : plaque grise montée d'une plaque ; assemblage de 8 pièces (f1, f6–f12) déplacé et tourné ; axe f19 sélectionné (axes locaux) ; roue f20 placée à X = 360 par saisie ; identique après rechargement.
- Données réelles : empreintes SHA-256 de `library.json` et des `progress.json` identiques avant et après la recette.
- Un échec trouvé par la suite complète pendant ce lot (Maj + clic refusé dans `free-height-group`) venait de la barre de sélection agrandie qui couvrait la pièce ; corrigé (§ 1, « Barre de sélection »).

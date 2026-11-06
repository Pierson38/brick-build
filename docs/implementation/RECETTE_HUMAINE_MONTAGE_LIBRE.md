# Recette humaine — véritable montage libre (Chrome puis Safari)

> Critère principal du propriétaire : **en montage libre, choisir une brique et la poser où je veux, même si ce n'est pas sa place dans le modèle LEGO officiel.**
> Les tests automatisés pilotent la souris par script ; le trackpad, l'application Safari et le jugement « c'est agréable à construire » restent humains. Architecture : [MONTAGE_LIBRE_ARCHITECTURE.md](MONTAGE_LIBRE_ARCHITECTURE.md) · rapport : [MONTAGE_LIBRE_RAPPORT.md](MONTAGE_LIBRE_RAPPORT.md).

Durée estimée : 30–35 min (Chrome 25, Safari 10).

## 0. Avant de commencer (préparé par Claude à ta demande)

- Serveur de production depuis le worktree `true-free-building`, http://127.0.0.1:3000 (à l'écoute sur 127.0.0.1 seulement), serveur précédent arrêté.
- **Sauvegarde vérifiée** de `library` et `mappings` (archive extraite à part et comparée fichier par fichier), et inventaire SHA-256 de tes données.
- **Format des sauvegardes** : une partie qui contient des pièces posées librement est enregistrée au **format v3**. Tant que la PR n'est pas fusionnée, la version actuelle de `main` ne sait pas reprendre une partie v3 (elle la conserve sans la modifier). Si tu ne fusionnes pas : « Annuler » jusqu'à ce qu'il ne reste aucune pièce posée librement (la partie revient d'elle-même au format v2), ou je restaure la sauvegarde sur ta demande. Les parties guidées, synchronisées et sans pièce libre restent en v2, inchangées.
- État de départ attendu : 31040 notice synchronisée 25/65 page 6 ; 31009 jamais commencé ; 31039 montage libre 0/609 page 4.

Ouvre http://127.0.0.1:3000 dans **Chrome**, de préférence sur l'écran du MacBook (trackpad).

## 1. Poser où je veux — 31039 (montage libre, 609 pièces)

1. « Ma collection » → 31039 → **Reprendre** : montage libre, 0/609, page 4. La scène est vide (rien n'est posé).
2. Prends une brique dans la barre, pointe **loin de l'avion** (n'importe où sur la grille), clique : elle est posée là. Message « Pièce posée librement (1/609) ». En haut : « 1 posée(s) librement · 0 à leur place dans le modèle ».
3. Pose 4 ou 5 pièces différentes, à des endroits de ton choix ; **empile** une brique sur une autre (pointe le dessus de celle du dessous) : elle se pose dessus, alignée sur ses tenons.
4. **Pièces identiques** : prends une pièce dont la quantité est ×3 ou plus, pose-en 3 : la quantité baisse de 3 ; à 0, elle disparaît de la barre. Les couleurs sont celles du set.
5. **R** : quart de tour ; **O** : autre orientation (quand le modèle en utilise plusieurs). **G** ou case « Grille » : sans grille, la pièce suit le pointeur au LDU près.

## 2. Reprendre une pièce posée — déplacer, tourner, retirer

1. Sans pièce en main, **clique sur une pièce posée** : « Pièce reprise ». Déplace la souris, **R** pour la tourner, clic : elle est reposée ailleurs (« Pièce déplacée librement »).
2. Reprends-la, **Échap** : elle reste où elle était.
3. Reprends-la, **Suppr** (ou bouton « Remettre dans le stock ») : elle revient dans la barre.
4. **Annuler** / **⌘Z** : annule la dernière action (pose, déplacement, retrait).

## 3. Aimants

1. Coche « Montrer les emplacements » : les emplacements du modèle pour la pièce tenue apparaissent. Pointe l'un d'eux : « à sa place dans le modèle, clic pour poser ». Clic : la pièce est comptée « à sa place dans le modèle ».
2. Pose la même pièce **à un demi-tenon** de son emplacement : c'est possible (l'aimant ne s'applique que tout près). Décoche « Aimant modèle » : plus aucun calage sur le modèle.

## 4. Notice et reprise

1. Onglet **Notice PDF** pendant que tu construis : la notice se consulte librement (pages, zoom), la construction n'est pas bloquée.
2. **⌘R** : la même construction revient, pièces aux mêmes endroits et orientations ; message « Progression restaurée : N/609 pièces posées, dont N posée(s) librement ».
3. **Redémarrage du serveur** : dans l'onglet du terminal du serveur, Ctrl-C puis `npm run start` (ou demande-le-moi), recharge : identique. Après rechargement, « Annuler » retire la dernière pièce posée.

## 5. Changer de mode — 31009 (jamais commencé)

1. 31009 → **Construire** → **Montage libre (avec notice)** ; pose une pièce loin de la maison.
2. Menu **Mode** → « Guidé » : une confirmation explique que la pièce posée hors du modèle sera remise dans le stock ; **« Rester en montage libre »** : rien ne change.
3. Mode → « Guidé » → **« Retirer et changer de mode »** : mode guidé, étape 1, la pièce est revenue dans le stock. Essaie de poser une pièce de l'étape loin de sa place : **refusée** (« Trop loin… »), comme avant.
4. (Facultatif) « Abandonner » pour laisser 31009 « jamais commencé » (la partie va dans l'historique de la bibliothèque).

## 6. Rien n'a changé ailleurs — 31040 (notice synchronisée)

1. 31040 → **Reprendre** : notice synchronisée, 25/65, page 6, comme avant.
2. Clic sur une brique déjà posée : il ne se passe rien (on ne reprend une pièce qu'en montage libre). Une pièce posée loin de sa place est refusée. Ne pose rien, ou « Annuler » ce que tu poses.

## 7. Fluidité, trackpad, Safari

1. Sur 31039 avec tes pièces posées : fais tourner (glisser) et zoomer (deux doigts) la vue ; elle reste fluide. Avec le trackpad : un clic « appuyé » qui glisse un peu pose quand même ; un glisser fait tourner la vue sans poser.
2. Ouvre http://127.0.0.1:3000 dans **Safari** : refais **1.2, 1.3, 2.1, 2.3 et 4.2**.

## 8. Fin de stock (information)

Avec 609 pièces, la fin de stock n'est pas pratique à atteindre à la main ; elle est vérifiée sur des fixtures : « Toutes les pièces du set sont posées (N/N). Montage libre : ta construction n'est pas comparée au modèle officiel — K pièce(s) à leur place dans le modèle. » ; dans la collection, le set reste « En cours » tant que toutes les pièces ne sont pas à leur place.

## 9. Résultats (à remplir par le propriétaire)

| Point | Chrome | Safari | Remarques |
|---|---|---|---|
| 1. Poser où je veux, empiler, identiques, quantités et couleurs | | | |
| 2. Reprendre : déplacer, tourner, retirer, annuler | | | |
| 3. Aimants (modèle, grille) | | — | |
| 4. Notice libre, rechargement, redémarrage du serveur | | | |
| 5. Changement de mode explicite, guidé toujours strict | | — | |
| 6. 31040 synchronisé inchangé | | — | |
| 7. Fluidité, trackpad | | | |

Dis-moi ce que tu laisses posé : je comparerai tes données avec l'inventaire d'avant la recette et te dirai exactement ce qui a changé.

## 10. Résultat de la recette du propriétaire (06/11/2026)

**NO-GO** pour fusionner la PR #7 en l'état, deux limitations signalées (deux captures annoncées, non reçues par Claude) :

1. Impossible de descendre suffisamment une longue pièce grise pour l'ajuster au-dessus d'un assemblage orange et vert (pièce 30157 de la construction 31039).
2. Impossible de déplacer plusieurs briques ensemble.

Données après cette recette (comparées à l'inventaire de 22:08) : seule la construction 31039 a changé — 12 pièces posées librement (format v3, révision 25), versions remplacées gardées dans son historique ; 31040 (25/65) et 31009 inchangés. Corrections et recette ciblée : [MONTAGE_LIBRE_CORRECTIONS.md](MONTAGE_LIBRE_CORRECTIONS.md), [RECETTE_HUMAINE_MONTAGE_LIBRE_CORRECTIONS.md](RECETTE_HUMAINE_MONTAGE_LIBRE_CORRECTIONS.md).

# Recette humaine — manipulateur 3D (Chrome puis Safari)

> Critère : je sélectionne une brique, les trois flèches apparaissent immédiatement, puis je peux la positionner exactement dans l'espace en manipulant les axes directement avec la souris. Détail : [MONTAGE_LIBRE_GIZMO.md](MONTAGE_LIBRE_GIZMO.md).

Durée estimée : 20 min, sur le MacBook (trackpad), puis Safari.

## 0. Avant de commencer (préparé par Claude)

- Serveur de production depuis le worktree `true-free-building` (tête de la PR #7), http://127.0.0.1:3000 (127.0.0.1 seulement).
- Sauvegarde vérifiée de `library` + `mappings` juste avant ; inventaire SHA-256.
- Ta construction 31039 (21 pièces) telle que tu l'as laissée ; rien n'est réaligné à l'ouverture. Format des sauvegardes inchangé (v3).

## 1. Les flèches à la sélection

1. 31039 → **Reprendre**. Clic sur une **plaque grise** : trois flèches apparaissent sur elle (X rouge, Y verte vers le haut, Z bleue), sans M. La barre affiche « X … · Y … (hauteur) · Z … ».
2. Glisse la **flèche verte** vers le haut : la plaque ne monte que verticalement, par plaques (8 LDU) ; relâche. **Annuler** : elle revient.
3. Flèche **rouge**, puis **bleue** : déplacement sur un seul axe, par demi-tenons ; les coordonnées changent en direct.
4. **Pas : 1 LDU** : ajustement fin. Maintiens **⌥** pendant un glisser : sans pas du tout.
5. Pendant un glisser, **Échap** : la pièce revient où elle était.

## 2. Les anneaux

1. **Anneaux** (touche E) : trois anneaux remplacent les flèches.
2. Clic sur un de tes **axes rouges**, anneau **rouge** (X) ou **bleu** (Z) : glisse le long de l'anneau, l'axe bascule par quarts de tour — vertical, horizontal. Rotation **15°** si tu veux d'autres angles.
3. **Locaux** (Q) puis **Flèches** (W) : sur un axe redressé, la flèche rouge suit l'axe (verticale) ; **Globaux** : de nouveau les axes de la scène.

## 3. Coordonnées saisies

1. Sélectionne ta **roue** : tape une valeur dans **X** (ou Y, Z), Entrée ou **Appliquer** : elle y est exactement. Annuler : elle revient.

## 4. Assemblage

1. Clic sur une pièce de ton assemblage gris / orange / vert, **« Assemblage »** (ou double-clic) : le manipulateur se place au centre de l'ensemble.
2. Flèches et anneaux : tout l'assemblage bouge et tourne d'un bloc, sans se déformer ; **une** annulation par geste.

## 5. Ce qui ne change pas

1. Appuyer sur la pièce elle-même (pas sur une flèche) et glisser : le glisser direct, avec l'aimant entre pièces.
2. Boutons X / Y / Z ±90°, R, Monter / Descendre, M, Maj + clic : comme avant.
3. 31040 (notice synchronisée) : aucun manipulateur, rien ne change.

## 6. Safari

Dans **Safari** : refais **1.1–1.3, 2.2 et 4.2**.

## 7. Résultats (propriétaire, 08/11/2026)

Résultats transmis par le propriétaire sous forme de verdicts par thème (aucune mesure chiffrée transmise) ; « Safari OK » couvre les points du § 6.

| Point | Chrome | Safari | Remarques |
|---|---|---|---|
| 1. Flèches à la sélection, un axe à la fois, pas, 1 LDU, ⌥, Échap | OK | OK (§ 6) | « Flèches X / Y / Z : OK » |
| 2. Anneaux, vertical / horizontal, axes locaux | OK | OK (§ 6) | « Rotations et axes locaux : OK » |
| 3. Coordonnées en direct et saisies | OK | — | « Précision et coordonnées : OK » |
| 4. Assemblage déplacé et tourné d'un bloc, une annulation | OK | OK (§ 6) | « Assemblage connecté : OK » |
| 5. Glisser direct, aimant, boutons, 31040 inchangés | OK | — | « Non-régression et Safari : OK » |
| Critère : sélectionner, voir les flèches, placer exactement à la souris | OK | OK | « Toutes les conditions fonctionnelles sont levées. » Verdict : **GO FINAL** |

Données après la recette (comparées à l'inventaire `donnees-2026-11-07T23-44-37.sha256`) : seule la construction 31039 a changé — révision 254, **50 pièces posées librement** (21 avant), modifications du 08/11 entre 15 h 45 et 16 h 01 ; 4 plus anciens instantanés d'historique (r1, r4, r9, r16) retirés par la rotation normale (30 au plus, `MAX_HISTORY`, depuis P7), conservés dans les sauvegardes précédentes. 31040 (25/65, synchronisé) et le reste : inchangés.

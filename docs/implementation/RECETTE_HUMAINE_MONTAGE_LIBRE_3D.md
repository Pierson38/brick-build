# Recette humaine — rotations, manipulation directe, assemblages, aimant (Chrome puis Safari)

> Tes quatre problèmes sur 31039 (07/11/2026). Critère : prendre une pièce, la tourner dans tous les sens, la placer facilement sur une autre grâce à l'aimant, puis saisir et déplacer tout un assemblage connecté comme un seul objet. Rapport : [MONTAGE_LIBRE_3D_RAPPORT.md](MONTAGE_LIBRE_3D_RAPPORT.md).

Durée estimée : 25 min. Sur l'écran du MacBook, au trackpad de préférence.

## 0. Avant de commencer (préparé par Claude)

- Serveur de production depuis le worktree `true-free-building` (tête de la PR #7), http://127.0.0.1:3000 (127.0.0.1 seulement).
- Sauvegarde vérifiée de `library` + `mappings` juste avant ; inventaire SHA-256.
- Ta construction 31039 (14 pièces libres) est **telle que tu l'as laissée** : rien n'est réaligné à l'ouverture.
- Format des sauvegardes inchangé depuis ta dernière recette (v3) ; la version actuelle de `main` ne sait pas reprendre une partie v3 — si tu ne fusionnes pas, je restaure la sauvegarde sur ta demande.

## 1. La pièce rouge à la verticale (axe 32062)

1. 31039 → **Reprendre**. Clic sur l'axe rouge : il est sélectionné ; la barre au-dessus de la vue 3D montre « Dessus : … · Avant : … » et les boutons **X / Y / Z**.
2. **X +90°** (ou touche X) : l'axe se redresse **sur place**. Annuler : il se recouche ; X +90° de nouveau.
3. Glisse-le (appuyer, déplacer, relâcher) ailleurs : il reste vertical. Pendant le glisser, les trois axes colorés suivent la pièce ; **Z −90°** / **Y +90°** la tournent encore.
4. **⌘R** : l'axe est vertical, au même endroit.

## 2. Manipulation directe

1. Appuie sur une pièce posée et glisse : elle suit le pointeur ; relâche : elle est posée. Aucun M nécessaire.
2. Un simple clic (même avec un léger glissement au trackpad) ne la déplace pas : il la sélectionne.
3. Glisse dans le vide : la caméra tourne, comme avant.
4. Pendant un glisser, **Échap** : la pièce revient où elle était.
5. Maj + clic sur deux ou trois pièces, puis glisse l'une d'elles : elles bougent ensemble.

## 3. L'aimant — ton assemblage gris, orange et vert

1. Glisse une **plaque grise** (30157) au-dessus des plaques orange et vertes : elle se cale ; des **points verts** marquent les tenons emboîtés ; la barre indique « aimant : 4 tenon(s) emboîté(s) sur 2 pièce(s) ». Relâche : elle est posée exactement là (elle descend des 2 LDU qui manquaient).
2. Pareil pour la deuxième plaque grise.
3. Prends une pièce dans la barre (une plaque, une brique) et approche-la d'une autre : elle se cale sur ses tenons. Essaie à côté, dessous (si elle a des tenons), sur la face latérale des équerres vertes (tenons de côté : tourne d'abord la pièce avec X ou Z pour que ses réceptacles leur fassent face).
4. Maintiens **⌥ (Option)** pendant le déplacement : plus d'aimant, pose libre. Décoche « Aimant pièces » : idem.
5. Une pièce sans connexion reconnue (axe rouge, goupille près d'un axe…) : pas de proposition, pose libre.

## 4. Sélectionner et déplacer l'assemblage

1. Clic sur une pièce de ton assemblage, puis **« Sélectionner l'assemblage »** (ou double-clic sur une pièce) : toutes les pièces emboîtées sont sélectionnées (7 avec les deux plaques grises calées), pas celles qui se contentent de toucher.
2. Glisse-le par une de ses pièces : il bouge comme un objet ; X / Y / Z le tournent sans le déformer ; Monter / Descendre.
3. Relâche : posé. **Annuler** une fois : tout revient. Recommence et garde-le.
4. **⌘R**, puis redémarrage du serveur (Ctrl-C dans son onglet, `npm run start`, ou demande-le-moi) : l'assemblage est au même endroit.

## 5. Rien n'a changé ailleurs

1. 31040 (notice synchronisée, 25/65) → Reprendre : pas de barre, pas de sélection ni de glisser des pièces posées, une pose loin de sa place est refusée. Ne pose rien (ou Annuler).

## 6. Safari

Dans **Safari** : refais **1.2, 2.1, 2.3, 3.1 et 4.1–4.2**.

## 7. Résultats (à remplir par le propriétaire)

| Point | Chrome | Safari | Remarques |
|---|---|---|---|
| 1. Axe rouge vertical (X/Y/Z, sur place, après rechargement) | | | |
| 2. Glisser direct, clic sans déplacement, caméra, Échap, sélection | | | |
| 3. Aimant : plaques grises calées, autres pièces, ⌥, sans connexion | | | |
| 4. Assemblage : sélection, glisser, rotation, annulation, redémarrage | | | |
| 5. 31040 inchangé | | — | |
| Critère : tourner, aimanter, déplacer un assemblage comme un objet | | | |

Dis-moi ce que tu laisses posé : je comparerai tes données avec l'inventaire d'avant cette recette et te dirai exactement ce qui a changé.

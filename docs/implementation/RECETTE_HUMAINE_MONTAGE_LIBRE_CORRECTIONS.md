# Recette humaine ciblée — hauteur libre et groupes (Chrome puis Safari)

> Les deux points du NO-GO du 06/11/2026 : (1) descendre / monter librement une pièce, (2) déplacer plusieurs pièces ensemble. Corrections : [MONTAGE_LIBRE_CORRECTIONS.md](MONTAGE_LIBRE_CORRECTIONS.md).
> Critère : assembler plusieurs pièces, les déplacer ensemble et ajuster librement leur hauteur avec précision.

Durée estimée : 20 min (Chrome 15, Safari 5). Sur l'écran du MacBook, au trackpad de préférence.

## 0. Avant de commencer (préparé par Claude)

- Serveur de production depuis le worktree `true-free-building` (tête de la PR #7), http://127.0.0.1:3000, à l'écoute sur 127.0.0.1 seulement.
- Sauvegarde vérifiée de `library` + `mappings` faite juste avant (archive extraite et comparée fichier par fichier) ; inventaire SHA-256.
- Ta construction 31039 (12 pièces libres de ta première recette) est restée telle quelle : tu repars d'elle.
- Format : inchangé depuis ta première recette (v3 dès qu'il y a des pièces libres) ; la version actuelle de `main` ne sait pas reprendre une partie v3 — si tu ne fusionnes pas, je restaure la sauvegarde sur ta demande.

## 1. Hauteur libre — ta pièce grise sur 31039

1. 31039 → **Reprendre** : tes 12 pièces, aux mêmes endroits.
2. **Clic** sur la pièce grise (30157) : elle est **sélectionnée** (surlignée) ; une barre apparaît au-dessus de la vue 3D. **« Déplacer la sélection »** (ou M) : elle est en main.
3. Amène-la au-dessus de ton assemblage orange et vert. **« ▼ Descendre »** (pas « 8 LDU ») : elle descend d'une plaque à chaque clic, **sur place**, même à travers d'autres pièces. Choisis **« 1 LDU »** et ajuste au millimètre (▲ / ▼). L'indication « bas à N LDU du sol » suit.
4. Déplace la souris : la pièce garde la hauteur choisie en suivant le pointeur. Vise la pièce montrée et **clique** : elle est posée exactement là.
5. **« Hauteur auto »** (ou A) avec une autre pièce en main : retour au placement automatique sur la surface visée.
6. Clavier (facultatif) : PageUp / PageDown = le pas choisi ; Maj + PageUp / PageDown = 1 LDU.
7. Essaie aussi une pièce **longue**, une pièce **à axe latéral** (goupille Technic) et une **petite** pièce.

## 2. Groupes — un petit assemblage déplacé d'un bloc

1. Construis un petit assemblage de 3 ou 4 pièces (ou prends le tien).
2. **Clic** sur une pièce, puis **Maj + clic** sur les autres : elles sont toutes surlignées ; « N pièce(s) sélectionnée(s) ». Maj + clic sur une pièce déjà sélectionnée la retire. Un clic sans glisser ne fait pas bouger la caméra ; un glisser la fait toujours tourner.
3. **« Déplacer la sélection »** : le groupe est en main, montré à sa nouvelle position avant de le poser.
4. Déplace-le, **R** (ou « ⟳ Tourner ») : il tourne d'un quart de tour autour de son centre, sans se déformer. **Monter / Descendre** : tout le groupe.
5. **Clic** : posé. Les pièces gardent exactement leurs écarts et orientations ; les quantités de la barre ne changent pas.
6. **Annuler** (ou ⌘Z) : **une seule fois** suffit, tout le groupe revient où il était.
7. Recommence le déplacement, puis **⌘R** : le groupe est à sa nouvelle place. (Redémarrage du serveur : Ctrl-C dans l'onglet du serveur puis `npm run start`, ou demande-le-moi.)
8. Clic dans le vide, Échap ou « Désélectionner » : sélection vidée. « Remettre dans le stock » : toute la sélection revient dans la barre (Annuler la remet).

## 3. Rien n'a changé ailleurs

1. 31040 → **Reprendre** (notice synchronisée, 25/65) : pas de barre de hauteur, un clic sur une brique posée ne la sélectionne pas, une pose loin de sa place est refusée. Ne pose rien (ou Annuler).

## 4. Safari

Dans **Safari** : refais **1.2 à 1.4** et **2.2 à 2.6**.

## 5. Résultats (à remplir par le propriétaire)

| Point | Chrome | Safari | Remarques |
|---|---|---|---|
| 1. Hauteur libre : 8 LDU, 1 LDU, aperçu, conservée, auto, pose exacte | | | |
| 1.7 Pièces longues, à axe latéral, petites | | — | |
| 2. Groupe : sélection (clic, Maj+clic), déplacement, rotation, hauteur | | | |
| 2.5–2.6 Écarts conservés, stock inchangé, annulation en une fois | | | |
| 2.7 Groupe après rechargement / redémarrage | | — | |
| 3. 31040 synchronisé inchangé | | — | |
| Critère : assembler, déplacer ensemble, ajuster la hauteur avec précision | | | |

Dis-moi ce que tu laisses posé : je comparerai tes données avec l'inventaire d'avant cette recette et te dirai exactement ce qui a changé.

## 6. Résultat de la recette du propriétaire (07/11/2026)

**NO-GO** pour fusionner la PR #7 en l'état ; **GO** pour compléter le moteur. Quatre nouveaux problèmes sur 31039 (deux captures annoncées, non reçues par Claude) : une pièce rouge impossible à mettre à la verticale (axe 32062) ; un assemblage gris, orange et vert mal aligné (plaques 30157 à 2 LDU au-dessus des tenons) ; obligation de passer par M pour déplacer ; pas de sélection d'un assemblage complet ni d'aimant entre pièces. Données : seule la construction 31039 a changé (14 pièces libres, révision 40), 31040 et 31009 inchangés. Suite : [MONTAGE_LIBRE_3D_RAPPORT.md](MONTAGE_LIBRE_3D_RAPPORT.md), recette [RECETTE_HUMAINE_MONTAGE_LIBRE_3D.md](RECETTE_HUMAINE_MONTAGE_LIBRE_3D.md).

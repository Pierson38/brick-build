# Recette humaine — le bloc beige à trou du 31039 et sa plaque grise

> **À faire par le propriétaire.** Critère : je prends ce bloc dans le bac, je l'approche de son assemblage et j'obtiens directement un emboîtement correct, sans ajuster de coordonnées.
>
> Détail technique : [CORRECTION_BLOC_31039.md](CORRECTION_BLOC_31039.md).

Durée estimée : 15 min, Chrome puis Safari. Branche `fix/31039-block-snapping` (PR non fusionnée).

## 0. Avant de commencer

- **Sauvegarde** de ta bibliothèque (`library` + `mappings`) avant d'ouvrir le serveur de la branche. Rien n'est réaligné à l'ouverture, format des sauvegardes inchangé (v3).
- Arrête le serveur qui écoute déjà sur le port 3000 (celui du worktree `windows-support` tournait pendant ce travail), puis dans `brick-build-worktrees/31039-block-snapping` : `npm run build && npm run start` → http://127.0.0.1:3000.

## 1. Ce que tu verras sur ta construction actuelle

1. Ouvre ton 31039. Rien n'a bougé.
2. Clic sur une **plaque grise 4 × 4 en coin** (2639) au-dessus d'un bloc beige à trou, puis « **Assemblage** » : **13 pièces** (la pente inversée 4287 blanche, les plaques posées dessus… et cette plaque grise). Avant la correction, ces pièces étaient comptées avec tout le fuselage : elles sont en réalité **1,81 LDU trop bas** et ne tiennent pas sur la pente courbe 41763.

## 2. Le critère, sur une partie neuve (le plus simple)

« Recommencer » sur une **copie** ou un autre montage libre du 31039 (ne pas effacer ta construction) :

1. Pose dans l'ordre, chaque pièce prise **dans le bac** : la pente courbe inversée **41763** blanche sur sa plaque ; la pente inversée **4287** sur le **bout mince** de la courbe ; les plaques de la colonne ; puis le **bloc beige 6541** (avec ses goupilles noires vers les blocs croisés) sur sa plaque.
2. Chaque fois : la barre dit « aimant : … emboîté(s) … », les **repères verts** apparaissent **avant** le clic, la pièce est posée **là où l'aperçu la montrait**.
3. La 4287 est **à fleur** du dessus de la courbe (plus enfoncée dedans).
4. Prends la **plaque grise 2639** dans le bac et approche-la au-dessus de la 4287 et du bloc beige : « **2 tenon(s) emboîté(s) sur 2 pièce(s)** » (ou plus si d'autres tenons sont dessous), deux repères verts dont un **sur le bloc beige**. Clic.
5. Clic sur le bloc beige → « Assemblage » : la plaque grise et la pente en font partie.

## 3. Réparer ta construction (facultatif, à toi de décider)

Rien n'est réaligné automatiquement. Pour remettre une colonne à la bonne hauteur :

1. Reprends la **41763** de ce côté (clic, puis M) et approche-la de sa place : l'aimant la remet **0,4 LDU plus haut**, à fleur de la plaque 3035. Clic.
2. Clic sur la **4287** de ce côté → « Assemblage » (13 pièces) → M → approche-la du bout de la 41763 : l'aimant doit proposer l'emboîtement, et la plaque grise prendre le tenon du bloc beige. Clic. **Annuler** (⌘Z) si le résultat ne te convient pas.
3. Même chose de l'autre côté.

> Vérifié sur le moteur avec une copie de ta construction (41763 : −0,4 LDU ; colonne : −1,81 LDU, 9 connexions dont le bloc beige), **pas joué dans le navigateur** : dis-moi si l'aimant ne propose pas l'emboîtement.

## 4. Non-régression rapide

- Une plaque 1 × 2 depuis le bac sur une plaque blanche : 2 tenons, repères, pose = aperçu (comme la recette du 08/11).
- Gizmo X/Y/Z et rotations sur la sélection, une annulation.
- Axes et goupilles : « Assemblage » depuis un bloc croisé noir du fuselage sélectionne l'axe et les blocs beiges.
- Modes guidé et synchronisé : inchangés (aucun aimant entre pièces).
- Safari : les points 2.2 à 2.5.

## Résultat

À compléter : GO / NO-GO, navigateur, remarques.

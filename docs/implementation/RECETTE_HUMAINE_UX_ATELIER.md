# Recette humaine — atelier : panneaux redimensionnables et miniatures des pièces (Chrome puis Safari)

> Les tests automatisés pilotent la souris par script et WebKit de Playwright n'est pas l'application Safari. Ce lot ne change ni le format de la collection, ni les progressions, ni les correspondances ; seule la largeur choisie est mémorisée, dans le navigateur. Poser une pièce pendant la recette enregistre la progression comme d'habitude (« Annuler » la retire).

Durée estimée : 30 min (Chrome 20, Safari 10). Rapport : [UX_ATELIER_RAPPORT.md](UX_ATELIER_RAPPORT.md).

## 0. Préparation (faite par Claude, 06/11/2026)

| Contrôle | Résultat |
|---|---|
| Serveur précédent | Aucun serveur sur 3000 / 3100 / 3200 / 3300, aucun processus `next` |
| Tête de la PR #6 | voir § 6 (tête vérifiée identique en local, sur `origin` et dans la PR avant le lancement) |
| Données avant recette | 61 fichiers de `library/`, `models/`, `instructions/`, `mappings/` **identiques** à l'inventaire de clôture P8 (19:19) |
| Sauvegarde vérifiée | `backups-p8/library-2026-11-06T20-47-30-avant-recette-ux.tar.gz` (`library` + `mappings`, 23,3 Mo, SHA-256 `6fdff829…5ab4f4`) ; extraite à part et comparée : 39/39 fichiers identiques, aucun en plus ni en moins. Manifeste : `backups-p8/donnees-2026-11-06T20-47-30.sha256` |
| Serveur de recette | production (`npm run build` puis `npm run start`), worktree UX, http://127.0.0.1:3000 |

**État de départ, à retrouver au point 7** (index révision 3) :

| Set | Mode | Progression | Page notice | Révision |
|---|---|---|---|---|
| 31040-1 Desert Racers | notice synchronisée | 25 / 65 | 6 | 37 |
| 31009-1 Small Cottage | jamais commencé | — | — | — |
| 31039-1 Blue Power Jet | montage libre | 0 / 609 | 4 | 4 |

Ouvrir 31009 en montage libre crée sa première sauvegarde de progression (0 pièce) : c'est attendu.

## Parcours (Chrome d'abord, sur l'écran du MacBook si possible)

Ouvrir http://127.0.0.1:3000 dans **Chrome**. Note OK / KO et une remarque libre dans le tableau du § 5.

### 1. Panneaux redimensionnables — 31040

1. Ma collection → 31040 → **Reprendre** : notice synchronisée, 25/65, page 6, comme avant. Un trait vertical à poignée sépare la vue 3D et la notice.
2. Glisser le trait vers la **gauche**, puis vers la **droite** (souris puis trackpad) : la notice s'élargit/se rétrécit en direct, la page suit, puis redevient nette. Tout à gauche / tout à droite : il s'arrête (vue 3D ≥ ~320 px, notice ≥ ~280 px).
3. Clic sur le trait, puis ← / → (Maj = plus vite), Début / Fin : il bouge au clavier, contour bleu visible.
4. **⌘R** : la largeur choisie est conservée. **Double-clic** sur le trait : retour aux proportions d'origine.
5. Élargir la notice, puis **poser 2 pièces** : la pièce suit exactement le pointeur et se pose au bon endroit. Redimensionner encore, poser 1 pièce. Puis **Annuler ×3** pour revenir à 25/65 (facultatif).
6. Onglet **Correspondances** : l'éditeur a sa propre largeur (plus large) ; la changer ne change pas celle de l'atelier.

### 2. Notice : largeur automatique et zoom manuel — 31040 puis 31009

1. Sur 31040, le zoom affiche **« Largeur »** : page entière, aucune barre de défilement horizontale, quelle que soit la largeur du panneau.
2. **+** puis **−** : zoom fixe en pourcentage. Élargir le panneau en zoom fixe : la page garde son zoom. **↔** : retour à « Largeur », la page suit de nouveau le panneau.
3. « ← Ma collection » → 31009 → **Construire** → **Montage libre (avec notice)** → onglet Notice PDF : la notice s'ouvre aussi en « Largeur » (avant le lot elle débordait de 196 px en montage libre).

### 3. Miniatures — 31009 (montage libre)

1. Barre du bas : chaque pièce montre sa **forme** dans sa **couleur**, avec ×N ; la référence est en petit. Les 92 miniatures apparaissent en environ une seconde (mesuré : ~950 ms sur ce Mac).
2. Comparer avec la page de notice ouverte : reconnais-tu les pièces par forme et couleur, sans chercher le numéro ?
3. Survoler une pièce : infobulle référence · couleur · restantes/total.
4. Cliquer une pièce : entourée en bleu, « en main » ; la poser : sa quantité baisse. **Annuler** la retire.
5. Faire défiler la liste : Annuler, Mode, Centrer… restent visibles.

### 4. Montage libre du 31039 (609 pièces) — utilisabilité réelle

1. « ← Ma collection » → 31039 → **Reprendre** : montage libre, 0/609, page 4.
2. Environ **180 couples pièce/couleur** (estimation d'après le fichier, ~2× 31009 ; **non mesuré** : compter 2 s environ pour toutes les miniatures).
3. Avec la page 4 de la notice à côté : retrouver 3 ou 4 pièces de l'étape dans la barre, par la forme et la couleur. Combien de temps ? Le défilement (2 rangées visibles à 1280×800) est-il supportable ?
4. En poser 1 ou 2, puis **Annuler** pour revenir à 0/609.
5. Verdict personnel : utilisable tel quel / utilisable mais à améliorer (préciser : taille des vignettes, hauteur de la barre, tri, filtre par étape…) / inutilisable.

### 5. Fluidité de la vue 3D après redimensionnement — 31039

1. Pendant l'apparition des miniatures, faire tourner et zoomer le modèle : la vue reste fluide.
2. Déplacer le séparateur 3 ou 4 fois, redimensionner la fenêtre de Chrome (plus petite, plus grande, plein écran) : la vue 3D reste nette et fluide, sans déformation, rien ne déborde ; une pièce prise en main suit encore le pointeur.

### 6. Safari

Ouvrir http://127.0.0.1:3000 dans **Safari** :

1. 31040 → Reprendre : même progression ; largeur par défaut (la préférence est propre à chaque navigateur).
2. Refaire **1.2, 1.4, 1.5** (glisser, ⌘R, poser), **2.1–2.2** (Largeur, zoom), **3.1** (miniatures 31009) et **5.1** (fluidité).

### 7. Aucune régression des progressions et des notices

Fermer l'atelier, revenir à « Ma collection », puis rouvrir chaque set :

1. 31040 : 25/65 (ou le compte que tu as laissé), notice synchronisée sur la bonne page.
2. 31039 : 0/609 (si tu as annulé), montage libre, page 4.
3. 31009 : montage libre, pièces que tu as laissées.
4. Dis-moi ce que tu as laissé posé : je comparerai alors les fichiers avec le manifeste de 20:47 et te dirai exactement ce qui a changé (attendu : seulement les progressions et les pages que tu as touchées).

## 5. Résultats (à remplir par le propriétaire)

| Point | Chrome | Safari | Remarques (capture, taille de fenêtre) |
|---|---|---|---|
| 1. Panneaux 31040 (largeur mémorisée, pose) | | | |
| 2. Notice Largeur / zoom | | | |
| 3. Miniatures 31009 (forme, couleur, quantité, rapidité) | | — | |
| 4. 31039 : miniatures utilisables ? | | — | |
| 5. Fluidité 3D après redimensionnement | | | |
| 6. Safari (ensemble) | — | | |
| 7. Progressions et notices intactes | | | |

En cas de souci : je peux restaurer la sauvegarde de 20:47 sur ta demande (serveur arrêté). Pour retrouver les largeurs d'origine : double-clic sur le séparateur.

## 6. Tête testée

Branche `fix/atelier-resizable-panels-part-previews` ; la tête exacte servie par le serveur est indiquée dans la description de la PR #6 et dans le rapport de fin de préparation.

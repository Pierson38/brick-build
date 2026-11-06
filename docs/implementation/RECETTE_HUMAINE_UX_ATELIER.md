# Recette humaine — atelier : panneaux redimensionnables et miniatures des pièces (Chrome puis Safari)

> Les tests automatisés pilotent la souris par script et WebKit de Playwright n'est pas l'application Safari. Ce lot ne touche ni la collection, ni les progressions, ni les correspondances : rien n'est écrit dans ta bibliothèque par ces changements (seule la largeur choisie est mémorisée dans ton navigateur).

Durée estimée : 20–25 min. Rapport : [UX_ATELIER_RAPPORT.md](UX_ATELIER_RAPPORT.md).

## 0. Lancement

```bash
cd ~/Documents/brick-build-worktrees/ux-resizable-panels
npm ci
npm run build
npm run start
```

Ouvrir http://127.0.0.1:3000 dans **Chrome**, idéalement sur l'écran de ton MacBook (sans écran externe).

Les étapes 1.4 et 3.4 posent de vraies pièces dans ta collection (31040 en notice synchronisée, 31009 en montage libre) : « Annuler » les retire. Si tu préfères pouvoir tout remettre comme avant, sauvegarde d'abord (serveur arrêté) :

```bash
cd ~/Documents/brick-lab-data && tar -czf backups-p8/library-$(date +%Y-%m-%dT%H-%M-%S)-avant-recette-ux.tar.gz library mappings
```

## 1. Séparateur (31040, notice synchronisée)

| # | Action | Attendu | OK/KO |
|---|---|---|---|
| 1.1 | 31040 → « Reprendre » | Même progression qu'avant (notice synchronisée, même étape, même page) ; un trait vertical à poignée sépare la vue 3D et la notice | |
| 1.2 | Glisser le séparateur vers la **gauche** (souris ou trackpad) | La notice s'élargit en direct, la page suit la largeur sans barre de défilement horizontale, puis se redessine nette | |
| 1.3 | Le glisser tout à gauche, puis tout à droite | Il s'arrête : la vue 3D garde au moins ~320 px, la notice ~280 px ; rien ne déborde de la fenêtre | |
| 1.4 | Poser 2 ou 3 pièces après avoir redimensionné | La pièce suit le pointeur exactement, se pose au bon endroit ; la notice tourne ses pages comme avant | |
| 1.5 | Cliquer sur le séparateur puis ← / → (Maj pour aller plus vite), Début / Fin | Il se déplace au clavier ; un contour bleu montre qu'il a le focus ; les raccourcis de l'atelier (R, O, PageUp…) ne sont pas affectés | |
| 1.6 | Recharger la page (⌘R) | La largeur choisie est conservée | |
| 1.7 | Double-cliquer sur le séparateur | Retour aux proportions d'origine | |
| 1.8 | Onglet « Correspondances » (éditeur) | L'éditeur a sa propre largeur (plus large par défaut) ; la modifier ne change pas celle de l'atelier | |
| 1.9 | Redimensionner la fenêtre de Chrome (plus petite, plus grande) | Les proportions suivent ; aucun défilement horizontal de la page | |

## 2. Notice en montage libre (31009)

| # | Action | Attendu | OK/KO |
|---|---|---|---|
| 2.1 | 31009 → « Construire » → « Montage libre (avec notice) » → onglet Notice PDF | La notice s'affiche **ajustée à la largeur** (« Largeur ») : la page entière est visible sans défilement horizontal | |
| 2.2 | « + » puis « − » | Zoom fixe (pourcentage) ; « ↔ » revient à « Largeur » | |
| 2.3 | En zoom fixe, élargir le panneau | La page garde son zoom (défilement possible si elle est plus large) ; de retour en « Largeur », elle suit le panneau | |

## 3. Miniatures des pièces (31009 en montage libre)

| # | Action | Attendu | OK/KO |
|---|---|---|---|
| 3.1 | Regarder la barre du bas | Chaque pièce montre sa **forme** en vue isométrique, dans sa couleur, avec la quantité (×N) ; la référence (ex. 3069b) est en petit ; elles apparaissent en moins d'une seconde | |
| 3.2 | Comparer avec la notice | Tu reconnais les pièces de la notice par leur forme et leur couleur, sans chercher le numéro | |
| 3.3 | Survoler une pièce | Infobulle : référence, nom de la couleur, quantité restante | |
| 3.4 | Cliquer une pièce | Elle est entourée en bleu avec l'étiquette « en main » ; la poser fait baisser sa quantité | |
| 3.5 | Faire défiler la liste des pièces | La liste défile ; les boutons Annuler, Mode, Centrer… restent visibles en dessous | |
| 3.6 | Pendant l'apparition des miniatures, faire tourner le modèle | La vue 3D reste fluide | |

## 4. Safari

| # | Action | Attendu | OK/KO |
|---|---|---|---|
| 4.1 | Ouvrir http://127.0.0.1:3000 dans **Safari**, 31040 « Reprendre » | Même progression ; la largeur est celle par défaut (préférence propre à chaque navigateur) | |
| 4.2 | Refaire 1.2, 1.4, 1.5, 1.6, 2.1 et 3.1 | Même comportement qu'en Chrome | |

## 5. Retour

Note les écarts (capture, navigateur, taille de fenêtre). Aucune donnée de ta collection n'est modifiée par ce lot ; pour retrouver les largeurs d'origine : double-clic sur le séparateur.

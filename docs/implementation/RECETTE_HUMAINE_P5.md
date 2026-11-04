# Recette humaine P5 — à faire par le propriétaire (Chrome et Safari, Mac)

> Cette recette est **séparée des tests automatisés** : les tests Playwright pilotent la souris par script et ne remplacent pas un essai réel.

## Résultat (04/11/2026)

**Recette réalisée par le propriétaire : OK.** Résultat communiqué : « je viens de tout faire, c'est good », c'est-à-dire le scénario complet ci-dessous dans Chrome et Safari, sur le serveur de production local (`npm run build && npm run start`, commit `8480fa2`). La grille détaillée n'a pas été transmise : aucun KO ni point pénible n'a été signalé.

Durée estimée : 20–30 min par navigateur (40–60 min si tu construis 31040 en entier deux fois).

## 0. Préparation (une fois)

Fichiers locaux attendus (hors dépôt, déjà présents sur ce Mac) :
- modèle : `~/Documents/brick-lab-data/models/31040-1/31040-1.mpd`
- notice : `~/Documents/brick-lab-data/instructions/31040-1/31040-1_notice_6145903.pdf`
- bibliothèque LDraw : `~/Documents/brick-lab-data/ldraw` (déclarée dans `.env.local` du worktree)

Démarrer le serveur **de production** (plus représentatif que le mode dev) :

```bash
cd ~/Documents/brick-build-worktrees/p5-omr-validation
npm run build
npm run start
```

Puis ouvrir **http://127.0.0.1:3000** dans Chrome, puis plus tard dans Safari.

Avant chaque navigateur : repartir d'une progression vide. Si la page d'accueil liste « Sessions récentes » pour 31040, importe le fichier puis clique « Abandonner ».

## 1. Rappel des contrôles

| Action | Souris | Trackpad |
|---|---|---|
| Prendre une pièce | clic sur la pièce dans la barre du bas | clic/tap |
| Poser | survoler l'endroit **sur une surface** (sol ou dessus d'une brique) puis clic | idem (tap ou clic) |
| Tourner la caméra | glisser bouton gauche | clic-glisser à un doigt / trois doigts |
| Zoom | molette | pincer / deux doigts |
| Tourner la pièce de 90° | `R` (`Maj+R` sens inverse) | — |
| Changer d'orientation (pièce couchée, retournée…) | `O` | — |
| Niveau manuel (secours) | `PageUp` / `PageDown` (sur MacBook : `Fn+↑` / `Fn+↓`) ; `A` revient à l'automatique | — |
| Lâcher la pièce | `Échap` | — |
| Annuler la dernière pose | bouton « Annuler » ou `Cmd+Z` | — |

Repère visuel : quand la pièce tenue est sur un emplacement valable, la barre affiche **« emplacement trouvé, clic pour poser »** et la pièce se cale exactement.

## 2. Scénario (identique pour Chrome puis Safari)

| # | Étape | Attendu |
|---|---|---|
| A1 | Importer `31040-1.mpd` (« Importer un modèle ») | Rendu 3D de la jeep en moins de ~2 s ; « 65 pièces », « 11 étapes », badge « Jouable avec étapes 3D », « 0 référence manquante » ; ligne verte « Inventaire officiel vérifié : 65 pièces… » |
| A2 | Tourner / zoomer la caméra | Fluide, pas de saccade visible |
| B1 | « Commencer — mode guidé » | « Étape 1 / 11 », emplacements de l'étape en bleu translucide |
| B2 | Poser les pièces de l'**étape 1** en survolant les fantômes bleus | La pièce se cale sur le fantôme, « emplacement trouvé », le clic pose ; compteur N/65 qui monte |
| B3 | Faire volontairement une **mauvaise pose** (loin, ou mauvaise rotation) | Message clair (« Trop loin… » ou « mauvaise orientation… »), rien n'est posé |
| B4 | Continuer jusqu'à l'**étape 4** au moins (idéalement les 11 étapes, 65/65) | Les étapes avancent seules ; les pièces se posent **sur** les pièces déjà posées sans utiliser PageUp/PageDown |
| B5 | Pour une pièce couchée ou retournée : utiliser `O` puis `R` | L'orientation finit par correspondre ; une pièce symétrique tournée de 180° est acceptée |
| B6 | `Annuler` deux fois | Les deux dernières pièces disparaissent, l'étape revient en arrière si besoin |
| B7 | Recharger la page (`Cmd+R`) puis réimporter `31040-1.mpd` | « Progression restaurée : N/65 », même étape, mêmes pièces visibles |
| C1 | « Abandonner », réimporter, « Montage libre (avec notice) » | Pas d'indicateur d'étape ; stock complet dans la barre |
| C2 | Onglet « Notice PDF » → importer `31040-1_notice_6145903.pdf` | Page 1/32 affichée ; ◀ ▶ et zoom fonctionnent ; aucun message d'erreur |
| C3 | Suivre la notice page par page et poser une dizaine de pièces **à différentes hauteurs** (sol, 1er étage, toit) | La hauteur suit la surface survolée ; changer de page PDF ne modifie pas la 3D |
| C4 | Décocher/cocher « Montrer les emplacements » | Les fantômes apparaissent/disparaissent ; avec fantômes, survoler un fantôme y cale la pièce |
| C5 | Essayer `PageUp`/`PageDown` puis `A` | « Niveau manuel k/n » puis « Niveau auto (surface) » |
| D1 | Pendant tout le test : console du navigateur (Chrome : `Cmd+Option+J` ; Safari : Développement → Afficher la console) | Pas d'erreur rouge répétée ; noter toute erreur |
| D2 | (optionnel) Importer `31009-1.mpd` | Avertissement orange « Inventaire indéterminé… » visible ; rendu OK |

## 3. Grille de résultats à me renvoyer

Copie ce tableau dans ta réponse et remplis-le (OK / KO / commentaire).

| # | Chrome | Safari | Commentaire |
|---|---|---|---|
| A1 Import & rendu | | | |
| A2 Caméra fluide | | | |
| B2 Pose sur fantômes | | | |
| B3 Mauvaise pose refusée | | | |
| B4 Pose sur pièces posées sans PageUp | | | |
| B5 O / R / symétrie | | | |
| B6 Annuler | | | |
| B7 Reprise après rechargement | | | |
| C2 Notice PDF | | | |
| C3 Hauteurs en montage libre | | | |
| C4 Emplacements on/off | | | |
| C5 Niveau manuel + A | | | |
| D1 Erreurs console | | | |
| Construction complète 65/65 ? (oui/non, durée) | | | |
| Agréable à jouer ? (1–5) | | | |
| Points pénibles | | | |

Mac / navigateurs utilisés (versions) : …
Souris ou trackpad : …

## 4. Après la recette

- Tout est OK dans les deux navigateurs → je pourrai proposer le **GO** final pour la PR #2.
- Un KO → je corrige sur la même branche, je relance les tests, puis je te redemande une recette ciblée.

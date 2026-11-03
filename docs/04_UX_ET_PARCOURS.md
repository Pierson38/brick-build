# 04 — Parcours et interface

## Écran A — Accueil / Import

- Marque d'application neutre : **Brick Lab Local** ; aucune fausse affiliation officielle LEGO.
- Bouton « Importer un modèle (.mpd/.ldr) » ; l'utilisateur conserve ses fichiers.
- Bouton secondaire « Importer une notice PDF ».
- Liste locale des sessions récemment ouvertes (métadonnées + progression, pas de fichiers tiers préembarqués).
- Lien externe « Trouver une notice sur LEGO.com » ; ouvre le site dans le navigateur, pas de téléchargement automatique par l'app.
- Afficher informations de statut et limites après import.

## Écran B — Aperçu du modèle

```
┌─────────────────────────────────────────────────────────────────────┐
│ Brick Lab Local   Set importé : [nom]          [Mode guidé / Notice] │
├───────────────────────────────────────────────┬─────────────────────┤
│                                               │ Modèle               │
│                  Vue 3D                       │ 83 pièces            │
│                                               │ 16 étapes détectées  │
│   rotate / zoom / center                      │ 1 pièce manquante !  │
│                                               │ [Commencer]          │
└───────────────────────────────────────────────┴─────────────────────┘
```

- Si pas d'étapes mais géométrie complète, le bouton affiche « Montage libre (avec notice) ». Si rendu incomplet, afficher « Visualiser » et les pièces manquantes ; ne pas tromper l'utilisateur.

## Écran C — Construction

```
┌─────────────────────────────────────────────────────────────────────┐
│ ← Modèles       Modèle actuel     Étape 3 / 16       [Sauvegardé]    │
├───────────────────────────────────────┬─────────────────────────────┤
│                                       │ Notice (optionnelle)        │
│        Scène 3D interactive           │ PDF p. 4 / 42               │
│                                       │ [◀]  [Zoom] [▶]            │
│  déjà construites : couleurs pleines  │                            │
│  cible : ghost + silhouette           │ PDF rendu localement       │
│  pièce tenue : suit le curseur        │                            │
├───────────────────────────────────────┴─────────────────────────────┤
│ Pièces à placer [rouge 2×4] [bleu 2×4]  [Annuler] [Centrer] [Aide]│
└─────────────────────────────────────────────────────────────────────┘
```

- Un mode fractionné avec poignée redimensionnable est agréable mais pas nécessaire au premier lot.
- Navigation clavier et libellés accessibles ; ne pas rendre le gameplay inaccessible sans drag : ajouter un bouton « Poser à la position cible » pour debug / accessibilité, explicite dans l'UI.
- Lorsqu'une pièce est correctement placée, elle devient fixe et passe à l'état validé ; en cas d'erreur, message et retour réversible.
- **Montage libre** : si le modèle n'a pas de `STEP`, ne pas désactiver le jeu. L'utilisateur suit le PDF à sa manière ; pour une pièce choisie, l'application considère toutes les positions finales encore non occupées de même référence/couleur. Si plusieurs cibles correspondent, résoudre par proximité et empêcher toute validation ambiguë.
- Afficher `N/M pièces posées`, **pas seulement** « étape x/y ».

## États UI obligatoires

- Chargement/lecture du fichier.
- Modèle invalide.
- Modèle analysable mais géométrie manquante.
- Modèle affichable sans étapes.
- Modèle jouable avec étapes.
- Mode PDF sans modèle 3D (notice seulement) — possibilité utile mais pas obligatoire MVP.
- Progression restaurée après réimport du même fichier.
- Session terminée avec possibilité de recommencer.

## Comportement des PDF

- Le PDF est chargé via le sélecteur local File API ; il ne part pas sur le réseau.
- Ne pas afficher de texte « Étape LEGO x » si on ne connaît que « Page PDF y ».
- Sauvegarde minimale : index de page ; les bytes PDF ne sont pas conservés sans choix explicite.
- En cas de PDF chiffré, abîmé ou trop volumineux : afficher une erreur utilisable.

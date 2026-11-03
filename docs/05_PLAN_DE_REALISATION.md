# 05 — Lots et portes de validation

## P0 — Préflight Git + audit de faisabilité (obligatoire)

**Tâches** : vérifier base git et worktrees ; lire docs ; décider versions ; tester le comportement réel du `LDrawLoader` ; inspecter la sortie de lecture sur fixture et modèle OMR téléchargé manuellement si disponible ; vérifier qu'on peut maintenir des occurrences individuelles.

**Sortie** : note technique de 1 à 2 pages, proposition de structure et commandes reproductibles. **GO** seulement si les pièces/étapes peuvent être reconstruites ou si une alternative mesurée est documentée.

## P1 — Parser structurel LDraw

Implémenter traitement MPD/LDR, table des sections, type 1, STEP, racine, sous-modèles, héritage couleur, transformations, diagnostics, IDs stables.

**Preuve** : tests unitaires fixtures `mini-4-pieces.mpd`, `nested-submodel.mpd`, `no-steps.ldr`, et cas invalides.

**GO** : pièce par pièce, transformations composées vérifiées, détection des erreurs ; aucun crash sur entrée malformée.

## P2 — Viewer 3D minimal

Rendre 4 pièces correctement avec bibliothèque LDraw locale, interaction orbit/zoom, afficher aperçu et diagnostic. Ne pas inventer de pièces quand une référence manque.

**GO** : rendu réel validé dans navigateur Mac + preuve ; pas seulement capture avec cubes factices.

## P3 — Moteur de construction

Étapes explicitement définies **et mode libre sans STEP**, liste des occurrences à poser, drag simplifié, ghost target (optionnel en mode libre), snap, validations, undo, complétion. En mode libre, la bonne position est cherchée parmi les occurrences cibles non posées compatibles avec la référence/couleur choisie.

**GO** : les 4 pièces sont posées dans le bon ordre, une pièce déjà placée ne peut pas être placée une seconde fois, le mauvais emplacement ne valide pas.

## P4 — PDF local

Importer PDF local avec PDF.js, zoom, navigation, erreurs, indépendance page PDF / étape 3D.

**GO** : notice importée en session, aucune requête réseau vers LEGO et aucune erreur après changement de page.

## P5 — Persistance et première recette réelle

Sauvegarder le modèle et la progression (ou hash + demande de réimport), reprendre. Puis choisir un vrai fichier OMR simple et mener une recette, signaler les écarts de géométrie/étapes.

**GO** : round-trip de progression, rapport de compatibilité du modèle réel et tests documentés.

## P6 — Ensuite seulement (hors MVP)

- Éditeur manuel d'étapes (définition/reclassement d'occurrences et sous-assemblages) ;
- Import multi-fichiers de modèles et bibliothèque manquante ;
- Modes Technic avancés, rotations complexes, performance grands sets ;
- Import `.io`/`.lxf` après étude des formats et licences ;
- Mapping manuel étape de montage ↔ page PDF.

## Discipline de fin de lot

Chaque lot livre : objectifs atteints/non atteints, commandes de test, sorties vérifiables, liste des limitations, plan de test manuel et décision GO/NO-GO. Ne pas empiler P1 à P6 sans relecture intermédiaire.

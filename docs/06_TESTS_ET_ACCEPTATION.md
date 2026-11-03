# 06 — Stratégie de tests et recette

## Tests unitaires du parseur (Vitest)

- 1 section LDR sans MPD, avec `0 STEP` et lignes type 1 valides.
- MPD multi-sections avec `0 FILE`/`0 NOFILE`.
- Préservation des **IDs distincts** pour deux briques ayant la même référence / couleur.
- `0 STEP` est un **séparateur de fin d'étape** ; pas de première étape vide créée.
- Un fichier sans STEP retourne `NO_STEPS`, pas une séquence inventée.
- Sous-modèle 2 niveaux ; composition matrix correctement testée avec transformations non triviales.
- Couleur héritée `16` et couleur explicite.
- Référence inconnue, sous-modèle absent, cycle, fichier vide/malformé, nombres non finis, nombre excessif d'occurrences et profondeur limite.
- Noms de fichiers internes contenant des espaces, casse et doublons ; nom de référence avec `../` refusé selon politique.

## Tests moteur de jeu (Vitest)

- Peut sélectionner une occurrence non posée dans l'étape active.
- Mode guidé : ne peut pas valider une pièce hors de son étape ou déjà posée.
- Mode libre sans STEP : peut sélectionner une référence/couleur existante et valider une cible finale libre compatible ; aucune notion artificielle d'étape active.
- Deux pièces identiques : poser une occurrence n'épuise pas tout le stock ; aucune cible ne peut être posée deux fois.
- Snap valide quand position **et** rotation sont dans les tolérances ; sinon non.
- Undo retire exactement la dernière occurrence posée.
- Progression `N/M` exacte ; terminer la dernière étape ne crée pas de nouvelle étape fantôme.
- Sérialisation/rechargement idempotents ; hash invalide = réimport demandé, pas restauration sur autre modèle.

## Tests E2E (Playwright)

1. Ouvrir la home sur `127.0.0.1:3000`.
2. Importer `fixtures/mini-4-pieces.mpd` et lire 4 occurrences / 2 étapes.
3. Vérifier que la 3D affiche effectivement quatre briques avec géométrie LDraw, bibliothèque locale configurée.
4. Lancer le mode guidé ; placer les pièces ; vérifier compteur, progrès et message de réussite.
5. Rafraîchir ; recharger la fixture si nécessaire ; récupérer la progression associée.
6. Importer un PDF local de test librement distribué (créé pour les tests) ; page suivante/précédente fonctionne.
7. Refaire import avec `fixtures/no-steps.ldr` : pas de fausse construction guidée ; **mode montage libre utilisable** et les deux briques peuvent être posées dans n'importe quel ordre.

**Note** : ne pas intégrer une notice LEGO dans les tests CI ni dans le dépôt. Utiliser un PDF de test original construit par le projet ou généré en mémoire.

## Recette manuelle

- Test sur Mac Chrome/Safari : orbit, drag, zoom, changement de fenêtre, actualisation.
- Contrôle ressources : petites scènes, 100 puis 300 pièces ; noter performances mesurées et machine du test.
- Couper réseau après installation ; contrôler que la construction et l'import de fichiers déjà locaux fonctionnent.
- Import réel OMR choisi manuellement : conserver **dans un fichier de rapport** nom/référence, URL de provenance, licence du fichier, nombre de pièces attendues/observées, erreurs, étapes utilisables ou non.

## Critères STOP

- Source de vérité des pièces perdue à la conversion en meshes.
- Rendu « OK » alors qu'une partie des références manque.
- Étapes artificiellement inventées, ou prétendument identiques à la notice PDF sans preuve.
- Fichiers utilisateur envoyés hors machine.
- Test green obtenus par mocks uniquement alors que le moteur 3D réel est cassé.
- Modification de `main` ou du worktree protégé.

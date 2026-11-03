# Fixtures LDraw synthétiques

Ces trois fichiers ont été rédigés pour le projet ; ce **ne sont pas des sets LEGO officiels** et **n'intègrent aucune géométrie** de pièces LDraw. Ils font seulement référence à `3001.dat` (brique standard 2×4), qui doit être chargée depuis une bibliothèque de pièces LDraw installée localement.

- `mini-4-pieces.mpd` : 4 occurrences de `3001.dat`, 2 étapes, deux couleurs par étage.
- `nested-submodel.mpd` : 2 occurrences d'un sous-modèle de 2 pièces (4 briques finales) ; les occurrences doivent avoir des identifiants uniques malgré la répétition.
- `no-steps.ldr` : 2 occurrences sans commande `0 STEP`, attendu `NO_STEPS`.

Utilisation : tests structurels, puis tests de rendu une fois la bibliothèque locale configurée. Les transformations sont des exemples de compilation/parser ; ne pas déduire de leur simplicité une prise en charge universelle des géométries LEGO Technic.

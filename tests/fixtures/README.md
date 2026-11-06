# Fixtures de tests P6

Fichiers **originaux** (CC0-1.0), créés pour les tests ; aucun set tiers. Le dossier `fixtures/` à la racine fait partie de la spécification v1.0 figée (`DOSSIER_MANIFEST.json`) : les fixtures ajoutées après la v1.0 vivent ici.

- `notice-sync-8.mpd` : 8 briques 3001, 2 étapes LDraw. Les tests les associent à 4 étapes d'une notice synthétique, avec 2 étapes sur une même page, un encadré et un multiplicateur « 2x », pour reproduire la forme mesurée sur 31040 (11 étapes LDraw contre 21 étapes officielles).
- `p8-trio.mpd` (P8) : un modèle principal de 4 briques (dont un sous-modèle) et un second modèle « tower » (3 briques) que rien n'utilise dans le fichier, pour la détection des constructions alternatives d'un même MPD.
- Pages OMR et réponses Rebrickable des tests P8 : **synthétiques**, écrites dans les tests (`tests/unit/online-sources.test.ts`, `tests/e2e/add-set.spec.ts`) ; aucune page réelle n'est enregistrée.

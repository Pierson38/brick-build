# 09 — Décisions, risques et questions à arbitrer

## Décisions déjà prises

- Projet personnel, mono-utilisateur, local sur Mac.
- Les sets visés sont les véritables références LEGO, importées par l'utilisateur.
- Les notices PDF sont importées manuellement ; ne pas mettre en place de téléchargement automatique.
- Deux modes : étapes 3D guidées à partir d'une structure disponible + montage libre accompagné d'une notice PDF locale lorsque les étapes manquent.
- Priorité absolue à la **jouabilité** : prendre/poser des briques, pas seulement faire défiler des étapes.
- Développer le moteur avant le catalogue.
- Stack TS / Next.js / Three.js / R3F / PDF.js, sous réserve de compatibilité documentée.

## Risques et parades

| Risque | Impact | Parade / garde |
|---|---|---|
| OMR sans `0 STEP` | High | Diagnostic + mode non guidé, éditeur futur |
| Sous-modèle = groupe et non brique | High | Parser structurel séparé, IDs path-based, spike |
| `LDrawLoader` fusionne des géométries | High | Vérification API réelle, rendu indépendant par occurrence |
| PDF et modèle ont des étapes différentes | High | Navigation indépendante, pas de fausse synchro |
| Pièces/variantes manquantes | Medium | Diagnostic précis, ne pas marquer rendu complet |
| Technic complexe et pièces flexibles | Medium | Hors MVP, tests ciblés ultérieurs |
| Fichiers importés malformés | High | Quotas, limites de profondeur, validation et erreurs |
| Confusion de droits sur sets/notices | High | Usage local, import manuel, pas de redistribution |
| Sauvegarde liée au mauvais modèle | High | Hash + versionnement + tests de restauration |
| Surinvestissement avant preuve de faisabilité | High | Lots courts, GO/NO-GO et démonstration à chaque phase |

## Points à vérifier au spike (ne pas supposer)

- Version actuelle de `three` et API précise de `LDrawLoader`, notamment exposition des étapes/occurrences.
- Stratégie réellement fonctionnelle de chargement local de la bibliothèque LDraw dans Next.js, sans réseau à l'exécution.
- Matrice/axes et composition sous-modèles selon fichiers de tests.
- Performance pratique des géométries séparées et modes de placement.
- Qualité d'un **vrai MPD OMR choisi et fourni par l'utilisateur** : toutes les références résolues ? étapes ? nombre d'occurrences ?
- Comportement Chrome et Safari avec PDF.js/worker en local.

## Questions reportées après le POC

- Souhaites-tu qu'on crée un éditeur de séquences de montage pour les MPD sans étapes ?
- Faut-il sauvegarder durablement les fichiers MPD et PDF eux-mêmes en IndexedDB, ou demander leur réimport ?
- Quel est le premier set réel de validation, après réussite des fixtures synthétiques ?
- Quel mode de manipulation doit être prioritaire : glisser-déposer libre, ou sélection de pièce puis « placer » avec ajustement automatique ?

Ces questions ne doivent pas bloquer le spike initial.

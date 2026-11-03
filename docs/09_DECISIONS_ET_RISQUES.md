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

## Journal — 03/11/2026, lot P0/P1 (spike LDraw)

| Hypothèse initiale | Constat / décision | Preuve |
|---|---|---|
| `LDrawLoader` pourrait fournir occurrences et étapes | Un groupe par brique, mais sans provenance de ligne ; **une pièce manquante fait échouer tout le modèle** ; `buildingStep` = compteur global qui mélange racine et sous-modèles. → Loader utilisé **par pièce+couleur** uniquement ; parser maison = source de vérité. | `docs/10_SPIKE_ET_LOT_P0_P1.md`, test E2E « missing part » |
| Étapes des sous-modèles | Stratégie `FLATTENED_STEPS` documentée (sous-modèle construit avant les pièces directes de l'étape, chaque copie séparément) ; jamais présentée comme la notice. | `tests/unit/parser.test.ts` |
| Un unique `0 STEP` final = étapes | Non : classé `NO_STEPS` (montage libre). | `tests/unit/parser.test.ts` |
| Drag 3D libre | MVP : plan horizontal + grille 10 LDU + niveau assisté (étages déduits des cibles), R = 90° autour de Y. Pas de rotation hors axe ni symétries. | E2E pointeur réel |
| Seuils de snap | 10 LDU / 10° (calibrés sur 2×4), à revoir sur un vrai modèle. | `tests/unit/engine.test.ts` |
| TypeScript 7.0 (latest) | TypeScript 6.0.3 retenu : TS 7 (compilateur natif) n'est pas validé avec l'outillage Next/Vitest. | `package.json` |
| Bibliothèque LDraw | Hors dépôt, via `LDRAW_LIBRARY_DIR` (`.env.local`, ignoré par Git), servie par une route locale validée (pas de `..`, extensions `.dat/.ldr`, realpath dans la racine). | `src/infra/ldraw/library-path.ts` |
| Dépôt Git | Il n'existait pas : `git init` + commit de la spec, dépôt GitHub **privé** `Pierson38/brick-build` créé avec accord, `main` poussé une fois ; travail sur worktree dédié. | `git log` |
| `next dev` génère `AGENTS.md` | Désactivé (`agentRules: false`). | `next.config.ts` |

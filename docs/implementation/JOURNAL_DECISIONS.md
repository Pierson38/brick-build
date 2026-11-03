# Journal des décisions d'implémentation

Ce journal **prolonge** `docs/09_DECISIONS_ET_RISQUES.md`, qui reste figé dans sa version de spécification v1.0 (traçabilité via `DOSSIER_MANIFEST.json`). Toute hypothèse de la spécification qui change est consignée ici, avec sa preuve.

## Journal — 03/11/2026, lot P0/P1 (spike LDraw)

| Hypothèse initiale | Constat / décision | Preuve |
|---|---|---|
| `LDrawLoader` pourrait fournir occurrences et étapes | Un groupe par brique, mais sans provenance de ligne ; **une pièce manquante fait échouer tout le modèle** ; `buildingStep` = compteur global qui mélange racine et sous-modèles. → Loader utilisé **par pièce+couleur** uniquement ; parser maison = source de vérité. | `docs/implementation/10_SPIKE_ET_LOT_P0_P1.md`, test E2E « missing part » |
| Étapes des sous-modèles | Stratégie `FLATTENED_STEPS` documentée (sous-modèle construit avant les pièces directes de l'étape, chaque copie séparément) ; jamais présentée comme la notice. | `tests/unit/parser.test.ts` |
| Un unique `0 STEP` final = étapes | Non : classé `NO_STEPS` (montage libre). | `tests/unit/parser.test.ts` |
| Drag 3D libre | MVP : plan horizontal + grille 10 LDU + niveau assisté (étages déduits des cibles), R = 90° autour de Y. Pas de rotation hors axe ni symétries. | E2E pointeur réel |
| Seuils de snap | 10 LDU / 10° (calibrés sur 2×4), à revoir sur un vrai modèle. | `tests/unit/engine.test.ts` |
| TypeScript 7.0 (latest) | TypeScript 6.0.3 retenu : TS 7 (compilateur natif) n'est pas validé avec l'outillage Next/Vitest. | `package.json` |
| Bibliothèque LDraw | Hors dépôt, via `LDRAW_LIBRARY_DIR` (`.env.local`, ignoré par Git), servie par une route locale validée (pas de `..`, extensions `.dat/.ldr`, realpath dans la racine). | `src/infra/ldraw/library-path.ts` |
| Dépôt Git | Il n'existait pas : `git init` + commit de la spec, dépôt GitHub **privé** `Pierson38/brick-build` créé avec accord, `main` poussé une fois ; travail sur worktree dédié. | `git log` |
| `next dev` génère `AGENTS.md` | Désactivé (`agentRules: false`). | `next.config.ts` |
| Journal dans `docs/09` | Le journal d'implémentation vit ici, et non dans `docs/09`, pour ne pas altérer la spécification v1.0 tracée par checksum (règle de `CLAUDE.md` appliquée par délégation documentée, à confirmer). | `docs/implementation/ECARTS_SPECIFICATION.md` |

## Journal — 03/11/2026, lot P5 (validation sur sets OMR réels)

| Hypothèse | Constat mesuré / décision | Preuve |
|---|---|---|
| Toute section MPD référencée est un sous-modèle | **Faux** : les OMR embarquent des pièces non officielles (`!LDRAW_ORG Unofficial_Part`, 31040 et 31045). Expansées, elles produisaient 28 et 99 fausses « pièces » faites de primitives. → Une section `Part/Subpart/Primitive/Shortcut`, ou une section `.dat` avec géométrie, est une **pièce feuille**. Son texte est transmis à LDrawLoader. | `tests/unit/omr-structures.test.ts`, rapport 31040 : 89 → 65 occurrences |
| R (90° autour de Y) suffit pour orienter les pièces | **Faux** : 24/65 cibles de 31040 et 13/270 de 31009 ont une autre orientation (pièce retournée, posée sur le côté, angle quelconque). → Touche **O** : on parcourt les orientations **présentes dans le modèle** pour cette pièce et cette couleur, sans révéler laquelle est attendue ; R s'applique par-dessus. | E2E pointeur 31040/31009 |
| Rotation exacte exigée | Les pièces symétriques (2×4 à 180°, 2×2 à 90°) étaient refusées dans une orientation physiquement identique. → Symétries **mesurées sur la géométrie chargée** (`yQuarterTurnSymmetries`) et acceptées par le snap. | tests unitaires, 19 poses équivalentes acceptées sur 31040 |
| Le clic pose là où le rayon touche le plan | Mesuré : la barre de pièces changeait de hauteur, donc le canevas aussi, et R3F utilisait une taille périmée pour le rayon (écart de 18–28 LDU sur environ 5 % des clics). → Barre de pièces à hauteur fixe ; le dépôt utilise la position **affichée** par l'aperçu. | E2E : 4 refus/69 → 0/65 |
| Ajout d'une dépendance npm | `npm i <paquet>` supprime les bindings natifs optionnels de rolldown du lockfile (bug npm/cli#4828). → Pour ajouter une dépendance : `rm -rf node_modules package-lock.json && npm i`, puis vérifier `node_modules/@rolldown/binding-*`. | lockfile P5 |
| Écarts déclarés au manifeste | L'ancien contrôle ne vérifiait que l'empreinte d'origine : une seconde modification d'un fichier déjà déclaré passait. → `currentSha256` obligatoire, contrôlé à chaque recette. | `npm run check:spec` |
| Journal dans `docs/09` | Décision du propriétaire : `docs/09` reste figé (v1.0), le journal vit ici ; `CLAUDE.md` corrigé et déclaré comme écart. | `spec-deviations.json` |

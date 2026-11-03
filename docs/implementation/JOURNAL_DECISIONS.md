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

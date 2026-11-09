# État initial de la recette (avant refonte)

- Branche `claude/brick-lab-ui-refonte-188be7`, worktree `.claude/worktrees/brick-lab-ui-refonte-188be7`, base `a1309a4` = `origin/main` (fetch du 09/11/2026).
- Machine : macOS 25.6.0, Apple M2 Pro, Node 24.5.0, Chromium 156 (Playwright 1.64.1).
- Bibliothèque LDraw : `~/Documents/brick-lab-data/ldraw` (`.env.local` créé dans le worktree selon le README, non versionné ; `npm run check:ldraw` OK).

## `npm run recette` — réussie (code 0)

| Étape | Résultat |
|---|---|
| `check:spec` | OK (manifeste de spécification intact) |
| `typecheck` | OK |
| `npm test` (Vitest) | 17 fichiers, **317 réussis, 1 ignoré** (318) |
| `npm run test:e2e` (Playwright, Chromium + contextes WebKit) | **86 réussis**, 0 échec, 0 ignoré, 19,2 min |

Les suites sur sets réels (`*-omr.spec.ts`) ont tourné : les fichiers 31040, 31009, 31039 sont présents dans le dossier de données. Aucun échec préexistant à signaler.

## `npm run perf` — réussie (build de production, port 3100)

| Set | Import → 1re image | Géométrie | FPS repos / orbite | Tas JS | Requêtes LDraw (dont 404) |
|---|---|---|---|---|---|
| 31040-1 | 1 131 ms | 546 ms | 60 / 60 | 26 Mo | 490 (171) |
| 31009-1 | 1 152 ms | 736 ms | 60 / 60 | 68 Mo | 812 (293) |

Moyenne sur 3 passes, ANGLE Metal (M2 Pro). Détail complet : `REFONTE/perf-avant.json`. Le test écrit aussi `~/Documents/brick-lab-data/proofs/p5/perf.json` (écrasé par ce passage ; la version du 04/11 a été copiée à part avant, hors dépôt).

**Seuil de non-régression retenu pour la phase 5** : import → 1re image ≤ ~1,2 s (± 10 %) et 60 FPS au repos et en orbite sur les deux sets.

## Couverture E2E manquante sur des parcours de l'inventaire

Phase 3 : couverte par `tests/e2e/filet-refonte.spec.ts` (6 tests, verts sur l'UI d'avant), sauf le panoramique et le zoom de la caméra (P2, P3), vérifiés à la main en phase 5 (le geste de molette n'a pas d'effet observable stable sans instrumenter la caméra).


- Mode hors ligne `BRICK_LAB_ONLINE=0` dans l'UI (Q11) : testé seulement en unitaire.
- Bibliothèque LDraw absente (Q10) : aucun E2E.
- Abandon dans l'atelier autonome (K10) et dans l'atelier bibliothèque (confirmation) : seulement indirect.
- Retirer une construction / un set (C19), vérifier les empreintes (C11), exporter les correspondances depuis le détail (C15).
- Raccourcis G (grille) et Q (axes locaux) (O14, O16), panoramique/zoom caméra (P2, P3).
- Éditeur : supprimer/monter/descendre une étape (M8), tout effacer + restaurer (M18, M19).

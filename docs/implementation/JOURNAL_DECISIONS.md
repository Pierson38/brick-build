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

## Journal — 04/11/2026, levée des conditions P5

| Hypothèse | Constat mesuré / décision | Preuve |
|---|---|---|
| Choisir le niveau au clavier (défaut : le plus bas compatible) | Coût mesuré, reproduit exactement par `scripts/level-baseline.ts` : 31009 libre = 1 194 appuis (ordre inverse) / 246 (ordre naturel) ; guidé = 7. → **Placement par les surfaces** : la pièce se pose **sur** la surface pointée (sol ou dessus d'une pièce), à la hauteur du niveau compatible le plus proche (±6 LDU, base réelle de la géométrie). PageUp/PageDown restent en secours (mode manuel, `A` pour revenir). | `surface.ts`, `tests/unit/surface.test.ts`, `tests/e2e/surface-placement.spec.ts` |
| La surface sous le centre suffit | Faux pour les pièces en porte-à-faux, fixées de côté ou posées avant leur support : 15 à 56 secours manuels mesurés sur 31040. → Repli : cible compatible **traversée par le rayon** (≤ 10 LDU), sauf si elle est cachée derrière une surface visible. L'aperçu s'y cale visiblement ; rien n'est posé sans clic. | E2E OMR v3 |
| Aimantation | Seulement sur un fantôme **compatible** survolé, ou si la pose serait acceptée par le moteur ; jamais vers une cible éloignée du pointeur. Rotation toujours vérifiée. | tests unitaires « far », « wrong orientation » |
| Fidélité d'inventaire 31009 | Comparaison par référence et couleur : 31 éléments décodés identiques, 2 divergences prouvées (+2 `3020` blanc, +2 `3069` blanc dans la boîte), 1 élément sans équivalent (4211087, visuel), minifig décomposée (+4). Bilan exact 271 − 5 + 4 = 270. Appartenance au modèle principal **non prouvée** → verdict **INDÉTERMINÉ**, avertissement dans l'UI. | `P5_INVENTAIRE_31009.md` |
| Afficher un verdict d'inventaire sans catalogue | Registre local des validations faites à la main, indexé par SHA-256 du fichier exact (2 entrées) ; tout autre fichier = « non vérifié ». Rien n'est téléchargé ni listé. | `known-validations.ts` |

## Journal — 04/11/2026, lot P6 (notice ↔ 3D synchronisée)

| Hypothèse | Constat mesuré / décision | Preuve |
|---|---|---|
| Une étape LDraw, une page PDF ou un numéro imprimé identifie une étape de notice | **Faux.** 31040 : 11 étapes LDraw contre 21 étapes imprimées sur 11 pages, et 3 modèles dans le même livret, chacun numéroté à partir de 1. 31009 : une séquence 1–25 est insérée entre les étapes 36 et 37 du livret 1. → Une étape de notice est une **entrée ordonnée** (livret, page PDF, numéro imprimé, encadré éventuel, multiplicateur). Le numéro n'est qu'un libellé. | `P6_ARCHITECTURE_NOTICE_SYNC.md` § 1 |
| 3-en-1 et plusieurs livrets | 31040 : 1 PDF, 3 modèles. 31009 : 1 PDF par modèle alternatif (vérifié sur les couvertures). → Le mapping relie **un** MPD (empreinte et modèle principal) à une liste ordonnée de livrets ; seules les pages du modèle concerné sont référencées. | idem |
| Reconnaître les étapes dans le PDF | Exclu de P6, comme demandé. La couche texte expose bien les numéros (`pdftotext`), mais aucune aide automatique n'est livrée : la saisie est **manuelle**, avec la provenance `manual` ou `verified`. | `mapping.ts` |
| Mode synchronisé = nouveau moteur | Non : c'est le moteur existant avec un `StepPlan` de type `INSTRUCTION_STEPS` et le mode `synced` (candidats = étape active). Les règles de pose ne changent pas. L'étape active reste **dérivée** des pièces posées, ce qui protège contre la corruption au retour arrière. | `engine.ts`, tests unitaires |
| Empreinte du PDF | SHA-256 des octets exacts, contrôlé à chaque ouverture. Un autre PDF (autre édition) n'est jamais utilisé à la place du livret. Les octets ne sont pas stockés. | E2E « booklet change » |
| Emplacements cachés en mode synchronisé | Mesuré sur 31040 : sans fantômes, le joueur scripté échoue à la 52e pièce (tuile posée sur la face arrière, cachée). → Emplacements de l'étape **affichés par défaut** comme en mode guidé, case toujours décochable. | essai réel 31040 |
| Lecture de la page dans un panneau de 400 px | À 100 %, une page de 31040 (419 pt) était coupée. → Ajustement à la largeur par défaut en mode synchronisé et dans l'éditeur ; le mode libre garde le zoom P5 (100 %). | capture `31040-1-synced-step8.png` (hors dépôt) |
| « 2e étape sur 3 de la page » | Les encadrés étaient comptés comme des étapes imprimées. → Position calculée sur les numéros imprimés distincts de la page. | `mapping.test.ts` |
| Progression v1 (P5) | Schéma v2 : mode `synced`, livret affiché, empreinte du mapping. La v1 est toujours relue, et une v1 ne peut pas déclarer le mode `synced`. | tests unitaires et E2E « P5 progress (schema v1) » |
| Fixtures P6 | `fixtures/` fait partie de la spec figée : la fixture P6 (originale, CC0) vit dans `tests/fixtures/`. Le mapping réel de 31040 reste hors dépôt (`brick-lab-data/mappings/`). | `tests/fixtures/README.md` |

# Documentation d'implémentation

Le dépôt contient deux familles de documents :

| Famille | Emplacement | Statut |
|---|---|---|
| **Spécification initiale v1.0** | `README.md`, `CLAUDE.md`, `PROMPT_CLAUDE_CODE.md`, `docs/01…09`, `fixtures/`, `.gitignore` | Référence, figée. Chaque fichier est tracé par SHA-256 dans `DOSSIER_MANIFEST.json`, contrôlé par `npm run check:spec`. |
| **Implémentation** | `docs/implementation/` | Évolue avec le code : notes de lots, journal des décisions, écarts, preuves. |

- [Note technique du spike et du lot P0/P1](10_SPIKE_ET_LOT_P0_P1.md)
- [Journal des décisions d'implémentation](JOURNAL_DECISIONS.md) (prolonge `docs/09`)
- [Écarts par rapport au manifeste de spécification](ECARTS_SPECIFICATION.md)
- [Preuves du lot P0/P1](preuves/lot-p0-p1/)
- [Validation P5 sur sets OMR réels](P5_VALIDATION_OMR.md)
- [Inventaire 31009 contre notice officielle](P5_INVENTAIRE_31009.md)
- [Recette humaine P5 (à faire par le propriétaire)](RECETTE_HUMAINE_P5.md)
- [P6 — notice ↔ 3D synchronisée : architecture et risques](P6_ARCHITECTURE_NOTICE_SYNC.md)
- [P6 — rapport, essai réel 31040, verdict](P6_RAPPORT.md)
- [Recette humaine P6 (à faire par le propriétaire)](RECETTE_HUMAINE_P6.md)
- [P7 — bibliothèque personnelle : architecture, sécurité, sauvegarde et restauration](P7_ARCHITECTURE_BIBLIOTHEQUE.md)
- [P7 — rapport, recette réelle 31040/31009, limites, verdict](P7_RAPPORT.md)
- [Recette humaine P7 (à faire par le propriétaire)](RECETTE_HUMAINE_P7.md)
- [P8 — import simplifié : sources, permissions, stratégie et risques](P8_ARCHITECTURE_IMPORT.md)
- [P8 — rapport, recette réelle, limites, verdict](P8_RAPPORT.md)
- [Recette humaine P8 (à faire par le propriétaire)](RECETTE_HUMAINE_P8.md)
- [Atelier — panneaux redimensionnables, notice ajustée, miniatures des pièces : rapport](UX_ATELIER_RAPPORT.md)
- [Recette humaine du lot UX atelier (faite par le propriétaire, 06/11/2026)](RECETTE_HUMAINE_UX_ATELIER.md)
- [Limitation connue : le montage libre n'est libre que dans l'ordre](LIMITATION_MONTAGE_LIBRE.md)
- [Véritable montage libre : architecture (cible du modèle ≠ pose du joueur)](MONTAGE_LIBRE_ARCHITECTURE.md)
- [Véritable montage libre : rapport, tests, mesures, verdict](MONTAGE_LIBRE_RAPPORT.md)
- [Recette humaine du véritable montage libre (faite : NO-GO, deux limitations)](RECETTE_HUMAINE_MONTAGE_LIBRE.md)
- [Corrections : hauteur libre et groupes (cause, tests, compatibilité)](MONTAGE_LIBRE_CORRECTIONS.md)
- [Recette humaine ciblée des corrections (faite : NO-GO, quatre problèmes)](RECETTE_HUMAINE_MONTAGE_LIBRE_CORRECTIONS.md)
- [Connexions, transformations et aimantation : note d'architecture](MONTAGE_LIBRE_CONNEXIONS.md)
- [Rotations 3 axes, manipulation directe, assemblages, aimant : rapport](MONTAGE_LIBRE_3D_RAPPORT.md)
- [Recette humaine des quatre problèmes (sans résultat transmis ; suite : manipulateur 3D)](RECETTE_HUMAINE_MONTAGE_LIBRE_3D.md)
- [Manipulateur 3D (gizmo) : conception et rapport](MONTAGE_LIBRE_GIZMO.md)
- [Recette humaine du manipulateur 3D (à faire par le propriétaire)](RECETTE_HUMAINE_MONTAGE_LIBRE_GIZMO.md)

## Démarrage développeur

Prérequis : macOS, Node ≥ 20.9 (testé 24.5), npm. Windows : préversion, voir le README racine (§ Windows) et le [journal](JOURNAL_DECISIONS.md#journal--08112026-prise-en-charge-de-windows-branche-featwindows-support).

1. Bibliothèque de pièces LDraw (une fois, hors dépôt) : télécharger `complete.zip` depuis https://library.ldraw.org/library/updates/complete.zip, le décompresser par exemple dans `~/Documents/brick-lab-data/` (dossier `ldraw/`), puis créer `.env.local` à la racine du projet :
   ```
   LDRAW_LIBRARY_DIR=/Users/<toi>/Documents/brick-lab-data/ldraw
   ```
   Licence : CC BY 4.0, voir `CAreadme.txt` dans la bibliothèque. Ne jamais la commiter.
2. `npm ci` puis `npx playwright install chromium`.
3. `npm run check:ldraw` vérifie la bibliothèque.
4. `npm run dev` → http://127.0.0.1:3000 (écoute sur 127.0.0.1 uniquement, télémétrie Next désactivée). La page d'accueil est « Ma collection » ; « Ajouter un set » est sur `/ajouter` ; l'atelier P5/P6 sans collection est sur `/atelier`.
   Facultatif (P8) : `REBRICKABLE_API_KEY=<ta clé>` dans `.env.local` pour afficher nom, année et nombre de pièces annoncé ; `BRICK_LAB_ONLINE=0` pour interdire tout accès Internet (l'import local reste complet).
5. Recette : `npm run recette` (typecheck + Vitest + Playwright).

Note technique du spike et limites : [10_SPIKE_ET_LOT_P0_P1.md](10_SPIKE_ET_LOT_P0_P1.md).

## Validation sur sets réels (P5)

Les modèles OMR et les notices restent hors dépôt, dans `~/Documents/brick-lab-data/` (ou `$BRICK_LAB_DATA`) :
`models/<set>/<set>.mpd`, `instructions/<set>/<set>_notice_<id>.pdf`. Sans eux, la spec `omr-validation` est ignorée (skip).

```bash
npm run compat-report -- ~/Documents/brick-lab-data/models/31040-1/31040-1.mpd
npx playwright test tests/e2e/omr-validation.spec.ts   # GPU, joueur scripté pointeur/clavier
npm run perf                                           # build de production, 3 passages, médiane
npx tsx scripts/level-baseline.ts <model.mpd>          # appuis PageUp/PageDown de l'ancien schéma (référence)
```

Ajouter une dépendance npm : `rm -rf node_modules package-lock.json && npm i`, puis vérifier que `node_modules/@rolldown/binding-*` existe (bug npm des dépendances optionnelles).

## Notice synchronisée (P6)

Les correspondances notice ↔ 3D sont saisies dans l'onglet **Correspondances**. Elles sont sauvegardées localement et exportables en `<modèle>.brick-mapping.json`. Le mapping réel de 31040 reste hors dépôt, dans `$BRICK_LAB_DATA/mappings/31040-1.brick-mapping.json`. Sans lui, la spec `instructions-sync-omr` est ignorée (skip).

```bash
npx vitest run tests/unit/mapping.test.ts
npx playwright test tests/e2e/instructions-sync.spec.ts        # fixtures synthétiques
npx playwright test tests/e2e/instructions-sync-omr.spec.ts    # essai réel 31040 (GPU)
```


## Bibliothèque personnelle (P7)

Données dans `~/Documents/brick-lab-data/library/` (ou `$BRICK_LAB_DATA_DIR/library/`). Sauvegarde et restauration : [P7_ARCHITECTURE_BIBLIOTHEQUE.md § 7](P7_ARCHITECTURE_BIBLIOTHEQUE.md#7-démarrage-sauvegarde-restauration).

```bash
npx vitest run tests/unit/library-store.test.ts tests/unit/library-api.test.ts
npx playwright test tests/e2e/library.spec.ts          # fixtures originales, dossier temporaire
npx playwright test tests/e2e/library-webkit.spec.ts   # Chromium ↔ WebKit (npx playwright install webkit)
npx playwright test tests/e2e/library-omr.spec.ts      # essai réel 31040/31009 (ignoré sans les fichiers)
```

Les suites E2E démarrent leur serveur sur un dossier temporaire et refusent un serveur déjà lancé sur un autre dossier : arrêter `npm run dev`/`npm run start` avant `npm run recette`.

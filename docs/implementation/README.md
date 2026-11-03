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

## Démarrage développeur

Prérequis : macOS, Node ≥ 20.9 (testé 24.5), npm.

1. Bibliothèque de pièces LDraw (une fois, hors dépôt) : télécharger `complete.zip` depuis https://library.ldraw.org/library/updates/complete.zip, le décompresser par exemple dans `~/Documents/brick-lab-data/` (dossier `ldraw/`), puis créer `.env.local` à la racine du projet :
   ```
   LDRAW_LIBRARY_DIR=/Users/<toi>/Documents/brick-lab-data/ldraw
   ```
   Licence : CC BY 4.0, voir `CAreadme.txt` dans la bibliothèque. Ne jamais la commiter.
2. `npm ci` puis `npx playwright install chromium`.
3. `npm run check:ldraw` vérifie la bibliothèque.
4. `npm run dev` → http://127.0.0.1:3000 (écoute sur 127.0.0.1 uniquement, télémétrie Next désactivée).
5. Recette : `npm run recette` (typecheck + Vitest + Playwright).

Note technique du spike et limites : [10_SPIKE_ET_LOT_P0_P1.md](10_SPIKE_ET_LOT_P0_P1.md).

## Validation sur sets réels (P5)

Les modèles OMR et les notices restent hors dépôt, dans `~/Documents/brick-lab-data/` (ou `$BRICK_LAB_DATA`) :
`models/<set>/<set>.mpd`, `instructions/<set>/<set>_notice_<id>.pdf`. Sans eux, la spec `omr-validation` est ignorée (skip).

```bash
npm run compat-report -- ~/Documents/brick-lab-data/models/31040-1/31040-1.mpd
npx playwright test tests/e2e/omr-validation.spec.ts   # GPU, joueur scripté pointeur/clavier
npm run perf                                           # build de production, 3 passages, médiane
```

Ajouter une dépendance npm : `rm -rf node_modules package-lock.json && npm i`, puis vérifier que `node_modules/@rolldown/binding-*` existe (bug npm des dépendances optionnelles).

# Écarts par rapport au manifeste de spécification v1.0

`DOSSIER_MANIFEST.json` liste les 17 fichiers du dossier de spécification et leur SHA-256. La version d'origine reste disponible dans le commit `b019989` (`git show b019989:<chemin>`).

`npm run check:spec` recalcule les empreintes. Chaque écart déclaré porte **deux** empreintes : celle du manifeste (`manifestSha256`) et celle du contenu actuel accepté (`currentSha256`). Le contrôle échoue :
- sur tout écart non déclaré ;
- sur toute modification ultérieure d'un fichier déjà déclaré (`MODIFIÉ`) ;
- sur une déclaration invalide (fichier hors manifeste, empreinte d'origine fausse, raison absente) ;
- sur une déclaration périmée (le fichier est redevenu identique à la spec).

Le manifeste v1.0 lui-même n'est jamais modifié.

## Écarts déclarés

| Fichier | Nature | Raison | Introduit |
|---|---|---|---|
| `.gitignore` | Ajout de 2 lignes en fin de fichier | `next-env.d.ts` et `*.tsbuildinfo` sont régénérés par Next.js/TypeScript à chaque exécution ; les versionner créerait du bruit. Aucune exclusion de la spec n'est retirée. | `f78d6b8` (rebasé en `738db13`) |
| `CLAUDE.md` | 1 ligne remplacée | La règle « Journal `docs/09` mis à jour » contredisait l'immuabilité de la spec v1.0. Décision du propriétaire (03/11/2026) : le journal vit dans `docs/implementation/JOURNAL_DECISIONS.md`. | lot P5 |
| `README.md` | Réécrit | Publication du dépôt (demande du propriétaire, 08/11/2026) : le README présente l'application, l'installation, les tests, les droits et l'absence d'affiliation LEGO. Le README v1.0 (dossier de démarrage) reste dans `b019989` ; sa table des documents et ses contraintes sont couvertes par `docs/01…09` et `docs/implementation/README.md`. Section « Windows (préversion) » ajoutée le 08/11/2026. | `docs/public-readme`, `feat/windows-support` |

## Écarts corrigés

| Fichier | Historique |
|---|---|
| `README.md` | Une section « Démarrage développeur » y avait été ajoutée (`2f9bff7`). Le fichier est restauré en v1.0 et la section a été déplacée dans `docs/implementation/README.md`. |
| `docs/09_DECISIONS_ET_RISQUES.md` | Un journal y avait été ajouté (`2f9bff7`). Le fichier est restauré en v1.0 et le journal a été déplacé dans `docs/implementation/JOURNAL_DECISIONS.md`. |

## Point arbitré

`CLAUDE.md` demandait de mettre à jour `docs/09_DECISIONS_ET_RISQUES.md` à chaque changement d'hypothèse, ce qui cassait la traçabilité de la spec. **Décision du propriétaire (03/11/2026)** : le manifeste v1.0 reste immuable, le journal d'implémentation est `docs/implementation/JOURNAL_DECISIONS.md`, et la consigne de `CLAUDE.md` est corrigée (écart déclaré ci-dessus).

## Renforcement du contrôle (lot P5)

Avant le lot P5, seule l'empreinte d'origine d'un écart était vérifiée : une deuxième modification de `.gitignore` serait passée inaperçue. C'est corrigé avec `currentSha256`. Test négatif exécuté : une ligne ajoutée à `.gitignore` fait sortir le contrôle en `MODIFIÉ`, code 1.

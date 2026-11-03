# Écarts par rapport au manifeste de spécification v1.0

`DOSSIER_MANIFEST.json` liste les 17 fichiers du dossier de spécification et leur SHA-256. La version d'origine reste disponible dans le commit `b019989` (`git show b019989:<chemin>`).

`npm run check:spec` recalcule les empreintes. Il échoue pour tout écart **non déclaré** dans `spec-deviations.json`, ou si une empreinte déclarée ne correspond plus.

## Écarts déclarés

| Fichier | Nature | Raison | Introduit |
|---|---|---|---|
| `.gitignore` | Ajout de 2 lignes en fin de fichier | `next-env.d.ts` et `*.tsbuildinfo` sont régénérés par Next.js/TypeScript à chaque exécution ; les versionner créerait du bruit. Aucune exclusion de la spec n'est retirée. | `f78d6b8` |

## Écarts corrigés

| Fichier | Historique |
|---|---|
| `README.md` | Une section « Démarrage développeur » y avait été ajoutée (`2f9bff7`). Le fichier est restauré en v1.0 et la section a été déplacée dans `docs/implementation/README.md`. |
| `docs/09_DECISIONS_ET_RISQUES.md` | Un journal y avait été ajouté (`2f9bff7`). Le fichier est restauré en v1.0 et le journal a été déplacé dans `docs/implementation/JOURNAL_DECISIONS.md`. |

## Point à arbitrer

`CLAUDE.md` demande de mettre à jour `docs/09_DECISIONS_ET_RISQUES.md` quand une hypothèse change. Pour respecter la traçabilité par checksum, le journal vit dans `docs/implementation/JOURNAL_DECISIONS.md`. Deux autres options sont possibles : publier une version 1.1 du manifeste qui intègre les évolutions, ou autoriser l'écart sur `docs/09`. **Décision du propriétaire attendue.**

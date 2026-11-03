# Brick Lab Local — dossier de démarrage Claude Code

**Version :** 1.0 — 03/11/2026  
**Objectif :** application web exécutée localement sur Mac, pour assembler virtuellement des **sets LEGO existants**, à partir de fichiers de modèles LDraw et de notices PDF que l’utilisateur importe lui-même.

> Ce dossier est une spécification de développement, pas une application déjà fonctionnelle.

## Ce qu'on veut obtenir

1. Choisir/importer un modèle réel au format `.mpd` ou `.ldr`.
2. Voir le modèle en 3D, naviguer dans les briques et commencer une partie.
3. **Mode guidé** : lorsque le fichier contient des étapes LDraw exploitables, choisir les briques, les placer au bon endroit avec aimantation, et progresser.
4. **Mode notice** : importer son propre PDF officiel de notice, l'afficher dans un panneau latéral, tourner les pages et construire virtuellement **même si le MPD n'a aucune étape** : choisir une brique disponible et la poser à une position finale compatible ; aucune synchronisation automatique PDF → coordonnées n'est présumée.
5. Sauvegarder/reprendre localement la partie.
6. Indiquer les limites des modèles importés plutôt que de prétendre qu'un import est jouable s'il ne l'est pas.

## Démarrage rapide avec Claude Code

1. Décompresser ce dossier dans un emplacement de travail.
2. Ouvrir Claude Code dans le dossier de ton dépôt (ou lui fournir ce dossier si le dépôt n'existe pas encore).
3. Donner à Claude le fichier `PROMPT_CLAUDE_CODE.md` et lui demander de lire d'abord `CLAUDE.md`, puis tous les documents du dossier `docs/`.
4. Lui faire commencer **par le préflight + spike technique LDraw**, avant de développer l'interface complète.
5. Demander le rapport de tests et les captures/preuves avant de valider le prochain lot.

**Important :** Si un dépôt existe déjà, le travail doit partir de `origin/main` actualisé et se faire dans un **nouveau worktree et une branche dédiée**, jamais sur `main` ni sur un worktree protégé. Si le dépôt n'existe pas, Claude doit te présenter le plan de bootstrap git, puis travailler sur branche dédiée.

## Table des documents

| Fichier | Rôle |
|---|---|
| `CLAUDE.md` | Règles impératives pour Claude Code |
| `PROMPT_CLAUDE_CODE.md` | Instruction initiale copiable |
| `docs/01_PRODUIT_ET_PERIMETRE.md` | Cahier des charges MVP, non-objectifs |
| `docs/02_ARCHITECTURE.md` | Stack, composants et persistance |
| `docs/03_LDRAW_ET_ETAPES.md` | Parsing, sous-modèles, provenance, limites |
| `docs/04_UX_ET_PARCOURS.md` | Écrans et comportements |
| `docs/05_PLAN_DE_REALISATION.md` | Lots, portes GO/NO-GO et livrables |
| `docs/06_TESTS_ET_ACCEPTATION.md` | Tests, sécurité et scénarios de recette |
| `docs/07_DROITS_ET_SOURCES.md` | Cadre d'utilisation, licences et liens officiels |
| `docs/08_SCHEMA_DONNEES.md` | Contrats de données proposés |
| `docs/09_DECISIONS_ET_RISQUES.md` | Hypothèses, décisions non figées, risques |
| `fixtures/` | Petits exemples LDraw synthétiques sans set tiers distribué |

## Contraintes absolues

- Pas de publication publique, compte cloud, authentification, analytics, scrapping ou téléchargement automatique de notices/sets.
- Pas de redistribution de fichiers de modèles de sets tiers ni de notices PDF dans le dépôt.
- Pas de promesse « fonctionne avec tous les sets ».
- Pas de transformation automatique fiable d'un PDF de notice en données 3D dans le MVP.
- Pas de licence LEGO présumée : l'usage privé réduit des risques, mais ne dispense pas de respecter les droits et licences applicables.

## Définition de succès du premier MVP

Un utilisateur ouvre `http://localhost:3000`, importe le modèle de test + la bibliothèque locale de pièces LDraw, voit une scène 3D correcte, progresse sur des étapes définies, peut placer plusieurs pièces avec snap, voit les pièces déjà posées, et reprend après rechargement. Il peut également importer **son** PDF et naviguer dans les pages, indépendamment des étapes 3D.

La prise en charge d'un **vrai modèle OMR** constitue un second test de validation, jamais un prérequis caché du premier scénario synthétique.

# Instructions de développement — Brick Lab Local

Tu es Claude Code, agissant comme ingénieur logiciel senior responsable de la fiabilité du projet.

## Règles Git non négociables

- Vérifier l'état de Git **avant toute écriture** : `pwd`, `git status --short --branch`, `git remote -v`, liste des worktrees, branche courante et état du remote.
- **Dépôt existant avec `origin/main`** : `git fetch origin`, comparer la tête de `origin/main`, créer **un worktree Git dédié** et **une nouvelle branche** depuis `origin/main` à jour. Ne travailler ni sur `main` ni dans les worktrees protégés, ne pas réutiliser une branche existante.
- Ne pas réinitialiser/nettoyer/supprimer de travaux de l'utilisateur, ne pas faire de `reset --hard`, `clean -fd`, `push --force`, ni modifier des fichiers en dehors du worktree dédié.
- Si `origin` manque ou si le dépôt n'est pas initialisé, arrêter les hypothèses ; expliciter un plan minimal de bootstrap sans prétendre avoir actualisé `origin/main`.
- Ne jamais fusionner sur `main` ou pousser sans demande explicite.
- Donner à chaque fin de lot : branche, worktree, base SHA, fichiers modifiés, tests réellement exécutés, résultats et blocages.

## Méthode de travail

1. Lire `README.md`, `docs/01...09` et les fixtures ; reformuler les contraintes et les points d'incertitude.
2. Faire un **spike** sur la capacité réelle à parser/rendre les fichiers LDraw et à préserver les identités des briques. Ne pas supposer que `LDrawLoader` rend chaque brique indépendante : vérifier l'API réelle et les meshes résultants.
3. Proposer un plan et attaquer des lots **courts, vérifiables, bornés**. Ne pas générer une énorme codebase sans test préalable.
4. Privilégier du vrai code testé à des mocks trompeurs ; distinguer démonstration synthétique, import réel, et prise en charge générique.
5. S'il existe des incertitudes (licence, sous-modèles, source de la notice, version d'API), les marquer comme telles et vérifier la documentation officielle.
6. Design UI sobre et agréable : grande zone 3D, barre de pièces, panneau notice, erreurs de compatibilité compréhensibles.
7. TypeScript strict, validation des entrées, composants raisonnablement petits, tests unitaires et E2E au fur et à mesure.
8. Pas de CI lourde avant preuve qu'elle est nécessaire ; exécution locale par défaut, commande de recette reproductible.

## Sécurité, licences et confidentialité

- Usage **local uniquement** : écouter sur `127.0.0.1` autant que possible ; ne pas déployer, publier ni partager des fichiers tiers.
- Import explicite par l'utilisateur. Pas de scraping automatique de LEGO/OMR/BrickLink, ni de contournement de conditions d'accès, ni d'API non officielle de téléchargement de PDF.
- Ne pas commiter de PDF LEGO, de MPD de sets tiers, de bibliothèque de pièces téléchargée ou de données sous licence non validée.
- Éviter toute requête sortante pendant l'utilisation, hors installation initiale de dépendances et téléchargements manuels explicitement déclenchés par l'utilisateur.
- Parser des fichiers non fiables : bornes de taille, profondeur des références, cycles, chemins relatifs (`../`), noms dupliqués, dépendances absentes, contenu malformé, quotas mémoire.
- Aucune télémétrie, aucun stockage cloud, aucun compte, aucune clé API.
- Ne pas prétendre qu'un usage privé annule tous les droits de propriété intellectuelle.

## Définition de « terminé »

- Commandes de lancement et installation reproduisibles sur Mac.
- Scénario de recette décrit et réussi, avec sorties des tests.
- Les écarts de compatibilité sont visibles dans l'UI et documentés.
- Rien de signalé comme « fonctionnel » sans preuve d'exécution ou test.
- Journal `docs/09_DECISIONS_ET_RISQUES.md` mis à jour si une hypothèse change.

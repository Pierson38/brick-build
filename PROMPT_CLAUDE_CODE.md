# PROMPT DE DÉMARRAGE — À FOURNIR À CLAUDE CODE

Tu es mon lead développeur full-stack/3D. Je veux créer **Brick Lab Local**, un site web personnel, exécuté uniquement en local sur mon Mac, pour **reconstruire virtuellement de vrais sets LEGO pièce par pièce**.

Je t'ai fourni un dossier de spécification. Commence par lire entièrement :

- `CLAUDE.md`
- `README.md`
- `docs/01_PRODUIT_ET_PERIMETRE.md`
- `docs/02_ARCHITECTURE.md`
- `docs/03_LDRAW_ET_ETAPES.md`
- `docs/04_UX_ET_PARCOURS.md`
- `docs/05_PLAN_DE_REALISATION.md`
- `docs/06_TESTS_ET_ACCEPTATION.md`
- `docs/07_DROITS_ET_SOURCES.md`
- `docs/08_SCHEMA_DONNEES.md`
- `docs/09_DECISIONS_ET_RISQUES.md`
- `fixtures/`

## Objectif utilisateur

Je choisis ou importe un set LEGO existant via un fichier `.mpd` / `.ldr` compatible avec LDraw, puis je peux le construire virtuellement : sélectionner les bonnes briques, les déplacer, les accrocher à leur emplacement, voir ma progression et reprendre ma construction.

Deux modes sont indispensables à terme :

1. **Mode étapes 3D** : afficher et faire jouer les étapes *réellement présentes* dans le fichier LDraw, quand elles sont exploitables ; ne pas inventer une correspondance exacte avec la notice LEGO.
2. **Mode notice PDF et montage libre** : importer localement mon PDF officiel LEGO, afficher les pages dans un panneau, et permettre la construction 3D à côté **même sans `0 STEP`**. L'utilisateur choisit une référence/couleur dans le stock restant et la pose à un emplacement final compatible ; l'ordre vient du PDF suivi humainement. Navigation PDF indépendante, sauf mapping manuel confirmé.

Le MVP ne doit pas bloquer sur la capacité de reconstruire automatiquement les notices PDF : ce n'est pas une fonctionnalité demandée au premier lot.

## Contraintes

- Utilisation personnelle et locale, pas de SaaS, pas de compte, pas de serveur public, pas de catalogue téléchargé automatiquement.
- Ne récupère pas ni ne diffuse automatiquement des PDF ou fichiers de sets tiers. L'utilisateur fournit ses propres fichiers.
- Stack préférée : Next.js, TypeScript strict, React Three Fiber, Three.js / LDrawLoader, PDF.js, Vitest, Playwright.
- Préserver chaque occurrence de brique et sa transformation cible ; les briques identiques restent des entités distinctes.
- Prévoir les sous-assemblages, les modèles sans étapes et les pièces manquantes ; dégrader proprement.
- Rendu 3D fluide sur Mac, sans suringénierie et sans infrastructure cloud.

## Git impératif

Départ d'un `origin/main` réellement mis à jour (`git fetch origin`), **nouvelle branche + worktree dédié**, jamais de travail sur `main` ni worktree protégé. Si le dépôt n'existe pas ou que `origin` manque, explicite-le et propose l'initialisation sûre du dépôt ; n'invente pas de remote ni de SHA. Ne merge/push rien sans mon GO.

## Première mission : PRÉFLIGHT + SPIKE, puis premier lot

1. Vérifie l'environnement Mac, Node, npm/pnpm, Git, worktrees et versions des bibliothèques.
2. Examine les fixtures et la spécification LDraw. Vérifie ce que la version retenue de `LDrawLoader` retourne réellement : hiérarchie, `buildingStep`, association entre géométrie et pièce d'origine, dépendances des briques.
3. Implémente un parser **structurel** testable pour `.mpd/.ldr` (sections `0 FILE`, références type 1, `0 STEP`, sous-fichiers), avec IDs stables et transformations composées. N'utilise pas le seul rendu Three.js comme source des étapes.
4. Fais afficher le modèle synthétique dans une scène 3D minimale. Si une bibliothèque officielle de pièces LDraw est nécessaire, documente son installation locale sans intégrer les fichiers téléchargés au dépôt.
5. Expose une première progression sur les étapes et un snap simple vers l'emplacement cible. Prévois également un mode montage libre pour `no-steps.ldr`, avec matching de cible par référence/couleur/position et sans étape inventée. Ne prétends pas supporter tout Technic.
6. Ajoute ensuite un panneau PDF pour le fichier local, avec page précédente/suivante et zoom ; ne pas coupler automatiquement page PDF et étape 3D.
7. Tests unitaires et E2E ciblés ; fais constater ce qui marche et ce qui est encore bloqué.

Avant chaque grosse implémentation, montre les compromis et les risques. Ne te contente pas de faire un squelette visuel. Un résultat minimal **réellement jouable** vaut mieux que 20 fonctions à moitié implémentées.

## Format de compte rendu attendu

- Préflight Git : branche/worktree/base SHA.
- Ce que tu as vérifié dans les sources et le code.
- Fichiers créés/modifiés.
- Tests réellement exécutés avec commandes et résultats.
- Capture d'écran ou preuve de rendu, si possible.
- Limites connues : import, étapes, performances, notices.
- Prochain lot recommandé, avec un GO/NO-GO argumenté.

Commence maintenant par le préflight et le spike. Tu es autorisé à créer le code **dans le nouveau worktree**, pas à modifier `main`.

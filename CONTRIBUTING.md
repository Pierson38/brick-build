# Contribuer à Brick Lab Local

Merci de ton intérêt ! Brick Lab Local est un projet personnel maintenu sur du temps libre : les réponses peuvent prendre quelques jours. Ce guide explique comment signaler un problème, proposer une idée ou envoyer une modification sans perdre de temps de part et d'autre.

En participant, tu acceptes le [code de conduite](CODE_OF_CONDUCT.md).

## Langue

Le projet, l'interface, la documentation et les messages de commit sont en **français**. Les issues et les PR en anglais sont acceptées ; la réponse sera en français.

## La règle d'or : aucun contenu tiers

Le dépôt ne doit **jamais** contenir — ni dans le code, ni dans une issue, ni dans une PR :

- une **notice** LEGO (PDF, captures ou extraits de pages) ;
- un **fichier de set tiers** (`.mpd`, `.ldr`), y compris ceux de l'[OMR LDraw](https://library.ldraw.org/omr) : donne plutôt le **numéro du set** et le **lien** vers sa page ;
- la **bibliothèque de pièces LDraw** ou une partie de celle-ci ;
- une clé d'API (Rebrickable ou autre) ou le contenu de ton `.env.local`.

Pour reproduire un problème, un petit fichier `.ldr` **écrit par toi** (quelques pièces, positions originales) est idéal : il pourra devenir une fixture CC0 dans `tests/fixtures/`.

## Signaler un bug

Ouvre une [issue](https://github.com/Pierson38/brick-build/issues/new/choose) avec le modèle « Bug ». Les informations qui font gagner le plus de temps :

- système (macOS, Windows en préversion), navigateur et version de Node.js (`node --version`) ;
- commit utilisé (`git rev-parse --short HEAD`) ;
- sortie de `npm run check:ldraw` ;
- numéro du set et source du fichier, étapes pour reproduire, résultat attendu et obtenu ;
- capture d'écran de l'application si utile (sans page de notice visible).

**Une faille de sécurité ne se signale pas dans une issue publique** : voir [SECURITY.md](SECURITY.md).

## Proposer une amélioration

Ouvre une issue « Amélioration » **avant** de coder quelque chose de conséquent : on vérifie ensemble que l'idée entre dans le périmètre (voir [`docs/01_PRODUIT_ET_PERIMETRE.md`](docs/01_PRODUIT_ET_PERIMETRE.md)) et respecte les principes du projet :

- **local uniquement** : serveur sur `127.0.0.1`, aucun compte, aucune télémétrie, aucun stockage cloud ;
- **réseau minimal et explicite** : aucune requête sortante sans action de l'utilisateur, hôtes autorisés listés, tailles et délais bornés ;
- **aucun téléchargement automatique** de notices, aucun scraping de LEGO, BrickLink ou de l'OMR ;
- **honnêteté sur les limites** : un modèle incomplet est signalé comme tel, jamais présenté comme jouable.

Les corrections de fautes, de documentation ou de petits bugs peuvent partir directement en PR.

## Préparer l'environnement

Suis la section [Installation](README.md#installation) du README (Node.js ≥ 20.9, bibliothèque LDraw, `.env.local`), puis :

```bash
npx playwright install chromium
```

```bash
npm run recette
```

`recette` enchaîne le contrôle de la spécification, `tsc --noEmit`, les tests unitaires et les tests E2E. Arrête `npm run dev` avant : les tests E2E démarrent leur propre serveur sur le port 3000.

## Envoyer une pull request

1. Forke le dépôt et crée une branche depuis `main` à jour, nommée selon son objet : `feat/…`, `fix/…`, `docs/…`, `chore/…`.
2. Garde la PR **courte et centrée sur un seul sujet** ; une grosse évolution se découpe en plusieurs PR.
3. Ajoute ou adapte les **tests** : unitaires (`tests/unit/`, Vitest) pour la logique, E2E (`tests/e2e/`, Playwright) pour un parcours. Une correction de bug vient avec un test qui échouait avant.
4. Lance `npm run recette` et indique dans la PR ce que tu as réellement exécuté et sur quel système.
5. Pour un changement visible, joins des captures avant/après.
6. Rédige les commits au format `type(portée): résumé en français`, par exemple `fix(montage-libre): l'aimant fonctionne pour une pièce prise dans le bac`.

La CI (GitHub Actions) relance le contrôle de la spécification, le typecheck et les tests unitaires sous macOS et Windows. Les tests E2E ne tournent pas en CI : ils ont besoin de la bibliothèque LDraw, à installer localement.

## Repères dans le code

- `src/domain/` : parseur LDraw, moteur de construction, connexions, import. **Sans Three.js ni React**, testable en isolation.
- `src/infra/`, `src/server/` : accès aux fichiers, persistance, réseau encadré (`src/server/net/safe-fetch.ts`), routes locales protégées par `src/server/http/guard.ts`.
- `src/components/`, `src/app/` : interface (Next.js App Router, React, `@react-three/fiber`).
- TypeScript **strict** ; toute entrée venant d'un fichier ou d'une requête est validée et bornée (taille, profondeur, cycles, chemins `../`, noms dupliqués).
- Pas de nouvelle dépendance sans justification dans la PR : chaque paquet doit fonctionner hors ligne et ne rien envoyer.

## Spécification figée et journal des décisions

Les fichiers de la spécification v1.0 (`docs/01…09`, `fixtures/`, `README.md`, `CLAUDE.md`, `PROMPT_CLAUDE_CODE.md`, `.gitignore`) sont tracés par empreinte SHA-256 dans `DOSSIER_MANIFEST.json` et contrôlés par `npm run check:spec`. Pour en modifier un, déclare l'écart dans `docs/implementation/spec-deviations.json` (empreinte actuelle comprise) et dans [`docs/implementation/ECARTS_SPECIFICATION.md`](docs/implementation/ECARTS_SPECIFICATION.md).

Quand une hypothèse du projet change, ajoute une entrée dans [`docs/implementation/JOURNAL_DECISIONS.md`](docs/implementation/JOURNAL_DECISIONS.md).

## Contributions assistées par IA

Le projet est développé avec Claude Code ; [`CLAUDE.md`](CLAUDE.md) contient les consignes données à l'assistant. Les contributions écrites avec une IA sont bienvenues, à condition que tu les aies **relues, comprises et testées** toi-même : tu restes l'auteur de ta PR.

## Licence des contributions

En envoyant une contribution, tu acceptes qu'elle soit publiée sous la [licence MIT](LICENSE) du projet. Les fixtures ajoutées doivent être des créations originales, publiées sous CC0-1.0.

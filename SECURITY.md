# Politique de sécurité

## Versions prises en charge

Le projet n'a pas encore de version publiée : seule la branche `main` est maintenue. Vérifie que le problème existe toujours sur le dernier commit de `main` avant de le signaler.

## Signaler une vulnérabilité

**N'ouvre pas d'issue publique.** Utilise le signalement privé de GitHub : onglet **Security** du dépôt, puis **Report a vulnerability** ([lien direct](https://github.com/Pierson38/brick-build/security/advisories/new)).

Indique si possible :

- le composant touché (parseur, import, bibliothèque personnelle, route locale, accès réseau…) ;
- les étapes pour reproduire, avec un fichier **écrit par toi** si un fichier est en cause (jamais de notice ni de modèle de set tiers) ;
- l'impact concret que tu as observé ;
- le commit testé et ton système.

Le projet est maintenu sur du temps libre : l'objectif est d'accuser réception sous une semaine et de te tenir informé jusqu'à la correction. Tu seras crédité dans l'avis publié, sauf si tu préfères rester anonyme.

## Périmètre

Brick Lab Local est une application **locale** : le serveur écoute sur `127.0.0.1` et lit des fichiers que l'utilisateur importe lui-même. Sont particulièrement intéressants :

- le **traitement de fichiers non fiables** : `.mpd`, `.ldr`, `.pdf`, `.brick-mapping.json`, sauvegardes de la bibliothèque (dépassement des bornes de taille ou de profondeur, cycles, consommation mémoire, chemins `../`, écriture hors du dossier de données) ;
- les **routes locales** (`src/app/api/`) : une page web d'une autre origine, ou un nom de domaine qui résout vers `127.0.0.1` (DNS rebinding), ne doit pouvoir ni lire ni modifier la bibliothèque (voir `src/server/http/guard.ts`) ;
- les **accès réseau sortants** (OMR, Rebrickable) : contournement de la liste d'hôtes autorisés, des tailles ou des délais (`src/server/net/safe-fetch.ts`), fuite de la clé Rebrickable, requête émise sans action de l'utilisateur ou malgré `BRICK_LAB_ONLINE=0`.

Hors périmètre :

- un serveur exposé volontairement sur le réseau (option `-H` modifiée, proxy, tunnel) ;
- une vulnérabilité d'une dépendance sans impact démontré sur Brick Lab Local (signale-la plutôt au projet concerné) ;
- les attaques qui supposent un accès préalable au compte ou aux fichiers de l'utilisateur.

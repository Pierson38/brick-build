# P8 — Import simplifié : sources, permissions, stratégie, risques

**Date :** 06/11/2026. Branche `feat/p8-simplified-import`, worktree dédié, base `origin/main` = `a4d2eeb` (P7 fusionné).

Rapport, tests et verdict : [P8_RAPPORT.md](P8_RAPPORT.md). Recette humaine : [RECETTE_HUMAINE_P8.md](RECETTE_HUMAINE_P8.md).

> Ce document n'est pas un avis juridique. Il résume ce qui a été **lu** sur les sites des sources le 06/11/2026 ; ce qui n'a pas pu être lu est marqué « non vérifié ».

## 1. Audit de l'import P7 (avant développement)

### 1.1 Problèmes relevés sur le parcours d'ajout

| # | Constat dans le code P7 | Conséquence pour l'utilisateur | Traité en P8 |
|---|---|---|---|
| A1 | Deux entrées sans lien : le dialogue « Ajouter un set » (`AddSetDialog`) et le bandeau de découverte (`DiscoveryPanel`) | Pour un nouveau set : chercher les fichiers soi-même, saisir le numéro et le nom, choisir les fichiers un par un | Page unique `/ajouter` : recherche par numéro, import rapide, mêmes règles |
| A2 | Le numéro est comparé en texte exact (`31040` ≠ `31040-1`) | Doublon de set possible ; la variante n'est jamais expliquée | Normalisation `31040` → `31040-1` (variante supposée et **affichée**), `31040-2` reste une autre boîte |
| A3 | Un fichier par sélecteur (modèle, puis notices, puis mapping) | 3 à 6 dialogues de fichiers par set | Glisser-déposer ou sélection **simultanée** de `.mpd`, `.ldr`, `.pdf`, `.brick-mapping.json` |
| A4 | Fichiers envoyés un par un **avant** la création du set, inscrits dans l'index à chaque envoi | Une annulation laisse des entrées dans l'index ; chaque envoi crée une sauvegarde d'index (20 conservées) | Préparation **hors index** (`library/staging/`), une seule écriture d'index à la confirmation |
| A5 | `createSet` refuse un modèle déjà présent (DUPLICATE) même si c'est le même import qui est rejoué | Après une réponse perdue, réessayer donne une erreur | Import **idempotent** : une construction déjà présente dans le set visé est signalée, pas dupliquée ; progression et mapping intacts |
| A6 | Ajouter un modèle alternatif à un set existant : seulement depuis le détail du set, un fichier à la fois | Parcours différent pour un 3-en-1 | La recherche détecte le set existant et propose d'y **ajouter** les constructions |
| A7 | Les pièces manquantes ne se voient qu'au rendu 3D, dans l'atelier | On découvre un modèle incomplet après l'avoir ajouté | Vérification des références de pièces contre la bibliothèque LDraw locale **avant** confirmation |
| A8 | Les PDF ne sont pas analysés (ni pages, ni livrets) ; toutes les notices vont à toutes les constructions (découverte) | Association incertaine présentée comme acquise | Nombre de pages lu ; association **proposée, non vérifiée** quand il n'y a qu'une construction, sinon cochée par l'utilisateur ; « liée par les correspondances » seulement si le mapping la nomme |
| A9 | Mapping : un seul fichier, choisi à la main ; la découverte ne cherche que pour les modèles de `models/` | Mapping existant non retrouvé pour un modèle importé autrement | Recherche des mappings par **empreinte exacte** du modèle et du modèle principal, dans le choix de l'utilisateur, la bibliothèque et `mappings/` ; état valide / incomplet / absent |
| A10 | Les modes ne sont connus qu'après l'ajout | On ne sait pas à l'avance si la notice synchronisée sera disponible | **Fiche de compatibilité** avant confirmation, mêmes règles que la collection |
| A11 | Aucune provenance ni licence conservée | La licence du fichier OMR n'est pas retrouvable dans la bibliothèque | Provenance par fichier (source, URL, licence et auteur lus **dans le fichier**) |
| A12 | `commit()` écrit la copie de sauvegarde **avant** `library.json` | Si la toute première écriture échoue, une sauvegarde existe sans index et la bibliothèque se bloque (« restaure la plus récente ») | Index écrit d'abord, copie ensuite (trouvé par le test d'interruption P8) |

### 1.2 Matrice

| | Contenu |
|---|---|
| **Déjà présent (P7)** | Stockage adressé par SHA-256 (`blobs/`), fichiers laissés en place (`external`), index validé en entier, écritures atomiques, historique, corbeille, révisions optimistes ; découverte en lecture seule ; validation du mapping contre le modèle ; garde HTTP (Host, Origin, en-tête applicatif) ; constructions multiples par set. |
| **Réutilisé tel quel** | `analyzeModel` (étapes, sous-modèles, diagnostics), `validateMapping`, `inventoryCheck` (31040/31009), `LibraryStore.makeBuild` / `checkMapping` / `writeRecord`, `discover()`, `guard()`, `resolveInside()`, `resolveLibraryFile()` (bibliothèque LDraw), pdf.js (déjà utilisé par le lecteur). |
| **Étapes manuelles supprimées** | Recherche des fichiers sur le disque (trouvés par numéro) ; saisie du nom (OMR, Rebrickable ou titre du modèle) ; saisie du numéro pour l'import rapide (lu dans le nom du fichier) ; sélection fichier par fichier (dépôt multiple) ; choix du mapping (présélection du plus vérifié qui est **valide**) ; aller-retour vers le détail pour un modèle alternatif ; téléchargement manuel du MPD de l'OMR (un clic). |
| **Restent manuels** | Télécharger la notice PDF sur LEGO.com (pas d'automatisation autorisée, § 2.2) ; indiquer quelle notice va avec quelle construction quand il y en a plusieurs ; saisir un mapping (P9). |
| **Sources externes** | OMR (sur clic) ; LEGO.com (lien seulement) ; Rebrickable (facultatif, clé locale). |
| **Limites** | Techniques et juridiques : § 2 et § 6. |
| **Modifications nécessaires** | Domaine : `set-number.ts`, `compatibility.ts`, `import-types.ts`. Serveur : `net/safe-fetch.ts`, `online/sources.ts`, `library/prepare.ts`, `parts-check.ts`, `pdf-info.ts`, `store.ts` (préparation + `importSet`), `schema.ts` (provenance facultative). Routes `/api/library/lookup`, `/lookup/online`, `/import/files`, `/import/omr`, `/import/prepare`, `/import`. UI : `/ajouter` (3 composants). Retirés : `AddSetDialog.tsx` (remplacé). Inchangés : moteur, atelier, éditeur de mapping, détail du set. |

## 2. Étude des sources externes (06/11/2026)

### 2.1 LDraw Official Model Repository — https://library.ldraw.org/omr

| Point | Constat |
|---|---|
| API officielle | **Aucune.** Le code du site est public (https://github.com/ldraw-org/ldraworg-library, licence MIT) : `routes/api.php` contient `// None yet` ; `https://library.ldraw.org/api` → 404. La recherche du site passe par Livewire (pas de paramètre GET). |
| Recherche par numéro | Une route existe dans `routes/web.php` : `/omr/set/{setnumber}` (`31040` et `31040-1` fonctionnent, 404 sinon). Page HTML, pas de JSON. L'URL canonique `/omr/sets/{id}` utilise un id interne sans rapport avec le numéro (31040 → 471). **Route non documentée publiquement : pas un contrat.** |
| Modèles d'un set | Liens `https://library.ldraw.org/media/omr_models/{id}/{set}-{n}[_{Nom-Alternatif}].mpd?v={horodatage}` ; un fichier par modèle (principal, alternatifs). 31040 : 3 fichiers (principal, Dune Buggy, Quad) ; 31009 : 3 ; 31153 : 1 (alternatifs absents de l'OMR). La page indique aussi « Main Model / Alternate Model », l'auteur, « Missing Parts ». |
| Format | MPD texte ; réponse 200 directe, `application/octet-stream`, sans redirection (Cloudflare). |
| Métadonnées, licence | En-têtes `0 Name:`, `0 Author:`, `0 !LDRAW_ORG Model`, `0 !LICENSE …`. Les fichiers réels annoncent **CCAL 2.0** (= CC BY 2.0) alors que la norme OMR actuelle demande CC BY 4.0 : la licence est donc **lue dans chaque fichier**, jamais supposée. Auteur de 31153 : la page et le fichier diffèrent (on garde celui du fichier). Page légale : https://www.ldraw.org/docs-main/licenses/legal-info.html (rien sur l'accès automatisé). |
| Accès automatisé | `robots.txt` : `User-agent: *` / `Disallow:` vide. Aucune limite documentée ; site derrière Cloudflare (blocage anti-bot possible en cas d'usage intensif, non vérifié). |
| Stabilité | Route et format présents dans le code actuel, mais non documentés ; le site a déjà été refondu (redirections héritées). |

### 2.2 Notices LEGO — https://www.lego.com/fr-fr/service/building-instructions

| Point | Constat |
|---|---|
| API | Aucune API publique documentée. La page utilise un endpoint interne `https://www.lego.com/api/graphql` : **non utilisé**. |
| Page d'un set | `…/building-instructions/{n}` → 200 en HTML ; un numéro inexistant renvoie aussi 200 (soft 404). |
| Livrets, langues | PDF sur `https://www.lego.com/cdn/product-assets/product.bi.core.pdf/{assetId}.pdf`. 31040 : 1 livret (fr-fr `6145903`, en-us `6145904` : **l'identifiant change avec la langue/région**) ; 31009 : 3 livrets ; 31153 : 3 livrets (50 à 89 Mo). Les identifiants ne se déduisent pas du numéro. Les livrets des alternatifs de 31040 ne sont pas listés (non vérifié dans le PDF). |
| Conditions | Conditions d'utilisation : téléchargement pour usage personnel non commercial ; redistribution interdite ; fouille de textes et de données réservée, y compris par « automated systems ». Fair Play : les notices sont protégées par le droit d'auteur. |
| **Conclusion** | Aucune autorisation de téléchargement automatisé, aucune API, identifiants instables → **lien vers la page officielle**, téléchargement par l'utilisateur, puis dépôt du PDF dans l'import rapide (un geste). Les liens PDF ne sont **pas** extraits de la page. |

### 2.3 Rebrickable API v3 — https://rebrickable.com/api/

| Point | Constat |
|---|---|
| API | Officielle et documentée (`/api/v3/docs/`). Clé personnelle (compte), en-tête `Authorization: key <clé>`. |
| Données utiles | `GET /api/v3/lego/sets/{set_num}/` (`31040-1`) : nom, année, nombre de pièces, URL. `/sets/{n}/alternates/` existe mais renvoie des MOC communautaires (et l'API a retiré les MOC en 2020) : **non utilisé**. |
| Limites | « en moyenne une requête par seconde », 429 puis risque de bannissement. La documentation conseille les CSV pour les usages en masse. |
| Conditions | Page `/terms/` refusée (403) à la lecture automatique : **non vérifiée**. Usage retenu : une requête par recherche, sur clic, avec cache. |
| **Conclusion** | **Facultatif.** Sans clé, tout fonctionne ; avec une clé dans `.env.local`, le nom, l'année et le nombre de pièces annoncé sont affichés **à titre indicatif** (jamais comparés au modèle comme s'ils étaient l'inventaire). |

## 3. Stratégie retenue

1. **Hors ligne d'abord.** La recherche par numéro lit la collection et le dossier de données (`models/<n>/`, `instructions/<n>/`, `mappings/` par empreinte), sans réseau. L'import local rapide n'a jamais besoin d'Internet. `BRICK_LAB_ONLINE=0` coupe toute requête sortante.
2. **OMR sur clic, tolérant.** « Chercher en ligne » lit **une** page (`/omr/set/<n>`), en extrait seulement les liens `.mpd` de ce numéro sur l'hôte OMR ; chaque fichier n'est téléchargé que sur un clic « Télécharger ». Si la page change de forme ou si le site est indisponible : message clair, lien « Ouvrir la page de l'OMR », et l'import rapide reste la voie de repli. Pas de crawl, pas de tâche de fond, pas de cache réseau.
3. **LEGO.com : lien seulement.** « Notice disponible sur LEGO.com, mais téléchargement manuel nécessaire. »
4. **Rebrickable facultatif** (clé locale, 1 requête/s au plus, cache 1 h, jamais renvoyée au navigateur ni journalisée).
5. **Aucune correspondance générée.** Un mapping n'est proposé que s'il existe déjà, pour l'empreinte exacte du modèle et son modèle principal.

### Écart avec la spécification figée — à valider par le propriétaire

`README.md` (« Pas de … téléchargement automatique de notices/sets ») et `docs/07` (« Ne pas aspirer automatiquement l'OMR ni LEGO.com ; le choix et le téléchargement des fichiers restent côté utilisateur ») datent de la v1.0. P8 fait télécharger **par le serveur local** un fichier OMR que l'utilisateur a **choisi et demandé par un clic**. Ce n'est ni une aspiration ni un téléchargement automatique (une page et un fichier par clic, rien en arrière-plan), mais le transfert n'est plus fait par le navigateur de l'utilisateur. Les notices LEGO restent entièrement manuelles. La spécification n'est pas modifiée ; l'écart est consigné ici et dans le journal des décisions. Si le propriétaire le refuse, `BRICK_LAB_ONLINE=0` ramène au comportement « lien + import manuel » sans autre changement.

## 4. Parcours

`/ajouter` (bouton « Ajouter un set » de « Ma collection ») :

1. **Recherche** : numéro (normalisé, variante supposée affichée) **ou** import local rapide (dépôt de plusieurs fichiers).
2. **Ressources** : dossier de données, OMR (bouton « Chercher en ligne », puis « Télécharger » par modèle), LEGO (lien), Rebrickable (si clé).
3. **Fichiers sélectionnés** : par modèle, ses constructions possibles (modèle principal coché ; autre modèle non utilisé du MPD proposé, non coché ; « Ce modèle existe déjà dans ta collection » désactivé), pièces, étapes, licence, source ; notices (pages, association par construction) ; correspondances (état). Détails avancés repliés (SHA-256, diagnostics, autre modèle principal).
4. **Compatibilité** : par construction, modes réellement disponibles et raisons.
5. **Confirmation** : nouveau set (numéro, nom pré-rempli) ou ajout au set existant ; puis « Construire « … » » ouvre l'atelier sans aucune sélection de fichier.

Règles de la fiche (`src/domain/library/compatibility.ts`) : étapes LDraw → guidé ; sans étapes → montage libre ; PDF → montage libre **avec** notice ; mapping valide **et** ses livrets sélectionnés → notice synchronisée ; un PDF seul ne donne jamais la notice synchronisée ; pièces absentes, bibliothèque non configurée, inventaire non vérifié (« indéterminé ») toujours affichés ; aucune construction sans modèle 3D.

## 5. Données et fiabilité

```
library/
  staging/<sha256>.<ext>        fichier préparé (vérifié), hors index, jusqu'à la confirmation
  staging/<sha256>.meta.json    nom d'origine, type, provenance
  blobs/…                       inchangé (P7)
  library.json                  + champ facultatif `provenance` par fichier
```

- **Vérification avant enregistrement** : taille (modèle 8 Mo, PDF 300 Mo, mapping 1 Mo), format réel (texte LDraw avec au moins une pièce, `%PDF-`, mapping valide), SHA-256 recalculé à la préparation **et** à la confirmation, pour toutes les origines.
- **Atomicité** : `importSet` lit et vérifie tous les fichiers, écrit les copies adressées par contenu (jamais d'écrasement), puis fait **une seule** écriture d'index (set + constructions + fichiers). Une erreur avant cette écriture ne laisse aucun set ; les copies déjà écrites sont réutilisées par l'essai suivant.
- **Réessai** : le même import rejoué rend le set existant (`alreadyPresent`) ; un mapping n'est écrit que si la construction n'en a pas (`mappingsKept` sinon) ; la progression n'est jamais touchée.
- **Doublons** : fichier identique → réutilisé (aucune copie) ; modèle + modèle principal déjà dans un autre set → refusé avec lien ; même numéro → ajout au set existant proposé par défaut, second set seulement sur choix explicite.
- **Fichiers du dossier de données** : référencés en place (`external`), jamais copiés ni modifiés.
- **Provenance** : `source` (`upload`, `discovery`, `omr`), `url` et `pageUrl` (OMR), `license` et `author` lus dans l'en-tête LDraw, `retrievedAtIso`. Validée à chaque lecture de l'index (URL `https://` seulement).
- **Compatibilité P7** : l'index garde `schemaVersion: 1` ; le champ `provenance` est facultatif (un index P7 se lit tel quel ; un serveur P7 lit un index P8 en ignorant ce champ). Progressions P5/P6/P7, mappings et mode synchronisé inchangés.
- **Zone de préparation** : fichiers non confirmés supprimés après 7 jours (copies temporaires de fichiers que l'utilisateur a toujours, ou téléchargements à refaire) ; fichiers confirmés retirés de `staging/` après l'import (ils sont dans `blobs/`).

## 6. Sécurité

| Menace | Parade | Test |
|---|---|---|
| Page d'un autre site qui ferait sortir le serveur (SSRF déclenché par CSRF) | Recherche en ligne et téléchargement en **POST** avec la garde d'écriture P7 (Origin = Host loopback + en-tête `x-brick-lab`) | `import-api.test.ts` |
| URL arbitraire envoyée au serveur | Le navigateur ne peut demander qu'un fichier `https://library.ldraw.org/media/omr_models/<id>/<nom>.mpd|.ldr` (sans requête, sans port, sans identifiants) ; la page lue est construite par le serveur à partir du numéro validé | `online-sources.test.ts`, `import-api.test.ts` |
| Hôte inattendu, redirection | Liste fermée d'hôtes (`library.ldraw.org`, `rebrickable.com`), HTTPS port 443 uniquement, IP littérale refusée ; chaque redirection revérifiée (2 au plus, aucune pour Rebrickable) | unitaires « redirect » |
| Adresses privées, DNS rebinding | Résolution DNS contrôlée **au moment de la connexion** (`lookup` de `https.request`) : refus si une adresse est privée, de bouclage, lien local, CGNAT, multidiffusion, réservée, IPv4 mappée en IPv6 (formes pointée et hexadécimale) ; la connexion utilise l'adresse vérifiée | unitaires « address », « DNS rebinding » |
| Réponse énorme ou lente | `Content-Length` refusé au-delà de la limite, flux coupé dès le dépassement (page 2 Mo, modèle 8 Mo, Rebrickable 256 Ko) ; délai global 10 à 30 s | unitaires « bounds » |
| Erreurs HTTP, coupure | Message clair, aucun fichier préparé, lien vers la page de la source | unitaires, E2E « source unavailable » |
| Contenu malveillant | Le fichier téléchargé suit exactement la validation d'un import (texte LDraw, au moins une pièce) ; rien n'est exécuté ; pdf.js côté serveur sans XFA ni polices système, page comptée seulement | unitaires, E2E « invalid files » |
| Fuite de la clé Rebrickable | Lue dans l'environnement local à chaque appel, envoyée seulement à `rebrickable.com`, jamais renvoyée ni journalisée (messages d'erreur génériques) | unitaire « key never returned » |
| Chemins | Références `discovered` limitées à `models/`, `instructions/`, `mappings/` (segments validés, `realpath`, pas de `library/`) ; `staged` par empreinte seulement | unitaire « hostile references » |
| Écoute réseau | Inchangé : `127.0.0.1` ; les réponses simulées des tests (`BRICK_LAB_NET_FIXTURES`) sont ignorées par le serveur de production | — |

## 7. Risques

| Risque | Probabilité | Effet | Parade |
|---|---|---|---|
| La page OMR change de forme | Moyenne (route non documentée) | Plus de modèles listés | Message « aucun fichier lu », lien vers la page, import rapide ; jamais de devinette |
| Cloudflare bloque les requêtes du serveur | Faible (une requête par clic) | « OMR indisponible » | Idem |
| Licence OMR différente selon les fichiers | Certaine (CCAL 2.0 / CC BY 4.0) | — | Licence lue dans le fichier et conservée |
| L'utilisateur associe une mauvaise notice | Moyenne (3-en-1) | Notice affichée inadaptée | Association marquée « proposée, non vérifiée » ; aucun mapping déduit ; modifiable dans le détail du set |
| Rebrickable change ses conditions | Inconnue (non vérifiées) | — | Facultatif, désactivé sans clé |
| `staging/` grossit (gros PDF déposés puis abandonnés) | Faible | Espace disque | Purge après 7 jours ; dossier documenté |

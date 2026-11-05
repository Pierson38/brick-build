# P7 — Bibliothèque personnelle : architecture, sécurité, sauvegarde

**Date :** 05/11/2026. Branche `feat/p7-personal-library`, base `origin/main` = `7f2e670` (P6 fusionné).

## 1. Besoin et contraintes

- Ouvrir l'application sur **« Ma collection »** et reprendre une construction **sans réimporter** le MPD, les notices ni le mapping.
- La **même** collection depuis Chrome et Safari, sur le même Mac.
- Fichiers uniquement sur le Mac, serveur sur `127.0.0.1`, aucune requête sortante, aucun compte.
- Les sauvegardes `localStorage` de P5/P6 restent lisibles et sont reprises sans perte.

## 2. Choix de stockage

| Option | Chrome + Safari partagés | Fichiers MPD/PDF durables | Verdict |
|---|---|---|---|
| `localStorage` / IndexedDB / OPFS (état P5/P6) | **Non** : un stockage par navigateur et par origine | IndexedDB oui, mais par navigateur | Écarté (c'est la contrainte à supprimer) |
| File System Access API | Non (absente de Safari) | Oui | Écarté |
| SQLite (`node:sqlite`) | Oui (côté serveur) | Oui | Écarté : quelques dizaines de sets, un index de quelques Ko ; un JSON lisible se sauvegarde, se compare et se restaure avec le Finder. Rien ne justifie une base binaire. |
| **Fichiers + index JSON côté serveur Next.js (Node `fs`)** | **Oui** | **Oui** | **Retenu** |

Le serveur Next.js local (déjà nécessaire pour servir la bibliothèque LDraw) lit et écrit dans un dossier de données. Les deux navigateurs parlent au même serveur ; ils voient donc la même collection.

## 3. Organisation sur le disque

Dossier de données : `~/Documents/brick-lab-data/` (variable `BRICK_LAB_DATA_DIR` pour un autre emplacement ; les tests utilisent un dossier temporaire).

```
brick-lab-data/
  models/ instructions/ mappings/      ← fichiers existants : lus seulement, jamais modifiés ni déplacés
  ldraw/                                ← bibliothèque de pièces (inchangé)
  library/                              ← tout ce que P7 écrit
    library.json                        index (sets, constructions, fichiers) — écriture atomique
    backups/library-<date>-r<rév>.json  copie de chaque version de l'index (20 dernières)
    blobs/<2 car.>/<sha256>.<ext>       fichiers importés par « Ajouter un set » (adressés par contenu)
    builds/<id>/progress.json           progression (charge utile P6 v2 inchangée) + révision
    builds/<id>/mapping.json            correspondances de cette construction + révision
    builds/<id>/thumbnail-<sha>.png     miniature rendue localement
    builds/<id>/history/                versions remplacées (30 dernières par type)
    trash/<date>-<id>/                  constructions retirées de la collection (rien n'est effacé)
    tmp/                                imports en cours
```

### Modèle de données

- **Fichier** : identifié par son **SHA-256** ; type (`model`, `pdf`, `mapping`), taille, nom d'origine, emplacement `blob` (copie de la bibliothèque) ou `external` (laissé en place, chemin relatif au dossier de données).
- **Set** : numéro et nom modifiables. Le numéro **n'est pas une identité** (deux sets peuvent porter le même numéro, sur confirmation).
- **Construction** : un set en a une ou plusieurs (modèles alternatifs d'un 3-en-1). Identité propre (`id`), et surtout **(SHA-256 du modèle, modèle principal)** : c'est contre cela que la progression et le mapping sont validés. Notices associées (liste ordonnée), instantané des diagnostics du parseur pris à l'ajout.
- **Progression** : exactement le `LocalBuildProgress` P6 (schéma v2, v1 relue), enveloppé dans `{ revision, savedAtIso, source }`.
- **Mapping** : le `brick-lab-instruction-mapping` P6, même enveloppe.

### Fichiers déjà présents (31040, 31009)

« Ma collection » propose les sets trouvés dans `models/<set>/`, `instructions/<set>/` et `mappings/`. Les mappings sont reconnus par **l'empreinte du modèle qu'ils contiennent**, pas par leur nom ; le plus vérifié est présélectionné (31040 : `31040-1.brick-mapping.json`, 24/24 vérifiées, plutôt que la version préparée 0/24). L'ajout **référence les fichiers en place** (aucune copie, aucun déplacement) ; seul le mapping (7 Ko) est recopié dans `builds/<id>/mapping.json`, car il devient modifiable dans l'éditeur sans toucher l'original.

## 4. Réutilisation de P5/P6 (pas de logique dupliquée)

- `BrickLabApp` reçoit un **`BuildStore`** : `browserStore` (localStorage, atelier sans collection, comportement P5/P6 inchangé) ou `libraryBuildStore` (API locale). Restauration, validation de la progression (`restoreProgress`), validation du mapping (`validateMapping`), repli explicite en montage libre, plan synchronisé : **code P5/P6 inchangé**.
- `LibraryAtelier` prépare l'ouverture : contrôle SHA-256 de chaque fichier, chargement du modèle et des notices (objets `File` passés à `useNotice.open`), reprise des sauvegardes du navigateur, puis monte `BrickLabApp`.
- Le serveur réutilise le parseur (`analyzeModel`) pour les diagnostics et pour refuser une progression ou un mapping qui ne correspond pas au modèle.

## 5. Sécurité

| Menace | Parade | Test |
|---|---|---|
| Accès réseau | `next dev/start -H 127.0.0.1` | — |
| Page web d'un autre site qui écrit dans la bibliothèque (CSRF) | Écritures : `Origin` = `http://<Host>` **et** en-tête `x-brick-lab: 1` (impossible sans pré-vol CORS, jamais accepté) ; `Sec-Fetch-Site` ≠ `cross-site`/`same-site` | unitaires `library-api`, E2E iframe sandbox → « blocked » |
| DNS rebinding (`evil.example` → 127.0.0.1) qui lirait les PDF | `Host` doit être `127.0.0.1`, `localhost` ou `[::1]`, y compris en lecture | unitaires, E2E |
| Chemins arbitraires / traversée | Le client ne fournit **jamais** de chemin ; identifiants validés (`[a-z0-9-]`, SHA-256 hex). Chemins stockés validés segment par segment (pas de `..`, `/` initial, `\`, fichier caché), résolus par `realpath` et contrôlés **dans** la racine ; découverte sans suivre les liens symboliques, limitée à `models/`, `instructions/`, `mappings/` ; `library/` interdit comme fichier externe | unitaires « hostile paths », E2E |
| Index modifié à la main | `library.json` relu et validé **en entier** à chaque opération (types, bornes, intégrité référentielle, `__proto__`) ; s'il est invalide, **aucune écriture** | unitaire « damaged index » |
| Fichier remplacé / mauvaise notice | SHA-256 recalculé à chaque ouverture (serveur **et** navigateur) ; réparation acceptée seulement avec la même empreinte | unitaires, E2E « modified or missing » |
| Taille | modèle 8 Mo, PDF 300 Mo, mapping 1 Mo, miniature 2 Mo, corps JSON 2 Mo ; import en flux, refus dès le dépassement | unitaires |
| Type | extension + contenu (`%PDF-`, texte LDraw sans octet nul et avec au moins une pièce, mapping valide, PNG) | unitaires |
| Corruption à l'écriture | fichier temporaire + `fsync` + `rename` + `fsync` du dossier ; copie de chaque version de l'index | unitaire « interrupted write » |
| Écrasement silencieux | révision optimiste : une écriture fondée sur une révision périmée est **refusée** (409), jamais fusionnée ; versions remplacées gardées dans `history/` ; blobs créés par `link` (jamais d'écrasement) | unitaires, E2E « two tabs » |
| Suppression | « Retirer » demande une confirmation, déplace dans `trash/` ; « Abandonner » (bibliothèque) demande une confirmation et garde la progression dans `history/` | unitaires, E2E |
| Fichiers tiers | jamais modifiés ni déplacés (mtime vérifié en test) | unitaire « discovery » |

En-têtes ajoutés à toutes les réponses du serveur de production (pas en `next dev`, où cette règle provoquait une boucle de rechargement) : `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.

## 6. Performances (mesurées)

- Index : relu à chaque requête (quelques Ko), < 5 ms.
- Liste de la collection : existence et taille des fichiers seulement ; le modèle (≤ 50 Ko) est haché et analysé pour valider le mapping (analyse mise en cache par empreinte).
- SHA-256 complet à l'ouverture d'une construction et dans le détail d'un set : les 4 PDF existants (22 Mo) en quelques dizaines de ms.
- Découverte du dossier réel (8 modèles, 4 PDF, 2 mappings) : **130 ms** (empreintes mises en cache par taille + date).
- Miniatures : rendues dans le navigateur à partir du modèle 3D (WebGL), une à la fois, puis enregistrées en PNG ; aucune image téléchargée.

## 7. Démarrage, sauvegarde, restauration

```bash
npm ci
npm run build
npm run start            # http://127.0.0.1:3000 → « Ma collection »
```

**Sauvegarder** : copier le dossier `~/Documents/brick-lab-data/` (au minimum `library/`, plus `models/`, `instructions/`, `mappings/` si des fichiers y sont référencés « laissés en place »). Time Machine le fait déjà s'il couvre `Documents`. Arrêter le serveur pendant la copie pour avoir un instantané cohérent.

**Restaurer la collection** : arrêter le serveur, remettre le dossier `library/` (et les fichiers externes à leur place), relancer.

**Restaurer une version de l'index** (`library.json` abîmé ou supprimé : l'application le signale et n'écrit plus rien) :

```bash
cd ~/Documents/brick-lab-data/library
ls -1 backups | tail -3                       # versions les plus récentes
cp library.json library.json.abime 2>/dev/null # garder la version abîmée
cp backups/<la plus récente>.json library.json
```

**Restaurer une progression ou un mapping** : `builds/<id>/history/` contient les versions remplacées ; copier celle voulue sur `progress.json` / `mapping.json`, serveur arrêté.

**Récupérer un élément retiré** : `trash/<date>-<id>/removed.json` décrit le set, les constructions et les fichiers ; le dossier de la construction contient sa progression et son mapping.

**Fichier externe déplacé ou modifié** : le détail du set le signale (« introuvable », « modifié (empreinte) ») ; « Réparer » accepte le fichier d'origine (même SHA-256) et en garde une copie dans `library/blobs/`.

**Sauvegardes du navigateur (P5/P6)** : jamais effacées. À l'ouverture d'une construction dont le modèle a la même empreinte, la progression (et le mapping) du navigateur sont repris dans la bibliothèque si elle n'en a pas ; si les deux diffèrent et que le navigateur est plus récent, l'application demande laquelle reprendre.

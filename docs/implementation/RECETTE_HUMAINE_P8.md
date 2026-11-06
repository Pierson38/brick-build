# Recette humaine P8 — à faire par le propriétaire (Mac, Chrome puis Safari)

> Les tests automatisés simulent l'OMR et pilotent la souris par script. La recette réelle de Claude a été faite dans un dossier **isolé**. Ce protocole vérifie le parcours sur ta vraie collection, avec ton accord à chaque ajout.

Durée estimée : 25–35 min. Architecture : [P8_ARCHITECTURE_IMPORT.md](P8_ARCHITECTURE_IMPORT.md). Rapport : [P8_RAPPORT.md](P8_RAPPORT.md).

## 0. Préparation

```bash
cd <worktree feat/p8-simplified-import>
npm ci
npm run build
npm run start
```

- Copie de sécurité **avant** la recette (le serveur arrêté) :
  ```bash
  tar -czf ~/Documents/brick-lab-data/backups-p7/library-$(date +%Y-%m-%dT%H-%M-%S)-avant-recette-p8.tar.gz -C ~/Documents/brick-lab-data library
  ```
- Facultatif : ajoute `REBRICKABLE_API_KEY=<ta clé>` dans `.env.local` (jamais commité) pour voir le nom, l'année et le nombre de pièces annoncé. Sans clé, tout fonctionne.
- Choisis un set **pas encore dans ta collection**, présent sur l'OMR, par exemple **31045** (Ocean Explorer, 213 pièces) ou **31028** (Sea Plane, 53 pièces). Télécharge si tu veux sa notice PDF sur LEGO.com au moment indiqué (§ 2.5).

## 1. Non-régression de la collection

| # | Action | Attendu | OK/KO |
|---|---|---|---|
| 1.1 | Ouvrir http://127.0.0.1:3000 dans **Chrome** | « Ma collection » : 31040 et 31009 avec leur progression habituelle | |
| 1.2 | 31040 → « Reprendre » | Notice synchronisée, même étape, même page, livret ouvert sans import | |
| 1.3 | Revenir à la collection | Rien n'a changé | |

## 2. Ajouter un nouveau set par son numéro (critère principal)

| # | Action | Attendu | OK/KO |
|---|---|---|---|
| 2.1 | « Ajouter un set » → saisir `31045` → « Rechercher » | « Lu comme 31045-1 (variante -1 supposée…) » ; dossier de données : un modèle s'il est déjà dans `models/31045-1/`, sinon « rien pour ce numéro » | |
| 2.2 | « Chercher en ligne (OMR) » | « N modèle(s) 3D sur l'OMR, dont … alternatif(s) » ; liste principal + alternatifs ; ligne LEGO « Notice disponible sur LEGO.com, mais téléchargement manuel nécessaire » | |
| 2.3 | « Télécharger » le modèle principal (si le modèle était déjà trouvé dans `models/`, c'est le même fichier : « déjà… ») | Carte du modèle : pièces, étapes, auteur, **licence lue dans le fichier**, « téléchargé depuis l'OMR » | |
| 2.4 | Fiche de compatibilité | Mode(s) réellement disponibles ; pièces absentes de ta bibliothèque LDraw listées s'il y en a ; « Inventaire indéterminé » | |
| 2.5 | « Ouvrir la page LEGO ↗ », télécharger la notice, la **déposer** dans « Import local rapide » | Notice listée avec son nombre de pages, « association proposée, non vérifiée » ; la fiche dit « Montage libre avec notice » et « Notice synchronisée indisponible : aucune correspondance validée » | |
| 2.6 | Facultatif : télécharger aussi un modèle alternatif | Deuxième construction (nommée d'après l'OMR) ; « Plusieurs constructions : coche pour chaque notice… » | |
| 2.7 | Vérifier le nom proposé, « Ajouter à ma collection » | « Ajouté à ta collection » ; bouton « Construire « … » » | |
| 2.8 | « Construire » → « Commencer — mode guidé » (ou montage libre), poser quelques pièces | « Enregistré dans la bibliothèque » | |
| 2.9 | « ← Ma collection » | Nouvelle carte avec miniature, x/N pièces, « En cours » | |

## 3. Reprise et doublons

| # | Action | Attendu | OK/KO |
|---|---|---|---|
| 3.1 | Quitter Chrome, arrêter le serveur (Ctrl+C), `npm run start`, rouvrir | Même carte, même progression | |
| 3.2 | « Reprendre » | « Progression restaurée », sans aucune sélection de fichier | |
| 3.3 | « Ajouter un set » → `31045` → « Chercher en ligne » → « Télécharger » le principal | « Ce modèle existe déjà dans ta collection » (case désactivée) ; « Ce set est déjà dans ta collection » ; proposition d'ajouter une construction au set existant | |
| 3.4 | Même chose dans **Safari** | Même collection, même progression ; mêmes messages | |

## 4. Import local rapide (sans Internet)

| # | Action | Attendu | OK/KO |
|---|---|---|---|
| 4.1 | Couper le Wi-Fi | — | |
| 4.2 | « Ajouter un set » → déposer d'un coup un `.mpd`, un ou deux `.pdf` et, si tu en as, un `.brick-mapping.json` | Tout est analysé ; un mapping d'un autre modèle est refusé avec la raison ; un mapping valide et ses notices donnent « Notice synchronisée disponible » | |
| 4.3 | « Chercher en ligne » pendant la coupure | « OMR indisponible… » et lien vers la page : rien d'autre ne se bloque | |
| 4.4 | « Annuler » (revenir à la collection) sans confirmer | Rien n'a été ajouté à la collection | |

## 5. Retour arrière (si besoin)

Arrêter le serveur, mettre de côté le dossier `library/` actuel (ne pas le supprimer), puis :

```bash
tar -xzf ~/Documents/brick-lab-data/backups-p7/<archive avant-recette-p8>.tar.gz -C ~/Documents/brick-lab-data
```

Note les écarts (capture, message exact) dans le tableau ; ils seront traités avant toute fusion.

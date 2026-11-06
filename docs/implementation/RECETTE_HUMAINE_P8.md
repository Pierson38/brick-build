# Recette humaine P8 — production, Chrome puis Safari (à faire par le propriétaire)

> Les tests automatisés simulent l'OMR et pilotent la souris par script ; la recette réelle de Claude (31045) a été faite dans un dossier **isolé**. Ici, tout se passe sur **ta vraie collection**, avec le serveur de **production**. Le téléchargement OMR sur clic est approuvé (06/11/2026, cadre dans [P8_ARCHITECTURE_IMPORT.md](P8_ARCHITECTURE_IMPORT.md) § 3). La PR #5 n'est pas fusionnée.

Durée estimée : 40–50 min. Rapport : [P8_RAPPORT.md](P8_RAPPORT.md).

## 0. État avant la recette et sauvegarde (fait par Claude le 06/11/2026, 18:17)

**État vérifié** (lecture seule de `~/Documents/brick-lab-data/library/`) :

| Élément | Valeur de référence |
|---|---|
| Index | révision 2, 2 sets, 2 constructions, 5 fichiers, tous présents et d'empreinte SHA-256 correcte |
| 31040-1 Desert Racers | 65 pièces, **25/65 posées**, mode **notice synchronisée**, page **6**, livret 6145903, correspondances **24/24 vérifiées** (valides) ; modes : synchronisé, guidé, libre |
| 31009-1 Small Cottage | 270 pièces, **aucune progression**, notice 6038244 ; modes : guidé, libre |
| Fichiers des sets | laissés en place dans `models/`, `instructions/`, `mappings/` |

**Sauvegarde** : `~/Documents/brick-lab-data/backups-p8/library-2026-11-06T18-17-15-avant-recette-p8.tar.gz` (dossiers `library/` et `mappings/`, SHA-256 de l'archive `80c14800…bbe8`), **vérifiée** par extraction séparée : 33 fichiers identiques. Inventaire des empreintes de `library/`, `models/`, `instructions/`, `mappings/` : `backups-p8/donnees-2026-11-06T18-17-15.sha256`.

**Contrôle du build de production** (sans rien modifier, `library.json` inchangé) : écoute sur `127.0.0.1:3000` uniquement, bibliothèque LDraw configurée, `/ajouter` répond, 31040 propose bien le mode synchronisé (25/65), 31009 guidé/libre, aucun problème signalé ; recherche en ligne refusée (403) sans l'en-tête de l'application.

> Si tu as joué depuis 18:17, refais une sauvegarde (§ 6, première commande) avant de commencer.

## 1. Lancement (production)

```bash
cd ~/Documents/brick-build-worktrees/p8-simplified-import
npm run build
npm run start
```

Le terminal affiche `http://127.0.0.1:3000`. Ouvre-le dans **Chrome**. (Facultatif : `REBRICKABLE_API_KEY=<ta clé>` dans `.env.local` avant `npm run start` pour voir le nom, l'année et le nombre de pièces annoncé.)

**Set conseillé : 31039 Blue Power Jet** (Creator 3-en-1) : présent sur l'OMR avec son modèle principal et deux alternatifs (Helicopter, Speedboat), **absent** de ta collection et de ton dossier `models/`. Remplaçant : 31038 Changing Seasons. (Les sets 31027, 31028, 31031, 31045… sont déjà dans `models/` : leur fichier serait trouvé localement et le clic OMR ne ferait pas de nouvelle copie.)

## 2. Non-régression 31040 et 31009 (point 8)

| # | Action | Attendu | OK/KO |
|---|---|---|---|
| 2.1 | Page d'accueil | « Ma collection » : 31040 « 25/65 pièces posées », En cours ; 31009 « 0/270 », Jamais commencé | |
| 2.2 | 31040 → « Reprendre » | « Progression restaurée : 25/65 » ; mode **Notice synchronisée** ; page 6 ; livret ouvert **sans sélection de fichier** | |
| 2.3 | Poser 1 ou 2 pièces, « ← Ma collection » | « Enregistré dans la bibliothèque » ; la carte suit | |
| 2.4 | 31009 → « Construire » | Modèle (270 pièces) et notice ouverts sans import ; inventaire « indéterminé » toujours signalé | |

## 3. Nouveau set par son numéro (points 1 à 4)

| # | Action | Attendu | OK/KO |
|---|---|---|---|
| 3.1 | « Ajouter un set » → `31039` → « Rechercher » (point 1) | « Lu comme 31039-1 (variante -1 supposée…) » ; Dossier de données : « rien pour ce numéro » ; ligne LEGO « Notice disponible sur LEGO.com, mais téléchargement manuel nécessaire » | |
| 3.2 | Essai : `31039; x` puis `31039-2` | Le premier est refusé (« n'est pas un numéro de set ») ; le second est lu comme une **autre** boîte (31039-2) ; revenir à `31039` | |
| 3.3 | « Chercher en ligne (OMR) » (point 2) | « 3 modèle(s) 3D sur l'OMR, dont 2 alternatif(s) » ; principal puis Helicopter, Speedboat, avec l'auteur | |
| 3.4 | « Télécharger » le **modèle principal** seulement | « téléchargé ✓ » ; une carte : nom du fichier, taille, « téléchargé depuis l'OMR », **auteur et licence lus dans le fichier**, pièces, étapes LDraw | |
| 3.5 | Facultatif : « Télécharger » un alternatif | Deuxième construction nommée d'après l'OMR (« Helicopter »…) ; message « Plusieurs constructions : coche pour chaque notice… » | |
| 3.6 | « Ouvrir la page LEGO ↗ » (point 3) : télécharge la notice du modèle principal dans ton navigateur, puis **dépose-la** dans « Import local rapide » | Notice listée avec son **nombre de pages** ; « association proposée, non vérifiée » (une seule construction) ou case à cocher (plusieurs) | |
| 3.7 | Fiche de compatibilité (point 4) | Modes réellement disponibles (guidé seulement si le fichier a des étapes) ; « Montage libre avec notice » ; « **Notice synchronisée indisponible : aucune correspondance validée** » ; « Pièces vérifiées » ou la liste des références absentes ; « Inventaire indéterminé » | |
| 3.8 | « Détails avancés » | SHA-256 du fichier, diagnostics, choix d'un autre modèle du fichier | |

## 4. Ajout, construction, reprise après redémarrage (point 5)

| # | Action | Attendu | OK/KO |
|---|---|---|---|
| 4.1 | Nom proposé (« Blue Power Jet » ou celui de l'OMR) → « Ajouter à ma collection » | « Ajouté à ta collection » ; nombre de fichiers ajoutés ; bouton « Construire « Modèle principal » » | |
| 4.2 | « Construire » → « Commencer — mode guidé » (ou « Montage libre (avec notice) »), poser **au moins 5 pièces** | « Enregistré dans la bibliothèque » ; la notice déposée s'ouvre dans l'onglet Notice PDF | |
| 4.3 | « ← Ma collection » | Nouvelle carte 31039-1 avec miniature, x/N pièces, « En cours » ; 31040 et 31009 inchangés | |
| 4.4 | **Quitter Chrome** (⌘Q), arrêter le serveur (Ctrl+C), `npm run start`, rouvrir Chrome | Même collection, même progression | |
| 4.5 | 31039 → « Reprendre » | « Progression restaurée : x/N », même mode, notice ouverte sans import | |
| 4.6 | « Détails » de 31039 | Fichier modèle « copie de la bibliothèque », notice associée, « Vérifier les empreintes » OK | |

## 5. Doublons (point 6) et Safari

| # | Action | Attendu | OK/KO |
|---|---|---|---|
| 5.1 | « Ajouter un set » → `31039` → « Rechercher » | « Ce set est déjà dans ta collection : 31039-1 … » ; choix « Ajouter les constructions cochées à ce set » coché | |
| 5.2 | « Chercher en ligne » → « Télécharger » le principal | « **Ce modèle existe déjà dans ta collection** » ; sa case est désactivée ; le bouton d'ajout reste inactif (« Coche au moins une construction. ») | |
| 5.3 | Déposer de nouveau la même notice | « déjà dans la bibliothèque » (pas de nouvelle copie) | |
| 5.4 | Facultatif : télécharger un alternatif, « Ajouter 1 construction(s) à 31039-1 » | Le set a une construction de plus ; la progression du modèle principal est **inchangée** | |
| 5.5 | Ouvrir http://127.0.0.1:3000 dans **Safari** | Même collection (31040, 31009, 31039) et mêmes progressions | |
| 5.6 | Safari : 31039 → « Reprendre », poser 1 pièce ; puis « Ajouter un set » → `31039` | Reprise sans import ; mêmes messages de doublon qu'en 5.1–5.2 | |

## 6. Import hors ligne (point 7)

| # | Action | Attendu | OK/KO |
|---|---|---|---|
| 6.1 | **Couper le Wi-Fi** | — | |
| 6.2 | « Ajouter un set » → `31039` → « Rechercher » | Résultat local immédiat (set déjà présent) | |
| 6.3 | « Chercher en ligne » | « OMR indisponible : … » et lien vers la page ; rien d'autre ne se bloque | |
| 6.4 | Revenir à « Ajouter un set » (page neuve) ; « Choisir des fichiers » ou glisser **d'un coup** `~/Documents/brick-lab-data/models/31028-1/31028-1.mpd` et un PDF quelconque, plus `mappings/31040-1.brick-mapping.json` | Le modèle (53 pièces) est analysé ; le PDF est listé avec ses pages ; le mapping de 31040 est **refusé** (« concernent un autre modèle ») ; numéro proposé 31028-1 | |
| 6.5 | Au choix : « ← Ma collection » **sans confirmer** (rien n'est ajouté) **ou** confirmer (set 31028 ajouté hors ligne, fichier laissé en place) | Collection conforme au choix | |
| 6.6 | Rallumer le Wi-Fi | — | |

## 7. Après la recette

Arrêter le serveur, puis comparer les fichiers de tes sets avec l'inventaire d'avant (seul `library/` doit avoir changé) :

```bash
cd ~/Documents/brick-lab-data
find models instructions mappings -type f -exec shasum -a 256 {} \; | sort -k2 > /tmp/apres.sha256
grep -E " (models|instructions|mappings)/" backups-p8/donnees-2026-11-06T18-17-15.sha256 | diff - /tmp/apres.sha256 && echo "Fichiers des sets inchangés"
```

Pour retirer un set de recette : détail du set → « Retirer le set de la collection », puis « Confirmer » (il part dans `library/trash/`, rien n'est effacé).

**Revenir à l'état d'avant la recette** (si besoin) : arrêter le serveur, mettre de côté le dossier actuel (ne pas le supprimer), puis restaurer :

```bash
cd ~/Documents/brick-lab-data
mv library library-apres-recette-p8
tar -xzf backups-p8/library-2026-11-06T18-17-15-avant-recette-p8.tar.gz -C ~/Documents/brick-lab-data
```

(Refaire une sauvegarde à tout moment : `tar -czf backups-p8/library-$(date +%Y-%m-%dT%H-%M-%S).tar.gz library mappings`, serveur arrêté.)

Note chaque écart (capture, message exact, navigateur) dans les tableaux ; ils seront traités avant toute fusion. Le GO final de fusion de la PR #5 reste à toi.

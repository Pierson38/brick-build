# Recette humaine P6 — à faire par le propriétaire (Chrome et Safari, Mac)

> Les tests Playwright pilotent la souris par script ; ils ne remplacent pas un essai réel. **Cette recette n'a pas encore été faite.**

Durée estimée : 30–40 min par navigateur.

## 0. Préparation

Fichiers locaux (hors dépôt) :
- modèle : `~/Documents/brick-lab-data/models/31040-1/31040-1.mpd`
- notice : `~/Documents/brick-lab-data/instructions/31040-1/31040-1_notice_6145903.pdf`
- correspondances préparées pendant P6 : `~/Documents/brick-lab-data/mappings/31040-1.brick-mapping.json` (saisies par Claude en lisant la notice ; **à vérifier par toi**, voir § 2)

```bash
cd <worktree feat/p6-instructions-sync>
npm run build
npm run start
```

Ouvrir http://127.0.0.1:3000. Avant chaque navigateur, partir d'un stockage vide : si 31040 apparaît dans « Sessions récentes », l'importer puis « Abandonner » ; dans l'onglet Correspondances, « Tout effacer » puis « Confirmer l'effacement ».

## 1. Sans correspondances : rien n'est inventé

| # | Action | Attendu | OK/KO |
|---|---|---|---|
| 1.1 | Importer `31040-1.mpd` | Onglet Modèle : « Notice synchronisée indisponible : aucune correspondance… » ; pas de bouton « Commencer — notice synchronisée » | |
| 1.2 | « Commencer — mode guidé », poser 2 pièces, puis « Abandonner » | Mode guidé P5 inchangé | |

## 2. Éditeur (vérification des correspondances préparées)

| # | Action | Attendu | OK/KO |
|---|---|---|---|
| 2.1 | Onglet **Correspondances** → « Importer un fichier de correspondances » → `31040-1.brick-mapping.json` | « Valide : mode synchronisé disponible », 65/65, 24 étapes | |
| 2.2 | Importer la notice PDF (bouton en haut du panneau) | Le livret est « ouvert » ; la page de l'étape sélectionnée s'affiche, à la largeur du panneau | |
| 2.3 | Parcourir les 24 étapes avec ▶ ; pour chacune, comparer la 3D (pièces surlignées en ambre = pièces de l'étape) avec la page | Mêmes pièces ; cocher « Vérifiée contre la page » quand c'est juste | |
| 2.4 | Points douteux signalés par une **note** (étapes 4, 9, 16, 19) : y regarder de près | Corriger si besoin (clic 3D pour retirer, ⌥-clic pour déplacer) | |
| 2.5 | Clic 3D sur une pièce fantôme, puis sur la même pièce surlignée | Ajoutée puis retirée ; le compteur suit | |
| 2.6 | Clic 3D sur une pièce d'une étape précédente | Message « déjà dans l'étape … : ⌥-clic » ; rien n'est déplacé sans ⌥ | |
| 2.7 | « Exporter (.json) » | Un fichier `31040-1.brick-mapping.json` est téléchargé ; l'ouvrir : seulement des ids, pages, numéros et empreintes | |

## 3. Jeu synchronisé

| # | Action | Attendu | OK/KO |
|---|---|---|---|
| 3.1 | « Terminer l'édition » → « Commencer — notice synchronisée » | Onglet Notice : bandeau « Étape 1 — …, p. 2 (1re étape imprimée sur 2 de la page) » | |
| 3.2 | Construire en suivant la page | Seules les pièces de l'étape sont proposées ; les emplacements de l'étape sont en bleu (décochable) | |
| 3.3 | Terminer une étape | Message « Étape … terminée ! Suivante : … » ; la page tourne seule quand l'étape suivante est sur une autre page | |
| 3.4 | « ◀ Étape précédente » puis « Revenir à l'étape en cours » | Page et pièces de l'étape passée surlignées, rien n'est retiré | |
| 3.5 | Consulter une étape passée → « Reprendre depuis cette étape » | Les pièces de cette étape et des suivantes sont retirées ; la progression reste cohérente | |
| 3.6 | Annuler (⌘Z) à la première pièce d'une étape | Retour à l'étape précédente | |
| 3.7 | Recharger la page, réimporter le MPD | « Progression restaurée », même étape ; bandeau « Livret non ouvert : importe … » | |
| 3.8 | Importer un autre PDF (par ex. un livret de 31009) | Il n'est pas utilisé à la place du livret : avertissement maintenu | |
| 3.9 | Réimporter le bon PDF | La page de l'étape revient | |
| 3.10 | Finir le modèle | « Bravo, modèle terminé ! » | |
| 3.11 | Ressenti : la notice et la 3D se suivent-elles agréablement ? Points pénibles ? | Remarques libres | |

## 4. Résultat

À remplir : navigateur, date, commit, OK/KO, remarques.

# Recette humaine P7 — à faire par le propriétaire (Chrome puis Safari, Mac)

> Les tests Playwright pilotent la souris par script, et WebKit de Playwright n'est pas l'application Safari : ils ne remplacent pas un essai réel.

Durée estimée : 30–40 min.

## 0. Préparation

```bash
cd <worktree feat/p7-personal-library>
npm ci
npm run build
npm run start
```

Ouvrir http://127.0.0.1:3000 dans **Chrome**. La collection utilise `~/Documents/brick-lab-data/library/` (créé par P7). Pendant le développement, Claude y a déjà ajouté 31040 « Desert Racers » et 31009 « Small Cottage » et posé 12 pièces de 31040 ; tu peux repartir de zéro en arrêtant le serveur et en renommant `library/` en `library.essai-claude/`.

## 1. Collection

| # | Action | Attendu | OK/KO |
|---|---|---|---|
| 1.1 | Ouvrir l'application | Page « Ma collection » ; si elle est vide, un bandeau jaune « set(s) trouvé(s) dans ton dossier de données » | |
| 1.2 | Déplier le bandeau | 31040 : notice cochée, correspondances `31040-1.brick-mapping.json` (24/24 vérifiées) présélectionnées ; 31009 : 3 notices proposées | |
| 1.3 | Ajouter 31040 (nom « Desert Racers ») et 31009 (« Small Cottage », ne garder que la notice 6038244) | Deux cartes avec miniature 3D, nombre de pièces, fichiers, modes, « Jamais commencé » | |
| 1.4 | Vérifier que `models/`, `instructions/`, `mappings/` n'ont pas changé (Finder, dates) | Rien de copié ni déplacé | |
| 1.5 | Rechercher « 31040 », puis « cottage » ; filtres En cours / Terminés / Non commencés | Filtrage correct | |

## 2. Reprise de 31040 en notice synchronisée (critère principal)

| # | Action | Attendu | OK/KO |
|---|---|---|---|
| 2.1 | Carte 31040 → « Construire » | Atelier : modèle chargé **sans sélection de fichier** | |
| 2.2 | « Commencer — notice synchronisée » | Onglet Notice : livret 6145903 ouvert tout seul, p. 2, étape 1 | |
| 2.3 | Poser une dizaine de pièces | La page suit les étapes ; en haut « Enregistré dans la bibliothèque » | |
| 2.4 | « ← Ma collection » | Carte : x/65 pièces posées, « En cours », bouton « Reprendre » | |
| 2.5 | **Quitter Chrome** (⌘Q), arrêter le serveur (Ctrl+C), le relancer (`npm run start`), rouvrir Chrome | Même carte, même progression | |
| 2.6 | « Reprendre » | « Progression restaurée », mode Notice synchronisée, même étape, même page, livret ouvert sans import | |

## 3. Safari, même bibliothèque

| # | Action | Attendu | OK/KO |
|---|---|---|---|
| 3.1 | Ouvrir http://127.0.0.1:3000 dans **Safari** | Même collection, même progression | |
| 3.2 | Reprendre 31040, poser 2 pièces | Enregistré ; la notice suit | |
| 3.3 | Revenir dans Chrome (onglet resté ouvert sur l'atelier) et poser une pièce | Message « enregistrée entre-temps depuis un autre onglet ou navigateur… Recharger » : **rien n'est écrasé** ; après « Recharger », la progression Safari est là | |

## 4. Détail d'un set et gestion

| # | Action | Attendu | OK/KO |
|---|---|---|---|
| 4.1 | « Détails » de 31040 | Aperçu 3D, fichiers « disponible / laissé en place », correspondances valides 24/24, modes, diagnostics | |
| 4.2 | Renommer le set, « Enregistrer » | Nom changé, progression conservée | |
| 4.3 | « Vérifier les empreintes » | « fichier(s) vérifié(s) : empreintes SHA-256 identiques » | |
| 4.4 | Détail de 31009 → « Associer une ou plusieurs notices » (6038252) puis « Dissocier » (confirmer) | Notice ajoutée puis retirée ; le fichier n'est pas supprimé | |
| 4.5 | « Ajouter un set » avec un autre MPD de `models/` (ex. 31028) et un fichier de correspondances de 31040 | Correspondances refusées (« concerne un autre modèle ») | |
| 4.6 | Retirer ce set de test (confirmer) | Il disparaît ; il est dans `library/trash/` | |

## 5. Sauvegardes P5/P6 du navigateur

| # | Action | Attendu | OK/KO |
|---|---|---|---|
| 5.1 | Si Chrome contient encore la partie 31040 de la recette P6 (localStorage) | La collection la signale ; à l'ouverture de 31040 sans progression en bibliothèque, elle est reprise (bandeau bleu) ; sinon, si elle est plus récente, l'application demande laquelle reprendre | |
| 5.2 | Ouvrir « Atelier sans collection » | Atelier P5/P6 inchangé (import manuel, sessions récentes) | |

## 6. Ressenti

Interface agréable sur MacBook ? Points pénibles ? Lenteurs ?

## Résultat

À compléter par le propriétaire : date, navigateurs (version de Safari), OK/KO, remarques.

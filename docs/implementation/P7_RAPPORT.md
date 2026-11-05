# P7 — Bibliothèque personnelle de sets : rapport

**Date :** 05/11/2026. Branche `feat/p7-personal-library`, worktree dédié, base `origin/main` = `7f2e670` (P6 fusionné).
**Machine :** Mac Apple M2 Pro, macOS 26.6.2, Node 24.5.0, Chromium et WebKit (Playwright 1.64.1).

Architecture, sécurité, sauvegarde et restauration : [P7_ARCHITECTURE_BIBLIOTHEQUE.md](P7_ARCHITECTURE_BIBLIOTHEQUE.md). Décisions : [JOURNAL_DECISIONS.md](JOURNAL_DECISIONS.md#journal--05112026-lot-p7-bibliothèque-personnelle). Recette humaine : [RECETTE_HUMAINE_P7.md](RECETTE_HUMAINE_P7.md).

> Aucun contenu LEGO n'est ajouté au dépôt : ni MPD de set, ni PDF, ni mapping réel, ni capture de notice. Les fixtures des tests de stockage sont originales (CC0). Les preuves réelles restent dans `~/Documents/brick-lab-data/proofs/p7/`.

## 1. Ce qui est livré

| Besoin | Livré |
|---|---|
| Arriver sur « Ma collection » | `/` : grille de sets (miniature 3D locale, numéro, nom, pièces, fichiers, modes, progression, statut), recherche numéro/nom (accents ignorés), filtres En cours / Terminés / Non commencés, « Construire » / « Reprendre ». L'atelier P5/P6 sans collection reste sur `/atelier`. |
| Stockage durable sur le Mac, partagé Chrome/Safari | Serveur Next.js local (Node `fs`), `~/Documents/brick-lab-data/library/` : index JSON validé, fichiers adressés par SHA-256, progression et mapping par construction, écritures atomiques, historique, corbeille. |
| Ajouter un set | Dialogue : un ou plusieurs modèles `.mpd`/`.ldr` (un par construction, modèle principal choisissable), une ou plusieurs notices PDF, un mapping JSON (rejeté s'il concerne un autre modèle), numéro et nom. Doublons détectés par empreinte. |
| Modèles alternatifs | Un set contient plusieurs constructions distinctes (chacune : modèle, modèle principal, notices, mapping, progression). |
| Gérer | Détail du set : aperçu 3D, renommer (set et construction) sans toucher la progression, associer / remplacer / dissocier des notices, importer ou remplacer un mapping, exporter, vérifier les empreintes, réparer un fichier, ajouter une construction, retirer (corbeille). |
| Fichiers existants | Détection en lecture seule de `models/`, `instructions/`, `mappings/` ; ajout **sans copie** ; mapping reconnu par l'empreinte du modèle, le plus vérifié présélectionné. |
| Reprendre | Ouverture depuis la collection : empreintes recalculées, modèle et notices chargés sans sélection, progression validée (P5/P6), mode restauré, mapping revalidé, mode synchronisé seulement si mapping valide **et** notice attendue associée, page et étape restaurées. Fichier manquant/modifié : erreur claire, rien d'autre chargé, réparation depuis le détail. |
| Compatibilité P5/P6 | Atelier P5/P6 inchangé (`BuildStore` injecté). Progressions v1/v2 acceptées telles quelles. Sauvegardes `localStorage` reprises à l'ouverture (jamais effacées) ; choix demandé si elles divergent et sont plus récentes. |

## 2. Recette réelle 31040 / 31009 (dossier de données réel)

Serveur de **production** (`npm run build && npm run start`), dossier `~/Documents/brick-lab-data/`.

1. Collection vide → bandeau « 8 set(s) trouvé(s) » (découverte : 130 ms). 31040 : notice 6145903 cochée, `31040-1.brick-mapping.json` **24/24 vérifiées** présélectionné (la version préparée 0/24 est proposée mais non choisie). 31009 : 3 notices ; seule 6038244 (livret du modèle principal) a été gardée.
2. Ajout via l'interface : « 31040-1 Desert Racers » et « 31009-1 Small Cottage ». Miniatures rendues localement. Fichiers laissés en place ; seuls le mapping (7 Ko) et l'index sont écrits sous `library/`.
3. 31040 → « Construire » → « Commencer — notice synchronisée » : livret ouvert **sans sélection**, p. 2, étape 1. 12 pièces posées (aide de pose) → étape 6, p. 4, « Enregistré dans la bibliothèque ».
4. Page fermée, **serveur arrêté puis relancé**, nouvelle page : carte « 12/65 pièces posées », « En cours », « Reprendre » → « Progression restaurée : 12/65 », mode Notice synchronisée, Étape 6, p. 4, livret ouvert.
5. 31009 : ouverture depuis la collection, 270 pièces, 92 combinaisons pièce/couleur, avertissement d'inventaire « indéterminé » conservé, notice 84 p. ouverte, mode synchronisé non proposé (aucun mapping).
6. Empreintes et dates de modification des fichiers tiers (`models/`, `instructions/`, `mappings/`) **identiques** avant/après.

Essai automatisé équivalent sur copie isolée (`tests/e2e/library-omr.spec.ts`, joueur scripté P5, pointeur et clavier) :

| Mesure (31040, mode synchronisé) | Résultat |
|---|---|
| Découverte, mapping vérifié présélectionné, aucun fichier copié | OK |
| Pièces posées | **65/65**, 0 refus, 0 secours PageUp/PageDown |
| Interruption à 30/65, retour collection, **navigateur fermé** (nouveau contexte) | Reprise : 30/65, Notice synchronisée, Étape 11, p. 7, livret ouvert sans import |
| Ouverture depuis la collection (modèle + notice + géométrie) | 5,1 s à froid (serveur de dev), 3,5 s à la reprise |
| Statut final dans la collection | « Terminé » |
| 31009 : ouverture, notice, 5 pièces en guidé enregistrées | OK |

Captures (hors dépôt) : `proofs/p7/collection.png`, `proofs/p7/31040-1-resumed-30.png`.

## 3. Tests

Nouveaux :
- **unitaires** `library-store.test.ts` (24) : ajout et relecture par un nouveau store **et par un autre processus Node** (redémarrage), doublons (fichier, modèle, numéro), types et tailles refusés, plusieurs PDF (ordre, remplacement, progression conservée), mapping ajouté plus tard / mapping d'un autre modèle ou d'un autre nombre de pièces refusé / conflit de révision / historique, modèles alternatifs (même fichier avec un autre modèle principal, progression non transférable), progression (révisions, conflit, progression étrangère refusée, remise à zéro avec confirmation), P5 v1 et P6 v2, fichiers modifiés (même taille), redimensionnés, manquants, réparation, écriture interrompue (index intact, aucun temporaire), index abîmé (aucune écriture) ou supprimé avec sauvegardes, dossier en lecture seule, progression corrompue conservée, chemins hostiles, index pointant hors du dossier, `__proto__`, liens symboliques ignorés, renommage sans perte, corbeille, découverte et adoption sans copie, recherche/filtres ;
- **unitaires** `library-api.test.ts` (11) : garde HTTP (DNS rebinding, cross-site, same-site, autre origine, sans origine, sans en-tête, origine `null`), parcours complet par les handlers, requêtes malformées ;
- **E2E** `library.spec.ts` (9, fixtures originales) : ajout complet + mapping incompatible + doublon, construction synchronisée → collection → **navigateur fermé** → reprise (page, étape, notice sans import), deux onglets (pas d'écrasement), renommage + notices, mapping ajouté plus tard / refusé, modèles alternatifs, reprise d'une sauvegarde P5 du navigateur, fichier modifié/manquant + réparation, requêtes non autorisées (dont une iframe d'une autre origine : « blocked ») ;
- **E2E** `library-webkit.spec.ts` (1) : partie commencée dans Chromium, reprise dans **WebKit**, puis de nouveau dans Chromium ;
- **E2E** `library-omr.spec.ts` (3, réels, ignorés sans les fichiers).

Les 6 specs existantes ne changent que d'URL (`/` → `/atelier`).

## 4. Sortie de la recette (05/11/2026, `npm run recette`, sortie 0)

```
check:spec   15 OK, 2 DÉCLARÉ (écarts P5 inchangés), 0 écart nouveau
typecheck    tsc --noEmit : 0 erreur
vitest       Test Files 7 passed (7) — Tests 119 passed (119)   [84 P0–P6 + 35 P7]
playwright   41 passed (12.2m), 0 ignoré
  brick-lab.spec.ts               6/6   (P0–P4, fixtures)
  instructions-sync.spec.ts       4/4   (P6, fixtures)
  library-webkit.spec.ts          1/1   (P7, Chromium ↔ WebKit)
  library.spec.ts                 9/9   (P7, fixtures originales)
  surface-placement.spec.ts       6/6   (P5, fixtures)
  instructions-sync-omr.spec.ts   2/2   (P6, 31040 réel)
  library-omr.spec.ts             3/3   (P7, 31040 + 31009 réels)
  omr-validation.spec.ts         10/10  (P5, 31040 + 31009 réels)
npm run build   OK (production, 0 avertissement)
```

Une exécution précédente avait échoué (11 tests en début de série) : boucle de rechargement en `next dev` causée par la règle `headers()` ajoutée dans `next.config.ts` ; cause reproduite (≈ 1 500 navigations en 45 s), corrigée (en-têtes en production seulement), recette repassée en entier. Non exécuté : `npm run perf` (P7 ne modifie ni le rendu ni le moteur).

## 5. Limites connues

- **Safari réel non testé par Claude** : WebKit de Playwright (moteur de Safari) est testé ; l'application Safari reste à la recette humaine (§ 3 du protocole).
- **Un seul serveur à la fois** sur un même dossier : les écritures sont sérialisées dans le processus ; deux serveurs simultanés (dev + production) sur le même dossier ne sont pas protégés par un verrou de fichier (les révisions limitent le risque, sans l'exclure).
- **Sauvegardes du navigateur** : reprises par empreinte du modèle, à l'ouverture de la construction et dans le navigateur qui les contient (Chrome et Safari ont chacun les leurs). Celles de la recette P6 dans ton Chrome n'ont pas pu être vérifiées par Claude.
- **Vérification rapide** dans la collection (existence + taille ; le modèle est toujours haché) : une notice modifiée sans changement de taille n'apparaît qu'au détail du set ou à l'ouverture (hachage complet).
- **Fichiers « laissés en place »** : les déplacer ou les renommer casse la référence (signalé, réparable en choisissant le fichier d'origine, qui est alors copié dans `library/blobs/`).
- **Fichiers orphelins** : un fichier importé puis abandonné (dialogue annulé, construction retirée) reste dans `library/blobs/` ; pas de nettoyage automatique.
- **Historique** : 30 versions par type et par construction (progression : au plus une par minute), 20 versions de l'index.
- **Miniature** : rendue la première fois que la collection ou le détail s'affiche ; sans bibliothèque LDraw configurée, pas de miniature (placeholder).
- **31009** : pas de mapping (saisie non faite, hors périmètre) ; les livrets 6038252 / 6038254 sont ceux des modèles alternatifs, dont l'OMR ne fournit pas de MPD.
- **Premier rendu à froid en `next dev`** : jusqu'à quelques secondes (compilation de la page) ; délai du premier test porté à 60 s.

## 6. Verdict

**GO sous conditions.**

Démontré : la collection est sur le disque du Mac, partagée par les navigateurs ; 31040 et 31009 y figurent sans réimport ni copie de leurs fichiers ; 31040 se reprend depuis « Ma collection » en notice synchronisée, après fermeture du navigateur et redémarrage du serveur, à la même étape et à la même page, livret ouvert sans sélection, puis se termine (65/65). Rien n'est inventé : fichier modifié ou manquant → erreur et réparation, jamais de substitution. P5/P6 : aucune régression (recette complète), sauvegardes du navigateur reprises sans perte.

Conditions :
1. **Recette humaine P7** (`RECETTE_HUMAINE_P7.md`), en particulier dans l'application **Safari** (seul WebKit de Playwright a été testé).
2. Vérifier la reprise de ta partie P6 restée dans le `localStorage` de ton Chrome (non accessible à Claude).

La fusion reste soumise à ton accord explicite.

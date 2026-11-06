# P8 — Import simplifié et découverte des sets : rapport

**Date :** 06/11/2026. Branche `feat/p8-simplified-import`, worktree `brick-build-worktrees/p8-simplified-import`, base `origin/main` = `a4d2eeb47dc502b3cd50328c86babe8b9c31b0ea` (P7 fusionné).
**Machine :** Mac Apple M2 Pro, macOS 26.6.2, Node 24.5.0, Chromium (Playwright 1.64.1).

Sources, permissions, stratégie, sécurité : [P8_ARCHITECTURE_IMPORT.md](P8_ARCHITECTURE_IMPORT.md). Décisions : [JOURNAL_DECISIONS.md](JOURNAL_DECISIONS.md#journal--06112026-lot-p8-import-simplifié). Recette humaine : [RECETTE_HUMAINE_P8.md](RECETTE_HUMAINE_P8.md).

> Aucun contenu tiers n'est ajouté au dépôt : ni MPD de set, ni PDF, ni mapping réel, ni page OMR enregistrée. Les fixtures sont originales (CC0) ; les pages OMR des tests sont synthétiques. Les preuves réelles restent dans `~/Documents/brick-lab-data/proofs/p8/`.

## 1. Ce qui est livré

| Besoin | Livré |
|---|---|
| Saisir le numéro du set | Page `/ajouter` (bouton « Ajouter un set » de « Ma collection »). `31040`, `31040-1`, ` 31040 - 1 ` → `31040-1` ; variante `-1` supposée **et affichée** ; `31040-2` reste une autre boîte. Numéro invalide refusé avec un exemple. |
| Rechercher modèles et notices | Sans réseau : collection (sets du même numéro et leurs constructions) et dossier de données (`models/<n>/`, `instructions/<n>/`, mappings de `mappings/` par empreinte). Sur clic « Chercher en ligne » : page du set sur l'OMR (modèle principal + alternatifs, auteur), Rebrickable si une clé locale existe, lien vers la notice LEGO. |
| Présenter ressources et limites | Par source : trouvé / rien / indisponible / non configuré, avec la raison et un lien vers la page officielle. « Notice disponible sur LEGO.com, mais téléchargement manuel nécessaire. » |
| Sélection explicite | Modèles (et constructions possibles d'un même MPD), notices par construction, correspondances par construction ; tout se coche ou se retire ; détails avancés repliés. |
| Préparer, analyser | Côté serveur, hors index : étapes LDraw, sous-modèles, pièces, références absentes de la bibliothèque LDraw locale, diagnostics, licence et auteur du fichier, pages et SHA-256 des PDF, mappings classés valide / incomplet / incompatible. |
| Compatibilité avant confirmation | Fiche par construction : modes réellement disponibles et raisons (voir § 3). |
| Ajouter à la bibliothèque | Une seule écriture d'index ; copies adressées par SHA-256, fichiers du dossier de données laissés en place ; provenance conservée ; réessai sans doublon ; progression et mapping existants jamais remplacés. |
| Commencer à construire | « Construire « … » » ouvre l'atelier directement (aucune sélection de fichier). |
| Import local rapide | Glisser-déposer ou sélection simultanée de `.mpd`, `.ldr`, `.pdf`, `.brick-mapping.json`, sans Internet. |
| Set déjà présent | « Ce set est déjà dans ta collection » → ajout des constructions au set existant (par défaut) ou second set (choix explicite) ; « Ce modèle existe déjà dans ta collection » (case désactivée, lien). |

Remplacé : le dialogue P7 `AddSetDialog` (ses règles sont reprises et étendues). Inchangés : moteur, atelier, éditeur de correspondances, détail du set, bandeau de découverte P7.

## 2. Recette réelle (06/11/2026)

**Set : 31045-1 Ocean Explorer** (Creator 3-en-1, 213 pièces dans le MPD de l'OMR), absent de la collection. **Environnement isolé** : `$TMPDIR/brick-lab-recette-p8` (bibliothèque vide au départ), bibliothèque de pièces LDraw réelle en lecture, **OMR réel** (pas de réponse simulée). Commande reproductible : `npx playwright test -c playwright.recette-p8.config.ts -g "part 1"`, arrêt et relance du serveur, puis `-g "part 2"`.

| Étape | Résultat |
|---|---|
| 1. Recherche `31045` | Lu comme 31045-1 ; dossier de données (isolé) : rien ; « Chercher en ligne » : **« 3 modèle(s) 3D sur l'OMR, dont 2 alternatif(s) »** : Ocean Explorer (`31045-1.mpd`), Aircraft, Submarine, auteur Tomas Kralicek [RabbiT_CZ]. Rebrickable : « non configuré » (pas de clé). Lien LEGO : `…/fr-fr/service/building-instructions/31045`. |
| 2. Récupération | Un clic « Télécharger » : `31045-1.mpd`, 51 Ko, **SHA-256 `b25e0473…` identique au fichier obtenu à la main en P5** ; téléchargé sans le paramètre `?v=` de la page. Licence lue dans le fichier : « Redistributable under CCAL version 2.0 ». |
| 3. Contrôle des pièces | 213 pièces, 70 références, 85 combinaisons pièce/couleur, 6 sous-modèles, 75 étapes LDraw (aplaties), 0 erreur, **aucune référence absente** de la bibliothèque LDraw locale. Inventaire : « indéterminé » (non comparé à l'inventaire officiel). |
| 4. Notices | **Aucune notice réelle de 31045 n'existe sur ce Mac et le script ne télécharge pas sur LEGO.com** : un PDF **synthétique** de 4 pages a été déposé à sa place pour exercer l'association (« 4 pages », « association proposée, non vérifiée »). Fiche : « Montage libre avec notice », « Notice synchronisée indisponible : aucune correspondance validée ». L'essai avec la vraie notice est au § 2.5 de la recette humaine. |
| 5. Ajout | Nom proposé « Ocean Explorer » (page OMR). Recherche → ajouté : **7,0 s** (réseau compris). Index : une révision ; provenance `{ source: omr, url: …/media/omr_models/371/31045-1.mpd, pageUrl: …/omr/set/31045-1, license, author, retrievedAtIso }`. |
| 6. Construction | « Construire » → mode guidé → **12 pièces posées** par le joueur scripté P5 (pointeur et clavier) : 12 poses, 0 refus, 0 secours PageUp/PageDown, 1 déplacement de caméra ; « Enregistré dans la bibliothèque ». |
| 7. Retour à la collection | Carte « 31045-1 Ocean Explorer, 213 pièces, Modèle 3D ✓, 1 notice, Pas de correspondances, Guidé / Montage libre, **12/213 pièces posées**, En cours, Reprendre ». |
| 8. Reprise sans réimport | Serveur **arrêté et relancé**, nouveau contexte de navigateur : « **Progression restaurée : 12/213 pièces posées.** », mode guidé. Nouvelle recherche `31045` + téléchargement : « Ce modèle existe déjà dans ta collection : 31045-1 Ocean Explorer — « Modèle principal » », toujours **1** set. |

Le parcours recherche → OMR → ajout a aussi été passé sur le **serveur de production** (`next start`) : même résultat (index, fichier, provenance). La pose scriptée demande les crochets de test, absents de la production : elle a été faite sur `next dev`, comme les recettes P5–P7.

**Données réelles intactes** : SHA-256 des 48 fichiers de `~/Documents/brick-lab-data/{library,models,instructions,mappings}` (hors `library/backups`) identiques avant et après la recette, date de `library.json` inchangée. 31040 et 31009 n'ont pas été touchés. Aucun set ajouté à ta bibliothèque.

Preuves (hors dépôt) : `proofs/p8/recette-31045-1.json` (journal complet), `31045-1-compatibilite.png`, `31045-1-construction.png`, `31045-1-reprise.png`.

### Défauts trouvés et corrigés pendant le lot

1. **En-tête `User-Agent` non ASCII** (apostrophe typographique) : Node refuse la requête (`ERR_INVALID_CHAR`), l'OMR paraissait « indisponible ». Invisible avec le transport simulé ; trouvé par la recette réelle. Corrigé (ASCII) + test qui valide chaque en-tête envoyé avec le validateur de Node.
2. **Première écriture d'index interrompue** : la copie de sauvegarde était écrite avant `library.json`, laissant une sauvegarde sans index ; au démarrage suivant la bibliothèque se bloquait. Défaut **P7** révélé par un test P8 ; ordre inversé.
3. **`BlockList` de Node** : une règle `::ffff:0:0/96` s'applique aussi à toutes les adresses IPv4 (tout était « privé ») ; règle retirée, IPv4 mappées converties explicitement (formes pointée et hexadécimale).
4. **Libellé par défaut** d'une construction ajoutée à un set existant : « Modèle principal » une seconde fois ; la lettre suit maintenant les constructions existantes (« Modèle C »).
5. **Fiche de compatibilité** : rien n'était dit quand toutes les pièces sont présentes ; ligne « Pièces vérifiées » ajoutée.

## 3. Règles de la fiche de compatibilité (vérifiées par les tests)

| Cas | Affiché |
|---|---|
| Étapes LDraw | « Modèle prêt pour le montage guidé : N étape(s) LDraw » (+ « ordre différent de la notice officielle » si aplaties) |
| Sans étapes | « Pas d'étapes LDraw dans ce fichier : montage libre uniquement » |
| + PDF | « Montage libre avec notice : N livret(s) » |
| + mapping valide **et** ses livrets sélectionnés | « Notice synchronisée disponible » (mode `synced`) |
| PDF sans mapping valide | « Notice synchronisée indisponible : aucune correspondance validée » (ou la raison : incomplet, livret non sélectionné) |
| Références absentes | « Modèle incomplet à l'écran : N référence(s)… » |
| Bibliothèque LDraw non configurée | « Pièces non vérifiées » |
| Inventaire non vérifié | « Inventaire indéterminé… » (31040 : « Inventaire officiel vérifié » ; 31009 : message P5) |
| Notice sans modèle | « Notice trouvée sans modèle 3D : pas de construction interactive disponible » ; pas de confirmation possible |

Aucune correspondance n'est générée : sans mapping existant pour l'empreinte exacte du modèle, le mode synchronisé n'est jamais proposé.

## 4. Tests

Nouveaux :
- **unitaires** `set-number.test.ts` (22) : normalisation, variantes, numéro dans un nom de fichier ; fiche de compatibilité (chaque cas du § 3, mapping valide / incomplet / livret non sélectionné / autre modèle principal, pièces absentes, inventaire).
- **unitaires** `online-sources.test.ts` (44) : adresses publiques / privées (IPv4, IPv6, mappées), URL refusées (http, autre hôte, sous-domaine piège, identifiants, port, IP, `file:`), **DNS rebinding** (résolveur simulé), redirections (même hôte acceptée, autre hôte / métadonnées cloud / http refusées), taille annoncée et en flux, délai, HTTP 503, coupure réseau, en-têtes ASCII ; page OMR synthétique (principal puis alternatifs, liens d'autres sets et d'autres hôtes ignorés, mise en page inconnue → aucun modèle), URL de téléchargement acceptées / refusées ; recherche en ligne : plusieurs modèles, 404, 503, DNS, interrupteur hors ligne (aucune requête), Rebrickable sans clé / avec clé (jamais renvoyée) / clé refusée.
- **unitaires** `import-p8.test.ts` (20) : recherche locale (variantes, dossier de données), numéro invalide ; import rapide de plusieurs fichiers (rien dans l'index avant confirmation), **plusieurs modèles** d'un set (fichiers séparés + modèle non utilisé d'un MPD + autre modèle principal choisi), **aucun modèle** (PDF seul), fichiers invalides (vide, binaire, faux PDF, faux mapping), fichier préparé disparu ; mapping **incompatible** refusé, **brouillon** « incomplet », **aucun mapping inventé** ; mapping de `mappings/` retrouvé par empreinte ; pièces absentes (bibliothèque LDraw temporaire, pièces intégrées au MPD exclues) ; import complet avec provenance et mode synchronisé ; sans mapping → pas de mode synchronisé ; **import répété** (aucun doublon, progression et mapping conservés, aucune copie) ; même numéro → refus d'un second set, ajout au set existant sans toucher la progression ; variante différente → autre set ; doublon de modèle dans un autre set ; deux constructions d'un même MPD ; mapping incompatible à la confirmation → rien d'ajouté ; fichiers du dossier de données laissés en place (date inchangée) ; références hostiles (`..`, `/etc`, `library/`, mauvais dossier, fichier caché, origine inconnue, fichier modifié) ; **écriture d'index interrompue** puis réessai ; **dossier en lecture seule** ; **index P7** sans provenance relu et étendu, progression P7 conservée ; provenance falsifiée refusée.
- **unitaires** `import-api.test.ts` (5) : sorties réseau déclenchables seulement par la page de l'application (cross-site, DNS rebinding, formulaire simple → 403) ; URL non OMR refusées **avant toute connexion** ; source indisponible → 502 clair, rien de préparé ; interrupteur hors ligne ; parcours complet par les routes (préparer, confirmer, réessayer) et requêtes malformées.
- **E2E** `add-set.spec.ts` (4, OMR simulé) : numéro invalide puis rien nulle part ; OMR principal + alternatif téléchargés sur clic, notices et mapping déposés, association par construction, mode synchronisé pour le principal seulement, construction, collection, **reprise dans un autre contexte de navigateur** ; même set de nouveau (déjà présent, rien de dupliqué, construction alternative ajoutée, progression et mode synchronisé conservés) ; source indisponible, téléchargement interrompu, fichier non LDraw, fichiers invalides, notice sans modèle.
- **Recette réelle** `tests/recette/p8-reel.spec.ts` (2, hors suite standard, configuration dédiée).

Modifié : `library.spec.ts`, 1er test (le dialogue P7 est remplacé par la page P8 ; mêmes vérifications : modèle, deux notices, mapping d'un autre modèle refusé, mapping valide, carte, doublon, notices stockées une fois).

## 5. Sortie de la validation finale

Enchaînement `npm run check:spec && npm run typecheck && npx vitest run && npx playwright test && npm run build` sur le code final (06/11/2026), **sortie 0** :

```
check:spec   15 OK, 2 DÉCLARÉ (écarts P5 inchangés : .gitignore, CLAUDE.md), 0 écart nouveau
typecheck    tsc --noEmit : 0 erreur
vitest       Test Files 12 passed (12) — Tests 222 passed (222)   [131 P0–P7 + 91 P8]
playwright   47 passed (14.7m), 0 ignoré, 0 instable
  add-set.spec.ts                 4/4   (P8, OMR simulé)
  brick-lab.spec.ts               6/6   (P0–P4)
  instructions-sync.spec.ts       4/4   (P6)
  instructions-sync-omr.spec.ts   2/2   (P6, 31040 réel)
  library.spec.ts                11/11  (P7 ; 1er test passé par la page P8)
  library-webkit.spec.ts          1/1   (P7, Chromium ↔ WebKit)
  library-omr.spec.ts             3/3   (P7, 31040 + 31009 réels : découverte, mapping 24/24, mode synchronisé)
  omr-validation.spec.ts         10/10  (P5, 31040 + 31009 réels)
  surface-placement.spec.ts       6/6   (P5)
npm run build   OK (production, 0 avertissement)
recette réelle  tests/recette/p8-reel.spec.ts : part 1 ✓ (24,2 s), part 2 ✓ après redémarrage (18,7 s)
```

Après cette validation, seul un texte d'interface a changé (« Aucun de tes fichiers n'est envoyé hors de ce Mac… », la phrase précédente était inexacte une fois l'OMR interrogé) : typecheck et `add-set.spec.ts` + `library.spec.ts` repassés, **15/15**.

Non exécuté : `npm run perf` (P8 ne touche ni au rendu ni au moteur).

## 6. Limites connues

- **OMR sans API** : la page `/omr/set/<n>` n'est pas documentée ; si elle change, la recherche en ligne ne liste plus rien (message clair, lien, import manuel). Aucune garantie de stabilité.
- **Notices LEGO** : toujours téléchargées par l'utilisateur ; l'association notice ↔ construction d'un 3-en-1 reste à cocher (proposée seulement pour une construction unique, jamais déduite du PDF).
- **Écart de spécification approuvé** (06/11/2026) : téléchargement d'un fichier OMR par le serveur local sur clic, dans le cadre de l'architecture § 3. `BRICK_LAB_ONLINE=0` le désactive.
- **Rebrickable** : conditions d'utilisation non lues (page refusée à la lecture automatique) ; facultatif, non testé avec une vraie clé (aucune clé disponible) — testé avec des réponses simulées.
- **Contrôle des pièces** : premier niveau de fichiers seulement ; une primitive manquante à l'intérieur d'une pièce n'apparaît qu'au rendu.
- **Recette réelle** : notice de 31045 remplacée par un PDF synthétique ; modèle alternatif de l'OMR non construit (téléchargement des alternatifs vérifié en E2E simulé et listé en réel) ; Safari non testé en P8 (aucun code navigateur spécifique ajouté) → recette humaine.
- **Zone de préparation** : fichiers déposés puis abandonnés gardés 7 jours dans `library/staging/`.
- **Un serveur à la fois** par dossier de données (inchangé depuis P7).
- **Pose scriptée** : impossible sur le build de production (crochets de test absents, choix P5) ; faite sur `next dev`.

## 7. Verdict

**GO sous conditions.**

Démontré : un set absent de la collection (31045) s'ajoute en saisissant son numéro, avec **deux clics** pour le modèle (« Chercher en ligne », « Télécharger ») et un dépôt pour la notice ; l'analyse, la fiche de compatibilité et l'ajout ne promettent que les modes réellement disponibles (pas de mode synchronisé sans correspondances validées, inventaire indéterminé signalé) ; la construction démarre sans sélection de fichier, se retrouve dans la collection et se reprend après redémarrage, sans réimport ; un import rejoué ne duplique rien ; l'import local rapide fonctionne sans Internet ; 31040/31009 et le mode synchronisé sont inchangés (suites P5–P7 réelles repassées) ; ta bibliothèque réelle n'a pas été modifiée.

Conditions :
1. ~~Valider l'écart de spécification~~ : **levée le 06/11/2026** (GO explicite du propriétaire, cadre consigné dans l'architecture § 3 et le journal des décisions).
2. **Recette humaine P8** (`RECETTE_HUMAINE_P8.md`) dans Chrome et Safari, avec une vraie notice LEGO et, à ta convenance, ajout réel d'un set à ta collection.

La fusion reste soumise à ton GO final après la recette humaine.

## 8. Suivi après le rapport

**06/11/2026 — approbation du téléchargement OMR.** Le propriétaire approuve l'écart (condition 1 levée) et l'architecture de téléchargement actuelle, **pas encore la fusion** de la PR #5. Aucun code modifié. Recette humaine en production préparée (`RECETTE_HUMAINE_P8.md`), après vérification de l'état des données réelles et sauvegarde vérifiée (voir ce document, § 0).

**06/11/2026, 19:15 — recette humaine en production : relevé des traces.** Détail point par point : [RECETTE_HUMAINE_P8.md](RECETTE_HUMAINE_P8.md#résultats-consignés-06112026-relevé-de-claude-à-1915). Établi par les données : ajout réel de **31039-1 Blue Power Jet** depuis l'OMR (provenance complète conservée), notice déposée (224 pages), montage libre ouvert (0 pièce posée), une seule écriture d'index, aucun doublon, 31040/31009 et les fichiers des sets intacts. **Sans trace** : fiche de compatibilité, redémarrage du serveur (aucun constaté), essai de doublon, import hors ligne, ouverture de 31040/31009, Safari. Aucun de ces points n'est considéré comme validé sans confirmation du propriétaire. Aucune anomalie trouvée dans les traces ; le brouillon de correspondances vide de 31039 vient de l'atelier (comportement P6/P7), pas de l'import.

## 9. Clôture et verdict de fusion

**État de la branche** : `feat/p8-simplified-import`, aucune modification fonctionnelle depuis la validation finale (§ 5) ; les commits suivants ne touchent que la documentation. Base `origin/main` = `a4d2eeb`, fusion sans conflit signalée par GitHub.

**Verdict de fusion (avant la recette de clôture) : prêt techniquement, fusion non recommandée en l'état** — les points 4 à 8 et Safari n'avaient pas de trace.

- Acquis : validation automatique complète (222 unitaires, 47 E2E sans test ignoré, build), recette réelle isolée de Claude (31045, reprise après redémarrage), recette humaine en production pour la recherche, le téléchargement OMR, l'import de la notice et l'ajout.

## 10. Recette humaine de clôture et verdict final (06/11/2026)

Résultats **déclarés par le propriétaire** à l'issue de sa recette humaine ([RECETTE_HUMAINE_P8.md](RECETTE_HUMAINE_P8.md), parcours de clôture) ; aucune mesure n'a été relevée par Claude pendant cette recette :

| Contrôle | Résultat (propriétaire) | Traces dans les données |
|---|---|---|
| C6 — notice LEGO `6127618.pdf` du 31039 | OK | non traçable |
| C5 — compatibilité (montage libre, sans étapes) | OK | non traçable |
| C1 — progression et reprise après redémarrage | OK | **absentes** : 31039 0/609, dernier enregistrement 19:09, aucun redémarrage du serveur |
| C2 — doublons | OK | **absentes** : rien en préparation |
| C3 — Safari | OK | non traçable |
| C4 — import hors ligne | OK | **absentes** : rien en préparation |

L'écart C1/C2/C4 a été présenté avant la fusion ; **le propriétaire a décidé de fusionner malgré lui**. Données réelles intactes au moment de la décision (index révision 3, 31040 25/65, fichiers des sets identiques à l'inventaire de 19:19 ; sauvegardes `backups-p8/` conservées).

**Verdict final : GO** (décision du propriétaire, 06/11/2026). Fusion de la PR #5 par rebase, sans force push, branche et worktree conservés.

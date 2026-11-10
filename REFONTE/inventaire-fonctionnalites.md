# Inventaire des fonctionnalités — état avant refonte

Base : `origin/main` = `a1309a4` (09/11/2026). Inventaire établi en lisant `src/app/` et `src/components/` ligne à ligne, puis recoupé avec les specs E2E (`tests/e2e`, `tests/recette`, `tests/perf`).

**Conventions**

- `ID` : identifiant stable, réutilisé dans l'audit, le rapport et les commits.
- **E2E** : spec qui exerce la fonctionnalité aujourd'hui (`—` = aucune couverture E2E, à traiter en phase 3 si le parcours est critique). Abréviations : `brick` = brick-lab, `add` = add-set, `lib` = library, `lib-omr` = library-omr, `lib-wk` = library-webkit, `sync` = instructions-sync, `sync-omr` = instructions-sync-omr, `ux` = atelier-ux, `ux-omr` = atelier-ux-omr, `surf` = surface-placement, `fb` = free-building, `f3d` = free-3d, `fh` = free-height-group, `fc` = free-connections, `fg` = free-gizmo, `fah` = free-assembly-hidden, `omr` = omr-validation, `perf` = omr-perf, `filet` = filet-refonte (phase 3).
- **Nouvel emplacement** : rempli en phase 2 pour les 262 lignes, d'après `proposition-design.md` § 4 (vocabulaire : barre d'app, HUD, rail d'outils, barre contextuelle, actions du bac, menu ⋯, onglet Démarrer/Étape, étapes 1–4 de l'ajout…). Les renvois A3, A5, A6, A10 désignent les arbitrages du § 6.
- **Vérifié** : case cochée en phase 4 après refonte de l'écran et passage des tests.
- `BrickLabApp` = `src/components/BrickLabApp.tsx` (atelier, 1 433 lignes) ; l'atelier sert à la fois `/atelier` (autonome, stockage navigateur) et `/atelier/[buildId]` (bibliothèque, via `LibraryAtelier`).

---

## A. Routes et navigation globale

| ID | Fonctionnalité | Emplacement actuel | Déclencheur | Ce qu'elle fait | Cas particuliers | E2E | Nouvel emplacement | Vérifié |
|---|---|---|---|---|---|---|---|---|
| A1 | Accueil = Ma collection | `/` → `CollectionView` | URL | Liste des sets de la bibliothèque locale | Rendu client uniquement (`dynamic(..., { ssr: false })`), affiche « Chargement… » pendant l'import du chunk | lib, add | `/` inchangé ; « Chargement… » avec indicateur d’activité (role=status) pendant le chargement de la vue | ☑ |
| A2 | Ajouter un set | `/ajouter` → `AddSetPage` | Bouton « Ajouter un set » (topbar collection, `data-testid=add-set`) | Parcours recherche → ressources → compatibilité → confirmation | — | add, lib-omr | `/ajouter` inchangé ; bouton primaire « Ajouter un set » dans la barre d'outils de la collection (même `add-set`) | ☑ |
| A3 | Détail d'un set | `/sets/[setId]` → `SetDetail` | Vignette, titre ou bouton « Détails » d'une carte | Gestion du set, de ses constructions et fichiers | Set inexistant : message + lien retour | lib | `/sets/[id]` inchangé ; vignette, titre et « Détails » de la carte | ☑ |
| A4 | Atelier d'une construction | `/atelier/[buildId]` → `LibraryAtelier` → `BrickLabApp` | « Construire / Reprendre / Revoir » (carte, détail, fin d'import) | Ouvre la construction avec fichiers vérifiés, progression et notices | `key={buildId}` : remonte l'atelier à chaque changement de build | lib, lib-omr, add | `/atelier/[buildId]` inchangé ; bandeau Reprendre, bouton de carte, carte Construction du détail, étape 4 de l'ajout | ☑ |
| A5 | Atelier sans collection | `/atelier` → `StandaloneAtelier` | Lien « Atelier sans collection » (topbar collection) | Atelier P5/P6 : import manuel, progression dans le navigateur | Topbar : « ← Ma collection » + « Atelier sans collection » | brick, sync, ux, surf, fb… | `/atelier` inchangé ; lien « Atelier sans collection » dans le menu de la barre d'app de la collection et sur l'écran d'accueil | ☑ |
| A6 | Retour à la collection | Topbar de `/ajouter`, `/sets/…` (`back-to-collection`), `/atelier/…` (`back-to-collection`), `/atelier` | Lien « ← Ma collection » | Navigation vers `/` | Dans l'atelier : `pagehide` + démontage → `store.flush()` (dernière modification envoyée) | lib | Barre d'app › premier élément du fil d'Ariane « ← Ma collection » (`back-to-collection` conservé) ; flush à la sortie inchangé | ☑ |
| A7 | Lien vers le set depuis l'atelier | Topbar `/atelier/[id]` | Lien « **n°** nom · construction » | Navigation vers `/sets/[setId]` | Libellé de construction affiché seulement s'il diffère du nom du set | — | Barre d'app › fil d'Ariane (2e segment : n° + nom du set) | ☑ |
| A8 | Titre/description de page | `layout.tsx` | — | `title` « Brick Lab Local », mention non affilié LEGO, `lang="fr"` | Même titre sur toutes les routes | — | `layout.tsx` : modèle de titre « %s — Brick Lab » ; titre par page (Ma collection, Ajouter un set, Atelier sans collection, Atelier, Détail du set) ; description « Non affilié à LEGO » conservée | ☑ |

## B. Ma collection (`/`)

| ID | Fonctionnalité | Emplacement actuel | Déclencheur | Ce qu'elle fait | Cas particuliers | E2E | Nouvel emplacement | Vérifié |
|---|---|---|---|---|---|---|---|---|
| B1 | Grille des sets | `CollectionView` `.grid` | Chargement de la page (`libraryApi.view()`) | Une carte par set (`set-card-<n°>`) | Erreur de lecture → bannière `library-error` (role=alert) | lib | Collection › grille de cartes à vignette dominante ; erreur → bannière d'alerte | ☑ |
| B2 | Recherche texte | `.collection-head` input `search` | Saisie | Filtre par numéro ou nom (`filterSets`) | Aucun résultat → « Aucun set ne correspond à cette recherche. » (`no-result`) | lib | Collection › barre d'outils (champ de recherche avec icône) ; « aucun résultat » en état vide | ☑ |
| B3 | Filtres d'état | Chips `role=radiogroup` : Tous / En cours / Terminés / Non commencés | Clic | Filtre par statut (`setStatus`) | Radios custom (boutons `role=radio`, pas de navigation flèches) | lib | Collection › barre d'outils, contrôle segmenté (`role=radiogroup`, flèches ←/→) | ☑ |
| B4 | Vignette du set | Carte → `Thumbnail` | Auto | Image `/api/library/builds/<id>/thumbnail?v=` | Absente/erreur → placeholder rayé « N pièces » ; lien vers le détail | lib | Collection › carte, vignette pleine largeur ; placeholder illustré | ☑ |
| B5 | Génération des vignettes manquantes | `ThumbnailMaker` hors écran (`.offscreen`) | Auto, un build à la fois | Rendu WebGL local du modèle fini, recadrage, PNG envoyé au serveur | Échec ou géométrie vide → marqué « essayé », passe au suivant ; jamais réseau externe | lib (indirect) | Inchangé (rendu hors écran) ; squelette de vignette pendant la génération | ☑ |
| B6 | Infos de carte | Carte : n°, nom, nb de pièces ou « N constructions (a / b pièces) » | — | Résumé du set | Multi-constructions : la carte montre la construction principale (en cours la plus récente, sinon la 1re) | lib | Collection › carte, sous la vignette : n° (mono), nom, ligne d'icônes | ☑ |
| B7 | État des fichiers sur la carte | `ul.files` : « Modèle 3D ✓/⚠ », « N notice(s) / Pas de notice », « Correspondances ✓ / (brouillon) / Pas de correspondances » | — | Disponibilité des ressources | Couleurs ok/erreur/muted | lib | Collection › carte, ligne d'icônes avec libellés (Modèle ✓/⚠, notices, correspondances) | ☑ |
| B8 | Modes disponibles | `ModeChips` | — | Chips « Notice synchronisée / Guidé / Montage libre » | Aucun mode → « Aucun mode : fichier à réparer » (rouge) | lib | Collection › carte, puces neutres des modes ; « Aucun mode : fichier à réparer » conservé en rouge | ☑ |
| B9 | Progression sur la carte | `ProgressBar` (role=progressbar) + `card-progress` + `StatusBadge` | — | « x/y pièces posées » (+ « (montage libre) » si pièces libres), statut Jamais commencé / En cours / Terminé | Statut agrégé sur toutes les constructions du set | lib, fb | Collection › carte : badge d'état sur la vignette + barre de progression au bas de la vignette + `card-progress` sous le titre ; bandeau Reprendre | ☑ |
| B10 | Problèmes sur la carte | `p.error role=note` | — | Premier problème + « (+N) » | Ex. fichier modifié/introuvable | lib | Collection › carte, ligne d'alerte rouge sous le titre (`role=note`), toujours visible | ☑ |
| B11 | **Reprise en un clic** | Bouton primaire `card-build` | Clic | Ouvre `/atelier/<build>` ; libellé « Construire » / « Reprendre » / « Revoir » (+ « « Modèle B » » si plusieurs constructions) | Masqué si aucun mode (fichier à réparer) | lib, lib-omr | Collection › bandeau « Reprendre » (dernière construction en cours) + bouton primaire de chaque carte (`card-build`) ; « Réparer » si aucun mode (A10) | ☑ |
| B12 | Détails | Bouton secondaire « Détails » | Clic | Ouvre `/sets/<id>` | — | lib | Collection › carte, bouton secondaire « Détails » | ☑ |
| B13 | Collection vide | `.empty-state` | Aucun set | Texte d'aide + lien « Ajoute un set » | Mentionne aussi la reprise des fichiers du dossier de données | lib | Collection › écran d'accueil de premier lancement (cartes Ajouter / Démo / Bibliothèque LDraw), « Ta collection est vide » conservé | ☑ |
| B14 | Détection des fichiers du dossier de données | `DiscoveryPanel` (`discovery`) | Auto ; bouton-lien replié « N set(s) trouvé(s)… ▾ » | Liste les sets présents dans `models/`, `instructions/`, `mappings/` non encore dans la collection | Erreur → « Détection des fichiers existants indisponible : … » ; rien trouvé → panneau absent ; fichiers ignorés dans un `<details>` | lib-omr | Collection › panneau de détection (dépliable) sous la grille | ☑ |
| B15 | Adoption d'un set détecté | `Candidate` : champs Numéro / Nom, cases des notices, radios des correspondances, bouton « Ajouter à ma collection (fichiers laissés en place) » | Clic | `libraryApi.adopt` sans copier les fichiers ; correspondance la plus vérifiée pré-cochée | Bouton désactivé sans nom/numéro ; « Ajout… » pendant l'appel ; erreur inline role=alert | lib-omr | Collection › section Détection, une carte par set trouvé (champs, notices, correspondances, bouton primaire) | ☑ |
| B16 | Sauvegardes navigateur héritées | `.legacy` (`legacy-saves`) | Auto (localStorage P5/P6) | Liste les parties du navigateur : reprises auto / à comparer (lien vers le détail) / orphelines (« ajoute ce modèle… ») | Jamais modifiées ni effacées | lib | Collection › section repliable « Parties enregistrées dans ce navigateur » | ☑ |
| B17 | Pied de page | `.footer-note` | — | Chemin du dossier de données, « tout reste sur ce Mac », non affilié LEGO | — | — | Collection › pied de page | ☑ |
| B18 | Accès atelier autonome | Topbar, lien « Atelier sans collection » | Clic | `/atelier` | Lien discret (small) | — | Barre d'app de la collection, lien discret « Atelier sans collection » (infobulle) | ☑ |

## C. Détail d'un set (`/sets/[setId]`)

| ID | Fonctionnalité | Emplacement actuel | Déclencheur | Ce qu'elle fait | Cas particuliers | E2E | Nouvel emplacement | Vérifié |
|---|---|---|---|---|---|---|---|---|
| C1 | Renommer le set (n° et nom) | `.detail-head` inputs inline `detail-number`, `detail-name` + « Enregistrer » (`detail-save-name`) | Édition puis clic | `updateSet` ; progression et correspondances conservées | Bouton visible seulement si modifié ; toast succès/erreur | lib | Détail › en-tête : n° et nom éditables (crayon au survol, Entrée enregistre, Échap rétablit), « Enregistrer » conservé + « Annuler » | ☑ |
| C2 | Panneau par construction | `BuildPanel` (`build-<id>`) | — | Aperçu 3D + infos ; une section par construction | — | lib | Détail › une carte Construction par construction | ☑ |
| C3 | Aperçu 3D du modèle fini | `ModelPreview` (orbit) | Auto | Modèle complet rendu localement ; génère la vignette si absente | Chargement / erreur / « Aperçu indisponible : <raison LDraw> » | lib (indirect) | Détail › carte Construction, colonne gauche (aperçu 3D) | ☑ |
| C4 | Renommer une construction | Input inline « Nom de la construction » + « Enregistrer » | Édition puis clic | `updateBuild({label})` | Progression conservée | lib | Détail › carte Construction, nom éditable (crayon, Entrée / Échap) + « Enregistrer » | ☑ |
| C5 | Statut + progression | `StatusBadge`, `ProgressBar`, `detail-progress`, mode + date, `detail-free` | — | « x/y pièces posées · mode · date » ; en libre : « N posée(s) librement, a/y à leur place dans le modèle » | — | lib, fb | Détail › carte Construction : statut, barre de progression, mode, date, détail libre | ☑ |
| C6 | Construire / Reprendre / Revoir | Bouton primaire `detail-build` | Clic | `/atelier/<id>` | Sans mode : « Construction impossible tant que le modèle 3D n'est pas réparé. » | lib | Détail › carte Construction, bouton primaire | ☑ |
| C7 | Modes de construction | `detail-modes` | — | ✓/✗ par mode + raison (synchro indisponible : `syncBlocker` ; guidé : « pas d'étapes dans le fichier ») | — | lib | Détail › carte Construction, liste des modes ✓/✗ avec raisons | ☑ |
| C8 | Problèmes | `detail-problems` role=alert | — | Liste des problèmes (empreinte différente, fichier manquant…) | — | lib | Détail › carte Construction, alerte rouge sous le nom (avant tout le reste) | ☑ |
| C9 | Fichier modèle + état | `FileLine` (`file-model`, `file-state`) | — | Nom, taille, « laissé en place / copie de la bibliothèque », état (disponible / introuvable / modifié taille / modifié empreinte / illisible) | Bordure verte/rouge ; états recalculés par SHA-256 complet | lib | Détail › section Fichiers | ☑ |
| C10 | Réparer un fichier | `RepairInput` (`repair-<sha8>`) | Choix de fichier | Accepté seulement si SHA-256 identique ; sinon refus explicite | Modèle et notices | lib | Détail › sections Fichiers et Notices, bouton « Réparer : choisir le fichier d’origine » sur la ligne concernée | ☑ |
| C11 | Vérifier les empreintes | Bouton `detail-check` + `check-result` | Clic | Re-hash de tous les fichiers | Résultat textuel | filet | Détail › section Fichiers, bouton « Vérifier les empreintes » | ☑ |
| C12 | Notices : liste, remplacer, dissocier | `FileLine` par notice + « Remplacer » (input) + `ConfirmButton` « Dissocier » | Clic | Upload + association ; dissociation confirmée (fichier non supprimé) | Confirmation en deux clics | lib | Détail › section Notices, actions de ligne « Remplacer » et « Dissocier » (confirmation en ligne conservée) | ☑ |
| C13 | Associer des notices | `detail-add-pdf` (multiple) | Choix de fichiers | Upload + association | — | lib | Détail › section Notices, bouton « Associer des notices » | ☑ |
| C14 | Correspondances : état | `detail-mapping` | — | Valides/brouillon, étapes, vérifiées, pièces affectées, livrets associés ✓/✗ | Aucune : texte d'aide (« crée-les dans l'atelier ») | lib | Détail › section Correspondances | ☑ |
| C15 | Exporter les correspondances | Bouton « Exporter (.json) » | Clic | Téléchargement local `.brick-mapping.json` | — | filet | Détail › section Correspondances, « Exporter (.json) » | ☑ |
| C16 | Importer / remplacer les correspondances | `detail-mapping-input` | Choix de fichier | Refus si autre modèle (empreinte, modèle principal, nombre de pièces) ; version précédente gardée dans l'historique | — | lib | Détail › section Correspondances, « Importer / Remplacer » | ☑ |
| C17 | Compatibilité | `dl.facts` + inventaire + pièces absentes + `<details>` diagnostics | — | Pièces, références/couleurs, étapes LDraw (type), modèle principal, qualité (`detail-quality`), verdict d'inventaire, pièces absentes de la bibliothèque LDraw, diagnostics | — | lib (partiel) | Détail › section repliable Compatibilité et diagnostics (qualité dans son titre ; repliée sauf pièce absente ou erreur) ; pièces absentes toujours visibles au-dessus | ☑ |
| C18 | Sauvegarde de ce navigateur | `BrowserSavePanel` (`browser-save`) | Auto si différente | Tableau de différences (`save-diff`, lignes `diff-*` marquées `differs`), case « reprendre aussi les correspondances », « Reprendre la sauvegarde de ce navigateur » → confirmation | La version bibliothèque va dans l'historique | lib | Détail › bandeau d’alerte sous le nom de la construction (tableau de différences et confirmation en ligne, inchangés) | ☑ |
| C19 | Retirer la construction / le set | `danger-zone` `ConfirmButton` (`detail-remove`, `detail-remove-confirm`) | Deux clics | Progression et correspondances → `library/trash` ; fichiers conservés ; retour à `/` si dernier build | Libellé selon nb de constructions | filet | Détail › zone sensible en bas de la carte, confirmation en modale (`detail-remove`, `detail-remove-confirm`) | ☑ |
| C20 | Ajouter un modèle alternatif | `.add-build` : nom + `detail-add-build` | Choix de fichier | Nouvelle construction (Modèle B, C…) avec sa propre progression | Fichier sans pièce refusé | lib, filet | Détail › carte « Ajouter un modèle alternatif » après les constructions | ☑ |
| C21 | Toasts | `.toast.fixed` (`detail-message`) | Actions | Message ok/erreur ; clic pour fermer | Ne disparaît pas seul | lib | Toasts communs (bas de page, fermeture ×), `detail-message` conservé | ☑ |

## D. Ajouter un set (`/ajouter`)

| ID | Fonctionnalité | Emplacement actuel | Déclencheur | Ce qu'elle fait | Cas particuliers | E2E | Nouvel emplacement | Vérifié |
|---|---|---|---|---|---|---|---|---|
| D1 | Recherche par numéro (locale) | `search-number` + `search-submit` (form, autofocus) | Entrée / clic | Normalise (`31040` → `31040-1`), cherche dans le dossier de données et la collection | Numéro invalide → `add-errors` « n'est pas un numéro de set » ; « Recherche… » dans la topbar (`busy`) | add | Ajouter › Étape 1 Fichiers, voie « Par numéro » | ☑ |
| D2 | Note de variante | `variant-note` | Numéro sans variante | « Lu comme 90021-1 (variante -1 supposée…) » | — | add | Ajouter › Étape 1, sous le champ numéro | ☑ |
| D3 | Import local rapide (glisser-déposer) | `dropzone` (états normal / `over`) | Drop de fichiers | Prépare (`stage`) `.mpd`, `.ldr`, `.pdf`, `.json` sans Internet | Formats refusés listés (« format non pris en charge ») ; progression « Préparation des fichiers (i/n)… » | add | Ajouter › Étape 1, voie « Depuis mes fichiers » : grande zone de dépôt | ☑ |
| D4 | Import local rapide (sélecteur) | `quick-input` (multiple) | Choix de fichiers | Idem D3 | — | add, lib | Ajouter › Étape 1, bouton « Choisir des fichiers » dans la zone de dépôt | ☑ |
| D5 | Ressources : dossier de données | `SourcesPanel` `source-local` | Après recherche | « N modèle(s) 3D et N notice(s) trouvés (laissés en place, ajoutés à la sélection) » / « rien pour ce numéro… » | — | add | Ajouter › Étape 1, liste des sources (Dossier de données) | ☑ |
| D6 | **Chercher en ligne (OMR, Rebrickable)** | `search-online` | **Clic explicite** | Contacte l'OMR (et Rebrickable si clé) via le serveur | Libellé dynamique « (OMR, Rebrickable) » ; « Recherche en ligne… » ; absent si hors ligne → « Accès Internet désactivé. » ou « Numéro non LEGO : pas de recherche OMR. » | add, filet | Ajouter › Étape 1, sources : bouton « Chercher en ligne » avec icône globe et mention « contacte Internet, seulement sur ce clic » ; hors ligne : note « Accès Internet désactivé… (BRICK_LAB_ONLINE=0) » | ☑ |
| D7 | Statut OMR | `omr-status` | Après D6 | Message (n modèles dont alternatifs / aucun / indisponible 503…) | — | add | Ajouter › Étape 1, sources (OMR) | ☑ |
| D8 | **Télécharger un modèle OMR** | `omr-download-<fichier>` par modèle | **Clic explicite** | Télécharge, ajoute à la sélection ; « téléchargé ✓ » | Un téléchargement à la fois ; erreur « Téléchargement impossible » | add | Ajouter › Étape 1, sources (OMR) : « Télécharger » avec icône globe | ☑ |
| D9 | Lien page OMR | « Ouvrir la page de l'OMR ↗ » | Clic | Nouvel onglet externe (page du set ou recherche) | — | add | Ajouter › Étape 1, sources (OMR), lien externe ↗ | ☑ |
| D10 | Notices LEGO (manuel) | `source-lego` + `lego-link` | Clic | Explique le téléchargement manuel, ouvre la page officielle | Aucune récupération automatique | add | Ajouter › Étape 1, sources (Notices LEGO), lien externe ↗ | ☑ |
| D11 | Rebrickable (métadonnées facultatives) | `source-rebrickable` | Après D6 | Nom, année, nb de pièces annoncé (indicatif) ou « non configuré » | Sans clé API : message | add | Ajouter › Étape 1, sources (Rebrickable) | ☑ |
| D12 | Rien trouvé | `nothing-found` | OMR vide et aucun fichier | « Aucun modèle 3D trouvé… import rapide » | — | add | Ajouter › Étape 1, état vide de la recherche | ☑ |
| D13 | Fichiers sélectionnés : modèles | `ResourcesPanel` `model-card` | Après préparation | Nom, taille, provenance, auteur, licence, lien source, « déjà dans la bibliothèque » ; bouton « Retirer » | — | add | Ajouter › Étape 2 Vérification, cartes de fichiers modèles | ☑ |
| D14 | Choix des constructions | `build-choice` : case `build-check`, nom `build-label`, pièces/étapes/sous-modèles | Édition | Coche/nomme chaque modèle racine | Déjà en collection → case désactivée + `already-in-collection` (lien « Ouvrir ») ; modèle non référencé : note « construction alternative possible » ; pièces absentes de la bibliothèque (6 premières) | add | Ajouter › Étape 2, choix des constructions dans la carte du modèle | ☑ |
| D15 | Détails avancés | `<details>` du modèle | Clic | SHA-256, stats par racine, diagnostics ; « Construire un autre modèle du fichier » (`extra-root`) | — | — | Ajouter › Étape 2, section repliable « Détails avancés » | ☑ |
| D16 | Notices PDF et associations | `pdf-card`, `pdf-row`, cases `pdf-assoc` | Édition | Associer chaque notice à une ou plusieurs constructions ; « proposée, non vérifiée » / « liée par les correspondances » | PDF invalide → problème inline ; message « Plusieurs constructions… » | add | Ajouter › Étape 2, carte Notices PDF | ☑ |
| D17 | Correspondances trouvées | `mapping-card` radios (`mapping-<nom>`) | Choix | Reconnues par l'empreinte exacte du modèle ; état valide / incomplète | « Aucune » possible | add | Ajouter › Étape 2, carte Correspondances | ☑ |
| D18 | Fichiers refusés | `rejected` | Auto | Liste nom + raison (ex. « concernent un autre modèle ») | — | add | Ajouter › Étape 2, liste « Fichiers refusés » (alerte) | ☑ |
| D19 | **Diagnostic de compatibilité** | `compatibility` → `compat-card` : nom, pièces, modes, `compat-headline`, lignes ok/warn/error/info | Auto | Fiche par construction cochée : modes disponibles et pourquoi | — | add | Ajouter › Étape 2, une fiche de compatibilité par construction (badge de qualité, modes, raisons) | ☑ |
| D20 | Notice sans modèle | `pdf-only` | Seulement des PDF | « Notice trouvée sans modèle 3D : pas de construction interactive disponible. » | — | add | Ajouter › Étape 2, alerte « Notice sans modèle 3D » | ☑ |
| D21 | Set déjà en collection | `existing-set` radios `target-existing` / `target-new` | Auto | Ajouter au set existant (alternative) ou créer un second set | Progression existante non touchée | add | Ajouter › Étape 3 Confirmation, choix de la cible | ☑ |
| D22 | Confirmation | `confirm` : `confirm-number`, `confirm-name`, mention locale, `confirm-blocker`, `import-submit` | Clic | Ajoute à la collection (copie dans `library/`, SHA-256) | Bloqueurs : « Coche au moins une construction », « Donne un nom… », « Saisis le numéro du set » ; numéro en lecture seule s'il vient de la recherche ; nom par défaut Rebrickable → OMR → set existant → titre du modèle | add | Ajouter › Étape 3 + barre d'action collante en bas (bloqueur + bouton primaire `import-submit`) | ☑ |
| D23 | Résultat | `import-done` : titre, `already-present`, correspondances conservées, fichiers ajoutés/réutilisés, `import-build`, « Voir le set », « Ma collection », `add-another` | Après confirmation | Liens directs vers l'atelier (4 max) | « Ajouter un autre set » réinitialise tout | add | Ajouter › Étape 4 Prêt (« Construire « … » » en primaire) | ☑ |
| D24 | Indicateur d'activité | Topbar `busy` (role=status) | Toute opération | Texte d'état (Analyse des fichiers…, Ajout à la collection…) | Bouton Rechercher désactivé pendant | add | Barre d'app de `/ajouter` (`busy`, `role=status`) + indicateur d'activité dans l'étape en cours | ☑ |
| D25 | Erreurs | `add-errors` role=alert | Échecs | Liste des erreurs | — | add | Ajouter › Étape 1, alerte sous les deux entrées (`add-errors`) | ☑ |

## E. Ouverture d'une construction de bibliothèque (`/atelier/[buildId]`)

| ID | Fonctionnalité | Emplacement actuel | Déclencheur | Ce qu'elle fait | Cas particuliers | E2E | Nouvel emplacement | Vérifié |
|---|---|---|---|---|---|---|---|---|
| E1 | Étapes de chargement | `LibraryAtelier` `.atelier-wait` | Ouverture | « Vérification des fichiers… » → « Chargement du modèle… » → « Lecture de la progression… » → « Chargement des notices (i/n)… » | Texte seul, pas d'indicateur visuel | lib | Atelier › écran de chargement : indicateur d'activité + liste des étapes (l'étape en cours en gras) | ☑ |
| E2 | Erreur bloquante | `atelier-error` (role=alert) | Fichier modèle invalide/absent/empreinte | « Impossible d'ouvrir cette construction », raison, « Rien n'a été chargé à la place… », lien « Réparer depuis le détail du set » | Aucun substitut chargé | lib | Atelier › écran d'erreur (illustration, raison, « Réparer depuis le détail du set » en primaire) | ☑ |
| E3 | Choix entre deux sauvegardes | `ChoiceScreen` (`progress-choice`) : tableau `save-diff`, case `choice-with-mapping`, `choice-library` / `choice-browser` | Sauvegardes divergentes | Choix explicite, l'autre conservée | Variante « sauvegarde bibliothèque ne correspond plus » | lib | Atelier › écran de choix : deux cartes côte à côte (Bibliothèque / Ce navigateur) + tableau de différences | ☑ |
| E4 | Notes d'ouverture | Bannière `atelier-notes` + « OK » | Migration/choix/notices non chargées | Explique ce qui a été repris ou non | Fermable | lib | Atelier › bannière d'information sous la barre d'app, fermable | ☑ |
| E5 | Ouverture automatique modèle + notices | `BrickLabApp initial` | Auto | Modèle et livrets chargés depuis la bibliothèque ; dernier livret affiché à la page sauvegardée | Pas d'import manuel possible dans ce contexte | lib, lib-omr | Inchangé (chargement automatique) | ☑ |

## F. Atelier — cadre commun

| ID | Fonctionnalité | Emplacement actuel | Déclencheur | Ce qu'elle fait | Cas particuliers | E2E | Nouvel emplacement | Vérifié |
|---|---|---|---|---|---|---|---|---|
| F1 | Topbar de l'atelier | `header.topbar` | — | Navigation (nav), nom du fichier (atelier autonome), indicateurs de partie | — | toutes | Atelier › Barre d'app (fil d'Ariane, mode, progression, sauvegarde, aide, thème) | ☑ |
| F2 | Indicateur d'étape | `step-indicator` | Modes guidé et synchronisé | « Étape i / n » | — | brick, sync | Atelier › Barre d'app, sous le compteur de progression | ☑ |
| F3 | Étape de notice | `notice-step` | Mode synchronisé | « Notice : Étape 2 (×2), p. 2 » | — | sync | Atelier › Barre d'app, sous le compteur (mode synchro) + carte d'étape du panneau Notice | ☑ |
| F4 | Mode courant | Texte « Montage libre » | Mode libre | Indique le mode | Guidé/synchro : pas de libellé de mode dans la topbar | — | Atelier › Barre d'app, sélecteur de mode segmenté (mode actif) | ☑ |
| F5 | **Progression** | `progress` | Partie en cours | « x/y pièces posées » | Toujours visible pendant une partie | toutes | Atelier › Barre d'app, barre de progression + « x/y pièces posées » (`progress`) | ☑ |
| F6 | Détail montage libre | `free-info` | Pièces libres | « N posée(s) librement · a à leur place dans le modèle » | — | fb | Atelier › Barre d'app, sous le compteur (`free-info`) | ☑ |
| F7 | État de sauvegarde | `save-state` (bibliothèque) / « Sauvegardé localement » (autonome) | Auto | Enregistrement… / Enregistré dans la bibliothèque / Non enregistré : … (role=alert) | Erreur et conflit en rouge | lib | Atelier › Barre d'app, état de sauvegarde (icône + texte ; erreur en rouge, `role=alert`) | ☑ |
| F8 | Conflit de sauvegarde | Bannière `save-conflict` + « Recharger » | Autre onglet a écrit | Explique et propose de recharger | — | lib | Atelier › bannière d'alerte sous la barre d'app + « Recharger » | ☑ |
| F9 | Bannière bibliothèque | `banner` (notes E4) | — | Sous la topbar | — | lib | Atelier › bannière sous la barre d'app | ☑ |
| F10 | Séparateur redimensionnable | `Splitter` (`splitter`, role=separator) | Glisser / double-clic / ← → (Maj ×5) / Home / End / Entrée | Largeur du panneau latéral, mémorisée par contexte (atelier/éditeur) en localStorage, en proportion | Bornes : panneau ≥ 280 px, vue 3D ≥ 320 px ; pendant le glisser la vue 3D ignore le pointeur | ux | Atelier › séparateur (poignée visible) + bouton de repli du panneau | ☑ |
| F11 | Onglets du panneau | `nav.tabs role=tablist` : Modèle / Notice PDF / Correspondances | Clic | Change le contenu du panneau | « Correspondances » seulement si un modèle est chargé ; pas de navigation flèches ; mode synchro bascule auto sur Notice | sync, ux | Atelier › panneau, onglets Démarrer/Étape · Notice · Correspondances (`role=tablist`, flèches ←/→, `tabpanel`) | ☑ |
| F12 | Toast de l'atelier | `message` (role=status), en bas à gauche de la vue 3D | Chaque action | Consignes, succès (vert), erreurs (rouge) | Persistant jusqu'au message suivant ; `pointer-events:none` ; peut être long (consignes complètes des raccourcis) | toutes | Atelier › toast en bas à gauche de la scène (résultats, fermeture ×) ; consignes → légende de la scène (A6) | ☑ |
| F13 | Recentrer la caméra | Bouton « Centrer » (barre du bac) | Clic | Replace la caméra sur le modèle | — | ux, brick | Atelier › rail d'outils de la scène, icône « Centrer » (`aria-label`) | ☑ |

## G. Atelier — panneau Modèle, diagnostic et choix du mode

| ID | Fonctionnalité | Emplacement actuel | Déclencheur | Ce qu'elle fait | Cas particuliers | E2E | Nouvel emplacement | Vérifié |
|---|---|---|---|---|---|---|---|---|
| G1 | Résumé du modèle | `ModelSummary` : titre, `quality`, pièces (`occurrence-count`), références, couleurs, sous-modèles, étapes (`step-count` + type), auteur, licence | Après import | Fiche du modèle | — | brick | Atelier › onglet Modèle : cartes de mode d'abord, puis résumé du modèle | ☑ |
| G2 | **Badge de qualité** | `quality` (`q-INVALID / ANALYSABLE / RENDERABLE / MANUAL_ONLY / GUIDED_PLAYABLE`) | — | Invalide / Analysable (rendu incomplet ou non vérifié) / Affichable / Montage libre uniquement / Jouable avec étapes 3D | Couleurs rouge/ambre/bleu/vert | brick | Atelier › onglet Démarrer, badge de qualité (`QualityBadge`) | ☑ |
| G3 | Choix du modèle principal | Select « Modèle principal » | Plusieurs candidats (autonome) | Ré-analyse avec la racine choisie | Bibliothèque : texte seul (identité figée) | — | Atelier › onglet Démarrer, sélecteur « Modèle principal » | ☑ |
| G4 | État du rendu | `render-status` | — | « Géométrie LDraw : N combinaison(s), M référence(s) manquante(s), t ms » ou « Rendu indisponible : <raison> » | — | brick | Atelier › onglet Démarrer, ligne d'état du rendu | ☑ |
| G5 | **Pièces absentes** | `missing-parts` | Pièces non trouvées | Liste des références absentes de la bibliothèque locale | — | brick | Atelier › onglet Démarrer, alerte « Pièces absentes » (rouge) | ☑ |
| G6 | **Vérification d'inventaire** | `inventory-check` (role=note si non cohérent) | — | ✓ cohérent / ⚠ indéterminé / incomplet / non vérifié contre la notice officielle | — | omr | Atelier › onglet Démarrer, ligne d'inventaire | ☑ |
| G7 | Raisons de classement | `ul.reasons` | — | Motifs du classement qualité | — | — | Atelier › onglet Démarrer, raisons sous le badge | ☑ |
| G8 | Diagnostics détaillés | `<details>` « Diagnostics (n problème(s), m info(s)) » | Clic | Liste [severity] message (ligne) — 200 max | — | — | Atelier › onglet Démarrer, section repliable Diagnostics | ☑ |
| G9 | **Démarrer — notice synchronisée** | Bouton primaire | Clic | `start('synced')`, bascule sur l'onglet Notice | Affiché seulement si correspondances valides | sync | Atelier › onglet Modèle, carte « Notice synchronisée » (bouton « Commencer — notice synchronisée ») | ☑ |
| G10 | **Démarrer — mode guidé** | Bouton (primaire si pas de synchro) | Clic | `start('guided')` | Affiché seulement si le fichier a des étapes | brick | Atelier › onglet Modèle, carte « Mode guidé » (bouton « Commencer — mode guidé ») | ☑ |
| G11 | **Montage libre (avec notice)** | Bouton secondaire | Clic | `start('freeManual')` | Toujours proposé si jouable | brick, fb | Atelier › onglet Modèle, carte « Montage libre » (bouton « Montage libre (avec notice) ») | ☑ |
| G12 | **Étapes non disponibles** | Texte sous les boutons | `plan.kind === 'NO_STEPS'` | « Étapes non disponibles dans ce fichier : aucune séquence n'est inventée. » | — | brick | Atelier › onglet Modèle, carte « Mode guidé » sans bouton, avec ce texte ; info du sélecteur de mode | ☑ |
| G13 | **Disponibilité de la synchro** | `sync-availability` | Modèle jouable | « Notice synchronisée disponible : N étape(s)… » ou « indisponible : <raison> » + bouton « Créer / Modifier les correspondances » | — | sync | Atelier › onglet Modèle : carte « Notice synchronisée » (raison si indisponible) + ligne `sync-availability` et bouton Créer/Modifier les correspondances | ☑ |
| G14 | **Visualisation seulement** | Texte | Non jouable (ANALYSABLE) | « Visualisation seulement tant que des pièces manquent. » | Aucun bouton de démarrage | brick, filet | Atelier › onglet Modèle : note « Visualisation seulement… » (+ cause bibliothèque LDraw) à la place des cartes | ☑ |
| G15 | Importer un autre modèle | Label-bouton (atelier autonome) | Choix de fichier | Remplace le modèle courant | Absent en bibliothèque | brick | Atelier › onglet Démarrer, bouton secondaire « Importer un autre modèle » (input dans l'`<aside>`) | ☑ |
| G16 | Aucun modèle | Texte « Aucun modèle importé. » | Onglet Modèle vide | — | — | — | Atelier › scène : écran d'accueil de l'atelier autonome ; onglet Modèle : « Aucun modèle importé. » | ☑ |

## H. Mode guidé (étapes LDraw)

| ID | Fonctionnalité | Emplacement actuel | Déclencheur | Ce qu'elle fait | Cas particuliers | E2E | Nouvel emplacement | Vérifié |
|---|---|---|---|---|---|---|---|---|
| H1 | Emplacements de l'étape | Scène : fantômes bleus | Mode guidé, « Montrer les emplacements » coché par défaut | Affiche les cibles de l'étape active | — | brick | Atelier › scène (fantômes) ; rail d'outils « Montrer les emplacements » | ☑ |
| H2 | Prendre une pièce | Bac → clic sur une pièce | Clic | Pièce en main, suit le pointeur ; consigne dans le toast | Orientation par défaut = 1re orientation cible | brick | Atelier › bac | ☑ |
| H3 | Aimantation sur la cible | Scène | Survol | La pièce se pose sur la surface visée ; cible trouvée → `target-found` « emplacement trouvé, clic pour poser » | — | brick, surf | Atelier › scène + HUD (« emplacement trouvé », vert) | ☑ |
| H4 | Poser | Clic dans la scène | Clic | `tryPlace` ; succès « Pièce posée (x/y) » ; refus explicite (« Trop loin », orientation…) | Clic avec glissement ≤ 4 px = clic ; > 4 px = orbite | brick, surf | Atelier › scène ; résultat en toast | ☑ |
| H5 | Passage à l'étape suivante | Auto | Étape complète | `step-indicator` avance | — | brick | Atelier › Barre d'app (étape) + panneau, onglet Étape | ☑ |
| H6 | Fin de modèle | Pied : « Modèle terminé : y/y pièces. » + « Recommencer » ; toast « Bravo, modèle terminé ! » | Dernière pièce | — | « Recommencer » demande confirmation en bibliothèque | brick | Atelier › bloc de fin dans la zone du bac (« Recommencer » → modale de confirmation) | ☑ |
| H7 | Niveau manuel | PageUp/PageDown ; `held-info` « Niveau manuel i/n (A : auto) » ; A = auto | Clavier | Choisit un niveau du modèle quand la surface ne suffit pas | — | surf | Atelier › HUD (« Niveau manuel i/n ») ; légende contextuelle | ☑ |
| H8 | Infos de la pièce en main | `held-info` dans la barre du bac | Pièce en main | Niveau, rotation, orientation i/n, cible trouvée | — | brick | Atelier › HUD | ☑ |
| H9 | Réinitialiser l'étape | Bouton « Réinitialiser l'étape » | Clic | Retire les pièces de l'étape active | Pas de confirmation | filet | Atelier › colonne d'actions du bac, bouton discret « Réinitialiser l’étape » | ☑ |
| H10 | Pièce posée non sélectionnable | Scène | — | En guidé, un clic sur une pièce posée ne fait rien | — | fh | Inchangé | ☑ |

## I. Notice synchronisée (mode `synced`)

| ID | Fonctionnalité | Emplacement actuel | Déclencheur | Ce qu'elle fait | Cas particuliers | E2E | Nouvel emplacement | Vérifié |
|---|---|---|---|---|---|---|---|---|
| I1 | Page pilotée par l'étape | `PdfPanel` + effet `showStepPage` | Changement d'étape | La page du livret de l'étape s'affiche | Légende « page pilotée par l'étape de notice en cours » | sync | Atelier › panneau Notice | ☑ |
| I2 | Bannière d'étape | `SyncStepBanner` (`sync-banner`) : `sync-step`, livret, `sync-page`, position sur la page (« 1re étape imprimée sur 2 »), pièces de l'étape | Auto | Contexte de l'étape au-dessus du PDF | État « consultation » (ambre) | sync | Atelier › panneau Notice, carte d'étape au-dessus de la page | ☑ |
| I3 | Livret non ouvert | `sync-missing-booklet` | Livret attendu absent | « Livret non ouvert : importe « x » (n p.)… Un autre PDF ne sera pas utilisé à sa place. » | — | sync | Atelier › carte d'étape, alerte « Livret non ouvert » | ☑ |
| I4 | Page hors étape | `sync-off-page` + « Revenir à la p. N » | Navigation manuelle | Avertit et propose de revenir | — | sync | Atelier › carte d'étape, alerte + « Revenir à la p. N » | ☑ |
| I5 | Consulter une étape passée | « ◀ Étape précédente », « Étape suivante ▶ », « Revenir à l'étape en cours » | Clic | Surligne les pièces de l'étape consultée | Pièce en main relâchée | sync | Atelier › carte d'étape, navigation ◀ ▶ + « Revenir à l'étape en cours » | ☑ |
| I6 | Reprendre depuis une étape | `sync-rewind` | Clic | Retire les pièces des étapes suivantes ; toast explicatif | **Destructif sans confirmation** (réversible par Annuler ? non vérifié) | sync | Atelier › carte d'étape, « Reprendre depuis cette étape » → confirmation (A5) | ☑ |
| I7 | Seules les pièces de l'étape | Bac | Auto | Le bac ne propose que l'étape | — | sync | Atelier › bac | ☑ |
| I8 | Avance automatique | Auto | Étape terminée | Toast « Étape 1 terminée ! Suivante : Étape 2 (×2), p. 2. » | — | sync | Atelier › toast + barre d'app | ☑ |
| I9 | Repli si correspondances invalides | Auto | Mapping effacé/invalide, ou reprise sans mapping valide | Passe en montage libre, pièces conservées, toast d'erreur explicite | — | sync | Atelier › toast d'erreur + sélecteur de mode | ☑ |

## J. Montage libre

| ID | Fonctionnalité | Emplacement actuel | Déclencheur | Ce qu'elle fait | Cas particuliers | E2E | Nouvel emplacement | Vérifié |
|---|---|---|---|---|---|---|---|---|
| J1 | Placement au pointeur | Scène | Survol + clic | La pièce se pose sur la surface visée (grille ½ tenon) ; « pose libre » / « à sa place dans le modèle » | — | fb, surf | Atelier › scène + HUD (« pose libre » / « à sa place ») | ☑ |
| J2 | Barre de manipulation (pièce en main) | `manip-bar` en haut de la vue 3D | Pièce en main | Ligne d'état (`held-info`, `height-info` « bas à N LDU du sol », `orientation-info` « Dessus : … · Avant : … ») + commandes | — | fh, f3d | Atelier › HUD en haut à gauche de la scène (`held-info`, `height-info`, `orientation-info`) + barre contextuelle « en main » en haut de la scène | ☑ |
| J3 | Hauteur libre | `lift-up` « ▲ Monter », `lift-down` « ▼ Descendre » ; PageUp/PageDown | Clic/clavier | Monte/descend d'un pas | Maj : 1 LDU | fh | Atelier › barre contextuelle « en main » (haut de la scène), flèches ↑ ↓ (Page ↑ / Page ↓) | ☑ |
| J4 | Pas de hauteur | Segmenté `step-8` / `step-1` (8 LDU / 1 LDU) | Clic | Choisit le pas | — | fh | Atelier › barre contextuelle « en main », segmenté 8 LDU / 1 LDU | ☑ |
| J5 | Hauteur auto | `height-auto` (A) | Clic/clavier | Revient à la surface | Désactivé si déjà auto | fh | Atelier › barre contextuelle « en main », bouton « Auto » (A) | ☑ |
| J6 | Rotations X/Y/Z | Groupe « Rotations » : `rot-step-90/45/15/5/1` (pas de rotation, 90° par défaut) ; `rot-x-minus/plus`, `rot-y-…`, `rot-z-…` (± un pas) ; X/Y/Z (Maj : sens inverse) ; R = Y | Clic/clavier | Tourne la pièce en main, ou la sélection sur place | Axes colorés (X rouge, Y vert, Z bleu) dessinés sur la pièce en main. Modes guidé / synchronisé : barre « en main » réduite (`manip-bar` : X/Y/Z ± 90°, sans choix du pas, et « Lâcher ») ; une orientation absente du modèle est signalée « orientation hors modèle » dans `held-info`, O revient à celles du modèle | f3d, brick | Atelier › barre contextuelle (en main et sélection), groupe pas 90° 45° 15° 5° 1° · X − + · Y − + · Z − + | ☑ |
| J7 | Orientation suivante | O ; bouton « Orientation suivante (O) » (barre du bac) | Clavier/clic | Parcourt les orientations cibles du modèle | Bouton seulement s'il y a > 1 orientation ; inactif pour un groupe | surf | Atelier › colonne d'actions du bac (« Orientation suivante ») ; touche O | ☑ |
| J8 | Remettre dans le stock (en main) | `remove-piece` « Remettre dans le stock (Suppr) » | Clic / Suppr / ⌫ | Retire la pièce ou le groupe repris | — | fb | Atelier › barre contextuelle « en main », « Au stock » (Suppr) | ☑ |
| J9 | Lâcher / laisser en place | `cancel-held` « Lâcher (Échap) » / « Laisser en place (Échap) » | Clic / Échap | Annule la prise | — | fb | Atelier › barre contextuelle « en main », « Lâcher » / « Laisser en place » (Échap) | ☑ |
| J10 | Sélection | Clic sur une pièce posée ; Maj+clic ajoute/retire ; clic dans le vide vide la sélection | Souris | Sélection surlignée (ambre) ; toast de consignes | — | fh, f3d | Atelier › scène ; HUD « N pièce(s) sélectionnée(s) » | ☑ |
| J11 | Barre de manipulation (sélection) | `manip-bar` : `selection-info`, `orientation-info`, `gizmo-coords` | Sélection non vide | État + commandes de sélection | — | fg | Atelier › HUD (`selection-info`, orientation, `gizmo-coords`) + barre contextuelle « sélection » en haut de la scène | ☑ |
| J12 | Manipulateur : flèches/anneaux | Segmenté `gizmo-translate` « Flèches » (W) / `gizmo-rotate` « Anneaux » (E) | Clic/clavier | Mode du gizmo | — | fg | Atelier › barre contextuelle « sélection », segmenté Flèches / Anneaux (icônes, W / E) | ☑ |
| J13 | Manipulateur : axes | Segmenté `gizmo-world` « Globaux » / `gizmo-local` « Locaux » (Q bascule) | Clic/clavier | Repère du gizmo | — | fg | Atelier › barre contextuelle « sélection », segmenté Globaux / Locaux (icônes, Q) | ☑ |
| J14 | Manipulateur : pas | Select `gizmo-step` (½ tenon / tenon / 1 LDU) ; anneaux : le pas de rotation de J6 | Choix | Pas des flèches et des anneaux | ⌥ pendant le glisser : sans pas ; grille désactivée → pas libre | fg | Atelier › barre contextuelle « sélection », ligne « Réglages » (`manip-settings`) : pas des flèches | ☑ |
| J15 | Coordonnées saisies | Champs `gizmo-x/y/z` + `gizmo-apply` (Entrée) | Saisie | Déplace la sélection au point saisi (Y = hauteur au-dessus du sol) | Virgule acceptée ; invalide → « Coordonnées invalides. » | fg | Atelier › ligne « Réglages » de la barre « sélection » : coordonnées X Y Z + Appliquer (Entrée) | ☑ |
| J16 | Glisser du gizmo | Scène : flèches et anneaux | Glisser | Déplace/tourne par pas depuis le début du glisser ; un seul Annuler | Échap pendant le glisser : annule ; autres touches ignorées pendant le glisser | fg | Atelier › scène (gizmo) ; inchangé | ☑ |
| J17 | Déplacer la sélection | `move-selection` « Déplacer (M) » ; M | Clic/clavier | Prend la sélection en main (groupe rigide) | — | fh | Atelier › barre contextuelle « sélection », « Déplacer » (M) | ☑ |
| J18 | Sélection au stock | `remove-selection` « Au stock » ; Suppr/⌫ | Clic/clavier | Remet les pièces sélectionnées dans le stock | Pas de confirmation ; annulable | fb | Atelier › barre contextuelle « sélection », « Au stock » (Suppr) | ☑ |
| J19 | Sélectionner l'assemblage | `select-assembly` « Assemblage » ; double-clic sur une pièce ; Maj + double-clic | Clic / double-clic (< 400 ms) | Sélectionne toutes les pièces reliées par connexions reconnues, même cachées ; avec Maj, les ajoute à la sélection (plusieurs assemblages ensemble) | Aucune → toast explicatif (clips, barres, charnières non reconnus) | f3d, fah | Atelier › barre contextuelle « sélection », « Assemblage » ; double-clic dans la scène | ☑ |
| J20 | Voir les connexions | `xray` (aria-pressed) | Bascule | Autres pièces transparentes (affichage seulement) | Actif seulement avec sélection et rien en main | f3d | Atelier › rail d'outils, bouton « Voir les connexions » (présent avec une sélection et rien en main) | ☑ |
| J21 | Désélectionner | `clear-selection` ; Échap | Clic/clavier | Vide la sélection | — | fh | Atelier › barre contextuelle « sélection », bouton × (Échap) | ☑ |
| J22 | Glisser direct d'une pièce posée | Scène | Appui + déplacement > 4 px | Prend la pièce (ou la sélection si elle en fait partie ; Maj au départ l'ajoute) et la pose au relâchement | La caméra est suspendue pendant le glisser ; Échap annule | f3d | Atelier › scène ; inchangé | ☑ |
| J23 | Aimant pièces (tenons/réceptacles, goupilles/trous, axes) | Case `snap-pieces` « Aimant pièces » ; ⌥ maintenu l'ignore | Survol | Propose l'emboîtement ; `snap-info` « aimant : N tenon(s) emboîté(s) sur k pièce(s) (⌥ : ignorer) » ; points verts sur les connecteurs | — | fc, f3d | Atelier › rail d'outils (« Aimant pièces », `aria-pressed`) + HUD (`snap-info`) | ☑ |
| J24 | Explication d'absence d'aimant | `snap-miss` | Survol | « aucune connexion reconnue… », « axes non alignés — tourne la pièce », « connecteurs déjà occupés » | — | fc | Atelier › HUD (`snap-miss`, ambre) | ☑ |
| J25 | Aimant modèle | Case `snap-model` « Aimant modèle » | Bascule | La pièce se cale sur sa place officielle quand elle en est proche | — | fc | Atelier › rail d'outils (« Aimant modèle ») | ☑ |
| J26 | Grille | Case `snap-grid` « Grille » ; G | Bascule | Grille ½ tenon et niveaux de plaque | — | — | Atelier › rail d'outils (« Grille », G) | ☑ |
| J27 | Pièce reprise | Clic sur pièce posée puis… (voir J22) ; `held-info` « Pièce reprise · … » | — | Déplacer/tourner/retirer une pièce posée | — | fb | Atelier › scène + HUD (« Pièce reprise ») | ☑ |
| J28 | Déplacer un groupe | Groupe en main | Clic pour poser | Tout ou rien, un seul Annuler ; « Groupe de N pièces déplacé » | — | fh, fah | Atelier › scène + toast | ☑ |
| J29 | Fin de stock | Pied `free-done` | Toutes les pièces posées | « Toutes les pièces sont posées (y/y). Montage libre : ta construction n'est pas comparée au modèle officiel — a pièce(s) à leur place » ou « modèle reconstruit » | Honnêteté : jamais présenté comme le modèle officiel | fb | Atelier › panneau, écran de fin du montage libre (texte inchangé) + zone du bac | ☑ |
| J30 | Quitter le montage libre | Select `mode-select` | Changement | Pièces à leur place conservées ; pièces hors modèle → confirmation `mode-switch-confirm` (« Retirer et changer de mode » / « Rester en montage libre ») | Guidé reste strict | fb | Atelier › sélecteur de mode ; confirmation en modale (`mode-switch-confirm`) | ☑ |

## K. Bac de pièces et barre d'actions (pied de l'atelier)

| ID | Fonctionnalité | Emplacement actuel | Déclencheur | Ce qu'elle fait | Cas particuliers | E2E | Nouvel emplacement | Vérifié |
|---|---|---|---|---|---|---|---|---|
| K1 | Bac de pièces | `PartsTray` `ul.tray-items` (hauteur fixe 188 px, défilement interne) | Partie en cours | Une tuile par référence/couleur : miniature, « ×restant », référence | Hauteur fixe pour ne pas désynchroniser le picking 3D | ux, brick | Atelier › bac (hauteur fixe 188 px conservée) | ☑ |
| K2 | Miniatures réelles des pièces | `PartThumb` | Auto | Rendu local de la géométrie LDraw | Chargement (pastille couleur) ; absente → « forme indisponible » (`data-thumb=missing`) | ux | Atelier › bac, tuiles | ☑ |
| K3 | Pièce en main dans le bac | `.tray-item.held` + badge « en main » ; `aria-pressed` | Prise | Indique la pièce tenue | — | ux | Atelier › bac, tuile en main (contour accent + badge) | ☑ |
| K4 | Infobulle et label des tuiles | `title`, `aria-label` | Survol / lecteur d'écran | « 3001 · Red (4) · 2/4 à poser » ; « Pièce 3001, Red, 2 à poser » | — | ux | Inchangé (`title`, `aria-label`) | ☑ |
| K5 | Aucune pièce | « Aucune pièce à placer. » | Bac vide | — | — | — | Atelier › bac, état vide | ☑ |
| K6 | **Annuler** | Bouton « Annuler » ; ⌘Z / Ctrl+Z | Clic/clavier | Guidé/synchro : dernière pose ; libre : dernier changement (historique 200, perdu au rechargement), sinon dernière pièce | Désactivé si rien à annuler | toutes | Atelier › actions du bac, bouton « Annuler » (⌘Z affiché) | ☑ |
| K7 | Changer de mode | Select `mode-select` (`Mode`) | Choix | Bascule en gardant les pièces (voir J30) | Options filtrées selon la disponibilité | brick, fb, sync | Atelier › barre d'app, sélecteur segmenté (A3) ; modes indisponibles désactivés avec leur raison | ☑ |
| K8 | Montrer les emplacements | Case « Montrer les emplacements » | Bascule | Fantômes des cibles (toutes en guidé ; en libre, celles de la pièce tenue) | Cochée par défaut en guidé/synchro | filet | Atelier › rail d'outils (« Montrer les emplacements ») | ☑ |
| K9 | Poser à la position cible (aide) | `assist-place` | Clic (pièce en main) | Pose la pièce à l'emplacement libre le plus proche (accessibilité) | Désactivé sans pièce en main | surf, brick | Atelier › actions du bac, « Poser à la position cible (aide) » | ☑ |
| K10 | **Abandonner** | Bouton « Abandonner » → `confirm-restart` « Confirmer l'abandon » / « Annuler » | Clic | Efface la progression (bibliothèque : copie dans l'historique) | **Atelier autonome : aucune confirmation** (effacement immédiat du localStorage) | filet | Atelier › colonne d'actions du bac, « Abandonner » (discret, rouge) → modale de confirmation, atelier autonome compris (A5) | ☑ |
| K11 | Recommencer (fin) | Bouton dans `.done` | Clic | Même effet que K10 ; « Confirmer : recommencer » en bibliothèque | — | — | Atelier › bloc de fin de la zone du bac → même modale de confirmation | ☑ |

## L. Notice PDF

| ID | Fonctionnalité | Emplacement actuel | Déclencheur | Ce qu'elle fait | Cas particuliers | E2E | Nouvel emplacement | Vérifié |
|---|---|---|---|---|---|---|---|---|
| L1 | Importer une notice | `pdf-input` (« Importer une notice PDF » / « Ajouter / changer de livret ») | Choix de fichier | Lecture locale (File API), SHA-256, pas d'envoi | > 300 Mo, protégé, invalide → erreur role=alert ; 6 livrets max en mémoire | brick, sync | Atelier › panneau Notice, état vide (bouton d'import) puis icône « Ajouter un livret » | ☑ |
| L2 | Plusieurs livrets | Select `pdf-booklet` | Choix | Change de livret (page 1) | Visible si > 1 livret | sync | Atelier › panneau Notice, select de livret dans la barre | ☑ |
| L3 | Navigation | « ◀ » / « ▶ » (Page précédente/suivante), `pdf-page` « PDF p. i / n » | Clic | Page indépendante des étapes 3D (hors synchro) | Bornes désactivées | brick | Atelier › panneau Notice, barre : ‹ « PDF p. i / n » › (icônes, noms « Page précédente » / « Page suivante ») | ☑ |
| L4 | Zoom | « − » / « + », `pdf-zoom` (« Largeur » ou « N % »), « ↔ » Ajuster à la largeur | Clic | Ajusté à la largeur par défaut ; zooms fixes 50–300 % | — | ux, brick | Atelier › panneau Notice, barre : zoom − « Largeur » + et ↔ (icônes) | ☑ |
| L5 | Ajustement au panneau | ResizeObserver | Redimensionnement | Re-rendu net après 120 ms | Rendu sérialisé (pas de rendu concurrent) | ux | Inchangé | ☑ |
| L6 | Légende contextuelle | `p.muted` | — | « page PDF indépendante des étapes 3D » / « pilotée par l'étape » / « page de l'étape éditée » | — | — | Atelier › panneau Notice, légende sur une ligne au-dessus de la page (fichier — contexte) | ☑ |
| L7 | Rassurance confidentialité | Texte sans PDF | — | « Ta notice reste sur ce Mac… n'est pas sauvegardée. » | Atelier autonome ; en bibliothèque les livrets viennent de la bibliothèque | — | Atelier › panneau Notice, état vide | ☑ |
| L8 | Lecture en cours | « Lecture du PDF… » | Ouverture | — | — | — | Atelier › panneau Notice, indicateur « Lecture du PDF… » (role=status) | ☑ |
| L9 | Erreur de rendu | role=alert « Erreur de rendu de la page N. » | Échec | — | — | — | Atelier › panneau Notice, alerte | ☑ |
| L10 | Panneau redimensionnable | Voir F10 | — | — | — | ux | Atelier › séparateur + repli du panneau | ☑ |
| L11 | Lien LEGO.com | Accueil atelier autonome | Clic | Ouvre la page officielle (aucun téléchargement automatique) | — | — | Atelier › écran d'accueil de l'atelier autonome + Ajouter › Étape 1 (sources) | ☑ |

## M. Éditeur de correspondances (pages ↔ étapes)

| ID | Fonctionnalité | Emplacement actuel | Déclencheur | Ce qu'elle fait | Cas particuliers | E2E | Nouvel emplacement | Vérifié |
|---|---|---|---|---|---|---|---|---|
| M1 | Ouvrir l'éditeur | Onglet « Correspondances » ou bouton « Créer / Modifier les correspondances » | Clic | Crée un mapping vide si besoin ; panneau élargi (contexte « editor », 520 px) ; PDF compact | Pièce en main relâchée ; bac masqué | sync | Atelier › onglet Correspondances (panneau élargi) ; lien depuis la carte « Notice synchronisée » de l'onglet Démarrer | ☑ |
| M2 | Statut et couverture | `mapping-status` (Valide / Brouillon : n bloquant(s)), `mapping-coverage` | — | — | — | sync | Atelier › éditeur, en-tête | ☑ |
| M3 | Terminer l'édition | Bouton « Terminer l'édition » | Clic | Retour à l'onglet Notice (synchro) ou Modèle | — | sync | Atelier › éditeur, en-tête (bouton « Terminer l'édition ») | ☑ |
| M4 | Livrets | `<details>` « Livrets (n) » : renommer, état (ouvert / à réimporter), « Lier au PDF affiché », « Retirer », `add-booklet` « Ajouter le PDF affiché comme livret » | Clic | Gestion des livrets liés par empreinte | Retrait refusé si utilisé par des étapes | sync | Atelier › éditeur, section repliable Livrets | ☑ |
| M5 | Navigation entre étapes | « ◀ » / select `mapping-step-select` / « ▶ » | Clic/choix | Change l'étape éditée ; le PDF suit sa page | Option : « i. Étape — livret p. N (k) ✓ » | sync | Atelier › éditeur, barre de navigation d'étapes | ☑ |
| M6 | Nouvelle étape | `mapping-new-step` « + Nouvelle étape » | Clic | Insère après l'étape courante, au livret/page affichés | Sans livret → message | sync | Atelier › éditeur, barre de navigation (« + Nouvelle étape ») | ☑ |
| M7 | Champs de l'étape | Livret, `mapping-page`, « = page affichée (N) », `mapping-printed` (N° imprimé), `mapping-callout` (encadré), `mapping-repeat` (×), `mapping-verified`, note | Édition | Mise à jour immédiate + sauvegarde | — | sync | Atelier › éditeur, formulaire de l'étape en grille à libellés alignés | ☑ |
| M8 | Monter / descendre / supprimer l'étape | Boutons « ↑ Monter », « ↓ Descendre », « Supprimer l'étape » | Clic | Réordonne / supprime (pièces redeviennent non affectées) | Suppression sans confirmation | filet | Atelier › éditeur, sous le formulaire : « ↑ Monter », « ↓ Descendre », « Supprimer l’étape » (rouge, sans confirmation : inchangé, à arbitrer) | ☑ |
| M9 | Affecter en 3D | Clic sur pièce fantôme (affecter) ou surlignée (retirer) ; ⌥-clic : déplacer depuis une autre étape | Souris | Toast « ajoutée à / retirée de / déplacée dans » ; « déjà dans … : ⌥-clic pour la déplacer ici » | Aperçu 3D : construit jusqu'à l'étape, étape surlignée, non affectées en fantôme | sync | Atelier › scène ; consigne (icône clic) au-dessus des pièces de l’étape | ☑ |
| M10 | Pièces de l'étape | Chips + « −1 » (`step-remove-<clé>`) | Clic | Retire une pièce | — | sync | Atelier › éditeur, puces « Pièces de cette étape » | ☑ |
| M11 | Pièces non affectées | Chips + « +1 » (`unassigned-add-<clé>`), « +N » | Clic | Ajoute la 1re pièce libre (ordre du fichier) ou toutes | — | sync | Atelier › éditeur, puces « Non affectées » | ☑ |
| M12 | Aide étapes LDraw | Select « Étape LDraw » + `assign-ldraw-step` | Clic | Ajoute les pièces libres d'une étape LDraw | Avertit que le découpage diffère de la notice | sync | Atelier › éditeur, encadré « Aide : étapes LDraw » | ☑ |
| M13 | Doublons | `mapping-duplicates` + « Garder la première étape » | Clic | Résout les doublons | — | sync | Atelier › éditeur, alerte Doublons | ☑ |
| M14 | Validation | `<details>` « Validation (n remarque(s)) » `mapping-issues` + liens « voir » | — | Bloquant / attention / info | Ouvert par défaut si brouillon | sync | Atelier › éditeur, section repliable Validation | ☑ |
| M15 | Fantômes des étapes suivantes | Case « Montrer en fantôme les pièces des étapes suivantes » | Bascule | Aperçu 3D | — | sync | Atelier › éditeur, case sous la section Validation | ☑ |
| M16 | Exporter | `mapping-export` « Exporter (.json) » | Clic | Télécharge `.brick-mapping.json` (identifiants, pages, empreintes uniquement) | — | sync | Atelier › éditeur, pied : « Exporter (.json) » | ☑ |
| M17 | Importer | `mapping-import` « Importer un fichier de correspondances » | Choix | Refus si autre modèle ; sinon remplace (ancienne restaurable) | — | sync | Atelier › éditeur, pied : « Importer un fichier de correspondances » | ☑ |
| M18 | Tout effacer | « Tout effacer » → « Confirmer l'effacement » | Deux clics | Vide les correspondances (restaurables) | — | filet | Atelier › éditeur, pied : « Tout effacer » → modale de confirmation (« Confirmer l’effacement ») | ☑ |
| M19 | Restaurer les précédentes | « Correspondances précédentes remplacées. Les restaurer » | Clic | Annule un import ou un effacement | — | filet | Atelier › éditeur, avis « Correspondances précédentes remplacées » + lien « Les restaurer » | ☑ |
| M20 | Mention de confidentialité | Texte bas de l'éditeur | — | « Sauvegarde locale automatique… aucun contenu de la notice. » | — | — | Atelier › éditeur, pied de section | ☑ |

## N. Atelier sans collection — import manuel et reprise

| ID | Fonctionnalité | Emplacement actuel | Déclencheur | Ce qu'elle fait | Cas particuliers | E2E | Nouvel emplacement | Vérifié |
|---|---|---|---|---|---|---|---|---|
| N1 | Écran d'accueil de l'atelier | `.home` dans la vue 3D | Aucun modèle | Titre, pitch, « Importer un modèle (.mpd / .ldr) » (`model-input`), lien LEGO.com | Pas de glisser-déposer ici | brick | Atelier › scène, écran d'accueil autonome : « Importer un modèle » (`model-input`), « Essayer la démo », dépôt du fichier | ☑ |
| N2 | Contrôles du fichier | `onModelFile` | Import | Refus > 8 Mo ; refus hors `.ldr`/`.mpd` (« pas .io ni .lxf ») | Messages dans le toast | — | Toast d'erreur (inchangé) | ☑ |
| N3 | Analyse et chargement | `busy` : « Analyse du modèle… », « Chargement des géométries LDraw locales… » | Import | Texte sous le bouton | Pas de barre de progression | brick | Atelier › scène, écran de chargement avec indicateur d'activité | ☑ |
| N4 | Sessions récentes | `section.recent` | Sauvegardes navigateur | « nom — x/y pièces · réimporte le fichier pour reprendre » | Pas de bouton ; il faut réimporter | brick | Atelier › écran d'accueil autonome, « Sessions récentes de ce navigateur » (réimporter pour reprendre) | ☑ |
| N5 | Reprise par empreinte | `importText` → `restoreProgress` | Réimport du même fichier | « Progression restaurée : x/y pièces posées (dont N posée(s) librement). » | Mapping changé → étape recalculée ; synchro sans mapping → libre | brick, sync | Toast (inchangé) | ☑ |
| N6 | Correspondances illisibles | Toast d'erreur | Mapping stocké corrompu | « Correspondances enregistrées illisibles, ignorées : … » | — | — | Toast d'erreur (inchangé) | ☑ |

## O. Raccourcis clavier (atelier)

Ignorés quand le focus est dans un `input` ou un `select` (pas dans un `textarea`, ni dans un bouton).

| ID | Touche | Contexte | Effet | E2E | Nouvel emplacement | Vérifié |
|---|---|---|---|---|---|---|
| O1 | ⌘Z / Ctrl+Z | Partie en cours | Annuler | fb, fh | Aide `?` › Partie ; bouton Annuler (⌘Z affiché) | ☑ |
| O2 | R / Maj+R | Pièce en main | Quart de tour Y (+/−) | surf | Aide `?` › En main ; légende contextuelle | ☑ |
| O3 | R / Maj+R | Libre, sélection, rien en main | Rotation Y de la sélection sur place | f3d | Aide `?` › Sélection ; infobulles X/Y/Z | ☑ |
| O4 | X / Y / Z (Maj : sens inverse) | Libre, pièce en main ou sélection ; guidé/synchro, pièce en main | Rotation ± un pas (90° par défaut, jusqu'à 1°) autour de l'axe ; quart de tour en guidé/synchro | f3d, brick | Aide `?` › En main / Sélection ; infobulles de la barre contextuelle | ☑ |
| O5 | O | Pièce en main (pas un groupe) | Orientation suivante | surf | Aide `?` › En main ; barre contextuelle | ☑ |
| O6 | Échap | Pièce en main | Lâcher / laisser en place | fb | Aide `?` › En main ; légende | ☑ |
| O7 | Échap | Libre, sélection | Désélectionner | fh | Aide `?` › Sélection ; légende | ☑ |
| O8 | Échap | Glisser du gizmo | Annule le glisser | fg | Aide `?` › Manipulateur | ☑ |
| O9 | Suppr / ⌫ | Libre, pièce reprise ou groupe en main | Remettre dans le stock | fb | Aide `?` › En main ; infobulle « Remettre au stock » | ☑ |
| O10 | Suppr / ⌫ | Libre, sélection | Remettre la sélection dans le stock | fb | Aide `?` › Sélection ; infobulle « Au stock » | ☑ |
| O11 | A | Pièce en main | Hauteur / niveau auto | surf | Aide `?` › En main ; infobulle « Hauteur auto » | ☑ |
| O12 | PageUp / PageDown | Libre, pièce en main | Monter / descendre d'un pas (Maj : 1 LDU) | fh | Aide `?` › En main ; infobulles Monter/Descendre | ☑ |
| O13 | PageUp / PageDown | Guidé/synchro, pièce en main | Niveau du modèle supérieur / inférieur | surf | Aide `?` › Guidé | ☑ |
| O14 | G | Libre | Grille on/off | filet | Aide `?` › Scène ; infobulle du rail « Grille (G) » | ☑ |
| O15 | W / E | Libre, sélection, rien en main | Gizmo flèches / anneaux | fg | Aide `?` › Sélection ; infobulles Flèches/Anneaux | ☑ |
| O16 | Q | Libre, sélection, rien en main | Axes globaux ↔ locaux | filet | Aide `?` › Sélection ; infobulle Globaux/Locaux | ☑ |
| O17 | M | Libre, sélection, rien en main | Déplacer la sélection | fh | Aide `?` › Sélection ; infobulle Déplacer | ☑ |
| O18 | ⌥ maintenu | Libre, pièce en main / glisser du gizmo | Ignore l'aimant pièces / glisser sans pas | fc, fg | Aide `?` › En main / Manipulateur ; HUD « (⌥ : ignorer) » | ☑ |
| O19 | Entrée | Champ de coordonnées | Appliquer les coordonnées | fg | Réglages de manipulation (popover) | ☑ |
| O20 | ← → / Maj / Home / End / Entrée | Séparateur focalisé | Redimensionner / défaut | ux | Aide `?` › Panneaux ; infobulle du séparateur | ☑ |
| O21 | Entrée | Champ numéro (`/ajouter`) | Rechercher | add | Ajouter › Étape 1 | ☑ |

Aucune aide intégrée ne liste ces raccourcis : ils n'apparaissent que dans les toasts de consigne et les `title` des boutons.

## P. Souris et trackpad dans la scène 3D

| ID | Geste | Contexte | Effet | E2E | Nouvel emplacement | Vérifié |
|---|---|---|---|---|---|---|
| P1 | Glisser (vide) | Toujours | Orbite de la caméra (OrbitControls, sans inertie) | surf | Aide `?` › Caméra ; légende contextuelle | ☑ |
| P2 | Molette / pincement | Toujours | Zoom | — | Aide `?` › Caméra | ☑ |
| P3 | Clic droit glissé / deux doigts | Toujours | Panoramique (défaut OrbitControls) | — | Aide `?` › Caméra | ☑ |
| P4 | Survol | Pièce en main | Aperçu de la pose (surface visée, fantôme compatible, sol) | surf | Aide `?` › En main ; HUD | ☑ |
| P5 | Clic (≤ 4 px de glissement) | Pièce en main | Poser | surf | Aide `?` › En main ; légende | ☑ |
| P6 | Clic sur pièce posée | Libre, rien en main | Sélectionner ; Maj+clic : ajouter/retirer | fh | Aide `?` › Libre ; légende | ☑ |
| P7 | Clic dans le vide | Libre, rien en main | Vider la sélection | fh | Aide `?` › Libre | ☑ |
| P8 | Double-clic sur une pièce | Libre | Sélectionner l'assemblage connecté | f3d | Aide `?` › Libre ; légende « Double-clic : assemblage » | ☑ |
| P8b | Maj + double-clic sur une pièce | Libre | Ajouter son assemblage à la sélection | f3d (C2) | Aide `?` › Libre — sélection ; infobulle « Assemblage » | ☑ |
| P9 | Appui + glisser sur une pièce posée | Libre, rien en main | Glisser direct (caméra suspendue) ; Maj au départ : ajouter à la sélection | f3d | Aide `?` › Libre | ☑ |
| P10 | Glisser une flèche / un anneau | Libre, sélection | Gizmo (voir J16) | fg | Aide `?` › Manipulateur | ☑ |
| P11 | Clic sur pièce | Éditeur de correspondances | Affecter/retirer ; ⌥-clic : déplacer | sync | Aide `?` › Éditeur ; légende de l'éditeur | ☑ |
| P12 | Repères visuels | Libre | Axes X/Y/Z sur la pièce en main ; points verts des connexions ; grille au sol | fc | Scène, inchangé ; Aide `?` les décrit | ☑ |

## Q. États transverses

| ID | État | Où | Rendu actuel | E2E | Nouvel emplacement | Vérifié |
|---|---|---|---|---|---|---|
| Q1 | Chargement d'une vue (chunk) | Toutes les routes | « Chargement… » brut (padding 24 px) | — | Indicateur de chargement (spinner + texte) pendant le chargement de chaque vue | ☑ |
| Q2 | Chargement de la collection | `/` | Rien jusqu'à la réponse (pas d'état vide ni de squelette) | — | Collection › squelettes de cartes | ☑ |
| Q3 | Collection vide | `/` | B13 | lib, filet | Collection › écran d'accueil de premier lancement | ☑ |
| Q4 | Erreur de bibliothèque | `/`, `/sets/…` | Bannière rouge role=alert | — | Bannière d'alerte avec « Réessayer » | ☑ |
| Q5 | Chargement d'un modèle (atelier autonome) | `/atelier` | Texte `busy` | brick | Atelier › écran de chargement (indicateur + étape en cours) | ☑ |
| Q6 | Chargement d'une construction | `/atelier/[id]` | E1 (texte) | lib | Atelier › écran de chargement (étapes listées) | ☑ |
| Q7 | Modèle invalide | Atelier | Badge « Invalide », raisons, diagnostics, aucun bouton de démarrage | — | Atelier › onglet Démarrer : badge Invalide + raisons, aucune carte de mode active | ☑ |
| Q8 | Modèle analysable, géométrie manquante | Atelier | Badge ambre, `missing-parts`, G14 | brick, filet | Atelier › onglet Démarrer : badge, alerte Pièces absentes, « Visualisation seulement » | ☑ |
| Q9 | Modèle sans étapes | Atelier | Badge « Montage libre uniquement », G12 | brick | Atelier › onglet Démarrer : carte Guidé désactivée avec la raison | ☑ |
| Q10 | **Bibliothèque LDraw absente ou mal configurée** | Atelier, aperçus | « Rendu indisponible : Variable LDRAW_LIBRARY_DIR absente. » / « LDConfig.ldr introuvable… » / « Dossier de bibliothèque illisible. » / « Serveur local injoignable. » en rouge dans la zone 3D et `render-status` ; aperçus : « Aperçu indisponible : … » | filet | Atelier › scène : écran « Bibliothèque de pièces introuvable » (raison, étapes d'installation, Réessayer) ; collection : carte d'accueil ; aperçus : même message | ☑ |
| Q11 | **Mode hors ligne** (`BRICK_LAB_ONLINE=0`) | `/ajouter` | Bouton « Chercher en ligne » absent, remplacé par « Accès Internet désactivé. » ; l'import local reste complet | filet | Ajouter › Étape 1 : note « Accès Internet désactivé. Recherche en ligne et téléchargements coupés (BRICK_LAB_ONLINE=0) ; l’import local reste complet. », icône Wi-Fi barré | ☑ |
| Q12 | Rebrickable non configuré | `/ajouter` | Message dans `source-rebrickable` | add | Ajouter › Étape 1, source Rebrickable | ☑ |
| Q13 | Source en ligne indisponible | `/ajouter` | `omr-status` (ex. 503) | add | Ajouter › Étape 1, source OMR (statut d'erreur) | ☑ |
| Q14 | Sauvegarde en cours / enregistrée / erreur / conflit | Atelier bibliothèque | F7, F8 | lib | Atelier › Barre d'app (état de sauvegarde) + bannière de conflit | ☑ |
| Q15 | Stockage navigateur plein | Atelier autonome | Toast « Sauvegarde locale des correspondances impossible… » | — | Toast d'erreur | ☑ |
| Q16 | PDF trop gros / protégé / invalide | Panneau Notice | Erreur role=alert | — | Atelier › panneau Notice, alerte | ☑ |
| Q17 | Partie terminée | Atelier | H6 / J29 | brick, fb | Atelier › bloc de fin dans la zone du bac | ☑ |
| Q18 | Set inexistant | `/sets/…` | Texte + lien retour | — | Détail › état vide « Ce set n’est pas (ou plus) dans ta collection. » + « Retour à la collection » | ☑ |

## R. Comportements invisibles à préserver (non UI mais déclenchés par l'UI)

| ID | Comportement | Où | Note | Nouvel emplacement | Vérifié |
|---|---|---|---|---|---|
| R1 | Sauvegarde après chaque changement de partie ou de page PDF | `BrickLabApp` effet `saveProgress` | Dépend de `session`, `notice.view`, `mapping` | Inchangé | ☑ |
| R2 | Flush à la sortie (`pagehide`, démontage) | `BrickLabApp` | — | Inchangé | ☑ |
| R3 | Hooks de test `window.__brickLab*` | `BrickLabApp`, `BuildCanvas` (dev uniquement) | Indispensables au « joueur scripté » E2E | Inchangé (conservés) | ☑ |
| R4 | Largeur du panneau mémorisée par contexte | `localStorage` `LAYOUT_STORAGE_KEY` | Préférence navigateur | Inchangé (+ état replié du panneau) | ☑ |
| R5 | « Garder la bibliothèque » mémorisé par build | `localStorage` `brick-lab:library-kept:` | — | Inchangé | ☑ |
| R6 | Le pointeur sur la vue 3D ne re-rend l'atelier que si l'aimant change | `updatePreview` (`snapInfoKey`) | Performance : à ne pas casser | Inchangé (aucun état d'UI ajouté au survol) | ☑ |
| R7 | Taille fixe du bac (188 px) | CSS `.tray` | Un bac qui change de taille désynchronise le picking 3D (P5) | Inchangé (`--tray-h`) | ☑ |
| R8 | Aucune requête sortante hors actions D6/D8 | — | Vérifié par `brick` (PDF) | Inchangé | ☑ |

---

### Fonctionnalités dont l'utilité est à confirmer (signalées, **pas retirées**)

- **N4 Sessions récentes** de l'atelier autonome : liste non cliquable (il faut réimporter le fichier) ; recoupe B16.
- **A5 / B18 Atelier sans collection** : doublon partiel du parcours bibliothèque, conservé comme « bac à sable » et utilisé par la majorité des E2E.
- **K9 « Poser à la position cible (aide) »** : bouton d'accessibilité exigé par `docs/04` ; à garder, mais il pourrait vivre dans un menu « Aide / accessibilité ».

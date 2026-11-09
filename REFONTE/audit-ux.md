# Audit UX — Brick Lab Local, avant refonte

Base : `origin/main` = `a1309a4`. Les références `[X12]` renvoient à `inventaire-fonctionnalites.md`. Captures : `REFONTE/avant/`.

## L'app en 5 lignes

1. Brick Lab Local reconstruit pièce par pièce, en 3D et 100 % en local, des sets à partir de fichiers LDraw (`.mpd`/`.ldr`) et de la notice PDF de l'utilisateur.
2. La **collection** (`/`) range sets et constructions avec progression et vignettes ; **Ajouter un set** (`/ajouter`) cherche un numéro localement, puis sur l'OMR au clic, ou accepte un dépôt de fichiers.
3. Avant tout import, un **diagnostic de compatibilité** dit honnêtement quels modes sont possibles (guidé, notice synchronisée, montage libre) et pourquoi.
4. L'**atelier** combine une scène 3D, un bac de pièces, un panneau latéral (modèle, notice PDF, éditeur de correspondances pages ↔ étapes) et une barre de manipulation riche en montage libre (rotations 3 axes, gizmo, aimantation, assemblages).
5. Tout est sauvegardé (bibliothèque locale ou navigateur), avec détection des conflits, réparation par empreinte SHA-256 et historique : rien n'est jamais écrasé en silence.

## Synthèse

L'app est **fonctionnellement très riche et rigoureuse sur l'honnêteté** (diagnostics, refus explicites, confirmations sur les données). Ses faiblesses viennent surtout de l'**empilement des lots P5→P8** : chaque lot a ajouté ses contrôles là où il y avait de la place. Il en résulte une hiérarchie plate (tout a le même poids visuel), des contrôles dispersés entre quatre zones de l'atelier, des raccourcis qu'on ne découvre que par les toasts, et un style « formulaire d'administration » générique (gris bleuté, boutons tous identiques) qui n'encadre pas la scène 3D.

Gravités : **G1 bloquant ou risqué** (perte de données, erreur probable, info critique ratée) · **G2 friction forte** (ralentit souvent, demande de chercher) · **G3 gêne** (incohérence, polish).

---

## 1. Friction

| # | Gravité | Problème | Où | Effet sur l'utilisateur |
|---|---|---|---|---|
| U1 | **G1** | **« Abandonner » efface la progression sans confirmation dans l'atelier autonome** : la confirmation n'existe qu'en mode bibliothèque. Bouton placé à côté de « Centrer » et « Annuler » dans la barre du bac. | [K10] [K11] `/atelier` | Un clic malheureux efface la partie (localStorage) sans retour possible. |
| U2 | **G1** | **« Reprendre depuis cette étape »** (mode synchronisé) retire les pièces des étapes suivantes sans confirmation ni annulation claire (« Annuler » ne restaure pas les pièces retirées). | [I6] | Perte de travail sur un clic dans la bannière de notice. |
| U3 | G2 | La **barre de manipulation** du montage libre (`manip-bar`) aligne jusqu'à **20 contrôles** sur 2–3 lignes en haut de la vue 3D (statut, gizmo ×2 segmentés, 2 selects, 3 champs + Appliquer, Déplacer, 6 boutons de rotation, Au stock, Assemblage, Voir les connexions, Désélectionner). À 1280 px elle passe sur 3 lignes et masque le haut du modèle. | [J2] [J11]–[J21] | Lecture difficile, la scène perd ~90 px de hauteur utile ; l'action utile est noyée. |
| U4 | G2 | Les **réglages du montage libre** (Grille, Aimant pièces, Aimant modèle) sont dans la barre du **bac**, en bas, alors que les commandes de la pièce sont en **haut** de la vue 3D. | [J23] [J25] [J26] | Deux zones à surveiller pour une même manipulation. |
| U5 | G2 | **Choix du mode** = un `<select>` « Mode » au milieu de la barre du bac. Pour démarrer : 3 boutons empilés dans l'onglet Modèle, sans explication de la différence entre les modes. | [G9]–[G11] [K7] | La bascule guidé ↔ libre, centrale, n'est pas évidente ; le choix initial demande de connaître l'app. |
| U6 | G2 | **Atelier autonome : reprise d'une session** = liste texte « réimporte le fichier pour reprendre », non cliquable, et l'import ne se fait qu'au sélecteur (pas de glisser-déposer, contrairement à `/ajouter`). | [N1] [N4] | Reprendre demande de retrouver le fichier dans le Finder. |
| U7 | G2 | **Import en une page longue** (`/ajouter`) : Recherche, Ressources, Fichiers sélectionnés, Compatibilité, Confirmation s'empilent et apparaissent au fil de l'eau ; le bouton final est loin sous le pli et peut se déplacer pendant l'analyse. | [D1]–[D23] | On ne sait pas où l'on en est ni ce qui reste à faire. |
| U8 | G2 | **Détail d'un set** : la colonne d'infos fait ~15 sections (fichiers, notices, correspondances, compatibilité, diagnostics, zone de danger) sans regroupement ni repli ; l'action principale (Construire) est en haut mais la zone de danger est collée aux réglages. | [C2]–[C20] | Long défilement, risque de clic sur « Retirer » en cherchant autre chose (atténué par la confirmation). |
| U9 | G3 | L'**éditeur de correspondances** affiche 7 champs inline sans libellés alignés (Livret, Page, = page affichée, N° imprimé, Encadré, Multiplicateur, Vérifiée, Note) dans un panneau de 520 px. | [M7] | Saisie lente, champs confondus. |
| U10 | G3 | Les **toasts** ne disparaissent jamais (atelier : jusqu'au message suivant ; détail : au clic) et font parfois 3 lignes de consignes. | [F12] [C21] | Le toast masque le bas de la scène et vieillit (consigne obsolète affichée). |

## 2. Hiérarchie confuse

| # | Gravité | Problème | Où |
|---|---|---|---|
| U11 | G2 | **Tous les boutons se ressemblent** : même bordure grise, même taille ; seule la couleur distingue « primaire » (rare) et « danger » (bordure rose). Dans la barre du bac, Annuler / Réinitialiser l'étape / Centrer / Poser à la position cible / Abandonner ont le même poids. | Partout |
| U12 | G2 | La **topbar de l'atelier** mélange navigation, nom de fichier, étape, étape de notice, mode, progression, détail libre et état de sauvegarde, tous en texte de même taille, poussés à droite. La progression n'a pas de barre (contrairement à la collection). | [F1]–[F7] |
| U13 | G2 | Le **panneau latéral** affiche le diagnostic du modèle (utile avant de démarrer) en permanence pendant la construction, au-dessus de tout ; les infos de la partie (étape, pièces de l'étape) sont ailleurs. | [G1]–[G8] |
| U14 | G3 | Le **pied de l'atelier** contient le bac **et** 8–12 contrôles hétérogènes (actions, mode, cases à cocher, aide) qui passent à la ligne à 1280 px. | [K1]–[K11] |
| U15 | G3 | Sur une **carte de collection**, l'état des fichiers (3 lignes), les modes (chips), la progression et les problèmes ont le même poids que le titre. | [B6]–[B10] |

## 3. Fonctionnalités difficiles à découvrir

| # | Gravité | Problème | Où |
|---|---|---|---|
| U16 | **G1** | **Aucune aide aux raccourcis.** 21 raccourcis clavier ([O1]–[O21]) et 12 gestes souris ([P1]–[P12]) ne sont décrits que dans des toasts transitoires et des `title` de boutons. Double-clic = assemblage, glisser direct, ⌥ pour ignorer l'aimant, Q pour les axes locaux, G pour la grille : quasi introuvables. | Atelier |
| U17 | G2 | **Glisser-déposer** de fichiers : seulement dans la zone « Import local rapide » de `/ajouter`, pas sur la collection ni dans l'atelier autonome. | [D3] |
| U18 | G2 | Le **séparateur** du panneau (8 px, poignée grise) ne se voit qu'au survol ; le double-clic pour revenir à la largeur par défaut est caché dans un `title`. | [F10] |
| U19 | G2 | La **détection des fichiers du dossier de données** est un lien replié jaune au milieu de la collection ; l'**atelier sans collection** est un petit lien dans la topbar. | [B14] [B18] |
| U20 | G3 | Le **panneau latéral ne se replie pas** : impossible de donner toute la largeur à la 3D sans le réduire au minimum (280 px). | [F10] |

## 4. Incohérences visuelles

| # | Gravité | Problème |
|---|---|---|
| U21 | G2 | **Pas de système de design** : 8 variables CSS seulement (`--bg`, `--accent`…), 40 couleurs distinctes codées en dur dans `globals.css` (`#fef3c7`, `#c7d6fe`, `#86efac`…) plus des styles inline dans les composants, 7 rayons différents (2, 4, 6, 8, 10, 12, 14 px), ombres ad hoc. |
| U22 | G2 | **Pas de thème sombre**, pas de bascule. Fond de la scène 3D `#eef1f5` codé dans `BuildCanvas`. |
| U23 | G3 | **Libellés incohérents** pour la même action : « Retirer » / « Au stock » / « Remettre dans le stock (Suppr) » ; « Commencer — mode guidé » vs « Montage libre (avec notice) » (sans « Commencer ») ; « Construire / Reprendre / Revoir » vs « Commencer ». |
| U24 | G3 | **Statuts de couleur variables** : l'avertissement est tantôt texte ambre, tantôt fond ambre (`.warn`), tantôt bordure (`.discovery`) ; la qualité « Analysable » et « Affichable » partagent la même couleur ambre alors que l'une est jouable et l'autre non. |
| U25 | G3 | **Icônes** : caractères Unicode (◀ ▶ ▲ ▼ ↔ ✓ ⚠ ✗ ↗) dont le rendu varie selon la police ; pas de bibliothèque d'icônes. |
| U26 | G3 | Topbars différentes selon la page (collection : marque + « Ma collection » ; ajouter : bouton retour + titre ; détail : lien retour texte ; atelier : bouton retour + lien set). |

## 5. Feedbacks manquants

| # | Gravité | Problème | Où |
|---|---|---|---|
| U27 | G2 | **Chargement d'un modèle lourd** : textes seuls (« Chargement des géométries LDraw locales… », « Vérification des fichiers… ») sans indicateur d'activité ni progression ; sur un set de 600 pièces cela dure plusieurs secondes et ressemble à un blocage. | [N3] [E1] [Q5] [Q6] |
| U28 | G2 | **Collection** : aucun état de chargement (page vide jusqu'à la réponse) ; « Chargement… » brut pour chaque route. | [Q1] [Q2] |
| U29 | G2 | **Pièce aimantée / refusée** : le retour principal est une ligne de texte dans `held-info` ou un toast ; pas de feedback visuel fort (pulsation, couleur) au moment de la pose. Les points verts de connexion existent mais sont petits. | [J23] [H4] |
| U30 | G3 | **Sauvegarde en mode autonome** : « Sauvegardé localement » statique, jamais mis à jour (pas d'état « enregistrement… » ni d'erreur visible sauf pour les correspondances). | [F7] |
| U31 | G3 | Les **actions sans confirmation mais réversibles** (Au stock, Supprimer l'étape de notice, Réinitialiser l'étape) n'offrent pas d'« Annuler » dans le toast. | [J18] [M8] [H9] |

## 6. Accessibilité

| # | Gravité | Problème |
|---|---|---|
| U32 | G2 | **Focus visible** : aucun style `:focus-visible` global (seul le séparateur en a un) ; les boutons et liens reposent sur le contour par défaut du navigateur, inégal entre Chromium et WebKit. |
| U33 | G2 | **Contrastes** : `--muted #667085` sur `#f6f7f9` ≈ 4,6:1 (limite AA en 13 px) ; texte ambre `#92400e` sur `#fef3c7` OK, mais le texte `.small` 9–11 px (référence de pièce, « forme indisponible ») est sous les tailles lisibles ; boutons désactivés à 45 % d'opacité illisibles. |
| U34 | G2 | **Onglets** du panneau : `role=tab` sans `aria-controls`, panneaux sans `role=tabpanel`, pas de navigation ←/→ ; **filtres** de la collection en `role=radio` sans gestion des flèches. |
| U35 | G2 | **Libellés en anglais/techniques** dans des `aria-label` (« c14 », « LDU ») et beaucoup de boutons sans nom explicite hors de leur contexte (« ◀ », « − », « −1 », « +1 »). Certains en ont (`aria-label="Page précédente"`), d'autres non (étapes de notice ◀ ▶ dans `SyncStepBanner`). |
| U36 | G3 | Les toasts (`role=status`) annoncent des consignes très longues à chaque prise de pièce ; les erreurs de pose sont dans le même `role=status` (pas `alert`). |
| U37 | G3 | Aucune prise en compte de `prefers-reduced-motion` (peu d'animations aujourd'hui : risque futur) ni de `prefers-color-scheme`. |
| U38 | G3 | La navigation clavier hors canvas est possible mais longue : pas de lien d'évitement, ordre de tabulation topbar → vue 3D (rien) → séparateur → onglets → panneau → bac (jusqu'à 50 tuiles) → actions. |

---

## 7. Constats confirmés par les captures (`REFONTE/avant/`)

| # | Gravité | Problème | Capture |
|---|---|---|---|
| U39 | **G1** | **Bibliothèque LDraw absente** : la zone 3D affiche l'écran d'accueil (« Brick Lab Local », « Importer un modèle ») alors qu'un modèle est chargé, avec l'erreur en rouge en dessous ; le panneau dit « Analysable » et « Visualisation seulement tant que des pièces manquent », ce qui laisse croire que le fichier est en cause. Rien n'indique quoi faire (`.env.local`, `npm run check:ldraw`). | 28, 30 |
| U40 | G2 | À **1024 px**, la topbar de l'atelier passe sur deux lignes (« ← Ma / collection », « Montage / libre », « 2/8 pièces / posées ») ; la barre de manipulation occupe 4 lignes (~170 px) et masque un tiers de la scène. Rien ne casse, mais la lisibilité s'effondre. | 17 |
| U41 | G2 | En montage libre, la barre d'actions du pied passe sur deux lignes à 1280 px (« Abandonner » seul en dessous) et laisse un grand vide sous les tuiles du bac (hauteur fixe 188 px, cf. R7). | 09, 16 |
| U42 | G3 | La pièce **sélectionnée** est rendue rose pâle (matériau émissif ambre sur la couleur d'origine) : la couleur réelle de la brique devient méconnaissable. Le matériau est défini dans `src/infra/` (hors périmètre). | 16 |
| U43 | G3 | La console du navigateur affiche ~120 erreurs « 404 » à chaque ouverture de modèle : ce sont les sondages normaux de `LDrawLoader` dans les sous-dossiers de la bibliothèque (cf. `notFound` du rapport de perf), pas des pannes. À filtrer pour la vérification « aucune erreur console » de la phase 5. | — |

## Ce qui marche bien et doit être préservé

- **Honnêteté** : badges de qualité, `missing-parts`, « Étapes non disponibles… aucune séquence n'est inventée », fin de montage libre qui ne prétend pas avoir reconstruit le modèle officiel, notices LEGO jamais téléchargées, réseau uniquement au clic.
- **Confirmations sur les données de la bibliothèque** (retirer, dissocier, reprendre une sauvegarde) et **historique** systématique.
- **Bac de pièces** avec vraies miniatures, quantités et pièce en main mise en évidence.
- **Séparateur redimensionnable** accessible au clavier, mémorisé par contexte.
- **Messages d'erreur utiles** : la plupart disent quoi faire (« importe « x » (3 p.) pour voir la page 2 », « Réparer : choisir le fichier d'origine »).

## Contraintes relevées pour la refonte

- La **hauteur du bac doit rester fixe** pendant une partie (R7) : un bac qui change de taille désynchronise le picking 3D.
- Les **couleurs des variantes 3D** (fantôme bleu `#3b82f6`, sélection ambre, transparence « voir les connexions ») sont définies dans `src/infra/ldraw/part-catalog.ts`, **hors périmètre autorisé** : les adapter au thème demandera ton accord (ou de passer les couleurs en paramètre depuis `src/components/`).
- Le fond de scène et la grille sont dans `BuildCanvas` (`src/components/three/`) : modifiables.
- **233 assertions E2E de texte** et ~170 `data-testid` (voir `dependances-e2e.md`) : les libellés listés là ne doivent changer qu'avec mise à jour des tests dans le même commit.

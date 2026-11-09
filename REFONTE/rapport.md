# Rapport de refonte UI/UX — Brick Lab Local

Branche `claude/brick-lab-ui-refonte-188be7`, worktree `.claude/worktrees/brick-lab-ui-refonte-188be7`, base `origin/main` = `314d5af` (rebase du 09/11/2026 ; le travail avait commencé sur `a1309a4`). Rien n'a été poussé ni fusionné.

Objectif : une interface plus belle et plus simple **sans perdre, casser ni changer** une fonctionnalité. Le domaine (`src/domain/`), l'infra (`src/infra/`), le serveur, les routes API, les formats de données (`~/Documents/brick-lab-data/`, `.brick-mapping.json`), les variables d'environnement et la logique de rendu 3D n'ont pas été modifiés.

Documents de la refonte : [inventaire](inventaire-fonctionnalites.md) (262 fonctionnalités), [audit UX](audit-ux.md) (U1–U43), [proposition de design](proposition-design.md) (direction A « Établi », décisions A1–A11), [dépendances E2E](dependances-e2e.md), [état de la recette avant](etat-recette-avant.md), captures [avant](avant/README.md) et [après](apres/README.md).

## 1. Résultat de la vérification finale

Exécutée le 09/11/2026 sur le code final (Apple M2 Pro, macOS 25.6.0, Node 24.5.0, Chromium 156 / WebKit de Playwright 1.64.1).

**`npm run recette` — réussie (code 0)**

| Étape | Avant (`a1309a4`) | Après |
|---|---|---|
| `check:spec` | OK | OK |
| `typecheck` | OK | OK |
| `npm test` (Vitest) | 317 réussis, 1 ignoré | **336 réussis, 1 ignoré** (+ `design-tokens`, `demo-model`) |
| `npm run test:e2e` | 86 réussis, 19,2 min | **97 réussis**, 0 échec, 21,3 min (+ `filet-refonte`, + tests venus de `origin/main`) |

Les suites sur sets réels (31040, 31009, 31039) ont tourné. Une recette identique sur `044e815` (avant les correctifs de la phase 5) était déjà verte : 96/96 en 22,4 min.

**`npm run perf` — réussie** (build de production, moyenne sur 3 passes ; détail : `perf-avant.json`, `perf-apres.json`)

| Set | Import → 1re image avant | après | Écart | FPS repos / orbite | Tas JS avant → après |
|---|---|---|---|---|---|
| 31040-1 | 1 131 ms | 1 073 ms | −5,1 % | 60 / 60 | 26 → 31 Mo |
| 31009-1 | 1 152 ms | 1 181 ms | +2,5 % | 60 / 60 | 68 → 50 Mo |

Seuil ±10 % respecté ; mêmes requêtes LDraw (490 / 812, dont 171 / 293 sondages 404 normaux). Le tas JS varie d'une mesure à l'autre (ramasse-miettes) : pas de tendance.

**Inventaire** : 262 / 262 fonctionnalités vérifiées et cochées ([inventaire](inventaire-fonctionnalites.md)).

**Montage manuel** (pointeur réel via Playwright, script hors dépôt, Chromium **et** WebKit, 4 / 4 scénarios dans chaque navigateur, aucune erreur console hors les 404 de sondage LDraw) :

- mini-4-pieces en **mode guidé** jusqu'à « Bravo, modèle terminé ! » ; **caméra** : zoom à la molette et panoramique au clic droit glissé déplacent bien la vue (P2, P3, restés sans E2E) ;
- mini-4-pieces en **montage libre** : poser, sélectionner, quart de tour, « Au stock », « Annuler » rétablit la pièce ;
- **notice PDF** : un faux PDF affiche « Fichier PDF invalide ou abîmé. » en alerte (Q16), puis la vraie notice s'affiche ;
- **notice synchronisée** (notice-sync-8 + PDF généré + correspondances importées) : 8 pièces posées, la page suit l'étape (p. 2 puis p. 3, encadré compris), fin « Bravo » ;
- **clavier** : « Importer un modèle » et « Importer une notice PDF » atteints au clavier avec anneau de focus.

États transitoires non capturés en image (chargement E1, choix entre deux sauvegardes E3, conflit F8) : couverts par les E2E `library` / `library-webkit`, verts.

**Captures après** : 40 captures dans [`apres/`](apres/README.md) (01–30 comparables une à une avec `avant/`, 31–40 nouveaux états : thème sombre, confirmations, réglages, aide, 1024 px). Seules erreurs console pendant les trois passages : les « 404 » de sondage de `LDrawLoader` (U43).

## 2. Ce qui change, écran par écran

### Fondations (toute l'application)

- **Système de design** : `src/app/tokens.css` (couleurs, espacements, rayons, ombres, typographie système, durées) en thème clair et sombre ; bascule de thème dans la barre d'app (préférence du navigateur, jamais envoyée). Fini les ~40 couleurs codées en dur (U21, U22). Un test unitaire (`design-tokens`) vérifie que chaque token existe dans les deux thèmes et que les paires texte/fond respectent le contraste AA.
- **Icônes** : `lucide-react@1.61.0` (seule dépendance ajoutée, validée en A2), embarquées dans le bundle : aucune requête réseau. Les caractères ◀ ▶ ▲ ▼ ✓ ⚠ ont été remplacés là où ils servaient de bouton (U25) ; ✓ / ✗ restent comme texte dans les listes de modes (textes testés).
- **Composants communs** (`src/components/ui/`) : barre d'app avec fil d'Ariane (U26), `Dialog` / `ConfirmDialog` natifs (focus piégé et rendu, Échap, bouton « Annuler » focalisé par défaut sur les actions destructrices), menu, toasts avec bouton de fermeture, indicateur de chargement (`role=status`), notes info / attention / erreur (`role=alert` pour les erreurs), état vide, écran d'installation LDraw.
- **Accessibilité** : `:focus-visible` global identique Chromium / WebKit (U32), contrastes AA (U33), onglets avec `aria-controls` / `tabpanel` et flèches ←/→ (U34), noms accessibles en français sur tous les boutons-icônes (U35), `prefers-reduced-motion` et `prefers-color-scheme` respectés (U37), transitions 150–250 ms.
- **Titres de page** : « Ma collection — Brick Lab », « Ajouter un set — Brick Lab », « Atelier — Brick Lab »… (A8) ; la mention « Non affilié à LEGO » est conservée.

### Ma collection (`/`)

- Barre d'app : « Ajouter un set » en action principale, « Atelier sans collection » et la détection du dossier de données accessibles sans encombrer (U19).
- Bandeau **Reprendre** : la dernière construction enregistrée, reprise en un clic.
- Cartes à vignette dominante : statut et progression sur la vignette, ligne d'icônes (pièces, notices, correspondances), problème toujours visible en rouge, bouton « Réparer » sur les cartes sans mode jouable (A10) (U15).
- Filtres en groupe radio navigable aux flèches ; état de chargement et état vide avec « Essayer la démo » (fixture CC0 embarquée, rien ajouté à la bibliothèque, A4) (U28).

### Ajouter un set (`/ajouter`)

- Une seule page en **parcours par étapes** 1 Fichiers → 2 Vérification → 3 Confirmation → 4 Prêt, étape courante calculée (`aria-current="step"`) (U7).
- « Chercher en ligne » et « Télécharger » marqués d'un globe et de « contacte Internet, seulement sur ce clic » ; hors ligne (`BRICK_LAB_ONLINE=0`), une note explicite et l'import local complet.
- Compatibilité : une icône par ligne (ok / attention / erreur / info) ; l'action principale dans une barre collante toujours visible, avec la raison si elle est bloquée.

### Atelier (`/atelier/[buildId]` et `/atelier`)

- **Barre d'app** : fil d'Ariane, sélecteur de mode **segmenté** toujours visible (les modes indisponibles restent affichés, désactivés, avec leur raison — A3), progression avec barre, étape et étape de notice, état de sauvegarde, aide « ? », thème. Elle tient sur une ligne à 1280 et à 1024 px (U5, U12, U40).
- **Démarrage** (onglet Modèle) : cartes de mode expliquées, le mode recommandé en avant, puis le résumé du modèle (U13).
- **Scène** : rail d'outils (Centrer, emplacements, grille et aimants en montage libre — U4), HUD de la pièce en main, **légende contextuelle** pour les consignes et toast réservé aux résultats (A6, U10, U36), panneau latéral repliable (U20).
- **Bac** : colonne d'actions hiérarchisée (Annuler ⌘Z, orientation, poser à la cible, réinitialiser l'étape, abandonner en discret) (U11, U14, U41).
- **Confirmations** (A5) : « Abandonner » et « Recommencer » en modale dans les deux ateliers (U1) ; le changement de mode qui retire des pièces aussi (texte inchangé).
- **Aide « Raccourcis et gestes »** (`?`) : les 21 raccourcis et 12 gestes, auparavant cachés dans des infobulles (U16).
- **Bibliothèque LDraw absente** : un écran d'installation dans la scène (`.env.local`, `npm run check:ldraw`) au lieu de l'accueil trompeur, et la cause dans le panneau (U39).
- **Atelier sans collection** : accueil avec démo, dépôt de fichier et reprise (U6).

### Montage libre

- La barre de manipulation (20 contrôles sur 3–4 lignes, U3) devient une **barre contextuelle d'une ligne en haut de la scène**, affichée seulement avec une pièce en main ou une sélection : hauteur (↑ ↓, 8 / 1 LDU, Auto), quarts de tour X Y Z (− +), Au stock, Lâcher / Laisser en place ; en sélection : Flèches / Anneaux, Globaux / Locaux, Déplacer, Assemblage, Au stock, Réglages, ×. Libellés en clair, repliés en icônes quand la scène est étroite (container query).
- Réglages fins (pas des flèches, pas des anneaux, coordonnées + Appliquer) dans une seconde ligne « Réglages » fermée par défaut.
- État de la pièce ou de la sélection dans le HUD, qui laisse passer les clics ; « Voir les connexions » dans le rail d'outils.

### Notice PDF, notice synchronisée, éditeur de correspondances

- **Panneau Notice** : barre compacte (livret, ‹ « PDF p. i / n » ›, zoom − / + / largeur), « Lecture du PDF… » en indicateur, erreurs en alerte, état vide avec « Importer une notice PDF » et la mention de confidentialité inchangée.
- **Carte d'étape synchronisée** : étape, livret et page, barre de progression de l'étape, consultation d'une étape faite en ambre ; « Reprendre depuis cette étape » passe par une **modale qui annonce le nombre de pièces retirées** (U2).
- **Éditeur** : en-tête (statut, couverture, « Terminer l'édition »), Livrets et Validation repliables, formulaire de l'étape en grille à libellés alignés (U9), puces de pièces nommées, doublons en alerte, « Tout effacer » en modale (même libellé « Confirmer l'effacement »).

### Détail d'un set (`/sets/[setId]`)

- Barre d'app commune ; chargement, set introuvable (état vide + retour) et erreur de bibliothèque (alerte + « Réessayer »).
- En-tête : n° et nom éditables sur place (Entrée enregistre, Échap rétablit), « Enregistrer » + « Annuler ».
- **Carte Construction** : problèmes en alerte en tête, sauvegarde du navigateur, progression, modes ✓/✗ avec raisons, bouton principal ; puis sections repliables Fichiers, Notices, Correspondances (ouvertes, état dans le titre) et Compatibilité et diagnostics (repliée sauf pièce absente ou erreur) (U8).
- **Zone sensible** séparée ; « Retirer le set / cette construction » confirme dans une modale (mêmes identifiants, même texte).

## 3. Fonctionnalités déplacées

Toutes les fonctionnalités existent toujours ; la colonne « Nouvel emplacement » de l'[inventaire](inventaire-fonctionnalites.md) donne la place de chacune des 262 (toutes cochées « Vérifié »). Les déplacements les plus visibles :

| Fonctionnalité | Avant | Après |
|---|---|---|
| Choix du mode (K7, G9–G11) | `<select>` « Mode » dans la barre du bac ; 3 boutons empilés dans l'onglet Modèle | Sélecteur segmenté dans la barre d'app ; cartes de mode dans l'onglet Modèle |
| Grille, Aimant pièces, Aimant modèle (J23, J25, J26) | Cases à cocher dans la barre du bac | Rail d'outils de la scène (boutons à bascule, mêmes touches G et ⌥) |
| Consignes de manipulation (F12) | Toast | Légende contextuelle de la scène (textes identiques) |
| Pas des flèches / des anneaux, coordonnées (J13–J15) | Barre de manipulation, toujours visibles | Ligne « Réglages » sous la barre contextuelle, fermée par défaut |
| « Voir les connexions » (J20) | Barre de manipulation | Rail d'outils (avec une sélection) |
| État de la pièce en main / de la sélection (J2, J10) | Début de la barre de manipulation | HUD sous la barre contextuelle |
| Progression, étape, sauvegarde (F1–F7) | Texte en haut à droite | Barre d'app (barre de progression) |
| « Atelier sans collection » (B18) | Lien de la topbar | Menu de la barre d'app de la collection et état vide |
| Diagnostic du modèle (G1–G8) | En tête du panneau, en permanence | Onglet Modèle, sous les cartes de mode |
| Compatibilité et diagnostics du set (C12–C16) | Sections à plat | Section repliable (ouverte d'office en cas de problème) |
| Aide aux raccourcis (O1–O21, P1–P12) | Infobulles et toasts | Dialogue « Raccourcis et gestes » (`?`) |

## 4. Comportements modifiés (tous validés ou consignés)

Consignés dans `docs/implementation/JOURNAL_DECISIONS.md` (section « refonte de l'interface ») :

1. **Nouvelles confirmations** (A5) : Abandonner / Recommencer (les deux ateliers), Reprendre depuis cette étape, Tout effacer (correspondances, déjà confirmé en ligne avant), Retirer un set / une construction (déjà confirmé en ligne avant). Aucun résultat ne change une fois confirmé.
2. **Modes indisponibles affichés désactivés** au lieu d'être absents (A3) ; jamais jouables.
3. **Consignes dans la légende**, toast pour les résultats (A6).
4. **Démo embarquée** (A4) : `fixtures/mini-4-pieces.mpd` (CC0), test d'égalité unitaire.
5. **Fond de la scène** : canvas transparent, fond porté par le token `--scene-bg` (clair / sombre). Les nouvelles vignettes sont capturées sans fond ; les anciennes gardent le leur.
6. **Barre du montage libre en haut et non en bas** (écart à la proposition § 4) : en bas, elle masquait le sol près de la caméra et le manipulateur ; deux E2E l'ont montré.

### Corrections de la phase 5

- **Boutons « Importer… / Remplacer… / Associer… / Réparer… » au clavier** (10 boutons : modèle, notice PDF, correspondances, fichiers de l'ajout, réparation, constructions) : le champ fichier était masqué par `hidden` (déjà le cas avant la refonte), donc ni Tab ni Entrée ne l'atteignaient. Il est désormais masqué visuellement mais focalisable ; le bouton qui l'entoure affiche l'anneau de focus (et son infobulle). Le bouton icône « Ajouter / changer de livret » donne son nom au champ. Nouveau test dans `filet-refonte` ; vérifié aussi dans WebKit avec ⌥ Tab (Safari ne parcourt que les champs texte avec Tab seul, réglage système).
- **Infobulles des actions du bac** (« Annuler », « Poser à la position cible ») alignées sur le bord droit : elles débordaient de la fenêtre (vu sur la capture 13).

### Tests modifiés (et pourquoi)

Aucune assertion n'a été affaiblie ; les textes testés sont inchangés. Les tests ont été adaptés là où l'interaction change :

- `filet-refonte.spec.ts` (nouveau, phase 3) : filet de sécurité de la refonte, vert avant et après.
- `surface-placement`, `filet-refonte` : clic sur la confirmation d'abandon (A5).
- `instructions-sync` : vise « Étape précédente » (la flèche ◀ est devenue une icône) et confirme la reprise dans la modale (dont le nombre de pièces annoncées).
- Sélecteur de mode piloté par `data-value` (A3) ; « non proposé » vérifié par `aria-disabled`.
- `free-gizmo`, recette `libre-reel` : ouvrent « Réglages » avant de saisir pas ou coordonnées (`manipSettings`).
- `instructions-sync-omr` : attend jusqu'à 3 s que la page du PDF suive l'étape (échec préexistant sous charge, reproduit sur le code d'avant ; une page qui ne suit pas reste un écart).
- `design-tokens`, `demo-model` (unitaires, nouveaux) ; `filet-refonte` : test clavier des boutons « Importer… » (phase 5).

## 5. Points à arbitrer

1. **Couleurs du fantôme et de la sélection** (A8, U42) : elles sont dans `src/infra/ldraw/part-catalog.ts`, hors du périmètre accordé. La sélection rend la brique rose pâle (couleur réelle méconnaissable) et le fantôme bleu ne suit pas le thème sombre. Proposition : un contour ou un émissif plus léger, piloté par le thème — demande ton accord sur `src/infra/`.
2. **« Supprimer l'étape »** de l'éditeur de correspondances (M8, U31) reste **sans confirmation et sans « Annuler »**, comme avant. Une étape supprimée se recrée à la main ; une confirmation (ou un « Annuler » dans le toast) serait cohérente avec A5.
3. **« Au stock » et « Réinitialiser l'étape »** (J18, H9) : réversibles par ⌘Z, mais le toast ne propose pas « Annuler » (U31). À décider avec A7 (fermeture automatique des toasts, reportée).
4. **Dépôt de fichiers sur la collection** (A9, U17) : reporté ; l'import par glisser-déposer reste dans « Ajouter un set » et l'accueil de l'atelier sans collection.
5. **Barre du montage libre en haut** au lieu d'en bas (§ 4.6) : à confirmer.
6. **Diff de la sauvegarde du navigateur** (détail d'un set) : reste un bandeau dans la carte et pas une modale ; suffisant à l'usage mais le texte est long.

## 6. Dette restante

- **Navigation clavier dans la scène** : rien n'a été ajouté dans le canvas lui-même (hors périmètre « logique de rendu 3D »), les raccourcis existants restent la voie clavier ; pas de lien d'évitement vers le bac (U38).
- **`globals.css`** a grossi (≈ +900 lignes) : découpage par écran (CSS modules ou fichiers par zone) à envisager.
- **`BrickLabApp.tsx`** reste un gros composant (~1 500 lignes) ; la barre contextuelle, l'aide, le sélecteur de mode et le démarrage en sont sortis, la suite (bac, panneau) pourrait suivre.
- **Feedback de pose** (U29) : pas de pulsation ou d'effet visuel fort au moment de la pose (touche à la scène 3D).
- **Sauvegarde autonome** (U30) : « Sauvegardé localement » reste statique.
- **Console** : ~120 « 404 » à l'ouverture d'un modèle, sondages normaux de `LDrawLoader` (U43), inchangés.
- **Flakiness sous charge** : `free-height-group:271` (WebKit) a échoué une fois sous forte charge machine pendant la refonte puis passé 3/3 ; à surveiller.

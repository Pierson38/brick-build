# Phase 2 — Proposition de design

Base `3e91174` (audit validé le 09/11/2026). Rien n'est encore modifié dans `src/`.

Fichiers :

- `proposition/directions.html` : maquette statique locale, sans aucune ressource externe ; bascules Direction A/B et Clair/Sombre en haut de la page.
- `proposition/direction-{a,b}-{clair,sombre}.png` : les quatre rendus.
- `proposition/tokens.css` : tokens de la direction recommandée (A), prêts à devenir `src/app/tokens.css`.
- Colonne « Nouvel emplacement » remplie dans `inventaire-fonctionnalites.md` : aucune ligne vide.

---

## 1. Deux directions visuelles

Les deux gardent la même architecture (§ 4) : elles ne diffèrent que par l'habillage. La scène 3D reste la plus grande surface de l'écran, sur un fond neutre et sans motif. Les contrôles flottants y sont translucides et regroupés sur les bords.

| | **A — « Établi »** (recommandée) | **B — « Plan technique »** |
|---|---|---|
| Intention | Un établi calme et lumineux, où l'on travaille longtemps avec la notice papier à côté | Un outil de précision façon CAO, sur fond de nuit |
| Thème par défaut | Clair (sombre via `prefers-color-scheme` ou bascule) | Sombre (clair disponible) |
| Neutres | Papier chaud `#f6f4f0`, encre `#1e1b16`, ardoise `#5c564c` | Ardoise froide `#0f1216`, `#161a20`, texte `#e6eaf0` |
| Accent | Vert « outil » `#1e6b5c` (clair) / `#4fbfa5` (sombre) : action principale, progression, onglet actif | Ambre signal `#f2a900` (texte foncé dessus) |
| Sélection 3D / UI | Orange brûlé `#c2410c` | Cyan `#38bdf8` |
| Typographie | Police système (SF Pro Text/Display, SF Mono) : **0 Ko**, rendu natif identique Chromium/WebKit | IBM Plex Sans + Plex Mono auto-hébergées (`@fontsource`, OFL) : **≈ 100 Ko** woff2 (4 graisses latines) |
| Échelle | 11 / 12 / 13 / 14 / 16 / 18 / 22 / 28 px | Même échelle, libellés en petites capitales espacées |
| Espacements | Grille de 4 px, densité confortable (contrôles de 32 px) | Grille de 4 px, dense (contrôles de 28 px) |
| Rayons | 7 px (contrôles), 12 px (cartes), 14 px (panneaux) | 4 px / 6 px / 6 px |
| Ombres | Douces et chaudes, à 3 niveaux | Quasi absentes : filets de 1 px |
| Iconographie | Lucide, trait 1,75, 16 px, toujours accompagnées d'un libellé sauf dans le rail d'outils (infobulle + `aria-label`) | Lucide, trait 1,5, 16 px |
| Ce qui ressort | Les briques colorées et les **pages blanches de la notice**, qui ne tranchent pas | Les briques sur fond sombre ; la notice blanche éblouit à côté |
| Risque | Peut paraître sage | Fatigue visuelle avec un PDF blanc ; 100 Ko de polices ; plus éloigné de l'existant (plus de changements visuels à valider) |

**Recommandation : A.** L'usage principal se fait avec une notice PDF à fond blanc ouverte en permanence à côté de la scène : un thème clair chaud la fait cohabiter sans contraste violent, et le sombre reste disponible. La police système ne coûte rien, ne fait aucune requête et rend à l'identique dans Chromium et WebKit sur Mac. Elle se distingue d'un template générique par le papier chaud au lieu du gris bleuté, l'unique accent vert et les chiffres en mono tabulaire. **Emprunt à B** : la mono tabulaire pour les chiffres, références et coordonnées.

Si tu choisis B, les tokens restent les mêmes noms ; seules les valeurs de `tokens.css` changent (elles sont dans `directions.html`), et j'ajoute les deux paquets `@fontsource`.

## 2. Dépendances proposées

| Paquet | Version | Licence | Poids | Pourquoi |
|---|---|---|---|---|
| `lucide-react` | **1.61.0** (21/10/2026, > 2 semaines) | ISC | 38 Mo dans `node_modules` ; **≈ 0,5 Ko par icône dans le bundle** (import nommé, tree-shaking), soit ≈ 20 Ko min / ≈ 7 Ko gzip pour la quarantaine d'icônes prévues | Exigé par la mission (icônes embarquées via npm) ; dépendance de `react` uniquement |
| `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono` | 5.3.0 | OFL-1.1 | ≈ 100 Ko woff2 servis par Next depuis le bundle | **Seulement si direction B** |

Rien d'autre : pas de Radix, shadcn ni Tailwind. Les modales utilisent `<dialog>` natif (focus piégé et Échap gérés par le navigateur, identiques dans Chromium et WebKit). Infobulles, menus et popovers sont de petits composants maison (< 150 lignes chacun) testés au clavier.

## 3. Design tokens (direction A)

Source unique : `proposition/tokens.css`, qui deviendra `src/app/tokens.css`. `globals.css` ne contiendra plus aucune couleur, aucun rayon ni aucune durée en dur.

- **Familles** : `--font-*`, `--text-*` (11→28 px), `--space-*` (4 px), `--radius-*`, tailles fixes (`--control-h` 32, `--appbar-h` 52, **`--tray-h` 188 conservé**, `--splitter-w` 8 = `SPLITTER` du domaine), `--z-*`, `--duration-*` 150/200/250 ms, mises à 0 sous `prefers-reduced-motion`.
- **Couleurs** : `--color-bg/surface/surface-2/surface-3/border/border-strong/border-control/ink/ink-2/ink-3`, `--color-accent*`, `--color-focus`, statuts `ok/warn/danger/info` (+ `-soft`), qualité d'import `--quality-*`, scène `--scene-bg/grid/grid-center/ghost/select/snap/overlay-bg`, axes `--axis-x/y/z` (inchangés).
- **Thème** : clair dans `:root` ; sombre sous `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` et sous `:root[data-theme="dark"]`. La bascule écrit `data-theme` sur `<html>` et la mémorise dans `localStorage` (`brick-lab:theme` = `system | light | dark`), comme la largeur du panneau. Un petit script inline dans `layout.tsx` l'applique **avant le premier rendu** (pas de flash).
- **Scène 3D** : `BuildCanvas` lit `--scene-bg` et `--scene-grid*` une fois au montage et à chaque changement de thème (un `MutationObserver` sur `data-theme` + la media query). Seuls `<color attach>` et la grille changent ; les briques ne sont pas recréées.
- **Contrastes vérifiés** (WCAG AA, calculés) :

| Paire | Clair | Sombre |
|---|---|---|
| texte / fond | 15,6 | 15,6 |
| secondaire `ink-2` / fond | 6,6 | 7,5 |
| tertiaire `ink-3` / `surface-2` (le cas le plus défavorable) | 5,0 | 5,3 |
| texte sur accent | 6,3 | 7,6 |
| statuts sur leur fond `-soft` (ok, warn, danger, info) | 4,7 · 5,6 · 5,6 · 6,2 | 7,0 · 7,5 · 6,8 · 7,2 |
| bord des champs `border-control` (≥ 3:1) | 3,6 | 3,5 |
| focus / fond (≥ 3:1) | 5,8 | 9,8 |

- **Focus** : `:focus-visible` global = anneau de 2 px `--color-focus`, décalé de 2 px, sur tous les éléments interactifs.

## 4. Architecture d'information

Les routes ne changent pas (`/`, `/ajouter`, `/sets/[id]`, `/atelier`, `/atelier/[buildId]`) : les liens, les tests et la reprise en dépendent.

**Barre d'app commune** à toutes les pages (52 px). À gauche, la marque « Brick Lab » (lien vers la collection) puis le fil d'Ariane (*Ma collection › 90001-1 Maison de test › Atelier*). À droite, l'action de la page, le bouton Aide `?` et la bascule de thème (Système / Clair / Sombre). Le libellé « ← Ma collection » et `data-testid="back-to-collection"` sont conservés sur le premier lien du fil d'Ariane.

### 4.1 Collection `/`

| Avant | Après | Gain |
|---|---|---|
| Titre + recherche + filtres, puis grille de cartes égales ; détection du dossier de données en lien jaune replié ; parties du navigateur en encadré gris en bas | **Bandeau « Reprendre »** en tête : la construction en cours modifiée en dernier, grande vignette, progression, un bouton. Barre d'outils compacte (recherche, filtres en segmenté, « Ajouter un set » en primaire). Cartes à **vignette dominante** : badge d'état en surimpression, barre de progression au bas de la vignette, puis n°, nom, une ligne d'icônes (pièces, notices, correspondances) et les modes en puces neutres. **Problème toujours affiché** en rouge sous le titre, et « Réparer » remplace « Construire » quand aucun mode n'est disponible (lien vers le détail). Détection et parties du navigateur : sections repliables avec compteur, sous la grille. Collection vide : écran d'accueil (§ 5.1). Chargement : squelettes de cartes. | Reprendre = **1 clic** depuis l'accueil ; l'état se lit sur la vignette ; les problèmes restent aussi visibles qu'aujourd'hui (rouge, `role=note`) |

### 4.2 Ajouter un set `/ajouter` : parcours par étapes, sur une seule page

| Avant | Après | Gain |
|---|---|---|
| 5 panneaux qui apparaissent au fil de l'eau ; le bouton final loin sous le pli | **Indicateur d'étapes** en haut : *1. Fichiers → 2. Vérification → 3. Confirmation → 4. Prêt*. L'étape en cours est mise en avant, les étapes passées sont résumées et rouvrables, les suivantes grisées. **1. Fichiers** : deux voies côte à côte, « Par numéro » (recherche locale puis sources, avec « Chercher en ligne » marqué d'une icône globe et de la mention *contacte l'OMR*) et « Depuis mes fichiers » (grande zone de dépôt). **2. Vérification** : fichiers retenus et diagnostic de compatibilité, une fiche par construction (badge de qualité, modes disponibles, raisons). **3. Confirmation** : numéro, nom, cible (nouveau set / set existant). **Barre d'action collante en bas** : ce qui manque (`confirm-blocker`) et le bouton principal, toujours visible. **4. Prêt** : « Construire « … » » en primaire. | On sait où l'on en est et ce qui manque ; l'action principale ne bouge plus. Tout reste sur une route, sans perte d'état. |

Hors ligne (`BRICK_LAB_ONLINE=0`) : la voie « Par numéro » affiche à la place du bouton « Recherche en ligne désactivée (`BRICK_LAB_ONLINE=0`) », avec une icône globe barrée. L'import local reste complet.

### 4.3 Détail d'un set `/sets/[id]`

| Avant | Après | Gain |
|---|---|---|
| En-tête éditable, puis par construction : aperçu 3D + une colonne de ~15 sections | En-tête : n° et nom éditables (crayon au survol, Entrée / Échap). Par construction, une **carte Construction** : aperçu 3D, nom, statut, progression, modes ✓/✗ **avec raisons**, **problèmes en tête** (alerte rouge), bouton principal. Puis des **sections repliables** : Fichiers (modèle, empreintes, réparation), Notices, Correspondances, Compatibilité et diagnostics, et enfin une **zone de danger** séparée. Sauvegarde du navigateur : bandeau d'alerte en haut de la carte quand elle diffère. | Une lecture en 5 secondes, la réparation à portée, le destructif isolé |

### 4.4 Atelier `/atelier/[id]` et `/atelier`

```
┌ Barre d'app ─────────────────────────────────────────────────────────────────┐
│ ← Ma collection › 90001-1 Maison de test    [Notice synchro|Guidé|Libre]    ▰▰▱▱ 2/8 pièces  ✓ Enregistré  ⌨ ◐ │
├──────────────────────────────────────────────┬─┬────────────────────────────┤
│ HUD (état de la pièce en main / sélection)    │ │ [Étape|Modèle] [Notice] [Corresp.]  ⇥ │
│                                  Rail d'outils │ │                              │
│              SCÈNE 3D                ⌖ ▢ ▦ ⊃ ◎ 👁 │ │ panneau repliable          │
│                                               │ │                              │
│        Barre contextuelle (main / sélection)   │ │                              │
│ Légende : clic poser · R tourner · ? aide      │ │                              │
├──────────────────────────────────────────────┴─┴────────────────────────────┤
│ Bac de pièces (188 px fixes)                                 [↶ Annuler] [⋯] │
│                                                              [◎ Poser à la cible] │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Zone | Avant | Après | Gain |
|---|---|---|---|
| Barre d'app | Texte en vrac à droite | Fil d'Ariane ; **sélecteur de mode segmenté au centre** (les modes indisponibles sont grisés, avec la raison en infobulle) ; **barre de progression** et « x/y pièces » ; étape « Étape 1 / 2 » ou « Notice : Étape 2, p. 2 » sous le compteur ; état de sauvegarde (icône + texte, rouge si erreur) ; aide `?` ; thème | Mode et progression toujours visibles ; la bascule guidé/libre devient évidente |
| Démarrage | Fiche du modèle puis 3 boutons empilés | Onglet **« Démarrer »** du panneau tant qu'aucune partie n'est lancée : résumé (badge de qualité, chiffres), puis **trois cartes de mode** avec une phrase d'explication chacune ; les modes indisponibles restent affichés avec leur raison (« Étapes non disponibles dans ce fichier : aucune séquence n'est inventée »). Diagnostic détaillé repliable dessous. | On comprend la différence entre les modes ; un modèle non constructible ne montre aucun bouton actif |
| HUD | Ligne `held-info` dans le bac (guidé) ou dans la barre (libre) | Puce translucide en haut à gauche de la scène, dans tous les modes : niveau/hauteur, rotation, orientation, aimant (« 4 tenons emboîtés », en vert), raison d'un refus (en ambre) | Un seul endroit à regarder, près de la pièce |
| Rail d'outils | Cases dans le bac + « Centrer » | Colonne d'icônes à droite de la scène : Centrer, Montrer les emplacements, Grille (G), Aimant pièces, Aimant modèle, Voir les connexions, chacun avec infobulle et raccourci, `aria-pressed` | Les réglages de scène sont près de la scène |
| Barre contextuelle | `manip-bar` de 20 contrôles sur 3 lignes en haut | Une barre en bas de la scène, **seulement quand il y a quelque chose en main ou sélectionné**. Pièce en main : Monter / Descendre / pas 8–1 LDU / Hauteur auto · X Y Z ±90° · Remettre au stock · Lâcher. Sélection : Flèches / Anneaux · Globaux / Locaux · X Y Z · Déplacer · Assemblage · Au stock · Désélectionner. **Réglages ⚙** (popover) : pas, angle, coordonnées X/Y/Z + Appliquer. À < 1200 px, les libellés passent en icônes avec infobulle. | La scène récupère ~90 px en haut ; l'essentiel en un coup d'œil ; les réglages fins restent à un clic |
| Bac | Bac + 8 à 12 contrôles en vrac | Bac (hauteur fixe inchangée) + colonne d'actions : **Annuler** (⌘Z), **Poser à la position cible**, **menu ⋯** (Réinitialiser l'étape, Abandonner → confirmation) | Une action principale par zone ; le destructif sort du chemin |
| Panneau latéral | 3 onglets, non repliable | Onglets *Démarrer/Étape*, *Notice*, *Correspondances* ; **bouton de repli** (⇥) qui rend toute la largeur à la scène, mémorisé ; séparateur avec poignée visible. Pendant une partie, l'onglet « Étape » montre l'étape en cours (guidé, synchro) ou le stock et la fin (libre) ; la fiche du modèle reste en section repliable. | La scène peut prendre toute la place ; le panneau montre la partie, plus le diagnostic d'import |
| Toasts | Bas-gauche, persistants, longues consignes | Pile en bas à gauche, au-dessus de la légende : les **résultats** (posée, refusée, déplacée) restent comme aujourd'hui ; les **consignes** (« Pointe où tu veux… ») passent dans la **légende contextuelle** du bas de la scène. Bouton de fermeture ; erreurs en `role=alert`. | Moins de texte qui masque la scène |
| Aide | Aucune | Touche **`?`** ou bouton ⌨ : modale « Raccourcis et gestes », par contexte (en main / sélection / guidé / éditeur), qui reprend les 21 raccourcis et 12 gestes de l'inventaire | Découvrabilité (U16) |
| LDraw absent | Écran d'accueil + texte rouge | **Écran « Bibliothèque de pièces introuvable »** dans la scène : raison exacte, les 3 étapes du README (télécharger `complete.zip`, créer `.env.local`, `npm run check:ldraw`) avec commandes copiables, et « Réessayer » ; le panneau garde le diagnostic et précise « cause : bibliothèque LDraw, pas le fichier » | U39 corrigé, sans masquer le diagnostic |

### 4.5 Notice PDF et éditeur de correspondances

| Avant | Après | Gain |
|---|---|---|
| Barre de boutons texte (◀ ▶ − + ↔), livret en select | Barre d'icônes compacte : livret (select) · ◀ « p. 2 / 3 » ▶ · − Largeur + ↔ · « Ajouter un livret » ; la légende contextuelle (« page indépendante des étapes 3D » / « pilotée par l'étape ») sous la page en petit ; mode synchro : **carte d'étape** au-dessus de la page (étape, page, progression de l'étape, consultation en ambre, « Reprendre depuis cette étape » → confirmation) | Moins de bruit, la page prend la hauteur |
| Éditeur : 7 champs inline, sections empilées | En-tête (statut, couverture, Terminer) ; **navigation d'étapes** ◀ select ▶ + « Nouvelle étape » ; **formulaire en grille à deux colonnes** avec libellés alignés (Livret, Page, N° imprimé, Encadré, ×, Vérifiée, Note) ; pièces de l'étape et non affectées en puces avec pastille de couleur ; Livrets, Validation et Import/Export en sections repliables ; « Tout effacer » dans un menu avec confirmation | Saisie plus rapide et lisible |

## 5. Parcours

### 5.1 Premier lancement
Collection vide, en trois cas :
- **Bibliothèque LDraw configurée** : accueil avec deux cartes, *Ajouter mon premier set* (lien `/ajouter`) et *Essayer la démo* (voir arbitrage A4).
- **Bibliothèque absente** : la carte *Bibliothèque de pièces* passe en premier, avec les étapes d'installation et « Réessayer ». L'ajout de set reste possible, et son diagnostic signalera « rendu indisponible ».
- **Fichiers trouvés dans le dossier de données** : troisième carte, *N sets trouvés dans ton dossier*, qui déplie la détection.

### 5.2 Import
Collection → Ajouter un set → 1. numéro ou dépôt → 2. vérification (fiche de compatibilité lisible) → 3. confirmation → 4. **Construire** → atelier sur l'onglet *Démarrer*, où le mode recommandé est pré-mis en avant.

### 5.3 Construction guidée
*Démarrer* → carte « Guidé » → le panneau passe sur *Étape* → on prend une pièce dans le bac (le HUD et la légende s'affichent) → l'aimant indique la cible (HUD vert) → clic → toast « Pièce posée (1/4) » → la barre d'app avance → fin : écran de fin dans le panneau, « Recommencer » (confirmé).

### 5.4 Montage libre
Sélecteur de mode → *Libre* (si des pièces sont hors modèle : la confirmation actuelle, en modale) → on prend une pièce (la barre contextuelle « en main » apparaît) → clic → on clique une pièce posée (barre contextuelle « sélection » et gizmo) → double-clic : assemblage → glisser.

### 5.5 Notice et correspondances
Onglet *Notice* → importer un PDF → *Correspondances* (le panneau s'élargit au contexte « éditeur ») → … → *Terminer* → sur la carte *Démarrer*, « Notice synchronisée » devient disponible.

## 6. Points à arbitrer avant la phase 3

| # | Sujet | Proposition | Impact |
|---|---|---|---|
| **A1** | Direction visuelle | **A « Établi »** | — |
| **A2** | Dépendance d'icônes | `lucide-react@1.61.0` | +1 dépendance (≈ 7 Ko gzip au bundle) |
| **A3** | **Sélecteur de mode** : contrôle segmenté (`role=radiogroup`) à la place du `<select data-testid="mode-select">` | Segmenté, avec le même `data-testid` sur le groupe et des `data-value` ; les ~30 `selectOption(...)` des tests passent par un helper `chooseMode(page, mode)`, mis à jour dans le même commit | Modifie des tests (pas leurs assertions). Alternative : garder un `<select>` natif restylé (0 test touché, moins lisible) |
| **A4** | **« Essayer la démo »** au premier lancement | Embarquer `fixtures/mini-4-pieces.mpd` (CC0) comme constante dans `src/components/demo/`, avec un test unitaire qui vérifie l'égalité octet par octet avec la fixture ; ouvre `/atelier?demo=mini-4` (import local, rien d'écrit dans la bibliothèque) | Petit ajout fonctionnel ; aucune route API, aucun accès réseau |
| **A5** | **Confirmation d'« Abandonner » dans l'atelier autonome** (aujourd'hui effacement immédiat) et de **« Reprendre depuis cette étape »** | Confirmation dans les deux cas (exigence transverse de la mission) | Change un comportement : `surface-placement.spec.ts:67` clique « Abandonner » et attend l'effacement ; ajout du clic de confirmation dans le même commit |
| **A6** | **Consignes hors du toast** : les consignes de prise (`pick`, `take`, `moveSelection`, glisser), de sélection (`select`) et d'entrée dans un mode (`MODE_HINT`) vont dans la légende contextuelle ; le toast garde les résultats, y compris les messages *info* qui en sont (assemblage sélectionné ou non, pièces reconnues au changement de mode, progression restaurée, « Pièce laissée où elle était. ») | Oui ; les textes ne changent pas | Vérifié par `grep` : aucune assertion E2E ne porte sur les consignes déplacées ; les messages info assertés (« visibles ou cachées », « Aucune autre pièce reliée », « reconnue(s) à leur place », « Pièce laissée où elle était. ») restent dans `message` |
| **A7** | **Fermeture automatique des toasts de succès** (5 s) | Non pour l'instant : fermeture manuelle (×), le dernier message remplace le précédent comme aujourd'hui | Évite des tests instables ; à rediscuter après la phase 4 |
| **A8** | **Couleurs des fantômes, de la sélection et du mode « voir les connexions »** : elles sont définies dans `src/infra/ldraw/part-catalog.ts` (interdit) | Soit ton accord pour y lire les tokens `--scene-ghost` / `--scene-select` (3 constantes), soit les garder telles quelles (bleu `#3b82f6`, ambre émissif) | Sans accord, le rose pâle de la sélection (U42) reste |
| **A9** | **Dépôt de fichiers sur la collection** (drop global qui ouvre `/ajouter` avec les fichiers) | Reporter : un nouveau point d'entrée, pas indispensable | — |
| **A10** | **Bouton « Réparer »** sur une carte sans mode (lien vers le détail) | Oui (aujourd'hui la carte n'a que « Détails ») | Ajout de présentation |
| **A11** | Fonctions à l'utilité douteuse (signalées en phase 1) : sessions récentes non cliquables (N4), atelier autonome (A5) | Conservées. N4 devient une liste « Reprendre en réimportant » avec la zone de dépôt à côté | — |

## 7. Garde-fous techniques

- **Canvas R3F** : aucun nouveau contexte React au-dessus de `BrickLabApp`. Le thème passe par CSS et un unique observateur dans `BuildCanvas`. Les nouveaux sous-composants (barre d'app, HUD, rail, barre contextuelle, actions du bac) sont des enfants frères du `<Canvas>`, donc leurs rendus ne recréent pas la scène ; les props passées à `BuildCanvas` restent les mêmes. `npm run perf` après chaque écran.
- **Picking** : le bac garde 188 px ; le HUD, le rail et la barre contextuelle sont des **superpositions** (position absolue) qui ne redimensionnent jamais le canvas ; le repli du panneau passe par la même grille que le séparateur (un `ResizeObserver` et `sizeInSync` sont déjà testés).
- **Tests** : tous les `data-testid`, noms accessibles et textes listés dans `dependances-e2e.md` sont conservés. Les boutons à icône gardent leur nom par `aria-label` (« Centrer », « Page suivante »…), et `.tray-item`, `.count`, `.ref`, `.held-badge`, `data-thumb`, `main.workspace[data-side-width]`, `.pdf-scroll` et `aside input[accept=".ldr,.mpd"]` restent.
- **1024 px** : panneau à 280 px minimum, barre contextuelle en icônes, fil d'Ariane tronqué avec infobulle ; rien ne passe à la ligne dans la barre d'app.
- **WebKit** : `color-mix()` et `backdrop-filter` sont pris en charge par Safari ≥ 16.4 et 18 ; un repli opaque est prévu.

## 8. Suite (phases 3 et 4)

1. **Phase 3, filet** (avant toute UI) : E2E pour le hors-ligne dans `/ajouter` (Q11), la bibliothèque LDraw absente (Q10), l'abandon autonome et en bibliothèque (K10), retirer une construction ou un set (C19), vérifier les empreintes (C11), raccourcis G et Q (O14, O16), éditeur monter/descendre/supprimer et tout effacer/restaurer (M8, M18, M19). Ils doivent passer sur la version actuelle.
2. **Phase 4, fondations** : `tokens.css`, thème et bascule, `:focus-visible`, composants `Button`, `IconButton`, `Segmented`, `Field`, `Badge`/`QualityBadge`, `Card`, `Section` (repliable), `Dialog`, `Toast`, `Tooltip`, `Menu`, `EmptyState`, `Skeleton`, `Kbd`, `ProgressBar`, `AppBar`.
3. Puis les écrans dans l'ordre : collection → ajouter → atelier (démarrage, guidé, libre) → notice et éditeur. Un commit par écran, avec `npm test`, `test:e2e` et `perf` à chaque fois.

## 9. Décisions validées (09/11/2026)

Le propriétaire a validé la proposition telle quelle (« Approve A as proposed ») :

| # | Décision |
|---|---|
| A1 | Direction **A « Établi »** ; tokens de `proposition/tokens.css` |
| A2 | `lucide-react@1.61.0`, aucune autre bibliothèque d'UI ; pas de police ajoutée |
| A3 | Sélecteur de mode **segmenté** ; tests via un helper `chooseMode`, assertions inchangées |
| A4 | « Essayer la démo » avec la fixture CC0 embarquée et un test d'égalité avec `fixtures/mini-4-pieces.mpd` |
| A5 | Confirmation pour « Abandonner » (atelier autonome compris) et « Reprendre depuis cette étape » ; `surface-placement.spec.ts` et `filet-refonte.spec.ts` suivent dans le même commit |
| A6 | Consignes dans la légende contextuelle, résultats dans le toast |
| A7 | Pas de fermeture automatique des toasts pour l'instant |
| A8 | **Pas de modification de `src/infra/`** : la proposition offrait deux options sans en choisir une, donc on garde les matériaux actuels (fantôme bleu, sélection ambre) tant que l'accord n'est pas donné explicitement |
| A9 | Dépôt de fichiers sur la collection reporté |
| A10 | Bouton « Réparer » sur les cartes sans mode |
| A11 | Fonctions signalées conservées |

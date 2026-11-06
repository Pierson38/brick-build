# Atelier — panneaux redimensionnables, notice ajustée, miniatures des pièces : rapport

**Date :** 06/11/2026. Branche `fix/atelier-resizable-panels-part-previews`, worktree `brick-build-worktrees/ux-resizable-panels`, base `origin/main` = `727ba1c67b438cf3c30d54421bcf38510c74cbb1` (P8 fusionné).
**Machine :** Mac Apple M2 Pro, macOS 26.6.2, Node 24.5.0, Chromium et WebKit (Playwright 1.64.1).
Recette humaine : [RECETTE_HUMAINE_UX_ATELIER.md](RECETTE_HUMAINE_UX_ATELIER.md).

> Lot UX ciblé, demandé après la recette humaine P8. Inchangés : règles de placement, parseur LDraw, correspondances, progressions sauvegardées, catalogue et imports, données personnelles. Pas de P9.

## 1. Problèmes constatés et corrections

| Constat (recette P8) | Mesure avant | Correction |
|---|---|---|
| Vue 3D et panneau latéral de proportions fixes (400 px, 520 px dans l'éditeur) | — | **Séparateur** déplaçable (souris, trackpad, stylet), accessible au clavier (← → 16 px, Maj 80 px, Début / Fin, Entrée = défaut), double-clic = proportions par défaut. Largeur mémorisée **par contexte** (atelier, éditeur de correspondances), en proportion de la fenêtre, dans le `localStorage` du navigateur (préférence locale, jamais dans la bibliothèque). Minimums : panneau 280 px, vue 3D 320 px ; sur petite fenêtre la vue 3D garde la priorité. |
| En montage libre, la notice s'ouvre à 100 % et déborde | **196 px** de défilement horizontal sur 31009, **230 px** sur la notice de test (1280×800) | Notice **ajustée à la largeur par défaut dans tous les modes** ; `ResizeObserver` sur la zone de la page : la page suit le panneau immédiatement (CSS) puis est redessinée nette 120 ms après la fin du mouvement ; un rendu PDF annulé se termine avant que le suivant commence (aucun rendu concurrent sur le même canvas) ; gouttière de défilement stable. Zoom manuel inchangé (+ / −, ↔ pour revenir). **0 px** de débordement après. |
| Pièces identifiées par leur référence LDraw (`3069b`, « couleur 72 ») | — | **Miniature isométrique** de chaque couple pièce/couleur, dessinée à partir du **même gabarit LDraw** que celui de la vue 3D (clé `trayKey`, géométrie et matériaux partagés), même chaîne de couleur (sRGB, ACES). Quantité ×N, référence en petit, infobulle « référence · nom de couleur LDConfig (code) · restantes/total », pièce tenue entourée et marquée « en main ». Repli explicite « forme indisponible » (pastille de couleur) si le rendu est impossible. Contours masqués sur les grandes pièces (une plaque 16×16 verte paraissait noire). |
| — (trouvé pendant le lot) | Avec 92 pièces, les actions (Annuler, Mode, Centrer…) défilaient avec la liste | Les pièces défilent dans la barre, les actions restent visibles ; la barre garde une **hauteur fixe** (contrainte P5 : une barre de hauteur variable désynchronisait le pointeur 3D). |

**Three.js / raycasting** : le canvas suit son conteneur via le `ResizeObserver` de React Three Fiber (sans délai) ; le séparateur ne fait que changer la largeur de la colonne. Vérifié par des poses **au pointeur** après glisser, clavier et changement de taille de fenêtre (`sizeInSync`, placements exacts).

**Performances** : un seul moteur de rendu WebGL pour toutes les miniatures (jamais un contexte par vignette), une image par gabarit en cache (aucun nouveau rendu à la réouverture), rendu progressif pendant le temps libre du navigateur (tranches de 8 ms au plus), après la notice, la reprise et la vue 3D.

## 2. Captures avant / après

Fixtures originales (dans le dépôt) : [avant 1280×800](preuves/ux/avant-1280x800.png) · [après 1280×800](preuves/ux/apres-1280x800.png) · [avant 1512×945](preuves/ux/avant-1512x945.png) · [après 1512×945](preuves/ux/apres-1512x945.png).
Sets réels (hors dépôt, la notice est un contenu LEGO) : `~/Documents/brick-lab-data/proofs/ux/` — `avant-31009-*.png`, `apres-31009-*.png`, `apres-31009-1-notice-elargie.png`, `apres-31040-1-*.png`, mesures `mesures-ux.json`. Script reproductible : `npx tsx scripts/ux-captures.ts <url> <dossier> <libellé> [modèle] [notice]`.

## 3. Mesures (sets réels, GPU réel, fenêtre 1280×800, `atelier-ux-omr.spec.ts`, code final, deux passages de la suite complète)

| | 31040 | 31009 |
|---|---|---|
| Couples pièce/couleur (miniatures) | 30 | **92** |
| Première miniature | 133 – 146 ms | 143 – 157 ms |
| Toutes les miniatures (rendu en temps libre du navigateur) | 241 – 334 ms | **946 – 950 ms** |
| Rendu d'une miniature : moyenne / maximum | 2,5 – 3,6 / 16 – 18 ms | 2,0 – 2,6 / 13 – 14 ms |
| Vue 3D sans miniatures | 60 i/s, pire image 17 ms | 60 i/s, pire image 17 ms |
| Vue 3D **pendant** le rendu des miniatures | 60 i/s, pire image 17 ms, 0 image > 50 ms | 60 i/s, pire image 17 ms, 0 image > 50 ms |
| Notice élargie (+280 px) : écart / débordement | 0 / 0 px | 0 / 0 px |
| Pièces posées au pointeur après 4 redimensionnements | 8/8 (guidé), 0 refus, 0 secours clavier | 8/8 (guidé), 0 refus, 0 secours clavier |

Avant la correction du § 5 (rendu immédiat), 31009 dessinait ses 92 miniatures en 514 ms ; le passage en temps libre double ce délai total, la première miniature restant à ~150 ms et la vue 3D à 60 i/s.

## 4. Tests

- **unitaires** `atelier-ux.test.ts` (14) : largeurs par défaut, bornes sur écrans MacBook et fenêtres étroites, proportion qui suit la fenêtre, clavier (flèches, Maj, Début/Fin, Entrée, raccourcis de l'atelier non interceptés), préférence locale non fiable (JSON invalide, valeurs hors bornes, `__proto__`), cadrage isométrique des miniatures (brique, plaque 16×16, rond 1×1, antenne).
- **E2E** `atelier-ux.spec.ts` (7, fixtures originales) : souris, clavier, mémorisation après rechargement, double-clic, fenêtres 1280×800 / 1440×900 / 1024×700 / 800×600 sans débordement ; notice ajustée et redessinée après redimensionnement ; zoom + / − / ↔ ; **placements au pointeur après plusieurs redimensionnements** (guidé puis libre) ; mode synchronisé et éditeur (largeur par contexte, page tournée et toujours ajustée) ; miniatures : 6 couples dont une même pièce en deux couleurs et deux pièces de même couleur, **couleur moyenne de chaque miniature plus proche de sa couleur LDConfig que de toute autre**, images distinctes, quantités, infobulle, sélection, rendu unique (cache) ; repli « forme indisponible » ; **WebKit** (moteur de Safari) : séparateur, notice ajustée, miniatures, pose.
- **E2E réels** `atelier-ux-omr.spec.ts` (3, ignorés sans les fichiers) : § 3.
- Modifié : `brick-lab.spec.ts` (P0–P4), contrôle du zoom : la notice démarre désormais en « Largeur » ; + passe au zoom fixe supérieur à l'échelle ajustée, ↔ revient.

## 5. Sortie de la validation

**Défaut trouvé par la suite complète et corrigé.** Première exécution complète : 2 échecs intermittents (et 8 tests de `library.spec` ignorés car dépendants en série) — `instructions-sync-omr` (31040 réel) : une page de notice lue en retard juste après le rechargement à 30 pièces ; `library.spec` « deux onglets » : livret pas encore ouvert dans un onglet après 5 s. Les deux specs passaient seules (2 × 13/13). Cause retenue : le rendu des miniatures, lancé tout de suite, concurrençait l'ouverture de la notice et la reprise sur les machines de test (WebGL logiciel). Correction : rendu pendant le temps libre du navigateur (`requestIdleCallback`, tranches espacées en repli pour Safari). Les tests P6/P7 n'ont pas été modifiés.

Sur le code final (`npm run check:spec && npm run typecheck && npx vitest run`, puis **deux** exécutions complètes de Playwright, puis `npm run build`), 06/11/2026 :

```
check:spec   15 OK, 2 DÉCLARÉ (écarts P5 inchangés), 0 écart nouveau
typecheck    tsc --noEmit : 0 erreur
vitest       Test Files 13 passed (13) — Tests 236 passed (236)   [222 avant + 14 UX]
playwright   passage 1 : 57 passed (16.1m), 0 ignoré, 0 échec
             passage 2 : 57 passed (15.8m), 0 ignoré, 0 échec
  add-set.spec.ts                 4/4   (P8)
  atelier-ux.spec.ts              7/7   (UX, fixtures, dont WebKit)
  atelier-ux-omr.spec.ts          3/3   (UX, 31040 + 31009 réels)
  brick-lab.spec.ts               6/6   (P0–P4 ; contrôle du zoom adapté)
  instructions-sync.spec.ts       4/4   (P6)
  instructions-sync-omr.spec.ts   2/2   (P6, 31040 réel, mode synchronisé jusqu'au bout)
  library.spec.ts                11/11  (P7)
  library-webkit.spec.ts          1/1   (P7)
  library-omr.spec.ts             3/3   (P7, 31040 + 31009 réels)
  omr-validation.spec.ts         10/10  (P5, 31040 + 31009 réels)
  surface-placement.spec.ts       6/6   (P5)
npm run build   OK (production, 0 avertissement)
```

Non exécuté : `npm run perf` (mesures du lot faites par `atelier-ux-omr.spec.ts`, § 3).

## 6. Limites

- **Safari réel** non testé par Claude (WebKit de Playwright seulement) → recette humaine § 4.
- **Préférence par navigateur** : la largeur choisie dans Chrome ne s'applique pas à Safari (stockage local du navigateur, volontairement hors de la bibliothèque).
- **Miniatures** : vue isométrique unique (pas de rotation) ; contours masqués au-delà d'un rayon de 90 LDU ; rendu en mémoire de la page (≈ 5 à 10 Ko par miniature), refait à chaque ouverture de l'atelier.
- **Pendant le glissement**, la page de la notice est mise à l'échelle par le navigateur (légèrement floue) jusqu'au rendu net, 120 ms après l'arrêt.
- **Barre des pièces** : 2 rangées visibles à 1280×800 ; au-delà, défilement dans la barre.
- **Mesures** sur un M2 Pro ; un Mac plus ancien sera plus lent (le rendu reste découpé en tranches de 8 ms pendant le temps libre).

## 7. Verdict

**Recette humaine terminée par le propriétaire le 06/11/2026 (Chrome et Safari) : les sept points sont déclarés OK** — détail et constat sur les données dans [RECETTE_HUMAINE_UX_ATELIER.md](RECETTE_HUMAINE_UX_ATELIER.md) § 5. **GO explicite de fusion de la PR #6 donné par le propriétaire.**

Démontré : la notice peut être élargie ou réduite à la souris, au trackpad ou au clavier, la largeur est mémorisée, la page reste entière sans défilement horizontal dans les trois modes et l'éditeur ; les placements restent exacts après redimensionnement ; chaque pièce est montrée par sa forme et sa couleur réelles (même géométrie que la vue 3D), avec sa quantité, sans ralentir la construction (60 i/s pendant le rendu des 92 miniatures de 31009). Aucune modification des règles de placement, du parseur, des correspondances, des progressions, du catalogue ni des imports ; aucune donnée personnelle modifiée (après la recette, seul un aperçu de construction 31039 a été ajouté).

Hors périmètre, signalé pendant la recette : le montage libre impose encore les positions du modèle LDraw — limitation antérieure du moteur, non bloquante, documentée dans [LIMITATION_MONTAGE_LIBRE.md](LIMITATION_MONTAGE_LIBRE.md) et traitée dans un lot dédié.

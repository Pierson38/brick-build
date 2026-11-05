# P6 — Notice officielle et construction 3D synchronisée : rapport

**Date :** 04/11/2026. Branche `feat/p6-instructions-sync`, worktree dédié, base `origin/main` = `5e03680` (P5 fusionné).
**Machine :** Mac Apple M2 Pro, macOS 26.6.2, Node 24.5.0, Chromium (Playwright 1.64.1).

Architecture, schéma et risques : [P6_ARCHITECTURE_NOTICE_SYNC.md](P6_ARCHITECTURE_NOTICE_SYNC.md). Décisions : [JOURNAL_DECISIONS.md](JOURNAL_DECISIONS.md#journal--04112026-lot-p6-notice--3d-synchronisée).

> Aucun contenu LEGO n'est ajouté au dépôt : ni PDF, ni image ou texte de notice, ni MPD de set, ni mapping réel. La fixture P6 est originale (CC0). Le mapping de 31040, les captures et les mesures restent dans `~/Documents/brick-lab-data/` (`mappings/`, `proofs/p6/`).

## 1. Ce qui est livré

| Phase | Livré | Preuve |
|---|---|---|
| A — Étude | Mesures sur 31040 (1 livret, 3 modèles, 21 étapes du modèle 1 sur 11 pages, encadrés, « 2x/4x ») et 31009 (3 livrets = 3 modèles, séquence insérée, numéros non uniques) | `P6_ARCHITECTURE_NOTICE_SYNC.md` § 1 |
| B — Modèle | Schéma `brick-lab-instruction-mapping` v1 : empreinte du MPD (SHA-256, modèle principal, nombre de pièces), livrets (SHA-256 et pages du PDF), entrées (livret, page PDF, numéro imprimé, encadré, multiplicateur, `occurrenceIds`, provenance `manual`/`verified`, note). Parsing borné d'une entrée non fiable ; validation recalculée (doublons, couverture, pages, ordre). | `src/domain/instructions/mapping.ts`, 23 tests unitaires |
| C — Éditeur | Onglet **Correspondances** : livrets liés au PDF affiché, navigation ◀ ▶ entre les étapes, nouvelle étape préremplie (page affichée, numéro suivant), affectation par clic 3D sur un fantôme, retrait par clic sur une pièce surlignée, déplacement explicite par ⌥-clic, boutons +1 / +n par pièce/couleur, aide « pièces libres d'une étape LDraw », aperçu 3D (construit jusqu'à l'étape, étape en ambre, non affectées en fantôme), doublons avec correction, validation détaillée, sauvegarde locale automatique, export et réimport du fichier personnel | `src/components/mapping/MappingEditor.tsx`, E2E « editor » |
| D — Jeu | Mode **Notice synchronisée** proposé seulement si le mapping est valide. Bandeau d'étape (libellé imprimé, livret, page, rang sur la page), page tournée automatiquement, seules les pièces de l'étape dans le bac, avance automatique, consultation d'une étape passée, « reprendre depuis cette étape », annulation, changement de mode qui conserve les pièces, reprise après rechargement, contrôle d'empreinte du PDF réimporté. Sans mapping valide : retour **explicite** au montage libre, pièces conservées. | `BrickLabApp.tsx`, `SyncStepBanner.tsx`, E2E « synchronised build », « fallback » |

## 2. Essai réel sur 31040 (modèle 1, livret 6145903, p. 2–12)

**Saisie.** Claude a saisi le mapping en lisant chaque page (rendu local du PDF), selon la méthode de l'éditeur : 24 entrées pour 21 étapes imprimées (les encadrés des étapes 7, 14 et 18 sont découpés en sous-étapes), soit 65/65 occurrences affectées une fois. Le validateur ne signale **aucun avertissement**, seulement « 24/24 non vérifiées visuellement ».

| Étapes LDraw (fichier OMR) | Entrées de notice | Correspondance |
|---|---|---|
| 1 (5 pièces) | 1, 2 (p. 2) | 2 + 3 |
| 2 (7) | 3, 4 (p. 3), 5 (p. 4) | 2 + 4 + 1 |
| 3 (3) | 6 (p. 4) | 3 |
| 4 (8) | 7·1, 7·2, 8 (p. 5) | 1 + 3 + 4 |
| 5 (5) | 9, 10 (p. 6) | 2 + 3 |
| 6 (5) | 11, 12 (p. 7) | 3 + 2 |
| 7 (10) | 13, 14·1 ×2, 14·2 ×2 (p. 8) | 4 + 2 + 4 |
| 8 (5) | 15, 16 (p. 9) | 3 + 2 |
| 9 (4) | 17, 18·1, 18·2 (p. 10) | 1 + 1 + 2 |
| 10 (5) | 19, 20 (p. 11) | 3 + 2 |
| 11 (8) | 21 ×4 (p. 12) | 8 |

Chaque étape LDraw se découpe **exactement** en étapes de notice consécutives : l'auteur OMR a fusionné des étapes, sans changer l'ordre. Ce constat vaut pour 31040, pas en général (31009 : sous-modèles, minifig en dernier).

**Points incertains**, notés dans le mapping et à vérifier par le propriétaire :
- étapes 9, 16 et 19 : la notice dessine **une** pièce avec deux flèches, alors que le fichier en contient deux, identiques et symétriques ;
- frontière entre les étapes 4 et 5 (plaques gris foncé 1×4).

**Construction réelle** (`tests/e2e/instructions-sync-omr.spec.ts`, joueur scripté P5, pointeur et clavier uniquement, emplacements de l'étape affichés par défaut) :

| Mesure | Résultat |
|---|---|
| Pièces posées | **65/65**, 65 clics, **0 refus**, 0 secours PageUp/PageDown |
| Entrées de notice parcourues | **24/24, dans l'ordre du mapping** |
| Page affichée = page de l'étape, sans clic sur le PDF | **24/24** (11 pages, de la p. 2 à la p. 12) |
| Pièces proposées hors de l'étape active | **0** (contrôlé avant chaque pose) |
| Reprise après rechargement à 30/65 | OK : même entrée, livret à réimporter, page retrouvée |
| Poses en orientation équivalente / changements d'orientation (O) / rotations de caméra | 18 / 25 / 7 |
| Durée de la construction scriptée | 34 s |
| Aperçu de l'éditeur à l'étape 13 (p. 8) | 33 pièces construites, 4 surlignées, 0 fantôme |

**Contrôle visuel** (capture hors dépôt `proofs/p6/31040-1-synced-step8.png`) : à l'étape 8, la 3D correspond à l'état de l'étape 7 dessiné page 5, et le bac ne propose que les 4 pièces dessinées à l'étape 8.

**Mesure ayant changé une décision** : avec les emplacements masqués, le joueur scripté échouait à la 52e pièce (tuile posée sur la face arrière, cachée de la caméra). Les emplacements de l'étape sont désormais affichés par défaut, comme en mode guidé. La case reste décochable.

## 3. Tests réellement exécutés

Voir § 6 (sortie de `npm run recette`). Nouveaux tests :
- **unitaires** `tests/unit/mapping.test.ts` (23) : couverture complète et incomplète, doublons dans une étape et entre étapes, autre modèle, autre modèle principal, autre nombre de pièces, pièces, livrets et pages inconnus, ordre des pages, libellés répétés, multiplicateur, étape vide, plusieurs livrets, sous-modèles, édition sans doublon silencieux, aller-retour export/import exact, entrées malformées ou hors bornes, champs inconnus et `__proto__` ignorés, plan synchronisé (page et rang), avance, annulation, retour arrière, changement de mode, progression v2 et relecture de la v1, empreinte du mapping ;
- **E2E synthétiques** `tests/e2e/instructions-sync.spec.ts` (4) : éditeur complet (y compris clics 3D réels et ⌥-clic), jeu synchronisé (2 étapes sur une page, encadré, « 2x », tournage de page, consultation, reprise depuis une étape, annulation entre étapes, rechargement, mauvaise notice, retour à la page), absence de mode synchronisé sans mapping valide, repli explicite, progression P5 v1 ;
- **essai réel** `tests/e2e/instructions-sync-omr.spec.ts` (2, ignorés si les fichiers hors dépôt manquent).

Le joueur scripté de P5 a été **déplacé sans modification** dans `tests/e2e/scripted-player.ts` ; la spec P5 `omr-validation` l'importe et repasse en entier (§ 6).

## 4. Limites

- **Saisie manuelle uniquement** : aucune reconnaissance de la notice. Pour 31040, 24 entrées et 65 pièces ; pour 31009, il faudrait environ 80 entrées et 270 pièces (non fait dans ce lot).
- **Mapping 31040** : saisi par Claude, puis contrôlé par le propriétaire contre la notice (§ 7). Les 24 entrées sont `verified` sur sa confirmation ; les 4 points incertains sont conservés tels quels, sans correction. Les notes « à confirmer » des étapes 9, 16 et 19 restent dans le fichier.
- **Empreinte stricte** : une autre édition ou langue de la même notice (autre SHA-256) est refusée, même si ses pages sont identiques. Il faut relier à nouveau le livret dans l'éditeur, ce qui remet en cause la vérification.
- **Aucune vérification physique de l'ordre** (pièce posée avant son support) : la pose « en l'air » de P5 le permet.
- **Étapes vides** (assemblage d'un encadré, retournement) : signalées puis sautées en jeu ; leur page n'est pas montrée séparément.
- **Encadrés** : construits en place, à la position finale, et non à part comme sur la notice.
- **Raccourci « +1 »** : il prend la première pièce libre dans l'ordre du fichier, pas forcément celle de la page. Le clic 3D est la méthode exacte.
- **Recette humaine P6** : OK (§ 7), mais grille détaillée et navigateurs testés non transmis.
- **31009 non essayé** en mode synchronisé (le schéma multi-livret est testé sur fixtures et en unitaire).

## 5. Verdict

**GO** (05/11/2026, après recette humaine ; verdict initial du 04/11 : GO sous conditions).

Démontré : le schéma de correspondance garantit « chaque occurrence exactement une fois ». L'éditeur permet une saisie réelle, et le mode synchronisé fait construire 31040 de bout en bout au rythme de sa notice officielle, page par page, sans pièce hors étape, avec reprise après rechargement. Aucune régression P5 (§ 6). Rien n'est inventé sans mapping valide.

Conditions posées le 04/11, levées le 05/11 (§ 7) :
1. ✅ **Recette humaine P6** selon `RECETTE_HUMAINE_P6.md` : OK.
2. ✅ **Vérification du mapping 31040** par le propriétaire contre la notice : 24/24 entrées confirmées, sans correction.

La fusion reste soumise au GO explicite du propriétaire.

Hors conditions, à décider : saisie de 31009 (coût de saisie, R9) ; aide à la création des étapes depuis la couche texte du PDF (numéros d'étape), jamais d'affectation automatique des pièces.

## 6. Sortie de la recette (04/11/2026, `npm run recette`, sortie 0)

```
check:spec   15 OK, 2 DÉCLARÉ (écarts P5 inchangés), 0 écart nouveau
typecheck    tsc --noEmit : 0 erreur
vitest       Test Files 5 passed (5) — Tests 84 passed (84)   [61 P0–P5 + 23 P6]
playwright   28 passed (11.9m)
  brick-lab.spec.ts               6/6   (P0–P4, fixtures)
  surface-placement.spec.ts       6/6   (P5, fixtures)
  omr-validation.spec.ts         10/10  (P5, 31040 + 31009 réels : guidé, reprise, libre, libre + notice)
  instructions-sync.spec.ts       4/4   (P6, fixtures synthétiques)
  instructions-sync-omr.spec.ts   2/2   (P6, essai réel 31040)
npm run build   OK (production)
```

Non exécuté dans ce lot : `npm run perf` (P6 ne touche ni au rendu ni au chargement ; seul un matériau surligné est ajouté, et uniquement dans l'éditeur et la consultation).

## 7. Recette humaine et vérification du mapping (05/11/2026)

**Conditions.** Serveur de production local (`npm run build && npm run start`, `127.0.0.1:3000`), code de la PR #3 au commit `4ebe7ce`. Fichiers locaux : MPD `2036218e4555…`, notice `38e9cd4e32da…`, mapping préparé (24 entrées, 0 `verified`). Aide fournie : fiche locale `brick-lab-data/proofs/p6/verification-31040/index.html`, générée hors dépôt. Pour chaque entrée, elle donne la page, le numéro, l'encadré et le multiplicateur, les pièces (référence, désignation LDraw, couleur, nombre, position) et la 3D avant/après sous deux angles. Les 4 incertitudes y sont signalées.

**Résultat communiqué par le propriétaire :**
- recette (protocole `RECETTE_HUMAINE_P6.md`) : « C'est tout bon ». Aucun KO ni point pénible signalé ; la grille détaillée et la liste des navigateurs n'ont pas été transmises (le protocole prévoit Chrome puis Safari) ;
- vérification du mapping : « Yes, all 24 » (les 24 entrées contrôlées contre la notice).

**Mapping vérifié.**
- **Fichier exporté depuis l'application** (5 nov., 16:25). Validation : 65/65, 0 doublon, empreinte PDF reconnue. Affectations et ordre **identiques** au mapping préparé (même `mappingDigest`) : aucune correction. 1 entrée sur 24 cochée « Vérifiée » dans l'interface.
- **Marquage des 23 autres entrées** : passées en `verified` **sur la confirmation explicite du propriétaire** (« Yes, all 24 »), par script, sans aucun autre changement. Résultat : 24/24 `verified`, validation sans remarque, empreinte des affectations inchangée.
- **Rangement, hors dépôt** : `~/Documents/brick-lab-data/mappings/31040-1.brick-mapping.json` (SHA-256 `7639e54c1370…`). La version préparée par Claude est conservée dans `31040-1.prepared-by-claude.brick-mapping.json`.
- **Points incertains** (étapes 4, 9, 16, 19) : validés tels que saisis. Aucune modification de code ni de spécification pendant la recette.


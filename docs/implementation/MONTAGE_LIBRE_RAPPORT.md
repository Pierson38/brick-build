# Véritable montage libre — rapport

**Date :** 06/11/2026. Branche `feat/true-free-building`, worktree `brick-build-worktrees/true-free-building`, base `origin/main` = `5272811626789264cc10e7d759944e832bb1ff6b` (lot UX fusionné, PR #6).
**Machine :** Mac Apple M2 Pro, macOS 26.6.2, Node 24.5.0, Chromium et WebKit (Playwright 1.64.1).
Architecture : [MONTAGE_LIBRE_ARCHITECTURE.md](MONTAGE_LIBRE_ARCHITECTURE.md) · recette humaine : [RECETTE_HUMAINE_MONTAGE_LIBRE.md](RECETTE_HUMAINE_MONTAGE_LIBRE.md) · origine : [LIMITATION_MONTAGE_LIBRE.md](LIMITATION_MONTAGE_LIBRE.md).

> Critère du propriétaire : en montage libre, choisir une brique et la poser où il veut, même si ce n'est pas sa place dans le modèle LEGO officiel. Pas de physique d'emboîtement ; pas de P9.

## 1. Ce qui change

| Avant (P0–P8) | Maintenant |
|---|---|
| Montage libre = ordre libre ; une pièce n'est acceptée qu'à ≤ 10 LDU / 10° d'une cible du modèle (« Trop loin… ») | Une pièce du stock est **posée là où on pointe**, à sa pose réelle, sans comparaison obligatoire avec le modèle. Refus seulement sans stock. |
| Une pièce posée ne peut qu'être annulée (la dernière) | **Clic sur une pièce posée** : reprise en main → déplacer, tourner (R / O), reposer ; Échap la laisse en place ; Suppr la remet dans le stock. |
| Hauteur et position dictées par les cibles du modèle | Elle repose sur la surface visée (dessus du corps, tenons ignorés, alignée sur la pièce visée), grille d'un demi-tenon et niveaux de plaque (G pour la retirer) ; **aimant facultatif** sur la place du modèle à ≤ 9,5 LDU (< un pas de grille). |
| Sauvegarde : identifiants d'occurrences | En plus, en montage libre : chaque pièce libre avec sa **pose réelle** (schéma v3, seulement s'il y en a). |
| « Bravo, modèle terminé ! » quand tout est posé | Montage libre, stock épuisé : « Toutes les pièces du set sont posées (N/N). Montage libre : ta construction n'est pas comparée au modèle officiel — K pièce(s) à leur place dans le modèle. » Collection : « Terminé » seulement si toutes les pièces sont à leur place. |
| Changer de mode garde les pièces | Libre → guidé / synchronisé : les pièces à leur place du modèle deviennent des pièces du modèle ; s'il en reste hors modèle, **confirmation explicite** (« Retirer et changer de mode » / « Rester en montage libre »). |

**Inchangés** : modes guidé et synchronisé (`tryPlace`, `resolveHover`, étapes, messages), parseur LDraw, correspondances, catalogue, imports. Une partie sans pièce libre est enregistrée en v2 **octet pour octet** comme avant. Aucune migration.

## 2. Compatibilité des sauvegardes

| Sauvegarde | Restaurée |
|---|---|
| P5 (v1), P6–P8 (v2) guidée / synchronisée | à l'identique (mêmes règles) |
| Ancienne partie libre (identifiants seuls) | pièces sur leurs **positions historiques** (les cibles où elles ont été posées), aucune position libre inventée ; une pièce n'en sort que si le joueur la reprend (elle devient alors libre) |
| v3 (pièces libres) | poses exactes ; validée côté navigateur et serveur (mode libre seulement, stock jamais dépassé, identifiants uniques, pose rigide et bornée), sinon refusée et conservée telle quelle |
| Bibliothèque | les pièces libres comptent dans la signature de partie (conflit entre onglets jamais résolu en silence) et dans la comparaison navigateur ↔ bibliothèque |

Limite : la version actuelle de `main` ne sait pas reprendre une partie v3 (elle la conserve, sans la modifier). D'où la sauvegarde préalable et la procédure de retour dans la recette humaine.

## 3. Tests

- **Unitaires** — `free-building.test.ts` (21) : pose éloignée acceptée en libre et refusée en guidé ; quantités et couleurs ; briques identiques ; déplacement, rotation, retrait, annulation après rechargement ; pose non rigide refusée ; reconnaissance « à sa place » (tolérances guidées, symétries, jamais deux fois) ; passage libre → guidé explicite ; statut de la collection ; v2 inchangée sans pièce libre, aller-retour v3, anciennes parties libres restaurées sur leurs positions, refus des données non fiables (12 cas) ; comparaison navigateur ↔ bibliothèque ; survol : sol, dessus d'une pièce (tenon frôlé), aimant et grille. `library-store.test.ts` (+2) : poses relues par un **nouveau magasin** (redémarrage du serveur), comptes, statut, v3 incompatible refusée sans rien écrire ; tout à sa place → « Terminé ».
- **E2E fixtures** — `free-building.spec.ts` (6) : poser / reprendre / déplacer / tourner / retirer / Échap / Annuler / ⌘Z ; identiques, quantités, message de fin, rechargement ; changement de mode explicite et guidé strict ; bibliothèque (poses enregistrées en v3, rechargement, collection « En cours » à stock épuisé) ; ancienne partie libre v2 restaurée puis pièce déplacée ; **WebKit**.
- **Modifiés** (ancienne règle « refus loin d'une cible en montage libre ») : `surface-placement.spec.ts`, 2 tests réécrits — la nouvelle règle en libre **et** le même refus en guidé. `scripted-player.ts` (joueur P5) : en libre, il vérifie que la pose est bien sur l'emplacement visé, sinon il annule et recommence (sinon une pose à côté aurait été comptée réussie).
- **Recette réelle** `tests/recette/libre-reel.spec.ts` (opt-in, `playwright.recette-libre.config.ts`, dossier isolé, fichiers du propriétaire **copiés** en lecture seule) : § 4.

## 4. Recette réelle 31009 et 31039 (dossier isolé, serveur redémarré entre les deux parties)

| | 31009 Small Cottage | 31039 Blue Power Jet |
|---|---|---|
| Occurrences / couples pièce-couleur | 270 / 92 | 609 / 165 |
| Ouverture de la construction (géométrie) | 4,1 s | 6,3 s |
| 6 pièces différentes posées sur le sol autour du modèle : distance à leur place la plus proche | 93 à 320 LDU | 311 à 671 LDU |
| 3 pièces identiques | 3069b gris foncé : stock 4 → 1 | 2780 noir : stock 9 → 6 |
| Empilement (dessus d'une pièce libre) | tuile sur tuile : y −8 → −16 (8 LDU, une tuile) | 2780 sur 2780 : 7,8 LDU plus haut (pièce Technic, hors convention « origine au sommet » : approximatif) |
| Déplacée + tournée | oui (≈ 530 LDU, rotation changée) | oui (≈ 1 000 LDU, rotation changée) |
| Retirée puis ⌘Z | oui | oui |
| Vue 3D au repos / en tournant la caméra | 60 i/s, pire image 17 ms / 60 i/s, 17 ms, 0 image > 50 ms | idem |
| Enregistré | v3, 10 pièces libres | v3, 10 pièces libres |
| **Après redémarrage du serveur** | 10/270, mêmes 10 poses (empreinte SHA-256 identique), message « dont 10 posée(s) librement » | 10/609, idem |
| Annuler après rechargement | 10 → 9 | 10 → 9 |
| Passage en guidé | confirmation « 10 pièce(s) posée(s) hors du modèle officiel… » ; après « Retirer et changer de mode » : 0/270, pose loin refusée « Trop loin de l'emplacement le plus proche (267 LDU) » | pas d'étapes dans le fichier OMR : montage libre uniquement |

Mesures et captures : `~/Documents/brick-lab-data/proofs/libre/` (`recette-libre.json`, `libre-*-partie1.png`, `libre-*-apres-redemarrage.png`). Ta bibliothèque réelle n'a jamais été ouverte par ces essais.

## 5. Sortie de la validation

Défauts trouvés par les tests pendant le lot et corrigés : aimant à 6 LDU trop strict (rayon frôlant un tenon à 7 LDU, suite P5) → 9,5 LDU ; empilement décalé d'un demi-tenon quand le pointeur frôle un tenon → position prise sur le dessus du corps.

Sur le code final (`npm run check:spec && npm run typecheck && npx vitest run`, puis **deux** exécutions complètes de Playwright, puis `npm run build`), 06/11/2026 :

```
check:spec   15 OK, 2 DÉCLARÉ (écarts antérieurs inchangés), 0 écart nouveau
typecheck    tsc --noEmit : 0 erreur
vitest       Test Files 14 passed (14) — Tests 259 passed (259)   [236 avant + 21 free-building + 2 library-store]
playwright   passage 1 : 63 passed (14.9m), 0 ignoré, 0 échec
             passage 2 : 63 passed (14.7m), 0 ignoré, 0 échec
  free-building.spec.ts           6/6   (nouveau, dont WebKit)
  surface-placement.spec.ts       6/6   (P5 ; 2 tests réécrits pour la nouvelle règle + refus en guidé)
  add-set 4/4 · atelier-ux 7/7 · atelier-ux-omr 3/3 · brick-lab 6/6 · instructions-sync 4/4 ·
  instructions-sync-omr 2/2 (31040 réel, synchronisé jusqu'au bout) · library 11/11 · library-webkit 1/1 ·
  library-omr 3/3 · omr-validation 10/10 (31040 + 31009 réels, joueur scripté)   — inchangés
recette réelle libre-reel.spec.ts : partie 1 1/1, redémarrage du serveur, partie 2 1/1
npm run build   OK (production, 0 avertissement)
```

## 6. Limites

- **Pas de physique** : ni collision, ni emboîtement des tenons ; deux pièces peuvent s'interpénétrer.
- **Empilement** fiable pour les pièces qui suivent la convention LDraw « origine au sommet du corps » (briques, plaques, tuiles) ; approximatif pour les axes, connecteurs Technic et pièces renversées. Une face latérale visée pose la pièce au niveau de plaque sous le point visé.
- **Orientations** : celles que le modèle utilise pour la pièce (O) et les quarts de tour (R) ; pas de rotation libre à la souris.
- **Annuler** : l'historique des actions vit dans la page ; après un rechargement, « Annuler » retire la dernière pièce posée.
- **Reconnaissance « à sa place » côté serveur** (statut de la collection) sans les symétries des pièces : peut sous-compter, jamais sur-compter. L'atelier, lui, les utilise.
- **Format v3** non lisible par la version actuelle de `main` (conservé, pas repris) : sauvegarde avant la recette.
- **Safari réel** et **trackpad** : non testés par Claude (WebKit de Playwright et souris scriptée) → recette humaine.

## 7. Verdict

**GO sous condition : recette humaine** ([RECETTE_HUMAINE_MONTAGE_LIBRE.md](RECETTE_HUMAINE_MONTAGE_LIBRE.md)), en particulier le confort de pose à la souris et au trackpad, et l'application Safari.

Démontré : en montage libre, une pièce du stock se pose où l'on pointe, loin de sa place officielle (jusqu'à 671 LDU sur 31039), se reprend, se déplace, se tourne et se retire ; quantités et couleurs du set respectées, pièces identiques distinctes ; poses réelles enregistrées et restaurées après rechargement et **redémarrage du serveur** ; anciennes parties restaurées sans changement ; passage vers le guidé explicite ; modes guidé et synchronisé inchangés (suites P5–P8 rejouées, même pose refusée en guidé). La fusion reste soumise à ton GO explicite.

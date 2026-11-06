# Véritable montage libre — corrections après la recette humaine (hauteur libre, groupes)

**Date :** 06/11/2026. Même branche `feat/true-free-building` (PR #7), même worktree. Verdict de la recette du propriétaire avant ces corrections : **NO-GO** (deux limitations). Architecture d'origine : [MONTAGE_LIBRE_ARCHITECTURE.md](MONTAGE_LIBRE_ARCHITECTURE.md) · rapport : [MONTAGE_LIBRE_RAPPORT.md](MONTAGE_LIBRE_RAPPORT.md) · recette ciblée : [RECETTE_HUMAINE_MONTAGE_LIBRE_CORRECTIONS.md](RECETTE_HUMAINE_MONTAGE_LIBRE_CORRECTIONS.md).

> Critère du propriétaire : assembler plusieurs pièces, les déplacer ensemble et ajuster librement leur hauteur avec précision. Les deux captures d'écran mentionnées par le propriétaire n'ont pas été reçues ; l'analyse s'appuie sur sa description et sur sa construction réelle 31039 (lue sans modification).

## 1. Problème de hauteur : cause

Construction du propriétaire (31039, 12 pièces libres) : plaque blanche 3034 au sol, plaques orange 3023 et équerres vertes 99780 dessus (y = 25,41), et la « longue pièce grise » **30157** (plaque 2 × 2 à supports de roues larges) restée à y = 7,41, au-dessus de l'ensemble.

| Où | Ce que faisait le code | Effet |
|---|---|---|
| `free.ts` — `freePose()` (placement automatique) | La pièce repose sur la surface visée par son **point le plus bas** (`bottomExtent` : le sommet le plus bas de toute la géométrie). | Pour 30157, ce point est sous les supports de roues, qui dépassent sous la plaque : le corps reste toujours au-dessus de l'assemblage. Aucune position du pointeur ne peut l'en approcher davantage. |
| `BrickLabApp.tsx` — PageUp / PageDown | Le niveau « manuel » parcourait les **niveaux officiels du modèle** (`layers` = les y des cibles du fichier LDraw), même en montage libre. | Seules les hauteurs du modèle 31039 étaient accessibles, aucune ne correspondait. Pas de bouton visible, pas de pas de 1 LDU. |
| `surface.ts` — `resolveHover()` (aimant P5) | L'aimant du montage libre pouvait substituer la hauteur d'une cible du modèle. | Une hauteur choisie pouvait être remplacée par celle du modèle. |
| `BuildCanvas.tsx` | Rien de bloquant ; mais un clic sur une pièce posée la reprenait aussitôt, une par une. | Pas de moyen de déplacer plusieurs pièces ensemble. |

Les modes guidé et synchronisé ne sont pas concernés et restent inchangés (niveaux du modèle, validation par les cibles).

## 2. Hauteur libre

- **Monter / Descendre** (boutons visibles au-dessus de la vue 3D, utilisables au trackpad ; clavier PageUp / PageDown) : la hauteur passe en **manuel**, à partir de la hauteur montrée, par pas de **8 LDU** (plaque) ou **1 LDU** (bouton « 1 LDU », ou Maj + PageUp/PageDown). Aucune borne tirée des niveaux du modèle.
- **Aperçu fidèle** : la pièce montrée est à la hauteur choisie ; après un changement de hauteur elle monte ou descend sur place (sa position horizontale ne bouge pas tant que le pointeur ne bouge pas). Indication « bas à N LDU du sol ».
- **Hauteur conservée** pendant les mouvements horizontaux : la pièce suit le pointeur sur le plan horizontal de la hauteur choisie.
- **Aimant** : en hauteur manuelle, il ne se cale plus que sur une place du modèle **à cette hauteur** (à 0,5 LDU près) ; il ne change jamais la hauteur choisie.
- **« Hauteur auto »** (ou A) : retour au placement automatique sur la surface visée.
- La pose enregistrée est exactement la pose montrée (même format qu'avant, coordonnées à 0,01 LDU).

## 3. Sélection et groupes

| Geste | Effet (montage libre) |
|---|---|
| Clic sur une pièce posée | La sélectionne (surlignée). Un clic ailleurs, Échap ou « Désélectionner » vide la sélection. |
| Maj + clic | Ajoute / retire la pièce de la sélection (sans déplacer la caméra : un clic sans glisser n'est pas un geste de caméra). |
| « Déplacer la sélection » (M) | Une pièce : reprise comme avant. Plusieurs : **groupe** en main, montré à sa nouvelle position avant le clic. |
| R / « Tourner » | Quart de tour du groupe autour de son **pivot** : centre horizontal des pièces (sur la grille d'un demi-tenon), à hauteur du point le plus bas du groupe. |
| Monter / Descendre | Le groupe entier, mêmes pas que pour une pièce. |
| Clic | Le groupe est posé : **toutes les poses ou aucune** (`moveGroup` vérifie tout avant d'écrire : pose rigide, pièces existantes, pas de doublon). |
| Annuler / ⌘Z | Une seule action : toutes les pièces reprennent leurs poses précédentes. |
| Suppr / « Remettre dans le stock » | Toute la sélection (ou le groupe en main) revient au stock, en une action. |

Les positions et orientations relatives sont préservées exactement (même transformation rigide appliquée à chaque pièce ; quart de tour exact). Le stock ne change pas pendant un déplacement. Pas de déduction automatique des connexions, pas de physique.

## 4. Compatibilité des sauvegardes

- **Aucun changement de schéma** : une hauteur manuelle et un groupe déplacé sont de simples poses de pièces libres, déjà représentées par le format v3 (12 nombres d'une ligne LDraw par pièce). Le format v2 reste écrit à l'identique sans pièce libre.
- **Identifiants stables** : une pièce libre déplacée (seule ou en groupe) garde son identifiant (`f1`, `f2`…). Seule une pièce « ancrée » d'une ancienne partie, déplacée, devient une pièce libre avec un nouvel identifiant (elle n'en avait pas).
- **Atomicité** : un déplacement de groupe produit une seule nouvelle partie, enregistrée en une seule écriture ; une pose invalide ou une pièce absente fait échouer tout le déplacement, rien n'est écrit (tests unitaires « all or nothing »).
- **Anciennes sauvegardes** (P5–P8, et les v3 de la première version de ce lot, dont ta construction 31039) : relues sans changement.

## 5. Tests

- **Unitaires** (`free-building.test.ts`, +11 ; `library-store.test.ts`, +1) : pas de 8 et 1 LDU ; hauteur manuelle hors niveaux du modèle conservée en suivant le pointeur ; pièce descendue sous la hauteur automatique ; montée/descente verticale sur place ; aimant jamais prioritaire sur la hauteur choisie ; pivot ; trois pièces déplacées (identifiants, stock, une action) ; groupe tourné (distances et orientations relatives) ; tout ou rien ; pièce ancienne dans un groupe ; groupe enregistré puis relu ; groupe relu par un **nouveau magasin** (redémarrage du serveur).
- **E2E** `free-height-group.spec.ts` (5, fixtures originales) : 30157 descendue sur un assemblage plaque blanche + plaque orange, là où le placement automatique ne peut pas aller, 8 puis 1 LDU, hauteur conservée en déplaçant, clavier, retour en auto, pose = aperçu, rechargement ; pièces longues (3460), à axe latéral (2780), petites (3024), Technic à trous (3700), équerre (99780) ; trois briques sélectionnées (clic, Maj + clic, caméra immobile), déplacées, tournées, montées, stock et identifiants inchangés, une annulation, rechargement ; mode guidé inchangé (pas de barre, niveaux du modèle, pièce non sélectionnable) ; **WebKit**.
- **Adaptés** : `free-building.spec.ts` (le clic sélectionne, M reprend) ; `surface-placement.spec.ts`, test des niveaux manuels déplacé en mode guidé (où ils s'appliquent toujours) ; joueur scripté P5 (secours en hauteur libre en montage libre).
- **Recette réelle** (§ 6).
- **Régression trouvée par la suite complète et corrigée** : en ajoutant la sélection, les pièces « fantômes » ne réagissaient plus au clic, y compris dans l'**éditeur de correspondances** (où un clic sur une pièce non affectée l'ajoute à l'étape). `instructions-sync.spec.ts` (P6, inchangé) l'a détecté ; correction : les fantômes restent ignorés seulement pour la sélection du montage libre.

## 6. Recette réelle 31009 et 31039 (dossier isolé, serveur redémarré entre les deux parties)

| | 31009 | 31039 |
|---|---|---|
| Hauteur manuelle sur une pièce longue | 3460 (plaque 1 × 8) : auto y = −24, posée à −19 (5 LDU plus bas) | 32018 (brique Technic 1 × 14) : auto y = 1,81, posée à 6,81 |
| Groupe de 3 (clic, Maj + clic), déplacé, tourné, monté d'une plaque | distances conservées, stock identique, identifiants f1/f4/f5 conservés | idem |
| Une annulation | les 3 poses d'origine restaurées | idem |
| Vue 3D en tournant la caméra | 60 i/s, pire image 17 ms | 60 i/s, pire image 17 ms |
| Après redémarrage du serveur | 11/270, mêmes poses (empreinte identique) | 11/609, mêmes poses |

Captures (sets réels, hors dépôt) : `~/Documents/brick-lab-data/proofs/libre/libre-*-hauteur-manuelle.png`, `libre-*-groupe-selection.png`, `libre-*-groupe-en-main.png`, `libre-*-groupe-pose.png`. Captures sur fixtures originales (dans le dépôt) : [hauteur manuelle en main](preuves/libre/hauteur-manuelle-en-main.png) · [posée, après rechargement](preuves/libre/hauteur-manuelle-posee-apres-rechargement.png) · [sélection](preuves/libre/groupe-selection.png) · [groupe en main, tourné et monté](preuves/libre/groupe-en-main-tourne-monte.png) · [groupe posé](preuves/libre/groupe-pose.png).

## 7. Sortie de la validation (code final, 06/11/2026)

```
check:spec   15 OK, 2 DÉCLARÉ (écarts antérieurs inchangés), 0 écart nouveau
typecheck    tsc --noEmit : 0 erreur
vitest       Test Files 14 passed (14) — Tests 271 passed (271)   [259 + 12]
playwright   passage 1 : 68 passed (18.7m), 0 ignoré, 0 échec
             passage 2 : 68 passed (17.0m), 0 ignoré, 0 échec     [63 + 5 free-height-group, dont WebKit]
recette réelle libre-reel.spec.ts (31009 + 31039) : partie 1 1/1, redémarrage du serveur, partie 2 1/1
npm run build   OK (production, 0 avertissement)
```

Une première exécution complète (avant la correction de l'éditeur, § 5) : 67/68, l'échec étant la régression décrite.

## 8. Limites

- Pas de physique : collisions possibles (c'est voulu pour pouvoir « descendre » une pièce à travers des supports).
- Rotation de groupe par quarts de tour autour de l'axe vertical ; pas d'orientation O pour un groupe.
- Après un changement de hauteur, la pièce suit à nouveau le pointeur dès qu'il bouge (sur le plan de la hauteur choisie) : viser la pièce montrée pour la poser là.
- L'historique d'annulation vit dans la page ; après rechargement, « Annuler » retire la dernière pièce posée.

# Véritable montage libre — architecture

**Date :** 06/11/2026. Branche `feat/true-free-building`, worktree `brick-build-worktrees/true-free-building`, base `origin/main` = `5272811626789264cc10e7d759944e832bb1ff6b` (lot UX fusionné).
**Décision du propriétaire (06/11/2026) :** « en mode libre, je dois pouvoir choisir une brique et la poser où je veux, même si ce n'est pas sa place dans le modèle LEGO officiel ». Écart volontaire à la spécification v1.0, qui reste immuable (voir [LIMITATION_MONTAGE_LIBRE.md](LIMITATION_MONTAGE_LIBRE.md)). Pas de physique d'emboîtement ; pas de P9.

## 1. Point de départ (étude de l'existant)

| Élément | Aujourd'hui | Conséquence |
|---|---|---|
| `engine.ts` — `tryPlace()` | Une pose n'est acceptée qu'à ≤ 10 LDU et ≤ 10° de la `targetMatrix` d'une occurrence encore libre (étape active en guidé / synchronisé, toutes en `freeManual`). | Le « montage libre » ne libère que l'**ordre**. |
| `engine.ts` — `BuildSession` | `{ mode, placed: occurrenceId[] }`. Une pièce posée **est** une occurrence : sa position est déduite de la `targetMatrix`. | Impossible de représenter une pièce ailleurs qu'à sa cible. |
| `surface.ts` — `resolveHover()` | Hauteur tirée de la surface visée, puis recherche d'une cible compatible (fantôme, couche de la cible, rayon) ; l'aperçu « saute » sur la cible si la pose est acceptable. | Bonne aide de pose, à garder comme **aimant facultatif**, plus comme règle. |
| `BuildCanvas.tsx` | Dessine les occurrences (solide / fantôme / sélection) à leur `targetMatrix` ; clic = poser la pièce tenue ; sans pièce tenue, clic utile seulement dans l'éditeur de correspondances. | Il faut dessiner des pièces à une pose quelconque et pouvoir en reprendre une. |
| `progress.ts` (schéma v2, P6) | `placedOccurrenceIds` + mode + page/livret + empreinte des correspondances. Validé côté client **et** serveur (`restoreProgress`), refusé s'il ne correspond pas au modèle. | Le format doit s'étendre sans casser les sauvegardes v1/v2 (P5–P8). |
| Bibliothèque (P7) | `putProgress` valide avec `restoreProgress`, historique des versions remplacées, conflits par révision ; `game()` (build-store) décide si un conflit ne porte que sur la vue (page) ou sur la partie. | Les pièces libres font partie de la **partie** : elles doivent entrer dans `game()`, sinon un conflit les écraserait. |
| Comparaison navigateur ↔ bibliothèque (P7) | `save-compare.ts` compare mode, pièces, page, livret, correspondances. | Ajouter la différence « pièces libres ». |
| Statut de la collection | `buildStatus(placed, total)` : `DONE` dès que `placed ≥ total`. | Un stock épuisé en montage libre ne veut pas dire « modèle terminé ». |
| Changement de mode | `switchMode()` garde les pièces posées ; repli synchronisé → libre si les correspondances deviennent invalides. | Libre → guidé/synchronisé doit être **explicite** si des pièces ne sont pas à une place du modèle. |

## 2. Principe : séparer la cible du modèle et la pose du joueur

Deux notions distinctes, qui ne sont plus confondues :

- **Cible** (`BrickOccurrence.targetMatrix`) : où la pièce est dans le modèle LDraw. **Inchangée.** Seule référence des modes guidé et synchronisé.
- **Pose du joueur** : où le joueur a réellement posé une pièce. Enregistrée telle quelle, jamais déduite.

Une partie contient donc deux sortes de pièces posées :

```ts
interface BuildSession {
  mode: BuildMode;
  /** Pièces « ancrées » : posées sur une cible du modèle (modes guidé / synchronisé, anciennes parties). */
  placed: readonly string[];          // occurrenceId, ordre de pose — inchangé
  /** Pièces libres : posées par le joueur en montage libre, à leur pose réelle. */
  free?: readonly FreePiece[];        // absent ou vide hors montage libre
}
interface FreePiece {
  id: string;            // 'f1', 'f2'… unique dans la partie
  partKey: string;       // référence + couleur prises dans le stock du set
  colorCode: string;
  pose: Matrix4Tuple;    // pose LDraw globale réellement choisie (rotation + translation)
}
```

- **Stock** d'un couple référence/couleur = nombre d'occurrences du modèle − pièces ancrées − pièces libres de ce couple. Jamais négatif : une pose sans stock est refusée (`NO_STOCK`). Les quantités et couleurs sont donc exactement celles du set.
- **Modes guidé et synchronisé** : `free` toujours vide ; `tryPlace`, `resolveHover`, les étapes et les messages sont **inchangés**.
- **Montage libre** (`freeManual`, même valeur enregistrée qu'avant) : toute nouvelle pose crée une `FreePiece` à la pose montrée, **sans comparaison obligatoire** avec une `targetMatrix`.
- **Correspondance avec le modèle** (`matchToModel`) : calculée à la demande, jamais enregistrée. Chaque pièce libre est rapprochée, au plus une fois, d'une occurrence non ancrée de même référence/couleur dont elle est à ≤ 10 LDU / 10° (symétries comprises, même règle que `tryPlace`), la plus proche d'abord. Sert à l'information (« à sa place dans le modèle »), aux messages de fin et au passage vers un mode guidé.

## 3. Placement libre, aimantation, reprise d'une pièce

| Action | Comportement |
|---|---|
| Prendre une pièce | Dans la barre (stock > 0). Orientation : choix du modèle (O), quarts de tour (R) — contrôles existants. |
| Déplacer à la souris | Le pointeur donne la pose (rayon + surface visée), comme aujourd'hui. |
| Aimant « emplacement du modèle » | Si la pose visée est à **≤ 9,5 LDU** et ≤ 10° d'une cible libre du même couple (la pose libre elle-même, puis l'algorithme P5 `resolveHover` : couches, cible visée en l'air, fantôme ; cibles déjà occupées exclues), la pièce se cale sur cette cible et l'interface l'indique (« à sa place dans le modèle »). 9,5 LDU < pas de grille (10) : une position décalée d'un demi-tenon reste toujours possible. Valeur fixée par la suite P5 : un rayon qui frôle un tenon place le pointeur à 7 LDU de la cible (6 LDU, première valeur, ratait ce cas). Désactivable (case « Aimant modèle »). |
| Aimant « grille » (sinon) | Hauteur : la pièce repose sur la surface visée ; les tenons ne comptent pas (une pièce visée sur le dessus ou sur un tenon se pose sur le dessus de son corps, à l'endroit où le rayon du pointeur traverse ce dessus) ; ailleurs, niveaux par plaque (8 LDU) au-dessus du sol du modèle. Position horizontale : pas de demi-tenon (10 LDU), aligné sur la pièce visée (« connexion simple ») ou sur l'origine au sol. Désactivé (G ou case « Grille ») : 1 LDU, hauteur exacte de la surface. |
| Poser | Clic : la pièce est enregistrée à la pose montrée. Aucun refus pour « trop loin » en montage libre. |
| Reprendre une pièce posée | Clic sur une pièce posée (sans pièce en main) : elle est prise en main avec sa rotation. Clic : reposée ailleurs (nouvelle pose). Échap : elle reste où elle était. **Suppr / ⌫** ou bouton : retirée, retour au stock. |
| Tourner une pièce posée | La reprendre, R / O, la reposer. |
| Annuler | ⌘Z / bouton : annule la dernière action (pose, déplacement, retrait) pendant la session ; après un rechargement, retire la dernière pièce posée. |
| Notice PDF | Inchangée : consultable librement, page enregistrée. |

Pas de physique : pas de détection de collision, ni de vérification que les tenons s'emboîtent ; deux pièces peuvent s'interpénétrer. Limites connues : une pièce visée sur une face latérale se pose au niveau de plaque sous le point visé ; l'empilement suppose la convention LDraw « origine au sommet du corps » (briques, plaques, tuiles) — les pièces qui ne la suivent pas (axes, connecteurs Technic, pièces renversées) s'empilent approximativement.

## 4. Sauvegarde et compatibilité

**Schéma v3** (seulement quand la partie contient des pièces libres) :

```json
{ "schemaVersion": 3, "buildMode": "freeManual", "placedOccurrenceIds": ["…#3"],
  "freePieces": [{ "id": "f1", "partKey": "3001.dat", "colorCode": "4",
                   "pose": [x, y, z, a, b, c, d, e, f, g, h, i] }], "…": "champs v2 inchangés" }
```

- `pose` : les 12 nombres d'une ligne LDraw de type 1 (translation arrondie à 0,01 LDU, rotation à 10⁻⁶). ≈ 80 octets par pièce : 609 pièces ≈ 50 Ko (limites : 512 Ko navigateur, 1 Mo serveur).
- **Sans pièce libre, l'écriture reste en v2, octet pour octet** : guidé, synchronisé et anciennes parties libres ne changent pas de format (retour arrière possible sur `main`).
- **Lecture** : v1, v2 et v3. Une ancienne partie libre (v1/v2, identifiants seulement) est restaurée avec ses pièces **ancrées à leurs positions historiques** (les cibles où elles ont été posées) ; aucune position libre n'est inventée. Elles deviennent libres seulement si le joueur les reprend.
- **Validation** (client et serveur, données non fiables) : `freePieces` seulement en `freeManual` et en v3 ; tableau borné au nombre d'occurrences ; identifiants uniques (`f` + entier) ; couple référence/couleur présent dans le modèle ; stock jamais dépassé (ancrées + libres ≤ quantité) ; 12 nombres finis, translation bornée (|t| ≤ 100 000 LDU), rotation orthonormée de déterminant +1 (tolérance 10⁻³). Sinon `MALFORMED` : la sauvegarde est conservée telle quelle, jamais réécrite (règle P7).
- **Bibliothèque** : la signature de partie (`game()`) inclut les pièces libres (un conflit sur elles n'est jamais résolu en silence) ; la comparaison navigateur ↔ bibliothèque ajoute la différence « pièces libres » ; le résumé serveur compte ancrées + libres et le nombre de pièces à leur place du modèle.
- Aucune migration : rien n'est réécrit à l'ouverture.

## 5. Changements de mode

| De → vers | Règle |
|---|---|
| guidé / synchronisé → libre | Pièces ancrées gardées, aucune pièce libre créée. |
| libre → guidé / synchronisé, toutes les pièces libres à une place du modèle | Converties en pièces ancrées sur les occurrences correspondantes ; message « N pièces reconnues à leur place ». |
| libre → guidé / synchronisé, certaines hors modèle | **Confirmation explicite** : « K pièces posées hors du modèle officiel seront remises dans le stock (M reconnues gardées) » — « Retirer et passer en mode … » / « Rester en montage libre ». Rien n'est retiré sans ce clic. |
| synchronisé sans correspondances valides → libre (P6) | Inchangé. |

## 6. Fin de partie

- Guidé / synchronisé : inchangé (« Modèle terminé » quand toutes les occurrences sont posées sur leur cible).
- Montage libre, stock épuisé : « Toutes les pièces du set sont posées (N). Montage libre : ta construction n'est pas comparée au modèle officiel — K pièce(s) à leur place dans le modèle. » Le message « modèle reconstruit » n'apparaît que si toutes les pièces sont à leur place (ancrées ou reconnues).
- Collection : statut « Terminé » seulement si toutes les pièces sont à leur place du modèle ; un stock épuisé en montage libre reste « En cours » avec la mention « toutes les pièces posées (montage libre) ».

## 7. Fichiers touchés

| Fichier | Changement |
|---|---|
| `src/domain/build/free.ts` (nouveau) | Stock, pose / déplacement / retrait d'une pièce libre, correspondance avec le modèle, passage vers un mode guidé, aimant grille. Fonctions pures. |
| `src/domain/build/engine.ts` | `BuildSession.free` facultatif ; `tray()` tient compte des pièces libres. `tryPlace`, `resolveHover` et règles guidées inchangés. |
| `src/domain/build/progress.ts` | Schéma v3 (écrit seulement avec des pièces libres), lecture v1–v3, validation. |
| `src/domain/library/save-compare.ts`, `src/infra/persistence/build-store.ts`, `local-progress.ts` | Pièces libres dans la comparaison, la signature de partie et le compte des sessions récentes. |
| `src/server/library/store.ts`, `prepare.ts`, `src/domain/library/types.ts` | Comptes et statut (ancrées + libres, « à leur place »). |
| `src/components/three/BuildCanvas.tsx` | Pièces libres dessinées à leur pose, reprise au clic, normale de la face visée. |
| `src/components/BrickLabApp.tsx` | Branches du montage libre : aperçu, pose, reprise, retrait, annulation, confirmation de changement de mode, messages de fin. |

## 8. Validation prévue

Unitaires (stock, pose éloignée acceptée en libre et refusée en guidé, déplacement, rotation, retrait, quantités/couleurs, identiques, correspondance, passage de mode, schéma v1/v2/v3 et refus des données invalides, statut) ; E2E sur fixtures (souris, reprise, annulation, rechargement, bibliothèque et redémarrage du serveur, anciennes sauvegardes, mode synchronisé inchangé, WebKit) ; réels 31009 et 31039 (pose libre, fluidité). Les suites P5–P8 existantes sont rejouées ; les seuls tests modifiés seront ceux qui vérifiaient l'ancienne règle « refus loin d'une cible en montage libre », remplacés par la nouvelle règle **et** par la même vérification en mode guidé.

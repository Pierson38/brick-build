# P6 — Notices LEGO et construction 3D synchronisée : architecture et risques

**Date :** 04/11/2026. Branche `feat/p6-instructions-sync`, base `origin/main` = `5e03680`.

> Les notices et les modèles OMR restent hors dépôt (`~/Documents/brick-lab-data/`). Ce document ne contient que des **comptages structurels** (pages, numéros d'étapes, nombre de pièces), sans image ni extrait de notice.

## 1. Étude technique (phase A) : ce que contiennent vraiment les fichiers

### 1.1 Mesures

Méthode : couche texte des PDF (`pdftotext -layout`, page par page), rendu basse définition de quelques pages pour vérification visuelle, analyse du MPD par le parser du dépôt (`analyzeModel`).

| Mesure | 31040 Desert Racers | 31009 Small Cottage |
|---|---|---|
| Livrets | 1 PDF (6145903), 32 p. | 3 PDF (6038244 : 84 p., 6038252 : 64 p., 6038254 : 64 p.) |
| Modèles dans la notice | **3 modèles dans le même livret** : modèle 1 p. 2–12 (étapes 1–21), modèle 2 p. 13–22 (1–19), modèle 3 p. 23–30 (1–11) ; inventaire p. 31 | **1 livret par modèle alternatif** (vérifié sur les couvertures) ; le MPD correspond au livret 1 |
| Étapes par page | 2 en général (p. 2–11), 1 en p. 12 | 1 à 2 ; pages sans étape (vues d'ensemble) |
| Encadrés de sous-assemblage | Sous-étapes « 1, 2 » dans un encadré, rattachées à l'étape principale (p. 5 → étape 7 ; p. 8 → étape 14 avec « 2x » ; p. 10 → étape 17) | Nombreux encadrés « 1, 2, 3 » |
| Multiplicateurs | « 2x » (sous-assemblage à faire deux fois), « 4x » (roues, étape 21) | « 2x », « 3x », « 4x » |
| Numérotation | Recommence à 1 pour chaque modèle du livret | Livret 1 : étapes 1–36, puis **une séquence 1–25 insérée** (p. 46–68), puis 37–46. **Un numéro imprimé n'est pas unique dans un livret.** |
| Étapes du MPD | 11 `ROOT_STEPS`, 65 occurrences, aucun sous-modèle | 77 `FLATTENED_STEPS`, 270 occurrences, 12 sous-modèles |

### 1.2 Conséquences

1. **Étape LDraw ≠ étape de notice ≠ page PDF.** 31040 : 11 étapes LDraw, 21 étapes officielles, 11 pages. La correspondance est **n-n** et ne peut être déduite d'aucun index.
2. **Clé d'une étape de notice** = (livret, page PDF, numéro imprimé, encadré éventuel), et surtout sa **position dans la séquence**. Le numéro seul est ambigu (modèles successifs, séquences insérées).
3. **Page imprimée vs page PDF** : on enregistre l'index de page **du fichier PDF**, celui qu'affiche le lecteur. Sur 31040, ils coïncident, mais rien ne le garantit.
4. **Encadrés** : en 3D, toutes les pièces sont posées à leur position finale, donc le sous-assemblage est construit en place. L'utilisateur choisit sa granularité : soit une étape « 7 · encadré 1 », « 7 · encadré 2 », puis « 7 », soit tout regroupé dans « 7 ». Le schéma accepte les deux.
5. **« 2x » / « 4x »** : dans le MPD, chaque copie a ses propres occurrences. Une étape « 4x » regroupe donc 4 × k occurrences. Le multiplicateur est enregistré à titre informatif et contrôlé (avertissement si le nombre d'occurrences n'est pas un multiple).
6. **Modèles alternatifs (3-en-1)** : un mapping relie **un** MPD (son empreinte, son modèle principal) à **une plage** d'étapes de la notice. Pour 31040, seules les p. 2–12 concernent le MPD. Les autres modèles du livret ne sont pas référencés.
7. **Plusieurs livrets** : un mapping référence une **liste ordonnée** de livrets. Chaque étape désigne son livret. La progression reste une séquence unique.
8. **Sous-modèles et sous-assemblages LDraw** (31009) : le mapping travaille au niveau des **occurrences de pièces finales** (`occurrenceId`), indépendamment des sous-modèles LDraw. Le découpage LDraw sert seulement d'aide de saisie.
9. **Fidélité d'inventaire** : une pièce de la notice absente du MPD (31009 : 5 éléments) ne peut pas être posée. C'est un écart documenté par une note sur l'étape, jamais inventé.

## 2. Modèle de correspondance (phase B)

### 2.1 Schéma `brick-lab-instruction-mapping` v1 (JSON local, exportable)

```ts
interface InstructionMappingV1 {
  format: 'brick-lab-instruction-mapping';
  schemaVersion: 1;
  model: { sha256: string; fileName: string; rootName: string; occurrenceCount: number };
  booklets: { id: string; label: string; fileName: string; sha256: string | null; pageCount: number | null }[];
  steps: {
    id: string;                  // unique, stable ("s1", "s2"…)
    bookletId: string;
    page: number;                // index de page DANS LE FICHIER PDF (1-based)
    printedStep: string;         // numéro tel qu'imprimé ("7")
    callout?: string;            // sous-étape d'encadré ("1", "2")
    repeat?: number;             // multiplicateur imprimé ("2x" → 2)
    occurrenceIds: string[];     // occurrences du MPD posées à cette étape
    provenance: 'manual' | 'verified';  // verified = contrôlée visuellement contre la page
    note?: string;
  }[];
  provenance: { method: 'manual'; tool: string; createdAtIso: string; updatedAtIso: string };
}
```

- **Empreinte du modèle** : SHA-256 des octets exacts du MPD, plus `rootName`, car les `occurrenceId` en dépendent, et le nombre d'occurrences.
- **Identité de la notice** : SHA-256 des octets exacts de chaque PDF et son nombre de pages. **Aucun contenu de PDF** n'est stocké : ni texte, ni image.
- **Provenance** : P6 ne propose que la saisie manuelle. `verified` signifie que l'utilisateur a coché « vérifiée contre la page » pour cette étape. Aucune méthode automatique n'existe dans ce lot.
- **Avertissements** : ils ne sont **jamais lus depuis le fichier**, mais recalculés par `validateMapping` à chaque chargement.

### 2.2 Validation (bloquante pour activer le mode synchronisé)

| Code | Gravité | Règle |
|---|---|---|
| `MODEL_MISMATCH` | erreur | empreinte, modèle principal ou nombre d'occurrences différents du MPD importé |
| `UNKNOWN_OCCURRENCE` | erreur | id absent du modèle |
| `DUPLICATE_OCCURRENCE` | erreur | occurrence assignée deux fois (même étape ou deux étapes) |
| `UNASSIGNED_OCCURRENCE` | erreur | couverture incomplète : chaque occurrence doit être assignée **exactement une fois** |
| `UNKNOWN_BOOKLET`, `BOOKLET_UNBOUND` | erreur | étape vers un livret inconnu ; livret sans empreinte PDF |
| `PAGE_OUT_OF_RANGE` | erreur | page hors du livret |
| `NO_STEPS`, `DUPLICATE_STEP_ID` | erreur | — |
| `EMPTY_STEP` | avertissement | étape sans pièce : ignorée en jeu |
| `PAGE_ORDER` | avertissement | la séquence revient en arrière (livret ou page) |
| `DUPLICATE_LABEL` | avertissement | même (livret, page, numéro, encadré) deux fois |
| `REPEAT_MISMATCH` | avertissement | `repeat` > 1 et nombre d'occurrences non multiple |
| `NOT_VERIFIED` | info | étapes non contrôlées visuellement |

Un brouillon incomplet peut être **sauvegardé et exporté**, mais pas **activé**.

### 2.3 Du mapping au jeu

`mappingToStepPlan` produit un `StepPlan` de type `INSTRUCTION_STEPS` (provenance `USER_EDITED`). Chaque étape y porte sa référence de notice (livret, page, numéro). Les étapes vides sont retirées. Le moteur existant est réutilisé **sans modification de ses règles de pose** : un nouveau mode `synced` se comporte comme `guided` (candidats = étape active), avec ce plan.

- **Étape active** = première étape non terminée, **dérivée** de l'ensemble des pièces posées. Elle n'est jamais stockée, donc ne peut pas être corrompue.
- **Avance automatique** : quand la dernière pièce de l'étape est posée, l'étape suivante devient active et la notice saute à sa page.
- **Retour en arrière** : (a) *consulter* une étape passée (page et pièces surlignées, sans rien retirer) ; (b) *reprendre depuis l'étape k* retire explicitement les pièces des étapes ≥ k ; (c) *Annuler* retire la dernière pièce.
- **Changement de mode** en cours de partie : les pièces posées sont conservées et l'étape active est recalculée.

### 2.4 Persistance (locale uniquement)

| Donnée | Clé `localStorage` | Contenu |
|---|---|---|
| Progression | `brick-lab:progress:<sha MPD>` (schéma v2, lit encore la v1 de P5) | mode (`guided`/`freeManual`/`synced`), pièces posées, page, livret actif, empreinte du mapping utilisé |
| Mapping | `brick-lab:mapping:<sha MPD>` | le JSON ci-dessus (ids et numéros, aucun contenu tiers) |
| PDF | — | **jamais stocké** : réimport demandé, empreinte vérifiée |

Export : `<modèle>.brick-mapping.json` téléchargé localement. Réimport : validation stricte du fichier (taille ≤ 1 Mo, types, longueurs, bornes) **puis** confrontation au MPD importé.

## 3. Risques de correspondance

| # | Risque | Probabilité | Parade dans P6 |
|---|---|---|---|
| R1 | Supposer étape LDraw = étape notice | élevée (prouvé faux) | Aucun mapping implicite : sans mapping valide, le mode synchronisé n'est pas proposé |
| R2 | Numéro imprimé ambigu (séquences insérées, modèles successifs) | élevée (31009, 31040) | Étape identifiée par sa position et son id, numéro = libellé ; avertissement `DUPLICATE_LABEL` |
| R3 | Notice d'une autre édition (langue, réimpression) : pages décalées | moyenne | Empreinte SHA-256 stricte du PDF : refus explicite, aucune page « approximative » |
| R4 | MPD modifié ou autre modèle principal : ids différents | moyenne | Empreinte, `rootName` et nombre d'occurrences contrôlés ; ids inconnus = erreur |
| R5 | Pièces de la notice absentes du MPD (31009) | réelle | Note par étape ; l'inventaire reste « indéterminé » (P5) |
| R6 | Occurrences oubliées ou en double | élevée en saisie manuelle | Validation bloquante, liste des pièces non affectées et des doublons dans l'éditeur |
| R7 | Ordre physiquement impossible (pièce posée avant son support) | faible | Non vérifié automatiquement (limite) ; le moteur de surface permet déjà la pose « en l'air » sur la cible |
| R8 | Sous-assemblage « 2x » mal découpé | moyenne | Avertissement `REPEAT_MISMATCH` |
| R9 | Coût de saisie (270 pièces pour 31009) | élevée | Aides : affecter au clic en 3D, affecter un groupe pièce/couleur, importer toute une étape LDraw ; reconnaissance PDF exclue de P6 |
| R10 | Diffusion de données tierces | faible | Le mapping ne contient que des ids, des numéros et des empreintes ; mappings réels conservés hors dépôt |

## 4. Composants

```
src/domain/instructions/mapping.ts      schéma, parse (entrée non fiable), validation, plan, édition pure
src/domain/build/engine.ts              + mode 'synced', rewindToStep
src/domain/build/progress.ts            schéma v2 (lit v1)
src/infra/persistence/local-mapping.ts  stockage local du mapping
src/components/pdf/                     livrets multiples, empreinte, page pilotée
src/components/mapping/MappingEditor    éditeur (navigation, affectation, doublons, export/import, validation)
src/components/BrickLabApp.tsx          3e mode, panneau d'étape synchronisée
```

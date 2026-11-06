# Limitation connue — le « montage libre » n'est libre que dans l'ordre

**Signalée par :** le propriétaire, pendant la recette humaine du lot UX (06/11/2026).
**Statut :** limitation du moteur **antérieure** au lot UX, **non bloquante** pour la PR #6. Chantier dédié décidé par le propriétaire : branche `feat/true-free-building`.

## Constat

En mode « Montage libre (avec notice) » (`freeManual`), une pièce prise dans le stock ne peut être posée qu'**à l'emplacement d'une occurrence du modèle LDraw** encore libre, de même référence et de même couleur. Posée ailleurs, elle est refusée (« Trop loin de l'emplacement le plus proche », « mauvaise orientation »).

Ce comportement ne correspond pas à la définition du montage libre du propriétaire : choisir une brique et la poser **où il veut**, même si ce n'est pas sa place dans le modèle LEGO officiel.

## Origine

| Élément | Détail |
|---|---|
| Règle | `tryPlace()` (`src/domain/build/engine.ts`) : en `freeManual`, les candidats sont toutes les occurrences non posées (au lieu de l'étape active) ; la pose est acceptée seulement à moins de 10 LDU et 10° de la `targetMatrix` de l'une d'elles, sinon refusée. |
| Aide au pointeur | `resolveHover()` (`surface.ts`) aimante la pièce sur les cibles du modèle (fantôme, couche de la cible, rayon). |
| Sauvegarde | La progression ne contient que des identifiants d'occurrences (`placedOccurrenceIds`) : une pièce posée est **par construction** à la position de son occurrence. Aucune position libre n'est enregistrable. |
| Introduite | Moteur du lot P0–P4 (`738db13`, 03/11/2026), inchangée depuis sur ce point (P5–P8). |
| Spécification v1.0 | Comportement conforme à la spécification initiale, qui définit le montage libre comme un **ordre** libre et une **position finale** imposée : `01_PRODUIT_ET_PERIMETRE.md` (« Pas de validation de l'ordre officiel, uniquement de l'emplacement final »), `03_LDRAW_ET_ETAPES.md` (« placement sur la cible finale restante correspondante »), `04_UX_ET_PARCOURS.md`, `08_SCHEMA_DONNEES.md` § 5, `06_TESTS_ET_ACCEPTATION.md`. |
| Lot UX | Aucun fichier de `src/domain/build/` ni de la persistance modifié (`git diff 727ba1c..a645b9d -- src/domain src/server` : seul `src/domain/ui/panel-layout.ts`, nouveau). La limitation n'est ni causée ni aggravée par la PR #6. |

## Conséquence

Le véritable montage libre change la **règle** et le **format des sauvegardes** : il faut distinguer la position cible du modèle (`targetMatrix`, inchangée, utilisée par les modes guidé et synchronisé) de la position réellement choisie par le joueur, et l'enregistrer. C'est un écart volontaire à la spécification v1.0 (qui reste immuable), approuvé par le propriétaire le 06/11/2026 ; il sera traité et documenté dans son propre lot (architecture, compatibilité des sauvegardes P5–P8, recette), sans modifier les modes guidé et synchronisé.

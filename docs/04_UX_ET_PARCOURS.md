# 04 — User flows and interface

## Screen A — Home / Import

- Neutral application brand: **Brick Lab Local**; no false official LEGO affiliation.
- Button "Importer un modèle (.mpd/.ldr)" (Import a model); the user keeps their files.
- Secondary button "Importer une notice PDF" (Import a PDF instruction booklet).
- Local list of recently opened sessions (metadata + progress, no pre-bundled third-party files).
- External link "Trouver une notice sur LEGO.com" (Find instructions on LEGO.com); opens the site in the browser, no automatic download by the app.
- Display status information and limits after import.

## Screen B — Model preview

```
┌─────────────────────────────────────────────────────────────────────┐
│ Brick Lab Local   Set importé : [nom]          [Mode guidé / Notice] │
├───────────────────────────────────────────────┬─────────────────────┤
│                                               │ Modèle               │
│                  Vue 3D                       │ 83 pièces            │
│                                               │ 16 étapes détectées  │
│   rotate / zoom / center                      │ 1 pièce manquante !  │
│                                               │ [Commencer]          │
└───────────────────────────────────────────────┴─────────────────────┘
```

- If there are no steps but the geometry is complete, the button shows "Montage libre (avec notice)" (Free building, with instructions). If rendering is incomplete, display "Visualiser" (View) and the missing parts; do not mislead the user.

## Screen C — Building

```
┌─────────────────────────────────────────────────────────────────────┐
│ ← Modèles       Modèle actuel     Étape 3 / 16       [Sauvegardé]    │
├───────────────────────────────────────┬─────────────────────────────┤
│                                       │ Notice (optionnelle)        │
│        Scène 3D interactive           │ PDF p. 4 / 42               │
│                                       │ [◀]  [Zoom] [▶]            │
│  déjà construites : couleurs pleines  │                            │
│  cible : ghost + silhouette           │ PDF rendu localement       │
│  pièce tenue : suit le curseur        │                            │
├───────────────────────────────────────┴─────────────────────────────┤
│ Pièces à placer [rouge 2×4] [bleu 2×4]  [Annuler] [Centrer] [Aide]│
└─────────────────────────────────────────────────────────────────────┘
```

- A split mode with a resizable handle is nice but not necessary for the first batch.
- Keyboard navigation and accessible labels; do not make gameplay inaccessible without drag: add a "Poser à la position cible" (Place at target position) button for debugging / accessibility, explicit in the UI.
- When a part is correctly placed, it becomes fixed and moves to the validated state; on error, a message and a reversible rollback.
- **Free building**: if the model has no `STEP`, do not disable the game. The user follows the PDF their own way; for a chosen part, the application considers all final positions not yet occupied with the same reference/color. If several targets match, resolve by proximity and prevent any ambiguous validation.
- Display `N/M pièces posées` (N/M parts placed), **not only** "step x/y".

## Mandatory UI states

- File loading/reading.
- Invalid model.
- Analyzable model but missing geometry.
- Displayable model without steps.
- Playable model with steps.
- PDF mode without a 3D model (instructions only) — a useful possibility but not mandatory for the MVP.
- Progress restored after reimporting the same file.
- Finished session with the possibility to start over.

## PDF behavior

- The PDF is loaded via the local File API picker; it does not go over the network.
- Do not display a "LEGO step x" text if only "PDF page y" is known.
- Minimal saving: page index; PDF bytes are not kept without an explicit choice.
- For an encrypted, damaged, or too large PDF: display a usable error.

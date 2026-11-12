# Screenshots after the redesign

Phase 5 code (base `044e815` + keyboard and tooltip fixes), Chromium (Playwright 1.64.1), 1280 × 800 unless noted, light theme unless noted, `next dev` on a temporary data folder. Same fixtures as the [before](../avant/README.md) screenshots (original, CC0, generated PDF): no third-party content. Files 01 to 30 compare one-to-one with `REFONTE/avant/`; 31 to 40 show the states added by the redesign.

In the full-page screenshot 05 ("Ajouter un set" (Add a set)), the sticky action bar appears at the level where the bottom of the window was: an artifact of full-page capture; on screen, it stays at the bottom of the window.

To reproduce (`next dev` server on 3300 with `BRICK_LAB_DATA_DIR=<empty folder>`, then the same folder with `LDRAW_LIBRARY_DIR=` and `BRICK_LAB_ONLINE=0`, then the normal server again):

```bash
npx tsx REFONTE/scripts/captures.ts http://127.0.0.1:3300 REFONTE/apres <dossier>
npx tsx REFONTE/scripts/captures.ts http://127.0.0.1:3300 REFONTE/apres <dossier> --degraded
npx tsx REFONTE/scripts/captures.ts http://127.0.0.1:3300 REFONTE/apres <dossier> --extra
```

| File | Screen / state | Inventory |
|---|---|---|
| 01-collection-vide | Empty collection + data folder detection (collapsed) | B13, B14 |
| 02-collection-detection-dossier | Detection expanded (full page) | B14, B15 |
| 03-ajouter-vide | Add a set, initial state | D1, D3 |
| 04-ajouter-recherche-locale | After local search: resources (OMR not clicked) | D5, D6, D10 |
| 05-ajouter-fichiers-compatibilite | Files dropped: model, instructions, mappings, compatibility, confirmation (full page) | D13–D22 |
| 06-ajouter-termine | Add completed | D23 |
| 07-atelier-diagnostic-guide | Library workshop, diagnostic before start (guided available) | G1–G13 |
| 08-atelier-guide-piece-en-main | Guided mode, part in hand, slots | H1–H3, H8 |
| 09-atelier-guide-en-cours | Guided mode, 1/4 placed | H4, F5 |
| 10-atelier-confirmation-abandon | Abandon confirmation (library) | K10 |
| 11-atelier-guide-termine | Model completed | H6 |
| 12-atelier-diagnostic-synchro | Diagnostic with synced instructions available | G9, G13 |
| 13-atelier-synchronise | Synced mode: step banner, driven page | I1, I2 |
| 14-atelier-editeur-correspondances | Mapping editor | M1–M20 |
| 15-atelier-libre-piece-en-main | Free building, part in hand, manipulation bar | J1–J9 |
| 16-atelier-libre-selection-gizmo | Free building, selection + manipulator | J10–J21 |
| 17-atelier-libre-selection-1024 | Same at 1024 × 768 | — |
| 18-collection | Collection with 4 sets, thumbnails, progress (full page) | B1–B12 |
| 19-collection-1024 | Collection at 1024 × 768 | — |
| 20-detail-set | Set detail (full page) | C1–C20 |
| 21-atelier-autonome-accueil | Workshop without a collection, home | N1 |
| 22-atelier-sans-etapes | Model without steps | G12, Q9 |
| 23-atelier-piece-absente | Part missing from the library | G5, G14, Q8 |
| 24-atelier-notice-vide | Instructions tab without a PDF | L1, L7 |
| 25-atelier-libre-notice-pdf | Free building + PDF instructions | L3, L4 |
| 26-atelier-erreur-fichier-modifie | Build impossible: file modified | E2 |
| 27-detail-fichier-modifie | Detail: problem and repair (full page) | C8–C10 |
| 28-atelier-ldraw-absent | LDraw library missing | Q10 |
| 29-ajouter-hors-ligne | `BRICK_LAB_ONLINE=0`: online search disabled (full page) | Q11 |
| 30-detail-ldraw-absent | Detail: preview unavailable | C3, Q10 |
| 31-collection-sombre | Collection, dark theme (full page) | B1–B12 |
| 32-detail-set-sombre | Set detail, dark theme (full page) | C1–C20 |
| 33-detail-confirmation-retrait | "Retirer le set de la collection" (Remove the set from the collection) modal | C19 |
| 34-atelier-synchronise-sombre | Synced instructions, dark theme, 3 parts placed | I1–I4 |
| 35-synchro-consultation-etape-faite | Viewing an already completed step | I5 |
| 36-synchro-confirmation-reprendre | "Reprendre depuis…" (Resume from…) modal with the number of parts removed | I6 |
| 37-editeur-confirmation-effacer | "Tout effacer" (Clear all) modal for the mappings | M18 |
| 38-libre-reglages-manipulation | Free building, selection, "Réglages" (Settings) row open | J11–J21 |
| 39-aide-raccourcis | "Raccourcis et gestes" (Shortcuts and gestures) help | O1–O21, P1–P12 |
| 40-atelier-guide-sombre-1024 | Guided mode, part in hand, dark theme, 1024 × 768 | H1–H3 |

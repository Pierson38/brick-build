# Reference screenshots — before the redesign

Base `a1309a4`, Chromium (Playwright 1.64.1), 1280 × 800 unless noted, `next dev` on a temporary data folder. Original fixtures only (`fixtures/`, `tests/fixtures/notice-sync-8.mpd`, generated PDF): no third-party content.

To reproduce (`next dev` server on 3300 with `BRICK_LAB_DATA_DIR=<empty folder>`, then the same folder with `LDRAW_LIBRARY_DIR=` and `BRICK_LAB_ONLINE=0`):

```bash
npx tsx REFONTE/scripts/captures.ts http://127.0.0.1:3300 REFONTE/avant <dossier>
npx tsx REFONTE/scripts/captures.ts http://127.0.0.1:3300 REFONTE/avant <dossier> --degraded
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

Not captured (transient states or hard to freeze): loading a build (E1), screen to choose between two saves (E3), save conflict (F8), PDF errors (Q16). They are covered by the `library.spec.ts` E2E tests and will be checked by hand in phase 5.

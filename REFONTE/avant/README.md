# Captures de référence — avant refonte

Base `a1309a4`, Chromium (Playwright 1.64.1), 1280 × 800 sauf mention, `next dev` sur un dossier de données temporaire. Fixtures originales uniquement (`fixtures/`, `tests/fixtures/notice-sync-8.mpd`, PDF généré) : aucun contenu tiers.

Reproduire (serveur `next dev` sur 3300 avec `BRICK_LAB_DATA_DIR=<dossier vide>`, puis le même dossier avec `LDRAW_LIBRARY_DIR=` et `BRICK_LAB_ONLINE=0`) :

```bash
npx tsx REFONTE/scripts/captures.ts http://127.0.0.1:3300 REFONTE/avant <dossier>
npx tsx REFONTE/scripts/captures.ts http://127.0.0.1:3300 REFONTE/avant <dossier> --degraded
```

| Fichier | Écran / état | Inventaire |
|---|---|---|
| 01-collection-vide | Collection vide + détection du dossier de données (replié) | B13, B14 |
| 02-collection-detection-dossier | Détection dépliée (page entière) | B14, B15 |
| 03-ajouter-vide | Ajouter un set, état initial | D1, D3 |
| 04-ajouter-recherche-locale | Après recherche locale : ressources (OMR non cliqué) | D5, D6, D10 |
| 05-ajouter-fichiers-compatibilite | Fichiers déposés : modèle, notice, correspondances, compatibilité, confirmation (page entière) | D13–D22 |
| 06-ajouter-termine | Ajout terminé | D23 |
| 07-atelier-diagnostic-guide | Atelier bibliothèque, diagnostic avant démarrage (guidé dispo) | G1–G13 |
| 08-atelier-guide-piece-en-main | Mode guidé, pièce en main, emplacements | H1–H3, H8 |
| 09-atelier-guide-en-cours | Mode guidé, 1/4 posée | H4, F5 |
| 10-atelier-confirmation-abandon | Confirmation d'abandon (bibliothèque) | K10 |
| 11-atelier-guide-termine | Modèle terminé | H6 |
| 12-atelier-diagnostic-synchro | Diagnostic avec notice synchronisée disponible | G9, G13 |
| 13-atelier-synchronise | Mode synchronisé : bannière d'étape, page pilotée | I1, I2 |
| 14-atelier-editeur-correspondances | Éditeur de correspondances | M1–M20 |
| 15-atelier-libre-piece-en-main | Montage libre, pièce en main, barre de manipulation | J1–J9 |
| 16-atelier-libre-selection-gizmo | Montage libre, sélection + manipulateur | J10–J21 |
| 17-atelier-libre-selection-1024 | Idem à 1024 × 768 | — |
| 18-collection | Collection avec 4 sets, vignettes, progression (page entière) | B1–B12 |
| 19-collection-1024 | Collection à 1024 × 768 | — |
| 20-detail-set | Détail d'un set (page entière) | C1–C20 |
| 21-atelier-autonome-accueil | Atelier sans collection, accueil | N1 |
| 22-atelier-sans-etapes | Modèle sans étapes | G12, Q9 |
| 23-atelier-piece-absente | Pièce absente de la bibliothèque | G5, G14, Q8 |
| 24-atelier-notice-vide | Onglet Notice sans PDF | L1, L7 |
| 25-atelier-libre-notice-pdf | Montage libre + notice PDF | L3, L4 |
| 26-atelier-erreur-fichier-modifie | Construction impossible : fichier modifié | E2 |
| 27-detail-fichier-modifie | Détail : problème et réparation (page entière) | C8–C10 |
| 28-atelier-ldraw-absent | Bibliothèque LDraw absente | Q10 |
| 29-ajouter-hors-ligne | `BRICK_LAB_ONLINE=0` : recherche en ligne désactivée (page entière) | Q11 |
| 30-detail-ldraw-absent | Détail : aperçu indisponible | C3, Q10 |

Non capturés (états transitoires ou difficiles à figer) : chargement d'une construction (E1), écran de choix entre deux sauvegardes (E3), conflit de sauvegarde (F8), erreurs PDF (Q16). Ils sont couverts par les E2E `library.spec.ts` et seront vérifiés à la main en phase 5.

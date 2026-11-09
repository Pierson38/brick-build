# Captures après refonte

Code de la phase 5 (base `044e815` + correctifs clavier et infobulles), Chromium (Playwright 1.64.1), 1280 × 800 sauf mention, thème clair sauf mention, `next dev` sur un dossier de données temporaire. Mêmes fixtures que les captures [avant](../avant/README.md) (originales, CC0, PDF généré) : aucun contenu tiers. Les fichiers 01 à 30 se comparent un à un avec `REFONTE/avant/` ; 31 à 40 montrent les états ajoutés par la refonte.

Dans la capture pleine page 05 (« Ajouter un set »), la barre d'action collante apparaît au niveau où se trouvait le bas de la fenêtre : artefact de la capture pleine page ; à l'écran, elle reste en bas de la fenêtre.

Reproduire (serveur `next dev` sur 3300 avec `BRICK_LAB_DATA_DIR=<dossier vide>`, puis le même dossier avec `LDRAW_LIBRARY_DIR=` et `BRICK_LAB_ONLINE=0`, puis de nouveau le serveur normal) :

```bash
npx tsx REFONTE/scripts/captures.ts http://127.0.0.1:3300 REFONTE/apres <dossier>
npx tsx REFONTE/scripts/captures.ts http://127.0.0.1:3300 REFONTE/apres <dossier> --degraded
npx tsx REFONTE/scripts/captures.ts http://127.0.0.1:3300 REFONTE/apres <dossier> --extra
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
| 31-collection-sombre | Collection, thème sombre (page entière) | B1–B12 |
| 32-detail-set-sombre | Détail d'un set, thème sombre (page entière) | C1–C20 |
| 33-detail-confirmation-retrait | Modale « Retirer le set de la collection » | C19 |
| 34-atelier-synchronise-sombre | Notice synchronisée, thème sombre, 3 pièces posées | I1–I4 |
| 35-synchro-consultation-etape-faite | Consultation d'une étape déjà faite | I5 |
| 36-synchro-confirmation-reprendre | Modale « Reprendre depuis… » avec le nombre de pièces retirées | I6 |
| 37-editeur-confirmation-effacer | Modale « Tout effacer » des correspondances | M18 |
| 38-libre-reglages-manipulation | Montage libre, sélection, ligne « Réglages » ouverte | J11–J21 |
| 39-aide-raccourcis | Aide « Raccourcis et gestes » | O1–O21, P1–P12 |
| 40-atelier-guide-sombre-1024 | Mode guidé, pièce en main, thème sombre, 1024 × 768 | H1–H3 |

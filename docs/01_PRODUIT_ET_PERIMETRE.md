# 01 — Cahier des charges produit

## Vision

Un jeu local de construction 3D où l'on reproduit les **vrais sets LEGO** à partir de fichiers importés, en choisissant et plaçant des briques comme dans une boîte réelle.

## Utilisateur et plateforme

- Utilisateur unique : propriétaire du Mac, interface en français.
- Navigateurs desktop modernes, priorité Chrome/Safari sur Mac ; clavier + souris/trackpad.
- Première cible : sets simples, quelques dizaines à ~300 pièces, et fixtures artificielles. Les gros Technic (>1 000 pièces) restent hors cible initiale.
- Aucun besoin d'inscription, de compte LEGO, ni d'Internet pendant les sessions après installation des dépendances et bibliothèque locale.

## Fonctionnalités prioritaires (MVP)

**MVP-01 — Import local du modèle**
- Sélection fichier `.ldr` ou `.mpd` ; affichage du nom, nombre d'occurrences de pièces, couleurs, sections, sous-assemblages, étapes détectées, pièces inconnues.
- Résultat catégorisé : `ANALYSABLE` / `RENDERABLE` / `GUIDED_PLAYABLE` / `MANUAL_ONLY`, avec motifs précis.
- Le joueur choisit le modèle principal si un MPD en contient plusieurs candidats.

**MVP-02 — Scène 3D**
- Rotation, zoom, recentrage, caméra ergonomique.
- Modèle complet en aperçu ; en partie, seules les pièces déjà validées apparaissent solidement.
- La prochaine zone cible apparaît en fantôme ; mise en surbrillance des pièces à placer.

**MVP-03 — Jeu de placement**
- Chaque occurrence de brique possède un ID distinct, une référence LDraw, une couleur, une transformation cible et éventuellement une étape.
- Le joueur prend une pièce de la liste de l'étape ; déplacement de la pièce vers la scène ; aimantation si suffisamment proche ; confirmation visuelle et sonore optionnelle (désactivée par défaut).
- Rotation simplifiée de la pièce ou mode « placement assisté » ; tolérances documentées en unités LDraw/degrés.
- Empêcher d'utiliser deux fois une même occurrence ; retour arrière d'une pose, réinitialisation d'étape.

**MVP-04 — Étapes 3D disponibles**
- Exploiter `0 STEP` quand présent et correctement interprétable.
- Si absent ou ambigu, afficher « Étapes non disponibles » et proposer **le mode notice / montage libre** : toutes les occurrences non placées sont candidates, l'utilisateur suit son PDF et choisit l'ordre. Pas de validation de l'ordre officiel, uniquement de l'emplacement final.
- Ne jamais annoncer que les étapes sont identiques à celles du PDF officiel si ce n'est pas vérifié.

**MVP-04b — Montage libre avec notice (même sans STEP)**
- Montrer le stock d'occurrences disponibles par référence/couleur ; sélectionner une brique et la placer.
- Lors du snap, rechercher une **occurrence cible restante compatible** (référence/couleur et transformation), puis assigner son ID unique. Les briques visuellement identiques ne doivent pas dupliquer l'état.
- L'ordre n'est pas certifié physiquement constructible : l'utilisateur le suit avec sa notice. Si le moteur ne peut pas rendre une pièce ou qu'un placement est ambigu, afficher un diagnostic et permettre la reprise.

**MVP-05 — Notice PDF locale**
- Importer fichier `.pdf` depuis ordinateur, afficher une page à la fois avec navigation et zoom ; interface fractionnée notice/3D.
- Numéro de page PDF indépendant de l'index des étapes de construction.
- Aucun OCR ou extraction automatique de séquences de montage dans le MVP.

**MVP-06 — Sauvegarde**
- Sauvegarder en local l'identité du modèle (hash), la version de schéma, les occurrences validées et l'état visuel de la progression.
- Si le modèle n'est pas durablement conservé localement, proposer sa réimportation après rechargement et restaurer sa progression par hash.
- PDF : possibilité d'importer à nouveau ; ne pas sauvegarder les bytes par défaut.

## Hors périmètre initial

- Catalogue centralisé de sets, images de boîtes officielles, moteur de recherche LEGO, scraping.
- Téléchargement de notices LEGO à l'intérieur de l'app.
- Analyse vision/IA des PDF, export automatique de notices, alignement automatique page→étape.
- Physique réaliste d'emboîtement, flexibles Technic, mécanismes en mouvement, stickers détaillés, minifigures avancées.
- Multi-joueur, AR/VR, scores, paiement, synchronisation cloud, déploiement en ligne.

## Indicateurs de réussite du MVP

- Import d'une fixture synthétique 4 pièces / 2 étapes et affichage correct.
- Sélection et placement validés pour toutes les occurrences d'au moins une fixture, sans dupliquer les pièces.
- Sauvegarde et reprise après refresh.
- Notice PDF importée et navigable indépendamment.
- Import d'un vrai MPD OMR **testé**, accompagné d'un rapport de compatibilité transparent ; « jouable » seulement si l'ordre de montage et le rendu sont réellement validés.

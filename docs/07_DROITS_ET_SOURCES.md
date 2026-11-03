# 07 — Sources officielles et contraintes de droits

**État des vérifications :** 03/11/2026. Ce document n'est pas un avis juridique.

## Sources techniques

1. LDraw OMR (répliques communautaires de sets LEGO) : https://library.ldraw.org/omr
2. Spécification LDraw (type 1, STEP, MPD) : https://www.ldraw.org/article/218.html
3. Norme OMR : https://library.ldraw.org/documentation/official-model-repository-omr-standards/official-model-repository-omr-specification
4. Règles OMR et licence des modèles contribués : https://www.ldraw.org/docs-main/official-model-repository-omr/rules-and-procedures-for-the-official-model-repository.html
5. Three.js LDrawLoader : https://threejs.org/docs/pages/LDrawLoader.html
6. Démo Three.js LDraw : https://threejs.org/examples/webgl_loader_ldraw.html
7. PDF.js documentation : https://mozilla.github.io/pdf.js/getting_started/
8. LEGO, notices : https://www.lego.com/fr-fr/service/building-instructions
9. Aide LEGO téléchargement PDF : https://www.lego.com/en-us/service/help-topics/article/how-to-download-building-instructions-online

## Droit et marques

- LEGO Fair Play : https://www.lego.com/en-us/legal/notices-and-policies/fair-play
- LEGO, projets personnels et propriétés intellectuelles : https://www.lego.com/en-gr/service/help-topics/article/using-lego-products-for-personal-projects

## Distinctions impératives

- **LDraw OMR n'est pas officiel LEGO** : « official » signifie modèles dérivés de sets existants, déposés par la communauté.
- Les fichiers OMR récents affichent normalement une licence CC BY 4.0, et certains hérités CC BY 2.0/4.0 selon les règles de dépôt ; lire **la licence inscrite dans le fichier effectivement téléchargé**. LDraw parts et fichier modèle peuvent être soumis à des conditions distinctes.
- Une licence sur le fichier créé par un contributeur ne garantit pas qu'il possède tous les droits éventuels sur le set LEGO, ses illustrations, ses personnages ou franchises tierces.
- Les notices officielles sont téléchargeables gratuitement par l'utilisateur depuis LEGO.com ; cela **n'accorde pas** le droit de les redistribuer en masse ou de les incorporer dans une application publique.
- Le fait de faire tourner le jeu pour soi seul sur localhost réduit les risques de diffusion, **mais n'efface pas** automatiquement droits d'auteur, marques, conditions de licence ou de service.

## Règles de conception pour le projet

- L'application importe localement des fichiers fournis volontairement par l'utilisateur.
- Ne pas mettre de copies de notices LEGO ou de modèles de sets tiers dans le dépôt, les builds publics, les tests automatisés ou un CDN.
- Ne pas aspirer automatiquement l'OMR ni LEGO.com ; le choix et le téléchargement des fichiers restent côté utilisateur.
- Conserver en métadonnées : nom du fichier, auteur indiqué, licence déclarée et source lorsque l'utilisateur les renseigne.
- Ne pas présenter l'application comme approuvée ou affiliée par LEGO.
- Envisager une revue juridique spécifique **avant** tout partage public, service multi-utilisateur ou monétisation.

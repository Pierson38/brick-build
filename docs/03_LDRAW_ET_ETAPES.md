# 03 — LDraw, import et gestion des étapes

## Sources et formats

- LDraw : `.ldr` (modèle texte), `.mpd` (plusieurs fichiers logiques dans un conteneur texte), `.dat` (définition de pièce) ; encodage UTF-8 dans la spécification.
- OMR : répliques communautaires de vrais sets LEGO, **pas des fichiers 3D officiels LEGO**.
- La bibliothèque de géométries des pièces doit être installée localement par l'utilisateur ou via procédure explicite conforme aux licences ; ne pas la commiter.
- Dans le MVP, `.io` (BrickLink Studio) et `.lxf` restent **hors périmètre** ; ne pas les annoncer comme importés.

## Lire les lignes qui comptent

```text
0 FILE exemple.mpd
0 Name: exemple.mpd
1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat
0 STEP
1 14 0 -24 0 1 0 0 0 1 0 0 0 1 3001.dat
0 STEP
0 NOFILE
```

- `0 FILE <nom>` : nouvelle section dans un MPD.
- `0 NOFILE` : fin de section (quand présent).
- `1 <couleur> <x y z> <a b c d e f g h i> <fichier>` : occurrence référencée, translation et matrice 3×3.
- `0 STEP` : marque la **fin** d'une étape, pas le début.
- `0 ROTSTEP` et autres méta-commandes : conserver/ignorer explicitement selon le support, documenter les limites.
- Les noms des sous-fichiers peuvent contenir des espaces : parser avec robustesse, en gardant le reste de la ligne pour la référence.

## Algorithme recommandé

1. Lire fichier texte et isoler les sections MPD ; pour un `.ldr` seul, créer une section unique.
2. Déterminer la section racine à partir de la convention/metadata ou demander à l'utilisateur si ambigu.
3. Construire la table des sous-fichiers internes, sans collisions ni normalisation destructive.
4. Parser chaque section, conserver ordre, `0 STEP`, type 1 et métadonnées utiles.
5. Détecter cycles, sous-fichiers manquants, profondeur excessive, références `../`, dépassements de quotas.
6. Résoudre récursivement chaque référence de sous-modèle avec composition des transformations : `M_global = M_parent * M_local`.
7. Résoudre la couleur héritée (`16` = couleur courante en LDraw, selon contexte) ; ne pas écraser arbitrairement les couleurs des enfants.
8. Attribuer un ID déterministe **par occurrence**, avec un chemin d'occurrence (`root/3/submodel/2/...`) et une référence de pièce, pour distinguer deux briques identiques.
9. Exposer pièces finales, sous-assemblages, étapes connues, inconnues, diagnostic de qualité et source du modèle.
10. Préparer un `buildPlan` dont les étapes viennent **seulement des données réelles du modèle ou d'un mapping édité**, jamais d'une prétendue lecture automatique de la notice.

## Complexité des étapes

Les sous-modèles peuvent contenir leurs propres `STEP`. Un `0 STEP` à la racine ne garantit pas qu'on dispose d'une séquence physique de pose de toutes les briques. Une référence de sous-modèle peut représenter un sous-assemblage entier. Il faut donc distinguer :

- **ROOT_STEPS** : ordre des références dans la section principale ; pourra inclure des groupes entiers.
- **NESTED_STEPS** : informations présentes dans les sous-modèles, parfois exploitables séparément.
- **FLATTENED_STEPS** : ordre de poses au niveau des pièces finales, obtenu par une stratégie explicitement documentée et testée, non automatiquement équivalent aux notices officielles.
- **NO_STEPS** : modèle fini uniquement ; en MVP, **mode montage libre** : stock de pièces disponibles, choix à la référence/couleur, placement sur la cible finale restante correspondante. Pas de guidage par l'ordre ni de revendication de fidélité à la notice.

Les instructions LEGO PDF ne contiennent pas de coordonnées directement exploitables. Ne pas annoncer de synchronisation PDF/MPD sans mapping vérifié. Pour le MVP, PDF et 3D sont deux vues **parallèles**.

## Cas de compatibilité à détecter

- `.mpd` valide mais seulement un modèle assemblé sans `0 STEP`.
- Un nombre de `STEP` positif mais étapes ambiguës à cause de sous-modèles imbriqués.
- Une pièce LDraw manque dans la bibliothèque locale.
- Fichier MPD avec plusieurs modèles alternatifs.
- Référence circulaire `A → B → A`.
- `0 FILE` dont le nom contient des espaces ou différences de casse.
- Répétition d'une même référence de pièce à plusieurs positions/couleurs.
- Pièce avec matrice de rotation non triviale, miroir, échelle invalide.
- Fichier volumineux ou malformé ; aucun traitement sans borne.

## Sources de référence

- Spécification LDraw : https://www.ldraw.org/article/218.html
- OMR : https://library.ldraw.org/omr
- OMR standard : https://library.ldraw.org/documentation/official-model-repository-omr-standards/official-model-repository-omr-specification
- Three.js LDrawLoader : https://threejs.org/docs/pages/LDrawLoader.html
- Démonstration : https://threejs.org/examples/webgl_loader_ldraw.html

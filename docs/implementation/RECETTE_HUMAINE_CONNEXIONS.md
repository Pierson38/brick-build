# Recette humaine — aimantation depuis le bac, connexions et assemblages cachés (31039)

> Critères :
> 1. Je prends une pièce **dans le bac**, je l'approche de mon assemblage, l'aimant propose immédiatement une connexion compatible, je vois les **repères verts**, puis la pièce s'emboîte **exactement** à cet endroit. Je n'ai plus à poser puis reprendre la pièce.
> 2. Je sélectionne une pièce d'un mécanisme, « **Assemblage** », et Brick Build sélectionne tout ce qui est relié — y compris par un **axe intérieur** et des pièces invisibles depuis ma caméra.
>
> Détail technique : [CONNEXIONS_FIABILISEES.md](CONNEXIONS_FIABILISEES.md).

Durée estimée : 20 min, Chrome puis Safari. Branche `fix/free-building-connections` (PR non fusionnée).

## 0. Avant de commencer

- Sauvegarde de ta bibliothèque (`library` + `mappings`) avant d'ouvrir le serveur de la branche ; rien n'est réaligné à l'ouverture, format des sauvegardes inchangé (v3).
- Serveur de la branche sur http://127.0.0.1:3000 (127.0.0.1 seulement) : `npm run build && npm run start` dans le worktree `brick-build-worktrees/free-building-connections`.

## 1. Le bug : une pièce prise dans le bac (31039 → Reprendre)

1. Barre de pièces : clic sur une **plaque orange 1 × 2** (3023). Ne pose rien d'abord.
2. Approche-la du dessus de ta **plaque blanche 2 × 4** : dès qu'elle est au-dessus, la barre affiche « **aimant : 2 tenon(s) emboîté(s) sur 1 pièce(s)** » et **deux points verts** apparaissent sur les tenons — *avant* tout clic.
3. Clic : la plaque est posée **là où l'aperçu la montrait** (même endroit, même hauteur).
4. **Annuler** ; recommence avec une **plaque grise 30157** au-dessus de tes plaques orange + support vert : « 4 tenon(s) … sur 2 pièce(s) ».
5. Reprends la pièce posée (clic puis M) et ramène-la au même endroit : **même proposition** qu'au point 2.

## 2. Une aimantation cohérente

1. Déplace lentement une pièce en main au-dessus de deux emplacements voisins : la proposition **ne saute pas** d'un emplacement à l'autre à chaque petit mouvement ; elle change quand tu t'éloignes franchement.
2. Approche une pièce d'un endroit éloigné de plus d'un tenon et demi : **aucune** attraction lointaine.
3. Tourne la pièce en main avec **X** (quart de tour) au-dessus de l'assemblage : la barre dit « **axes non alignés — tourne la pièce** », pas de point vert. Encore 3 × X : l'aimant revient.
4. Maintiens **⌥** : plus d'aimant (pose libre). Décoche **Aimant pièces** : idem.
5. **Aimant modèle** seul : près de la place officielle de la pièce, elle s'y cale (« à sa place dans le modèle ») ; ailleurs, pose libre. Les points verts n'apparaissent que si la pose montrée emboîte **réellement** des tenons.
6. Le manipulateur (flèches, anneaux, coordonnées) et le glisser direct d'une pièce posée : inchangés.

## 3. L'assemblage relié par un axe intérieur

1. Ta **roue avant** (axes rouges 32062, demi-poutres grises) : clic sur une demi-poutre grise, **Assemblage** → « **8 pièce(s) sélectionnée(s)** » (vérifié sur une copie de ta construction : 3 axes rouges, 2 × 41677, 2 × 6632, 1 × 32449, reliés par axes dans les trous d'axe). La jante, le pneu, la seconde 32449 et les deux axes-goupilles bleus 43093 n'en font pas partie : jante et pneu ne sont pas reconnus ; les trois autres sont posés à ~1 LDU d'un engagement réel (un axe à côté d'un trou n'est pas un axe dans le trou). Reprends-les avec l'aimant : ils s'emboîtent, puis Assemblage les inclut.
2. **Voir les connexions** : les autres pièces deviennent transparentes, l'intérieur est visible ; re-clic : retour normal (rien n'est modifié).
3. Tourne la caméra et refais **Assemblage** depuis la même pièce : **même nombre**.
4. **M**, déplace, **R**, clic : l'ensemble bouge d'un bloc, sans se déformer ; **Annuler** une fois : tout revient.

> Note : la roue (42610), le pneu (51011) et les charnières ne sont **pas** reconnus par la bibliothèque LDraw (ni primitive de connexion, ni métadonnée vérifiée) : ils ne s'ajoutent qu'avec Maj + clic. C'est voulu (pas de connexion inventée), voir l'inventaire.

## 4. Ce qui ne change pas

1. 31040 (notice synchronisée) et un set en mode guidé : comme avant.
2. Ta construction 31039 rouverte : chaque pièce exactement où tu l'avais laissée.

Retour attendu : GO / NO-GO par section, et toute pièce qui ne s'aimante pas alors qu'elle le devrait (référence + couleur).

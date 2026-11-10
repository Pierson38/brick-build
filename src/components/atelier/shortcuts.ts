/**
 * Every keyboard shortcut and pointer gesture of the atelier, by context, for the help dialog
 * (« ? »). Kept next to the key handler of BrickLabApp: a new key must be listed here too.
 */
export interface ShortcutGroup {
  readonly title: string;
  readonly items: readonly (readonly [keys: string, what: string])[];
}

export const SHORTCUTS: readonly ShortcutGroup[] = [
  {
    title: 'Partout',
    items: [
      ['?', 'Afficher cette aide'],
      ['⌘ Z / Ctrl Z', 'Annuler la dernière action'],
      ['Glisser dans le vide', 'Tourner la caméra autour du modèle'],
      ['Molette / pincement', 'Zoomer'],
      ['Clic droit glissé / deux doigts', 'Déplacer la vue'],
    ],
  },
  {
    title: 'Pièce en main',
    items: [
      ['Survol', 'La pièce se pose sur la surface visée'],
      ['Clic', 'Poser (un glissement de plus de 4 px fait tourner la caméra)'],
      ['R / Maj R', 'Quart de tour autour de Y'],
      ['O', 'Orientation suivante parmi celles du modèle'],
      ['A', 'Hauteur ou niveau automatique'],
      ['Échap', 'Lâcher la pièce (ou la laisser où elle était)'],
    ],
  },
  {
    title: 'Mode guidé et notice synchronisée',
    items: [
      ['Page ↑ / Page ↓', 'Niveau du modèle au-dessus / en dessous'],
      ['X / Y / Z (Maj : sens inverse)', 'Quart de tour de la pièce en main autour de l’axe'],
    ],
  },
  {
    title: 'Montage libre — pièce ou groupe en main',
    items: [
      ['X / Y / Z (Maj : sens inverse)', 'Tourner d’un pas autour de l’axe (pas choisi dans la barre : 90° à 1°)'],
      ['Page ↑ / Page ↓ (Maj : 1 LDU)', 'Monter / descendre d’une plaque'],
      ['Suppr / ⌫', 'Remettre dans le stock (pièce reprise ou groupe)'],
      ['⌥ maintenu', 'Ignorer l’aimant entre pièces'],
      ['G', 'Grille d’un demi-tenon on / off'],
    ],
  },
  {
    title: 'Montage libre — sélection',
    items: [
      ['Clic sur une pièce posée', 'La sélectionner (clic dans le vide : tout désélectionner)'],
      ['Maj clic', 'Ajouter ou retirer de la sélection'],
      ['Double-clic', 'Sélectionner tout l’assemblage relié'],
      ['Glisser une pièce posée', 'La déplacer (avec la sélection) ; Échap annule'],
      ['W / E', 'Manipulateur : flèches / anneaux'],
      ['Q', 'Axes globaux ↔ axes de la pièce'],
      ['Glisser une flèche ou un anneau', 'Déplacer ou tourner par pas (⌥ : sans pas, Échap : annuler)'],
      ['M', 'Prendre la sélection en main'],
      ['X / Y / Z / R', 'Tourner la sélection sur place'],
      ['Suppr / ⌫', 'Remettre la sélection dans le stock'],
      ['Échap', 'Désélectionner'],
    ],
  },
  {
    title: 'Éditeur de correspondances',
    items: [
      ['Clic sur une pièce', 'L’affecter à l’étape (fantôme) ou l’en retirer (surlignée)'],
      ['⌥ clic', 'La déplacer ici depuis une autre étape'],
    ],
  },
  {
    title: 'Panneau latéral',
    items: [
      ['← / → sur le séparateur (Maj : plus vite)', 'Redimensionner'],
      ['Entrée ou double-clic sur le séparateur', 'Largeur par défaut'],
    ],
  },
];

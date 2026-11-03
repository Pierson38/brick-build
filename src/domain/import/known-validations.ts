/**
 * Results of the manual P5 validation against the OFFICIAL inventory of the set, keyed by the
 * SHA-256 of the exact model file that was checked. Not a catalogue: nothing is downloaded or
 * listed, it only qualifies a file the user imports. Any other file is "not verified".
 * Details and evidence: docs/implementation/P5_VALIDATION_OMR.md.
 */
export type InventoryVerdict = 'COHERENT' | 'INCOMPLETE' | 'INDETERMINATE' | 'NOT_VERIFIED';

export interface InventoryCheck {
  readonly verdict: InventoryVerdict;
  readonly message: string;
}

const KNOWN: Readonly<Record<string, InventoryCheck>> = {
  // OMR 31040-1.mpd (Desert Racers, main model)
  '2036218e4555345763b151695a6f0d114fc7ae554f0906993e22b4df0204c8a2': {
    verdict: 'COHERENT',
    message: 'Inventaire officiel vérifié : 65 pièces, 30 références/couleurs, concordance exacte.',
  },
  // OMR 31009-1.mpd (Small Cottage, main model)
  '97b83517b0e843f8071ea3e4e80fbe0c7897685a7f476d3ba83161bb1185333d': {
    verdict: 'INDETERMINATE',
    message:
      'Inventaire indéterminé : 5 éléments de la boîte (2 plaques 2×4 blanches, 2 tuiles 1×2 blanches, 1 élément gris foncé) '
      + 'sont absents du fichier ; leur usage dans le modèle principal n’a pas pu être vérifié. Minifig décomposée différemment (10 pièces LDraw pour 6 éléments).',
  },
};

export function inventoryCheck(contentHash: string): InventoryCheck {
  return KNOWN[contentHash] ?? { verdict: 'NOT_VERIFIED', message: 'Inventaire non comparé à la notice officielle : le nombre de pièces n’est pas garanti.' };
}

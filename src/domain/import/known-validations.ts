/**
 * Results of the manual P5 validation against the OFFICIAL inventory of the set, keyed by the
 * SHA-256 of the exact model file that was checked. Not a catalogue: nothing is downloaded or
 * listed, it only qualifies a file the user imports. Any other file is "not verified".
 * Details and evidence: docs/implementation/P5_VALIDATION_OMR.md.
 */
import { msgs } from '../../i18n/runtime';

export type InventoryVerdict = 'COHERENT' | 'INCOMPLETE' | 'INDETERMINATE' | 'NOT_VERIFIED';

export interface InventoryCheck {
  readonly verdict: InventoryVerdict;
  readonly message: string;
}

// Messages are read when the check is made (language of the interface or of the request).
const KNOWN: Readonly<Record<string, { verdict: InventoryVerdict; message: () => string }>> = {
  // OMR 31040-1.mpd (Desert Racers, main model)
  '2036218e4555345763b151695a6f0d114fc7ae554f0906993e22b4df0204c8a2': {
    verdict: 'COHERENT',
    message: () => msgs().domain.inventory.coherent31040,
  },
  // OMR 31009-1.mpd (Small Cottage, main model)
  '97b83517b0e843f8071ea3e4e80fbe0c7897685a7f476d3ba83161bb1185333d': {
    verdict: 'INDETERMINATE',
    message: () => msgs().domain.inventory.indeterminate31009,
  },
};

export function inventoryCheck(contentHash: string): InventoryCheck {
  const known = Object.hasOwn(KNOWN, contentHash) ? KNOWN[contentHash] : undefined;
  return known ? { verdict: known.verdict, message: known.message() } : { verdict: 'NOT_VERIFIED', message: msgs().domain.inventory.notVerified };
}

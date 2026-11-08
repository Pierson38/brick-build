import type { Connector } from './connectors';

/**
 * Controlled connection metadata: the few references whose LDraw primitives are not enough to
 * deduce a connection that is certain on the real part. Each entry is part-local LDraw, says why it
 * exists, and is checked against the real library file by tests/unit/connectors-real.test.ts (the
 * receptor on the lowest face of the part, inside its outline). Kept short on purpose: an entry is
 * added only for a reference met in a real build, after checking the part.
 */
export interface MetadataEntry {
  readonly title: string;
  readonly why: string;
  readonly connectors: readonly Connector[];
}

const RECEPTOR = (x: number, y: number, z: number): Connector => ({ kind: 'antistud', pos: [x, y, z], axis: [0, -1, 0] });

export const CONNECTOR_METADATA: Readonly<Record<string, MetadataEntry>> = {
  // 31039 (Blue Power Jet): no stud, no tube in the file; the origin is the bottom face
  '11477.dat': {
    title: 'Slope Brick Curved  2 x  1',
    // checked on 31039: a 3021 plate takes the stud under the curve, next to this receptor
    why: 'no stud, no tube primitive; its flat bottom (y 0) covers z −20…0 only, the curve rises over z 0…20: one stud',
    connectors: [RECEPTOR(0, 0, -10)],
  },
  '54200.dat': {
    title: 'Slope Brick 31  1 x  1 x  0.667',
    why: 'underside without tube primitive: sits on 1 stud (1 × 1 outline)',
    connectors: [RECEPTOR(0, 0, 0)],
  },
};

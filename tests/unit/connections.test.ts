import { describe, expect, it } from 'vitest';
import { connectedAssembly, connectionGraph, ConnectorIndex, heldConnectors, proposeSnap, type PlacedPiece } from '@/domain/build/connections';
import { quarterTurn, rotateOrientation } from '@/domain/build/free';
import { connectorsOf, placeConnector, scanPartConnectors, type PartConnectors } from '@/domain/ldraw/connectors';
import { IDENTITY, withTranslation } from '@/domain/ldraw/matrix';
import type { Matrix4Tuple } from '@/domain/ldraw/types';

// ORIGINAL miniature LDraw files (not library content): a 2 × 2 brick, a 1 × 2 plate, a 1 × 2 tile,
// a pin and a beam with one pin hole, built from the standard primitive names.
const FILES: Record<string, string> = {
  'brick22.dat': ['0 Test Brick 2 x 2', '1 16 -10 0 -10 1 0 0 0 1 0 0 0 1 stud.dat', '1 16 10 0 -10 1 0 0 0 1 0 0 0 1 stud.dat', '1 16 -10 0 10 1 0 0 0 1 0 0 0 1 stud.dat', '1 16 10 0 10 1 0 0 0 1 0 0 0 1 stud.dat',
    '1 16 0 4 0 1 0 0 0 -5 0 0 0 1 stud4.dat', '1 16 0 0 0 20 0 0 0 24 0 0 0 20 box.dat'].join('\n'),
  'plate12.dat': ['0 Test Plate 1 x 2', '1 16 -10 0 0 1 0 0 0 1 0 0 0 1 stud.dat', '1 16 10 0 0 1 0 0 0 1 0 0 0 1 stud.dat', '1 16 0 4 0 1 0 0 0 -1 0 0 0 1 stud3.dat', '1 16 0 0 0 20 0 0 0 8 0 0 0 10 box.dat'].join('\n'),
  'tile12.dat': ['0 Tile  1 x  2 Test', '1 16 0 0 0 20 0 0 0 8 0 0 0 10 box.dat'].join('\n'),
  'pin.dat': ['0 Test Pin', '1 16 0 0 0 0 1 0 -1 0 0 0 0 1 connect.dat', '1 16 0 0 0 0 -1 0 1 0 0 0 0 1 connect.dat'].join('\n'),
  'beam.dat': ['0 Test Beam', '1 16 0 10 -10 1 0 0 0 0 1 0 -1 0 peghole.dat', '1 16 0 10 10 1 0 0 0 0 -1 0 1 0 peghole.dat', '1 16 0 0 0 10 0 0 0 20 0 0 0 10 box.dat'].join('\n'),
  'axle.dat-part.dat': ['0 Test Axle', '1 16 0 0 0 1 0 0 0 1 0 0 0 1 axlehol8.dat'].join('\n'),
  // primitives: a unit box (0..1 in y) and empty markers
  'box.dat': ['0 box', '4 16 -1 0 -1 1 0 -1 1 0 1 -1 0 1', '4 16 -1 1 -1 1 1 -1 1 1 1 -1 1 1'].join('\n'),
  'stud.dat': '0 Stud', 'stud3.dat': '0 Stud Tube Solid', 'stud4.dat': '0 Stud Tube Open', 'connect.dat': '0 Pin', 'peghole.dat': '0 Peg Hole End', 'axlehol8.dat': '0 Axle Perimeter',
};
const read = async (name: string) => FILES[name] ?? null;
const scan = (name: string) => scanPartConnectors(name, read);
const at = (x: number, y: number, z: number, m: Matrix4Tuple = IDENTITY): Matrix4Tuple => withTranslation(m, [x, y, z]);

describe('connectors read from the primitives of a part', () => {
  it('studs, and receptors deduced under the part (2 × 2 tube: four; 1 × 2 small tube: two)', async () => {
    const b = await scan('brick22.dat');
    expect(b.connectors.filter((c) => c.kind === 'stud').map((c) => c.pos)).toEqual([[-10, 0, -10], [10, 0, -10], [-10, 0, 10], [10, 0, 10]]);
    expect(b.connectors.filter((c) => c.kind === 'antistud').map((c) => c.pos).sort()).toEqual([[-10, 24, -10], [-10, 24, 10], [10, 24, -10], [10, 24, 10]]);
    expect(b.connectors.every((c) => c.axis.join() === '0,-1,0')).toBe(true);
    const p = await scan('plate12.dat');
    expect(p.connectors.filter((c) => c.kind === 'antistud').map((c) => c.pos)).toEqual([[-10, 8, 0], [10, 8, 0]]);
  });

  it('a tile (no stud, no tube) gets its receptors only from its standard title', async () => {
    expect((await scan('tile12.dat')).connectors.map((c) => [c.kind, ...c.pos])).toEqual([['antistud', -10, 8, 0], ['antistud', 10, 8, 0]]);
  });

  it('Technic: two pin halves, one pin hole between two collinear peg hole ends; axles are flagged, not invented', async () => {
    const pin = await scan('pin.dat');
    expect(pin.connectors.map((c) => [c.kind, ...c.pos, c.half])).toEqual([['pin', -10, 0, 0, 10], ['pin', 10, 0, 0, 10]]);
    const beam = await scan('beam.dat');
    expect(beam.connectors).toEqual([{ kind: 'pinhole', pos: [0, 10, 0], axis: [0, 0, 1], half: 10 }]);
    const axle = await scan('axle.dat-part.dat');
    expect(axle).toEqual({ connectors: [], axleUnrecognised: true });
  });

  it('a connector follows the pose of its piece, rotations included (exact)', async () => {
    const stud = (await scan('brick22.dat')).connectors[0]!;
    const w = placeConnector(stud, at(100, 0, 0, rotateOrientation(IDENTITY, 'x', 1)));
    expect(w.axis).toEqual([0, 0, -1]);
    expect(w.pos).toEqual([90, 10, 0]);
    expect(connectorsOf({ studs: [], tubesSmall: [], tubesOpen: [], pegEnds: [], pins: [], axle: false, vertices: [] }).connectors).toEqual([]);
  });
});

describe('connection graph and assemblies', () => {
  let brick: PartConnectors, pin: PartConnectors, beam: PartConnectors;
  const lib = (k: string) => ({ brick22: brick, pin, beam }[k]);
  const load = async () => {
    brick = await scan('brick22.dat'); pin = await scan('pin.dat'); beam = await scan('beam.dat');
  };

  it('a brick on another is connected; side by side or overlapping without a fit is not', async () => {
    await load();
    const pieces: PlacedPiece[] = [
      { key: 'f:1', partKey: 'brick22', pose: at(0, 0, 0) },
      { key: 'f:2', partKey: 'brick22', pose: at(0, -24, 0) }, // on f:1, studs in receptors
      { key: 'f:3', partKey: 'brick22', pose: at(40, 0, 0) }, // touching f:1 on the side
      { key: 'f:4', partKey: 'brick22', pose: at(10, -12, 0) }, // through f:1 / f:2, nothing fits
      { key: 'f:5', partKey: 'brick22', pose: at(40, -24, 0) }, // on f:3
      { key: 'f:6', partKey: 'brick22', pose: at(20, -48, 0) }, // half on f:2, half on f:5: bridges them
    ];
    const g = connectionGraph(new ConnectorIndex(pieces, lib));
    expect([...(g.get('f:1') ?? [])]).toEqual(['f:2']);
    expect(g.has('f:4')).toBe(false);
    expect(connectedAssembly(g, ['f:1'])).toEqual(['f:1', 'f:2', 'f:3', 'f:5', 'f:6']);
    expect(connectedAssembly(g, ['f:4'])).toEqual(['f:4']);
  });

  it('a pin in a pin hole is connected; a pin beside the hole is not', async () => {
    await load();
    const turned = rotateOrientation(IDENTITY, 'y', 1); // pin along z, like the hole
    const g = connectionGraph(new ConnectorIndex([
      { key: 'f:b', partKey: 'beam', pose: at(0, 0, 0) },
      { key: 'f:p', partKey: 'pin', pose: at(0, 10, 10, turned) }, // one half in the hole
      { key: 'f:q', partKey: 'pin', pose: at(30, 10, 10, turned) }, // beside it
    ], lib));
    expect([...(g.get('f:b') ?? [])]).toEqual(['f:p']);
    expect(g.has('f:q')).toBe(false);
  });
});

describe('snapping between pieces', () => {
  let brick: PartConnectors;
  const lib = () => brick;
  const base = async () => {
    brick = await scan('brick22.dat');
    return new ConnectorIndex([{ key: 'f:1', partKey: 'brick22', pose: at(0, 0, 0) }, { key: 'f:2', partKey: 'brick22', pose: at(60, 0, 0) }], lib);
  };

  it('a brick held a little off over another: moved so its four receptors take the four studs', async () => {
    const index = await base();
    const held = heldConnectors([{ partKey: 'brick22', pose: at(7, -21, -6) }], lib);
    const s = proposeSnap(held, index)!;
    expect(s).toMatchObject({ delta: [-7, -3, 6], pairs: 4, targets: ['f:1'], kinds: ['stud'] });
    expect(s.points).toHaveLength(4);
  });

  it('deterministic among candidates: more fitting studs first, then the smallest move, whatever the order', async () => {
    const index = await base();
    // over the edge of f:1, too far from its other studs: the local fit (2 studs, one row overhanging)
    const edge = heldConnectors([{ partKey: 'brick22', pose: at(27, -24, 2) }], lib);
    const a = proposeSnap(edge, index)!;
    expect(a).toMatchObject({ delta: [-7, 0, -2], pairs: 2, targets: ['f:1'] });
    expect(proposeSnap([...edge].reverse(), index)).toEqual(a);
    // near the middle: the full fit (4 studs) beats a closer partial one
    const middle = heldConnectors([{ partKey: 'brick22', pose: at(8, -24, 3) }], lib);
    expect(proposeSnap(middle, index)).toMatchObject({ delta: [-8, 0, -3], pairs: 4 });
  });

  it('manual height: only proposals at that height; turned sideways (axes do not match): none', async () => {
    const index = await base();
    expect(proposeSnap(heldConnectors([{ partKey: 'brick22', pose: at(3, -20, 0) }], lib), index, { keepHeight: true })).toBeNull();
    expect(proposeSnap(heldConnectors([{ partKey: 'brick22', pose: at(3, -24, 0) }], lib), index, { keepHeight: true })!.delta).toEqual([-3, 0, 0]);
    const sideways = withTranslation(quarterTurn('z', 1), [3, -24, 0]);
    expect(proposeSnap(heldConnectors([{ partKey: 'brick22', pose: sideways }], lib), index)).toBeNull();
  });

  it('a stud already holding a receptor is not offered again; two pieces in the same place are never proposed', async () => {
    brick = await scan('brick22.dat');
    // f:3 sits exactly on f:1: f:1's studs are taken
    const index = new ConnectorIndex([{ key: 'f:1', partKey: 'brick22', pose: at(0, 0, 0) }, { key: 'f:3', partKey: 'brick22', pose: at(0, -24, 0) }], lib);
    // held half-way between f:1's top (taken) and f:3's top (free): only on top of f:3, never inside it
    const onTaken = proposeSnap(heldConnectors([{ partKey: 'brick22', pose: at(2, -36, 1) }], lib), index);
    expect(onTaken).toMatchObject({ delta: [-2, -12, -1], targets: ['f:3'] });
    expect(proposeSnap(heldConnectors([{ partKey: 'brick22', pose: at(2, -24, 1) }], lib), index, { radius: 6 })).toBeNull();
  });

  it('a proposal that goes through another piece is skipped for the next one; nothing near: no proposal', async () => {
    const index = await base();
    const held = heldConnectors([{ partKey: 'brick22', pose: at(4, -24, 0) }], lib);
    const best = proposeSnap(held, index)!;
    const next = proposeSnap(held, index, { collides: (d) => d.join() === best.delta.join() })!;
    expect(next.delta).not.toEqual(best.delta);
    expect(proposeSnap(heldConnectors([{ partKey: 'brick22', pose: at(300, -24, 300) }], lib), index)).toBeNull();
  });
});

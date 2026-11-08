import { describe, expect, it } from 'vitest';
import { connectedAssembly, connectionGraph, ConnectorIndex, diagnoseSnap, engagedAt, heldConnectors, jointsBetween, proposeSnap, type PlacedPiece, type SnapProposal } from '@/domain/build/connections';
import { snapHover } from '@/domain/build/snap';
import { quarterTurn, rotateOrientation } from '@/domain/build/free';
import { connectorsOf, placeConnector, scanPartConnectors, type PartConnectors } from '@/domain/ldraw/connectors';
import { IDENTITY, multiply, withTranslation } from '@/domain/ldraw/matrix';
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
  // a 2 × 4 plate (8 studs, 3 open tubes); an axle 4 (two tips facing each other along x); a block
  // with an axle hole along x (20 LDU) and a pin hole along z
  'plate24.dat': ['0 Test Plate 2 x 4', ...[-30, -10, 10, 30].flatMap((x) => [-10, 10].map((z) => `1 16 ${x} 0 ${z} 1 0 0 0 1 0 0 0 1 stud.dat`)),
    ...[-20, 0, 20].map((x) => `1 16 ${x} 4 0 1 0 0 0 -1 0 0 0 1 stud4.dat`), '1 16 0 0 0 40 0 0 0 8 0 0 0 20 box.dat'].join('\n'),
  'axle4.dat': ['0 Test Axle 4', '1 16 40 0 0 0 -1 0 1 0 0 0 0 1 axleend.dat', '1 16 -40 0 0 0 1 0 1 0 0 0 0 -1 axleend.dat', '1 16 37 0 0 0 -74 0 1 0 0 0 0 1 axlehol8.dat'].join('\n'),
  'block.dat': ['0 Test Cross Block', '1 16 -10 0 0 0 20 0 -1 0 0 0 0 1 axlehole.dat', '1 16 0 20 10 1 0 0 0 0 1 0 -1 0 peghole.dat', '1 16 0 20 -10 1 0 0 0 0 1 0 1 0 peghole.dat',
    '1 16 0 10 0 10 0 0 0 20 0 0 0 10 box.dat'].join('\n'),
  // primitives: a unit box (0..1 in y) and empty markers
  'box.dat': ['0 box', '4 16 -1 0 -1 1 0 -1 1 0 1 -1 0 1', '4 16 -1 1 -1 1 1 -1 1 1 1 -1 1 1'].join('\n'),
  'stud.dat': '0 Stud', 'stud3.dat': '0 Stud Tube Solid', 'stud4.dat': '0 Stud Tube Open', 'connect.dat': '0 Pin', 'peghole.dat': '0 Peg Hole End', 'axlehol8.dat': '0 Axle Perimeter', 'axleend.dat': '0 Technic Axle End Surface', 'axlehole.dat': '0 Technic Axle Hole Closed',
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
    expect(connectorsOf({ studs: [], tubesSmall: [], tubesOpen: [], pegEnds: [], pins: [], axleEnds: [], axleHalves: [], axleHoles: [], axleOther: false, vertices: [] }).connectors).toEqual([]);
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

  it('the markers of the receptors in hand are rounded like every connector (31039: -14.4, not -14.400000000000002)', async () => {
    brick = await scan('brick22.dat');
    const index = new ConnectorIndex([{ key: 'f:1', partKey: 'brick22', pose: at(0, -14.4, 0) }], lib);
    const s = proposeSnap(heldConnectors([{ partKey: 'brick22', pose: at(2, -15.3, 1) }], lib), index)!;
    expect(s.delta).toEqual([-2, -23.1, -1]);
    expect(s.points.map((p) => p[1])).toEqual([-14.4, -14.4, -14.4, -14.4]);
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

describe('snapping, fix/free-building-connections: the same engine for every hand', () => {
  let brick: PartConnectors, plate: PartConnectors, axle: PartConnectors, block: PartConnectors;
  const lib = (k: string) => ({ brick22: brick, plate24: plate, axle4: axle, block }[k]);
  const load = async () => {
    brick = await scan('brick22.dat'); plate = await scan('plate24.dat'); axle = await scan('axle4.dat'); block = await scan('block.dat');
  };
  const held = (partKey: string, pose: Matrix4Tuple) => heldConnectors([{ partKey, pose }], lib);

  it('1. from the tray or taken again at the same pose: the same proposal (the piece in hand is ignored where it was)', async () => {
    await load();
    const others: PlacedPiece[] = [{ key: 'f:1', partKey: 'brick22', pose: at(0, 0, 0) }];
    // taken again: f:m still in the index, exactly on f:1 (it took f:1's studs)
    const withMoving = new ConnectorIndex([...others, { key: 'f:m', partKey: 'brick22', pose: at(0, -24, 0) }], lib);
    const fromTray = proposeSnap(held('brick22', at(6, -22, -3)), new ConnectorIndex(others, lib));
    const takenAgain = proposeSnap(held('brick22', at(6, -22, -3)), withMoving, { exclude: new Set(['f:m']) });
    expect(fromTray).toMatchObject({ delta: [-6, -2, 3], pairs: 4, targets: ['f:1'] });
    expect(takenAgain).toEqual(fromTray);
    // without the exclusion, f:1's studs look taken by the piece in hand itself
    expect(proposeSnap(held('brick22', at(6, -22, -3)), withMoving, { radius: 8 })).toBeNull();
  });

  it('4. several studs engaged at once: a 2 × 4 plate bridging two bricks takes 4 + 4 studs', async () => {
    await load();
    const index = new ConnectorIndex([{ key: 'f:1', partKey: 'brick22', pose: at(-20, 0, 0) }, { key: 'f:2', partKey: 'brick22', pose: at(20, 0, 0) }], lib);
    const s = proposeSnap(held('plate24', at(3, -9, 2)), index)!;
    expect(s).toMatchObject({ delta: [-3, 1, -2], pairs: 8, targets: ['f:1', 'f:2'], kinds: ['stud'] });
    expect(engagedAt(held('plate24', at(0, -8, 0)), index)).toMatchObject({ pairs: 8, targets: ['f:1', 'f:2'] });
  });

  it('5. turned on X, Y or Z: the whole scene turned gives the same fit, turned (exact)', async () => {
    await load();
    for (const axis of ['x', 'y', 'z'] as const) {
      for (const steps of [1, 2, 3]) {
        const r = quarterTurn(axis, steps);
        const turn = (m: Matrix4Tuple) => multiply(r, m);
        const index = new ConnectorIndex([{ key: 'f:1', partKey: 'brick22', pose: turn(at(0, 0, 0)) }], lib);
        const s = proposeSnap(held('brick22', turn(at(5, -21, -4))), index)!;
        const d = [r[0] * -5 + r[4] * -3 + r[8] * 4, r[1] * -5 + r[5] * -3 + r[9] * 4, r[2] * -5 + r[6] * -3 + r[10] * 4].map((v) => Math.round(v * 100) / 100 + 0);
        expect(s, `${axis} × ${steps}`).toMatchObject({ pairs: 4, targets: ['f:1'] });
        expect(s.delta.map((v) => v + 0)).toEqual(d);
      }
    }
  });

  it('near first: a near partial fit is preferred to a farther full one (no unexpected pull)', async () => {
    await load();
    const index = new ConnectorIndex([{ key: 'f:1', partKey: 'brick22', pose: at(0, 0, 0) }], lib);
    // 17 LDU right of the full fit, 3 LDU from the fit on one row of studs
    expect(proposeSnap(held('brick22', at(17, -24, 0)), index)).toMatchObject({ delta: [3, 0, 0], pairs: 2 });
    // within the near band, the most engaged: 8 LDU off the full fit, 12 from the one-row fit
    expect(proposeSnap(held('brick22', at(8, -24, 0)), index)).toMatchObject({ delta: [-8, 0, 0], pairs: 4 });
  });

  it('6. two close candidates: the proposal does not oscillate on small moves, it changes on a clear move', async () => {
    await load();
    // two bricks with a gap: over the gap, one row of studs on f:1 (x = 20) or on f:2 (x = 40)
    const index = new ConnectorIndex([{ key: 'f:1', partKey: 'brick22', pose: at(0, 0, 0) }, { key: 'f:2', partKey: 'brick22', pose: at(60, 0, 0) }], lib);
    let at0: number | null = null;
    const seen: string[] = [];
    for (const x of [29, 30, 31, 32, 30, 29, 31, 33]) {
      const s: SnapProposal = proposeSnap(held('brick22', at(x, -24, 0)), index, { stick: at0 === null ? null : [at0 - x, 0, 0] })!;
      at0 = x + s.delta[0];
      seen.push(s.targets.join());
    }
    expect(new Set(seen).size).toBe(1);
    // a clear move towards the other brick: the proposal follows
    const far = proposeSnap(held('brick22', at(37, -24, 0)), index, { stick: [at0! - 37, 0, 0] })!;
    expect(far.targets).not.toEqual(seen[0]!.split(','));
  });

  it('7. a connector already taken is not offered; the piece in hand does not count as taking it', async () => {
    await load();
    const index = new ConnectorIndex([{ key: 'f:1', partKey: 'brick22', pose: at(0, 0, 0) }, { key: 'f:3', partKey: 'brick22', pose: at(0, -24, 0) }], lib);
    expect(diagnoseSnap(held('brick22', at(2, -24, 1)), index, { radius: 6 })).toBe('OCCUPIED');
    expect(proposeSnap(held('brick22', at(2, -24, 1)), index, { radius: 6, exclude: new Set(['f:3']) })).toMatchObject({ pairs: 4, targets: ['f:1'] });
  });

  it('8. no recognised connection, axes not aligned, nothing near: said, never a false success', async () => {
    await load();
    const index = new ConnectorIndex([{ key: 'f:1', partKey: 'brick22', pose: at(0, 0, 0) }], lib);
    expect(diagnoseSnap([], index)).toBe('NO_CONNECTOR');
    expect(diagnoseSnap(held('brick22', withTranslation(quarterTurn('z', 1), [3, -24, 0])), index)).toBe('AXES');
    expect(diagnoseSnap(held('brick22', at(300, -24, 0)), index)).toBe('NONE_NEAR');
    // pieces magnet off: no proposal, no reason, but what the pose really engages is still reported
    const off = snapHover(held('brick22', at(0, -24, 0)), index, { pieces: false, keepHeight: false, exclude: new Set(), stick: null });
    expect(off).toMatchObject({ proposal: null, miss: null, engaged: { pairs: 4, targets: ['f:1'] } });
    const near = snapHover(held('brick22', at(1, -23, 0)), index, { pieces: false, keepHeight: false, exclude: new Set(), stick: null });
    expect(near.engaged.pairs).toBe(0); // 1 LDU off: touching is not connected
    const on = snapHover(held('brick22', at(1, -23, 0)), index, { pieces: true, keepHeight: false, exclude: new Set(), stick: null });
    expect(on.engaged).toMatchObject({ pairs: 4, targets: ['f:1'], points: on.proposal!.points, kinds: ['stud'] });
  });

  it('axles: an axle in an axle hole is rigid, in a round pin hole it turns; lined up beyond the hole is not engaged', async () => {
    await load();
    const turned = rotateOrientation(IDENTITY, 'y', 1); // block turned: its pin hole along x
    const index = new ConnectorIndex([
      { key: 'f:a', partKey: 'axle4', pose: at(0, 0, 0) }, // x from -40 to 40
      { key: 'f:b1', partKey: 'block', pose: at(-20, 0, 0) }, // axle hole x -30…-10
      { key: 'f:b2', partKey: 'block', pose: at(30, -20, 0, turned) }, // pin hole x 20…40 on the axle line
      { key: 'f:b3', partKey: 'block', pose: at(70, 0, 0) }, // axle hole x 60…80: on the line, beyond the tip
    ], lib);
    expect(jointsBetween(index, 'f:a', 'f:b1')).toEqual(['axle']);
    expect(jointsBetween(index, 'f:a', 'f:b2')).toEqual(['axle-turning']);
    expect(connectedAssembly(connectionGraph(index), ['f:b1'])).toEqual(['f:a', 'f:b1', 'f:b2']);
    // a block brought near the axle: onto its line, by half-stud steps, fully engaged
    const s = proposeSnap(held('block', at(-2, 3, 2)), index)!;
    expect(s).toMatchObject({ pairs: 1, targets: ['f:a'], kinds: ['axle'] });
    expect(s.delta).toEqual([2, -3, -2]); // x 0 = the nearest half-stud step, beside the first block
  });
});

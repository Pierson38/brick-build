import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { connectedAssembly, connectionGraph, ConnectorIndex, engagedAt, heldConnectors, jointsBetween, proposeSnap, type PlacedPiece } from '@/domain/build/connections';
import { rotateOrientation } from '@/domain/build/free';
import { analyzeModel } from '@/domain/import/analyze';
import { CONNECTOR_METADATA } from '@/domain/ldraw/connector-metadata';
import { scanPartConnectors, scanPrimitives, type PartConnectors } from '@/domain/ldraw/connectors';
import { IDENTITY, multiply, withTranslation } from '@/domain/ldraw/matrix';
import type { Matrix4Tuple } from '@/domain/ldraw/types';

/**
 * Connectors read from the REAL LDraw library (local, never committed: LDRAW_LIBRARY_DIR or
 * .env.local), on the references of the owner's 31039 and on the original fixture
 * tests/fixtures/mecanisme-axe.ldr (a black Technic axle 6 through orange cross blocks).
 * Skipped without the library.
 */
function libraryDir(): string | null {
  let dir = process.env.LDRAW_LIBRARY_DIR;
  if (!dir && existsSync('.env.local')) dir = readFileSync('.env.local', 'utf8').split('\n').find((l) => l.startsWith('LDRAW_LIBRARY_DIR='))?.slice(18).trim();
  return dir && existsSync(path.join(dir, 'parts', '3001.dat')) ? dir : null;
}
const LIB = libraryDir();
const read = async (name: string) => {
  const n = name.replace(/\\/g, '/').toLowerCase();
  for (const c of [`parts/${n}`, `p/${n}`]) {
    const f = path.join(LIB!, c);
    if (existsSync(f)) return readFileSync(f, 'utf8');
  }
  return null;
};
const cache = new Map();
const parts = new Map<string, PartConnectors>();
const scan = async (p: string) => {
  if (!parts.has(p)) parts.set(p, await scanPartConnectors(p, read, cache));
  return parts.get(p)!;
};
const kinds = (r: PartConnectors) => {
  const by: Record<string, number> = {};
  for (const c of r.connectors) by[c.kind] = (by[c.kind] ?? 0) + 1;
  return by;
};

describe.skipIf(!LIB)('connectors of real LDraw parts', () => {
  it('Technic axles: one segment between the two axle tips; axle pins: half pin + half axle', async () => {
    expect((await scan('3706.dat')).connectors).toEqual([{ kind: 'axle', pos: [0, 0, 0], axis: [1, 0, 0], half: 60 }]);
    expect((await scan('4519.dat')).connectors).toEqual([{ kind: 'axle', pos: [0, 0, 0], axis: [1, 0, 0], half: 30 }]);
    expect((await scan('32062.dat')).connectors).toEqual([{ kind: 'axle', pos: [0, 0, 0], axis: [1, 0, 0], half: 20 }]);
    expect((await scan('59426.dat')).connectors).toEqual([{ kind: 'axle', pos: [0, 0, 0], axis: [1, 0, 0], half: 55 }]);
    expect(kinds(await scan('3749.dat'))).toEqual({ pin: 1, axle: 1 });
    expect(kinds(await scan('43093.dat'))).toEqual({ pin: 1, axle: 1 });
  });

  it('axle holes and pin holes, never confused with axles', async () => {
    expect((await scan('6536.dat')).connectors).toEqual([
      { kind: 'pinhole', pos: [0, 20, 0], axis: [0, 0, 1], half: 10 },
      { kind: 'axlehole', pos: [0, 0, 0], axis: [1, 0, 0], half: 10 },
    ]);
    expect((await scan('32123a.dat')).connectors).toEqual([{ kind: 'axlehole', pos: [0, 0, 0], axis: [0, 0, 1], half: 5 }]);
    expect(kinds(await scan('32064a.dat'))).toEqual({ stud: 2, antistud: 2, axlehole: 1 });
    expect(kinds(await scan('30000.dat'))).toEqual({ stud: 4, antistud: 4, pin: 2, axlehole: 1 });
    expect(kinds(await scan('32316.dat'))).toEqual({ pinhole: 5 });
    expect(kinds(await scan('6632.dat'))).toEqual({ pinhole: 1, axlehole: 2 });
    expect(kinds(await scan('6558.dat'))).toEqual({ pin: 3 }); // long pin: two ends and the middle
    for (const p of ['3706.dat', '4519.dat', '32062.dat', '3704.dat', '3705.dat']) expect((await scan(p)).connectors.some((c) => c.kind === 'axlehole')).toBe(false);
  });

  it('axles whose stop end has no tip primitive: flagged uncertain, nothing invented', async () => {
    const r = await scan('87083.dat'); // Technic Axle 4 with Stop
    expect(r.axleUnrecognised).toBe(true);
    expect(r.connectors.filter((c) => c.kind === 'axle' || c.kind === 'axlehole')).toEqual([]);
  });

  it('receptors only where a stud or a tube vouches for them: no receptor in a cut-off corner', async () => {
    expect(kinds(await scan('2450.dat'))).toEqual({ stud: 6, antistud: 8 }); // Plate 3 x 3 without Corner
    expect(kinds(await scan('2420.dat'))).toEqual({ stud: 3, antistud: 3 }); // Plate 2 x 2 Corner
    expect((await scan('2420.dat')).connectors.filter((c) => c.kind === 'antistud').map((c) => [c.pos[0], c.pos[2]]).sort()).toEqual([[0, 0], [0, 20], [20, 0]]);
    // rectangular parts unchanged
    expect(kinds(await scan('3001.dat'))).toEqual({ stud: 8, antistud: 8 });
    expect(kinds(await scan('3023.dat'))).toEqual({ stud: 2, antistud: 2 });
    expect(kinds(await scan('3024.dat'))).toEqual({ stud: 1, antistud: 1 });
    // protrusions (door rail, handle) do not shift the grid
    expect(kinds(await scan('4510.dat'))).toEqual({ stud: 8, antistud: 8 });
    expect(kinds(await scan('48336.dat'))).toEqual({ stud: 2, antistud: 2 });
    // jumper: its centre tube gives the two receptors; without the tube, none rather than a wrong one
    expect((await scan('3794b.dat')).connectors.filter((c) => c.kind === 'antistud').map((c) => c.pos)).toEqual([[-10, 8, 0], [10, 8, 0]]);
    expect(kinds(await scan('15573.dat'))).toEqual({ stud: 1 });
    // round 1 × 1 tile: the stud goes inside its tube
    expect((await scan('98138.dat')).connectors).toEqual([{ kind: 'antistud', pos: [0, 8, 0], axis: [0, -1, 0] }]);
  });

  it('side studs (brackets, bricks with studs on the side) point sideways', async () => {
    const side = (await scan('87087.dat')).connectors.filter((c) => c.kind === 'stud' && Math.abs(c.axis[1]) < 0.5);
    expect(side.length).toBeGreaterThan(0);
    const bracket = (await scan('99780.dat')).connectors.filter((c) => c.kind === 'stud');
    expect(bracket.some((c) => Math.abs(c.axis[1]) < 0.5)).toBe(true);
  });

  it('controlled metadata: each receptor on the lowest face of the real part, inside its outline', async () => {
    for (const [part, entry] of Object.entries(CONNECTOR_METADATA)) {
      const raw = (await scanPrimitives(part, read, cache))!;
      expect((await read(part))!.split('\n')[0]).toContain(entry.title);
      let maxY = -Infinity;
      const v = raw.vertices;
      for (let i = 1; i < v.length; i += 3) maxY = Math.max(maxY, v[i]!);
      // the outline of the flat bottom face itself (not the box of the whole part)
      const bottom = [...Array(v.length / 3).keys()].filter((i) => Math.abs(v[i * 3 + 1]! - maxY) < 0.6);
      const xs = bottom.map((i) => v[i * 3]!), zs = bottom.map((i) => v[i * 3 + 2]!);
      for (const c of entry.connectors) {
        expect(c.pos[1]).toBeCloseTo(maxY, 1);
        expect(c.pos[0]).toBeGreaterThanOrEqual(Math.min(...xs) + 9);
        expect(c.pos[0]).toBeLessThanOrEqual(Math.max(...xs) - 9);
        expect(c.pos[2]).toBeGreaterThanOrEqual(Math.min(...zs) + 9);
        expect(c.pos[2]).toBeLessThanOrEqual(Math.max(...zs) - 9);
      }
      // the primitives alone give no receptor: the entry is needed
      expect(raw.tubesOpen.length + raw.tubesSmall.length + raw.studs.length).toBe(0);
    }
  });
});

describe.skipIf(!LIB)('hidden mechanism: a black axle through orange pieces (fixture mecanisme-axe.ldr, real parts)', () => {
  const model = analyzeModel(readFileSync(path.join('tests', 'fixtures', 'mecanisme-axe.ldr'), 'utf8'), 'mecanisme-axe.ldr');
  const occ = model.model.occurrences;
  const key = (o: (typeof occ)[number]) => `f:${o.partKey}@${o.targetMatrix[12]},${o.targetMatrix[13]},${o.targetMatrix[14]}`;
  const placed = (move: (m: Matrix4Tuple) => Matrix4Tuple = (m) => m): PlacedPiece[] => occ.map((o) => ({ key: key(o), partKey: o.partKey, pose: move(o.targetMatrix) }));
  const index = async (pieces: PlacedPiece[]) => {
    for (const p of pieces) await scan(p.partKey);
    return new ConnectorIndex(pieces, (k) => parts.get(k));
  };
  const MECHANISM = [
    'f:2780.dat@-40,20,10', 'f:2780.dat@40,20,10', 'f:3023.dat@-30,2,20', 'f:32123a.dat@-20,0,0', 'f:32123a.dat@20,0,0', 'f:3706.dat@0,0,0',
    'f:6536.dat@-40,0,0', 'f:6536.dat@0,0,0', 'f:6536.dat@40,0,0', 'f:6541.dat@-40,10,20', 'f:6541.dat@40,10,20',
  ].sort();

  it('from ONE orange cross block: the whole mechanism, the hidden axle included; lined-up or crossed pieces excluded', async () => {
    const idx = await index(placed());
    const g = connectionGraph(idx);
    expect(connectedAssembly(g, ['f:6536.dat@-40,0,0'])).toEqual(MECHANISM);
    // the same from any piece of it (the result does not depend on where one starts)
    for (const start of MECHANISM) expect(connectedAssembly(g, [start])).toEqual(MECHANISM);
    // the axle holds the three cross blocks rigidly and the bushes; pins turn in their holes
    expect(jointsBetween(idx, 'f:3706.dat@0,0,0', 'f:6536.dat@0,0,0')).toEqual(['axle']);
    expect(jointsBetween(idx, 'f:2780.dat@-40,20,10', 'f:6541.dat@-40,10,20')).toEqual(['pin']);
    // a cross block on the axle's line beyond its tip, a brick with its hole lined up without a pin,
    // an axle through a brick without a hole, a plate hiding everything: not connected
    for (const loose of ['f:6536.dat@90,0,0', 'f:6541.dat@0,10,20', 'f:4519.dat@0,0,120', 'f:3001.dat@0,-12,120', 'f:3958.dat@0,-32,10']) {
      expect(g.has(loose)).toBe(false);
    }
  });

  it('turned or moved as a whole (any of X / Y / Z): the same graph — nothing depends on the view or the place', async () => {
    const base = connectionGraph(await index(placed()));
    for (const axis of ['x', 'y', 'z'] as const) {
      const r = rotateOrientation(rotateOrientation(IDENTITY, axis, 1), 'y', 1);
      const moved = connectionGraph(await index(placed((m) => {
        const t = multiply(r, m);
        return withTranslation(t, [t[12] + 130, t[13] - 40, t[14] + 70]);
      })));
      expect([...moved.keys()].sort()).toEqual([...base.keys()].sort());
      expect(connectedAssembly(moved, ['f:6536.dat@-40,0,0'])).toEqual(MECHANISM);
    }
  });
});

/**
 * Owner's 31039 (08/11/2026): the tan brick with a hole 6541 and the dark grey corner plate 2639 above
 * it did not fit — 24 pieces of the fuselage stood 1.81 LDU too low. Cause: the curved inverted slope
 * 41763 (= 42023) draws the hollow studs of its thin end LONGER than a stud (sunk into the part: base
 * 9.2 and 1.41 LDU under the top, tip at the usual -4) and its tubes stop 0.4 LDU above its bottom rim;
 * 4287 (Slope 33 3 x 1 Inverted, = 4287a) draws two of its three studs the same way. Original fixture
 * tests/fixtures/pente-inversee-bloc.ldr: the same references stacked the same way.
 */
describe.skipIf(!LIB)('sunk studs and tubes short of the rim: the 31039 fuselage block (fixture pente-inversee-bloc.ldr, real parts)', () => {
  const studs = (r: PartConnectors) => r.connectors.filter((c) => c.kind === 'stud').map((c) => c.pos);
  const receptors = (r: PartConnectors) => r.connectors.filter((c) => c.kind === 'antistud').map((c) => c.pos);

  it('a stud drawn longer than a stud stands on the face 4 LDU under its tip (41763 / 42023, 4287 / 4287a)', async () => {
    expect(studs(await scan('41763.dat'))).toEqual([[0, 0, 10], [0, 0, -10], [0, 0, -30], [0, 0, -50], [0, 0, -70], [0, 0, -90]]);
    expect(studs(await scan('42023.dat'))).toEqual(studs(await scan('41763.dat')));
    expect(studs(await scan('4287.dat'))).toEqual([[0, 0, 0], [0, 0, -20], [0, 0, -40]]);
  });

  it('tubes that stop short of the bottom rim: the receptors on the rim (41763: tubes to 23.6, rim at 24)', async () => {
    expect(receptors(await scan('41763.dat'))).toEqual([[0, 24, -10], [0, 24, 10]]);
    // ordinary parts unchanged
    expect(receptors(await scan('3005.dat'))).toEqual([[0, 24, 0]]);
    expect(receptors(await scan('4287.dat'))).toEqual([[0, 24, 0]]);
    // the same geometry elsewhere: a locking hinge brick whose tubes stop 0.4 LDU short too
    expect(receptors(await scan('30388.dat'))).toEqual([[-30, 24, 0], [-10, 24, 0], [10, 24, 0], [30, 24, 0]]);
    // the rim only changes the height of the receptors, and only when it is the lowest point of the
    // part: a brick with train wheels under it keeps its receptors as they were
    expect(receptors(await scan('4180c01.dat'))).toEqual([[-30, 24, -10], [-30, 24, 10], [-10, 24, -10], [-10, 24, 10], [10, 24, -10], [10, 24, 10], [30, 24, -10], [30, 24, 10]]);
  });

  it('a tall stud with no face under it keeps its drawn base (2680a Support Stanchion with Tall Studs)', async () => {
    expect(studs(await scan('2680a.dat'))).toEqual([[-10, 0, -10], [10, 0, -10], [-10, 0, 10], [10, 0, 10]]);
  });

  it('studs standing in the same plane as a verified sunk stud: the same treatment (2653, top drawn with edges near its middle studs)', async () => {
    expect(studs(await scan('2653.dat'))).toEqual([[-30, 0, 0], [-10, 0, 0], [10, 0, 0], [30, 0, 0]]);
  });

  const model = analyzeModel(readFileSync(path.join('tests', 'fixtures', 'pente-inversee-bloc.ldr'), 'utf8'), 'pente-inversee-bloc.ldr');
  const at = (part: string) => model.model.occurrences.find((o) => o.partKey === part)!.targetMatrix;
  /** A piece taken from the tray, shown `off` LDU from its place: the pose where the pieces magnet puts it. */
  const fromTray = async (placed: PlacedPiece[], partKey: string, off: readonly [number, number, number]) => {
    for (const p of [...placed.map((q) => q.partKey), partKey]) await scan(p);
    const idx = new ConnectorIndex(placed, (k) => parts.get(k));
    const target = at(partKey);
    const shown = withTranslation(target, [target[12] + off[0], target[13] + off[1], target[14] + off[2]]);
    const snap = proposeSnap(heldConnectors([{ partKey, pose: shown }], (k) => parts.get(k)), idx);
    const pose = snap ? withTranslation(shown, [shown[12] + snap.delta[0], shown[13] + snap.delta[1], shown[14] + snap.delta[2]]) : shown;
    return { snap, pose, piece: { key: `f:${partKey}`, partKey, pose } as PlacedPiece, idx };
  };
  const exactly = (pose: Matrix4Tuple, part: string) => expect(pose.slice(12, 15)).toEqual(at(part).slice(12, 15));
  const BASE: PlacedPiece[] = [{ key: 'f:3001.dat', partKey: '3001.dat', pose: at('3001.dat') }, { key: 'f:3005.dat', partKey: '3005.dat', pose: at('3005.dat') }];

  for (const off of [[3, 0, 4], [-4, -3, 2], [2, 5, -3]] as const) {
    it(`from the tray, shown ${off.join(' / ')} LDU away: 41763 → 4287 → 2639 → the tan block 6541 fits exactly under the grey plate`, async () => {
      const curve = await fromTray(BASE, '41763.dat', off);
      exactly(curve.pose, '41763.dat');
      expect(curve.snap?.targets).toEqual(['f:3001.dat']);
      const slope = await fromTray([...BASE, curve.piece], '4287.dat', off);
      exactly(slope.pose, '4287.dat'); // flush on the top of the curve, not 9.2 LDU into it
      expect(slope.snap).toMatchObject({ pairs: 1, targets: ['f:41763.dat'] });
      const plate = await fromTray([...BASE, curve.piece, slope.piece], '2639.dat', off);
      exactly(plate.pose, '2639.dat');
      const block = await fromTray([...BASE, curve.piece, slope.piece, plate.piece], '6541.dat', off);
      exactly(block.pose, '6541.dat');
      // the block takes the brick under it and the grey plate over it: two studs, two pieces
      expect(block.snap).toMatchObject({ pairs: 2, targets: ['f:2639.dat', 'f:3005.dat'], kinds: ['stud'] });
      // placed: the connections recognised at that exact pose, and one assembly
      const all = [...BASE, curve.piece, slope.piece, plate.piece, block.piece];
      const idx = new ConnectorIndex(all, (k) => parts.get(k));
      expect(jointsBetween(idx, 'f:6541.dat', 'f:2639.dat')).toEqual(['stud']);
      expect(jointsBetween(idx, 'f:4287.dat', 'f:2639.dat')).toEqual(['stud']);
      expect(connectedAssembly(connectionGraph(idx), ['f:6541.dat'])).toEqual(all.map((p) => p.key).sort());
    });
  }

  it('the user’s order (the block first, the grey plate last): the plate takes the slope AND the block', async () => {
    const curve = await fromTray(BASE, '41763.dat', [3, 0, 4]);
    const slope = await fromTray([...BASE, curve.piece], '4287.dat', [3, 0, 4]);
    const block = await fromTray([...BASE, curve.piece, slope.piece], '6541.dat', [3, 0, 4]);
    exactly(block.pose, '6541.dat');
    const plate = await fromTray([...BASE, curve.piece, slope.piece, block.piece], '2639.dat', [3, 0, 4]);
    exactly(plate.pose, '2639.dat');
    expect(plate.snap).toMatchObject({ pairs: 2, targets: ['f:4287.dat', 'f:6541.dat'] });
    // the markers of the preview = the connections checked at the pose shown
    const shown = heldConnectors([{ partKey: '2639.dat', pose: plate.pose }], (k) => parts.get(k));
    expect(engagedAt(shown, plate.idx).points).toEqual(plate.snap!.points);
  });
});

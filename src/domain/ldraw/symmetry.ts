import { rotationY } from './matrix';
import type { Matrix4Tuple } from './types';

// Rotational symmetries of a part around its own LDraw Y axis, from its real geometry.

const QUANTUM = 0.05; // LDU

function key(x: number, y: number, z: number): string {
  return `${Math.round(x / QUANTUM)},${Math.round(y / QUANTUM)},${Math.round(z / QUANTUM)}`;
}

/**
 * Quarter turns q (0–3) for which the vertex set is unchanged by rotationY(q).
 * `vertices` is a flat xyz list in part-local LDraw coordinates. Always contains 0.
 */
export function yQuarterTurnSymmetries(vertices: ArrayLike<number>): number[] {
  const set = new Set<string>();
  for (let i = 0; i + 2 < vertices.length; i += 3) set.add(key(vertices[i]!, vertices[i + 1]!, vertices[i + 2]!));
  const result = [0];
  for (let q = 1; q < 4; q++) {
    const r = rotationY(q);
    let invariant = set.size > 0;
    for (let i = 0; invariant && i + 2 < vertices.length; i += 3) {
      const x = vertices[i]!, y = vertices[i + 1]!, z = vertices[i + 2]!;
      invariant = set.has(key(r[0] * x + r[8] * z, y, r[2] * x + r[10] * z));
    }
    if (invariant) result.push(q);
  }
  return result;
}

/** Target poses equivalent to `target` for a part with the given symmetries (right-multiplied, part-local). */
export function equivalentTargets(target: Matrix4Tuple, symmetries: readonly number[]): Matrix4Tuple[] {
  return symmetries.map((q) => {
    if (q === 0) return target;
    const r = rotationY(q);
    const out = [...target];
    // out[:3,:3] = target[:3,:3] * r[:3,:3]; translation unchanged
    for (let col = 0; col < 3; col++) {
      for (let row = 0; row < 3; row++) {
        let sum = 0;
        for (let k = 0; k < 3; k++) sum += target[k * 4 + row]! * r[col * 4 + k]!;
        out[col * 4 + row] = sum;
      }
    }
    return out as unknown as Matrix4Tuple;
  });
}

export type RotationClass = 'Y_QUARTER_TURN' | 'AXIS_ALIGNED_OTHER' | 'ARBITRARY';

/** How a target rotation can be reached with the pointer (R = 90° around Y). */
export function classifyRotation(m: Matrix4Tuple): RotationClass {
  const r = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  const axisAligned = r.every((v) => Math.abs(v) < 1e-3 || Math.abs(Math.abs(v) - 1) < 1e-3);
  if (!axisAligned) return 'ARBITRARY';
  // column 1 (local Y) must stay +Y, i.e. m[5] = 1
  return Math.abs(m[5] - 1) < 1e-3 ? 'Y_QUARTER_TURN' : 'AXIS_ALIGNED_OTHER';
}

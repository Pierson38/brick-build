import type { Matrix4Tuple } from './types';

// Column-major 4x4 helpers (index = column * 4 + row), see types.ts.

export const IDENTITY: Matrix4Tuple = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Builds a matrix from the 12 numbers of an LDraw type-1 line: x y z a b c d e f g h i. */
export function fromLDraw(values: readonly number[]): Matrix4Tuple {
  const [x, y, z, a, b, c, d, e, f, g, h, i] = values as [
    number, number, number, number, number, number, number, number, number, number, number, number,
  ];
  return [a, d, g, 0, b, e, h, 0, c, f, i, 0, x, y, z, 1];
}

export function multiply(m: Matrix4Tuple, n: Matrix4Tuple): Matrix4Tuple {
  const out = new Array<number>(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += m[k * 4 + row]! * n[col * 4 + k]!;
      out[col * 4 + row] = sum;
    }
  }
  return out as unknown as Matrix4Tuple;
}

export function translationOf(m: Matrix4Tuple): readonly [number, number, number] {
  return [m[12], m[13], m[14]];
}

export function withTranslation(m: Matrix4Tuple, t: readonly [number, number, number]): Matrix4Tuple {
  const out = [...m];
  out[12] = t[0];
  out[13] = t[1];
  out[14] = t[2];
  return out as unknown as Matrix4Tuple;
}

export function determinant3(m: Matrix4Tuple): number {
  const [a, d, g, , b, e, h, , c, f, i] = m;
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}

export function distance(m: Matrix4Tuple, n: Matrix4Tuple): number {
  return Math.hypot(m[12] - n[12], m[13] - n[13], m[14] - n[14]);
}

/** Rotation angle (degrees) between the 3x3 parts of two rigid transforms. */
export function rotationAngleDeg(m: Matrix4Tuple, n: Matrix4Tuple): number {
  // trace(Rm^T * Rn) = sum over columns of dot(col_m, col_n)
  let trace = 0;
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) trace += m[col * 4 + row]! * n[col * 4 + row]!;
  }
  const cos = Math.min(1, Math.max(-1, (trace - 1) / 2));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Rotation of `quarterTurns` × 90° around the LDraw Y axis. */
export function rotationY(quarterTurns: number): Matrix4Tuple {
  const q = ((quarterTurns % 4) + 4) % 4;
  const cos = [1, 0, -1, 0][q]!;
  const sin = [0, 1, 0, -1][q]!;
  return [cos, 0, -sin, 0, 0, 1, 0, 0, sin, 0, cos, 0, 0, 0, 0, 1];
}

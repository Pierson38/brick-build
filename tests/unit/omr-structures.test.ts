import { describe, expect, it } from 'vitest';
import { createSession, heldPose, orientationChoices, tryPlace } from '@/domain/build/engine';
import { analyzeModel } from '@/domain/import/analyze';
import { classifyRotation, equivalentTargets, yQuarterTurnSymmetries } from '@/domain/ldraw/symmetry';
import { rotationAngleDeg, rotationY, withTranslation } from '@/domain/ldraw/matrix';

// Structures measured on real OMR files (31040-1, 31045-1), reproduced with original synthetic content.
const embeddedPartMpd = [
  '0 FILE main.ldr',
  '0 !LDRAW_ORG Model',
  '1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat',
  '0 STEP',
  '1 0 0 -24 0 1 0 0 0 1 0 0 0 1 my-wheel.dat',
  '1 0 80 -24 0 1 0 0 0 1 0 0 0 1 my-wheel.dat',
  '0 STEP',
  '0 FILE my-wheel.dat',
  '0 Synthetic unofficial wheel',
  '0 !LDRAW_ORG Unofficial_Part',
  '1 16 0 0 0 2 0 0 0 1 0 0 0 2 4-4cyli.dat',
  '1 16 0 0 0 1 0 0 0 1 0 0 0 1 s\\my-wheel-s01.dat',
  '4 16 -1 0 -1 1 0 -1 1 0 1 -1 0 1',
  '0 FILE s\\my-wheel-s01.dat',
  '0 !LDRAW_ORG Unofficial_Subpart',
  '3 16 0 0 0 1 0 0 0 0 1',
].join('\n');

describe('embedded part definitions', () => {
  it('are single bricks, not submodels; their primitives are not occurrences', () => {
    const a = analyzeModel(embeddedPartMpd, 'x.mpd');
    expect(a.model.occurrences.map((o) => o.partKey)).toEqual(['3001.dat', 'my-wheel.dat', 'my-wheel.dat']);
    expect(a.model.submodelInstances).toEqual([]);
    expect(a.plan.kind).toBe('ROOT_STEPS');
    expect(a.plan.steps.map((s) => s.occurrenceIds.length)).toEqual([1, 2]);
    expect(a.rootCandidates).toEqual(['main.ldr']);
  });

  it('exposes the raw text of embedded parts for the geometry loader', () => {
    const a = analyzeModel(embeddedPartMpd, 'x.mpd');
    expect(a.embeddedParts.map((p) => p.name)).toEqual(['my-wheel.dat', 's\\my-wheel-s01.dat']);
    expect(a.embeddedParts[0]!.text.split('\n')[0]).toBe('0 FILE my-wheel.dat');
    expect(a.embeddedParts[0]!.text).toContain('4-4cyli.dat');
    expect(a.embeddedParts[0]!.text).not.toContain('Unofficial_Subpart');
  });

  it('does not report scaled primitives inside parts as model problems', () => {
    const codes = analyzeModel(embeddedPartMpd, 'x.mpd').diagnostics.map((d) => d.code);
    expect(codes).not.toContain('SCALED_MATRIX');
    expect(codes).not.toContain('DIRECT_GEOMETRY_IGNORED');
  });

  it('an undeclared .dat section with geometry is a part; an .ldr section stays a submodel', () => {
    const text = ['0 FILE m.ldr', '1 4 0 0 0 1 0 0 0 1 0 0 0 1 p.dat', '1 4 0 0 0 1 0 0 0 1 0 0 0 1 s.ldr', '0 FILE p.dat', '3 16 0 0 0 1 0 0 0 0 1', '0 FILE s.ldr', '1 1 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat'].join('\n');
    const a = analyzeModel(text, 'm.mpd');
    expect(a.model.occurrences.map((o) => o.partKey)).toEqual(['p.dat', '3001.dat']);
    expect(a.model.submodelInstances.map((i) => i.sectionName)).toEqual(['s.ldr']);
  });
});

describe('symmetry and rotation classes', () => {
  const box = (hx: number, hz: number) => [-hx, 0, -hz, hx, 0, -hz, hx, 0, hz, -hx, 0, hz, -hx, 24, -hz, hx, 24, -hz, hx, 24, hz, -hx, 24, hz];

  it('detects 180° symmetry of a 2×4 footprint and 90° symmetry of a square', () => {
    expect(yQuarterTurnSymmetries(box(40, 20))).toEqual([0, 2]);
    expect(yQuarterTurnSymmetries(box(20, 20))).toEqual([0, 1, 2, 3]);
    expect(yQuarterTurnSymmetries([...box(20, 20), 15, -4, 5])).toEqual([0]); // asymmetric detail
  });

  it('equivalent targets are the target rotated in its own frame', () => {
    const target = withTranslation(rotationY(1), [10, -24, 30]);
    const [same, half] = equivalentTargets(target, [0, 2]);
    expect(same).toEqual(target);
    expect(rotationAngleDeg(half!, withTranslation(rotationY(3), [10, -24, 30]))).toBeCloseTo(0);
    expect(half!.slice(12, 15)).toEqual([10, -24, 30]);
  });

  it('classifies rotations reachable with R (Y quarter turns) vs others', () => {
    expect(classifyRotation(rotationY(3))).toBe('Y_QUARTER_TURN');
    expect(classifyRotation([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1])).toBe('AXIS_ALIGNED_OTHER');
    const c = Math.SQRT1_2;
    expect(classifyRotation([c, 0, -c, 0, 0, 1, 0, 0, c, 0, c, 0, 0, 0, 0, 1])).toBe('ARBITRARY');
  });
});


describe('engine: equivalent rotations and orientation choices', () => {
  const text = [
    '1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat', // upright
    '1 4 100 0 0 0 0 1 0 1 0 -1 0 0 3001.dat', // upright, turned 90°
    '1 4 200 0 0 1 0 0 0 -1 0 0 0 -1 3001.dat', // upside down
    '1 4 300 0 0 0.7071 0 0.7071 0 1 0 -0.7071 0 0.7071 3001.dat', // 45°
  ].join('\n');
  const a = analyzeModel(text, 'rot.ldr');
  const base = { occurrences: a.model.occurrences, plan: a.plan };
  const sym = { ...base, symmetries: new Map([['3001.dat', [0, 2]]]) };
  const brick = { partKey: '3001.dat', colorCode: '4' };

  it('refuses a 180° turned symmetric brick without symmetry data, accepts it with', () => {
    const pose = heldPose(rotationY(0), 2, [0, 0, 0]);
    expect(tryPlace(base, createSession('freeManual'), brick, pose)).toMatchObject({ ok: false, reason: 'WRONG_ROTATION' });
    expect(tryPlace(sym, createSession('freeManual'), brick, pose)).toMatchObject({ ok: true, occurrenceId: 'rot.ldr#0' });
    // 90° is NOT a symmetry of a 2×4: still refused
    expect(tryPlace(sym, createSession('freeManual'), brick, heldPose(rotationY(0), 1, [0, 0, 0]))).toMatchObject({ ok: false, reason: 'WRONG_ROTATION' });
  });

  it('lists upright first, merges Y turns and symmetric duplicates, keeps non-axial orientations', () => {
    const choices = orientationChoices(sym, '3001.dat', '4');
    expect(choices).toHaveLength(3); // upright (incl. the 90° one), upside down, 45°
    expect(rotationAngleDeg(choices[0]!, rotationY(0))).toBeCloseTo(0);
  });

  it('every target is reachable with an orientation choice + R turns', () => {
    const choices = orientationChoices(sym, '3001.dat', '4');
    for (const o of a.model.occurrences) {
      const pos = o.targetMatrix.slice(12, 15) as [number, number, number];
      const reachable = choices.some((c) => [0, 1, 2, 3].some((q) => tryPlace(sym, createSession('freeManual'), brick, heldPose(c, q, pos)).ok));
      expect(reachable, o.occurrenceId).toBe(true);
    }
  });
});

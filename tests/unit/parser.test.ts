import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzeModel, classifyImport } from '@/domain/import/analyze';
import { expandModel } from '@/domain/ldraw/expand';
import { determinant3, translationOf } from '@/domain/ldraw/matrix';
import { parseLDraw } from '@/domain/ldraw/parser';
import { DEFAULT_LIMITS } from '@/domain/ldraw/types';

const fixture = (name: string) => readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8');
const codes = (d: readonly { code: string }[]) => d.map((x) => x.code);

describe('fixtures', () => {
  it('mini-4-pieces.mpd: 4 distinct occurrences, 2 root steps', () => {
    const a = analyzeModel(fixture('mini-4-pieces.mpd'), 'mini-4-pieces.mpd');
    expect(a.document.isMpd).toBe(true);
    expect(a.model.rootName).toBe('mini-4-pieces.mpd');
    expect(a.model.occurrences).toHaveLength(4);
    expect(new Set(a.model.occurrences.map((o) => o.occurrenceId)).size).toBe(4);
    expect(a.model.occurrences.map((o) => o.colorCode)).toEqual(['4', '1', '2', '14']);
    expect(a.model.occurrences.map((o) => translationOf(o.targetMatrix))).toEqual([[0, 0, 0], [80, 0, 0], [0, -24, 0], [80, -24, 0]]);
    expect(a.plan.kind).toBe('ROOT_STEPS');
    expect(a.plan.steps.map((s) => s.occurrenceIds.length)).toEqual([2, 2]);
    expect(a.plan.steps.every((s) => s.provenance === 'LDRAW_ROOT')).toBe(true);
    expect(a.uniqueParts).toEqual(['3001.dat']);
    expect(a.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('nested-submodel.mpd: 2 copies of a submodel give 4 unique ids and composed transforms', () => {
    const a = analyzeModel(fixture('nested-submodel.mpd'), 'nested-submodel.mpd');
    const ids = a.model.occurrences.map((o) => o.occurrenceId);
    expect(ids).toEqual([
      'nested-submodel.mpd#0/reusable-submodel.ldr#0',
      'nested-submodel.mpd#0/reusable-submodel.ldr#1',
      'nested-submodel.mpd#1/reusable-submodel.ldr#0',
      'nested-submodel.mpd#1/reusable-submodel.ldr#1',
    ]);
    expect(a.model.occurrences.map((o) => translationOf(o.targetMatrix))).toEqual([[0, 0, 0], [0, -24, 0], [100, 0, 0], [100, -24, 0]]);
    // the submodel reference uses colour 16, children keep their explicit colours
    expect(a.model.occurrences.map((o) => o.colorCode)).toEqual(['4', '1', '4', '1']);
    expect(a.model.occurrences[2]!.ancestorSubmodels).toEqual(['nested-submodel.mpd#1']);
    expect(a.model.submodelInstances).toHaveLength(2);
    expect(a.plan.kind).toBe('FLATTENED_STEPS');
    expect(a.plan.steps.map((s) => s.occurrenceIds)).toEqual([[ids[0]], [ids[1]], [ids[2]], [ids[3]]]);
    expect(a.plan.steps.every((s) => s.provenance === 'LDRAW_NESTED')).toBe(true);
  });

  it('no-steps.ldr: NO_STEPS, no invented sequence', () => {
    const a = analyzeModel(fixture('no-steps.ldr'), 'no-steps.ldr');
    expect(a.document.isMpd).toBe(false);
    expect(a.model.occurrences).toHaveLength(2);
    expect(a.plan.kind).toBe('NO_STEPS');
    expect(a.plan.steps).toEqual([]);
    expect(classifyImport(a, new Set()).quality).toBe('MANUAL_ONLY');
    expect(classifyImport(a, new Set(['3001.dat'])).quality).toBe('ANALYSABLE');
    expect(classifyImport(a, null).quality).toBe('ANALYSABLE');
  });
});

describe('steps', () => {
  it('STEP ends a step: leading/trailing/double STEP never create empty steps', () => {
    const text = ['0 STEP', '1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat', '0 STEP', '0 STEP', '1 4 0 -24 0 1 0 0 0 1 0 0 0 1 3001.dat', '0 STEP'].join('\n');
    const a = analyzeModel(text, 'x.ldr');
    expect(a.plan.steps.map((s) => s.occurrenceIds.length)).toEqual([1, 1]);
  });

  it('parts after the last STEP form a final step', () => {
    const text = ['1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat', '0 STEP', '1 4 0 -24 0 1 0 0 0 1 0 0 0 1 3001.dat'].join('\n');
    expect(analyzeModel(text, 'x.ldr').plan.steps).toHaveLength(2);
  });

  it('a single trailing STEP is not a usable sequence', () => {
    const text = ['1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat', '1 4 0 -24 0 1 0 0 0 1 0 0 0 1 3001.dat', '0 STEP'].join('\n');
    const a = analyzeModel(text, 'x.ldr');
    expect(a.plan.kind).toBe('NO_STEPS');
  });

  it('ROTSTEP counts as a step end and is reported', () => {
    const text = ['1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat', '0 ROTSTEP 0 45 0 ABS', '1 4 0 -24 0 1 0 0 0 1 0 0 0 1 3001.dat'].join('\n');
    const a = analyzeModel(text, 'x.ldr');
    expect(a.plan.steps).toHaveLength(2);
    expect(codes(a.diagnostics)).toContain('META_IGNORED');
  });
});

describe('transforms and colours', () => {
  it('composes M_parent * M_local with a non-trivial rotation', () => {
    // parent: 90° about Y + translation (100,0,0); child at local (20,-24,0)
    const text = [
      '0 FILE main.ldr',
      '1 16 100 0 0 0 0 1 0 1 0 -1 0 0 sub.ldr',
      '0 FILE sub.ldr',
      '1 4 20 -24 0 1 0 0 0 1 0 0 0 1 3001.dat',
    ].join('\n');
    const a = analyzeModel(text, 'main.mpd');
    const occ = a.model.occurrences[0]!;
    // R * (20,-24,0) = (0*20+0+1*0, -24, -1*20) -> (0,-24,-20) ; + (100,0,0)
    expect(translationOf(occ.targetMatrix)).toEqual([100, -24, -20]);
    expect(determinant3(occ.targetMatrix)).toBeCloseTo(1);
    expect(occ.rigid).toBe(true);
  });

  it('colour 16 inherits the reference colour; explicit colours win', () => {
    const text = [
      '0 FILE main.ldr',
      '1 2 0 0 0 1 0 0 0 1 0 0 0 1 sub.ldr',
      '0 FILE sub.ldr',
      '1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat',
      '1 14 0 -24 0 1 0 0 0 1 0 0 0 1 3001.dat',
    ].join('\n');
    expect(analyzeModel(text, 'm.mpd').model.occurrences.map((o) => o.colorCode)).toEqual(['2', '14']);
  });

  it('colour 16 at root level stays 16 (main colour)', () => {
    expect(analyzeModel('1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat', 'x.ldr').model.occurrences[0]!.colorCode).toBe('16');
  });

  it('flags mirrored and singular matrices', () => {
    const text = ['1 4 0 0 0 -1 0 0 0 1 0 0 0 1 3001.dat', '1 4 0 0 0 0 0 0 0 1 0 0 0 1 3001.dat'].join('\n');
    const a = analyzeModel(text, 'x.ldr');
    expect(codes(a.diagnostics)).toEqual(expect.arrayContaining(['MIRRORED_MATRIX', 'SINGULAR_MATRIX']));
    expect(a.model.occurrences.every((o) => !o.rigid)).toBe(true);
    expect(classifyImport(a, new Set()).quality).toBe('RENDERABLE');
  });
});

describe('robustness', () => {
  it('section names with spaces and different case resolve', () => {
    const text = ['0 FILE Main Model.ldr', '1 16 0 0 0 1 0 0 0 1 0 0 0 1 My Sub Part.LDR', '0 NOFILE', '0 FILE my sub part.ldr', '1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat', '0 NOFILE'].join('\r\n');
    const a = analyzeModel(text, 'x.mpd');
    expect(a.model.rootName).toBe('Main Model.ldr');
    expect(a.model.occurrences).toHaveLength(1);
    expect(a.model.occurrences[0]!.occurrenceId).toBe('Main Model.ldr#0/my sub part.ldr#0');
  });

  it('duplicate section names: first wins, warning', () => {
    const text = ['0 FILE a.ldr', '1 16 0 0 0 1 0 0 0 1 0 0 0 1 b.ldr', '0 FILE b.ldr', '1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat', '0 FILE B.LDR', '1 1 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat', '1 1 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat'].join('\n');
    const a = analyzeModel(text, 'x.mpd');
    expect(codes(a.diagnostics)).toContain('DUPLICATE_SECTION');
    expect(a.model.occurrences.map((o) => o.colorCode)).toEqual(['4']);
  });

  it('detects cycles A → B → A without hanging', () => {
    const text = ['0 FILE a.ldr', '1 16 0 0 0 1 0 0 0 1 0 0 0 1 b.ldr', '1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat', '0 FILE b.ldr', '1 16 0 0 0 1 0 0 0 1 0 0 0 1 a.ldr'].join('\n');
    const a = analyzeModel(text, 'x.mpd');
    expect(codes(a.diagnostics)).toContain('CYCLE');
    expect(a.model.occurrences).toHaveLength(1);
  });

  it('self reference is a cycle', () => {
    const a = analyzeModel(['0 FILE a.ldr', '1 16 0 0 0 1 0 0 0 1 0 0 0 1 a.ldr'].join('\n'), 'x.mpd');
    expect(codes(a.diagnostics)).toEqual(expect.arrayContaining(['CYCLE', 'NO_OCCURRENCES']));
    expect(classifyImport(a, new Set()).quality).toBe('INVALID');
  });

  it('limits submodel depth', () => {
    const lines: string[] = [];
    for (let i = 0; i < 30; i++) lines.push(`0 FILE s${i}.ldr`, `1 16 0 0 0 1 0 0 0 1 0 0 0 1 s${i + 1}.ldr`);
    lines.push('0 FILE s30.ldr', '1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat');
    const a = analyzeModel(lines.join('\n'), 'deep.mpd');
    expect(codes(a.diagnostics)).toContain('MAX_DEPTH');
    expect(a.model.occurrences).toHaveLength(0);
  });

  it('reports a missing submodel instead of treating it as a part', () => {
    const a = analyzeModel(['0 FILE a.ldr', '1 16 0 0 0 1 0 0 0 1 0 0 0 1 missing.ldr', '1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat'].join('\n'), 'x.mpd');
    expect(codes(a.diagnostics)).toContain('MISSING_SUBMODEL');
    expect(a.model.occurrences.map((o) => o.partKey)).toEqual(['3001.dat']);
  });

  it('refuses ../, absolute and drive paths', () => {
    const text = ['1 4 0 0 0 1 0 0 0 1 0 0 0 1 ../secret.dat', '1 4 0 0 0 1 0 0 0 1 0 0 0 1 /etc/passwd', '1 4 0 0 0 1 0 0 0 1 0 0 0 1 C:\\x.dat', '1 4 0 0 0 1 0 0 0 1 0 0 0 1 s\\3001s01.dat'].join('\n');
    const a = analyzeModel(text, 'x.ldr');
    expect(a.diagnostics.filter((d) => d.code === 'UNSAFE_REFERENCE')).toHaveLength(3);
    expect(a.model.occurrences.map((o) => o.partRef)).toEqual(['s/3001s01.dat']);
  });

  it('skips malformed lines, NaN/Infinity, bad colours, unknown types — never throws', () => {
    const text = [
      '1 4 0 0 0 1 0 0 0 1 0 0',
      '1 4 NaN 0 0 1 0 0 0 1 0 0 0 1 3001.dat',
      '1 4 Infinity 0 0 1 0 0 0 1 0 0 0 1 3001.dat',
      '1 4 1e999 0 0 1 0 0 0 1 0 0 0 1 3001.dat',
      '1 red 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat',
      '9 garbage',
      '\u0000\u0001 binary',
      '1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat',
    ].join('\n');
    const a = analyzeModel(text, 'x.ldr');
    expect(a.model.occurrences).toHaveLength(1);
    expect(codes(a.diagnostics)).toEqual(expect.arrayContaining(['MALFORMED_LINE', 'NON_FINITE_NUMBER', 'INVALID_COLOUR', 'UNKNOWN_LINE_TYPE']));
  });

  it('empty file is INVALID', () => {
    const a = analyzeModel('  \n\n', 'x.ldr');
    expect(codes(a.diagnostics)).toEqual(['EMPTY_FILE', 'ROOT_NOT_FOUND']);
    expect(classifyImport(a, new Set()).quality).toBe('INVALID');
  });

  it('enforces size, line and occurrence quotas', () => {
    expect(codes(parseLDraw('x'.repeat(100), 'x.ldr', { ...DEFAULT_LIMITS, maxBytes: 10 }).diagnostics)).toEqual(['FILE_TOO_LARGE']);
    expect(codes(parseLDraw('0\n0\n0', 'x.ldr', { ...DEFAULT_LIMITS, maxLines: 2 }).diagnostics)).toEqual(['TOO_MANY_LINES']);
    const many = Array.from({ length: 50 }, () => '1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat').join('\n');
    const limits = { ...DEFAULT_LIMITS, maxOccurrences: 10 };
    const model = expandModel(parseLDraw(many, 'x.ldr', limits), { limits });
    expect(model.occurrences).toHaveLength(10);
    expect(codes(model.diagnostics)).toContain('TOO_MANY_OCCURRENCES');
  });

  it('shared submodel expanded many times is bounded by the occurrence quota (no blow-up)', () => {
    // 10 levels × 10 refs would be 10^10 bricks without a quota
    const lines: string[] = [];
    for (let i = 0; i < 10; i++) {
      lines.push(`0 FILE l${i}.ldr`);
      for (let k = 0; k < 10; k++) lines.push(`1 16 ${k * 20} 0 0 1 0 0 0 1 0 0 0 1 l${i + 1}.ldr`);
    }
    lines.push('0 FILE l10.ldr', '1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat');
    const start = Date.now();
    const a = analyzeModel(lines.join('\n'), 'bomb.mpd');
    expect(a.model.occurrences).toHaveLength(DEFAULT_LIMITS.maxOccurrences);
    expect(Date.now() - start).toBeLessThan(5000);
  });

  it('lists unreferenced sections as alternative root candidates and allows choosing one', () => {
    const text = ['0 FILE main.ldr', '1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat', '0 FILE alt.ldr', '1 1 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat', '1 1 0 -24 0 1 0 0 0 1 0 0 0 1 3001.dat'].join('\n');
    const a = analyzeModel(text, 'x.mpd');
    expect(codes(a.diagnostics)).toContain('ALTERNATIVE_ROOT_CANDIDATE');
    expect(a.rootCandidates).toEqual(['main.ldr', 'alt.ldr']);
    expect(analyzeModel(text, 'x.mpd', { rootName: 'ALT.ldr' }).model.occurrences).toHaveLength(2);
  });

  it('ignores !DATA sections and content outside FILE', () => {
    const text = ['1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat', '0 FILE a.ldr', '1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat', '0 !DATA img.png', '0 !: iVBORw0KGgo='].join('\n');
    const a = analyzeModel(text, 'x.mpd');
    expect(a.model.occurrences).toHaveLength(1);
    expect(codes(a.diagnostics)).toContain('CONTENT_OUTSIDE_SECTION');
    expect(a.document.sections.map((s) => s.name)).toEqual(['a.ldr']);
  });
});

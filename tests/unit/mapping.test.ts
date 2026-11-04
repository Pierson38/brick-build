import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  activeStepIndex, candidates, createSession, isComplete, placeExact, rewindToStep, switchMode, undo, type BuildContext, type BuildSession,
} from '@/domain/build/engine';
import { PROGRESS_SCHEMA_VERSION, restoreProgress, serializeProgress } from '@/domain/build/progress';
import { analyzeModel } from '@/domain/import/analyze';
import {
  addBooklet, addStep, assignToStep, assignmentIndex, createMapping, mappingDigest, mappingToStepPlan, moveStep, parseMapping,
  parseMappingText, removeBooklet, removeStep, resolveDuplicatesKeepFirst, serializeMapping, unassignFromStep, updateStep,
  validateMapping, type InstructionMapping, type MappingTarget,
} from '@/domain/instructions/mapping';

const SHA_MODEL = 'a'.repeat(64);
const SHA_PDF_1 = 'b'.repeat(64);
const SHA_PDF_2 = 'c'.repeat(64);
const NOW = new Date('2026-11-04T10:00:00Z');

const load = (path: string) => {
  const name = path.split('/').pop()!;
  const a = analyzeModel(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'), name);
  const target: MappingTarget = { sha256: SHA_MODEL, fileName: name, rootName: a.model.rootName, occurrences: a.model.occurrences };
  return { a, target };
};

const { a: sync8, target: T8 } = load('tests/fixtures/notice-sync-8.mpd');
const id = (i: number) => `notice-sync-8.mpd#${i}`;

/** 4 booklet steps for 2 LDraw steps: 2 steps on page 2, a callout and a "2x" on page 3. */
function fullMapping(): InstructionMapping {
  let m = createMapping(T8, NOW);
  m = addBooklet(m, { label: 'Livret test', fileName: 'notice-test.pdf', sha256: SHA_PDF_1, pageCount: 3 }).mapping;
  const steps: [Partial<{ page: number; printedStep: string; callout: string; repeat: number }>, number[]][] = [
    [{ page: 2, printedStep: '1' }, [0, 1]],
    [{ page: 2, printedStep: '2', repeat: 2 }, [2, 3]],
    [{ page: 3, printedStep: '3', callout: '1' }, [4]],
    [{ page: 3, printedStep: '3' }, [5, 6, 7]],
  ];
  let last: string | null = null;
  for (const [init, occ] of steps) {
    const r = addStep(m, last, init);
    m = assignToStep(r.mapping, r.stepId, occ.map(id)).mapping;
    last = r.stepId;
  }
  return m;
}

describe('mapping validation', () => {
  it('an empty mapping is a draft: no step, nothing assigned', () => {
    const r = validateMapping(createMapping(T8, NOW), T8);
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['NO_STEPS', 'UNASSIGNED_OCCURRENCE']));
    expect(r.unassigned).toHaveLength(8);
  });

  it('a complete mapping is valid: every occurrence exactly once', () => {
    const r = validateMapping(fullMapping(), T8);
    expect(r.ok).toBe(true);
    expect(r.assigned).toBe(8);
    expect(r.unassigned).toEqual([]);
    expect(r.duplicates.size).toBe(0);
    expect(r.issues.map((i) => i.code)).toEqual(['NOT_VERIFIED']);
  });

  it('reports unassigned occurrences (incomplete coverage) and blocks activation', () => {
    const m = fullMapping();
    const r = validateMapping(unassignFromStep(m, m.steps[3]!.id, [id(7)]), T8);
    expect(r.ok).toBe(false);
    expect(r.unassigned).toEqual([id(7)]);
  });

  it('reports duplicates, inside a step and across steps', () => {
    const m = fullMapping();
    const twice = { ...m, steps: m.steps.map((s, i) => (i === 3 ? { ...s, occurrenceIds: [...s.occurrenceIds, id(0), id(5)] } : s)) };
    const r = validateMapping(twice, T8);
    expect(r.ok).toBe(false);
    expect([...r.duplicates.keys()].sort()).toEqual([id(0), id(5)]);
    expect(r.duplicates.get(id(0))).toEqual([m.steps[0]!.id, m.steps[3]!.id]);
    const fixed = resolveDuplicatesKeepFirst(twice);
    expect(validateMapping(fixed, T8).ok).toBe(true);
    expect(fixed.steps[0]!.occurrenceIds).toContain(id(0));
  });

  it('refuses another model, another main model or another occurrence count', () => {
    const m = fullMapping();
    expect(validateMapping(m, { ...T8, sha256: 'f'.repeat(64) }).issues[0]!.code).toBe('MODEL_MISMATCH');
    expect(validateMapping(m, { ...T8, rootName: 'other.ldr' }).issues[0]!.code).toBe('MODEL_MISMATCH');
    expect(validateMapping({ ...m, model: { ...m.model, occurrenceCount: 9 } }, T8).issues[0]!.code).toBe('MODEL_MISMATCH');
  });

  it('refuses unknown occurrences, unknown or unbound booklets and pages out of range', () => {
    const m = fullMapping();
    const s0 = m.steps[0]!;
    const unknownOcc = { ...m, steps: [{ ...s0, occurrenceIds: [...s0.occurrenceIds, 'ghost.ldr#9'] }, ...m.steps.slice(1)] };
    expect(validateMapping(unknownOcc, T8).issues.map((i) => i.code)).toContain('UNKNOWN_OCCURRENCE');
    expect(validateMapping(updateStep(m, s0.id, { bookletId: 'zz' }), T8).issues.map((i) => i.code)).toContain('UNKNOWN_BOOKLET');
    expect(validateMapping(updateStep(m, s0.id, { page: 4 }), T8).issues.map((i) => i.code)).toContain('PAGE_OUT_OF_RANGE');
    const unbound = { ...m, booklets: m.booklets.map((b) => ({ ...b, sha256: null })) };
    expect(validateMapping(unbound, T8).issues.map((i) => i.code)).toContain('BOOKLET_UNBOUND');
  });

  it('warns (without blocking) on backwards pages, repeated labels, empty steps and wrong multipliers', () => {
    let m = fullMapping();
    m = updateStep(m, m.steps[1]!.id, { page: 1 }); // after a page-2 step
    m = updateStep(m, m.steps[3]!.id, { callout: '1' }); // same label as step 3 callout 1, same page
    m = updateStep(m, m.steps[1]!.id, { repeat: 3 }); // 2 occurrences, "3x"
    m = addStep(m, m.steps[3]!.id, { page: 3, printedStep: '4' }).mapping; // empty
    const r = validateMapping(m, T8);
    expect(r.ok).toBe(true);
    expect(r.issues.filter((i) => i.severity === 'warning').map((i) => i.code).sort()).toEqual(['DUPLICATE_LABEL', 'EMPTY_STEP', 'PAGE_ORDER', 'REPEAT_MISMATCH']);
  });

  it('several booklets: one sequence, ordered by booklet then page', () => {
    let m = fullMapping();
    const b2 = addBooklet(m, { label: 'Livret 2', fileName: 'b2.pdf', sha256: SHA_PDF_2, pageCount: 5 });
    m = updateStep(b2.mapping, b2.mapping.steps[3]!.id, { bookletId: b2.bookletId, page: 1 });
    expect(validateMapping(m, T8).issues.filter((i) => i.severity !== 'info')).toEqual([]);
    // booklet 2 before booklet 1 in the sequence: warned
    const back = moveStep(moveStep(moveStep(m, m.steps[3]!.id, -1), m.steps[3]!.id, -1), m.steps[3]!.id, -1);
    expect(validateMapping(back, T8).issues.map((i) => i.code)).toContain('PAGE_ORDER');
  });

  it('nested submodels: mapping works on final brick occurrences, each copy separately', () => {
    const { a, target } = load('fixtures/nested-submodel.mpd');
    let m = addBooklet(createMapping(target, NOW), { label: 'L', fileName: 'l.pdf', sha256: SHA_PDF_1, pageCount: 2 }).mapping;
    const ids = a.model.occurrences.map((o) => o.occurrenceId);
    expect(new Set(ids).size).toBe(4);
    const s1 = addStep(m, null, { page: 1, printedStep: '1', repeat: 2 });
    m = assignToStep(s1.mapping, s1.stepId, ids.filter((x) => x.endsWith('#0'))).mapping; // the two bottom bricks
    const s2 = addStep(m, s1.stepId, { page: 2 });
    m = assignToStep(s2.mapping, s2.stepId, ids.filter((x) => x.endsWith('#1'))).mapping;
    const r = validateMapping(m, target);
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => i.code)).not.toContain('REPEAT_MISMATCH');
  });
});

describe('mapping editing never creates silent duplicates', () => {
  it('assigning an occurrence owned by another step is refused unless moved explicitly', () => {
    const m = fullMapping();
    const r = assignToStep(m, m.steps[3]!.id, [id(0), id(0)]);
    expect(r.added).toEqual([]);
    expect(r.alreadyElsewhere).toEqual([id(0)]);
    expect(r.mapping).toBe(m);
    const moved = assignToStep(m, m.steps[3]!.id, [id(0)], { move: true });
    expect(moved.added).toEqual([id(0)]);
    expect(assignmentIndex(moved.mapping).get(id(0))).toEqual([m.steps[3]!.id]);
    expect(validateMapping(moved.mapping, T8).ok).toBe(true);
  });

  it('a new step is inserted after the current one, with the next printed number on the same page', () => {
    const m = fullMapping();
    const r = addStep(m, m.steps[0]!.id);
    expect(r.mapping.steps.map((s) => s.id)).toEqual([m.steps[0]!.id, r.stepId, ...m.steps.slice(1).map((s) => s.id)]);
    const created = r.mapping.steps[1]!;
    expect(created).toMatchObject({ page: 2, printedStep: '2', occurrenceIds: [], provenance: 'manual' });
    // after a callout, the main step keeps its number
    expect(addStep(m, m.steps[2]!.id).mapping.steps[3]!.printedStep).toBe('3');
  });

  it('changing the page or the pieces of a verified step clears its verification', () => {
    let m = fullMapping();
    m = updateStep(m, m.steps[0]!.id, { provenance: 'verified' });
    expect(m.steps[0]!.provenance).toBe('verified');
    expect(updateStep(m, m.steps[0]!.id, { page: 3 }).steps[0]!.provenance).toBe('manual');
    expect(unassignFromStep(m, m.steps[0]!.id, [id(0)]).steps[0]!.provenance).toBe('manual');
  });

  it('a booklet still used by a step cannot be removed; steps can', () => {
    const m = fullMapping();
    expect(removeBooklet(m, m.booklets[0]!.id)).toBeNull();
    const empty = m.steps.reduce((acc, s) => removeStep(acc, s.id), m);
    expect(removeBooklet(empty, m.booklets[0]!.id)!.booklets).toEqual([]);
  });
});

describe('mapping file (export / re-import, untrusted input)', () => {
  it('round-trips exactly', () => {
    const m = fullMapping();
    const r = parseMappingText(serializeMapping(m));
    expect(r).toEqual({ ok: true, mapping: m });
  });

  it('rejects malformed, foreign, oversized or out-of-bounds content', () => {
    const good = JSON.parse(serializeMapping(fullMapping())) as Record<string, unknown> & { steps: Record<string, unknown>[]; model: Record<string, unknown> };
    const bad = (patch: (g: typeof good) => unknown) => parseMapping(patch(structuredClone(good)));
    expect(parseMappingText('{ not json').ok).toBe(false);
    expect(parseMappingText(' '.repeat(1024 * 1024 + 1)).ok).toBe(false);
    expect(bad((g) => ({ ...g, format: 'something-else' })).ok).toBe(false);
    expect(bad((g) => ({ ...g, schemaVersion: 2 })).ok).toBe(false);
    expect(bad((g) => ({ ...g, model: { ...g.model, sha256: 'XYZ' } })).ok).toBe(false);
    expect(bad((g) => { g.steps[0]!.page = 0; return g; }).ok).toBe(false);
    expect(bad((g) => { g.steps[0]!.page = 2.5; return g; }).ok).toBe(false);
    expect(bad((g) => { g.steps[0]!.id = '../etc'; return g; }).ok).toBe(false);
    expect(bad((g) => { g.steps[0]!.occurrenceIds = [42]; return g; }).ok).toBe(false);
    expect(bad((g) => { g.steps[0]!.occurrenceIds = ['x'.repeat(513)]; return g; }).ok).toBe(false);
    expect(bad((g) => { g.steps[0]!.provenance = 'ocr'; return g; }).ok).toBe(false);
    expect(bad((g) => ({ ...g, steps: Array.from({ length: 5001 }, () => g.steps[0]) })).ok).toBe(false);
    expect(bad((g) => { g.steps[0]!.occurrenceIds = Array.from({ length: 20_001 }, (_, i) => `x#${i}`); return g; }).ok).toBe(false);
  });

  it('keeps only known fields (no prototype pollution, no smuggled data)', () => {
    const raw = JSON.parse(serializeMapping(fullMapping())) as Record<string, unknown> & { steps: Record<string, unknown>[] };
    const text = JSON.stringify({ ...raw, extra: 'x', steps: raw.steps.map((s) => ({ ...s, pdfText: 'copied text' })) }).replace('"extra":"x"', '"__proto__":{"polluted":true}');
    const r = parseMappingText(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.keys(r.mapping).sort()).toEqual(['booklets', 'format', 'model', 'provenance', 'schemaVersion', 'steps']);
    expect(Object.keys(r.mapping.steps[0]!)).not.toContain('pdfText');
  });

  it('a re-imported file is checked against the model again (warnings recomputed, not trusted)', () => {
    const m = fullMapping();
    const r = parseMappingText(serializeMapping(m));
    if (!r.ok) throw new Error('parse');
    expect(validateMapping(r.mapping, { ...T8, sha256: 'd'.repeat(64) }).ok).toBe(false);
  });
});

describe('synchronised build (engine with the booklet plan)', () => {
  const m = fullMapping();
  const plan = mappingToStepPlan(m);
  const ctx: BuildContext = { occurrences: sync8.model.occurrences, plan };
  const placeAll = (s: BuildSession, ids: readonly string[]) => ids.reduce((acc, x) => {
    const r = placeExact(ctx, acc, x);
    if (!r.ok) throw new Error(`${x}: ${r.reason}`);
    return r.session;
  }, s);

  it('the plan follows the booklet: 4 steps, page and position on the page', () => {
    expect(plan.kind).toBe('INSTRUCTION_STEPS');
    expect(plan.steps.map((s) => s.instruction && [s.instruction.label, s.instruction.page, s.instruction.positionOnPage, s.instruction.stepsOnPage])).toEqual([
      ['Étape 1', 2, 1, 2],
      ['Étape 2 (×2)', 2, 2, 2],
      // a callout belongs to its printed step: page 3 holds one printed step
      ['Étape 3 · encadré 1', 3, 1, 1],
      ['Étape 3', 3, 1, 1],
    ]);
    expect(plan.steps.every((s) => s.provenance === 'USER_EDITED')).toBe(true);
  });

  it('empty steps are left out of the played plan', () => {
    const withEmpty = addStep(m, m.steps[0]!.id, { page: 2, printedStep: '1b' }).mapping;
    expect(mappingToStepPlan(withEmpty).steps).toHaveLength(4);
  });

  it('only the bricks of the active booklet step are offered, and it advances when the step is done', () => {
    let s = createSession('synced');
    expect(activeStepIndex(ctx, s)).toBe(0);
    expect(candidates(ctx, s).map((o) => o.occurrenceId)).toEqual([id(0), id(1)]);
    expect(placeExact(ctx, s, id(2))).toMatchObject({ ok: false, reason: 'NOT_A_CANDIDATE' });
    s = placeAll(s, [id(0)]);
    expect(activeStepIndex(ctx, s)).toBe(0);
    s = placeAll(s, [id(1)]);
    expect(activeStepIndex(ctx, s)).toBe(1);
    s = placeAll(s, [id(2), id(3), id(4)]);
    expect(activeStepIndex(ctx, s)).toBe(3);
    expect(candidates(ctx, s).map((o) => o.occurrenceId)).toEqual([id(5), id(6), id(7)]);
    s = placeAll(s, [id(5), id(6), id(7)]);
    expect(isComplete(ctx, s)).toBe(true);
    expect(activeStepIndex(ctx, s)).toBe(-1);
  });

  it('going back never corrupts the progression: undo, rewind, mode switch', () => {
    let s = placeAll(createSession('synced'), [id(0), id(1), id(2), id(3)]);
    expect(activeStepIndex(ctx, s)).toBe(2);
    // undo crosses the step boundary: step 2 (×2) is open again
    s = undo(s);
    expect(activeStepIndex(ctx, s)).toBe(1);
    expect(candidates(ctx, s).map((o) => o.occurrenceId)).toEqual([id(3)]);
    s = placeAll(s, [id(3), id(4)]);
    // start again from step 2: steps 2..4 emptied, step 1 kept
    const rewound = rewindToStep(ctx, s, 1);
    expect(rewound.placed).toEqual([id(0), id(1)]);
    expect(activeStepIndex(ctx, rewound)).toBe(1);
    // switching mode keeps the bricks; the active step is recomputed for the new plan
    const free = switchMode(s, 'freeManual');
    expect(free.placed).toEqual(s.placed);
    expect(activeStepIndex(ctx, free)).toBe(-1);
    const ldrawCtx: BuildContext = { occurrences: sync8.model.occurrences, plan: sync8.plan };
    expect(activeStepIndex(ldrawCtx, switchMode(s, 'guided'))).toBe(1); // LDraw step 2 (5 of 8 placed)
  });

  it('progress v2 stores the synced mode, the booklet and the mapping fingerprint', () => {
    const s = placeAll(createSession('synced'), [id(0), id(1)]);
    const digest = mappingDigest(m);
    const saved = JSON.parse(JSON.stringify(serializeProgress(SHA_MODEL, 'x', s, 8, { page: 2, bookletSha256: SHA_PDF_1 }, digest, NOW)));
    expect(saved.schemaVersion).toBe(PROGRESS_SCHEMA_VERSION);
    expect(restoreProgress(saved, SHA_MODEL, sync8.model.occurrences)).toEqual({ ok: true, session: s, lastPdfPage: 2, lastBookletSha256: SHA_PDF_1, mappingDigest: digest });
    // P5 progress (v1) is still restored; a v1 file cannot claim the synced mode
    const v1 = { ...saved, schemaVersion: 1, buildMode: 'guided' };
    delete v1.mappingDigest;
    expect(restoreProgress(v1, SHA_MODEL, sync8.model.occurrences)).toMatchObject({ ok: true, session: { mode: 'guided' } });
    expect(restoreProgress({ ...saved, schemaVersion: 1 }, SHA_MODEL, sync8.model.occurrences)).toEqual({ ok: false, reason: 'MALFORMED' });
    expect(restoreProgress({ ...saved, mappingDigest: 'not-hex!' }, SHA_MODEL, sync8.model.occurrences)).not.toHaveProperty('mappingDigest');
  });

  it('the mapping fingerprint changes with the assignments or the order, not with labels', () => {
    const d = mappingDigest(m);
    expect(mappingDigest(updateStep(m, m.steps[0]!.id, { note: 'n' }))).toBe(d);
    expect(mappingDigest(moveStep(m, m.steps[1]!.id, -1))).not.toBe(d);
    expect(mappingDigest(unassignFromStep(m, m.steps[0]!.id, [id(0)]))).not.toBe(d);
  });
});

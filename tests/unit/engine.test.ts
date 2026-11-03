import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  activeStepIndex, availableModes, candidates, createSession, isComplete, placeExact,
  resetActiveStep, tray, tryPlace, undo, type BuildContext,
} from '@/domain/build/engine';
import { restoreProgress, serializeProgress } from '@/domain/build/progress';
import { analyzeModel, sha256Hex } from '@/domain/import/analyze';
import { multiply, rotationY, withTranslation } from '@/domain/ldraw/matrix';
import type { Matrix4Tuple } from '@/domain/ldraw/types';

const fixture = (name: string) => readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8');
const ctxOf = (name: string): BuildContext => {
  const a = analyzeModel(fixture(name), name);
  return { occurrences: a.model.occurrences, plan: a.plan };
};
const at = (x: number, y: number, z: number, quarterTurns = 0): Matrix4Tuple => withTranslation(rotationY(quarterTurns), [x, y, z]);
const brick = (colorCode: string) => ({ partKey: '3001.dat', colorCode });

describe('guided mode (mini-4-pieces)', () => {
  const ctx = ctxOf('mini-4-pieces.mpd');

  it('only offers bricks of the active step', () => {
    const s = createSession('guided');
    expect(activeStepIndex(ctx, s)).toBe(0);
    expect(candidates(ctx, s).map((o) => o.colorCode)).toEqual(['4', '1']);
    expect(tray(ctx, s).map((t) => t.colorCode)).toEqual(['4', '1']);
  });

  it('refuses a brick of a later step, then accepts it once the step is done', () => {
    let s = createSession('guided');
    expect(tryPlace(ctx, s, brick('2'), at(0, -24, 0))).toMatchObject({ ok: false, reason: 'NO_COMPATIBLE_TARGET' });
    for (const [c, x] of [['4', 0], ['1', 80]] as const) {
      const r = tryPlace(ctx, s, brick(c), at(x + 3, 0, -2));
      expect(r.ok).toBe(true);
      if (r.ok) s = r.session;
    }
    expect(activeStepIndex(ctx, s)).toBe(1);
    const r = tryPlace(ctx, s, brick('2'), at(0, -24, 0));
    expect(r.ok).toBe(true);
  });

  it('wrong place does not validate; wrong rotation is reported', () => {
    const s = createSession('guided');
    expect(tryPlace(ctx, s, brick('4'), at(40, 0, 0))).toMatchObject({ ok: false, reason: 'TOO_FAR' });
    expect(tryPlace(ctx, s, brick('4'), at(0, 0, 0, 1))).toMatchObject({ ok: false, reason: 'WRONG_ROTATION' });
    expect(tryPlace(ctx, s, brick('4'), at(0, 0, 0, 2))).toMatchObject({ ok: false, reason: 'WRONG_ROTATION' });
  });

  it('tolerance boundary: 10 LDU accepted, 11 refused', () => {
    const s = createSession('guided');
    expect(tryPlace(ctx, s, brick('4'), at(10, 0, 0)).ok).toBe(true);
    expect(tryPlace(ctx, s, brick('4'), at(11, 0, 0)).ok).toBe(false);
  });

  it('a placed brick cannot be placed twice', () => {
    let s = createSession('guided');
    const r = tryPlace(ctx, s, brick('4'), at(0, 0, 0));
    if (!r.ok) throw new Error('expected success');
    s = r.session;
    expect(tryPlace(ctx, s, brick('4'), at(0, 0, 0))).toMatchObject({ ok: false, reason: 'NO_COMPATIBLE_TARGET' });
    expect(placeExact(ctx, s, r.occurrenceId)).toMatchObject({ ok: false, reason: 'NOT_A_CANDIDATE' });
  });

  it('completes 4/4 without a phantom step; undo removes exactly the last one', () => {
    let s = createSession('guided');
    for (let i = 0; i < 4; i++) {
      const next = candidates(ctx, s)[0]!;
      const r = placeExact(ctx, s, next.occurrenceId);
      if (!r.ok) throw new Error('expected success');
      s = r.session;
    }
    expect(isComplete(ctx, s)).toBe(true);
    expect(activeStepIndex(ctx, s)).toBe(-1);
    expect(candidates(ctx, s)).toEqual([]);
    expect(tryPlace(ctx, s, brick('4'), at(0, 0, 0))).toMatchObject({ ok: false, reason: 'COMPLETE' });
    const last = s.placed.at(-1);
    const u = undo(s);
    expect(u.placed).toHaveLength(3);
    expect(u.placed).not.toContain(last);
    expect(activeStepIndex(ctx, u)).toBe(1);
  });

  it('resetActiveStep removes only bricks of the active step', () => {
    let s = createSession('guided');
    for (const id of [ctx.plan.steps[0]!.occurrenceIds[0]!, ctx.plan.steps[0]!.occurrenceIds[1]!, ctx.plan.steps[1]!.occurrenceIds[0]!]) {
      const r = placeExact(ctx, s, id);
      if (!r.ok) throw new Error('expected success');
      s = r.session;
    }
    expect(resetActiveStep(ctx, s).placed).toEqual(s.placed.slice(0, 2));
  });
});

describe('free manual mode', () => {
  it('no-steps.ldr: only free mode is offered; both bricks in any order', () => {
    const ctx = ctxOf('no-steps.ldr');
    expect(availableModes(ctx.plan)).toEqual(['freeManual']);
    let s = createSession('freeManual');
    expect(activeStepIndex(ctx, s)).toBe(-1);
    for (const [c, x] of [['1', 80], ['4', 0]] as const) {
      const r = tryPlace(ctx, s, brick(c), at(x, 0, 0));
      expect(r.ok).toBe(true);
      if (r.ok) s = r.session;
    }
    expect(isComplete(ctx, s)).toBe(true);
  });

  it('identical bricks: one placement does not exhaust the stock, nearest free target is assigned', () => {
    const text = ['1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat', '1 4 80 0 0 1 0 0 0 1 0 0 0 1 3001.dat', '1 4 160 0 0 1 0 0 0 1 0 0 0 1 3001.dat'].join('\n');
    const a = analyzeModel(text, 'same.ldr');
    const ctx = { occurrences: a.model.occurrences, plan: a.plan };
    let s = createSession('freeManual');
    expect(tray(ctx, s)).toMatchObject([{ remaining: 3, total: 3 }]);
    const r1 = tryPlace(ctx, s, brick('4'), at(82, 0, 0));
    if (!r1.ok) throw new Error('expected success');
    expect(r1.occurrenceId).toBe('same.ldr#1');
    s = r1.session;
    expect(tray(ctx, s)).toMatchObject([{ remaining: 2, total: 3 }]);
    // same spot again: the occupied target is no longer available
    expect(tryPlace(ctx, s, brick('4'), at(82, 0, 0))).toMatchObject({ ok: false, reason: 'TOO_FAR' });
  });

  it('ambiguous drop between two equidistant targets is refused', () => {
    const text = ['1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat', '1 4 10 0 0 1 0 0 0 1 0 0 0 1 3001.dat'].join('\n');
    const a = analyzeModel(text, 'amb.ldr');
    const r = tryPlace({ occurrences: a.model.occurrences, plan: a.plan }, createSession('freeManual'), brick('4'), at(5, 0, 0));
    expect(r).toMatchObject({ ok: false, reason: 'AMBIGUOUS' });
  });

  it('nested: snapping works in the global frame of a rotated submodel', () => {
    const text = ['0 FILE m.ldr', '1 16 100 0 0 0 0 1 0 1 0 -1 0 0 s.ldr', '0 FILE s.ldr', '1 4 20 -24 0 1 0 0 0 1 0 0 0 1 3001.dat'].join('\n');
    const a = analyzeModel(text, 'm.mpd');
    const ctx = { occurrences: a.model.occurrences, plan: a.plan };
    const target = a.model.occurrences[0]!.targetMatrix;
    expect(tryPlace(ctx, createSession('freeManual'), brick('4'), target).ok).toBe(true);
    // same position, unrotated brick: rejected on rotation
    expect(tryPlace(ctx, createSession('freeManual'), brick('4'), at(100, -24, -20))).toMatchObject({ ok: false, reason: 'WRONG_ROTATION' });
    // rotating the held brick by one quarter turn matches
    const turned = withTranslation(multiply(rotationY(1), at(0, 0, 0)), [100, -24, -20]);
    expect(tryPlace(ctx, createSession('freeManual'), brick('4'), turned).ok).toBe(true);
  });
});

describe('progress persistence', () => {
  it('round-trips and refuses another model', async () => {
    const ctx = ctxOf('mini-4-pieces.mpd');
    const hash = await sha256Hex(new TextEncoder().encode(fixture('mini-4-pieces.mpd')));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    const r = placeExact(ctx, createSession('guided'), ctx.plan.steps[0]!.occurrenceIds[1]!);
    if (!r.ok) throw new Error('expected success');
    const saved = JSON.parse(JSON.stringify(serializeProgress(hash, 'mini', r.session, 4, 3)));
    expect(restoreProgress(saved, hash, ctx.occurrences)).toEqual({ ok: true, session: r.session, lastPdfPage: 3 });
    expect(restoreProgress(saved, 'other', ctx.occurrences)).toEqual({ ok: false, reason: 'HASH_MISMATCH' });
    expect(restoreProgress({ ...saved, schemaVersion: 99 }, hash, ctx.occurrences)).toEqual({ ok: false, reason: 'SCHEMA' });
    expect(restoreProgress({ ...saved, placedOccurrenceIds: ['nope'] }, hash, ctx.occurrences)).toEqual({ ok: false, reason: 'UNKNOWN_OCCURRENCE' });
    expect(restoreProgress({ ...saved, placedOccurrenceIds: [saved.placedOccurrenceIds[0], saved.placedOccurrenceIds[0]] }, hash, ctx.occurrences)).toEqual({ ok: false, reason: 'MALFORMED' });
    expect(restoreProgress('garbage', hash, ctx.occurrences)).toEqual({ ok: false, reason: 'MALFORMED' });
  });
});

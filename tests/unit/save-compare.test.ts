import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { serializeProgress } from '@/domain/build/progress';
import { analyzeModel } from '@/domain/import/analyze';
import { compareSaves, decideOnOpen, saveSignature, summarise, type SaveSummary } from '@/domain/library/save-compare';

const MODEL = 'a'.repeat(64);
const BOOKLET = 'b'.repeat(64);
const a = analyzeModel(readFileSync(new URL('../fixtures/notice-sync-8.mpd', import.meta.url), 'utf8'), 'notice-sync-8.mpd');
const occ = a.model.occurrences;
const id = (i: number) => `notice-sync-8.mpd#${i}`;

function save(placed: number[], opts: { mode?: 'guided' | 'freeManual' | 'synced'; page?: number; booklet?: string; digest?: string; at?: string } = {}): SaveSummary {
  const raw = serializeProgress(MODEL, 'notice-sync-8.mpd', { mode: opts.mode ?? 'guided', placed: placed.map(id) }, 8,
    { ...(opts.page !== undefined ? { page: opts.page } : {}), ...(opts.booklet !== undefined ? { bookletSha256: opts.booklet } : {}) },
    opts.digest, new Date(opts.at ?? '2026-11-05T10:00:00Z'));
  return summarise(raw, MODEL, occ)!;
}

describe('library vs browser save', () => {
  it('identical content is not a conflict, whatever the dates and the placement order', () => {
    const lib = save([0, 1, 2], { page: 2, at: '2026-11-05T12:00:00Z' });
    expect(decideOnOpen(lib, save([2, 0, 1], { page: 2, at: '2026-11-03T08:00:00Z' }), null)).toEqual({ kind: 'same' });
  });

  it('an OLDER browser save that differs is still offered (12 pieces in the library, 3 in the browser)', () => {
    const lib = save([0, 1, 2, 3, 4, 5, 6, 7].slice(0, 6), { at: '2026-11-05T16:22:00Z' });
    const old = save([0, 1, 7], { at: '2026-11-04T20:00:00Z' });
    const d = decideOnOpen(lib, old, null);
    expect(d.kind).toBe('ask');
    if (d.kind !== 'ask') return;
    expect(d.diff.newer).toBe('library');
    expect(d.diff.keys).toEqual(['placed']);
    expect(d.diff.onlyInLibrary).toEqual([id(2), id(3), id(4), id(5)]);
    expect(d.diff.onlyInBrowser).toEqual([id(7)]);
  });

  it('a newer browser save that differs is offered too (no automatic choice by date)', () => {
    const d = decideOnOpen(save([0], { at: '2026-11-04T00:00:00Z' }), save([0, 1], { at: '2026-11-05T00:00:00Z' }), null);
    expect(d).toMatchObject({ kind: 'ask', diff: { newer: 'browser', keys: ['placed'] } });
  });

  it.each([
    ['mode', save([0, 1], { mode: 'guided' }), save([0, 1], { mode: 'freeManual' })],
    ['page', save([0, 1], { page: 2 }), save([0, 1], { page: 3 })],
    ['booklet', save([0, 1], { page: 2, booklet: BOOKLET }), save([0, 1], { page: 2 })],
    ['mapping', save([0, 1], { mode: 'synced', digest: '0000aaaa' }), save([0, 1], { mode: 'synced', digest: '1111bbbb' })],
  ] as const)('a difference of %s alone is shown and asked', (key, lib, nav) => {
    expect(compareSaves(lib, nav).keys).toEqual([key]);
    expect(decideOnOpen(lib, nav, null).kind).toBe('ask');
  });

  it('several differences are all reported', () => {
    const lib = save([0, 1, 2], { mode: 'synced', page: 4, booklet: BOOKLET, digest: '0000aaaa' });
    const nav = save([0], { mode: 'freeManual', page: 2 });
    expect(compareSaves(lib, nav).keys).toEqual(['mode', 'placed', 'page', 'booklet', 'mapping']);
  });

  it('no library save: taken over (nothing to overwrite); a library save that no longer fits: asked, never replaced silently', () => {
    const nav = save([0, 1]);
    expect(decideOnOpen('absent', nav, null)).toEqual({ kind: 'migrate', browser: nav });
    expect(decideOnOpen('invalid', nav, null)).toEqual({ kind: 'ask-invalid', browser: nav });
    expect(decideOnOpen(save([0]), null, null)).toEqual({ kind: 'none' });
  });

  it('a browser save of another model, or with unknown bricks, is ignored', () => {
    const other = serializeProgress('c'.repeat(64), 'x.mpd', { mode: 'guided', placed: [id(0)] }, 8);
    expect(summarise(other, MODEL, occ)).toBeNull();
    const unknown = serializeProgress(MODEL, 'x.mpd', { mode: 'guided', placed: ['nope#1'] }, 8);
    expect(summarise(unknown, MODEL, occ)).toBeNull();
    expect(summarise({ schemaVersion: 1, modelContentHash: MODEL, buildMode: 'synced', placedOccurrenceIds: [] }, MODEL, occ)).toBeNull();
  });

  it('"keep the library" is remembered for that exact browser save only', () => {
    const lib = save([0, 1, 2, 3]);
    const nav = save([0]);
    expect(decideOnOpen(lib, nav, saveSignature(nav)).kind).toBe('kept');
    // the browser save changed since (played again in standalone mode): asked again
    expect(decideOnOpen(lib, save([0, 5]), saveSignature(nav)).kind).toBe('ask');
  });
});

import { describe, expect, it } from 'vitest';
import { compatibility, mappingState } from '@/domain/library/compatibility';
import type { MappingMatch, PreparedMapping, PreparedRoot } from '@/domain/library/import-types';
import { parseSetNumber, sameSetNumber, setNumberInName } from '@/domain/library/set-number';

describe('set numbers (P8)', () => {
  it.each([
    ['31040', '31040-1', true], ['31040-1', '31040-1', false], [' 31040 - 2 ', '31040-2', false], ['31153—1', '31153-1', false], ['TRU05', 'tru05-1', true],
  ])('reads %j as %s', (input, canonical, presumed) => {
    const r = parseSetNumber(input);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ canonical, variantPresumed: presumed });
  });
  it.each(['', '   ', '31040-0', '31040-1-2', '../31040', '31040;rm', 'a', '<script>', '3104000000000000000', '31040-1234'])('refuses %j', (input) => {
    expect(parseSetNumber(input).ok).toBe(false);
  });
  it('never confuses variants', () => {
    expect(sameSetNumber('31040', '31040-1')).toBe(true);
    expect(sameSetNumber('31040', '31040-2')).toBe(false);
    expect(sameSetNumber('31040-1', '31040-2')).toBe(false);
    expect(sameSetNumber('31040-1', '31041-1')).toBe(false);
  });
  it('finds the number at the start of a file name only', () => {
    expect(setNumberInName('31040-1_Dune-Buggy.mpd')?.canonical).toBe('31040-1');
    expect(setNumberInName('31009-1 - Small Cottage.mpd')?.canonical).toBe('31009-1');
    expect(setNumberInName('31040-1_notice_6145903.pdf')?.canonical).toBe('31040-1');
    expect(setNumberInName('notice 31040.pdf')).toBeNull();
    expect(setNumberInName('6145903.pdf')?.canonical).toBe('6145903-1'); // a LEGO booklet id looks like a number: only used as a hint
  });
});

const root = (over: Partial<PreparedRoot> = {}): PreparedRoot => ({
  rootName: 'main.ldr', role: 'main', occurrenceCount: 8, uniqueParts: 1, colours: 3, submodels: 0, planKind: 'ROOT_STEPS', stepCount: 2, errors: 0, warnings: 0, diagnostics: [],
  missingParts: { checked: true, refs: [], occurrences: 0 }, inventory: { verdict: 'NOT_VERIFIED', message: '' }, existingBuild: null, ...over,
});
const mappingFile = (over: Partial<PreparedMapping> = {}): PreparedMapping => ({
  ref: { origin: 'staged', sha256: 'f'.repeat(64) }, sha256: 'f'.repeat(64), name: 'm.json', size: 1, inLibrary: false, provenance: { source: 'upload' },
  modelSha256: 'a'.repeat(64), modelFileName: 'm.mpd', rootName: 'main.ldr', occurrenceCount: 8, steps: 4, verified: 4, bookletSha256s: ['b'.repeat(64)], bookletCount: 1, ...over,
});
const match = (over: Partial<MappingMatch> = {}): MappingMatch => ({ mappingSha256: 'f'.repeat(64), modelSha256: 'a'.repeat(64), rootName: 'main.ldr', structuralOk: true, firstError: null, assigned: 8, total: 8, ...over });

describe('compatibility sheet (P8)', () => {
  it('model with LDraw steps: guided + free, no synchronised mode without a mapping, even with a PDF', () => {
    const s = compatibility({ root: root(), bookletSha256s: ['b'.repeat(64)], mapping: null });
    expect(s.modes).toEqual(['guided', 'freeManual']);
    expect(s.headline).toBe('Modèle prêt pour le montage guidé.');
    expect(s.lines.map((l) => l.text).join('\n')).toContain('Notice synchronisée indisponible : aucune correspondance validée.');
    expect(s.lines.map((l) => l.text).join('\n')).toContain('Montage libre avec notice');
  });
  it('model without steps: free building only', () => {
    const s = compatibility({ root: root({ planKind: 'NO_STEPS', stepCount: 0 }), bookletSha256s: [], mapping: null });
    expect(s.modes).toEqual(['freeManual']);
    expect(s.headline).toBe('Montage libre disponible.');
  });
  it('valid mapping AND its booklet selected: synchronised mode', () => {
    const s = compatibility({ root: root(), bookletSha256s: ['b'.repeat(64)], mapping: { file: mappingFile(), match: match() } });
    expect(s.modes).toEqual(['synced', 'guided', 'freeManual']);
    expect(s.mapping).toBe('valid');
  });
  it('a valid mapping whose booklet is not selected, or a draft one, never enables the synchronised mode', () => {
    expect(compatibility({ root: root(), bookletSha256s: [], mapping: { file: mappingFile(), match: match() } }).modes).not.toContain('synced');
    const draft = { root: root(), bookletSha256s: ['b'.repeat(64)], mapping: { file: mappingFile(), match: match({ structuralOk: false, firstError: '3 pièce(s) du modèle non affectée(s) à une étape.' }) } };
    expect(mappingState(draft)).toEqual({ state: 'incomplete', reason: '3 pièce(s) du modèle non affectée(s) à une étape.' });
    expect(compatibility(draft).modes).not.toContain('synced');
    const unbound = { root: root(), bookletSha256s: ['b'.repeat(64)], mapping: { file: mappingFile({ bookletSha256s: [], bookletCount: 1 }), match: match() } };
    expect(mappingState(unbound).state).toBe('incomplete');
    // a mapping of another main model is not applicable
    expect(mappingState({ ...draft, mapping: { file: mappingFile(), match: match({ rootName: 'other.ldr' }) } }).state).toBe('absent');
  });
  it('missing parts, unchecked library and unverified inventory are stated, never hidden', () => {
    const text = (r: PreparedRoot) => compatibility({ root: r, bookletSha256s: [], mapping: null }).lines.map((l) => `${l.level}:${l.text}`).join('\n');
    expect(text(root({ missingParts: { checked: true, refs: ['9999.dat'], occurrences: 2 } }))).toContain('warn:Modèle incomplet à l’écran : 1 référence(s)');
    expect(text(root({ missingParts: { checked: false, refs: [], occurrences: 0 } }))).toContain('Pièces non vérifiées');
    expect(text(root())).toContain('Inventaire indéterminé');
    expect(text(root())).toContain('ok:Pièces vérifiées : les 1 référence(s) du modèle sont dans ta bibliothèque LDraw locale');
    expect(text(root({ inventory: { verdict: 'COHERENT', message: 'Inventaire officiel vérifié : 65 pièces.' } }))).toContain('ok:Inventaire officiel vérifié');
  });
});

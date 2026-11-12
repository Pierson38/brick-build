/**
 * Set numbers as typed by the user ("31040", "31040-1", " 31009 - 2 ") → one canonical form.
 * LEGO, the LDraw OMR and Rebrickable all write a set as `<number>-<variant>`; the variant
 * distinguishes boxes sold under the same number (31040-1 ≠ 31040-2). A number typed without a
 * variant is read as variant 1, and that assumption is reported, never hidden.
 */

import { msgs } from '../../i18n/runtime';

export interface SetNumber {
  /** "31040" (lower case for letters, e.g. "tru05"). */
  readonly base: string;
  readonly variant: number;
  /** "31040-1". */
  readonly canonical: string;
  /** True when the user typed no variant and "-1" was assumed. */
  readonly variantPresumed: boolean;
  /** Only digits: the form LEGO.com and the OMR know. */
  readonly numeric: boolean;
}

export type SetNumberResult = { readonly ok: true; readonly value: SetNumber } | { readonly ok: false; readonly error: string };

const RE = /^([a-z0-9]{2,16})(?:-(\d{1,3}))?$/;

export function parseSetNumber(input: unknown): SetNumberResult {
  const t = msgs().domain.setNumber;
  if (typeof input !== 'string') return { ok: false, error: t.expected };
  const s = input.normalize('NFKC').trim().toLowerCase().replace(/\s*[-–—]\s*/g, '-').replace(/\s+/g, '');
  if (s.length === 0) return { ok: false, error: t.empty };
  const m = RE.exec(s);
  if (!m) return { ok: false, error: t.invalid(input.trim().slice(0, 40)) };
  const base = m[1]!;
  const variant = m[2] === undefined ? 1 : Number(m[2]);
  if (variant < 1) return { ok: false, error: t.variantFromOne };
  return { ok: true, value: { base, variant, canonical: `${base}-${variant}`, variantPresumed: m[2] === undefined, numeric: /^\d+$/.test(base) } };
}

/** Same box: same number AND same variant ("31040" = "31040-1", never "31040-2"). Unparsable numbers compare as text. */
export function sameSetNumber(a: string, b: string): boolean {
  const x = parseSetNumber(a);
  const y = parseSetNumber(b);
  if (!x.ok || !y.ok) return a.trim().toLowerCase() === b.trim().toLowerCase();
  return x.value.canonical === y.value.canonical;
}

/** Set number at the start of a file or folder name ("31040-1 - Desert Racers.mpd" → 31040-1). */
export function setNumberInName(name: string): SetNumber | null {
  const m = /^(\d{3,7}(?:-\d{1,3})?)(?![\d])/.exec(name.trim());
  if (!m) return null;
  const r = parseSetNumber(m[1]!);
  return r.ok ? r.value : null;
}

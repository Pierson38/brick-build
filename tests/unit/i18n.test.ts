import { describe, expect, it } from 'vitest';
import { CATALOGS } from '../../src/i18n/catalogs';
import { localeFromCookieHeader, negotiateLocale, resolveLocale } from '../../src/i18n/locale';
import { currentLocale, msgs, setLocaleResolver } from '../../src/i18n/runtime';

/**
 * i18n layer: language negotiation, catalog parity (the type system already refuses a missing
 * key; this also checks parameters and values at run time), and no French left in English.
 */
type Leaf = string | ((...args: never[]) => unknown);
function leaves(node: unknown, path = ''): Map<string, Leaf> {
  const out = new Map<string, Leaf>();
  if (typeof node === 'string' || typeof node === 'function') out.set(path, node as Leaf);
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) for (const [p, l] of leaves(v, path ? `${path}.${k}` : k)) out.set(p, l);
  return out;
}

/** Text produced by a message: the string itself, or the function called with sample arguments. */
function samples(leaf: Leaf): string[] {
  if (typeof leaf === 'string') return [leaf];
  const fn = leaf as (...a: unknown[]) => unknown;
  const out: string[] = [];
  for (const sample of [2, 1, 0, 'x', true, false]) {
    try {
      const r = fn(...Array.from({ length: Math.max(fn.length, 3) }, () => sample));
      if (typeof r === 'string') out.push(r);
    } catch {
      // this sample does not fit the parameters
    }
  }
  return out;
}

const fr = leaves(CATALOGS.fr);
const en = leaves(CATALOGS.en);

describe('language negotiation', () => {
  it('follows Accept-Language by quality, French without header, English for other languages', () => {
    expect(negotiateLocale(null)).toBe('fr');
    expect(negotiateLocale('')).toBe('fr');
    expect(negotiateLocale('fr-FR,fr;q=0.9,en;q=0.8')).toBe('fr');
    expect(negotiateLocale('en-US,en;q=0.9,fr;q=0.8')).toBe('en');
    expect(negotiateLocale('de-DE,fr;q=0.5,en;q=0.7')).toBe('en');
    expect(negotiateLocale('de-DE,fr;q=0.8,en;q=0.7')).toBe('fr');
    expect(negotiateLocale('de-DE,es')).toBe('en');
    expect(negotiateLocale('en;q=0,fr')).toBe('fr');
    expect(negotiateLocale('*')).toBe('en');
  });

  it('prefers the explicit choice of the cookie, and ignores unknown values', () => {
    expect(localeFromCookieHeader('a=1; brick-lab-locale=en; b=2')).toBe('en');
    expect(localeFromCookieHeader('brick-lab-locale=de')).toBeNull();
    expect(localeFromCookieHeader('other-brick-lab-locale=en')).toBeNull();
    expect(resolveLocale('brick-lab-locale=fr', 'en-US')).toBe('fr');
    expect(resolveLocale('brick-lab-locale=xx', 'en-US')).toBe('en');
    expect(resolveLocale(null, null)).toBe('fr');
  });
});

describe('catalogs', () => {
  it('have the same keys, kinds and parameter counts in French and English', () => {
    expect([...en.keys()].sort()).toEqual([...fr.keys()].sort());
    for (const [key, ref] of fr) {
      const other = en.get(key)!;
      expect(typeof other, key).toBe(typeof ref);
      if (typeof ref === 'function') expect((other as (...a: never[]) => unknown).length, key).toBe(ref.length);
    }
  });

  it('have no empty message', () => {
    for (const [key, leaf] of [...fr, ...en]) for (const text of samples(leaf)) expect(text.trim(), key).not.toBe('');
  });

  it('leave no French in English', () => {
    const FRENCH = /[àâçéèêëîïôûùœÉÈÀÇ«»’]|\b(?:les?|la|des|une?|du|avec|sans|pour|aucune?|pièces?|étapes?|notice|modèles?|montage|enregistr\w*|ajouter|retirer|annuler|fermer|chercher|commencer|reprendre|introuvable|fichier|bibliothèque)\b/i;
    const leaks: string[] = [];
    for (const [key, leaf] of en) for (const text of samples(leaf)) if (FRENCH.test(text)) leaks.push(`${key}: ${text}`);
    expect(leaks).toEqual([]);
  });
});

describe('runtime language', () => {
  it('is French by default and follows the registered resolver', () => {
    const KEY = Symbol.for('brick-lab.i18n.locale-resolver');
    const saved = (globalThis as Record<symbol, unknown>)[KEY];
    try {
      delete (globalThis as Record<symbol, unknown>)[KEY];
      expect(currentLocale()).toBe('fr');
      setLocaleResolver(() => 'en');
      expect(msgs()).toBe(CATALOGS.en);
      setLocaleResolver(() => undefined);
      expect(msgs()).toBe(CATALOGS.fr);
    } finally {
      (globalThis as Record<symbol, unknown>)[KEY] = saved;
    }
  });
});

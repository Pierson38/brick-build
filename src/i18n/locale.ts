/**
 * Languages of the interface. French is the reference language: every message exists in French
 * first, and any other catalog must provide exactly the same keys (checked by the type system,
 * see messages/en). Pure module: usable in the browser, the server and the tests.
 */
export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'fr';

/** Cookie holding the explicit choice of the user (same origin only, never sent elsewhere). */
export const LOCALE_COOKIE = 'brick-lab-locale';
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Name of each language in that language (switcher). */
export const LOCALE_NAME: Record<Locale, string> = { fr: 'Français', en: 'English' };

export const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (LOCALES as readonly string[]).includes(v);

/** Language of a tag like `en-GB` or `fr`, or null when it is not one of ours. */
export function localeOfTag(tag: string): Locale | null {
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  return isLocale(primary) ? primary : null;
}

/**
 * Language from an `Accept-Language` header (or `navigator.languages`): the first supported
 * language by decreasing quality. No header (or an empty one): French, the reference language.
 * A header that names only other languages (e.g. `de-DE`): English, the most widely read.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage || acceptLanguage.length > 1000) return DEFAULT_LOCALE;
  const ranked = acceptLanguage.split(',').slice(0, 30).map((part, i) => {
    const [tag = '', ...params] = part.split(';');
    const q = params.map((p) => /^\s*q\s*=\s*([0-9.]+)\s*$/.exec(p)?.[1]).find((v) => v !== undefined);
    return { tag: tag.trim(), q: q === undefined ? 1 : Number(q), i };
  }).filter((r) => r.tag !== '' && Number.isFinite(r.q) && r.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  if (ranked.length === 0) return DEFAULT_LOCALE;
  for (const r of ranked) {
    const l = localeOfTag(r.tag);
    if (l) return l;
  }
  return 'en';
}

/** Value of our cookie in a `Cookie` header, when it names a supported language. */
export function localeFromCookieHeader(cookieHeader: string | null | undefined): Locale | null {
  if (!cookieHeader || cookieHeader.length > 8192) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === LOCALE_COOKIE) {
      const value = part.slice(eq + 1).trim();
      return isLocale(value) ? value : null;
    }
  }
  return null;
}

/** Language of a request: explicit choice (cookie) first, then the browser's languages. */
export const resolveLocale = (cookieHeader: string | null | undefined, acceptLanguage: string | null | undefined): Locale =>
  localeFromCookieHeader(cookieHeader) ?? negotiateLocale(acceptLanguage);

/** English plural for the catalogs: `plural(2, 'piece', 'pieces')`. */
export const plural = (n: number, one: string, other: string): string => (n === 1 ? one : other);

'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CATALOGS, type Messages } from './catalogs';
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from './locale';
import { currentLocale, setLocaleResolver } from './runtime';

interface I18nValue {
  readonly locale: Locale;
  /** Catalog of the current language: `t.common.cancel`, `t.app.theme.toggle(a, b)`. */
  readonly t: Messages;
  readonly setLocale: (l: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

/** Language of the interface for code outside React (domain messages computed in the browser). */
let browserLocale: Locale = DEFAULT_LOCALE;

/**
 * Holds the language of the interface. The server picks the initial one (cookie, else the
 * browser's Accept-Language) so that the first render already speaks it; a switch is stored in a
 * same-origin cookie (no request to any other site) and applies at once, without reloading.
 */
export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  // Synchronously, so that domain messages computed during this render use the same language.
  browserLocale = locale;
  if (typeof window !== 'undefined') setLocaleResolver(() => browserLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    browserLocale = l;
    setLocaleState(l);
    document.documentElement.lang = l;
    document.cookie = `${LOCALE_COOKIE}=${l}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`;
    // Server components (page title, <html lang>) render again with the new cookie; client state is kept.
    router.refresh();
  }, [router]);

  const value = useMemo<I18nValue>(() => ({ locale, t: CATALOGS[locale], setLocale }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Current language, its catalog and the switch. Outside a provider: the runtime language, read-only. */
export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  const locale = currentLocale();
  return { locale, t: CATALOGS[locale], setLocale: () => undefined };
}

/** Catalog of the current language. */
export function useT(): Messages {
  return useI18n().t;
}

/** Current language (e.g. as a dependency of effects that fetch server-produced messages). */
export function useLocale(): Locale {
  return useI18n().locale;
}

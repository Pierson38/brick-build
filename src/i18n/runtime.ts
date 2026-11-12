import { DEFAULT_LOCALE, type Locale } from './locale';
import { CATALOGS, type Messages } from './catalogs';

/**
 * Messages of the current language for code outside React (domain, server, infra).
 * - In the browser, the I18nProvider registers the language chosen in the interface.
 * - On the server, src/server/http/locale.ts registers the language of the request being served.
 * - Elsewhere (unit tests, scripts): French, the reference language.
 * The resolver lives on globalThis so that every bundle copy of this module shares it.
 */
const RESOLVER = Symbol.for('brick-lab.i18n.locale-resolver');
type Holder = { [RESOLVER]?: () => Locale | undefined };

export function setLocaleResolver(resolve: () => Locale | undefined): void {
  (globalThis as Holder)[RESOLVER] = resolve;
}

export function currentLocale(): Locale {
  return (globalThis as Holder)[RESOLVER]?.() ?? DEFAULT_LOCALE;
}

/** Catalog of the current language. Call it when the text is produced, not at module load. */
export function msgs(): Messages {
  return CATALOGS[currentLocale()];
}

export type { Messages };

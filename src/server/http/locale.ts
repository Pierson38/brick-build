import { AsyncLocalStorage } from 'node:async_hooks';
import { resolveLocale, type Locale } from '@/i18n/locale';
import { setLocaleResolver } from '@/i18n/runtime';

/**
 * Server-only. Language of the API request being served, for the messages that the library,
 * the import and the domain produce (errors, diagnostics, compatibility sheet). Read from the
 * request itself (language cookie, else Accept-Language): nothing is stored server-side.
 * One storage per process (on globalThis), whatever the number of bundle copies of this module.
 */
const STORAGE = Symbol.for('brick-lab.i18n.request-locale');
type Holder = { [STORAGE]?: AsyncLocalStorage<Locale> };
const storage = ((globalThis as Holder)[STORAGE] ??= new AsyncLocalStorage<Locale>());
setLocaleResolver(() => storage.getStore());

export const requestLocale = (request: Request): Locale => resolveLocale(request.headers.get('cookie'), request.headers.get('accept-language'));

/**
 * Messages produced from now on in this request (including after its `await`s) use its language.
 * Called by `guard()`, which every library route runs first.
 */
export function enterRequestLocale(request: Request): Locale {
  const locale = requestLocale(request);
  storage.enterWith(locale);
  return locale;
}

/** Runs `fn` with `locale` as the language of the messages (tests, scripts). */
export function withLocale<T>(locale: Locale, fn: () => T): T {
  return storage.run(locale, fn);
}
